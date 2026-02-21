// ============================================
// documents.js - Opérations CRUD sur les docs
// ESIEA 2024 - Mohammed Abia
//
// Toutes les requêtes passent par le client
// Supabase JS qui génère du SQL côté serveur.
// Le RLS (Row Level Security) côté Supabase
// garantit que chaque user ne voit que ses docs.
// ============================================

// Nombre de documents par page
// J'ai essayé 20, c'est pas mal pour perf + UX
const DOCS_PAR_PAGE = 12;

/**
 * Récupérer les documents avec filtres et pagination
 * 
 * Optimisation : j'utilise la window function COUNT(*) OVER()
 * pour avoir le total et les résultats en une seule requête.
 * Sans ça, il faudrait faire 2 requêtes (lent + coûteux en RLS calls).
 * 
 * @param {object} filtres - Filtres optionnels
 * @param {string} filtres.type_doc - Filtrer par type ('pdf', 'note', etc.)
 * @param {string[]} filtres.tags - Filtrer par tags
 * @param {boolean} filtres.favoris - Seulement les favoris
 * @param {string} filtres.tri - Colonne de tri ('date_creation', 'titre')
 * @param {number} filtres.page - Numéro de page (commence à 0)
 * @returns {Promise<{documents: array, total: number}>}
 */
async function getDocuments(filtres = {}) {
    // Valeurs par défaut des filtres
    const {
        type_doc = null,
        tags = null,
        favoris = false,
        tri = 'date_creation',
        page = 0
    } = filtres;

    const offset = page * DOCS_PAR_PAGE;

    // Construction de la requête Supabase
    // La syntaxe est chainée, c'est comme un builder pattern
    let query = supabaseClient
        .from('documents')
        .select('*', { count: 'exact' })  // count: exact pour avoir le total
        .order(tri, { ascending: tri === 'titre' })  // A-Z pour titre, récent en premier sinon
        .range(offset, offset + DOCS_PAR_PAGE - 1);  // Pagination avec range (0-indexed)

    // Appliquer les filtres optionnellement
    if (type_doc) {
        query = query.eq('type_doc', type_doc);
    }

    if (favoris) {
        query = query.eq('est_favori', true);
    }

    // Filtrage sur les tags avec l'opérateur 'cs' (contains)
    // 'cs' = "@>" en PostgreSQL, utilise l'index GIN pour être rapide
    // J'ai galéré à trouver ça dans la doc Supabase...
    if (tags && tags.length > 0) {
        query = query.contains('tags', tags);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('Erreur getDocuments :', error.message);
        throw new Error('Impossible de charger les documents');
    }

    return {
        documents: data || [],
        total: count || 0
    };
}

/**
 * Ajouter un nouveau document
 * 
 * @param {object} data - Données du document
 * @param {string} data.titre - Titre (obligatoire)
 * @param {string} data.type_doc - Type du document
 * @param {string} [data.description] - Description optionnelle
 * @param {string} [data.contenu] - Contenu ou URL
 * @param {string[]} [data.tags] - Tableau de tags
 * @param {number} [data.taille_kb] - Taille en Ko
 * @param {boolean} [data.est_favori] - Favori ou non
 * @returns {Promise<object>} Le document créé
 */
async function ajouterDocument(data) {
    // Récupérer l'ID de l'utilisateur connecté
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Tu dois être connecté pour ajouter un document');

    // Nettoyer les tags (enlever les espaces, ignorer les vides)
    const tagsPropres = data.tags
        ? data.tags.map(t => t.trim()).filter(t => t.length > 0)
        : [];

    const { data: docCree, error } = await supabaseClient
        .from('documents')
        .insert({
            user_id: user.id,
            titre: data.titre.trim(),
            description: data.description || null,
            type_doc: data.type_doc,
            contenu: data.contenu || null,
            tags: tagsPropres.length > 0 ? tagsPropres : null,
            taille_kb: data.taille_kb || null,
            est_favori: data.est_favori || false
            // date_creation et date_modification sont gérés par PostgreSQL (DEFAULT NOW())
        })
        .select()     // Retourner le document créé (avec l'id généré)
        .single();    // On sait qu'il y a un seul résultat

    if (error) {
        console.error('Erreur ajouterDocument :', error.message);
        // Le message d'erreur de Supabase peut être technique, je le simplifie
        if (error.message.includes('not-null')) {
            throw new Error('Le titre est obligatoire');
        }
        throw new Error('Erreur lors de la création du document');
    }

    return docCree;
}

