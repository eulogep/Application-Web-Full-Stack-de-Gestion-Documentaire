// ============================================
// auth.js - Gestion de l'authentification
// avec Supabase Auth
// ESIEA 2024 - Mohammed Abia
//
// Supabase gère les sessions avec des JWT
// stockés dans le localStorage automatiquement.
// C'est pratique mais faut faire attention
// à bien checker la session au chargement.
// ============================================

// Config Supabase - à remplacer par tes vraies valeurs
// TODO: mettre ça dans une variable d'environnement (j'ai pas encore configuré ça)
const SUPABASE_URL = 'https://TON_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'TA_CLE_ANON_ICI';

// Initialisation du client Supabase
// supabase est disponible globalement via le CDN
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Se connecter avec email + mot de passe
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        // Supabase renvoie des erreurs en anglais, je les traduis
        let message = error.message;
        if (message.includes('Invalid login credentials')) {
            message = 'Email ou mot de passe incorrect';
        } else if (message.includes('Email not confirmed')) {
            message = 'Confirme ton email avant de te connecter';
        }
        throw new Error(message);
    }

    // Si succès, rediriger vers la page principale
    console.log('Connexion réussie pour :', data.user.email);
    window.location.href = 'index.html';
}

/**
 * Créer un nouveau compte
 * @param {string} email
 * @param {string} password
 */
async function register(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        throw new Error(error.message);
    }

    // Supabase envoie un email de confirmation par défaut
    // le user doit confirmer avant de pouvoir se connecter
    console.log('Compte créé, email de confirmation envoyé à :', email);
    return data;
}

/**
 * Déconnecter l'utilisateur courant
 * Redirige vers la page de login
 */
async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Erreur lors de la déconnexion :', error.message);
    }
    // Rediriger vers login dans tous les cas
    window.location.href = 'login.html';
}

/**
 * Récupérer la session active
 * Renvoie null si pas connecté
 * @returns {Promise<object|null>} session ou null
 */
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

/**
 * Vérifier si l'user est connecté
 * Si non, rediriger vers login
 * J'appelle ça au chargement de index.html
 */
async function verifierAuth() {
    const session = await getSession();

    if (!session) {
        // Pas de session = redirection vers login
        window.location.href = 'login.html';
        return null;
    }

    return session.user;
}

/**
 * Vérifier que la page de login n'est pas
 * accessible si déjà connecté
 */
async function verifierAuthLogin() {
    const session = await getSession();
    if (session) {
        // Déjà connecté, rediriger vers l'app
        window.location.href = 'index.html';
    }
}

// Sur la page de login, vérifier si déjà connecté
// (évite de montrer le formulaire si session active)
if (window.location.pathname.includes('login.html')) {
    verifierAuthLogin();
}
