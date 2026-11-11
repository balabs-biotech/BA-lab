# CultureOps — conception du Privacy & Audit Engine

**Version :** 0.1 — 11 novembre 2026  
**Statut :** conception technique à valider ; aucune migration live appliquée.

## 1. Objectif

Fournir deux capacités séparées et interopérables :

1. **Legal Consent Ledger** : conserver les versions des documents juridiques et les actes d'acceptation / retrait associés.
2. **Personal Data Operation Journal** : tracer les opérations pertinentes sur les données personnelles, conformément au périmètre à confirmer de l'article 41 bis 3 de la loi algérienne n° 18-07 modifiée par la loi n° 25-11.

Ce moteur est transversal aux univers Mycology, GreenTech et Laboratory. Il ne doit pas dépendre des moteurs biologiques ou environnementaux. Une indisponibilité de l'analytique ne doit pas interrompre la traçabilité des opérations légales ; inversement, les fonctions biologiques ne doivent pas être couplées à une dépendance facultative d'analyse.

## 2. Constat de l'existant

### `public.culture_data_consents`

La table existe déjà et contient :
- organisation et utilisateur ;
- version des conditions et date d'acceptation ;
- opt-in statistique et date associée.

Ses politiques actuelles permettent à un utilisateur de lire, insérer et mettre à jour sa propre ligne dans son organisation. Le privilège SQL DELETE est accordé au rôle `authenticated`, même si aucune policy DELETE n'a été observée. Le code client utilise la version historique `2026-10-09-v1` au moment de créer une culture et met à jour les choix statistiques sur une ligne existante.

**Conséquence :** cette table n'est ni append-only ni suffisante pour prouver les acceptations générales au moment de l'inscription. Ne pas la renommer ou la réutiliser sans migration de compatibilité.

### `public.events`

Cette table décrit les événements de traçabilité biologique. Elle autorise actuellement UPDATE et DELETE aux rédacteurs d'organisation. Elle n'est donc pas un journal réglementaire immuable.

## 3. Modèle de données cible

Le modèle proposé utilise des tables dans un schéma non exposé à la Data API, par exemple `private`, avec écriture exclusivement serveur (Edge Function ou RPC étroitement contrôlée). Les noms ci-dessous sont conceptuels et devront être alignés sur les migrations et conventions du dépôt.

### A. `private.legal_document_versions`

- `id` UUID, clé primaire ;
- `document_type` : `terms`, `privacy_notice`, `cookies_notice`, `research_consent` ;
- `version` texte immuable ;
- `content_sha256` empreinte du document publié ;
- `effective_at` et `retired_at` ;
- `document_path` / URL interne ;
- `created_at`, `created_by`.

Contrainte unique : (`document_type`, `version`). Une version publiée n'est jamais écrasée : toute modification substantielle crée une nouvelle version et une nouvelle empreinte.

### B. `private.legal_consent_events`

Événements append-only, un acte par ligne :
- `id`, `organization_id` nullable si l'acte précède le rattachement à une organisation ;
- `user_id` ;
- `document_version_id` ;
- `action` : `accepted`, `acknowledged`, `withdrawn` ;
- `purpose` distincte du type documentaire ;
- `occurred_at` généré côté serveur ;
- `capture_channel` : `signup`, `workspace`, `settings`, `admin` ;
- `request_id` / identifiant de corrélation ;
- `metadata` limitée à des attributs techniques allowlistés.

Ne pas enregistrer l'adresse e-mail, le mot de passe, le contenu de la notice ou des données libres dans les métadonnées. L'acceptation des CGU, l'accusé de lecture de la notice et le consentement facultatif de recherche doivent rester trois actes distincts. Le retrait crée un nouvel événement ; il ne modifie ni ne supprime l'événement initial.

### C. `private.personal_data_operation_events`