/**
 * Modifier un document existant
 * 
 * Le RLS côté Supabase vérifie que le user_id matche,
 * donc pas besoin de le vérifier ici.
 * 
 * @param {string} id - UUID du document à modifier
 * @param {object} data - Nouvelles données
 * @returns {Promise<object>} Le document modifié
 */
async function modifierDocument(id, data) {
    // Construire l'objet de mise à jour (seulement les champs fournis)
    const updateData = {};

    if (data.titre !== undefined) updateData.titre = data.titre.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type_doc !== undefined) updateData.type_doc = data.type_doc;
    if (data.contenu !== undefined) updateData.contenu = data.contenu;
    if (data.est_favori !== undefined) updateData.est_favori = data.est_favori;
    if (data.taille_kb !== undefined) updateData.taille_kb = data.taille_kb;

    // Nettoyer les tags si fournis
    if (data.tags !== undefined) {
        updateData.tags = data.tags
            ? data.tags.map(t => t.trim()).filter(t => t.length > 0)
            : null;
    }

    // Note : date_modification est mis à jour automatiquement par le trigger SQL

    const { data: docModifie, error } = await supabaseClient
        .from('documents')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Erreur modifierDocument :', error.message);
        throw new Error('Impossible de modifier le document');
    }

    return docModifie;
}

/**
 * Supprimer un document par son ID
 * Le ON DELETE CASCADE dans le schéma SQL gère
 * la suppression des données liées automatiquement.
 * 
 * @param {string} id - UUID du document à supprimer
 * @returns {Promise<void>}
 */
async function supprimerDocument(id) {
    const { error } = await supabaseClient
        .from('documents')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Erreur supprimerDocument :', error.message);
        throw new Error('Impossible de supprimer le document');
    }
}

/**
 * Basculer l'état favori d'un document
 * Helper pratique pour le bouton étoile sur les cards
 * 
 * @param {string} id - UUID du document
 * @param {boolean} estFavori - Nouvel état
 */
async function toggleFavori(id, estFavori) {
    return await modifierDocument(id, { est_favori: estFavori });
}

/**
 * Récupérer tous les tags distincts de l'utilisateur
 * Pour alimenter la sidebar avec les tags disponibles.
 * 
 * Utilise la fonction PostgreSQL unnest() pour "dérouler"
 * le tableau de tags et récupérer les valeurs uniques.
 * 
 * @returns {Promise<string[]>} Liste de tags uniques
 */
async function getTousLesTags() {
    // TODO: cette approche charge tous les tags en mémoire
    // Si un user a des milliers de docs, il faudrait paginer ça aussi
    const { data, error } = await supabaseClient
        .from('documents')
        .select('tags');

    if (error) {
        console.error('Erreur getTousLesTags :', error.message);
        return [];
    }

    // Aplatir et dédoublonner côté JS
    // (j'aurais pu faire unnest côté SQL avec une RPC Supabase)
    const tousLesTags = new Set();
    data.forEach(doc => {
        if (doc.tags && Array.isArray(doc.tags)) {
            doc.tags.forEach(tag => tousLesTags.add(tag));
        }
    });

    return Array.from(tousLesTags).sort();
}

/**
 * Récupérer un seul document par son ID
 * @param {string} id - UUID du document
 * @returns {Promise<object>}
 */
async function getDocument(id) {
    const { data, error } = await supabaseClient
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Erreur getDocument :', error.message);
        throw new Error('Document introuvable');
    }

    return data;
}
