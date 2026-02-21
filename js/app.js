// ============================================
// app.js - Logique principale de l'application
// ESIEA 2024 - Mohammed Abia
//
// Ce fichier orchestre tout : chargement initial,
// gestion des filtres, affichage des cards, modals.
// C'est le fichier le plus long, j'aurais dû
// le découper en plusieurs fichiers peut-être...
// TODO: refactoriser en plusieurs modules
// ============================================

// État global de l'application
// J'ai choisi un objet simple plutôt que Redux ou autre
// (c'est du JS vanilla, pas React)
const etatApp = {
    utilisateur: null,       // infos de l'user connecté
    filtres: {
        type_doc: null,
        tags: [],
        favoris: false,
        tri: 'date_creation',
        page: 0
    },
    totalDocuments: 0,
    rechercheCourante: ''    // terme de recherche actif
};

/**
 * Point d'entrée de l'application
 * Vérifie l'auth et charge les données initiales
 */
async function initialiserApp() {
    try {
        // Vérifier si l'user est connecté (redirige vers login si non)
        const user = await verifierAuth();
        if (!user) return;  // verifierAuth() a déjà redirigé

        etatApp.utilisateur = user;

        // Afficher l'email dans le header
        const emailEl = document.getElementById('user-email');
        if (emailEl) emailEl.textContent = user.email;

        // Charger les documents et les tags en parallèle
        // Promise.all est plus rapide que 2 await séquentiels
        await Promise.all([
            chargerDocuments(),
            chargerTags(),
            chargerStats()
        ]);

    } catch (err) {
        console.error('Erreur initialisation :', err);
        afficherErreur('Impossible de charger l\'application. Réessaie.');
    }
}

/**
 * Charger et afficher les documents selon les filtres actuels
 */
async function chargerDocuments() {
    afficherChargement();

    try {
        let resultats;

        if (etatApp.rechercheCourante) {
            // Mode recherche
            resultats = await rechercherDocuments(etatApp.rechercheCourante, etatApp.filtres);
        } else {
            // Mode navigation normale
            resultats = await getDocuments(etatApp.filtres);
        }

        etatApp.totalDocuments = resultats.total;
        afficherDocuments(resultats.documents, resultats.total);

    } catch (err) {
        console.error('Erreur chargement documents :', err);
        afficherErreur('Impossible de charger tes documents.');
    }
}

/**
 * Afficher l'état de chargement dans la grille
 */
