# Administration du passeport produit BA Labs

Cette application React/Vite est la surface interne de gestion du passeport produit. Elle est conservée dans le dépôt principal `BA-lab`, sous `product-passport/admin/`.

## Rôles des surfaces

- `../` : page publique consultée par les clients après scan du QR.
- `admin/` : interface interne de gestion, avec connexion Supabase, références produits, lots, contrôles qualité, incidents, publication et génération des QR.
- `#/demo` : démonstration ouverte, limitée à des données fictives et en lecture seule.

## Connexions

L'administration est configurée sur le projet Supabase BA Labs actif :

- URL : `https://axcouwiodqsauwnsiotn.supabase.co`
- Edge Function administrative : `passport-admin` (JWT requis)
- Edge Function publique : `public-passport`
- Aucun secret de service n'est présent dans le navigateur.

Les droits métier restent vérifiés côté serveur. Ne pas rendre les tables opérationnelles accessibles en lecture publique pour faciliter la démonstration.

## QR

Les QR générés par l'administration pointent vers la page publique Cloudflare :

`https://ba-labs-product-passport.pages.dev/#/p?token=<jeton>`

Le jeton est opaque. Sa valeur brute n'est pas conservée en base ; seul son hash est utilisé par le service public. Après génération, télécharger et conserver l'image QR avant de fermer la fenêtre.

## Développement local

```sh
cd product-passport/admin
npm install
npm run dev
```

Build de vérification :

```sh
npm run build
```

Le build produit `dist/`. Le chemin de publication final sous le domaine Cloudflare doit être configuré pour servir l'administration sous `/admin/`, sans remplacer la page publique à la racine.

## État du déploiement

Le code source est maintenant migré dans le dépôt `BA-lab`. La version publique de consultation reste déployée sur Cloudflare Pages. Le déploiement de l'administration migrée est une étape distincte : ne pas considérer l'ancienne URL AppDeploy comme connectée au projet Supabase actif tant que la nouvelle build n'est pas publiée et testée.
