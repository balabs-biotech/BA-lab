# Adaptive Batch Tracker upgrade — reference audit

Date: 2026-10-22

## Scope

Reference reviewed: [FarmerAdam/batch-tracker-template](https://github.com/FarmerAdam/batch-tracker-template), a static mushroom/produce batch-tracking application backed by Supabase.

BA Labs remains the canonical application and data model. This is an adaptation of product concepts, not a port or copy of the reference implementation.

## Useful reference concepts and BA Labs mapping

| Reference concept | BA Labs target | Adaptation rule |
| --- | --- | --- |
| Rooms, zones, bays and placements | `locations`, `environments`, batch/culture links | Reuse the current location/environment hierarchy; don't add a second parallel location model. |
| Batch movements between states/places | Existing batch workflow, `events`, location/environment references | Preserve auditability and organization scoping; use a transactional RPC where state changes need to be atomic. |
| Harvest records and yield | Existing batch quantities, measurements, observations and `events.payload` | First define event semantics and query needs; add a dedicated table only when repeated harvest records cannot be represented cleanly. |
| Yield/production analytics | Batch statistics and the existing measurement/experiment model | Distinguish observations, measurements, and independent experimental replicates; never infer zero from missing data. |
| QR labels | Stable batch/culture codes and public product/culture pages | Generate labels without exposing private identifiers, secrets, or organization-only data. |
| Cost tracking | Future opt-in production module | Keep financial assumptions separate from biological measurements and don't add reference-specific USD assumptions. |
| Archive | Status/history in the current batch workflow | Prefer lifecycle status and auditable events over deleting records. |

## Existing BA Labs foundations to preserve

- Three workspaces: Green Tech, Mycology, Laboratory, sharing a common engine.
- Multi-organization Supabase model with RLS and organization-scoped reads.
- Culture/material lineage and biological operations.
- Batch stages, quality-control checks, and release workflow.
- Experiments, experimental units, measurements, qualitative observations, and quality states.
- IoT device registry, environment-linked measurements, and controlled public dataset exports.
- Notion synchronization for culture records.

## First code change on this branch

Batch comparison now detects when the same measurement variable is represented by multiple units across the selected batches. It keeps the values grouped separately and displays a warning in French, English, Portuguese, and Arabic. This prevents a misleading side-by-side interpretation without adding schema or dependency risk.

A static regression assertion was added to `scripts/check-batch-tracker-js.mjs`.

## Next implementation sequence

1. Validate the latest comparison, harvest-entry, controlled-unit and biological-operation form changes in CI.
2. Review stage sequences by batch category. The current workflow still shares the standard stage sequence; any specialization must preserve the protected workflow RPCs and be covered by SQL migration replay and regression tests.
3. Audit location and movement fields against the actual `locations`, `environments`, `batches` and `events` schema before adding movement UI.
4. Keep changes on this branch until checks pass. Do not merge to `main` or apply database migrations automatically.

## Licensing note

The reference repository declares AGPL-3.0-or-later. This branch documents and adapts its concepts; it does not copy its application code or schema.


## Audit concret du workflow et amélioration suivante

- La CI de la branche d'adaptation a réussi sur le commit initial : replay complet des migrations, tests SQL de protection du workflow, contrôles des scripts et vérification des secrets.
- Le schéma dispose déjà de `batches.quantity_planned`, `batches.quantity_actual`, `batch_stages` et `events.batch_id`. La migration `20261001215407_complete_batch_tracking_indexes_and_stages.sql` valide les dix étapes standard, y compris `cultivation`, `harvest`, `formulation` et `packaging`. Il ne faut donc pas créer une seconde table de récolte avant d'avoir démontré un besoin de données répétées par récolte.
- Les transitions de workflow passent par les RPC protégées; les colonnes de workflow ne doivent pas être mises à jour directement depuis le navigateur.
- Cette itération ajoute une chronologie en lecture seule au détail du lot. Elle réutilise les événements déjà produits par la création, l'avancement, la mesure et la libération. Elle limite le chargement aux 50 événements les plus récents et ne bloque pas le détail du lot si le journal est indisponible.
- Étape suivante : concevoir la saisie de récolte/rendement avec une écriture transactionnelle et des droits explicites, puis tester les cas multi-organisation, les quantités nulles/zéro, l'unité et les doublons. Ne pas assimiler le nombre de mesures à celui des récoltes ou des répétitions indépendantes.


## Récoltes — première saisie

- Ajout d'une saisie de récolte limitée à l'étape `harvest` du lot sélectionné. La quantité doit être strictement positive, et l'unité est validée contre `public.units`.
- Chaque récolte est enregistrée comme un événement `harvest_recorded` dans `public.events`, avec quantité, unité, date, utilisateur, lot, culture et note facultative.
- La chronologie affiche les récoltes et calcule un total par unité pour les événements chargés. Des unités différentes restent séparées et ne sont jamais additionnées ensemble.
- Cette version n'écrase pas `batches.quantity_actual` : ce champ ne peut pas représenter correctement des récoltes multiples avec des unités ou des dates différentes. L'historique événementiel sert de source de traçabilité.
- Aucun changement SQL ni migration de production n'est requis pour cette première itération. Les permissions RLS existantes sur `events` restent le contrôle d'accès. La contrainte du journal exige aussi un ancrage biologique unique : l'enregistrement choisit la culture si elle existe, sinon le matériau, et refuse explicitement les lots sans l'un de ces liens.



## Cohérence des formulaires de lots et des unités

- Les catégories de lots de l'interface utilisent désormais les clés existantes des modèles de contrôle qualité : `CULTURE`, `TRICHODERMA`, `PLEUROTUS_SPAWN`, `MUSHROOM_PRODUCT`, `BIOSTIMULANT` et `FORMULATION`. Cela permet au workflow QC de retrouver les contrôles configurés au lieu d'enregistrer des catégories libres sans modèle correspondant.
- La catégorie générique est explicitement décrite comme « Culture biologique / lot de culture générique ». Les catégories non prises en charge par un modèle QC ne sont pas proposées comme si elles étaient prêtes à être libérées.
- L'unité de la quantité prévue et celle de la récolte sont sélectionnées dans `public.units`, avec le libellé, le code et la dimension lorsqu'elle est disponible. La saisie libre des codes d'unité a été supprimée.
- Une quantité prévue renseignée doit être strictement positive et accompagnée d'une unité du référentiel. La quantité prévue reste facultative.
- Le formulaire explique pourquoi la culture source doit être sélectionnée : maintenir la filiation biologique. Les choix et aides de saisie ajoutés sont localisés en français, anglais, portugais et arabe.
- Des assertions de non-régression couvrent les clés de catégorie, les sélecteurs d'unité, la validation et les libellés traduits.
- Le champ des codes descendants n'apparaît que pour les opérations qui peuvent réellement créer ou dériver des cultures descendantes selon la RPC existante; passer à une opération incompatible vide et désactive le champ pour éviter une soumission incohérente.


## Emplacement et environnement des lots — première intégration UI

- Le formulaire de création charge les emplacements et environnements existants depuis Supabase, en filtrant chaque requête sur l'organisation active.
- L'environnement proposé est soit sans emplacement associé, soit associé à l'emplacement sélectionné. Changer d'emplacement réinitialise la sélection d'environnement pour éviter une association obsolète.
- La création transmet les identifiants choisis à la RPC existante `create_batch_with_stages`; le détail du lot affiche les noms correspondants.
- Aucun nouveau schéma SQL ni changement de base de production n'a été appliqué.
- Une RPC `move_batch_to_location` est maintenant ajoutée dans une migration versionnée : elle verrouille le lot, vérifie l'appartenance à l'organisation, valide la cohérence emplacement/environnement, met à jour les deux champs et inscrit `batch_moved` dans la même transaction. L'événement conserve l'acteur, les anciennes/nouvelles valeurs et une note facultative.
- La RPC refuse les lots sans ancrage `culture_id` ou `material_id`, car le schéma `events` exige exactement un ancrage biologique. Elle rejette aussi les déplacements sans changement et les environnements rattachés à un autre emplacement.
- Le test SQL existant couvre le déplacement, l'événement d'audit et le refus d'un environnement incompatible. La migration reste dans la branche/PR : elle n'a pas été appliquée à la base de production. L'intégration du déplacement depuis l'interface et les tests d'isolation inter-organisations restent à faire.


## Déplacement des lots depuis l’interface

- Le panneau de chronologie propose désormais un formulaire de déplacement pour un lot ouvert : emplacement, environnement compatible et note facultative.
- Le formulaire appelle la RPC transactionnelle `move_batch_to_location`, puis recharge la fiche et la chronologie afin d'afficher l'événement `batch_moved`.
- Les lots clôturés sont désactivés dans l'interface. Le serveur reste l'autorité finale : il vérifie l'organisation, l'environnement et l'absence de déplacement sans changement.
- Les libellés du formulaire et l'événement de déplacement sont ajoutés à la couverture FR/EN/PT/AR. Les tests statiques vérifient la présence des contrôles et des paramètres RPC.
- Le test SQL inclut maintenant un cas de refus lorsqu'un membre tente de déplacer un lot d'une autre organisation, en plus du cas d'environnement incompatible. La validation CI du commit final reste à attendre. Aucun déploiement ni fusion n'a été effectué.