Journal append-only des opérations pertinentes :
- `id`, `organization_id`, `actor_user_id` ;
- `operation` contrôlée : `collect`, `create`, `read`, `update`, `export`, `transmit`, `delete`, `encrypt`, `restore`, `admin_access` ;
- `data_categories` et `purpose_code` depuis des listes contrôlées ;
- `subject_ref` et `resource_ref` : identifiants techniques, jamais de valeur personnelle en clair ;
- `recipient_code` si transmission ;
- `occurred_at` côté serveur ;
- `request_id`, `source_component`, `outcome` ;
- `metadata` strictement allowlistée et non sensible.

Ne jamais copier les valeurs avant/après, les notes libres, les emails ou les secrets dans le journal. L'audit décrit l'opération et sa provenance, pas le contenu de la donnée.

## 4. Invariants de sécurité

1. Aucun accès client direct aux tables d'audit ; aucun GRANT à `anon` ou `authenticated`.
2. Écriture via une fonction serveur contrôlée ; vérifier `auth.uid()`, appartenance à l'organisation et rôle lorsque l'acteur est un utilisateur.
3. Les fonctions privilégiées doivent avoir un `search_path` fixé, vérifier l'identité et limiter les paramètres ; pas de `SECURITY DEFINER` public sans justification.
4. Refuser UPDATE et DELETE par triggers sur les tables append-only, et retirer les privilèges SQL correspondants aux rôles applicatifs.
5. Protéger les clés étrangères de sorte que la suppression d'un utilisateur ou d'une organisation ne fasse pas disparaître silencieusement les preuves. La stratégie d'effacement/anonymisation doit être arbitrée juridiquement avant DDL ; ne pas choisir `ON DELETE CASCADE` par défaut.
6. L'horodatage est généré par la base, jamais accepté depuis le navigateur comme source d'autorité.
7. L'intégrité doit être testée. Une chaîne de hachage ou signature peut être envisagée ensuite, mais ne remplace ni les contrôles d'accès, ni les sauvegardes, ni la gouvernance des clés.

## 5. Couverture fonctionnelle

- Inscription : écrire les événements d'acceptation / prise de connaissance côté serveur avant de confirmer le parcours ; si l'écriture échoue, ne pas présenter l'acte comme enregistré.
- Connexion : ne pas redemander un consentement général à chaque login ; vérifier la version applicable et redemander seulement lorsqu'une nouvelle version exige un nouvel acte.
- Espace utilisateur : afficher les versions et dates des actes, permettre le retrait des consentements facultatifs sans retirer rétroactivement l'acceptation des CGU.
- Opérations de données : journaliser les opérations depuis les points d'entrée réels. Les lectures via Data API directe ne seront pas automatiquement tracées par un simple trigger DML ; elles exigent une couche d'accès instrumentée ou des journaux techniques complémentaires.
- Exports / transmissions : journaliser le destinataire, la finalité, la catégorie de données et l'identifiant de requête, sans recopier le contenu exporté.

## 6. Tests d'acceptation requis

- Un utilisateur ne peut pas lire les journaux d'une autre organisation.
- Un utilisateur ne peut pas insérer un événement d'audit arbitraire via Data API.
- Les rôles applicatifs ne peuvent pas modifier ou supprimer un événement existant.
- Une version documentaire déjà publiée ne peut pas être écrasée.
- Une acceptation référence une version existante et applicable.
- Un retrait crée un événement distinct et ne détruit pas l'acceptation initiale.
- L'horodatage serveur prévaut sur tout horodatage client fourni.
- Les événements ne contiennent aucune valeur personnelle brute ni secret.
- Les opérations échouées et les opérations réussies sont distinguées.
- Les contrôles multi-tenant sont testés négativement avec deux organisations distinctes.

## 7. Décisions encore ouvertes

