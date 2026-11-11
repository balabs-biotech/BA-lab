# CultureOps — revue de sécurité et conformité technique

**Date :** 11 novembre 2026  
**Projet Supabase :** BALabs — région eu-west-3  
**Portée :** état des contrôles Supabase et des pages légales pendant le chantier CultureOps.

## Résultats de l'inventaire

### Contrôles positifs observés

- Les tables du schéma public recensées par Supabase ont RLS activée.
- Les tables `public.iot_devices` et `public.iot_ingest_receipts` n'ont pas de politiques RLS et n'accordent pas de privilèges directs SELECT/INSERT à `anon` ou `authenticated` selon la vérification SQL du 11 novembre. Elles semblent destinées à un accès serveur uniquement ; conserver cette séparation.
- Les fonctions `SECURITY DEFINER` accessibles à `authenticated` vérifiées dans cette revue contrôlent l'appartenance à l'organisation via `private.is_org_writer` et `auth.uid()` ou un contrôle équivalent. Les clés de recherche (`search_path`) sont fixées dans les définitions consultées. Ne pas révoquer ces droits en bloc : ces RPC sont des points d'entrée métier et doivent être revus individuellement avec leurs tests d'isolation.
- Les fonctions d'acquisition et de libération de verrou Notion ne sont pas exécutables directement par `anon` ou `authenticated` dans l'inventaire de privilèges consulté.

### Alerte critique à réconcilier

L'Advisor Supabase a signalé :

- Table : `private.culture_notion_sync_locks`
- État : RLS désactivée
- Niveau Advisor : critique
- Remédiation suggérée par Advisor :

```sql
ALTER TABLE "private"."culture_notion_sync_locks" ENABLE ROW LEVEL SECURITY;
```

La vérification SQL directe réalisée pendant cette revue a toutefois retourné aucun privilège SELECT, INSERT, UPDATE ou DELETE pour `anon` et `authenticated` sur cette table. Le schéma `private` n'est pas présenté comme un schéma d'API publique dans l'inventaire disponible. L'alerte doit donc être réconciliée avec la configuration réelle de PostgREST et les fonctions de verrouillage avant modification.

**Ne pas exécuter la remédiation seule sans vérifier les fonctions qui accèdent à la table et les rôles propriétaires.** Si RLS est activée sans politique appropriée, les accès qui ne contournent pas RLS seront bloqués. Toute politique éventuelle doit rester inaccessible aux clients et préserver uniquement les opérations serveur nécessaires.

### Avertissements Supabase supplémentaires

1. `public.iot_devices` et `public.iot_ingest_receipts` : RLS activée sans politique. C'est cohérent avec un accès service-only tant que les privilèges directs restent révoqués ; documenter cette intention et tester les RPC/Edge Functions qui les utilisent.
2. Huit fonctions métier `SECURITY DEFINER` sont exécutables par `authenticated`. Les contrôles d'organisation ont été observés dans les corps consultés. Maintenir des tests négatifs cross-tenant et une revue individuelle de chaque signature.
3. Protection contre les mots de passe compromis désactivée dans Supabase Auth. À activer dans les paramètres Auth avant ouverture publique, après validation de l'expérience utilisateur.

## Lacunes juridiques / organisationnelles restantes

- La dénomination légale définitive, le siège, les coordonnées officielles et l'immatriculation doivent être ajoutés aux pages légales.
- Le DPO doit être formellement désigné, ses coordonnées communiquées à l'ANPDP et publiées (loi 25-11, article 41 bis).
- Le registre des activités de traitement et le carnet automatisé des opérations doivent être finalisés et exploités (articles 41 bis 2 et 41 bis 3).
- Les préférences cookies sont actuellement conservées localement dans le navigateur. Elles ne constituent pas un registre serveur ou une preuve opposable de consentement.
- La case de prise de connaissance/acceptation des conditions est imposée à l'inscription dans l'interface, mais son acceptation n'est pas encore enregistrée dans un journal serveur immuable. Ne pas présenter ce mécanisme comme une preuve d'audit tant que le stockage d'acceptation versionné n'est pas implémenté.
- Les bases juridiques, durées de conservation, accords de sous-traitance et flux vers Supabase (France) et Notion doivent être validés.
- Les politiques publiées sont des versions de travail comportant des champs à compléter ; elles ne valent pas validation juridique.

## Ordre de traitement recommandé

