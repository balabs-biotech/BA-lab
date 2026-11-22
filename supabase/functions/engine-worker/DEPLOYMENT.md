# engine-worker — provenance du snapshot déployé

- Projet Supabase : `BALabs` (`axcouwiodqsauwnsiotn`)
- Fonction : `engine-worker`
- Version distante capturée : **61**
- SHA-256 du bundle source déclaré par Supabase : `045cb620bfd8c6d4bdcc031e2ed8ce06d63a916b91aab5c7c85fe54f42edb1c5`
- `verify_jwt` au niveau Gateway : **false**
- Import map : false
- Entrée : `index.ts`
- Capture : 15 novembre 2026

## Sécurité d'exécution

La désactivation de `verify_jwt` est propre à ce worker interne. Le handler vérifie lui-même un bearer service key ou un secret Cron vérifié côté base avant de réclamer un job. Ne pas rendre cette fonction publique ni retirer cette vérification. Les appels utilisateurs doivent passer par les fonctions/API prévues et les contrôles RLS.

## Nature de ce fichier

Il s'agit d'un **snapshot exact du code actuellement déployé**, versionné pour rendre l'audit et les évolutions reproductibles. Ce fichier n'est pas une preuve qu'un déploiement Git a eu lieu et n'est pas automatiquement synchronisé avec Supabase.

Avant toute modification ou redéploiement :
1. comparer le code local au bundle distant ;
2. exécuter les tests de contrat et de cycle de vie de queue ;
3. vérifier les secrets et les paramètres de déploiement sans les copier dans Git ;
4. effectuer une revue sécurité des RPC appelées ;
5. déployer uniquement après validation explicite du changement.

Les autres fonctions Edge et les migrations restent à réconcilier avec le dépôt. Ne pas reconstruire l'historique de migrations à partir de suppositions.
