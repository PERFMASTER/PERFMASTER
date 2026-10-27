PERFMASTER — PACK DE DÉPLOIEMENT

CONTENU
- index.html : application
- perfmaster-logo.png : logo transparent pour l’interface
- perfmaster-icon.png : icône PWA avec fond sombre
- manifest.webmanifest et service-worker.js : installation et mise à jour PWA
- netlify/functions/nutrition-search.js : proxy USDA côté serveur

DÉPLOIEMENT NETLIFY
1. Sauvegarde le site actuel et exporte les données locales avant de remplacer les fichiers.
2. Décompresse l’archive et publie le CONTENU de PERFMASTER_FINAL_PACKAGE (index.html doit être à la racine publiée).
3. Dans Netlify, configure la variable d’environnement USDA_API_KEY avec une clé FoodData Central valide. Ne place jamais cette clé dans index.html ou GitHub.
4. Lance un nouveau déploiement après avoir ajouté/modifié la variable.
5. Ouvre le site publié, vérifie la recherche alimentaire, puis ferme/réouvre l’application installée pour confirmer le renouvellement du cache.

LIMITES À CONNAÎTRE
- Les comptes sont locaux à un navigateur/appareil, pas une authentification cloud ni une synchronisation entre appareils.
- La clé Intervals.icu saisie dans le profil est stockée dans le stockage local du navigateur. Pour une sécurité renforcée, il faudra déplacer cette connexion derrière un backend authentifié; ne partage pas ton appareil ni son stockage avec d’autres personnes.
- Les recettes sont des modèles alimentaires et les macros sont des estimations. Les préférences filtrent le catalogue intégré, mais ne garantissent pas l’absence de traces/allergènes. Toujours vérifier les étiquettes.
- Les dépenses énergétiques et besoins nutritionnels restent des estimations individualisées; elles ne remplacent pas une évaluation par un diététiste du sport.
- Le code JavaScript a été vérifié avec Node et les règles de filtrage alimentaire ont été testées dans un harness isolé. Un test complet sur téléphone, ordinateur et site Netlify publié reste à effectuer avant de déclarer le produit prêt pour tous les utilisateurs.


Correctif séances : suppression persistante, prévention de la réapparition des séances supprimées, bouton d’ajout accessible depuis la page Entraînement. Cache PWA mis à jour vers v14.