1. Nommer le DPO et confirmer l'identité juridique de l'exploitant.
2. Faire examiner les transferts et contrats Supabase / Notion.
3. Implémenter le carnet automatisé des opérations avec contrôle d'accès, intégrité et durée de conservation.
4. Enregistrer les versions et horodatages d'acceptation des conditions et notices côté serveur, avec retrait distinct des consentements facultatifs.
5. Revoir l'alerte RLS de `private.culture_notion_sync_locks` et documenter la décision.
6. Activer la protection des mots de passe compromis.
7. Finaliser les durées, le processus de droits, la procédure incident et la validation juridique des pages.



## Vérification ciblée — consentements existants et audit (11 novembre 2026)

L'inspection SQL a révélé une table existante `public.culture_data_consents`, mais son contrat actuel n'est pas celui d'un registre immuable des acceptations légales :
- RLS autorise INSERT, SELECT et UPDATE aux utilisateurs authentifiés pour leur propre ligne et leur organisation ;
- le rôle `authenticated` détient aussi le privilège SQL DELETE ;
- aucune politique DELETE n'a été observée, ce qui bloque actuellement la suppression via les politiques RLS, mais le privilège SQL reste accordé et doit être supprimé dans une migration après vérification des dépendances ;
- aucune protection trigger append-only n'a été observée ;
- le code client utilise la version `2026-10-09-v1` et met à jour les champs d'opt-in statistique sur une ligne existante ;
- l'acceptation de la notice/CGU au parcours de création de compte reste une validation d'interface : elle n'est pas enregistrée dans cette table lors de l'inscription.

La table `public.events` est un journal de traçabilité biologique avec des politiques UPDATE/DELETE destinées aux rédacteurs de l'organisation. Elle ne peut donc pas être réutilisée telle quelle comme journal réglementaire append-only.

**Mesure de prudence :** aucune modification DDL n'a été appliquée à la base live pendant cette vérification. La conception cible et les tests requis sont consignés dans `docs/compliance/privacy-audit-engine-design.md`. Ne pas annoncer l'existence d'une preuve d'acceptation serveur ni d'un carnet complet tant que la migration et les parcours de journalisation n'ont pas été livrés et testés.

## Nouveau point de contrôle

- [ ] Vérifier les dépendances et usages historiques de `culture_data_consents` avant retrait du privilège DELETE ou modification de ses politiques.
- [ ] Créer une migration dédiée au registre des versions de documents et aux événements de consentement append-only.
- [ ] Créer un journal d'opérations distinct des événements biologiques, couvrant les actions pertinentes de l'article 41 bis 3.
- [ ] Ajouter les tests SQL d'isolation multi-tenant, d'interdiction UPDATE/DELETE et de validation des versions documentaires.


## Contrôle complémentaire Supabase — 11 novembre 2026, 15:xx UTC

Le contrôle des Advisors et des privilèges effectifs confirme les points suivants :

- `private.culture_notion_sync_locks` a RLS désactivée. L'Advisor l'a signalée comme critique. La vérification SQL ciblée montre toutefois qu'`anon` n'a pas USAGE sur le schéma `private`, que `authenticated` n'a aucun privilège SELECT/INSERT sur cette table, et que l'ACL de table n'accorde les droits opérationnels qu'à `service_role`. Il n'y a donc pas d'accès direct client constaté à cet instant, mais RLS reste une défense en profondeur manquante. Ne pas appliquer automatiquement la commande sans vérifier le chemin d'accès serveur et les tests.
- Remédiation candidate, non appliquée :
  `ALTER TABLE private.culture_notion_sync_locks ENABLE ROW LEVEL SECURITY;`
  Aucune policy client ne doit être ajoutée. Les appels serveur doivent continuer à utiliser le rôle privilégié attendu et être retestés après activation.
- Les Advisors signalent aussi huit fonctions métier `SECURITY DEFINER` exécutables par `authenticated` (déjà identifiées dans la revue précédente). Elles ne doivent pas être révoquées en bloc : les contrôles d'organisation et les tests cross-tenant doivent être vérifiés individuellement.
- La protection contre les mots de passe compromis demeure désactivée dans Auth.

La liste des migrations de production se termine toujours par `20261111043003_revoke_anonymous_profile_registry_access`. Aucune migration Privacy & Audit Engine n'est présente ; les tables et fonctions du registre documentaire ne sont pas installées en production.
