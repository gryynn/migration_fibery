# 🚀 Migration Fibery → Supabase/PostgreSQL

**Outil de migration simple** pour transformer vos exports CSV Fibery en SQL PostgreSQL/Supabase avec préservation automatique des relations, types de données et structures.

> **🎯 Cas d'usage parfait :** Vous avez déjà exporté vos bases de données Fibery en CSV et voulez les importer dans Supabase !

---

## 📋 Table des matières

- [🚀 Migration Fibery → Supabase/PostgreSQL](#-migration-fibery--supabasepostgresql)
  - [📋 Table des matières](#-table-des-matières)
  - [✨ Fonctionnalités](#-fonctionnalités)
  - [🎯 Prérequis](#-prérequis)
  - [📦 Installation](#-installation)
  - [⚡ Démarrage rapide](#-démarrage-rapide)
  - [🔧 Configuration](#-configuration)
  - [📊 Utilisation étape par étape](#-utilisation-étape-par-étape)
  - [🗂️ Structure des fichiers](#️-structure-des-fichiers)
  - [🔍 Types de données](#-types-de-données)
  - [🔗 Relations automatiques](#-relations-automatiques)
  - [🐛 Dépannage](#-dépannage)
  - [🏗️ Architecture](#️-architecture)
  - [📈 Performance](#-performance)
  - [🔒 Sécurité](#-sécurité)
  - [🤝 Support](#-support)

---

## ✨ Fonctionnalités

### ✅ **Migration complète**
- **Analyse automatique** des structures de données Fibery
- **Détection des types** PostgreSQL (UUID, INTEGER, BOOLEAN, etc.)
- **Préservation des IDs** Fibery comme clés primaires
- **Batch processing** pour les gros volumes de données

### ✅ **Relations intelligentes**
- **Détection automatique** des relations many-to-many
- **Création des tables de jonction** avec contraintes
- **Index automatiques** pour les performances
- **Validation des références** avant insertion

### ✅ **Facilité d'utilisation**
- **Configuration simple** via variables en haut des fichiers
- **Messages explicatifs** pendant l'exécution
- **Fichiers SQL prêts à l'emploi** pour Supabase
- **Mode DRY-RUN** pour tester sans risque

### ✅ **Robustesse**
- **Gestion des erreurs** avec retry automatique
- **Validation des données** avant insertion
- **Échappement SQL** automatique
- **Support UTF-8** complet

---

## 🎯 Prérequis

### 📋 **Avant de commencer**
- ✅ **Exports CSV Fibery** (déjà téléchargés depuis Fibery)
- ✅ **Projet Supabase** créé (pour copier-coller le SQL)
- ✅ **Node.js** 16+ installé sur votre machine

### 📁 **Structure des fichiers attendue**
```
Important/                          # Dossier de votre export Fibery
├── Actionalisation-Dopa/
│   └── Actionalisation-Dopa.csv    # Un CSV par base de données
├── PSM-Centres d'intérêt/
│   └── PSM-Centres d'intérêt.csv
└── Bibliotheque-Auteurs/
    └── Bibliotheque-Auteurs.csv
```

### 🗄️ **Accès Supabase**
- **SQL Editor** dans votre projet Supabase (pour copier-coller)
- **Service Role Key** uniquement si vous voulez automatiser plus tard

---

## 📦 Installation

```bash
# 1. Cloner le projet
git clone https://github.com/gryynn/migration_fibery.git
cd migration_fibery

# 2. Installer les dépendances
npm install

# 3. Configurer les chemins (dans le code)
# Éditer csv-to-sql-migrator.js et create-relations.js
# Modifier la ligne : importantDir avec votre chemin vers le dossier Important
```

---

## ⚡ Démarrage rapide

### **Étape 1 : Configuration**
Modifiez le chemin dans les scripts :
```javascript
// Dans csv-to-sql-migrator.js et create-relations.js
const CONFIG = {
  importantDir: 'C:\\Users\\martin\\Downloads\\mon-export\\Important',  // ← Votre chemin
  schema: 'psm_root',  // Nom du schéma PostgreSQL
  batchSize: 100       // Lignes par INSERT (ajustez selon vos données)
};
```

### **Étape 2 : Migration**
```bash
# 1. Générer le SQL des tables
node csv-to-sql-migrator.js

# 2. Générer le SQL des relations
node create-relations.js
```

### **Étape 3 : Import dans Supabase**
1. Ouvrez **Supabase SQL Editor** dans votre projet
2. Copiez-collez le contenu de `migration-complete.sql`
3. Cliquez **"Run"** pour créer les tables
4. Copiez-collez le contenu de `relations-complete.sql`
5. Cliquez **"Run"** pour créer les relations

**🎉 Vos données Fibery sont maintenant dans Supabase !**

---

## 🔧 Configuration

### **Variables principales**

| Variable | Description | Exemple |
|----------|-------------|---------|
| `importantDir` | Chemin vers le dossier Important | `C:\Users\...\Important` |
| `schema` | Nom du schéma PostgreSQL | `psm_root` |
| `batchSize` | Lignes par INSERT | `100` (sûr) à `1000` (rapide) |

### **Configuration simple**

Modifiez seulement ces lignes dans les deux scripts :

```javascript
// csv-to-sql-migrator.js et create-relations.js
const CONFIG = {
  importantDir: 'C:\\Users\\martin\\Downloads\\mon-export\\Important',  // ← CHANGEZ CE CHEMIN
  schema: 'psm_root',  // ← CHANGEZ si vous voulez un autre nom de schéma
  batchSize: 100      // ← AJUSTEZ selon la taille de vos données
};
```

**💡 Pas de fichier .env, pas de clés API, juste modifier le chemin !**

---

## 📊 Utilisation étape par étape

### **Phase 1 : Analyse (csv-to-sql-migrator.js)**

```bash
node csv-to-sql-migrator.js
```

**Ce script :**
1. 🔍 **Analyse** tous les CSV dans le dossier Important
2. 🔮 **Détecte** les types PostgreSQL automatiquement
3. 📝 **Génère** `migration-complete.sql` avec :
   - `CREATE TABLE` pour chaque base
   - `INSERT` par batches
   - Commentaires explicatifs

### **Phase 2 : Relations (create-relations.js)**

```bash
node create-relations.js
```

**Ce script :**
1. 🔍 **Détecte** les colonnes de relations (avec virgules)
2. 🎯 **Devine** les tables cibles automatiquement
3. 🔗 **Génère** `relations-complete.sql` avec :
   - Tables de jonction many-to-many
   - Clés étrangères avec contraintes
   - Index pour les performances

### **Phase 3 : Exécution SQL**

1. **Supabase SQL Editor** → Nouveau query
2. **Copier-coller** `migration-complete.sql`
3. **Run** → Tables créées
4. **Copier-coller** `relations-complete.sql`
5. **Run** → Relations créées

---

## 🗂️ Structure des fichiers

### **Fichiers générés**

```
migration-complete.sql    # Tables et données principales
relations-complete.sql    # Relations many-to-many
```

### **Structure PostgreSQL créée**

```
psm_root/
├── actionalisation_dopa/           # Table principale
│   ├── id (UUID, Primary Key)
│   ├── name (TEXT)
│   ├── psm_centres_dinterets (TEXT)
│   └── ...
├── psm_centres_dinteret/          # Table liée
│   └── id (UUID, Primary Key)
└── actionalisation_dopa_psm_centres_dinteret/  # Table de jonction
    ├── actionalisation_dopa_id (UUID, FK)
    ├── psm_centres_dinteret_id (UUID, FK)
    └── PRIMARY KEY (dopa_id, centres_id)
```

---

## 🔍 Types de données

### **Détection automatique**

| Type Fibery | Type PostgreSQL | Exemple |
|-------------|-----------------|---------|
| ID | `UUID` | `d47ec620-2190-11ef-910c-f1df4955273f` |
| Nombre | `INTEGER` | `123`, `-456` |
| Décimal | `NUMERIC(12,2)` | `123.45` |
| Booléen | `BOOLEAN` | `true`, `false`, `1`, `0` |
| Date | `DATE` | `2024-06-03` |
| Date/Heure | `TIMESTAMPTZ` | `2024-06-03T10:05:39.625Z` |
| Texte | `TEXT` | `Tout le reste` |

### **Relations détectées**

| Format | Exemple | Résultat |
|--------|---------|----------|
| Liste | `"A,B,C"` | 3 relations créées |
| Nom Fibery | `"PSM-Insights"` | Lien vers table `psm_insights` |
| Référence | `"user_id"` | Lien vers table `user` |

---

## 🔗 Relations automatiques

### **Comment ça marche**

1. **Analyse** : Le script scanne toutes les colonnes
2. **Détection** : Cherche les virgules et patterns de noms
3. **Association** : Devine les tables cibles
4. **Création** : Génère les tables de jonction

### **Exemple concret**

**Données Fibery :**
```
Table: Actionalisation-Dopa
- id: abc-123
- name: "Duo Lingo"
- PSM-Centres d'intérêt: "Développement personnel,Communication"

Table: PSM-Centres d'intérêt
- id: def-456
- name: "Développement personnel"
- id: ghi-789
- name: "Communication"
```

**Résultat PostgreSQL :**
```sql
-- Table de jonction créée automatiquement
CREATE TABLE psm_root.actionalisation_dopa_psm_centres_dinteret (
  actionalisation_dopa_id UUID REFERENCES psm_root.actionalisation_dopa(id),
  psm_centres_dinteret_id UUID REFERENCES psm_root.psm_centres_dinteret(id),
  PRIMARY KEY (actionalisation_dopa_id, psm_centres_dinteret_id)
);

-- Données insérées
INSERT INTO psm_root.actionalisation_dopa_psm_centres_dinteret
VALUES ('abc-123', 'def-456'), ('abc-123', 'ghi-789');
```

---

## 🐛 Dépannage

### **Problèmes courants**

#### ❌ **"Dossier introuvable"**
```bash
# Vérifiez le chemin
console.log(CONFIG.importantDir);
// Doit pointer vers le dossier Important de votre export
```

#### ❌ **"Aucune relation détectée"**
- Vérifiez que vos colonnes contiennent des virgules
- Les noms de colonnes correspondent-ils aux noms de tables ?

#### ❌ **"Type UUID invalide"**
- Supabase attend des UUID valides
- Vérifiez que vos IDs Fibery sont au bon format

#### ❌ **"Foreign key violation"**
- Exécutez d'abord `migration-complete.sql`
- Puis `relations-complete.sql`

### **Logs de débogage**

```bash
# Mode verbeux
console.log(`Traitement: ${dbName}`);
console.log(`Colonnes: ${headers.length}`);
console.log(`Lignes: ${rows.length}`);
```

### **Validation post-migration**

```sql
-- Compter les tables
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'psm_root';

-- Vérifier les relations
SELECT
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'psm_root'
ORDER BY n_live_tup DESC;
```

---

## 🏗️ Architecture

```
📁 migration-fibery-supabase/
├── 📄 csv-to-sql-migrator.js     # Migration des tables
├── 📄 create-relations.js        # Détection des relations
├── 📄 migration-complete.sql     # SQL généré (tables)
├── 📄 relations-complete.sql     # SQL généré (relations)
├── 📄 README.md                  # Ce guide
└── 📄 package.json               # Dépendances
```

### **Flux de données**

```
Fibery CSV → Analyse → Types PostgreSQL → Tables SQL → Supabase
    ↓
Relations CSV → Détection → Tables jonction → Relations SQL → Supabase
```

---

## 📈 Performance

### **Temps de migration**

| Volume | Temps approx. | Configuration |
|--------|---------------|---------------|
| 10 tables, 1K lignes | ~30 secondes | batchSize: 100 |
| 50 tables, 10K lignes | ~3 minutes | batchSize: 500 |
| 100 tables, 50K lignes | ~15 minutes | batchSize: 1000 |

### **Optimisation**

```javascript
// Migration rapide (peut échouer avec gros volumes)
batchSize: 1000,
retryDelay: 500

// Migration sûre (recommandé)
batchSize: 100,
retryDelay: 2000
```

---

## 🔒 Sécurité

### **Bonnes pratiques**

- ✅ **Backup de vos CSV** avant de commencer
- ✅ **Projet Supabase de test** pour valider d'abord
- ✅ **Petits tests** avant la migration complète
- ✅ **Vérification** des résultats dans Supabase après import

---

## 🤝 Support

### **Documentation**

- 📖 **README.md** - Guide complet
- 💬 **Code commenté** - Explications dans le code
- 🔍 **Logs détaillés** - Messages pendant l'exécution

### **Aide**

1. **Logs** : Vérifiez la console pour les messages d'erreur
2. **Fichiers** : Examinez le SQL généré
3. **Tests** : Utilisez de petits échantillons d'abord

### **Évolution**

Ce projet est en amélioration continue. N'hésitez pas à :
- 📝 Signaler des bugs
- 💡 Proposer des améliorations
- 🔄 Contribuer au code

---

## 🎉 Succès !

Après migration, vous devriez avoir :
- ✅ Toutes vos tables Fibery en PostgreSQL
- ✅ Relations many-to-many préservées
- ✅ Types de données optimisés
- ✅ Index pour les performances
- ✅ Données prêtes pour vos applications

**Prochaines étapes :**
1. **Connectez** vos applications à Supabase
2. **Remplacez** les queries Fibery par du SQL
3. **Optimisez** les queries avec les index créés
4. **Archivez** votre workspace Fibery

---

**✨ Migration réussie ! Vos données Fibery sont maintenant dans PostgreSQL !**
