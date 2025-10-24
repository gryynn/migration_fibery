#!/usr/bin/env node
/**
 * ========================================================================
 * MIGRATEUR CSV → SQL - Fibery vers Supabase/PostgreSQL
 * ========================================================================
 *
 * GUIDE D'UTILISATION RAPIDE :
 * ===========================
 *
 * 1. PRÉPARATION :
 *    - Exportez vos bases Fibery en CSV (format Excel)
 *    - Placez les fichiers dans un dossier "Important"
 *    - Chaque sous-dossier = une base de données Fibery
 *    - Chaque CSV = une table dans cette base
 *
 * 2. CONFIGURATION :
 *    - Modifiez importantDir avec le chemin vers votre dossier Important
 *    - Ajustez schema, batchSize selon vos besoins
 *    - Le script génère automatiquement les types PostgreSQL
 *
 * 3. EXÉCUTION :
 *    node csv-to-sql-migrator.js
 *
 * 4. RÉSULTAT :
 *    - Fichier migration-complete.sql généré
 *    - Exécutez-le dans Supabase SQL Editor
 *
 * EXEMPLE DE STRUCTURE DE DOSSIERS ATTENDUE :
 * ===========================================
 * Important/
 *   ├── Actionalisation-Dopa/
 *   │   └── Actionalisation-Dopa.csv
 *   ├── PSM-Centres d'intérêt/
 *   │   └── PSM-Centres d'intérêt.csv
 *   └── Bibliotheque-Auteurs/
 *       └── Bibliotheque-Auteurs.csv
 *
 * TYPES DE DONNÉES DETECTÉS AUTOMATIQUEMENT :
 * ============================================
 * - UUID : pour les IDs Fibery (format standard UUID)
 * - INTEGER : nombres entiers
 * - NUMERIC(12,2) : nombres décimaux
 * - BOOLEAN : true/false, 1/0, yes/no
 * - DATE : format YYYY-MM-DD
 * - TIMESTAMPTZ : dates avec heure (ISO 8601)
 * - TEXT : texte par défaut
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION - À MODIFIER SELON VOS BESOINS
// ============================================
const CONFIG = {
  /**
   * 📁 Chemin vers le dossier "Important" de votre export Fibery
   * =======================================================
   * Exemple Windows: 'C:\\Users\\nom\\Downloads\\monfichier.fibery.io_20251201\\Important'
   * Exemple Mac/Linux: '/Users/nom/Downloads/monfichier.fibery.io_20251201/Important'
   */
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',

  /**
   * 📄 Nom du fichier SQL qui sera généré
   */
  outputSQL: './migration-complete.sql',

  /**
   * 🗂️ Nom du schéma PostgreSQL/Supabase (sera créé automatiquement)
   * Changez si vous voulez un autre nom que 'psm_root'
   */
  schema: 'psm_root',

  /**
   * 📦 Taille des batches pour les INSERT (ajustez selon la mémoire)
   * - 100: sûr mais lent
   * - 500: bon équilibre
   * - 1000: rapide mais peut planter avec beaucoup de données
   */
  batchSize: 100,

  /**
   * 🔍 Options avancées
   */
  options: {
    /**
     * Supprimer les tables existantes avant création (true = recommandé)
     */
    dropExistingTables: true,

    /**
     * Ajouter des commentaires explicatifs dans le SQL
     */
    addComments: true,

    /**
     * Créer les index automatiquement (peut être lent sur gros volumes)
     */
    createIndexes: false
  }
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * 🎯 MOTS RÉSERVÉS POSTGRESQL
 * =============================
 * Liste complète des mots-clés réservés par PostgreSQL.
 * Si un nom de colonne correspond à l'un de ces mots,
 * un underscore sera ajouté devant pour éviter les erreurs SQL.
 */
const RESERVED_KEYWORDS = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
  'authorization', 'binary', 'both', 'case', 'cast', 'check', 'collate', 'collation',
  'column', 'concurrently', 'constraint', 'create', 'cross', 'current_catalog',
  'current_date', 'current_role', 'current_schema', 'current_timestamp', 'current_user',
  'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false',
  'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant', 'group', 'having',
  'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is', 'isnull', 'join',
  'lateral', 'leading', 'left', 'like', 'limit', 'localtime', 'localtimestamp',
  'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order', 'outer',
  'overlaps', 'placing', 'primary', 'references', 'returning', 'right', 'select',
  'session_user', 'similar', 'some', 'symmetric', 'table', 'tablesample', 'then',
  'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'verbose',
  'when', 'where', 'window', 'with'
]);

