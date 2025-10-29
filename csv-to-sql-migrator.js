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
const crypto = require('crypto');

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
 * 🛡️ ÉCHAPPÉMENT DES VALEURS POUR SQL - VERSION AMÉLIORÉE
 * =======================================================
 * Convertit une valeur JavaScript en format SQL sûr avec gestion complète
 * des caractères spéciaux PostgreSQL
 *
 * RÈGLES D'ÉCHAPPÉMENT :
 * ====================
 * - NULL/undefined/vide → NULL SQL
 * - BOOLEAN → TRUE/FALSE SQL (converti depuis plusieurs formats)
 * - Nombres → valeur numérique directe (validation NaN)
 * - Textes → entre apostrophes avec échappement complet des caractères spéciaux
 *
 * ÉCHAPPEMENTS APPLIQUÉS :
 * - Apostrophes : ' → '' (doubler les apostrophes)
 * - Backslashes : \ → \\ (échapper les backslashes)
 * - Retours à la ligne : \n → \\n, \r → \\r
 * - Guillemets doubles : " → " (PAS d'échappement, PostgreSQL utilise ')
 * - Caractères Unicode : préservés (émojis, accents)
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

  // Cas 4: Textes, UUIDs, dates (tous entre apostrophes avec échappement complet)
  if (type === 'UUID' || type === 'DATE' || type === 'TIMESTAMPTZ' || type === 'TEXT') {
    // Échappement complet des caractères spéciaux PostgreSQL
    const escaped = str
      .replace(/\\/g, '\\\\')  // Backslashes : \ → \\
      .replace(/'/g, "''")     // Apostrophes : ' → ''
      .replace(/\n/g, '\\n')   // Retours à la ligne : \n → \\n
      .replace(/\r/g, '\\r')   // Retours chariot : \r → \\r
      .replace(/\t/g, '\\t');  // Tabulations : \t → \\t
    
    return `'${escaped}'`;
  }

  // Cas 5: Type non géré (fallback)
  return 'NULL';
}

/**
 * 🧪 TEST DE LA FONCTION escapeSQLValue
 * =====================================
 * Fonction de test pour vérifier que l'échappement fonctionne correctement
 */
