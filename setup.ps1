# ========================================================================
# SETUP SCRIPT - Migration Fibery vers Supabase (Windows PowerShell)
# ========================================================================
#
# Ce script configure automatiquement le projet sous Windows
#
# Utilisation: .\setup.ps1
#

Write-Host "🚀 Configuration du projet Migration Fibery → Supabase" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green

# Vérifier Node.js
Write-Host "📦 Vérification de Node.js..." -ForegroundColor Cyan
try {
    $nodeVersion = & node -v 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js non trouvé"
    }

    $versionNumber = $nodeVersion.TrimStart('v').Split('.')[0]
    if ([int]$versionNumber -lt 16) {
        throw "Node.js version 16+ requise (actuel: $nodeVersion)"
    }

    Write-Host "✅ Node.js $nodeVersion détecté" -ForegroundColor Green
} catch {
    Write-Host "❌ $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Installez Node.js 16+ depuis https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Installer les dépendances
Write-Host "" -ForegroundColor Cyan
Write-Host "📦 Installation des dépendances..." -ForegroundColor Cyan
if (Test-Path "package-lock.json") {
    & npm ci
} else {
    & npm install
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
    exit 1
}

# Créer le fichier de configuration
Write-Host "" -ForegroundColor Cyan
Write-Host "⚙️ Configuration..." -ForegroundColor Cyan
if (-not (Test-Path "config.js")) {
    Write-Host "📝 Création de config.js depuis config.example.js" -ForegroundColor Cyan
    Copy-Item "config.example.js" "config.js"
    Write-Host "✅ config.js créé" -ForegroundColor Green
    Write-Host "" -ForegroundColor Cyan
    Write-Host "💡 PROCHAINES ÉTAPES:" -ForegroundColor Yellow
    Write-Host "===================" -ForegroundColor Yellow
    Write-Host "1. Éditez config.js avec vos vraies valeurs:" -ForegroundColor White
    Write-Host "   - FIBERY_IMPORTANT_DIR : chemin vers votre dossier Important" -ForegroundColor White
    Write-Host "   - SUPABASE_DB_URL : URL de connexion PostgreSQL" -ForegroundColor White
    Write-Host "   - SUPABASE_SERVICE_KEY : clé service Supabase" -ForegroundColor White
    Write-Host "" -ForegroundColor Cyan
    Write-Host "2. Lancez la migration:" -ForegroundColor White
    Write-Host "   npm run migrate" -ForegroundColor White
} else {
    Write-Host "✅ config.js existe déjà" -ForegroundColor Green
}

# Créer .gitignore si nécessaire
if (-not (Test-Path ".gitignore")) {
    Write-Host "" -ForegroundColor Cyan
    Write-Host "📝 Création du .gitignore..." -ForegroundColor Cyan
    @"
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
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8
    Write-Host "✅ .gitignore créé" -ForegroundColor Green
}

# Instructions finales
Write-Host "" -ForegroundColor Cyan
Write-Host "🎉 Configuration terminée!" -ForegroundColor Green
Write-Host "===========================" -ForegroundColor Green
Write-Host "" -ForegroundColor Cyan
Write-Host "📋 PROCHAINES ÉTAPES:" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "1️⃣ Éditez config.js avec vos vraies valeurs" -ForegroundColor White
Write-Host "2️⃣ Lancez: npm run migrate:tables" -ForegroundColor White
Write-Host "3️⃣ Lancez: npm run migrate:relations" -ForegroundColor White
Write-Host "4️⃣ Exécutez le SQL dans Supabase" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "📖 Consultez README.md pour le guide complet" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Cyan
Write-Host "🔧 Scripts disponibles:" -ForegroundColor Yellow
Write-Host "   npm run migrate        # Migration complète" -ForegroundColor White
Write-Host "   npm run migrate:tables # Tables seulement" -ForegroundColor White
Write-Host "   npm run migrate:relations # Relations seulement" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "✅ Prêt pour la migration!" -ForegroundColor Green
