#!/usr/bin/env node
/**
 * ========================================================================
 * DIAGNOSTIC MIGRATION - Analyse de l'export Fibery
 * ========================================================================
 * Scanne le dossier Important/ et produit un rapport des tables, stats, et
 * problèmes potentiels avant migration.
 *
 * Exécution:
 *   node diagnose-migration.js
 */

const fs = require('fs');
const path = require('path');

// ========================
// Configuration utilisateur
// ========================
const CONFIG = {
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',
  outputDir: './output'
};

// ========================
// Couleurs (sans dépendances)
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
// Réutilisation des fonctions du migrateur (même logique)
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

function guessPostgresType(value) {
  if (value === null || value === undefined || value === '') {
    return 'TEXT';
  }
  const str = String(value).trim();
  const booleanValues = ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'];
  if (booleanValues.includes(str.toLowerCase())) return 'BOOLEAN';
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(str)) return 'UUID';
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

// ========================
// Utilitaires diagnostics
// ========================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function findLikelyIdColumns(headers) {
  const lower = headers.map(h => h.toLowerCase());
  const candidates = [];
  lower.forEach((h, i) => {
    if (h === 'id' || h.endsWith(' id') || h.includes('uuid') || h.includes('fibery')) {
      candidates.push(headers[i]);
    }
  });
  // Always include exact sanitized id if present
  const hasId = headers.find(h => sanitizeName(h) === 'id');
  if (hasId && !candidates.includes(hasId)) candidates.push(hasId);
  return candidates.length ? candidates : headers.filter(h => sanitizeName(h) === 'id');
}

function findLikelyNameColumn(headers) {
  const score = (h) => {
    const l = h.toLowerCase();
    let s = 0;
    if (l === 'name') s += 3;
    if (l.includes('name')) s += 2;
    if (l.includes('title') || l.includes('libell')) s += 2;
    if (l.includes('nom')) s += 2;
    return s;
  };
  let best = headers[0] || null;
  let bestScore = -1;
  for (const h of headers) {
    const sc = score(h);
    if (sc > bestScore) { best = h; bestScore = sc; }
  }
  return best;
}

function detectColumnTypes(headers, rows) {
  const types = {};
  for (const header of headers) {
    const sample = rows.slice(0, 25).map(r => r[header]);
    const guesses = sample.map(v => guessPostgresType(v));
    const counts = {};
    for (const g of guesses) counts[g] = (counts[g] || 0) + 1;
    const majority = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, 'TEXT');
    types[header] = majority || 'TEXT';
  }
  return types;
}

function listMarkdownFiles(descriptionsDir) {
  if (!fs.existsSync(descriptionsDir)) return [];
  const files = fs.readdirSync(descriptionsDir).filter(f => f.toLowerCase().endsWith('.md'));
  return files.map(f => ({
    file: f,
    base: path.parse(f).name
  }));
}

function matchDescriptionsToRows(mdFiles, rows, idColumns, nameColumn) {
  const matchedMd = new Set();
  const matchedRows = new Set();
  const mdInfo = mdFiles.map(f => ({ ...f, uuid: extractUuidFromBase(f.base), baseLower: f.base.toLowerCase() }));

  // Map of row ids and names for quick matching
  const rowIds = new Set();
  const rowNames = new Set();
  for (const row of rows) {
    for (const idc of idColumns) {
      const v = (row[idc] || '').trim();
      if (UUID_RE.test(v)) rowIds.add(v.toLowerCase());
    }
    if (nameColumn) {
      const n = (row[nameColumn] || '').trim().toLowerCase();
      if (n) rowNames.add(n);
    }
  }

  for (const f of mdInfo) {
    let ok = false;
    if (f.uuid && rowIds.has(f.uuid.toLowerCase())) ok = true;
    if (!ok && nameColumn && rowNames.has(f.baseLower)) ok = true;
    if (ok) matchedMd.add(f.file);
  }

  // Match rows that have an md counterpart
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let ok = false;
    for (const idc of idColumns) {
      const v = (row[idc] || '').trim();
      if (UUID_RE.test(v)) {
        const byUuid = mdInfo.find(m => m.uuid && m.uuid.toLowerCase() === v.toLowerCase());
        if (byUuid) { ok = true; break; }
      }
    }
    if (!ok && nameColumn) {
      const n = (row[nameColumn] || '').trim().toLowerCase();
      if (n && mdInfo.find(m => m.baseLower === n)) ok = true;
    }
    if (ok) matchedRows.add(i);
  }

  const orphanMd = mdFiles.filter(f => !matchedMd.has(f.file)).map(f => f.file);
  const rowsWithoutMd = rows
    .map((_, idx) => idx)
    .filter(idx => !matchedRows.has(idx));

  return { orphanMd, rowsWithoutMd };
}