function testEscapeSQLValue() {
  console.log('🧪 Test de escapeSQLValue()...\n');
  
  const testCases = [
    // Tests basiques
    { input: 'Hello', expected: "'Hello'", description: 'Texte simple' },
    { input: '', expected: 'NULL', description: 'Chaîne vide' },
    { input: null, expected: 'NULL', description: 'Valeur null' },
    
    // Tests apostrophes
    { input: "C'est", expected: "'C''est'", description: 'Apostrophe simple' },
    { input: "C'est \"cool\"", expected: "'C''est \"cool\"'", description: 'Apostrophe + guillemets' },
    { input: "L'important c'est", expected: "'L''important c''est'", description: 'Multiples apostrophes' },
    
    // Tests guillemets (ne doivent PAS être échappés)
    { input: 'He said "Hi"', expected: "'He said \"Hi\"'", description: 'Guillemets simples' },
    { input: 'He said "Hi" and "Bye"', expected: "'He said \"Hi\" and \"Bye\"'", description: 'Multiples guillemets' },
    
    // Tests backslashes
    { input: 'path\\to\\file', expected: "'path\\\\to\\\\file'", description: 'Backslashes' },
    { input: 'C:\\Users\\Name', expected: "'C:\\\\Users\\\\Name'", description: 'Chemin Windows' },
    
    // Tests retours à la ligne
    { input: 'Line1\nLine2', expected: "'Line1\\nLine2'", description: 'Retour à la ligne Unix' },
    { input: 'Line1\r\nLine2', expected: "'Line1\\r\\nLine2'", description: 'Retour à la ligne Windows' },
    { input: 'Line1\rLine2', expected: "'Line1\\rLine2'", description: 'Retour chariot' },
    
    // Tests tabulations
    { input: 'Col1\tCol2', expected: "'Col1\\tCol2'", description: 'Tabulation' },
    
    // Tests mixtes (cas réels de PSM-PERMAV)
    { input: "C'est pouvoir passer du TEMPS", expected: "'C''est pouvoir passer du TEMPS'", description: 'Cas PSM-PERMAV 1' },
    { input: 'Tu as un comportement "éponge" avec Jeanne', expected: "'Tu as un comportement \"éponge\" avec Jeanne'", description: 'Cas PSM-PERMAV 2' },
    { input: 'Ecrire une histoire inspirante et cool "Solal Punk"', expected: "'Ecrire une histoire inspirante et cool \"Solal Punk\"'", description: 'Cas PSM-PERMAV 3' },
    
    // Tests caractères Unicode
    { input: 'Café ☕ émoji', expected: "'Café ☕ émoji'", description: 'Caractères Unicode' },
    { input: 'Français: àéèùç', expected: "'Français: àéèùç'", description: 'Accents français' },
    
    // Tests booléens
    { input: 'true', type: 'BOOLEAN', expected: 'TRUE', description: 'Booléen true' },
    { input: 'false', type: 'BOOLEAN', expected: 'FALSE', description: 'Booléen false' },
    { input: '1', type: 'BOOLEAN', expected: 'TRUE', description: 'Booléen 1' },
    { input: '0', type: 'BOOLEAN', expected: 'FALSE', description: 'Booléen 0' },
    
    // Tests nombres
    { input: '123', type: 'INTEGER', expected: '123', description: 'Entier' },
    { input: '123.45', type: 'NUMERIC(12,2)', expected: '123.45', description: 'Décimal' },
    { input: 'invalid', type: 'INTEGER', expected: 'NULL', description: 'Nombre invalide' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const result = escapeSQLValue(testCase.input, testCase.type || 'TEXT');
    const success = result === testCase.expected;
    
    if (success) {
      console.log(`✅ ${testCase.description}: ${c('green', 'PASS')}`);
      passed++;
    } else {
      console.log(`❌ ${testCase.description}: ${c('red', 'FAIL')}`);
      console.log(`   Input:    ${c('yellow', JSON.stringify(testCase.input))}`);
      console.log(`   Expected: ${c('green', testCase.expected)}`);
      console.log(`   Got:      ${c('red', result)}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Résultats: ${c('green', passed)} passés, ${c('red', failed)} échoués`);
  
  if (failed === 0) {
    console.log(`${c('green', '🎉 Tous les tests sont passés !')}`);
  } else {
    console.log(`${c('red', '⚠️ Certains tests ont échoué. Vérifiez la fonction.')}`);
  }
  
  return failed === 0;
}

// ============================================
// LOGGING / REPORT
// ============================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const OUTPUT_DIR = './output';
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(OUTPUT_DIR);

const errorsLogPath = path.join(OUTPUT_DIR, 'errors.log');
function logErrorLine(message) {
  fs.appendFileSync(errorsLogPath, `[${new Date().toISOString()}] ${message}\n`);
}

const migrationReport = {
  generatedAt: new Date().toISOString(),
  importantDir: CONFIG.importantDir,
  dryRun: DRY_RUN,
  totals: {
    databases: 0,
    tables: 0,
    rowsProcessed: 0,
    uuidInvalid: 0,
    specialChars: 0,
    successes: 0,
    failures: 0
  },
  tables: []
};

function generateUuidV4() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString('hex');
  return (
    hex.slice(0, 8) + '-' +
    hex.slice(8, 12) + '-' +
    hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' +
    hex.slice(20)
  );
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
    return { sql: '', tableReport: null };
  }
  
  const csvPath = path.join(dbFolder, csvFile);
  console.log(`  → CSV: ${csvFile}`);
  
  // Parser le CSV
  const { headers, rows } = parseCSV(csvPath);
  
  if (headers.length === 0 || rows.length === 0) {
    console.log(`  ⚠️  CSV vide, skip`);
    return { sql: '', tableReport: null };
  }
  
  console.log(`  → ${headers.length} colonnes, ${rows.length} lignes`);
  
  // Nettoyer le nom de la table
  const tableName = sanitizeName(dbName);
  console.log(`  → Table SQL: ${CONFIG.schema}.${tableName}`);
  
  // Détecter les types de colonnes
  const columns = {};
  const hasIdColumn = headers.some(h => sanitizeName(h) === 'id');
  const idHeader = headers.find(h => sanitizeName(h) === 'id');
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let needsOriginalIdColumn = false;
  
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

  // Scan des UUID invalides si une colonne Id existe
  const tableErrors = [];
  let invalidUuidCount = 0;
  let specialCharsCount = 0;
  if (hasIdColumn && idHeader) {
    for (let i = 0; i < rows.length; i++) {
      const rawId = (rows[i][idHeader] || '').trim();
      if (rawId && !UUID_RE.test(rawId)) {
        invalidUuidCount++;
        needsOriginalIdColumn = true;
        tableErrors.push({ rowIndex: i + 2, reason: 'invalid_uuid', value: rawId });
      }
      // détecter caractères spéciaux sur la ligne
      for (const h of headers) {
        const v = rows[i][h];
        if (v && (v.includes("'") || v.includes('"') || v.includes('\n'))) {
          specialCharsCount++;
        }
      }
    }
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
  // Ajouter _original_id si nécessaire
  if (needsOriginalIdColumn) {
    columnDefs.push(`  _original_id TEXT`);
  }
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

  const tableReport = {
    table: `${CONFIG.schema}.${tableName}`,
    source: dbName,
    rows: rows.length,
    uuidInvalid: invalidUuidCount,
    specialChars: specialCharsCount,
    successes: 0, // évalué après génération
    failures: 0,
    errorLines: tableErrors
  };

  // Colonnes pour INSERT
  const insertColumns = [...Object.values(columns).map(c => c.sqlName)];
  if (needsOriginalIdColumn) insertColumns.push('_original_id');
  
  for (let i = 0; i < rows.length; i += CONFIG.batchSize) {
    const batch = rows.slice(i, i + CONFIG.batchSize);
    const batchIndex = Math.floor(i / CONFIG.batchSize) + 1;
    const totalBatches = Math.ceil(rows.length / CONFIG.batchSize);

    // Préparer les lignes de valeurs et gérer UUID invalides
    const valueLines = [];
    const perRowInserts = [];
    for (const row of batch) {
      try {
        const values = [];
        let originalIdValue = null;
        for (const [original, col] of Object.entries(columns)) {
          if (hasIdColumn && col.sqlName === 'id') {
            const rawId = (row[original] || '').trim();
            if (!rawId || !UUID_RE.test(rawId)) {
              // remplacer par un UUID v4 et mémoriser l'original
              const newId = generateUuidV4();
              values.push(escapeSQLValue(newId, 'UUID'));
              originalIdValue = rawId || null;
              migrationReport.totals.uuidInvalid += 1;
            } else {
              values.push(escapeSQLValue(rawId, 'UUID'));
            }
          } else {
            values.push(escapeSQLValue(row[original], col.type));
          }
        }
        if (needsOriginalIdColumn) {
          values.push(originalIdValue === null ? 'NULL' : escapeSQLValue(originalIdValue, 'TEXT'));
        }
        valueLines.push(`  (${values.join(', ')})`);
        perRowInserts.push(`  BEGIN\n    INSERT INTO ${CONFIG.schema}.${tableName} (${insertColumns.join(', ')}) VALUES (${values.join(', ')});\n  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Row failed: %', SQLERRM;\n  END;`);
        migrationReport.totals.rowsProcessed += 1;
      } catch (e) {
        tableReport.failures += 1;
        logErrorLine(`${dbName} row_error: ${e.message}`);
      }
    }

    // Block avec retry: essayer le batch, sinon per-row
    sql += `-- Batch ${batchIndex}/${totalBatches}\n`;
    sql += `DO $$\nBEGIN\n`;
    sql += `  INSERT INTO ${CONFIG.schema}.${tableName} (${insertColumns.join(', ')}) VALUES\n`;
    sql += valueLines.join(',\n') + `;\n`;
    sql += `EXCEPTION WHEN OTHERS THEN\n`;
    sql += `  -- Retry ligne par ligne\n`;
    sql += perRowInserts.join('\n') + '\n';
    sql += `END$$;\n\n`;
  }
  
  console.log(`  ✅ ${rows.length} lignes générées`);
  migrationReport.totals.tables += 1;
  migrationReport.totals.specialChars += specialCharsCount;
  // Succès estimés = lignes - échecs parsing
  tableReport.successes = rows.length - tableReport.failures;
  migrationReport.totals.successes += tableReport.successes;
  migrationReport.tables.push(tableReport);
  
  return { sql, tableReport };
}

// ============================================
// MAIN
// ============================================

function main() {
  console.log('━'.repeat(80));
  console.log('🚀 CSV TO SQL MIGRATOR - Fibery → Supabase');
  console.log('━'.repeat(80));
  console.log(`📂 Dossier source: ${CONFIG.importantDir}`);
  console.log(`📄 Fichier SQL: ${CONFIG.outputSQL}${DRY_RUN ? ' (dry-run)' : ''}`);
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
  migrationReport.totals.databases = databases.length;
  
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
    const { sql } = generateSQLForDatabase(dbFolder, db);
    fullSQL += sql;
  }
  
  // Footer
  fullSQL += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  fullSQL += `-- FIN DE LA MIGRATION\n`;
  fullSQL += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  fullSQL += `RESET search_path;\n`;
  
  // Sauvegarder
  if (!DRY_RUN) {
    fs.writeFileSync(CONFIG.outputSQL, fullSQL, 'utf8');
  }
  
  const fileSize = DRY_RUN ? '0.0' : (fs.statSync(CONFIG.outputSQL).size / 1024).toFixed(1);

  // Écrire rapport JSON
  const reportPath = path.join(OUTPUT_DIR, 'migration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(migrationReport, null, 2), 'utf8');
  
  console.log('\n━'.repeat(80));
  console.log('✅ MIGRATION TERMINÉE !');
  console.log('━'.repeat(80));
  console.log(`📄 Fichier: ${CONFIG.outputSQL}`);
  console.log(`📊 Taille: ${fileSize} KB`);
  console.log(`🧾 Rapport: ${path.join(OUTPUT_DIR, 'migration-report.json')}`);
  console.log(`🪵 Log erreurs: ${errorsLogPath}`);
  console.log(`\n🚀 PROCHAINES ÉTAPES:`);
  if (DRY_RUN) {
    console.log(`  Dry-run: pas d'écriture SQL. Vérifiez le rapport puis relancez sans --dry-run.`);
  } else {
    console.log(`  1. Ouvrez Supabase SQL Editor`);
    console.log(`  2. Copiez-collez le contenu de ${CONFIG.outputSQL}`);
    console.log(`  3. Cliquez "Run" pour exécuter`);
  }
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