#!/usr/bin/env node
/**
 * ========================================================================
 * RELATION BUILDER - Détection et création automatique des relations
 * ========================================================================
 *
 * GUIDE D'UTILISATION :
 * ====================
 *
 * 1. PRÉREQUIS :
 *    - Avoir exécuté csv-to-sql-migrator.js avant
 *    - Avoir créé les tables dans PostgreSQL/Supabase
 *
 * 2. CONFIGURATION :
 *    - Vérifiez importantDir : chemin vers votre dossier Important
 *    - Ajustez schema : nom du schéma PostgreSQL
 *    - Modifiez ignoreColumns si nécessaire
 *
 * 3. EXÉCUTION :
 *    node create-relations.js
 *
 * 4. RÉSULTAT :
 *    - Fichier relations-complete.sql généré
 *    - Exécutez-le APRÈS migration-complete.sql dans Supabase
 *
 * PRINCIPE DE FONCTIONNEMENT :
 * ===========================
 * 1. Analyse tous les CSV pour détecter les colonnes de relations
 * 2. Devine automatiquement les tables cibles
 * 3. Génère les tables de jonction (many-to-many)
 * 4. Crée les INSERT pour peupler les relations
 * 5. Ajoute les index pour les performances
 *
 * EXEMPLE DE DÉTECTION :
 * =====================
 * Colonne "PSM-Insights" dans "Actionalisation-Dopa" →
 * Table de jonction: actionalisation_dopa_psm_insights
 * Avec clés étrangères vers les deux tables
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION - À ADAPTER À VOTRE PROJET
// ============================================
const CONFIG = {
  /**
   * 📁 Chemin vers le dossier "Important" de votre export Fibery
   * ========================================================
   * Même chemin que dans csv-to-sql-migrator.js
   */
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',

  /**
   * 📄 Fichier SQL de sortie pour les relations
   */
  outputSQL: './relations-complete.sql',

  /**
   * 🗂️ Nom du schéma PostgreSQL (doit correspondre au migrateur)
   */
  schema: 'psm_root',

  /**
   * 🚫 COLONNES À IGNORER (pas des relations)
   * ========================================
   * Ces colonnes ne seront PAS traitées comme des relations
   */
  ignoreColumns: [
    // Colonnes système courantes
    'id', 'public_id', 'name', 'creation_date', 'modification_date',
    'created_by_id', 'created_by_name', 'created_by',

    // Colonnes de données simples
    'age', 'score', 'date', 'time', 'year', 'month', 'day',
    'count', 'total', 'sum', 'average', 'min', 'max',

    // Colonnes de texte simple
    'description', 'comment', 'note', 'text', 'content', 'body',

    // Ajoutez ici d'autres colonnes qui ne sont pas des relations
    // Ex: 'status', 'priority', 'category', 'tags'
  ],

  /**
   * 🔍 OPTIONS DE DÉTECTION
   */
  detection: {
    /**
     * Nombre d'échantillons pour analyser les types de données
     */
    sampleSize: 20,

    /**
     * Seuil minimum de virgules pour considérer comme relation
     */
    minCommaRatio: 0.1,

    /**
     * Patterns de noms de colonnes qui indiquent des relations
     */
    relationPatterns: [
      /^[A-Z][a-z]+-[A-Z]/,  // Ex: "PSM-Insights", "Action-Objectif"
      /_id$/,                // Ex: "user_id", "category_id"
      /_ids$/,               // Ex: "tags_ids", "categories_ids"
    ]
  }
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * 🧹 NORMALISATION DES NOMS POUR POSTGRESQL
 * =========================================
 * Même fonction que dans csv-to-sql-migrator.js pour cohérence
 */
