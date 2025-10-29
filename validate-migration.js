#!/usr/bin/env node
/**
 * ========================================================================
 * VALIDATION MIGRATION - Comparaison Fibery vs Supabase
 * ========================================================================
 * Compare les données exportées de Fibery avec les tables Supabase
 * pour vérifier l'intégrité de la migration.
 *
 * Exécution:
 *   node validate-migration.js
 *
 * Prérequis:
 *   npm install @supabase/supabase-js
 *   Variables d'environnement: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const fs = require('fs');
const path = require('path');

// ========================
// Configuration
// ========================
const CONFIG = {
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  schema: 'psm_root'
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
// Helpers réutilisés
// ========================

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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ========================
// Supabase client
// ========================

let supabase = null;

async function initSupabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    if (!CONFIG.supabase.url || !CONFIG.supabase.serviceKey) {
      throw new Error('Variables d\'environnement SUPABASE_URL et SUPABASE_SERVICE_KEY requises');
    }
    
    supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceKey);
    
    // Test de connexion
    const { data, error } = await supabase.from('_test_connection').select('*').limit(1);
    if (error && !error.message.includes('relation "_test_connection" does not exist')) {
      throw error;
    }
    
    console.log(`${c('green', '✅')} Connexion Supabase établie`);
    return true;
  } catch (error) {
    console.error(`${c('red', '❌')} Erreur connexion Supabase:`, error.message);
    return false;
  }
}

async function getTableRowCount(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error(`${c('yellow', '⚠️')} Erreur comptage ${tableName}:`, error.message);
    return null;
  }
}

async function getTableWithDescriptions(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('id, description_content')
      .not('description_content', 'is', null);
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error(`${c('yellow', '⚠️')} Erreur descriptions ${tableName}:`, error.message);
    return [];
  }
}

// ========================
// Validation principale
// ========================

async function validateTable(dbFolder, dbName) {
  const files = fs.readdirSync(dbFolder);
  const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
  
  if (!csvFile) {
    return {
      table: dbName,
      csvRows: 0,
      supabaseRows: 0,
      descriptions: 0,
      status: 'no_csv',
      completeness: 0
    };
  }
  
  const csvPath = path.join(dbFolder, csvFile);
  const { headers, rows } = parseCSV(csvPath);
  const csvRows = rows.length;
  
  const tableName = sanitizeName(dbName);
  const supabaseRows = await getTableRowCount(tableName);
  
  if (supabaseRows === null) {
    return {
      table: dbName,
      csvRows,
      supabaseRows: 0,
      descriptions: 0,
      status: 'error',
      completeness: 0
    };
  }
  
  // Compter les descriptions
  const descriptionsData = await getTableWithDescriptions(tableName);
  const descriptions = descriptionsData.length;
  
  const completeness = csvRows > 0 ? Math.round((supabaseRows / csvRows) * 100) : 0;
  
  let status = 'success';
  if (completeness === 0) status = 'failed';
  else if (completeness < 100) status = 'partial';
  
  return {
    table: dbName,
    tableName,
    csvRows,
    supabaseRows,
    descriptions,
    status,
    completeness
  };
}

async function main() {
  console.log(''.padEnd(80, '━'));
  console.log(`🔍 ${c('bold', 'VALIDATION MIGRATION - Fibery vs Supabase')}`);
  console.log(''.padEnd(80, '━'));
  console.log(`📂 Source: ${c('cyan', CONFIG.importantDir)}`);
  console.log(`🗄️  Supabase: ${c('cyan', CONFIG.supabase.url || 'Non configuré')}`);
  
  // Vérifier le dossier Important
  if (!fs.existsSync(CONFIG.importantDir)) {
    console.error(`${c('red', '❌ ERREUR')} Dossier introuvable: ${CONFIG.importantDir}`);
    process.exit(1);
  }
  
  // Initialiser Supabase
  const supabaseConnected = await initSupabase();
  if (!supabaseConnected) {
    console.error(`${c('red', '❌')} Impossible de se connecter à Supabase. Arrêt.`);
    process.exit(1);
  }
  
  // Lister les bases de données
  const databases = fs.readdirSync(CONFIG.importantDir)
    .filter(name => {
      const fullPath = path.join(CONFIG.importantDir, name);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();
  
  console.log(`\n📊 ${databases.length} bases à valider:\n`);
  
  const validationResults = [];
  let totalCsvRows = 0;
  let totalSupabaseRows = 0;
  let totalDescriptions = 0;
  let successCount = 0;
  let partialCount = 0;
  let failedCount = 0;
  
  // Valider chaque table
  for (const db of databases) {
    const dbFolder = path.join(CONFIG.importantDir, db);
    const result = await validateTable(dbFolder, db);
    validationResults.push(result);
    
    totalCsvRows += result.csvRows;
    totalSupabaseRows += result.supabaseRows;
    totalDescriptions += result.descriptions;
    
    if (result.status === 'success') successCount++;
    else if (result.status === 'partial') partialCount++;
    else if (result.status === 'failed') failedCount++;
    
    // Afficher le résultat
    const statusIcon = result.status === 'success' ? c('green', '✅') :
                      result.status === 'partial' ? c('yellow', '⚠️') :
                      result.status === 'error' ? c('red', '❌') : c('dim', '⏭️');
    
    const statusText = result.status === 'success' ? '100%' :
                      result.status === 'partial' ? `${result.completeness}%` :
                      result.status === 'error' ? 'ERREUR' : 'SKIP';
    
    const missingText = result.csvRows > result.supabaseRows ? 
      ` - ${result.csvRows - result.supabaseRows} manquante(s)` : '';
    
    console.log(`${statusIcon} ${db}: ${statusText} (${result.supabaseRows}/${result.csvRows} lignes)${missingText}`);
  }
  
  // Générer le rapport
  const report = {
    generatedAt: new Date().toISOString(),
    importantDir: CONFIG.importantDir,
    supabaseUrl: CONFIG.supabase.url,
    totals: {
      tables: databases.length,
      csvRows: totalCsvRows,
      supabaseRows: totalSupabaseRows,
      descriptions: totalDescriptions,
      success: successCount,
      partial: partialCount,
      failed: failedCount
    },
    tables: validationResults
  };
  
  ensureDir('./output');
  const reportPath = path.join('./output', 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  
  // Résumé final
  console.log('\n' + ''.padEnd(80, '─'));
  console.log(`${c('bold', '📊 RÉSUMÉ DE LA VALIDATION')}`);
  console.log(''.padEnd(80, '─'));
  console.log(`📦 Tables totales: ${c('bold', databases.length)}`);
  console.log(`📄 Lignes CSV: ${c('cyan', totalCsvRows.toLocaleString())}`);
  console.log(`🗄️  Lignes Supabase: ${c('cyan', totalSupabaseRows.toLocaleString())}`);
  console.log(`📝 Descriptions: ${c('cyan', totalDescriptions.toLocaleString())}`);
  console.log(`\n${c('green', '✅')} Succès: ${c('bold', successCount)} | ${c('yellow', '⚠️')} Partiel: ${c('bold', partialCount)} | ${c('red', '❌')} Échec: ${c('bold', failedCount)}`);
  
  const overallCompleteness = totalCsvRows > 0 ? Math.round((totalSupabaseRows / totalCsvRows) * 100) : 0;
  console.log(`\n🎯 Complétude globale: ${c('bold', overallCompleteness + '%')}`);
  
  console.log('\n' + ''.padEnd(80, '━'));
  console.log(`💾 Rapport détaillé: ${c('cyan', reportPath)}`);
  console.log(''.padEnd(80, '━'));
}

// ========================
// Lancement
// ========================

try {
  main().catch(error => {
    console.error(`\n${c('red', '❌ ERREUR')} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
} catch (error) {
  console.error(`\n${c('red', '❌ ERREUR')} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
