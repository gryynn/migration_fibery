# Validation Migration - Guide d'utilisation

## Description
Le script `validate-migration.js` compare les données exportées de Fibery avec les tables Supabase pour vérifier l'intégrité de la migration.

## Prérequis

1. **Installation des dépendances :**
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Configuration Supabase :**
   - Créez un fichier `.env` à la racine du projet
   - Ajoutez vos credentials Supabase :
   ```
   SUPABASE_URL=https://votre-projet.supabase.co
   SUPABASE_SERVICE_KEY=votre-service-key-ici
   ```

## Utilisation

```bash
node validate-migration.js
```

## Fonctionnalités

### 1. Comptage des lignes
- Lit chaque CSV dans le dossier `Important/`
- Compte les lignes dans chaque table Supabase correspondante
- Compare les totaux

### 2. Validation des descriptions
- Vérifie la présence de contenu dans les colonnes `description_content`
- Compte le nombre d'entités avec descriptions

### 3. Rapport détaillé
- Génère `output/validation-report.json` avec :
  - Comptages par table
  - Pourcentage de complétude
  - Statut de chaque table (succès/partiel/échec)

### 4. Affichage console
- ✅ Table X : 100% (50/50 lignes)
- ⚠️ Table Y : 98% (49/50 lignes) - 1 manquante
- ❌ Table Z : 0% (0/50 lignes) - ÉCHEC COMPLET

## Configuration

Modifiez les variables dans `validate-migration.js` :

```javascript
const CONFIG = {
  importantDir: 'C:\\Users\\marti\\Downloads\\martunvert.fibery.io_20251023104856287\\Important',
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  schema: 'psm_root'
};
```

## Résultats

### Fichiers générés
- `output/validation-report.json` : Rapport détaillé JSON
- Console : Résumé coloré avec emojis

### Exemple de sortie
```
🔍 VALIDATION MIGRATION - Fibery vs Supabase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 Source: C:\Users\marti\Downloads\martunvert.fibery.io_20251023104856287\Important
🗄️  Supabase: https://votre-projet.supabase.co

✅ Connexion Supabase établie

📊 27 bases à valider:

✅ Actionalisation-Dopa: 100% (40/40 lignes)
⚠️ Actionalisation-Proj: 95% (9/10 lignes) - 1 manquante
❌ PSM-PERMAV: 0% (0/8 lignes) - ÉCHEC COMPLET

📊 RÉSUMÉ DE LA VALIDATION
────────────────────────────────────────────────────────────────────────────────
📦 Tables totales: 27
📄 Lignes CSV: 998
🗄️  Lignes Supabase: 950
📝 Descriptions: 45

✅ Succès: 25 | ⚠️ Partiel: 1 | ❌ Échec: 1

🎯 Complétude globale: 95%

💾 Rapport détaillé: output\validation-report.json
```

## Dépannage

### Erreur de connexion Supabase
- Vérifiez que `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` sont définis
- Utilisez la service key (pas la anon key)
- Vérifiez que le projet Supabase est actif

### Tables non trouvées
- Vérifiez que le schéma `psm_root` existe
- Vérifiez que les tables ont été créées par le migrateur
- Vérifiez les permissions de la service key

### Comptages incorrects
- Vérifiez que les noms de tables correspondent (sanitisation)
- Vérifiez que les données ont été correctement migrées
- Consultez les logs d'erreur dans `output/errors.log`
