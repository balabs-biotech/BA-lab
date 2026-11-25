# Administration du passeport produit BA Labs

Cette application React/Vite est la surface interne de gestion du passeport produit. Elle est conservée dans le dépôt principal `BA-lab`, sous `product-passport/admin/`.

## Rôles des surfaces

- `/` : page publique consultée par les clients après scan du QR.
- `/admin/` : interface interne de gestion, avec connexion Supabase, références produits, lots, contrôles qualité, incidents, publication et génération des QR.
- `/admin/#/demo` : démonstration ouverte, limitée à des données fictives et en lecture seule.

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

Vite compile les assets avec la base `/admin/`. Le workflow de publication assemble la page publique à la racine et le build React sous `/admin/`, dans un seul artefact Pages.

## Déploiement Cloudflare

Le workflow manuel `.github/workflows/deploy-product-passport.yml` publie l'artefact combiné vers le projet Pages existant `ba-labs-product-passport`. Il nécessite deux secrets GitHub Actions :

- `CLOUDFLARE_API_TOKEN` : jeton API Cloudflare limité à Pages Write sur le compte BA Labs.
- `CLOUDFLARE_ACCOUNT_ID` : identifiant du compte Cloudflare.

Le workflow n'est pas déclenché automatiquement par les pull requests. Il doit être lancé manuellement après fusion et vérification des changements sur `main`. Ne jamais placer un jeton Cloudflare dans le code ou dans un fichier de configuration.

## État du déploiement

Le code source est migré dans le dépôt `BA-lab`. La version publique actuellement en production reste inchangée jusqu'à l'exécution et à la vérification du workflow de publication. L'ancienne URL AppDeploy n'est pas considérée comme connectée au projet Supabase actif.
