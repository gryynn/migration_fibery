/**
 * ========================================================================
 * CONFIGURATION EXAMPLE - Migration Fibery vers Supabase
 * ========================================================================
 *
 * Ce fichier montre comment configurer la migration.
 * Copiez-le vers config.js et ajustez les valeurs.
 *
 * 📝 INSTRUCTIONS :
 * ================
 * 1. Copiez : cp config.example.js config.js
 * 2. Modifiez les valeurs dans config.js
 * 3. Ne commitez JAMAIS config.js (ajoutez-le à .gitignore)
 */

const CONFIG = {
  // ========================================================================
  // CONFIGURATION FIBERY (source)
  // ========================================================================

  /**
   * 📁 CHEMIN VERS VOS DONNÉES FIBERY
   * ==================================
   * Chemin absolu vers le dossier "Important" de votre export Fibery
   *
   * Exemples :
   * Windows: 'C:\\Users\\martin\\Downloads\\monfichier.fibery.io_20251201\\Important'
   * Mac: '/Users/martin/Downloads/monfichier.fibery.io_20251201/Important'
   * Linux: '/home/martin/Downloads/monfichier.fibery.io_20251201/Important'
   */
  fibery: {
    importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',

    // Clé API Fibery (optionnel - pour les futures fonctionnalités)
    account: 'your-account-name',
    token: 'your-api-token-here'
  },

  // ========================================================================
  // CONFIGURATION SUPABASE/POSTGRESQL (destination)
  // ========================================================================

  /**
   * 🗄️ CONNEXION À LA BASE DE DONNÉES
   * ==================================
   * URL de connexion PostgreSQL complète
   * Format: postgresql://username:password@host:port/database
   */
  database: {
    url: 'postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres',

    // Clés Supabase
    supabaseUrl: 'https://xxx.supabase.co',
    serviceKey: 'your-service-role-key-here'
  },

  // ========================================================================
  // OPTIONS DE MIGRATION
  // ========================================================================

  /**
   * 🏷️ NOM DU SCHÉMA
   * ================
   * Nom du schéma PostgreSQL où créer les tables
   */
  schema: 'psm_root',

  /**
   * 📦 PERFORMANCE
   * ==============
   * Taille des batches pour les INSERT (lignes par requête SQL)
   */
  batchSize: 100,        // 100: sûr, 500: équilibré, 1000: rapide

  /**
   * ⏱️ RETRY ET TIMEOUTS
   * ====================
   */
  retry: {
    maxRetries: 3,       // Nombre maximum de tentatives
    delayMs: 1000,       // Délai entre tentatives (exponentiel)
    timeoutMs: 30000     // Timeout pour les requêtes
  },

  // ========================================================================
  // OPTIONS DE DÉTECTION DES RELATIONS
  // ========================================================================

  /**
   * 🔍 DÉTECTION AUTOMATIQUE
   * ========================
   */
  detection: {
    sampleSize: 20,      // Échantillon pour analyser types
    minCommaRatio: 0.1,  // Seuil détection relations (10%)
    logLevel: 'verbose'  // minimal, verbose, debug
  },

  /**
   * 🔒 SÉCURITÉ
   * ===========
   */
  security: {
    dryRun: false,       // Mode simulation (true = ne modifie rien)
    backupBefore: true   // Créer backup avant migration (futur)
  }
};

// ========================================================================
// VALIDATION DE CONFIGURATION
// ========================================================================

/**
 * Vérification de la configuration avant utilisation
 */
function validateConfig() {
  const errors = [];

  // Vérifier le chemin Fibery
  if (!CONFIG.fibery.importantDir) {
    errors.push('❌ FIBERY_IMPORTANT_DIR manquant');
  }

  // Vérifier l'URL base de données
  if (!CONFIG.database.url || !CONFIG.database.url.includes('postgresql://')) {
    errors.push('❌ SUPABASE_DB_URL invalide (doit commencer par postgresql://)');
  }

  // Vérifier la clé service
  if (!CONFIG.database.serviceKey || CONFIG.database.serviceKey.length < 50) {
    errors.push('❌ SUPABASE_SERVICE_KEY manquante ou invalide');
  }

  // Vérifier le schéma
  if (!CONFIG.schema || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(CONFIG.schema)) {
    errors.push('❌ SCHEMA doit être un nom PostgreSQL valide');
  }

  // Vérifier batch size
  if (CONFIG.batchSize < 1 || CONFIG.batchSize > 10000) {
    errors.push('❌ BATCH_SIZE doit être entre 1 et 10000');
  }

  if (errors.length > 0) {
    console.error('\n❌ ERREURS DE CONFIGURATION:');
    errors.forEach(error => console.error(`  ${error}`));
    console.error('\n💡 Corrigez config.js avant de continuer\n');
    process.exit(1);
  }

  console.log('✅ Configuration validée');
  return true;
}

// ========================================================================
// EXEMPLES DE CONFIGURATION
// ========================================================================

/*
# 🖥️ CONFIGURATION WINDOWS
CONFIG.fibery.importantDir = 'C:\\Users\\martin\\Downloads\\mon_export_2025\\Important';
CONFIG.database.url = 'postgresql://postgres:mon_password@db.abc123.supabase.co:5432/postgres';
CONFIG.batchSize = 100;

# 🍎 CONFIGURATION MAC
CONFIG.fibery.importantDir = '/Users/martin/Downloads/mon_export_2025/Important';
CONFIG.database.url = 'postgresql://postgres:mon_password@db.abc123.supabase.co:5432/postgres';
CONFIG.batchSize = 500;

# 🐧 CONFIGURATION LINUX
CONFIG.fibery.importantDir = '/home/martin/Downloads/mon_export_2025/Important';
CONFIG.database.url = 'postgresql://postgres:mon_password@db.abc123.supabase.co:5432/postgres';
CONFIG.batchSize = 500;
*/

module.exports = { CONFIG, validateConfig };