function sanitizeName(name) {
  if (!name) return 'unnamed';

  // Étape 1: Supprimer les accents (é → e, à → a, etc.)
  let clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Étape 2: Remplacer les caractères spéciaux
  clean = clean.replace(/[''`]/g, '_');  // Apostrophes → underscore
  clean = clean.replace(/[\s\-\./]+/g, '_');  // Espaces, tirets, points, slashes

  // Étape 3: Garder seulement caractères alphanumériques + underscore
  clean = clean.replace(/[^a-zA-Z0-9_]/g, '');

  // Étape 4: Minuscules
  clean = clean.toLowerCase();

  // Étape 5: Nettoyer les underscores
  clean = clean.replace(/_+/g, '_');  // Multiples → simple
  clean = clean.replace(/^_+|_+$/g, '');  // Début/fin

  // Étape 6: Vérifications spéciales
  if (!clean) clean = 'unnamed';  // Si vide
  if (/^[0-9]/.test(clean)) clean = '_' + clean;  // Commence par chiffre

  // Étape 7: Limite PostgreSQL (63 caractères)
  if (clean.length > 63) {
    clean = clean.substring(0, 63);
  }

  return clean;
}

/**
 * 📄 PARSING CSV POUR L'ANALYSE DES RELATIONS
 * ===========================================
 * Même fonction que dans csv-to-sql-migrator.js
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
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
 * Même fonction que dans csv-to-sql-migrator.js
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i++; // Sauter le guillemet suivant
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}


// ============================================
// DÉTECTION DES RELATIONS
// ============================================

/**
 * 🔍 DÉTECTION DES COLONNES DE RELATIONS
 * =====================================
 * Détermine si une colonne contient des relations many-to-many
 *
 * CRITÈRES DE DÉTECTION :
 * ======================
 * 1. Nom de colonne dans la liste d'ignorés → NON
 * 2. Contient des virgules (séparateur de listes) → OUI
 * 3. Pattern de nom type "PSM-Insights" → OUI
 * 4. Pattern de nom type "table_id" ou "table_ids" → OUI
 *
 * @param {string} columnName - Nom de la colonne à analyser
 * @param {string[]} sampleValues - Échantillon de valeurs (20 premières lignes)
 * @returns {boolean} - true si c'est une colonne de relations
 */
function isRelationColumn(columnName, sampleValues) {
  // Étape 1: Ignorer les colonnes système et de données simples
  const lowerName = columnName.toLowerCase();
  if (CONFIG.ignoreColumns.some(ignored => lowerName.includes(ignored))) {
    return false;
  }

  // Étape 2: Analyser les valeurs - chercher des virgules (séparateur de listes)
  const hasCommas = sampleValues.some(v =>
    v && typeof v === 'string' && v.includes(',')
  );

  // Étape 3: Analyser le nom - patterns qui indiquent des relations
  const looksLikeTableRef = CONFIG.detection.relationPatterns.some(pattern =>
    pattern.test(columnName)
  );

  // Étape 4: Décision finale
  return hasCommas || looksLikeTableRef;
}

/**
 * 🎯 DÉVINER LA TABLE CIBLE D'UNE RELATION
 * =======================================
 * Essaie de deviner quelle table PostgreSQL correspond à une colonne de relation
 *
 * STRATÉGIE DE RECHERCHE :
 * =======================
 * 1. Nettoyer le nom de la colonne (sanitizeName)
 * 2. Chercher correspondance exacte avec les tables disponibles
 * 3. Chercher correspondance partielle (inclusion mutuelle)
 * 4. Retourner null si aucune correspondance trouvée
 *
 * EXEMPLES :
 * ==========
 * "PSM-Insights" → "psm_insights"
 * "Actionalisation-objectives" → "actionalisation_obje" (si table existe)
 * "user_id" → "user" (si table user existe)
 *
 * @param {string} columnName - Nom de la colonne relation
 * @param {string[]} availableTables - Liste des tables PostgreSQL disponibles
 * @returns {string|null} - Nom de la table cible ou null
 */
function guessTargetTable(columnName, availableTables) {
  const cleanName = sanitizeName(columnName);

  // Stratégie 1: Correspondance exacte
  if (availableTables.includes(cleanName)) {
    return cleanName;
  }

  // Stratégie 2: Correspondance partielle (inclusion)
  for (const table of availableTables) {
    // Si le nom nettoyé contient le nom de table, ou inversement
    if (cleanName.includes(table) || table.includes(cleanName)) {
      return table;
    }
  }

  // Stratégie 3: Supprimer les suffixes courants des relations
  const withoutSuffix = cleanName.replace(/_id[s]?$/, '');
  if (withoutSuffix !== cleanName && availableTables.includes(withoutSuffix)) {
    return withoutSuffix;
  }

  return null;
}

/**
 * ✂️ PARSING DES LISTES DE RELATIONS
 * ===================================
 * Décompose une valeur contenant plusieurs éléments séparés par des virgules
 *
 * FORMAT ATTENDU :
 * ================
 * "Valeur 1,Valeur 2,Valeur 3" → ["Valeur 1", "Valeur 2", "Valeur 3"]
 *
 * NETTOYAGE APPLIQUÉ :
 * ====================
 * - Trim des espaces autour de chaque valeur
 * - Filtrage des valeurs vides
 * - Conservation des virgules à l'intérieur des guillemets
 *
 * @param {string} value - Valeur à parser
 * @returns {string[]} - Tableau des valeurs nettoyées
 */
function parseRelationList(value) {
  if (!value || typeof value !== 'string') return [];

  // Étape 1: Séparer par virgule
  const parts = value.split(',');

  // Étape 2: Nettoyer chaque partie
  return parts
    .map(v => v.trim())           // Supprimer espaces
    .filter(v => v && v.length > 0); // Supprimer vides
}

// ============================================
// ANALYSE DES RELATIONS
// ============================================

function analyzeRelations(databases) {
  console.log('\n🔍 Analyse des relations Many-to-Many...\n');
  
  const relations = [];
  
  for (const db of databases) {
    console.log(`📊 ${db.name}:`);
    
    for (const header of db.headers) {
      const sampleValues = db.rows.slice(0, 20).map(row => row[header]);
      
      if (isRelationColumn(header, sampleValues)) {
        const targetTable = guessTargetTable(header, databases.map(d => d.sqlName));
        
        if (targetTable) {
          const relation = {
            sourceTable: db.sqlName,
            sourceColumn: sanitizeName(header),
            targetTable: targetTable,
            originalColumn: header,
            sourceDbName: db.name,
            hasData: sampleValues.some(v => v && v.trim())
          };
          
          relations.push(relation);
          console.log(`  ✓ ${header} → ${targetTable}`);
        } else {
          console.log(`  ⚠️  ${header} (cible inconnue, stocké en TEXT)`);
        }
      }
    }
  }
  
  console.log(`\n✅ ${relations.length} relations détectées\n`);
  return relations;
}

// ============================================
// GÉNÉRATION SQL
// ============================================

function generateJunctionTables(relations) {
  let sql = '';
  
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `-- TABLES DE JONCTION MANY-TO-MANY\n`;
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  const createdJunctions = new Set();
  
  for (const rel of relations) {
    // Nom de la junction (ordre alphabétique pour éviter doublons)
    const tables = [rel.sourceTable, rel.targetTable].sort();
    const junctionName = `${tables[0]}_${tables[1]}`;
    
    // Skip si déjà créée
    if (createdJunctions.has(junctionName)) continue;
    createdJunctions.add(junctionName);
    
    sql += `-- Junction: ${rel.sourceTable} <-> ${rel.targetTable}\n`;
    sql += `DROP TABLE IF EXISTS ${CONFIG.schema}.${junctionName} CASCADE;\n\n`;
    
    sql += `CREATE TABLE ${CONFIG.schema}.${junctionName} (\n`;
    sql += `  ${tables[0]}_id UUID NOT NULL,\n`;
    sql += `  ${tables[1]}_id UUID NOT NULL,\n`;
    sql += `  created_at TIMESTAMPTZ DEFAULT NOW(),\n`;
    sql += `  PRIMARY KEY (${tables[0]}_id, ${tables[1]}_id),\n`;
    sql += `  FOREIGN KEY (${tables[0]}_id) REFERENCES ${CONFIG.schema}.${tables[0]}(id) ON DELETE CASCADE,\n`;
    sql += `  FOREIGN KEY (${tables[1]}_id) REFERENCES ${CONFIG.schema}.${tables[1]}(id) ON DELETE CASCADE\n`;
    sql += `);\n\n`;
    
    // Index pour performance
    sql += `CREATE INDEX idx_${junctionName}_${tables[0]} ON ${CONFIG.schema}.${junctionName}(${tables[0]}_id);\n`;
    sql += `CREATE INDEX idx_${junctionName}_${tables[1]} ON ${CONFIG.schema}.${junctionName}(${tables[1]}_id);\n\n`;
    
    sql += `COMMENT ON TABLE ${CONFIG.schema}.${junctionName} IS 'Many-to-many: ${rel.sourceDbName} <-> ${rel.targetTable}';\n\n`;
  }
  
  return sql;
}

function generateRelationInserts(relations, databases) {
  let sql = '';
  
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `-- POPULATION DES RELATIONS\n`;
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  for (const rel of relations) {
    if (!rel.hasData) continue;
    
    const sourceDb = databases.find(db => db.sqlName === rel.sourceTable);
    if (!sourceDb) continue;
    
    const targetDb = databases.find(db => db.sqlName === rel.targetTable);
    if (!targetDb) continue;
    
    const tables = [rel.sourceTable, rel.targetTable].sort();
    const junctionName = `${tables[0]}_${tables[1]}`;
    
    sql += `-- Relation: ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}\n`;
    
    // ✅ NOUVEAU : Créer un Set des IDs valides pour validation rapide
    const validSourceIds = new Set(sourceDb.rows.map(r => r['Id']).filter(Boolean));
    const validTargetIds = new Set(targetDb.rows.map(r => r['Id']).filter(Boolean));
    
    const links = [];
    let skippedInvalidSource = 0;
    let skippedInvalidTarget = 0;
    let skippedNotFound = 0;
    
    // Pour chaque ligne source
    for (const sourceRow of sourceDb.rows) {
      const sourceId = sourceRow['Id'];
      if (!sourceId) continue;
      
      // ✅ Vérifier que le source ID existe vraiment
      if (!validSourceIds.has(sourceId)) {
        skippedInvalidSource++;
        continue;
      }
      
      const relationValue = sourceRow[rel.originalColumn];
      if (!relationValue) continue;
      
      const targetNames = parseRelationList(relationValue);
      
      // Pour chaque nom cible, trouver l'ID correspondant
      for (const targetName of targetNames) {
        const targetRow = targetDb.rows.find(row => {
          const name = row['Name'] || row['name'];
          return name && name.trim().toLowerCase() === targetName.toLowerCase();
        });
        
        if (!targetRow || !targetRow['Id']) {
          skippedNotFound++;
          continue;
        }
        
        // ✅ Vérifier que le target ID existe vraiment
        if (!validTargetIds.has(targetRow['Id'])) {
          skippedInvalidTarget++;
          continue;
        }
        
        // ✅ Vérifier les doublons
        const linkKey = `${sourceId}:${targetRow['Id']}`;
        if (!links.some(l => `${l.sourceId}:${l.targetId}` === linkKey)) {
          links.push({
            sourceId,
            targetId: targetRow['Id']
          });
        }
      }
    }
    
    if (links.length === 0) {
      sql += `-- Aucun lien valide trouvé`;
      if (skippedInvalidSource > 0) sql += ` (${skippedInvalidSource} source IDs invalides)`;
      if (skippedInvalidTarget > 0) sql += ` (${skippedInvalidTarget} target IDs invalides)`;
      if (skippedNotFound > 0) sql += ` (${skippedNotFound} non trouvés)`;
      sql += `\n\n`;
      continue;
    }
    
    // ✅ NOUVEAU : Générer INSERT SELECT au lieu de INSERT VALUES
    // Cela vérifie l'existence des IDs directement dans la base de données
    sql += `-- Insérer seulement si les deux IDs existent dans les tables\n`;
    sql += `INSERT INTO ${CONFIG.schema}.${junctionName} (${tables[0]}_id, ${tables[1]}_id)\n`;
    sql += `SELECT * FROM (VALUES\n`;
    
    const values = links.map((link, idx) => {
      const isLast = idx === links.length - 1;
      return `  ('${link.sourceId}'::UUID, '${link.targetId}'::UUID)${isLast ? '' : ','}`;
    });
    
    sql += values.join('\n');
    sql += `\n) AS candidate_links(${tables[0]}_id, ${tables[1]}_id)\n`;
    sql += `WHERE EXISTS (\n`;
    sql += `  SELECT 1 FROM ${CONFIG.schema}.${tables[0]} WHERE id = candidate_links.${tables[0]}_id\n`;
    sql += `)\n`;
    sql += `AND EXISTS (\n`;
    sql += `  SELECT 1 FROM ${CONFIG.schema}.${tables[1]} WHERE id = candidate_links.${tables[1]}_id\n`;
    sql += `)\n`;
    sql += `ON CONFLICT (${tables[0]}_id, ${tables[1]}_id) DO NOTHING;\n\n`;
    
    let logMsg = `  ✓ ${rel.sourceColumn}: ${links.length} liens candidats`;
    if (skippedInvalidSource > 0 || skippedInvalidTarget > 0 || skippedNotFound > 0) {
      logMsg += ` (skipped in CSV: `;
      const skips = [];
      if (skippedInvalidSource > 0) skips.push(`${skippedInvalidSource} src`);
      if (skippedInvalidTarget > 0) skips.push(`${skippedInvalidTarget} tgt`);
      if (skippedNotFound > 0) skips.push(`${skippedNotFound} notfound`);
      logMsg += skips.join(', ') + ')';
    }
    console.log(logMsg);
  }
  
  return sql;
}

// ============================================
// MAIN
// ============================================

function main() {
  console.log('━'.repeat(80));
  console.log('🔗 RELATION BUILDER - Création des tables de jonction');
  console.log('━'.repeat(80));
  console.log(`📂 Source: ${CONFIG.importantDir}`);
  console.log(`📄 Output: ${CONFIG.outputSQL}`);
  console.log(`🗂️  Schéma: ${CONFIG.schema}`);
  console.log('━'.repeat(80));
  
  // 1. Charger tous les CSV
  const databases = [];
  const folders = fs.readdirSync(CONFIG.importantDir)
    .filter(name => {
      const fullPath = path.join(CONFIG.importantDir, name);
      return fs.statSync(fullPath).isDirectory();
    });
  
  for (const folder of folders) {
    const folderPath = path.join(CONFIG.importantDir, folder);
    const files = fs.readdirSync(folderPath);
    const csvFile = files.find(f => f.endsWith('.csv'));
    
    if (!csvFile) continue;
    
    const csvPath = path.join(folderPath, csvFile);
    const { headers, rows } = parseCSV(csvPath);
    
    if (headers.length === 0 || rows.length === 0) continue;
    
    databases.push({
      name: folder,
      sqlName: sanitizeName(folder),
      headers,
      rows,
      csvPath
    });
  }
  
  console.log(`\n📊 ${databases.length} tables chargées\n`);
  
  // 2. Analyser les relations
  const relations = analyzeRelations(databases);
  
  if (relations.length === 0) {
    console.log('⚠️  Aucune relation détectée !');
    process.exit(0);
  }
  
  // 3. Générer le SQL
  console.log('━'.repeat(80));
  console.log('📝 Génération du SQL...\n');
  
  let sql = '';
  
  // Header
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `-- RELATIONS MANY-TO-MANY - Fibery → Supabase\n`;
  sql += `-- Généré le: ${new Date().toISOString()}\n`;
  sql += `-- Relations: ${relations.length}\n`;
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  sql += `SET search_path TO ${CONFIG.schema}, public;\n\n`;
  
  // Tables de jonction
  sql += generateJunctionTables(relations);
  
  // Population des relations
  sql += generateRelationInserts(relations, databases);
  
  // Footer
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `-- FIN DES RELATIONS\n`;
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  sql += `RESET search_path;\n`;
  
  // Sauvegarder
  fs.writeFileSync(CONFIG.outputSQL, sql, 'utf8');
  
  const fileSize = (fs.statSync(CONFIG.outputSQL).size / 1024).toFixed(1);
  
  console.log('\n━'.repeat(80));
  console.log('✅ RELATIONS SQL GÉNÉRÉES !');
  console.log('━'.repeat(80));
  console.log(`📄 Fichier: ${CONFIG.outputSQL}`);
  console.log(`📊 Taille: ${fileSize} KB`);
  console.log(`\n🚀 PROCHAINES ÉTAPES:`);
  console.log(`  1. Exécutez d'abord migration-complete.sql dans Supabase`);
  console.log(`  2. Puis exécutez ${CONFIG.outputSQL}`);
  console.log(`  3. Vos relations seront opérationnelles !`);
  console.log('━'.repeat(80));
}

try {
  main();
} catch (error) {
  console.error('\n❌ ERREUR:', error.message);
  console.error(error.stack);
  process.exit(1);
}