# CultureOps — audit du cycle d'exécution des moteurs

**Date : 15 novembre 2026**  
**Périmètre : lecture seule du projet Supabase BALabs et du worker versionné dans la branche architecture.**  
**Aucune donnée, fonction, permission ou structure de production n'a été modifiée.**

## 1. État observé

- 7 lignes dans `engine_jobs`, toutes au statut `succeeded`.
- Les 7 jobs ont `attempts = 1`.
- 0 ligne dans `engine_job_leases` au moment du contrôle.
- Le schéma contient `engine_jobs`, `engine_job_leases`, `engine_job_runs` et `engine_registry`.
- `engine_job_runs` impose l'unicité `(job_id, attempt)` et une FK composite `(organization_id, job_id)` vers `engine_jobs`.
- `engine_job_leases` impose une seule lease par job, avec `job_id` comme clé primaire.
- Les états de job autorisés sont `queued`, `running`, `succeeded`, `failed`, `cancelled`. Les exécutions acceptent `running`, `succeeded`, `failed`, `abandoned`.

## 2. Contrats SQL et privilèges

| RPC | Rôle observé | Fonction |
|---|---|---|
| `enqueue_engine_job` | `authenticated`, `service_role` | Crée un job, vérifie l'utilisateur, le droit d'écriture organisationnel, le moteur actif, la version du contrat et la clé d'idempotence |
| `claim_engine_job` | `service_role` uniquement | Réclame un job avec `FOR UPDATE SKIP LOCKED`, incrémente la tentative et crée/remplace la lease |
| `heartbeat_engine_job` | `service_role` uniquement | Prolonge une lease uniquement si le token correspond et si elle n'est pas déjà expirée |
| `finish_engine_job` | `service_role` uniquement | Vérifie le token et l'expiration, finalise le job, planifie un retry borné ou marque le résultat final |
| `verify_engine_worker_cron_secret` | `service_role` uniquement | Vérifie le secret cron via Vault |

Les trois RPC d'exécution sont `SECURITY DEFINER`, avec `search_path` explicite. Leur exécution est limitée à `service_role` ; ni `anon` ni `authenticated` ne peuvent les appeler. `enqueue_engine_job` reste une fonction `SECURITY INVOKER` et contrôle le périmètre organisationnel.

## 3. Invariants déjà présents

1. **Idempotence d'enqueue** : unicité organisation + clé d'idempotence ; une réutilisation de clé avec un payload ou un moteur différent est rejetée.
2. **Concurrence** : la sélection utilise `FOR UPDATE SKIP LOCKED`, ce qui évite à deux workers de réclamer simultanément la même ligne verrouillée.
3. **Lease fencing** : heartbeat et finish exigent le token de lease courant ; finish refuse une lease expirée.
4. **Tentatives bornées** : le job porte `attempts` et `max_attempts`, avec une borne de schéma de 1 à 20 tentatives.
5. **Historique** : chaque tentative est enregistrée dans `engine_job_runs`, avec une contrainte unique par job et numéro de tentative.
6. **Isolation organisationnelle** : les runs ont une FK composite liant l'organisation au job ; enqueue vérifie le droit d'écriture dans l'organisation.
7. **Récupération après expiration** : claim peut reprendre un job `running` dont la lease a expiré ; l'exécution précédente est marquée `abandoned`.

## 4. Points à vérifier avant modification

### A. Synchronisation de l'historique SQL

Le schéma et les RPC existent en production, mais les sources de migration qui les ont introduits ne sont pas encore réconciliées avec certitude dans Git. Il est interdit de reconstruire une migration supposée à partir du seul schéma distant. Tant que la migration source exacte n'est pas retrouvée, les tests d'intégration SQL complets ne peuvent pas être ajoutés de manière reproductible.

### B. Cohérence de finalisation

`finish_engine_job` met à jour la ligne `engine_job_runs` correspondant au token et à la tentative, mais ne vérifie pas explicitement que cette mise à jour a affecté exactement une ligne avant de supprimer la lease et de terminer le job. La contrainte unique et le flux normal rendent le cas peu probable ; il faut néanmoins le couvrir par un test d'intégration et décider si l'absence de run doit faire échouer la transaction.

### C. Santé des moteurs

`engine_registry.health_status` reste `unknown`. Un statut `active` indique une disponibilité déclarée, pas une santé opérationnelle. Aucun statut ne doit être changé en `healthy` sans probe réel, daté et spécifique au moteur.

### D. Worker monolithique

Le worker versionné reste un fichier central volumineux qui contient dispatch, interprétation, calculs et appels de modules. Le découpage doit être progressif et précédé de tests de non-régression. Ne pas réécrire le worker en bloc.

## 5. Matrice de tests Phase 1

Les tests suivants doivent être exécutés sur une base locale de test ou une branche Supabase isolée, jamais en injectant des jobs artificiels dans la production.

| Cas | Précondition | Résultat attendu |
|---|---|---|
| Enqueue idempotent | même organisation, clé et payload | même job_id, aucune seconde ligne |
| Conflit d'idempotence | même clé, payload ou moteur différent | erreur explicite |
| Enqueue non autorisé | utilisateur sans droit d'écriture | refus |
| Double claim concurrent | deux workers, un job disponible | un seul obtient le job |
| Heartbeat valide | token courant, lease non expirée | expires_at prolongé |
| Heartbeat expiré | lease expirée ou token ancien | refus |
| Finish valide | token courant et run courant | job et run terminés, lease supprimée |
| Finish ancien token | lease remplacée | refus, aucune mutation du job courant |
| Retry | échec avant max_attempts | job remis en queue avec available_at futur |
| Budget épuisé | dernière tentative échouée | statut final failed |
| Lease abandonnée | worker mort, lease expirée | ancienne run abandoned, nouvelle tentative traçable |
| Isolation tenant | utilisateur A tente de lire/écrire job B | refus |
| Panne d'un handler | handler indisponible | job échoue/réessaie sans bloquer les autres jobs |
| Idempotence de sortie | même job relancé | pas de doublon de résultat métier |

## 5 bis. Écart de migration confirmé

Une comparaison directe des identifiants de migration confirme un écart important :

- 92 migrations enregistrées dans le projet Supabase actif ;
- 57 fichiers SQL dans le dépôt ;
- 43 correspondances exactes version + nom ;
- 49 migrations distantes sans fichier Git portant leur identifiant exact ;
- 14 fichiers Git sans correspondance exacte dans l'historique distant.

Les migrations de la file d'exécution du 15 novembre sont notamment absentes sous leurs identifiants distants exacts : `engine_execution_queue_v1`, ses durcissements, le registre versionné, les RPC enqueue, les moteurs NASA/Sentinel et le vérificateur du secret worker. La liste exhaustive est dans `supabase/migrations/RECONCILIATION.md`.

Plusieurs fichiers locaux ont un nom similaire à une migration distante mais un horodatage différent. Ils ne doivent pas être renommés automatiquement : les corps SQL doivent être récupérés et comparés depuis la source originale.

## 6. Décision immédiate

- Ne pas toucher au schéma de production.
- Retrouver la source exacte des migrations qui définissent les quatre tables et les RPC du moteur.
- Ajouter les tests d'intégration SQL au pipeline existant après restauration d'une base de test reproductible.
- Ajouter un test spécifique de cohérence `finish_engine_job` (mise à jour exacte d'un run).
- Définir un protocole de health check par mode d'exécution, puis seulement écrire `health_status`.
- Extraire ensuite un premier module pur du worker, avec tests de contrat et comportement identique.

