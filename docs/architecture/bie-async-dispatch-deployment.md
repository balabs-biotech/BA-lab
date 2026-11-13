# Déploiement contrôlé du BIE asynchrone

Ce document décrit le passage du mode synchrone au consommateur de file d'exécution. Il ne déclenche aucun déploiement.

## Architecture d'exécution

1. `engine-orchestrator` authentifie l'utilisateur, vérifie son appartenance à l'organisation et construit un snapshot immuable avec le JWT appelant.
2. Il enregistre une ligne `queued` dans `engine_executions` et renvoie HTTP `202 Accepted` lorsque `BA_ENGINE_ASYNC_DISPATCH=true`.
3. Le job `pg_cron` appelle `engine-queue-dispatch` chaque minute via `pg_net`.
4. Le dispatcher réclame au plus deux lignes FIFO via `claim_engine_executions`, valide le payload versionné, appelle le worker Python et contrôle la réponse.
5. Le résultat est persisté par `complete_claimed_engine_execution`, qui vérifie l'identité du worker et la validité de sa lease avant la transaction de clôture.
6. BatchTracker interroge l'historique toutes les cinq secondes tant qu'une exécution reste `queued` ou `running`; la fréquence passe à quinze secondes lorsque l'onglet est masqué.

## Pré-requis

- Le worker Python est hébergé sur une URL HTTPS stable, avec authentification Bearer.
- Le worker expose `POST /v1/execute` et respecte les schémas `schemas/engine/v1/request.schema.json` et `response.schema.json`.
- Les secrets Edge suivants sont configurés côté Supabase, jamais dans le navigateur ni dans Git :
  - `BA_ENGINE_WORKER_URL`
  - `BA_ENGINE_WORKER_TOKEN`
  - `BA_ENGINE_DISPATCH_TOKEN` : secret aléatoire d'au moins 32 caractères.
- Le même secret de dispatch est enregistré dans Supabase Vault sous le nom `ba_labs_engine_dispatch_secret`.
- Les extensions `pg_cron` et `pg_net` sont activées. Si `pg_net` manque, la migration ne crée pas le job; il faut activer l'extension avant d'appliquer la migration de planification.
- Le worker doit supporter au moins deux requêtes concurrentes ou le plafond `MAX_DISPATCH_BATCH` doit être réduit en même temps que la concurrence réelle du worker.

## Ordre de mise en service

1. Héberger et tester le worker Python hors production avec des payloads contractuels.
2. Configurer les secrets Edge et le secret Vault. Ne jamais copier leur valeur dans un commit, un ticket ou un journal.
3. Déployer `engine-queue-dispatch` avec `supabase functions deploy engine-queue-dispatch --no-verify-jwt`. Le gateway ne valide pas de JWT pour cette fonction; la fonction exige à la place `x-ba-dispatch-secret` et le compare au secret Edge.
4. Appliquer les migrations du ledger, des leases, des claims, du heartbeat, de la complétion sous lease et enfin de la planification. La migration de planification n'installe son job que si les deux extensions et le secret Vault existent.
5. Déployer `engine-orchestrator` en conservant la validation JWT du gateway. Cette fonction continue de vérifier l'identité et l'organisation avec le JWT utilisateur.
6. Vérifier les premières exécutions avec le mode asynchrone désactivé. Contrôler les journaux du dispatcher, les leases, les transitions et les résultats.
7. Activer `BA_ENGINE_ASYNC_DISPATCH=true` sur `engine-orchestrator`. Le chemin de création ne dépend alors plus de la disponibilité immédiate de l'URL du worker; le dispatcher reste responsable du traitement.
8. Vérifier une exécution complète, une entrée invalide, un worker indisponible, une lease expirée et une réponse trop volumineuse. Confirmer que chaque ligne atteint un état terminal ou reste explicitement en file.

## Retour arrière

- Remettre `BA_ENGINE_ASYNC_DISPATCH=false` pour revenir au traitement synchrone.
- Désactiver le job `ba-labs-engine-queue-dispatch` dans `cron.job` si le dispatcher doit être arrêté.
- Ne pas supprimer le ledger ni les résultats. Les exécutions déjà terminées restent traçables.
- Ne jamais réactiver automatiquement une lease expirée : une relance doit être une nouvelle exécution idempotente et explicitement décidée.

## Limites actuelles

- Le dispatcher utilise un timeout worker de 20 secondes et une lease initiale de 120 secondes; le heartbeat est disponible pour de futurs moteurs plus longs mais n'est pas encore appelé par le dispatcher.
- La récupération des leases expirées clôture en échec et ne relance pas silencieusement un calcul scientifique.
- Aucun hébergement worker, secret, job cron, schéma de production ou déploiement Edge n'est configuré par ce document.
