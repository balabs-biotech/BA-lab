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

