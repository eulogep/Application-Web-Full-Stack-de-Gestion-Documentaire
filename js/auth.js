// ============================================
// auth.js - Gestion de l'authentification
// avec Supabase Auth
// ESIEA 2024 - Mabiala Euloge Junior
//
// Supabase gère les sessions avec des JWT
// stockés dans le localStorage automatiquement.
// ============================================

// Config Supabase (clé publique uniquement — la secret key ne va JAMAIS côté client)
const SUPABASE_URL = 'https://pgpsmtyrvqeypqjncirc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBncHNtdHlydnFleXBxam5jaXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzE1NDIsImV4cCI6MjA4NzIwNzU0Mn0.XMWjb-ySgQiTEi-5tH7aoj_Znq-Ji7qycO1BqtKpGQo';

// Initialisation du client Supabase
// IMPORTANT : j'utilise 'supabaseClient' et pas 'supabase' pour éviter
// d'écraser le nom global 'supabase' qui vient du CDN (sinon ReferenceError)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Se connecter avec email + mot de passe
 * @param {string} email
 * @param {string} password
 * @returns {Promise<void>}
 */
async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
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
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        throw new Error(error.message);
    }

    // Supabase envoie un email de confirmation par défaut
    console.log('Compte créé, email de confirmation envoyé à :', email);
    return data;
}

/**
 * Déconnecter l'utilisateur courant
 */
async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('Erreur lors de la déconnexion :', error.message);
    }
    window.location.href = 'login.html';
}

/**
 * Récupérer la session active
 * @returns {Promise<object|null>} session ou null
 */
async function getSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
}

/**
 * Vérifier si l'user est connecté, sinon rediriger vers login
 */
async function verifierAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    return session.user;
}

/**
 * Sur login.html : si déjà connecté, rediriger vers l'app
 */
async function verifierAuthLogin() {
    const session = await getSession();
    if (session) {
        window.location.href = 'index.html';
    }
}

if (window.location.pathname.includes('login.html')) {
    verifierAuthLogin();
}
