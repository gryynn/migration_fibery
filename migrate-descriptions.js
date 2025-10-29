#!/usr/bin/env node
/**
 * ========================================================================
 * MIGRATION DES DESCRIPTIONS (.md) → Supabase
 * ========================================================================
 * - Parcourt chaque base (sous-dossier de Important/)
 * - Cherche un dossier descriptions/ (si présent)
 * - Associe chaque .md à une entité via UUID (Id) ou Name
 * - Génère un SQL d'UPDATE pour stocker le contenu Markdown
 *
 * Exécution:
 *   node migrate-descriptions.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',
  schema: 'psm_root',
  outputSQL: './output/descriptions-migration.sql'
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
// Helpers réutilisés (même logique que csv-to-sql-migrator.js)
// ========================

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
  if (RESERVED_KEYWORDS.has(clean)) clean = '_' + clean;
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
  // TEXT/UUID/DATE/TIMESTAMPTZ → quotes
  const escaped = str.replace(/'/g, "''");
  return `'${escaped}'`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractUuidFromBase(base) {
  const parts = base.split(/[_\s-]+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (UUID_RE.test(p)) return p;
  }
  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildEntityIndexes(headers, rows) {
  const idCols = headers.filter(h => sanitizeName(h) === 'id');
  const nameCols = headers.filter(h => sanitizeName(h) === 'name');
  const byId = new Map();
  const byName = new Map();
  for (const row of rows) {
    for (const idc of idCols) {
      const v = (row[idc] || '').trim();
      if (UUID_RE.test(v)) byId.set(v.toLowerCase(), row);
    }
    for (const nc of nameCols) {
      const n = (row[nc] || '').trim().toLowerCase();
      if (n) byName.set(n, row);
    }
  }
  return { idCols, nameCols, byId, byName };
}

function generateSQLForDb(dbFolder, dbName) {
  const files = fs.readdirSync(dbFolder);
  const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
  const descriptionsDir = path.join(dbFolder, 'descriptions');

  if (!csvFile || !fs.existsSync(descriptionsDir)) {
    return { sql: '', found: 0, matched: 0, orphans: 0 };
  }

  const tableName = sanitizeName(dbName);
  const csvPath = path.join(dbFolder, csvFile);
  const { headers, rows } = parseCSV(csvPath);
  if (!headers.length || !rows.length) {
    return { sql: '', found: 0, matched: 0, orphans: 0 };
  }

  const { idCols, nameCols, byId, byName } = buildEntityIndexes(headers, rows);

  // Prepare column existence checks
  const hasId = idCols.length > 0; // implies sanitized 'id'
  const hasName = nameCols.length > 0; // implies sanitized 'name'

  let sql = '';
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `-- Descriptions pour ${dbName} → table ${CONFIG.schema}.${tableName}\n`;
  sql += `-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sql += `ALTER TABLE ${CONFIG.schema}.${tableName} ADD COLUMN IF NOT EXISTS description_content TEXT;\n\n`;

  const mdFiles = fs.readdirSync(descriptionsDir).filter(f => f.toLowerCase().endsWith('.md'));
  let found = 0;
  let matched = 0;
  let orphans = 0;

  for (const md of mdFiles) {
    found++;
    const mdPath = path.join(descriptionsDir, md);
    const base = path.parse(md).name;
    const content = fs.readFileSync(mdPath, 'utf8');

    const uuid = extractUuidFromBase(base);
    let row = null;
    let whereClause = '';

    if (uuid && byId.has(uuid.toLowerCase()) && hasId) {
      row = byId.get(uuid.toLowerCase());
      whereClause = `id = '${uuid}'`;
    } else if (!uuid && byName.has(base.toLowerCase()) && hasName) {
      row = byName.get(base.toLowerCase());
      // Use exact Name from row for equality to avoid case issues
      const rowName = row[nameCols[0]];
      whereClause = `name = ${escapeSQLValue(rowName, 'TEXT')}`;
    }

    if (!row) {
      orphans++;
      continue;
    }

    matched++;
    const escapedContent = escapeSQLValue(content, 'TEXT');
    sql += `UPDATE ${CONFIG.schema}.${tableName}\n`;
    sql += `SET description_content = ${escapedContent}\n`;
    sql += `WHERE ${whereClause};\n\n`;
  }

  if (matched === 0) {
    // Avoid emitting header if nothing matched
    return { sql: '', found, matched, orphans };
  }

  return { sql, found, matched, orphans };
}

function main() {
  console.log(''.padEnd(80, '━'));
  console.log(`📝 ${c('bold', 'MIGRATION DESCRIPTIONS (.md) → Supabase')}`);
  console.log(''.padEnd(80, '━'));
  console.log(`📂 Source: ${c('cyan', CONFIG.importantDir)}`);
  console.log(`📄 SQL: ${c('cyan', CONFIG.outputSQL)}`);

  const importantDirFixed = CONFIG.importantDir.replace(/\\/g, '\\\\');
  const importantPath = importantDirFixed.includes(':') ? CONFIG.importantDir : path.resolve(CONFIG.importantDir);

  if (!fs.existsSync(importantPath)) {
    console.error(`${c('red', '❌ ERREUR')} Dossier introuvable: ${CONFIG.importantDir}`);
    process.exit(1);
  }

  const databases = fs.readdirSync(importantPath)
    .filter(name => fs.statSync(path.join(importantPath, name)).isDirectory())
    .sort();

  console.log(`\n📊 Bases détectées: ${c('bold', databases.length)}\n`);
  databases.forEach((db, idx) => console.log(`  ${idx + 1}. ${db}`));

  let fullSQL = '';
  let totalFound = 0;
  let totalMatched = 0;
  let totalOrphans = 0;

  for (const db of databases) {
    const dbFolder = path.join(importantPath, db);
    const { sql, found, matched, orphans } = generateSQLForDb(dbFolder, db);
    totalFound += found;
    totalMatched += matched;
    totalOrphans += orphans;
    fullSQL += sql;
  }

  ensureDir(path.dirname(CONFIG.outputSQL));

  fs.writeFileSync(CONFIG.outputSQL, fullSQL, 'utf8');
  const sizeKb = (fs.statSync(CONFIG.outputSQL).size / 1024).toFixed(1);

  console.log('\n' + ''.padEnd(80, '─'));
  console.log(`📦 Descriptions trouvées: ${c('bold', totalFound)}  | 🔗 Associées: ${c('green', totalMatched)}  | 🧩 Orphelines: ${c('yellow', totalOrphans)}`);
  console.log(`📄 Fichier SQL: ${c('cyan', CONFIG.outputSQL)}  (${c('bold', sizeKb)} KB)`);
  console.log(''.padEnd(80, '━'));
}

try {
  main();
} catch (err) {
  console.error(`\n${c('red', '❌ ERREUR')} ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}


