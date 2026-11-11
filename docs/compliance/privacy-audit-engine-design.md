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
4. Brancher l'inscription sur une fonction serveur qui enregistre les actes légaux versionnés.
5. Instrumenter les RPC et Edge Functions qui lisent, modifient, exportent ou transmettent des données.
6. Ajouter une vue d'administration restreinte et une procédure d'exercice des droits.
7. Refaire la revue Supabase Advisors et la revue de sécurité après migration.

**Limite actuelle :** ce document est une conception, pas une implémentation active. Aucune migration n'a été appliquée à la base live dans ce lot.
