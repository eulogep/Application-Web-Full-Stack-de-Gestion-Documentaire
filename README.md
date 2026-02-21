# ⚡ DocManager — Full-Text Search à **25ms** sur 500+ Documents Perso

> **Supabase + PostgreSQL → Gestion de documents personnelle avec indexation avancée**
> *Projet ESIEA 2024 — De 600ms à 25ms en optimisant les index PostgreSQL*

[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/fr/docs/Web/JavaScript)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=flat-square&logo=github&logoColor=white)](https://pages.github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 🎯 Hero — Ce que ça fait en 10 secondes

```text
📁 DocManager
├── Stocke PDF, notes, liens, images avec tags
├── Recherche full-text PostgreSQL <25ms sur 500+ docs
├── Authentification Supabase (JWT, RLS isolé par user)
└── Déploiement statique GitHub Pages — 0 serveur, 0 coût
```

**Avant ce projet** : cours en PDF éparpillés, liens perdus dans les onglets, notes nulle part.  
**Après** : un outil de recherche perso que j'utilise encore aujourd'hui.

---

## 🚀 Fonctionnalités clés

- 🔍 **Recherche full-text en français** — index GIN + `tsvector` sur titre, description et contenu. Résultats triés par pertinence (`ts_rank`)
- 🏷️ **Tags PostgreSQL natifs** — tableaux `TEXT[]` avec index GIN — pas de table de jointure, requête `@>` ultra-rapide
- 🔒 **Row Level Security complet** — chaque utilisateur est isolé au niveau de la BDD, zéro chance de fuite de données cross-user
- ⚡ **Pagination server-side** — `COUNT(*) OVER()` (window function) = total + données en **une seule requête**
- 💡 **Debounce 350ms** — zéro requête parasite à chaque frappe, expérience fluide

---

## 📊 Performances — Avant / Après optimisation

| Requête | ❌ Sans index | ✅ Avec index GIN | Gain |
| --- | --- | --- | --- |
| Recherche full-text (500 docs) | ~600ms | **~20ms** | **×30** |
| Filtre par tags (`@>` array) | ~400ms | **~15ms** | **×26** |
| Liste documents (user isolé) | ~200ms | **~8ms** | **×25** |
| Count total + résultats | 2 requêtes (~300ms) | **1 requête (~25ms)** | **×12** |

> Mesures réalisées localement avec Supabase local dev + 500 documents de test insérés via script.

---

## ⚙️ Stack technique — Et pourquoi ce choix

| Technologie | Rôle | Pourquoi ici | Alternative refusée |
| --- | --- | --- | --- |
| **Supabase** | Backend / Auth / BDD | BaaS complet, PostgreSQL réel, RLS natif, gratuit | Firebase — NoSQL, pas de full-text natif |
| **PostgreSQL** | Base de données | `tsvector`, `GIN`, arrays natifs, fenêtres SQL | MySQL — full-text moins puissant |
| **JS Vanilla** | Frontend | Maîtrise des bases, zéro abstraction, bundle = 0 | React — over-engineering pour un CRUD perso |
| **GitHub Pages** | Hébergement | Gratuit, CI natif via push, zéro infra à maintenir | Vercel — fonctionnel aussi mais inutile ici |

---

## 🏗️ Architecture

```text
┌──────────────────────────────────────────────────┐
│              BROWSER (GitHub Pages)              │
│  index.html + style.css                          │
│  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ auth.js  │ │  app.js   │ │  documents.js  │  │
│  │ (JWT)    │ │ (état UI) │ │  (CRUD Supa.)  │  │
│  └──────────┘ └───────────┘ └────────────────┘  │
│              search.js (debounce 350ms)          │
└──────────────────────┬───────────────────────────┘
                       │ HTTPS / Supabase JS SDK
┌──────────────────────▼───────────────────────────┐
│              SUPABASE (BaaS)                     │
│  ┌───────────────┐  ┌────────────────────────┐  │
│  │  Auth (JWT)   │  │  PostgreSQL             │  │
│  │  + RLS Policy │  │  ├── GIN index tags    │  │
│  └───────────────┘  │  ├── GIN index tsvect. │  │
│                     │  └── B-tree user_id    │  │
│                     └────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 🔥 Challenges techniques résolus

### 1. Full-text < 100ms — du sequential scan à l'index GIN

**Problème** : `WHERE titre LIKE '%cours%'` = sequential scan complet = 600ms.

**Solution** : colonne `TSVECTOR GENERATED ALWAYS AS ... STORED` + index GIN → le vecteur est précalculé à l'écriture, pas à chaque lecture.

```sql
-- Colonne générée (calculée une fois à l'INSERT/UPDATE)
search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('french', COALESCE(titre, '')), 'A') ||
    setweight(to_tsvector('french', COALESCE(description, '')), 'B')
) STORED;

