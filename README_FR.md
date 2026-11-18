# PERFMASTER — backend Cloudflare (préparation production)

## Architecture repérée dans la PWA actuelle
- Application HTML/PWA, sans serveur applicatif actuellement.
- Les comptes sont locaux : `gb27acc`, `gb27cur`, `gb27sess`.
- Les données sont enregistrées dans plusieurs clés `gb27*` de `localStorage`, avec préfixe utilisateur `u_<nom>_`.
- Le mot de passe local actuel est un SHA-256 simple avec sel; ce mécanisme n'est pas approprié comme stockage serveur de mots de passe.
- Le service worker actuel gère le cache, mais pas encore les événements push.

## Important : binding D1
Cloudflare exige que le binding soit un identifiant JavaScript valide. Le binding `PERFMASTER-DB` (tiret) n'est pas valide. Configurez-le comme `PERFMASTER_DB` (underscore). Le nom de la base reste exactement `perfmaster_db`.

## Contenu
- `migrations/0001_initial_schema.sql` : utilisateurs, sessions, données par utilisateur, abonnements push et limitation des tentatives de connexion.
- `src/index.js` : API Workers avec création/connexion de compte, sessions bearer, lecture/écriture des données et enregistrement des abonnements push.
- `public/push-client.js` : demande de permission et enregistrement/désenregistrement des abonnements push.
- `wrangler.toml` : configuration de départ. Le `database_id` doit être remplacé par l'identifiant réel de votre D1.

## Déploiement (à faire dans votre compte Cloudflare)
1. Dans le Worker, ajouter le binding D1 `PERFMASTER_DB` qui pointe vers `perfmaster_db`.
2. Récupérer le Database ID dans D1 et le mettre dans `wrangler.toml`.
3. Appliquer la migration : `npx wrangler d1 migrations apply perfmaster_db --remote`.
4. Déployer le Worker depuis ce dossier : `npx wrangler deploy`.
5. Configurer `PERFMASTER_ORIGIN` avec l'origine exacte de la PWA (ici `https://perfmaster.pages.dev` si c'est toujours le domaine utilisé).
6. Tester `GET https://<worker>.<sous-domaine>.workers.dev/health` : `ok:true` et `database:true` sont attendus.

## API préparée
- `POST /api/auth/register` `{ "username":"...", "password":"..." }`
- `POST /api/auth/login` `{ "username":"...", "password":"..." }`
- `POST /api/auth/logout` (Bearer token)
- `GET /api/me` (Bearer token)
- `GET /api/data` (Bearer token)
- `PUT /api/data` `{ "data": { "gb27cfg": {}, "gb27logs": {} } }` (Bearer token)
- `POST /api/push/subscribe` (Bearer token + PushSubscription)
- `DELETE /api/push/subscribe` (Bearer token + `{ "endpoint":"..." }`)

Les données acceptées sont explicitement limitées aux clés locales PERFMASTER listées dans `src/index.js`. Les requêtes SQL sont paramétrées. Les mots de passe serveur sont dérivés avec PBKDF2-HMAC-SHA-256 (210 000 itérations). Les jetons de session bruts ne sont jamais enregistrés en base.

## Ce qui n'est pas encore activé automatiquement dans l'app
Cette archive prépare et implémente le service backend, le schéma et les routes. Elle ne remplace pas encore le formulaire de connexion local de la PWA et ne déclenche pas une synchronisation automatique de chaque sauvegarde. Il faut d'abord configurer et déployer le Worker, puis réaliser la migration de comptes/données locales avec un écran de confirmation et tests de fusion. Ne déployez pas ce backend en pensant que les comptes locaux seront automatiquement transférés.

## Notifications push
Le schéma et les routes d'abonnement sont prêts, et `push-client.js` peut enregistrer les abonnements après permission explicite. L'envoi réel des notifications n'est pas inclus : il reste à générer/configurer une paire de clés VAPID et ajouter l'émetteur Web Push chiffré ainsi que les événements métier (rappel séance, hydratation, etc.). Le service worker doit également recevoir un gestionnaire `push` et afficher `showNotification`.

## Sécurité et limites
- Utiliser HTTPS en production.
- Ne jamais mettre un mot de passe, une clé VAPID privée ou un secret dans le HTML.
- Configurer l'origine CORS exacte.
- Tester d'abord avec une base D1 de staging et une sauvegarde locale exportée.
- Prévoir un flux « mot de passe oublié » par courriel seulement après choix/configuration d'un fournisseur email; aucun courriel n'est envoyé par cette première version.
- Cette archive n'a pas été déployée dans votre compte Cloudflare : aucun accès à votre compte ou à son Database ID n'est disponible depuis cette conversation.
