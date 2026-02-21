-- ============================================
-- Schéma de la base de données - Doc Manager
-- Projet ESIEA 2024 - Mohammed Abia
-- 
-- J'utilise Supabase donc je me base sur
-- leur système d'auth (auth.users est déjà créé)
-- ============================================

-- Table principale des documents
-- TODO: peut-être ajouter un champ pour les partages entre utilisateurs plus tard
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    -- type_doc : 'pdf', 'note', 'lien', 'image'
    type_doc VARCHAR(50) CHECK (type_doc IN ('pdf', 'note', 'lien', 'image')),
    contenu TEXT,           -- texte extrait du doc ou URL si c'est un lien
    tags TEXT[],            -- array PostgreSQL, cool pour éviter une table de jointure
    date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_modification TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    taille_kb INTEGER,      -- NULL si c'est une note ou un lien
    est_favori BOOLEAN DEFAULT FALSE,
    -- colonne générée pour la recherche full-text (évite de recalculer à chaque requête)
    -- j'ai découvert ça en cherchant comment avoir des requêtes < 100ms
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('french', COALESCE(titre, '')), 'A') ||
        setweight(to_tsvector('french', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('french', COALESCE(contenu, '')), 'C')
    ) STORED
);

-- Table pour garder un historique des recherches
-- C'est utile pour afficher les "recherches récentes" dans l'UI
CREATE TABLE IF NOT EXISTS historique_recherches (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    terme_recherche VARCHAR(255) NOT NULL,
    date_recherche TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ============================================
-- INDEX - c'est ce qui fait la différence
-- entre 500ms et 50ms de temps de réponse
-- ============================================

-- Index sur user_id : filtrer les docs d'un utilisateur (requête la plus fréquente)
CREATE INDEX IF NOT EXISTS idx_documents_user_id 
    ON documents(user_id);

-- Index GIN sur le tableau de tags
-- GIN = Generalized Inverted Index, parfait pour les arrays et full-text
-- sans ça, chercher dans les tags est très lent (sequential scan)
CREATE INDEX IF NOT EXISTS idx_documents_tags 
    ON documents USING GIN(tags);

-- Index pour filtrer par type et trier par date (souvent combiné dans les filtres)
CREATE INDEX IF NOT EXISTS idx_documents_type_date 
    ON documents(type_doc, date_creation DESC);

-- Index GIN pour la recherche full-text sur le tsvector généré
-- c'est l'index le plus important pour les performances de recherche
CREATE INDEX IF NOT EXISTS idx_documents_search_vector 
    ON documents USING GIN(search_vector);

-- Index sur les favoris (souvent filtrés séparément)
CREATE INDEX IF NOT EXISTS idx_documents_favori 
    ON documents(user_id, est_favori) 
    WHERE est_favori = TRUE;  -- index partiel, plus léger


-- ============================================
-- FONCTIONS ET TRIGGERS
-- ============================================

-- Trigger pour mettre à jour date_modification automatiquement
-- je voulais pas avoir à le gérer côté JS
CREATE OR REPLACE FUNCTION update_date_modification()
RETURNS TRIGGER AS $$
BEGIN
    NEW.date_modification = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_date_modification
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_date_modification();


-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Important avec Supabase : chaque user
-- ne voit que ses propres documents
-- ============================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE historique_recherches ENABLE ROW LEVEL SECURITY;

-- Politique : un user ne peut voir/modifier que ses documents
CREATE POLICY "documents_user_isolation" ON documents
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "historique_user_isolation" ON historique_recherches
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ============================================
-- REQUÊTES OPTIMISÉES - à utiliser côté JS
-- (je les note ici pour m'en rappeler)
-- ============================================

-- 1. Recherche full-text avec ranking
-- ts_rank donne une note de pertinence (0 à 1)
/*
SELECT 
    id, titre, description, type_doc, tags, date_creation, est_favori,
    ts_rank(search_vector, query) AS pertinence
FROM 
    documents,
    plainto_tsquery('french', $1) query      -- $1 = terme de recherche
WHERE 
    user_id = auth.uid()
    AND search_vector @@ query
ORDER BY 
    pertinence DESC,
    date_modification DESC
LIMIT $2 OFFSET $3;                          -- $2 = nb par page, $3 = offset
*/

-- 2. Filtrer par type + tag
-- l'opérateur @> vérifie si le tableau contient la valeur
/*
SELECT id, titre, type_doc, tags, date_creation, est_favori
FROM documents
WHERE 
    user_id = auth.uid()
    AND ($1::VARCHAR IS NULL OR type_doc = $1)          -- $1 = type (peut être NULL)
    AND ($2::TEXT[] IS NULL OR tags @> $2::TEXT[])      -- $2 = array de tags
ORDER BY date_creation DESC
LIMIT $3 OFFSET $4;
*/

-- 3. Récupérer tous les tags distincts d'un user (pour la sidebar)
-- unnest() "déplie" les arrays PostgreSQL
/*
SELECT DISTINCT unnest(tags) AS tag
FROM documents
WHERE user_id = auth.uid()
ORDER BY tag;
*/

-- 4. Pagination classique avec count total
/*
SELECT 
    *,
    COUNT(*) OVER() AS total_count      -- window function pour le total sans 2e requête
FROM documents
WHERE user_id = auth.uid()
ORDER BY date_creation DESC
LIMIT $1 OFFSET $2;
*/
