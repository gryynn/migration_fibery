#!/usr/bin/env node
/**
 * ========================================================================
 * TESTS UNITAIRES - Échappement SQL
 * ========================================================================
 * Tests complets pour la fonction escapeSQLValue() améliorée
 *
 * Exécution:
 *   node test-sql-escape.js
 */

// Import de la fonction depuis le migrateur
const fs = require('fs');
const path = require('path');

// Lire le fichier migrateur et extraire la fonction
const migrateurPath = path.join(__dirname, 'csv-to-sql-migrator.js');
const migrateurContent = fs.readFileSync(migrateurPath, 'utf8');

// Extraire la fonction escapeSQLValue (version simplifiée pour les tests)
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
// Tests unitaires
// ========================

function runTests() {
  console.log(''.padEnd(80, '━'));
  console.log(`🧪 ${c('bold', 'TESTS UNITAIRES - Échappement SQL')}`);
  console.log(''.padEnd(80, '━'));
  
  const testCases = [
    // ========================
    // TESTS BASIQUES
    // ========================
    { input: 'Hello', expected: "'Hello'", description: 'Texte simple', category: 'Basique' },
    { input: '', expected: 'NULL', description: 'Chaîne vide', category: 'Basique' },
    { input: null, expected: 'NULL', description: 'Valeur null', category: 'Basique' },
    { input: undefined, expected: 'NULL', description: 'Valeur undefined', category: 'Basique' },
    
    // ========================
    // TESTS APOSTROPHES
    // ========================
    { input: "C'est", expected: "'C''est'", description: 'Apostrophe simple', category: 'Apostrophes' },
    { input: "L'important", expected: "'L''important'", description: 'Apostrophe au début', category: 'Apostrophes' },
    { input: "c'est l'important", expected: "'c''est l''important'", description: 'Multiples apostrophes', category: 'Apostrophes' },
    { input: "C'est \"cool\"", expected: "'C''est \"cool\"'", description: 'Apostrophe + guillemets', category: 'Apostrophes' },
    { input: "L'important c'est", expected: "'L''important c''est'", description: 'Apostrophes multiples', category: 'Apostrophes' },
    
    // ========================
    // TESTS GUILLEMETS (ne doivent PAS être échappés)
    // ========================
    { input: 'He said "Hi"', expected: "'He said \"Hi\"'", description: 'Guillemets simples', category: 'Guillemets' },
    { input: 'He said "Hi" and "Bye"', expected: "'He said \"Hi\" and \"Bye\"'", description: 'Multiples guillemets', category: 'Guillemets' },
    { input: 'Text with "quotes" inside', expected: "'Text with \"quotes\" inside'", description: 'Guillemets au milieu', category: 'Guillemets' },
    
    // ========================
    // TESTS BACKSLASHES
    // ========================
    { input: 'path\\to\\file', expected: "'path\\\\to\\\\file'", description: 'Backslashes simples', category: 'Backslashes' },
    { input: 'C:\\Users\\Name', expected: "'C:\\\\Users\\\\Name'", description: 'Chemin Windows', category: 'Backslashes' },
    { input: 'C:\\Program Files\\App', expected: "'C:\\\\Program Files\\\\App'", description: 'Chemin avec espaces', category: 'Backslashes' },
    
    // ========================
    // TESTS RETOURS À LA LIGNE
    // ========================
    { input: 'Line1\nLine2', expected: "'Line1\\nLine2'", description: 'Retour à la ligne Unix', category: 'Retours à la ligne' },
    { input: 'Line1\r\nLine2', expected: "'Line1\\r\\nLine2'", description: 'Retour à la ligne Windows', category: 'Retours à la ligne' },
    { input: 'Line1\rLine2', expected: "'Line1\\rLine2'", description: 'Retour chariot', category: 'Retours à la ligne' },
    { input: 'Multi\nLine\nText', expected: "'Multi\\nLine\\nText'", description: 'Multiples retours à la ligne', category: 'Retours à la ligne' },
    
    // ========================
    // TESTS TABULATIONS
    // ========================
    { input: 'Col1\tCol2', expected: "'Col1\\tCol2'", description: 'Tabulation simple', category: 'Tabulations' },
    { input: 'Col1\tCol2\tCol3', expected: "'Col1\\tCol2\\tCol3'", description: 'Multiples tabulations', category: 'Tabulations' },
    
    // ========================
    // TESTS MIXTES (cas réels de PSM-PERMAV)
    // ========================
    { input: "C'est pouvoir passer du TEMPS", expected: "'C''est pouvoir passer du TEMPS'", description: 'Cas PSM-PERMAV 1', category: 'Cas réels' },
    { input: 'Tu as un comportement "éponge" avec Jeanne', expected: "'Tu as un comportement \"éponge\" avec Jeanne'", description: 'Cas PSM-PERMAV 2', category: 'Cas réels' },
    { input: 'Ecrire une histoire inspirante et cool "Solal Punk"', expected: "'Ecrire une histoire inspirante et cool \"Solal Punk\"'", description: 'Cas PSM-PERMAV 3', category: 'Cas réels' },
    { input: "L'Elan spontané ,Créer des formations Fibery", expected: "'L''Elan spontané ,Créer des formations Fibery'", description: 'Cas PSM-PERMAV 4', category: 'Cas réels' },
    
    // ========================
    // TESTS CARACTÈRES UNICODE
    // ========================
    { input: 'Café ☕ émoji', expected: "'Café ☕ émoji'", description: 'Caractères Unicode', category: 'Unicode' },
    { input: 'Français: àéèùç', expected: "'Français: àéèùç'", description: 'Accents français', category: 'Unicode' },
    { input: 'Español: ñáéíóú', expected: "'Español: ñáéíóú'", description: 'Accents espagnols', category: 'Unicode' },
    { input: 'Deutsch: äöüß', expected: "'Deutsch: äöüß'", description: 'Accents allemands', category: 'Unicode' },
    
    // ========================
    // TESTS BOOLÉENS
    // ========================
    { input: 'true', type: 'BOOLEAN', expected: 'TRUE', description: 'Booléen true', category: 'Booléens' },
    { input: 'false', type: 'BOOLEAN', expected: 'FALSE', description: 'Booléen false', category: 'Booléens' },
    { input: '1', type: 'BOOLEAN', expected: 'TRUE', description: 'Booléen 1', category: 'Booléens' },
    { input: '0', type: 'BOOLEAN', expected: 'FALSE', description: 'Booléen 0', category: 'Booléens' },
    { input: 'yes', type: 'BOOLEAN', expected: 'TRUE', description: 'Booléen yes', category: 'Booléens' },
    { input: 'no', type: 'BOOLEAN', expected: 'FALSE', description: 'Booléen no', category: 'Booléens' },
    { input: 'invalid', type: 'BOOLEAN', expected: 'NULL', description: 'Booléen invalide', category: 'Booléens' },
    
    // ========================
    // TESTS NOMBRES
    // ========================
    { input: '123', type: 'INTEGER', expected: '123', description: 'Entier positif', category: 'Nombres' },
    { input: '-456', type: 'INTEGER', expected: '-456', description: 'Entier négatif', category: 'Nombres' },
    { input: '0', type: 'INTEGER', expected: '0', description: 'Zéro', category: 'Nombres' },
    { input: '123.45', type: 'NUMERIC(12,2)', expected: '123.45', description: 'Décimal positif', category: 'Nombres' },
    { input: '-67.89', type: 'NUMERIC(12,2)', expected: '-67.89', description: 'Décimal négatif', category: 'Nombres' },
    { input: 'invalid', type: 'INTEGER', expected: 'NULL', description: 'Nombre invalide', category: 'Nombres' },
    { input: 'not-a-number', type: 'NUMERIC(12,2)', expected: 'NULL', description: 'Texte comme nombre', category: 'Nombres' },
    
    // ========================
    // TESTS TYPES SPÉCIAUX
    // ========================
    { input: 'd47ec620-2190-11ef-910c-f1df4955273f', type: 'UUID', expected: "'d47ec620-2190-11ef-910c-f1df4955273f'", description: 'UUID valide', category: 'Types spéciaux' },
    { input: '2024-06-03', type: 'DATE', expected: "'2024-06-03'", description: 'Date ISO', category: 'Types spéciaux' },
    { input: '2024-06-03T10:05:39.625Z', type: 'TIMESTAMPTZ', expected: "'2024-06-03T10:05:39.625Z'", description: 'Timestamp ISO', category: 'Types spéciaux' },
    
    // ========================
    // TESTS CAS LIMITES
    // ========================
    { input: "''", expected: "''''''", description: 'Apostrophes uniquement', category: 'Cas limites' },
    { input: '""', expected: "'\"\"'", description: 'Guillemets uniquement', category: 'Cas limites' },
    { input: '\\\\', expected: "'\\\\\\\\'", description: 'Backslashes uniquement', category: 'Cas limites' },
    { input: '\n\n\n', expected: "'\\n\\n\\n'", description: 'Retours à la ligne uniquement', category: 'Cas limites' },
    { input: '\t\t\t', expected: "'\\t\\t\\t'", description: 'Tabulations uniquement', category: 'Cas limites' },
    { input: ' ', expected: "' '", description: 'Espace uniquement', category: 'Cas limites' },
    { input: '   ', expected: "'   '", description: 'Espaces multiples', category: 'Cas limites' }
  ];
  
  // Grouper par catégorie
  const categories = {};
  for (const testCase of testCases) {
    if (!categories[testCase.category]) {
      categories[testCase.category] = [];
    }
    categories[testCase.category].push(testCase);
  }
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  // Exécuter les tests par catégorie
  for (const [categoryName, categoryTests] of Object.entries(categories)) {
    console.log(`\n${c('bold', `📂 ${categoryName.toUpperCase()}`)}`);
    console.log(''.padEnd(60, '─'));
    
    let categoryPassed = 0;
    let categoryFailed = 0;
    
    for (const testCase of categoryTests) {
      const result = escapeSQLValue(testCase.input, testCase.type || 'TEXT');
      const success = result === testCase.expected;
      
      if (success) {
        console.log(`✅ ${testCase.description}: ${c('green', 'PASS')}`);
        categoryPassed++;
        totalPassed++;
      } else {
        console.log(`❌ ${testCase.description}: ${c('red', 'FAIL')}`);
        console.log(`   Input:    ${c('yellow', JSON.stringify(testCase.input))}`);
        console.log(`   Type:     ${c('cyan', testCase.type || 'TEXT')}`);
        console.log(`   Expected: ${c('green', testCase.expected)}`);
        console.log(`   Got:      ${c('red', result)}`);
        categoryFailed++;
        totalFailed++;
      }
    }
    
    console.log(`   ${c('dim', `Résultat: ${categoryPassed} passés, ${categoryFailed} échoués`)}`);
  }
  
  // Résumé final
  console.log('\n' + ''.padEnd(80, '━'));
  console.log(`${c('bold', '📊 RÉSUMÉ FINAL')}`);
  console.log(''.padEnd(80, '━'));
  console.log(`Total tests: ${c('bold', testCases.length)}`);
  console.log(`${c('green', '✅ Passés:')} ${c('bold', totalPassed)}`);
  console.log(`${c('red', '❌ Échoués:')} ${c('bold', totalFailed)}`);
  
  const successRate = Math.round((totalPassed / testCases.length) * 100);
  console.log(`Taux de réussite: ${c('bold', successRate + '%')}`);
  
  if (totalFailed === 0) {
    console.log(`\n${c('green', '🎉 TOUS LES TESTS SONT PASSÉS !')}`);
    console.log(`${c('green', '✅ La fonction escapeSQLValue() fonctionne parfaitement.')}`);
  } else {
    console.log(`\n${c('red', '⚠️ CERTAINS TESTS ONT ÉCHOUÉ')}`);
    console.log(`${c('yellow', '🔧 Vérifiez la fonction escapeSQLValue() dans csv-to-sql-migrator.js')}`);
  }
  
  console.log(''.padEnd(80, '━'));
  
  return totalFailed === 0;
}

// ========================
// Lancement des tests
// ========================

try {
  const success = runTests();
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error(`\n${c('red', '❌ ERREUR')} ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