function extractUuidFromBase(base) {
  // Common pattern: "Name_uuid" or ends with UUID
  const parts = base.split(/[_\s-]+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (UUID_RE.test(p)) return p;
  }
  return null;
}

function detectProblems(headers, rows) {
  const problems = {
    invalidUUIDs: [],
    specialChars: [],
    suggestions: []
  };

  const idColumns = findLikelyIdColumns(headers);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const idc of idColumns) {
      const value = (row[idc] || '').trim();
      if (value && !UUID_RE.test(value)) {
        problems.invalidUUIDs.push({ rowIndex: i + 2, column: idc, value });
      }
    }
    for (const header of headers) {
      const v = row[header];
      if (v && (v.includes("'") || v.includes('"') || v.includes('\n'))) {
        problems.specialChars.push({ rowIndex: i + 2, column: header, hasQuote: /['"]/g.test(v), hasNewline: /\n/.test(v) });
      }
    }
  }

  if (problems.invalidUUIDs.length) {
    problems.suggestions.push('Vérifier/normaliser les colonnes Id/UUID; corriger les formats non conformes.');
  }
  if (problems.specialChars.length) {
    problems.suggestions.push('Nettoyer/échapper les guillemets et retours à la ligne dans les textes.');
  }

  return problems;
}

// ========================
// Scan principal
// ========================

function scanDatabaseFolder(dbFolder, dbName) {
  const files = fs.readdirSync(dbFolder);
  const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));
  const descriptionsDir = path.join(dbFolder, 'descriptions');

  const tableReport = {
    database: dbName,
    csvFile: csvFile || null,
    csvRows: 0,
    mdDescriptionsCount: 0,
    columns: [],
    types: {},
    problems: {},
    orphanMarkdown: [],
    rowsWithoutDescription: [],
    nameColumn: null,
    idColumns: []
  };

  if (!csvFile) {
    // No CSV, but still check markdown
    const mdFiles = listMarkdownFiles(descriptionsDir);
    tableReport.mdDescriptionsCount = mdFiles.length;
    tableReport.problems = { csvMissing: true };
    return tableReport;
  }

  const csvPath = path.join(dbFolder, csvFile);
  const { headers, rows } = parseCSV(csvPath);
  tableReport.csvRows = rows.length;
  tableReport.columns = headers;
  tableReport.types = detectColumnTypes(headers, rows);
  tableReport.idColumns = findLikelyIdColumns(headers);
  tableReport.nameColumn = findLikelyNameColumn(headers);

  const mdFiles = listMarkdownFiles(descriptionsDir);
  tableReport.mdDescriptionsCount = mdFiles.length;

  tableReport.problems = detectProblems(headers, rows);

  const { orphanMd, rowsWithoutMd } = matchDescriptionsToRows(mdFiles, rows, tableReport.idColumns, tableReport.nameColumn);
  tableReport.orphanMarkdown = orphanMd;
  tableReport.rowsWithoutDescription = rowsWithoutMd;

  if (orphanMd.length) {
    tableReport.problems.suggestions = tableReport.problems.suggestions || [];
    tableReport.problems.suggestions.push('Renommer les fichiers .md pour inclure l\'UUID ou le nom exact.');
  }
  if (rowsWithoutMd.length) {
    tableReport.problems.suggestions = tableReport.problems.suggestions || [];
    tableReport.problems.suggestions.push('Ajouter des descriptions .md manquantes pour les entités importantes.');
  }

  return tableReport;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  console.log(''.padEnd(80, '━'));
  console.log(`🧪  ${c('bold', 'DIAGNOSTIC MIGRATION - Fibery')}`);
  console.log(''.padEnd(80, '━'));
  console.log(`📂 Source: ${c('cyan', CONFIG.importantDir)}`);
  console.log(`📄 Rapport: ${c('cyan', path.join(CONFIG.outputDir, 'diagnostic-report.json'))}`);

  if (!fs.existsSync(CONFIG.importantDir)) {
    console.error(`${c('red', '❌ ERREUR')} Dossier introuvable: ${CONFIG.importantDir}`);
    process.exit(1);
  }

  const databases = fs.readdirSync(CONFIG.importantDir)
    .filter(name => {
      const full = path.join(CONFIG.importantDir, name);
      return fs.statSync(full).isDirectory();
    })
    .sort();

  console.log(`\n📊 Bases détectées: ${c('bold', databases.length)}\n`);
  databases.forEach((db, idx) => console.log(`  ${idx + 1}. ${db}`));

  const report = {
    generatedAt: new Date().toISOString(),
    importantDir: CONFIG.importantDir,
    databases: [],
    totals: {
      tables: 0,
      csvRows: 0,
      markdownDescriptions: 0,
      problems: {
        invalidUUIDs: 0,
        specialChars: 0,
        csvMissing: 0,
        orphanMarkdown: 0,
        rowsWithoutDescription: 0
      }
    },
    criticalProblems: []
  };

  for (const db of databases) {
    const dbFolder = path.join(CONFIG.importantDir, db);
    const table = scanDatabaseFolder(dbFolder, db);
    report.databases.push(table);
    report.totals.tables += 1;
    report.totals.csvRows += table.csvRows;
    report.totals.markdownDescriptions += table.mdDescriptionsCount;
    if (table.problems.csvMissing) report.totals.problems.csvMissing += 1;
    report.totals.problems.invalidUUIDs += (table.problems.invalidUUIDs || []).length;
    report.totals.problems.specialChars += (table.problems.specialChars || []).length;
    report.totals.problems.orphanMarkdown += (table.orphanMarkdown || []).length;
    report.totals.problems.rowsWithoutDescription += (table.rowsWithoutDescription || []).length;
  }

  // Construire la liste des problèmes critiques
  for (const t of report.databases) {
    if ((t.problems.invalidUUIDs || []).length) {
      report.criticalProblems.push({ database: t.database, type: 'invalidUUIDs', count: t.problems.invalidUUIDs.length });
    }
    if ((t.orphanMarkdown || []).length) {
      report.criticalProblems.push({ database: t.database, type: 'orphanMarkdown', count: t.orphanMarkdown.length });
    }
  }

  ensureDir(CONFIG.outputDir);
  const outPath = path.join(CONFIG.outputDir, 'diagnostic-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  // ===== Résumé console =====
  console.log('\n' + ''.padEnd(80, '─'));
  console.log(`🗂️  Tables analysées: ${c('bold', report.totals.tables)} | CSV lignes: ${c('bold', report.totals.csvRows)} | Descriptions .md: ${c('bold', report.totals.markdownDescriptions)}`);
  console.log(`⚠️  Problèmes: UUID invalides=${c('yellow', report.totals.problems.invalidUUIDs)}, Caractères spéciaux=${c('yellow', report.totals.problems.specialChars)}, .md orphelins=${c('yellow', report.totals.problems.orphanMarkdown)}, entités sans .md=${c('yellow', report.totals.problems.rowsWithoutDescription)}`);

  if (report.criticalProblems.length) {
    console.log(`\n${c('red', '🔥 Problèmes critiques:')}`);
    for (const p of report.criticalProblems) {
      const label = p.type === 'invalidUUIDs' ? 'UUID invalides' : '.md orphelins';
      console.log(`  • ${c('red', '❗')} ${tShort(p.database)} — ${label}: ${c('bold', p.count)}`);
    }
  } else {
    console.log(`\n${c('green', '✅ Aucun problème critique détecté')}`);
  }

  console.log('\n' + ''.padEnd(80, '━'));
  console.log(`💾 Rapport écrit dans: ${c('cyan', outPath)}  ${c('dim', '📝 JSON')}`);
  console.log(''.padEnd(80, '━'));
}

function tShort(name) {
  return name.length > 48 ? name.slice(0, 45) + '…' : name;
}

try {
  main();
} catch (err) {
  console.error(`\n${c('red', '❌ ERREUR')} ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}


