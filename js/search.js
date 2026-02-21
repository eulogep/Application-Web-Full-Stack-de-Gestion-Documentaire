// ============================================
// search.js - Recherche full-text
// ESIEA 2024 - Mohammed Abia
//
// La recherche full-text PostgreSQL était le point
// le plus difficile du projet. J'ai dû utiliser
// une colonne TSVECTOR générée dans le schéma SQL
// pour que les requêtes restent < 100ms même avec
// beaucoup de documents.
// ============================================

// Délai avant de lancer la recherche (en ms)
// J'attends que l'user arrête de taper pour éviter
// de faire une req à chaque caractère tapé
const DELAI_RECHERCHE = 350;

// Variable pour stocker le timeout (debounce)
let debounceTimer = null;

/**
 * Rechercher des documents par terme (full-text)
 * 
 * Utilise la recherche full-text PostgreSQL via Supabase.
 * La config 'french' permet la lemmatisation en français
 * (ex: "cours" matchera "cours", "cours de...")
 * 
 * Pour les performances : le tsvector est précalculé
 * et indexé avec GIN dans la BDD (voir schema.sql).
 * Sans ça, chaque recherche ferait un sequential scan → lent.
 * 
 * @param {string} terme - Terme de recherche
 * @param {object} filtres - Filtres supplémentaires (type, page...)
 * @returns {Promise<{documents: array, total: number}>}
 */
async function rechercherDocuments(terme, filtres = {}) {
    if (!terme || terme.trim().length === 0) {
        // Si terme vide, on récupère tous les docs (avec filtres)
        return await getDocuments(filtres);
    }

    const termePropre = terme.trim();
    const { page = 0, type_doc = null } = filtres;
    const offset = page * DOCS_PAR_PAGE;

    // Supabase supporte la recherche full-text avec .textSearch()
    // qui génère la clause: search_vector @@ to_tsquery('french', ...)
    let query = supabaseClient
        .from('documents')
        .select('*', { count: 'exact' })
        // textSearch cherche dans la colonne search_vector
        // 'plain' = chaque mot est cherché séparément (plus simple pour l'user)
        .textSearch('search_vector', termePropre, {
            type: 'plain',
            config: 'french'
        })
        .range(offset, offset + DOCS_PAR_PAGE - 1);

    // Appliquer le filtre de type si présent
    if (type_doc) {
        query = query.eq('type_doc', type_doc);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('Erreur rechercherDocuments :', error.message);
        // Cas spécial : si erreur de syntaxe dans la recherche
        if (error.message.includes('syntax error')) {
            return { documents: [], total: 0 };
        }
        throw new Error('Erreur pendant la recherche');
    }

    // Sauvegarder la recherche dans l'historique (en arrière-plan)
    // je n'attends pas le résultat, c'est pas critique
    sauvegarderRecherche(termePropre);

    return {
        documents: data || [],
        total: count || 0
    };
}

/**
 * Sauvegarder un terme dans l'historique des recherches
 * Silencieux : les erreurs ne remontent pas à l'interface
 * 
 * @param {string} terme
 */
async function sauvegarderRecherche(terme) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;  // pas connecté, on skip

        await supabaseClient.from('historique_recherches').insert({
            user_id: user.id,
            terme_recherche: terme
        });
    } catch (err) {
        // On log mais on remonte pas l'erreur
        console.warn('Impossible de sauvegarder la recherche :', err.message);
    }
}

/**
 * Récupérer les recherches récentes de l'utilisateur
 * Utile pour afficher des suggestions
 * 
 * @param {number} limite - Nombre max de résultats
 * @returns {Promise<string[]>}
 */
async function getRecherchesRecentes(limite = 5) {
    const { data, error } = await supabaseClient
        .from('historique_recherches')
        .select('terme_recherche')
        .order('date_recherche', { ascending: false })
        .limit(limite);

    if (error) {
        console.warn('Erreur getRecherchesRecentes :', error.message);
        return [];
    }

    // Dédoublonner les termes (garder les plus récents)
    const vus = new Set();
    const termes = [];
    for (const row of data) {
        if (!vus.has(row.terme_recherche)) {
            vus.add(row.terme_recherche);
            termes.push(row.terme_recherche);
        }
    }

    return termes;
}

/**
 * Debounce de la recherche : attend que l'user arrête
 * de taper avant de lancer la requête.
 * 
 * J'ai appris ce pattern pour éviter de surcharger l'API
 * avec une requête à chaque frappe de touche.
 * 
 * @param {string} terme - Terme saisi
 */
function handleSearchInput(terme) {
    // Annuler la recherche précédente si elle n'a pas encore lancé
    clearTimeout(debounceTimer);

    // Mettre à jour l'affichage immédiatement (UX responsive)
    if (!terme.trim()) {
        // Si vidé, recharger tous les documents
        debounceTimer = setTimeout(() => {
            chargerDocuments();  // défini dans app.js
        }, 200);
        return;
    }

    // Sinon, attendre avant de chercher
    debounceTimer = setTimeout(async () => {
        try {
            afficherChargement();  // défini dans app.js
            const resultats = await rechercherDocuments(terme, etatApp.filtres);
            afficherDocuments(resultats.documents, resultats.total, terme);
        } catch (err) {
            console.error('Erreur de recherche :', err);
            afficherErreur('Erreur pendant la recherche');
        }
    }, DELAI_RECHERCHE);
}
