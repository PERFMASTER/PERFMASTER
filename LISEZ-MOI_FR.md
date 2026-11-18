# PERFMASTER — version préparée pour Cloudflare

## Contenu
- `index.html` : application PERFMASTER avec correction du calcul PAL/BMR, navigation centralisée et réglages serveur/notifications.
- `service-worker.js` : cache PWA, réception des notifications push et ouverture de l’application au toucher.
- `manifest.webmanifest` et `icon.svg` : installation PWA.
- `backend/` : Cloudflare Worker, migration D1 et configuration Wrangler.

## Important : état réel
Cette livraison prépare les fichiers et les points de connexion, mais **elle ne déploie rien dans votre compte Cloudflare**.
- Le backend d’authentification et de stockage D1 est préparé.
- L’écran de profil peut enregistrer l’URL du Worker et vérifier `/health`.
- Les comptes et données déjà présents dans l’application restent locaux pour le moment : le formulaire de connexion et la synchronisation automatique ne sont pas encore reliés au Worker. Aucune migration n’est faite et aucune donnée locale n’est supprimée.
- Les notifications locales peuvent être autorisées et testées depuis le profil. Le service worker sait recevoir une notification push. L’envoi push distant automatique nécessite encore la configuration VAPID et la liaison du compte à l’abonnement push; il n’est donc pas présenté comme actif avant déploiement et test réel.

## Déploiement du backend
1. Dans Cloudflare, ouvrez **Workers & Pages → D1 SQL Database** et créez ou utilisez la base nommée exactement `perfmaster_db`.
2. Copiez son **Database ID**.
3. Dans `backend/wrangler.toml`, remplacez `REMPLACER_PAR_LE_DATABASE_ID_CLOUDFLARE` par cet ID. Gardez le binding `PERFMASTER_DB` (sans tiret : c’est un nom de variable JavaScript valide).
4. Dans le terminal, depuis le dossier `backend` :

```bash
npx wrangler d1 migrations apply perfmaster_db --remote
npx wrangler deploy
```

5. Dans `backend/wrangler.toml`, confirmez `PERFMASTER_ORIGIN` avec le domaine exact de votre PWA, puis redéployez le Worker.
6. Dans PERFMASTER → Profil → Serveur PERFMASTER, collez l’adresse `https://...workers.dev`, enregistrez-la et appuyez sur **Tester la connexion au serveur**.

## Notifications sur le téléphone
1. Publiez les fichiers PWA sur HTTPS (Cloudflare Pages).
2. Ouvrez PERFMASTER → Profil → **Activer les notifications**.
3. Acceptez la permission Android/Chrome.
4. Appuyez sur **Envoyer une notification test**. La notification locale doit apparaître, même si l’application est en arrière-plan (selon les réglages Android et l’économie de batterie).

La réception push distante quand l’application est fermée requiert encore les clés VAPID, l’enregistrement de l’abonnement avec une session serveur et le service d’envoi push côté Worker. Le code ne prétend pas que cette partie est déjà déployée.

## Calcul BMR / PAL corrigé
- Une séance de moins de 60 minutes ne supprime plus le coefficient PAL de toute la journée.
- Une séance dont la dépense nette estimée est inférieure à 100 kcal ne supprime pas non plus le PAL.
- Pour les séances plus longues et significatives, le PAL est proratisé sur le temps éveillé hors séance; les calories d’exercice sont ajoutées nettes du repos déjà inclus au BMR.
- Les séances qui se chevauchent ne sont comptées qu’une seule fois dans le temps retiré du PAL.

Les calories restent des estimations physiologiques et doivent être ajustées selon les tendances observées.

## Vérifications effectuées
- Syntaxe JavaScript des scripts HTML : OK.
- Syntaxe du Worker : OK.
- Migration SQL exécutée sur SQLite de test : OK (5 tables créées).
- Vérification navigateur réel et déploiement Cloudflare : non effectués dans cet environnement.


### Configuration D1 déjà remplie
Le Database ID fourni a été inscrit dans `backend/wrangler.toml`. Le nom de base est `perfmaster_db`. Le binding est `PERFMASTER_DB` (underscore), car Cloudflare exige un identifiant JavaScript valide; `PERFMASTER-DB` avec un tiret ne convient pas.