- Durées de conservation par catégorie et règles d'archivage/anonymisation.
- Politique de conservation des preuves lorsque le compte ou l'organisation est supprimé.
- Périmètre exact des événements exigés par l'article 41 bis 3 et validation par le DPO / conseil juridique.
- Instrumentation des lectures et accès aux données dans les pages frontales, RPC et Edge Functions.
- Choix de la fonction serveur d'écriture et de la stratégie de gestion des identifiants pré-authentification.

## 8. Séquencement d'implémentation

1. Stabiliser le contrat des événements et la taxonomie des finalités.
2. Ajouter une migration versionnée pour les tables, contraintes, privilèges, fonctions d'écriture et triggers append-only.
3. Écrire les tests SQL multi-tenant et append-only avant le code de production (cycle rouge/vert).
4. Brancher l'inscription sur un mécanisme serveur pré-session qui enregistre les actes légaux versionnés au moment de la création Auth.
5. Instrumenter les RPC et Edge Functions qui lisent, modifient, exportent ou transmettent des données.
6. Ajouter une vue d'administration restreinte et une procédure d'exercice des droits.
7. Refaire la revue Supabase Advisors et la revue de sécurité après migration.

**Limite actuelle :** ce document est une conception, pas une implémentation active. Aucune migration n'a été appliquée à la base live dans ce lot.


## 9. Premier contrat SQL — brouillon de revue

Le fichier `docs/compliance/drafts/privacy-audit-engine-schema.draft.sql` matérialise le premier contrat PostgreSQL. Il reste volontairement hors de `supabase/migrations` : la migration officielle doit être créée avec `supabase migration new` dans l'environnement du dépôt, puis testée localement avant toute application distante.

Le contrat comprend les trois tables privées, les index temporels, l'activation RLS sans policy client, les privilèges réservés à `service_role`, les protections append-only des événements et l'immuabilité des versions documentaires publiées (avec retrait unidirectionnel). Les références vers les utilisateurs et organisations utilisent `ON DELETE SET NULL` afin de ne pas supprimer en cascade les événements ; la stratégie juridique de conservation et d'anonymisation reste à valider.

### Résultat du test contractuel

Le test `supabase/tests/privacy_audit_engine_contract.test.sql` a été exécuté en lecture seule contre le schéma actuel et a échoué comme attendu sur `private.legal_document_versions` absente. Cela confirme l'état RED : le modèle n'est pas encore installé. Aucun DDL n'a été exécuté sur la base live.

### Points à verrouiller avant génération de la migration

- confirmer la stratégie de conservation et de suppression/anonymisation des sujets ;
- confirmer les codes de finalité et les catégories de données autorisés ;
- configurer le Before User Created Hook dans Supabase Auth et vérifier son exécution en environnement local ;
- décider du parcours d'acceptation pour les invitations administrateur et les fournisseurs OAuth ;
- ajouter des tests d'intégration qui prouvent le rejet réel de UPDATE/DELETE, et pas seulement la présence des triggers ;
- vérifier les droits de `service_role` et les permissions de schéma dans l'environnement local.


## 10. Décision d'architecture — acceptation avant confirmation e-mail

### Problème

Avec la confirmation e-mail activée, `auth.signUp()` peut créer l'utilisateur sans retourner de session. Le navigateur ne peut donc pas appeler ensuite une RPC protégée par `auth.uid()` pour enregistrer l'acte. La capture doit être côté serveur et ne pas dépendre d'une session.

### Architecture retenue : validation avant création + journal transactionnel après création

Le schéma combine deux mécanismes complémentaires :

1. **Before User Created Auth Hook** — Supabase transmet à la fonction le futur objet utilisateur et ses `user_metadata`, avant insertion. La fonction `public.hook_validate_signup_legal_versions(event jsonb)` vérifie que les versions CGU et notice de confidentialité sont présentes, publiées, effectives et non retirées. Elle rejette la création Auth en cas de version manquante ou obsolète.
2. **Trigger AFTER INSERT sur `auth.users`** — `private.capture_signup_legal_acts()` relit les versions, les valide une seconde fois, puis inscrit les deux actes dans `private.legal_consent_events` avec l'UUID Auth et l'heure serveur. Le journal est écrit dans la même transaction PostgreSQL que la création de l'utilisateur ; si l'écriture échoue, la transaction de création échoue également.