function afficherChargement() {
    const grid = document.getElementById('documents-grid');
    grid.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Chargement...</p>
        </div>
    `;
    document.getElementById('pagination-container').style.display = 'none';
}

/**
 * Afficher un message d'erreur dans la grille
 * @param {string} message
 */
function afficherErreur(message) {
    const grid = document.getElementById('documents-grid');
    grid.innerHTML = `
        <div class="empty-state">
            <span class="empty-state-icon">⚠️</span>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Afficher les documents dans la grille
 * @param {array} documents - Liste des documents
 * @param {number} total - Nombre total (pour la pagination)
 * @param {string} termRecherche - Pour surligner les résultats (TODO)
 */
function afficherDocuments(documents, total, termRecherche = '') {
    const grid = document.getElementById('documents-grid');
    const infoEl = document.getElementById('results-info');

    // Info sur les résultats
    if (termRecherche) {
        infoEl.textContent = `${total} résultat(s) pour "${termRecherche}"`;
    } else {
        infoEl.textContent = `${total} document(s)`;
    }

    // État vide
    if (documents.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">📭</span>
                <p>${termRecherche ? 'Aucun résultat trouvé' : 'Aucun document pour l\'instant'}</p>
                ${!termRecherche ? '<p><small>Clique sur "Nouveau document" pour commencer !</small></p>' : ''}
            </div>
        `;
        document.getElementById('pagination-container').style.display = 'none';
        return;
    }

    // Générer les cards
    grid.innerHTML = documents.map(doc => creerCardHTML(doc)).join('');

    // Mettre à jour la pagination
    mettreAJourPagination(total);
}

/**
 * Générer le HTML d'une card de document
 * @param {object} doc - Données du document
 * @returns {string} HTML de la card
 */
function creerCardHTML(doc) {
    // Icône selon le type
    const icones = {
        pdf: '📄',
        note: '📝',
        lien: '🔗',
        image: '🖼️'
    };
    const icone = icones[doc.type_doc] || '📋';

    // Tags HTML (max 3 affichés sur la card)
    const tagsHTML = doc.tags && doc.tags.length > 0
        ? doc.tags.slice(0, 3).map(tag => `<span class="card-tag">${echapper(tag)}</span>`).join('')
        : '';

    // Date lisible
    const date = new Date(doc.date_creation).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    // Taille si disponible
    const taille = doc.taille_kb ? `${doc.taille_kb} Ko` : '';

    return `
        <div class="doc-card" onclick="ouvrirDetail('${doc.id}')">
            <div class="card-header">
                <span class="card-type-icon">${icone}</span>
                <div class="card-actions">
                    <!-- Bouton favori -->
                    <button 
                        class="card-action-btn card-favori-btn ${doc.est_favori ? 'est-favori' : ''}"
                        title="${doc.est_favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}"
                        onclick="event.stopPropagation(); basculerFavori('${doc.id}', ${!doc.est_favori})"
                    >
                        ${doc.est_favori ? '⭐' : '☆'}
                    </button>
                    <!-- Bouton modifier -->
                    <button 
                        class="card-action-btn"
                        title="Modifier"
                        onclick="event.stopPropagation(); ouvrirModalModif('${doc.id}')"
                    >
                        ✏️
                    </button>
                    <!-- Bouton supprimer -->
                    <button 
                        class="card-action-btn"
                        title="Supprimer"
                        onclick="event.stopPropagation(); demanderSuppression('${doc.id}')"
                    >
                        🗑️
                    </button>
                </div>
            </div>

            <h3 class="card-titre">${echapper(doc.titre)}</h3>
            
            ${doc.description
            ? `<p class="card-description">${echapper(doc.description)}</p>`
            : ''}

            ${tagsHTML ? `<div class="card-tags">${tagsHTML}</div>` : ''}

            <div class="card-footer">
                <span>${date}</span>
                ${taille ? `<span>${taille}</span>` : ''}
            </div>
        </div>
    `;
}

/**
 * Échapper les caractères HTML pour éviter les injections XSS
 * Bon réflexe même si ici l'user ne peut voir que ses propres données
 * @param {string} str
 * @returns {string}
 */
function echapper(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================
// FILTRES
// ============================================

/**
 * Filtrer par type de document
 * @param {HTMLElement} btnClique - Le bouton cliqué (pour l'UI)
 * @param {string} type - Type de doc ('pdf', 'note', etc.)
 */
function filtrerParType(btnClique, type) {
    // Mettre à jour l'UI des boutons
    document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
        btn.classList.remove('active');
    });
    btnClique.classList.add('active');

    // Mettre à jour l'état et recharger
    etatApp.filtres.type_doc = type || null;
    etatApp.filtres.page = 0;  // revenir à la première page
    chargerDocuments();
}

/**
 * Filtrer par tag
 * @param {HTMLElement} badgeEl - Element du badge cliqué
 * @param {string} tag
 */
function filtrerParTag(badgeEl, tag) {
    badgeEl.classList.toggle('active');

    // Mettre à jour le tableau de tags dans les filtres
    const index = etatApp.filtres.tags.indexOf(tag);
    if (index === -1) {
        etatApp.filtres.tags.push(tag);  // ajouter le tag
    } else {
        etatApp.filtres.tags.splice(index, 1);  // retirer le tag
    }

    etatApp.filtres.page = 0;
    chargerDocuments();
}

/**
 * Filtrer les favoris seulement
 */
function filtrerFavoris() {
    const btn = document.getElementById('btn-favoris');
    etatApp.filtres.favoris = !etatApp.filtres.favoris;
    btn.classList.toggle('active', etatApp.filtres.favoris);
    etatApp.filtres.page = 0;
    chargerDocuments();
}

/**
 * Changer le tri
 * @param {string} tri - 'date_creation', 'titre', etc.
 */
function changerTri(tri) {
    etatApp.filtres.tri = tri;
    etatApp.filtres.page = 0;
    chargerDocuments();
}

// ============================================
// PAGINATION
// ============================================

function mettreAJourPagination(total) {
    const container = document.getElementById('pagination-container');
    const totalPages = Math.ceil(total / DOCS_PAR_PAGE);
    const pageCourante = etatApp.filtres.page;

    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    document.getElementById('pagination-info').textContent =
        `Page ${pageCourante + 1} / ${totalPages}`;

    document.getElementById('btn-prev-page').disabled = pageCourante === 0;
    document.getElementById('btn-next-page').disabled = pageCourante >= totalPages - 1;
}

function changerPage(direction) {
    etatApp.filtres.page += direction;
    chargerDocuments();
    // Scroll en haut de la grille
    document.querySelector('.main-content').scrollTo(0, 0);
}

// ============================================
// TAGS (sidebar)
// ============================================

async function chargerTags() {
    const container = document.getElementById('tags-container');
    try {
        const tags = await getTousLesTags();

        if (tags.length === 0) {
            container.innerHTML = '<span class="tags-loading">Aucun tag</span>';
            return;
        }

        container.innerHTML = tags.map(tag => `
            <span 
                class="tag-badge" 
                onclick="filtrerParTag(this, '${echapper(tag)}')"
            >
                ${echapper(tag)}
            </span>
        `).join('');

    } catch (err) {
        container.innerHTML = '<span class="tags-loading">Erreur</span>';
    }
}

async function chargerStats() {
    try {
        // Compter tous les docs et les favoris
        const [{ count: total }, { count: favoris }] = await Promise.all([
            supabase.from('documents').select('*', { count: 'exact', head: true }),
            supabase.from('documents').select('*', { count: 'exact', head: true }).eq('est_favori', true)
        ]);

        document.getElementById('stat-total').textContent = total || 0;
        document.getElementById('stat-favoris').textContent = favoris || 0;
    } catch (err) {
        console.warn('Erreur stats :', err);
    }
}

// ============================================
// MODALS
// ============================================

function ouvrirModalAjout() {
    // Réinitialiser le formulaire
    document.getElementById('form-document').reset();
    document.getElementById('doc-id').value = '';
    document.getElementById('modal-titre').textContent = 'Nouveau document';
    document.getElementById('btn-soumettre').textContent = 'Enregistrer';
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-document').style.display = 'flex';
}

async function ouvrirModalModif(docId) {
    try {
        const doc = await getDocument(docId);

        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-titre').value = doc.titre || '';
        document.getElementById('doc-type').value = doc.type_doc || '';
        document.getElementById('doc-description').value = doc.description || '';
        document.getElementById('doc-contenu').value = doc.contenu || '';
        document.getElementById('doc-taille').value = doc.taille_kb || '';
        document.getElementById('doc-tags').value = doc.tags ? doc.tags.join(', ') : '';
        document.getElementById('doc-favori').checked = doc.est_favori || false;

        document.getElementById('modal-titre').textContent = 'Modifier le document';
        document.getElementById('btn-soumettre').textContent = 'Sauvegarder';
        document.getElementById('modal-error').style.display = 'none';
        document.getElementById('modal-document').style.display = 'flex';

    } catch (err) {
        alert('Impossible de charger le document');
    }
}

function fermerModal() {
    document.getElementById('modal-document').style.display = 'none';
}

// Fermer le modal si on clique sur le fond noir
function fermerModalSiClic(event) {
    if (event.target === event.currentTarget) {
        fermerModal();
    }
}

/**
 * Soumettre le formulaire (ajouter ou modifier)
 */
async function soumettreDocument(event) {
    event.preventDefault();

    const btnSoumettre = document.getElementById('btn-soumettre');
    const errorDiv = document.getElementById('modal-error');

    btnSoumettre.disabled = true;
    btnSoumettre.textContent = 'Sauvegarde...';
    errorDiv.style.display = 'none';

    try {
        // Récupérer les données du formulaire
        const docId = document.getElementById('doc-id').value;
        const data = {
            titre: document.getElementById('doc-titre').value,
            type_doc: document.getElementById('doc-type').value,
            description: document.getElementById('doc-description').value,
            contenu: document.getElementById('doc-contenu').value,
            taille_kb: parseInt(document.getElementById('doc-taille').value) || null,
            // Convertir la chaîne de tags en tableau
            tags: document.getElementById('doc-tags').value
                .split(',')
                .map(t => t.trim())
                .filter(t => t),
            est_favori: document.getElementById('doc-favori').checked
        };

        if (docId) {
            // Mode modification
            await modifierDocument(docId, data);
        } else {
            // Mode création
            await ajouterDocument(data);
        }

        fermerModal();
        // Recharger pour voir le nouveau doc + les nouveaux tags
        await Promise.all([chargerDocuments(), chargerTags(), chargerStats()]);

    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
        btnSoumettre.disabled = false;
        btnSoumettre.textContent = docId ? 'Sauvegarder' : 'Enregistrer';
    }
}

// ============================================
// SUPPRESSION
// ============================================

let docASupprimer = null;  // garder l'ID du doc à supprimer

function demanderSuppression(docId) {
    docASupprimer = docId;
    document.getElementById('modal-suppression').style.display = 'flex';

    // Configurer le bouton de confirmation
    document.getElementById('btn-confirmer-suppression').onclick = async () => {
        try {
            await supprimerDocument(docId);
            fermerModalSuppression();
            await Promise.all([chargerDocuments(), chargerStats()]);
        } catch (err) {
            alert('Erreur lors de la suppression');
        }
    };
}

function fermerModalSuppression() {
    docASupprimer = null;
    document.getElementById('modal-suppression').style.display = 'none';
}

// ============================================
// AUTRES ACTIONS
// ============================================

async function basculerFavori(docId, nouvelEtat) {
    try {
        await toggleFavori(docId, nouvelEtat);
        // Recharger pour mettre à jour l'icône
        await Promise.all([chargerDocuments(), chargerStats()]);
    } catch (err) {
        alert('Impossible de modifier le favori');
    }
}

/**
 * Adapter le formulaire selon le type de document
 * (PDF = upload, lien = URL, note = textarea...)
 */
function adapterFormulaire(type) {
    const groupTaille = document.getElementById('group-taille');
    const groupUpload = document.getElementById('group-upload');
    const labelContenu = document.getElementById('label-contenu');
    const inputContenu = document.getElementById('doc-contenu');

    switch (type) {
        case 'pdf':
            groupTaille.style.display = 'block';
            groupUpload.style.display = 'block';
            labelContenu.textContent = 'Texte extrait (optionnel)';
            inputContenu.placeholder = 'Texte extrait automatiquement du PDF...';
            break;
        case 'lien':
            groupTaille.style.display = 'none';
            groupUpload.style.display = 'none';
            labelContenu.textContent = 'URL *';
            inputContenu.placeholder = 'https://...';
            break;
        case 'image':
            groupTaille.style.display = 'block';
            groupUpload.style.display = 'block';
            labelContenu.textContent = 'Description ou URL';
            inputContenu.placeholder = 'Description de l\'image...';
            break;
        default:  // note
            groupTaille.style.display = 'none';
            groupUpload.style.display = 'none';
            labelContenu.textContent = 'Contenu de la note';
            inputContenu.placeholder = 'Écris ta note ici...';
    }
}

/**
 * Simuler un upload de fichier
 * TODO: implémenter vraiment avec Supabase Storage
 */
function simulerUpload() {
    const uploadZone = document.getElementById('upload-zone');
    uploadZone.innerHTML = `
        <span class="upload-icon">✅</span>
        <p>Fichier "sélectionné" (simulation)</p>
        <p class="upload-note">Le vrai upload avec Supabase Storage sera implémenté ultérieurement</p>
    `;
}

function ouvrirDetail(docId) {
    // TODO: ouvrir un panneau de détail ou modal
    // Pour l'instant j'ouvre juste la modal de modification
    ouvrirModalModif(docId);
}

// ============================================
// LANCEMENT
// ============================================

// Quand la page est prête, lancer l'app
document.addEventListener('DOMContentLoaded', initialiserApp);
