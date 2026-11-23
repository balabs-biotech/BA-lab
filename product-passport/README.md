# Passeport produit — page publique

Cette page est la surface publique de consultation du Passeport produit BA Labs. Elle reste dans le dépôt principal `BA-lab`, dans son propre répertoire.

## Accès

- Page publique : https://ba-labs-product-passport.pages.dev/
- Format QR compatible avec l'administration existante : `https://ba-labs-product-passport.pages.dev/#/p?token=<jeton>`
- Format direct également accepté : `https://ba-labs-product-passport.pages.dev/?token=<jeton>`

Le jeton est opaque, généré côté serveur et transmis une seule fois lors de la création ou de la rotation du QR. La base conserve son empreinte SHA-256, jamais le jeton en clair.

## Contrat de données

La page appelle uniquement la fonction Edge `public-passport`. Elle ne lit aucune table de production directement. La fonction ne renvoie que le snapshot immuable de la version publiée.

Champs du snapshot consommés :
- `passport_code`, `schema_version`, `published_at`, `status`
- `product.name`, `product.code`, `product.category`, `product.description`, `product.usage`
- `lot.code`, `lot.manufactured_on`, `lot.expires_on`
- `quality.status`, `quality.reviewed_passing_checks`
- `alerts[]` : `title`, `summary`, `published_at`

## Sécurité

- Aucune clé Supabase n'est nécessaire dans le navigateur : la fonction publique vérifie le jeton opaque côté serveur.
- La clé `service_role` reste exclusivement côté Edge Function ; aucun accès direct aux tables privées.
- Les données dynamiques sont injectées avec `textContent`, pas avec du HTML interprété.
- Les réponses du passeport sont demandées avec `Cache-Control: no-store`.
- La page est servie avec CSP, `X-Content-Type-Options`, `Referrer-Policy` et protection contre l'intégration en iframe.

## Vérification

Tests locaux et CI :
```sh
node --check product-passport/passport.js
node --test product-passport/tests/passport-contract.test.mjs
```

Le déploiement Cloudflare Pages actuel est un Direct Upload. Le dépôt GitHub reste la source de vérité. La connexion Git Cloudflare doit être réparée avant d'automatiser les prochains déploiements depuis les commits.


## Administration

The migrated React/Vite administration source is maintained in `product-passport/admin/`. Its open `#/demo` route is limited to fictitious read-only data. The production administration requires Supabase Auth and the server-side `passport-admin` role check. See `product-passport/admin/README.md` for build and deployment notes.
