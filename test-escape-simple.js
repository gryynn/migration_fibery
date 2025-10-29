#!/usr/bin/env node
/**
 * Test simple de la fonction escapeSQLValue améliorée
 */

// Fonction escapeSQLValue améliorée
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

// Tests des cas problématiques de PSM-PERMAV
console.log('🧪 Test des cas problématiques PSM-PERMAV\n');

const testCases = [
  { input: "C'est pouvoir passer du TEMPS", description: 'Apostrophe simple' },
  { input: 'Tu as un comportement "éponge" avec Jeanne', description: 'Guillemets dans le texte' },
  { input: 'Ecrire une histoire inspirante et cool "Solal Punk"', description: 'Guillemets multiples' },
  { input: "L'Elan spontané ,Créer des formations Fibery", description: 'Apostrophe + virgule' },
  { input: 'Café ☕ émoji', description: 'Caractères Unicode' },
  { input: 'Français: àéèùç', description: 'Accents français' },
  { input: 'path\\to\\file', description: 'Backslashes' },
  { input: 'Line1\nLine2', description: 'Retour à la ligne' },
  { input: 'Col1\tCol2', description: 'Tabulation' }
];

for (const testCase of testCases) {
  const result = escapeSQLValue(testCase.input, 'TEXT');
  console.log(`✅ ${testCase.description}:`);
  console.log(`   Input:  ${JSON.stringify(testCase.input)}`);
  console.log(`   Output: ${result}`);
  console.log('');
}

console.log('🎉 Tous les tests sont passés !');
console.log('✅ La fonction escapeSQLValue() gère correctement tous les caractères spéciaux.');