-- Index GIN : O(log n) au lieu de O(n)
CREATE INDEX idx_documents_search_vector ON documents USING GIN(search_vector);
```

**Résultat** : 600ms → **20ms** (-97%)

---

### 2. Pagination sans double requête — Window Function

**Problème** : pour paginer il faut le total ET les données → classiquement 2 requêtes.

**Solution** : `COUNT(*) OVER()` (window function PostgreSQL) = total inclus dans chaque ligne résultat.

```sql
SELECT
    *,
    COUNT(*) OVER() AS total_count   -- inclus sans 2e requête
FROM documents
WHERE user_id = auth.uid()
ORDER BY date_creation DESC
LIMIT 12 OFFSET 0;
```

---

### 3. Isolation utilisateur — Row Level Security

**Problème** : sans RLS, l'API Supabase exposait **tous** les documents (j'ai découvert ça lors d'un test).

**Solution** : policy PostgreSQL au niveau de la BDD — même si la clé anon est exposée côté client, un user ne peut pas lire les docs d'un autre.

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "isolation_user" ON documents
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
```

---

## 🚀 Déploiement — Fork & lance en 5 minutes

### Prérequis

- Compte [Supabase](https://supabase.com) gratuit
- Compte [GitHub](https://github.com) + Git installé

### Étapes

```bash
# 1. Forker ce repo
git clone https://github.com/eulogep/Application-Web-Full-Stack-de-Gestion-Documentaire.git
cd Application-Web-Full-Stack-de-Gestion-Documentaire

# 2. Créer le projet Supabase
# → supabase.com > New project > SQL Editor
# → Coller le contenu de sql/schema.sql et exécuter

# 3. Renseigner tes clés dans js/auth.js
#    SUPABASE_URL  = https://xxxx.supabase.co
#    SUPABASE_ANON KEY = eyJ...

# 4. Pousser sur GitHub → activer GitHub Pages (Settings > Pages > branch: main)
git add . && git commit -m "deploy" && git push
```

✅ **Temps moyen constaté** : **4 minutes** (compte Supabase déjà créé).

### Comparatif hébergement

| Option | Coût | Temps setup | HTTPS | Custom domain |
| --- | --- | --- | --- | --- |
| **GitHub Pages** | Gratuit | ~2 min | ✅ | ✅ |
| Netlify | Gratuit | ~3 min | ✅ | ✅ |
| VPS (DigitalOcean) | ~5€/mois | ~30 min | Manuel | ✅ |

---

## 📈 Ce que ce projet m'a appris — Skills directement applicables en prod

| Domaine | Ce que j'ai implémenté | Impact mesurable |
| --- | --- | --- |
| **PostgreSQL avancé** | Index GIN, tsvectors, window functions, RLS | ×30 sur la recherche full-text |
| **Supabase / BaaS** | Auth JWT, RLS policies, Realtime-ready schema | 0 serveur à maintenir |
| **JS Async** | `async/await`, `Promise.all()`, debounce maison | Requêtes parallèles, 0 waterfall |
| **SQL Security** | Row Level Security isolé par user | 0 fuite données cross-user |
| **Optimisation BDD** | Index sélectifs, pagination window function | -97% temps réponse |

---

## 📂 Structure du projet

```text
doc-manager/
├── index.html        → UI principale (grille, sidebar, modals)
├── login.html        → Auth (connexion / inscription)
├── style.css         → Vanilla CSS (variables, cards, responsive)
├── js/
│   ├── app.js        → État global, filtres, rendu des cards
│   ├── auth.js       → Supabase Auth (JWT, session, guards)
│   ├── documents.js  → CRUD + pagination + toggle favori
│   └── search.js     → Full-text + debounce 350ms
└── sql/
    └── schema.sql    → Tables, index GIN, RLS policies, requêtes
```

---

## 🌐 Liens

| | |
| --- | --- |
| 🔴 **Live demo** | *(à compléter après activation GitHub Pages)* |
| 📦 **Repo** | [Application-Web-Full-Stack-de-Gestion-Documentaire](https://github.com/eulogep/Application-Web-Full-Stack-de-Gestion-Documentaire) |
| 🗄️ **Schema SQL** | [sql/schema.sql](sql/schema.sql) |
| 📧 **Contact** | [LinkedIn — Euloge Junior Mabiala](https://www.linkedin.com/in/euloge-junior-mabiala) |

---

## 🔮 Roadmap — Ce qui viendrait en v2

- [ ] **Supabase Storage** — Upload réel des PDFs avec extraction de texte
- [ ] **Recherche vectorielle** — `pgvector` + embeddings OpenAI pour recherche sémantique
- [ ] **PWA** — Mode offline avec service worker + sync en arrière-plan
- [ ] **Partage de docs** — Policy RLS multi-tenant (sharing par user_id)

---

*Projet ESIEA 2024 — Mohammed Abia*
