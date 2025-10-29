#!/usr/bin/env node
/**
 * ========================================================================
 * ANALYSE DÉTAILLÉE TABLE PERMA - Détection des lignes manquantes
 * ========================================================================
 * Analyse en profondeur le CSV perma pour identifier pourquoi des lignes
 * ne sont pas migrées vers Supabase.
 *
 * Exécution:
 *   node analyze-perma-table.js
 */

const fs = require('fs');
const path = require('path');

// ========================
// Configuration
// ========================
const CONFIG = {
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',
  permaTablePath: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important\\PSM-PERMAV\\PSM-PERMAV.csv',
  outputDir: './output'
};

// ========================
// Couleurs console
// ========================
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};
const c = (color, s) => `${COLORS[color] || ''}${s}${COLORS.reset}`;

// ========================
// Utilitaires
// ========================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeName(name) {
  if (!name) return 'unnamed';
  let clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  clean = clean.replace(/[''`]/g, '_');
  clean = clean.replace(/[\s\-\./]+/g, '_');
  clean = clean.replace(/[^a-zA-Z0-9_]/g, '');
  clean = clean.toLowerCase();
  clean = clean.replace(/_+/g, '_');
  clean = clean.replace(/^_+|_+$/g, '');
  if (!clean) clean = 'unnamed';
  if (/^[0-9]/.test(clean)) clean = '_' + clean;
  if (clean.length > 63) clean = clean.substring(0, 63);
  return clean;
}

function guessPostgresType(value) {
  if (value === null || value === undefined || value === '') {
    return 'TEXT';
  }
  const str = String(value).trim();
  const booleanValues = ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'];
  if (booleanValues.includes(str.toLowerCase())) return 'BOOLEAN';
  if (UUID_RE.test(str)) return 'UUID';
  if (/^-?\d+$/.test(str)) return 'INTEGER';
  if (/^-?\d+\.\d+$/.test(str)) return 'NUMERIC(12,2)';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return 'DATE';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) return 'TIMESTAMPTZ';
  return 'TEXT';
}

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
      headers.forEach((header, idx) => { row[header] = values[idx]; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

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
      i++;
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

function escapeSQLValue(value, type) {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  const str = String(value);
  if (type === 'BOOLEAN') {
    const lower = str.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lower)) return 'TRUE';
    if (['false', '0', 'no', 'n'].includes(lower)) return 'FALSE';
    return 'NULL';
  }
  if (type === 'INTEGER' || type.startsWith('NUMERIC')) {
    const num = parseFloat(str);
    return isNaN(num) ? 'NULL' : String(num);
  }
  if (type === 'UUID' || type === 'DATE' || type === 'TIMESTAMPTZ' || type === 'TEXT') {
    const escaped = str.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  return 'NULL';
}

// ========================
// Analyse détaillée
// ========================

function analyzePermaTable() {
  console.log(''.padEnd(80, '━'));
  console.log(`🔍 ${c('bold', 'ANALYSE DÉTAILLÉE TABLE PERMA')}`);
  console.log(''.padEnd(80, '━'));
  console.log(`📂 CSV: ${c('cyan', CONFIG.permaTablePath)}`);
  
  if (!fs.existsSync(CONFIG.permaTablePath)) {
    console.error(`${c('red', '❌ ERREUR')} Fichier CSV introuvable: ${CONFIG.permaTablePath}`);
    process.exit(1);
  }

  // Lire le CSV
  console.log(`\n📖 Lecture du CSV...`);
  const { headers, rows } = parseCSV(CONFIG.permaTablePath);
  console.log(`  → ${c('green', headers.length)} colonnes, ${c('green', rows.length)} lignes`);

  // Détecter les types de colonnes
  const columnTypes = {};
  for (const header of headers) {
    const sample = rows.slice(0, 10).map(r => r[header]);
    const guesses = sample.map(v => guessPostgresType(v));
    const counts = {};
    for (const g of guesses) counts[g] = (counts[g] || 0) + 1;
    const majority = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, 'TEXT');
    columnTypes[header] = majority;
  }

  // Identifier les colonnes importantes
  const idColumns = headers.filter(h => {
    const clean = sanitizeName(h);
    return clean === 'id' || h.toLowerCase().includes('uuid') || h.toLowerCase().includes('fibery');
  });
  const nameColumn = headers.find(h => {
    const l = h.toLowerCase();
    return l === 'name' || l.includes('name') || l.includes('title') || l.includes('libell');
  });

  console.log(`  → Colonnes ID: ${c('yellow', idColumns.join(', ') || 'Aucune')}`);
  console.log(`  → Colonne nom: ${c('yellow', nameColumn || 'Aucune')}`);

  // Analyser chaque ligne
  console.log(`\n🔍 Analyse ligne par ligne...`);
  
  const analysis = {
    totalRows: rows.length,
    validRows: 0,
    problematicRows: [],
    allIds: [],
    sqlErrors: [],
    suggestions: []
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 car ligne 1 = headers
    const rowIssues = [];
    
    // Collecter tous les IDs
    for (const idCol of idColumns) {
      const id = row[idCol];
      if (id && id.trim()) {
        analysis.allIds.push({
          column: idCol,
          value: id.trim(),
          rowIndex: rowNum
        });
      }
    }

    // Vérifier les UUIDs
    for (const idCol of idColumns) {
      const value = (row[idCol] || '').trim();
      if (value && !UUID_RE.test(value)) {
        rowIssues.push({
          type: 'invalid_uuid',
          column: idCol,
          value: value,
          message: `UUID invalide: "${value}"`
        });
      }
    }

    // Vérifier les caractères spéciaux
    for (const header of headers) {
      const value = row[header];
      if (value && (value.includes("'") || value.includes('"') || value.includes('\n'))) {
        rowIssues.push({
          type: 'special_chars',
          column: header,
          value: value,
          hasQuote: /['"]/g.test(value),
          hasNewline: /\n/.test(value),
          message: `Caractères spéciaux détectés`
        });
      }
    }

    // Vérifier les valeurs manquantes dans les colonnes importantes
    if (nameColumn && (!row[nameColumn] || !row[nameColumn].trim())) {
      rowIssues.push({
        type: 'missing_name',
        column: nameColumn,
        message: 'Nom manquant'
      });
    }

    // Simuler l'insertion SQL
    try {
      const sqlValues = [];
      for (const header of headers) {
        const type = columnTypes[header];
        const value = escapeSQLValue(row[header], type);
        sqlValues.push(value);
      }
      
      // Test de génération SQL (sans exécuter)
      const sql = `INSERT INTO perma (${headers.map(h => sanitizeName(h)).join(', ')}) VALUES (${sqlValues.join(', ')});`;
      
      if (sql.length > 10000) { // Limite arbitraire
        rowIssues.push({
          type: 'sql_too_long',
          message: 'Requête SQL trop longue'
        });
      }
      
    } catch (error) {
      rowIssues.push({
        type: 'sql_generation_error',
        message: `Erreur génération SQL: ${error.message}`
      });
    }

    if (rowIssues.length > 0) {
      analysis.problematicRows.push({
        rowIndex: rowNum,
        issues: rowIssues,
        data: row
      });
    } else {
      analysis.validRows++;
    }
  }

  // Générer les suggestions
  if (analysis.problematicRows.length > 0) {
    analysis.suggestions.push(`Corriger ${analysis.problematicRows.length} lignes problématiques`);
  }
  
  const invalidUuids = analysis.problematicRows.filter(r => 
    r.issues.some(i => i.type === 'invalid_uuid')
  ).length;
  if (invalidUuids > 0) {
    analysis.suggestions.push(`Normaliser ${invalidUuids} UUIDs invalides`);
  }
  
  const specialChars = analysis.problematicRows.filter(r => 
    r.issues.some(i => i.type === 'special_chars')
  ).length;
  if (specialChars > 0) {
    analysis.suggestions.push(`Nettoyer ${specialChars} lignes avec caractères spéciaux`);
  }

  // Sauvegarder le rapport
  ensureDir(CONFIG.outputDir);
  const reportPath = path.join(CONFIG.outputDir, 'perma-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2), 'utf8');

  // Afficher le résumé
  console.log('\n' + ''.padEnd(80, '─'));
  console.log(`📊 ${c('bold', 'RÉSULTATS DE L\'ANALYSE')}`);
  console.log(''.padEnd(80, '─'));
  console.log(`✅ Lignes valides: ${c('green', analysis.validRows)}/${c('bold', analysis.totalRows)}`);
  console.log(`❌ Lignes problématiques: ${c('red', analysis.problematicRows.length)}`);
  console.log(`🆔 IDs collectés: ${c('cyan', analysis.allIds.length)}`);
  
  if (analysis.problematicRows.length > 0) {
    console.log(`\n${c('red', '🔥 PROBLÈMES DÉTECTÉS:')}`);
    
    const issuesByType = {};
    for (const row of analysis.problematicRows) {
      for (const issue of row.issues) {
        issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
      }
    }
    
    for (const [type, count] of Object.entries(issuesByType)) {
      const labels = {
        invalid_uuid: 'UUIDs invalides',
        special_chars: 'Caractères spéciaux',
        missing_name: 'Noms manquants',
        sql_too_long: 'SQL trop long',
        sql_generation_error: 'Erreurs SQL'
      };
      console.log(`  • ${c('red', '❗')} ${labels[type] || type}: ${c('bold', count)}`);
    }
    
    console.log(`\n${c('yellow', '📝 Exemples de lignes problématiques:')}`);
    for (let i = 0; i < Math.min(3, analysis.problematicRows.length); i++) {
      const row = analysis.problematicRows[i];
      console.log(`  Ligne ${row.rowIndex}: ${row.issues.map(i => i.message).join(', ')}`);
    }
  } else {
    console.log(`\n${c('green', '✅ Aucun problème détecté dans le CSV')}`);
  }

  if (analysis.suggestions.length > 0) {
    console.log(`\n${c('blue', '💡 SUGGESTIONS:')}`);
    analysis.suggestions.forEach(s => console.log(`  • ${s}`));
  }

  console.log('\n' + ''.padEnd(80, '━'));
  console.log(`💾 Rapport détaillé: ${c('cyan', reportPath)}`);
  console.log(''.padEnd(80, '━'));

  return analysis;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ========================
// Main
// ========================

try {
  const analysis = analyzePermaTable();
} catch (error) {
  console.error(`\n${c('red', '❌ ERREUR')} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