/**
 * 🧹 NETTOYAGE ET NORMALISATION DES NOMS
 * ======================================
 * Transforme les noms de colonnes/tables Fibery en noms PostgreSQL valides
 *
 * TRANSFORMATIONS APPLIQUÉES :
 * - é, à, ç, etc. → e, a, c (suppression des accents)
 * - "L'important" → "l_important" (apostrophes)
 * - "Ma-super colonne" → "ma_super_colonne" (espaces/tirets)
 * - "2nd_colonne" → "_2nd_colonne" (commence par chiffre)
 * - "order" → "_order" (mot réservé PostgreSQL)
 * - Maximum 63 caractères (limite PostgreSQL)
 *
 * @param {string} name - Nom original de la colonne/table
 * @returns {string} - Nom nettoyé compatible PostgreSQL
 */
function sanitizeName(name) {
  if (!name) return 'unnamed';

  // Étape 1: Normalisation Unicode (décompose les caractères accentués)
  let clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Étape 2: Remplacer les caractères problématiques par underscore
  clean = clean.replace(/[''`]/g, '_');  // Apostrophes
  clean = clean.replace(/[\s\-\./]+/g, '_');  // Espaces, tirets, points, slashes

  // Étape 3: Garder seulement les caractères alphanumériques + underscore
  clean = clean.replace(/[^a-zA-Z0-9_]/g, '');

  // Étape 4: Minuscules
  clean = clean.toLowerCase();

  // Étape 5: Nettoyer les underscores
  clean = clean.replace(/_+/g, '_');  // Multiples → simple
  clean = clean.replace(/^_+|_+$/g, '');  // Début/fin

  // Étape 6: Vérifications spéciales
  if (!clean) clean = 'unnamed';  // Si vide après nettoyage
  if (/^[0-9]/.test(clean)) clean = '_' + clean;  // Commence par chiffre
  if (RESERVED_KEYWORDS.has(clean)) clean = '_' + clean;  // Mot réservé

  // Étape 7: Limite de longueur PostgreSQL
  if (clean.length > 63) {
    clean = clean.substring(0, 63);
  }

  return clean;
}

/**
 * 🔮 DÉTECTION AUTOMATIQUE DES TYPES POSTGRESQL
 * =============================================
 * Analyse une valeur et détermine le type PostgreSQL le plus approprié
 *
 * ALGORITHME DE DÉTECTION :
 * ========================
 * 1. Valeurs nulles/vides → TEXT (par défaut)
 * 2. Formats spécifiques → types précis
 * 3. Patterns regex → types optimisés
 * 4. Fallback → TEXT (universel)
 *
 * @param {any} value - Valeur à analyser
 * @returns {string} - Type PostgreSQL (UUID, INTEGER, BOOLEAN, etc.)
 */
function guessPostgresType(value) {
  // Cas 1: Valeurs nulles ou vides
  if (value === null || value === undefined || value === '') {
    return 'TEXT'; // Type par défaut pour les valeurs manquantes
  }

  const str = String(value).trim();

  // Cas 2: Booléens (différentes notations acceptées)
  const booleanValues = ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'];
  if (booleanValues.includes(str.toLowerCase())) {
    return 'BOOLEAN';
  }

  // Cas 3: UUID (format standard UUID v4)
  // Ex: "d47ec620-2190-11ef-910c-f1df4955273f"
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(str)) {
    return 'UUID'; // Type natif PostgreSQL, plus efficace que TEXT
  }

  // Cas 4: Entiers (négatifs ou positifs)
  // Ex: "-123", "456", "0"
  if (/^-?\d+$/.test(str)) {
    return 'INTEGER';
  }

  // Cas 5: Décimaux (avec point décimal)
  // Ex: "123.45", "-67.89"
  if (/^-?\d+\.\d+$/.test(str)) {
    return 'NUMERIC(12,2)'; // Précision fixe pour les prix, montants
  }

  // Cas 6: Dates au format ISO (YYYY-MM-DD)
  // Ex: "2024-06-03"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return 'DATE'; // Date sans heure
  }

  // Cas 7: Dates avec heure (format ISO 8601)
  // Ex: "2024-06-03T10:05:39.625Z", "2024-06-03T10:05:39"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
    return 'TIMESTAMPTZ'; // Date + heure + timezone
  }

  // Cas 8: Par défaut - texte (compatible avec tout)
  return 'TEXT';
}

/**
 * 🛡️ ÉCHAPPÉMENT DES VALEURS POUR SQL
 * ====================================
 * Convertit une valeur JavaScript en format SQL sûr
 *
 * RÈGLES D'ÉCHAPPÉMENT :
 * ====================
 * - NULL/undefined/vide → NULL SQL
 * - BOOLEAN → TRUE/FALSE SQL (converti depuis plusieurs formats)
 * - Nombres → valeur numérique directe (validation NaN)
 * - Textes → entre apostrophes, avec échappement des apostrophes
 *
 * @param {any} value - Valeur à échapper
 * @param {string} type - Type PostgreSQL de la colonne
 * @returns {string} - Valeur formatée pour SQL
 */
function escapeSQLValue(value, type) {
  // Cas 1: Valeurs nulles ou manquantes
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }

  const str = String(value);

  // Cas 2: Booléens (conversion depuis plusieurs formats)
  if (type === 'BOOLEAN') {
    const lower = str.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lower)) return 'TRUE';
    if (['false', '0', 'no', 'n'].includes(lower)) return 'FALSE';
    return 'NULL'; // Format non reconnu
  }

  // Cas 3: Nombres (entiers et décimaux)
  if (type === 'INTEGER' || type.startsWith('NUMERIC')) {
    const num = parseFloat(str);
    return isNaN(num) ? 'NULL' : String(num);
  }

  // Cas 4: Textes, UUIDs, dates (tous entre apostrophes)
  if (type === 'UUID' || type === 'DATE' || type === 'TIMESTAMPTZ' || type === 'TEXT') {
    // Échapper les apostrophes : ' → ''
    const escaped = str.replace(/'/g, "''");
    return `'${escaped}'`;
  }

  // Cas 5: Type non géré (fallback)
  return 'NULL';
}

/**
 * 📄 PARSING DES FICHIERS CSV FIBERY
 * ===================================
 * Lit et analyse un fichier CSV exporté depuis Fibery
 *
 * FORMAT ATTENDU :
 * ===============
 * - Séparateur : virgule (,)
 * - Guillemets : doubles pour les valeurs contenant des virgules
 * - Encodage : UTF-8 (support des caractères spéciaux)
 * - Ligne 1 : en-têtes de colonnes
 * - Lignes 2+ : données
 *
 * @param {string} filePath - Chemin vers le fichier CSV
 * @returns {Object} - { headers: [...], rows: [...] }
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return { headers: [], rows: [] };

  // Étape 1: Parser la ligne d'en-tête
  const headers = parseCSVLine(lines[0]);

  // Étape 2: Parser les lignes de données
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

/**
 * 🔧 PARSING D'UNE LIGNE CSV
 * ==========================
 * Analyse une ligne CSV en gérant correctement les guillemets
 *
 * GESTION DES GUILLEMETS :
 * =======================
 * - "valeur" : valeur simple
 * - "valeur avec,virgule" : virgule à l'intérieur des guillemets
 * - "valeur avec""guillemets" : guillemets doublés à l'intérieur
 * - valeur,sans,guillemets : valeurs multiples
 *
 * @param {string} line - Ligne CSV à parser
 * @returns {string[]} - Tableau des valeurs
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    // Cas 1: Début de guillemets
    if (char === '"' && !inQuotes) {
      inQuotes = true;

    // Cas 2: Guillemets doublés (échappement)
    } else if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';  // Ajouter un seul guillemet
      i++; // Sauter le guillemet suivant

    // Cas 3: Fin de guillemets
    } else if (char === '"' && inQuotes) {
      inQuotes = false;

    // Cas 4: Séparateur (virgule) en dehors des guillemets
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';

    // Cas 5: Caractère normal
    } else {
      current += char;
    }
  }

  // Ajouter la dernière valeur
  values.push(current.trim());
  return values;
}

// ============================================
// GÉNÉRATION SQL
// ============================================

/**
 * Génère le SQL pour une base de données
 */
function generateSQLForDatabase(dbFolder, dbName) {
  console.log(`\n📊 Traitement: ${dbName}`);
  
  // Trouver le fichier CSV principal
  const files = fs.readdirSync(dbFolder);
  const csvFile = files.find(f => f.endsWith('.csv'));
  
  if (!csvFile) {
    console.log(`  ⚠️  Aucun fichier CSV trouvé, skip`);
    return '';
  }
  
  const csvPath = path.join(dbFolder, csvFile);
  console.log(`  → CSV: ${csvFile}`);
  
  // Parser le CSV
  const { headers, rows } = parseCSV(csvPath);
  
  if (headers.length === 0 || rows.length === 0) {
    console.log(`  ⚠️  CSV vide, skip`);
    return '';
  }
  
  console.log(`  → ${headers.length} colonnes, ${rows.length} lignes`);
  
  // Nettoyer le nom de la table
  const tableName = sanitizeName(dbName);
  console.log(`  → Table SQL: ${CONFIG.schema}.${tableName}`);
  
  // Détecter les types de colonnes
  const columns = {};
  const hasIdColumn = headers.some(h => sanitizeName(h) === 'id');
  
  for (const header of headers) {
    const cleanHeader = sanitizeName(header);
    
    // Échantillonner 10 valeurs pour deviner le type
    const sampleValues = rows.slice(0, 10).map(row => row[header]);
    const types = sampleValues.map(v => guessPostgresType(v));
    
    // Type majoritaire
    const typeCounts = {};
    types.forEach(t => typeCounts[t] = (typeCounts[t] || 0) + 1);
    const majorityType = Object.keys(typeCounts).reduce((a, b) => 
      typeCounts[a] > typeCounts[b] ? a : b
    );
    
    columns[header] = {
      sqlName: cleanHeader,
      type: majorityType
    };
  }
  
  // Générer le SQL
  let sql = '';
  
  // CREATE TABLE
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `-- Table: ${tableName}\n`;
  sql += `-- Source: ${dbName}\n`;
  sql += `-- Lignes: ${rows.length}\n`;
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  sql += `DROP TABLE IF EXISTS ${CONFIG.schema}.${tableName} CASCADE;\n\n`;
  
  sql += `CREATE TABLE ${CONFIG.schema}.${tableName} (\n`;
  
  // Si le CSV a déjà une colonne "Id", on l'utilise comme PK
  // Sinon, on crée un id auto-généré
  if (hasIdColumn) {
    // L'Id Fibery sera la clé primaire
    sql += `  -- Colonnes (Id Fibery = Primary Key)\n`;
  } else {
    // Créer un id auto-généré
    sql += `  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
    sql += `  \n`;
    sql += `  -- Colonnes\n`;
  }
  
  // Colonnes
  const columnDefs = Object.entries(columns).map(([original, col]) => {
    // Si c'est la colonne Id et qu'elle existe, la marquer comme PK
    if (hasIdColumn && col.sqlName === 'id') {
      return `  ${col.sqlName} UUID PRIMARY KEY`;
    }
    return `  ${col.sqlName} ${col.type}`;
  });
  sql += columnDefs.join(',\n');
  
  // Ajout des colonnes de métadonnées uniquement si pas d'Id Fibery
  if (!hasIdColumn) {
    sql += ',\n';
    sql += `  \n`;
    sql += `  -- Métadonnées\n`;
    sql += `  created_at TIMESTAMPTZ DEFAULT NOW(),\n`;
    sql += `  updated_at TIMESTAMPTZ DEFAULT NOW()\n`;
  } else {
    sql += '\n';
  }
  
  sql += `);\n\n`;
  
  // Commentaire
  sql += `COMMENT ON TABLE ${CONFIG.schema}.${tableName} IS 'Migré depuis Fibery: ${dbName} | ${rows.length} lignes';\n\n`;
  
  // INSERT par batch
  console.log(`  → Génération des INSERT (batch size: ${CONFIG.batchSize})...`);
  
  for (let i = 0; i < rows.length; i += CONFIG.batchSize) {
    const batch = rows.slice(i, i + CONFIG.batchSize);
    
    sql += `-- Batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(rows.length / CONFIG.batchSize)}\n`;
    sql += `INSERT INTO ${CONFIG.schema}.${tableName} (`;
    
    // Noms de colonnes
    const colNames = Object.values(columns).map(c => c.sqlName);
    sql += colNames.join(', ');
    sql += `) VALUES\n`;
    
    // Valeurs
    const valueLines = batch.map(row => {
      const values = Object.entries(columns).map(([original, col]) => {
        return escapeSQLValue(row[original], col.type);
      });
      return `  (${values.join(', ')})`;
    });
    
    sql += valueLines.join(',\n');
    sql += ';\n\n';
  }
  
  console.log(`  ✅ ${rows.length} lignes générées`);
  
  return sql;
}

// ============================================
// MAIN
// ============================================

function main() {
  console.log('━'.repeat(80));
  console.log('🚀 CSV TO SQL MIGRATOR - Fibery → Supabase');
  console.log('━'.repeat(80));
  console.log(`📂 Dossier source: ${CONFIG.importantDir}`);
  console.log(`📄 Fichier SQL: ${CONFIG.outputSQL}`);
  console.log(`🗂️  Schéma PostgreSQL: ${CONFIG.schema}`);
  console.log('━'.repeat(80));
  
  // Vérifier que le dossier existe
  if (!fs.existsSync(CONFIG.importantDir)) {
    console.error(`❌ ERREUR: Dossier introuvable: ${CONFIG.importantDir}`);
    console.log('\n💡 Modifiez la variable importantDir dans le script');
    process.exit(1);
  }
  
  // Lister les sous-dossiers (bases de données)
  const databases = fs.readdirSync(CONFIG.importantDir)
    .filter(name => {
      const fullPath = path.join(CONFIG.importantDir, name);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();
  
  console.log(`\n📊 ${databases.length} bases de données trouvées:\n`);
  databases.forEach((db, idx) => {
    console.log(`  ${idx + 1}. ${db}`);
  });
  
  // Générer le header SQL
  let fullSQL = '';
  fullSQL += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  fullSQL += `-- MIGRATION FIBERY → SUPABASE\n`;
  fullSQL += `-- Généré le: ${new Date().toISOString()}\n`;
  fullSQL += `-- Bases: ${databases.length}\n`;
  fullSQL += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  fullSQL += `-- Création du schéma\n`;
  fullSQL += `CREATE SCHEMA IF NOT EXISTS ${CONFIG.schema};\n`;
  fullSQL += `SET search_path TO ${CONFIG.schema}, public;\n\n`;
  fullSQL += `-- Extension UUID\n`;
  fullSQL += `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n`;
  
  // Traiter chaque base
  for (const db of databases) {
    const dbFolder = path.join(CONFIG.importantDir, db);
    const sql = generateSQLForDatabase(dbFolder, db);
    fullSQL += sql;
  }
  
  // Footer
  fullSQL += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  fullSQL += `-- FIN DE LA MIGRATION\n`;
  fullSQL += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  fullSQL += `RESET search_path;\n`;
  
  // Sauvegarder
  fs.writeFileSync(CONFIG.outputSQL, fullSQL, 'utf8');
  
  const fileSize = (fs.statSync(CONFIG.outputSQL).size / 1024).toFixed(1);
  
  console.log('\n━'.repeat(80));
  console.log('✅ MIGRATION SQL GÉNÉRÉE !');
  console.log('━'.repeat(80));
  console.log(`📄 Fichier: ${CONFIG.outputSQL}`);
  console.log(`📊 Taille: ${fileSize} KB`);
  console.log(`\n🚀 PROCHAINES ÉTAPES:`);
  console.log(`  1. Ouvrez Supabase SQL Editor`);
  console.log(`  2. Copiez-collez le contenu de ${CONFIG.outputSQL}`);
  console.log(`  3. Cliquez "Run" pour exécuter`);
  console.log('━'.repeat(80));
}

// Lancer le programme
try {
  main();
} catch (error) {
  console.error('\n❌ ERREUR:', error.message);
  console.error(error.stack);
  process.exit(1);
}