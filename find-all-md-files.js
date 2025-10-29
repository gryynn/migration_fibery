#!/usr/bin/env node
/**
 * ========================================================================
 * FIND ALL MD FILES - Scan récursif des fichiers .md dans l'export Fibery
 * ========================================================================
 * Scanne récursivement le dossier Important/ pour trouver TOUS les fichiers
 * .md, analyse leur structure et génère un rapport détaillé.
 *
 * Exécution:
 *   node find-all-md-files.js
 */

const fs = require('fs');
const path = require('path');

// ========================
// Configuration
// ========================
const CONFIG = {
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',
  outputJSON: './output/all-md-files.json',
  previewLines: 3
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

function extractUuidFromPath(filePath) {
  // Chercher UUID dans le nom de fichier
  const fileName = path.basename(filePath, '.md');
  
  // Essayer le pattern UUID standard d'abord
  const parts = fileName.split(/[_\s-]+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (UUID_RE.test(part)) {
      return part;
    }
  }
  
  // Chercher UUID sans tirets (format compact) à la fin du nom
  // Pattern: nom_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 hex chars)
  const compactUuidMatch = fileName.match(/([0-9a-f]{32})$/i);
  if (compactUuidMatch) {
    // Convertir en format UUID standard
    const compact = compactUuidMatch[1];
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }
  
  // Chercher UUID dans le chemin du dossier parent
  const dirName = path.dirname(filePath);
  const dirParts = path.basename(dirName).split(/[_\s-]+/);
  for (let i = dirParts.length - 1; i >= 0; i--) {
    const part = dirParts[i];
    if (UUID_RE.test(part)) {
      return part;
    }
  }
  
  // Chercher UUID compact dans le nom du dossier parent
  const dirBaseName = path.basename(dirName);
  const dirCompactMatch = dirBaseName.match(/([0-9a-f]{32})$/i);
  if (dirCompactMatch) {
    const compact = dirCompactMatch[1];
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }
  
  return null;
}

function detectYamlFrontmatter(content) {
  const lines = content.split('\n');
  if (lines.length > 0 && lines[0].trim() === '---') {
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        endIndex = i;
        break;
      }
    }
    if (endIndex > 0) {
      return {
        hasFrontmatter: true,
        frontmatterLines: endIndex + 1,
        frontmatter: lines.slice(1, endIndex).join('\n')
      };
    }
  }
  return { hasFrontmatter: false, frontmatterLines: 0, frontmatter: null };
}