Le hook et le trigger ont des rôles différents : le hook produit un refus propre avant insertion ; le trigger est le garde-fou transactionnel qui matérialise la preuve. Le hook doit être activé explicitement dans la configuration Auth du projet Supabase ; la présence de la fonction SQL seule ne l'active pas.

### Données transmises par le client

Avant `auth.signUp()`, le client transmet dans `options.data` uniquement :
- `legal_terms_version` : identifiant de la version des CGU affichée ;
- `legal_privacy_version` : identifiant de la version de la notice affichée.

Le client ne transmet ni date d'acceptation, ni UUID utilisateur, ni empreinte prétendument autoritative. Les empreintes SHA-256 sont calculées et enregistrées lors de la publication documentaire ; les horodatages sont générés côté base.

### Limites et contrôles

- `raw_user_meta_data` est modifiable par l'utilisateur après inscription : il ne doit jamais servir à l'autorisation, à RLS ou à déterminer les droits. Le hook et le trigger l'utilisent uniquement comme déclaration d'inscription instantanée, validée puis copiée dans le journal immuable.
- Un appel direct à l'API Auth peut soumettre les mêmes métadonnées sans passer par l'interface. Le journal prouve la déclaration faite à la création du compte et les versions concernées ; il ne prouve pas que la personne a réellement lu les documents ni qu'un clic UI a eu lieu. Ce n'est pas une signature électronique qualifiée.
- La fonction du hook est exposée dans le schéma attendu par la configuration Auth, mais son exécution est accordée uniquement à `supabase_auth_admin`, jamais aux rôles client. Elle est `SECURITY DEFINER` avec `search_path` fixe et doit être revue comme une surface privilégiée.
- Le trigger s'applique à toute insertion dans `auth.users`, pas uniquement au formulaire web. Les invitations administrateur et futurs fournisseurs OAuth devront transmettre les versions requises ou avoir un parcours d'acceptation distinct explicitement conçu. Aucun contournement silencieux.
- L'opt-in de recherche reste séparé, facultatif et révocable. Il ne doit pas être précoché ni conditionner l'accès au compte.
- Ne pas stocker d'IP, de user-agent ou de mot de passe dans ces événements sans nécessité démontrée, finalité, durée de conservation et validation juridique.

### Pourquoi ne pas choisir une Edge Function seule

Une Edge Function appelée avant `signUp()` ne connaît pas encore l'UUID Auth et ne peut pas garantir une transaction atomique entre une écriture de consentement et la création du compte. Elle introduirait une table de pré-inscriptions, des identifiants de corrélation et une réconciliation des comptes abandonnés. Le hook Auth + trigger transactionnel évite cette file d'attente et s'appuie sur le cycle de création Auth natif.

### Tests bloquants avant migration

- hook : absence de métadonnées, version inconnue, future ou retirée → refus avant création ;
- hook : versions courantes → autorisation ;
- trigger : création Auth avec versions courantes → deux événements distincts ;
- trigger : insertion d'un des événements en échec → création Auth annulée ;
- métadonnées falsifiées après création → aucun événement historique modifié ;
- appel direct à la fonction hook par `anon` ou `authenticated` → refus de permission ;
- hook configuré dans Auth et confirmation e-mail activée → journal présent avant toute session utilisateur ;
- parcours d'invitation et OAuth testés explicitement avant activation de ces fournisseurs.


**Décision de portée :** ce mécanisme enregistre une déclaration d'acceptation à la création du compte. La validité juridique de la formulation, la preuve d'information préalable et les durées de conservation restent à valider par le conseil compétent / DPO. Le mécanisme ne remplace pas cette validation.
