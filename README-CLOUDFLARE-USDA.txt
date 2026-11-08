PERFMASTER — USDA avec Cloudflare Pages

Cette version utilise la route /api/nutrition-search. La fonction est dans :
functions/api/nutrition-search.js

IMPORTANT : Cloudflare Pages Functions ne sont pas prises en charge par le glisser-déposer ZIP du tableau de bord. Déploie ce projet avec une connexion GitHub/GitLab ou avec Wrangler.

Configurer la clé :
1. Cloudflare Dashboard > Workers & Pages > ton projet Pages.
2. Settings > Variables and Secrets > Add.
3. Nom : USDA_API_KEY
4. Colle la clé USDA puis choisis Secret / Encrypt.
5. Enregistre et redéploie le projet. Configure-la pour Production (et Preview si tu testes les previews).

La clé n'est pas incluse dans les fichiers et ne doit jamais être ajoutée à GitHub.

Après déploiement, tester :
https://TON-DOMAINE/api/nutrition-search?q=banana
Une réponse JSON avec results indique que la fonction répond. Si l'erreur dit USDA_API_KEY is not configured, la variable secrète n'est pas configurée dans l'environnement déployé.