function getPreviewLines(content, maxLines = 3) {
  const lines = content.split('\n');
  return lines.slice(0, maxLines).map(l => l.trim()).filter(l => l.length > 0).slice(0, maxLines);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ========================
// Scan récursif
// ========================

function scanDirectory(dirPath, baseDir) {
  const mdFiles = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (entry.isDirectory()) {
        // Récursion
        const subMdFiles = scanDirectory(fullPath, baseDir);
        mdFiles.push(...subMdFiles);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        // Fichier .md trouvé
        try {
          const stats = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          const fileName = entry.name;
          const fileNameBase = path.parse(fileName).name;
          const parentDir = path.dirname(relativePath);
          const parentDirName = path.basename(path.dirname(fullPath));
          
          // Extraire UUID si présent
          const uuid = extractUuidFromPath(fullPath);
          
          // Détecter YAML frontmatter
          const yamlInfo = detectYamlFrontmatter(content);
          
          // Aperçu du contenu
          const preview = getPreviewLines(content, CONFIG.previewLines);
          
          // Analyser le pattern du nom
          let namePattern = 'unknown';
          if (uuid) {
            if (fileNameBase === uuid) {
              namePattern = 'uuid-only';
            } else if (fileNameBase.includes(uuid)) {
              namePattern = 'name-uuid';
            } else {
              namePattern = 'uuid-in-path';
            }
          } else {
            // Pas d'UUID, analyser le pattern
            if (/^[A-Z]/i.test(fileNameBase)) {
              namePattern = 'name-only';
            } else if (/^[0-9]/.test(fileNameBase)) {
              namePattern = 'numeric-id';
            } else {
              namePattern = 'other';
            }
          }
          
          mdFiles.push({
            path: relativePath,
            fullPath: fullPath,
            fileName: fileName,
            fileNameBase: fileNameBase,
            parentDir: parentDir,
            parentDirName: parentDirName,
            size: stats.size,
            sizeKB: (stats.size / 1024).toFixed(2),
            uuid: uuid,
            namePattern: namePattern,
            hasYamlFrontmatter: yamlInfo.hasFrontmatter,
            preview: preview,
            lineCount: content.split('\n').length,
            isEmpty: content.trim().length === 0
          });
        } catch (error) {
          console.error(`${c('red', '⚠️')} Erreur lecture ${relativePath}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`${c('red', '⚠️')} Erreur scan ${dirPath}: ${error.message}`);
  }
  
  return mdFiles;
}

// ========================
// Analyse et regroupement
// ========================

function analyzeMdFiles(mdFiles) {
  const analysis = {
    total: mdFiles.length,
    byTable: {},
    byPattern: {},
    byLocation: {},
    statistics: {
      withUuid: 0,
      withoutUuid: 0,
      withYaml: 0,
      empty: 0,
      totalSize: 0,
      averageSize: 0
    }
  };
  
  // Regrouper par table (dossier parent principal)
  for (const file of mdFiles) {
    const parts = file.parentDir.split(path.sep);
    const tableName = parts[0] || 'root';
    
    if (!analysis.byTable[tableName]) {
      analysis.byTable[tableName] = {
        count: 0,
        files: [],
        totalSize: 0,
        patterns: {}
      };
    }
    
    analysis.byTable[tableName].count++;
    analysis.byTable[tableName].files.push(file.fileName);
    analysis.byTable[tableName].totalSize += file.size;
    
    if (!analysis.byTable[tableName].patterns[file.namePattern]) {
      analysis.byTable[tableName].patterns[file.namePattern] = 0;
    }
    analysis.byTable[tableName].patterns[file.namePattern]++;
    
    // Par pattern
    if (!analysis.byPattern[file.namePattern]) {
      analysis.byPattern[file.namePattern] = 0;
    }
    analysis.byPattern[file.namePattern]++;
    
    // Par emplacement
    const location = file.parentDirName === 'descriptions' ? 'descriptions' : 
                    file.parentDirName === file.fileNameBase ? 'entity-folder' : 'other';
    if (!analysis.byLocation[location]) {
      analysis.byLocation[location] = 0;
    }
    analysis.byLocation[location]++;
    
    // Statistiques globales
    if (file.uuid) analysis.statistics.withUuid++;
    else analysis.statistics.withoutUuid++;
    
    if (file.hasYamlFrontmatter) analysis.statistics.withYaml++;
    if (file.isEmpty) analysis.statistics.empty++;
    
    analysis.statistics.totalSize += file.size;
  }
  
  // Moyenne
  analysis.statistics.averageSize = analysis.total > 0 ? 
    Math.round(analysis.statistics.totalSize / analysis.total) : 0;
  
  return analysis;
}

function generateSuggestions(analysis) {
  const suggestions = [];
  
  if (analysis.statistics.withUuid > analysis.statistics.withoutUuid) {
    suggestions.push('📌 Majorité des fichiers ont un UUID → Utiliser UUID pour l\'association');
  } else {
    suggestions.push('📌 Peu d\'UUIDs trouvés → Utiliser le nom de fichier pour l\'association');
  }
  
  if (analysis.byLocation['descriptions']) {
    suggestions.push('📁 Descriptions organisées dans des dossiers "descriptions/" → Chercher dans ces dossiers');
  }
  
  if (analysis.byLocation['entity-folder']) {
    suggestions.push('📁 Descriptions dans des dossiers par entité → Scanner les sous-dossiers');
  }
  
  if (analysis.byPattern['name-uuid']) {
    suggestions.push('🔍 Pattern "nom-entité_uuid.md" détecté → Extraire UUID de la fin du nom');
  }
  
  if (analysis.byPattern['uuid-only']) {
    suggestions.push('🔍 Pattern "uuid.md" détecté → Utiliser directement le nom de fichier comme UUID');
  }
  
  return suggestions;
}

// ========================
// Main
// ========================

function main() {
  console.log(''.padEnd(80, '━'));
  console.log(`🔍 ${c('bold', 'SCAN RÉCURSIF DES FICHIERS .md')}`);
  console.log(''.padEnd(80, '━'));
  console.log(`📂 Dossier source: ${c('cyan', CONFIG.importantDir)}`);
  console.log(`📄 Rapport: ${c('cyan', CONFIG.outputJSON)}`);
  
  if (!fs.existsSync(CONFIG.importantDir)) {
    console.error(`${c('red', '❌ ERREUR')} Dossier introuvable: ${CONFIG.importantDir}`);
    process.exit(1);
  }
  
  console.log(`\n🔎 Scan récursif en cours...`);
  
  const startTime = Date.now();
  const mdFiles = scanDirectory(CONFIG.importantDir, CONFIG.importantDir);
  const scanTime = Date.now() - startTime;
  
  console.log(`✅ ${c('green', mdFiles.length)} fichiers .md trouvés en ${scanTime}ms`);
  
  console.log(`\n📊 Analyse des patterns...`);
  const analysis = analyzeMdFiles(mdFiles);
  
  // Afficher les résultats
  console.log('\n' + ''.padEnd(80, '─'));
  console.log(`${c('bold', '📈 STATISTIQUES GLOBALES')}`);
  console.log(''.padEnd(80, '─'));
  console.log(`📄 Total fichiers .md: ${c('bold', analysis.total)}`);
  console.log(`🆔 Avec UUID: ${c('green', analysis.statistics.withUuid)} | Sans UUID: ${c('yellow', analysis.statistics.withoutUuid)}`);
  console.log(`📝 Avec YAML: ${c('cyan', analysis.statistics.withYaml)} | Vides: ${c('red', analysis.statistics.empty)}`);
  console.log(`💾 Taille totale: ${c('bold', (analysis.statistics.totalSize / 1024).toFixed(2))} KB`);
  console.log(`📊 Taille moyenne: ${c('bold', analysis.statistics.averageSize)} bytes`);
  
  console.log(`\n${c('bold', '📁 DISTRIBUTION PAR TABLE')}`);
  console.log(''.padEnd(80, '─'));
  const sortedTables = Object.entries(analysis.byTable)
    .sort((a, b) => b[1].count - a[1].count);
  
  for (const [table, stats] of sortedTables.slice(0, 10)) {
    const bar = '█'.repeat(Math.min(20, Math.floor(stats.count / analysis.total * 100)));
    console.log(`  ${c('cyan', table.padEnd(30))} ${bar} ${c('bold', stats.count)} fichiers`);
  }
  
  if (sortedTables.length > 10) {
    console.log(`  ... et ${c('dim', sortedTables.length - 10)} autres tables`);
  }
  
  console.log(`\n${c('bold', '🔍 PATTERNS DE NOMS DÉTECTÉS')}`);
  console.log(''.padEnd(80, '─'));
  for (const [pattern, count] of Object.entries(analysis.byPattern)) {
    const labels = {
      'uuid-only': 'UUID uniquement (ex: d47ec620-...md)',
      'name-uuid': 'Nom + UUID (ex: Entity_d47ec620-...md)',
      'uuid-in-path': 'UUID dans le chemin',
      'name-only': 'Nom uniquement (ex: Entity.md)',
      'numeric-id': 'ID numérique',
      'other': 'Autre pattern',
      'unknown': 'Pattern inconnu'
    };
    console.log(`  ${c('yellow', pattern.padEnd(20))} ${labels[pattern] || pattern}: ${c('bold', count)}`);
  }
  
  console.log(`\n${c('bold', '📍 ORGANISATION PAR EMPLACEMENT')}`);
  console.log(''.padEnd(80, '─'));
  for (const [location, count] of Object.entries(analysis.byLocation)) {
    const labels = {
      'descriptions': 'Dans dossier descriptions/',
      'entity-folder': 'Dans dossier par entité',
      'other': 'Autre emplacement'
    };
    console.log(`  ${c('magenta', location.padEnd(20))} ${labels[location] || location}: ${c('bold', count)}`);
  }
  
  const suggestions = generateSuggestions(analysis);
  if (suggestions.length > 0) {
    console.log(`\n${c('bold', '💡 SUGGESTIONS')}`);
    console.log(''.padEnd(80, '─'));
    suggestions.forEach(s => console.log(`  ${s}`));
  }
  
  // Exemples de fichiers
  console.log(`\n${c('bold', '📋 EXEMPLES DE FICHIERS')}`);
  console.log(''.padEnd(80, '─'));
  for (let i = 0; i < Math.min(5, mdFiles.length); i++) {
    const file = mdFiles[i];
    console.log(`  ${c('cyan', file.fileName)}`);
    console.log(`    📁 ${c('dim', file.parentDir)}`);
    if (file.uuid) {
      console.log(`    🆔 UUID: ${c('green', file.uuid)}`);
    }
    console.log(`    📊 Pattern: ${c('yellow', file.namePattern)} | Taille: ${c('bold', file.sizeKB)} KB`);
    if (file.preview.length > 0) {
      console.log(`    👁️  Aperçu: ${c('dim', file.preview[0].substring(0, 60))}...`);
    }
    console.log('');
  }
  
  // Générer le rapport JSON
  const report = {
    generatedAt: new Date().toISOString(),
    importantDir: CONFIG.importantDir,
    scanTime: scanTime,
    files: mdFiles,
    analysis: analysis,
    suggestions: suggestions
  };
  
  ensureDir('./output');
  fs.writeFileSync(CONFIG.outputJSON, JSON.stringify(report, null, 2), 'utf8');
  
  console.log(''.padEnd(80, '━'));
  console.log(`💾 Rapport complet: ${c('cyan', CONFIG.outputJSON)}`);
  console.log(''.padEnd(80, '━'));
}

try {
  main();
} catch (error) {
  console.error(`\n${c('red', '❌ ERREUR')} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
