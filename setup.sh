#!/bin/bash

# ========================================================================
# SETUP SCRIPT - Migration Fibery vers Supabase
# ========================================================================
#
# Ce script configure automatiquement le projet de migration
#
# Utilisation: ./setup.sh
#

echo "🚀 Configuration du projet Migration Fibery → Supabase"
echo "======================================================="

# Vérifier Node.js
echo "📦 Vérification de Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé!"
    echo "💡 Installez Node.js 16+ depuis https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ requise (actuel: $(node -v))"
    exit 1
fi

echo "✅ Node.js $(node -v) détecté"

# Installer les dépendances
echo ""
echo "📦 Installation des dépendances..."
if [ -f "package-lock.json" ]; then
    npm ci
else
    npm install
fi

# Créer le fichier de configuration
echo ""
echo "⚙️ Configuration..."
if [ ! -f "config.js" ]; then
    echo "📝 Création de config.js depuis config.example.js"
    cp config.example.js config.js
    echo "✅ config.js créé"
    echo ""
    echo "💡 PROCHAINES ÉTAPES:"
    echo "==================="
    echo "1. Éditez config.js avec vos vraies valeurs:"
    echo "   - FIBERY_IMPORTANT_DIR : chemin vers votre dossier Important"
    echo "   - SUPABASE_DB_URL : URL de connexion PostgreSQL"
    echo "   - SUPABASE_SERVICE_KEY : clé service Supabase"
    echo ""
    echo "2. Lancez la migration:"
    echo "   npm run migrate"
else
    echo "✅ config.js existe déjà"
fi

# Créer .gitignore si nécessaire
if [ ! -f ".gitignore" ]; then
    echo ""
    echo "📝 Création du .gitignore..."
    cat > .gitignore << 'EOF'
# Fichiers sensibles
.env
config.js
.env.local

# Fichiers générés
migration-complete.sql
relations-complete.sql
output/
*.log

# IDE et OS
.vscode/
.idea/
.DS_Store
Thumbs.db
node_modules/
EOF
    echo "✅ .gitignore créé"
fi

# Instructions finales
echo ""
echo "🎉 Configuration terminée!"
echo "==========================="
echo ""
echo "📋 PROCHAINES ÉTAPES:"
echo ""
echo "1️⃣ Éditez config.js avec vos vraies valeurs"
echo "2️⃣ Lancez: npm run migrate:tables"
echo "3️⃣ Lancez: npm run migrate:relations"
echo "4️⃣ Exécutez le SQL dans Supabase"
echo ""
echo "📖 Consultez README.md pour le guide complet"
echo ""
echo "🔧 Scripts disponibles:"
echo "   npm run migrate        # Migration complète"
echo "   npm run migrate:tables # Tables seulement"
echo "   npm run migrate:relations # Relations seulement"
echo ""
echo "✅ Prêt pour la migration!"

# Rendre le script exécutable (Linux/Mac)
chmod +x setup.sh 2>/dev/null || true
