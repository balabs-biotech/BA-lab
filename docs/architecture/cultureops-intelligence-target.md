# CultureOps — architecture cible d'intelligence biologique

**État de référence : 15 novembre 2026**  
**Statut : architecture cible et plan d'implémentation — aucune migration ni aucun déploiement déclenché par ce document.**

## 1. Décision d'architecture

CultureOps doit devenir une **infrastructure modulaire de données biologiques et d'aide à l'interprétation**, et non un ensemble de formulaires couplés à des appels IA.

> Les données sont collectées une fois, contextualisées, qualifiées et conservées avec leur provenance. Des moteurs indépendants les interprètent selon des contrats versionnés. L'interface restitue des résultats explicables, sans transformer une corrélation en diagnostic ni une recommandation en commande automatique.

Supabase/PostgreSQL reste la source de vérité opérationnelle. GitHub contient le code versionné, les contrats, les migrations, les tests et la documentation. Notion reste le référentiel documentaire de protocoles et de connaissances éditoriales ; sa synchronisation ne doit pas devenir une seconde base transactionnelle. CultureOps est le poste de travail et la couche de restitution.

## 2. État technique constaté

Audit effectué sur le projet Supabase actif `BALabs`, les migrations appliquées, le registre des moteurs et le code du worker déployé.

### Briques déjà présentes

- Modèle multi-organisation avec `organizations`, `organization_members`, rôles et RLS.
- Noyau expérimental : projets, expériences, unités expérimentales, cultures, échantillons, événements, mesures, observations, résultats, analyses, claims, evidence et provenance.
- Traçabilité biologique : organismes, souches, matériels, profils de souches, références biologiques et liens de preuve.
- Lots, étapes, QC, libération, déplacements et récoltes.
- Contexte environnemental : lieux, environnements, observations externes, profils de contexte et appareils IoT.
- Catalogue de variables et unités, registre de formules, résultats dérivés et références à leurs entrées.
- File d'exécution : registre de moteurs, jobs, leases, exécutions, claim/heartbeat/finish et worker.
- Adaptateurs NASA POWER et Sentinel-2 déjà déployés.
- Trois profils de domaine actifs : GreenTech, Mycology et Laboratory.

### État observé à la date de l'audit

- `environmental_observations` contient 1 491 lignes.
- Le registre contient 7 moteurs : `core.orchestrator`, `environmental.context` (draft), `environmental.nasapower.dailyimport`, `environmental.sentinel2.ndvi.preview`, `greentech.interpreter`, `lab.interpreter` et `mycology.interpreter`.
- Les 7 jobs présents sont terminés avec succès, sans job en attente, en cours ou en échec au moment de la lecture.
- Les états de santé du registre sont encore `unknown`.
- `environmental.context` est encore au statut `draft`.
- Les tables de mesures manuelles, lots, observations expérimentales et résultats dérivés existent, mais sont encore vides dans le projet interrogé.
- `engine_job_leases`, `iot_devices` et `iot_ingest_receipts` ont RLS activé sans politique client. Cela peut être intentionnel pour un accès exclusivement serveur, mais doit rester couvert par des tests de non-exposition.
- Les advisors signalent aussi des RPC `SECURITY DEFINER` exécutables par `authenticated` et la protection contre les mots de passe compromis désactivée. Ces constats nécessitent une revue ciblée ; ils ne justifient pas de retirer en bloc les droits des RPC métier qui peuvent être volontairement exposées.

### Limites d'architecture identifiées

1. Le worker central déployé concentre un grand nombre de fonctions d'interprétation, de calcul et de dispatch. Il constitue un point de couplage et de déploiement commun.
2. Le registre décrit des moteurs et leurs contrats, mais le code du worker contient encore des branches spécialisées par domaine. Le registre seul ne garantit donc pas encore une extensibilité complète par ajout de module.
3. Le health check est déclaré mais non renseigné : un moteur actif n'est pas nécessairement un moteur opérationnel.
4. Les contrats d'entrée/sortie doivent devenir des artefacts testés et versionnés, pas seulement des colonnes JSONB.
5. La séparation des données par espace métier est aujourd'hui principalement une séparation d'interface ; le README confirme que les tables restent organisationnelles et ne sont pas partitionnées au niveau GreenTech/Mycology/Laboratory.
6. Les fonctions Edge déployées doivent être comparées à leur source versionnée dans Git à chaque livraison.
7. Le README racine affirme que les migrations et sources Edge sont maintenues sous `supabase/`, mais les chemins `supabase/config.toml`, `supabase/migrations/` et `supabase/functions/engine-worker/index.ts` attendus n'existent pas sur `main` à la date de l'audit. Le code déployé et l'historique des migrations existent dans Supabase, mais leur miroir Git reproductible reste à rétablir. C'est un écart de gouvernance prioritaire.

## 3. Architecture logique cible

```text
SOURCES
  CultureOps UI | saisie humaine | IoT | NASA POWER | Sentinel-2 | Notion
       |
       v
ADAPTERS / INGESTION
  validation | authentification | normalisation | idempotence | provenance
       |
       v
CANONICAL DATA LAYER (PostgreSQL)
  organisations / domaines / lieux / environnements
  organismes / souches / cultures / lots / expériences
  événements / mesures / observations / pièces de preuve
       |
       v
CONTEXT RESOLVER
  sujet biologique + souche + stade + substrat
  environnement + période + emplacement
  profil valide à la date observée + niveau de preuve
       |
       v
ENGINE ORCHESTRATOR
  registry versionné -> queue -> lease -> worker -> retry
       |
       +----------------------+-----------------------+
       |                      |                       |
       v                      v                       v
  QC / validation       Calcul déterministe     Interprétation domaine
  qualité des données   séries / cinétiques     GreenTech / Mycology / Lab
       |                      |                       |
       +----------------------+-----------------------+
                              |
                              v
                     EVIDENCE & RESULT STORE
                 résultat + entrées + version + limites
                              |
                              v
                     EXPLANATION / AI LAYER
              synthèse, comparaison, question/réponse
              toujours ancrée sur les résultats et preuves
                              |
                              v
                     ALERTS & RECOMMENDATIONS
              information | vigilance | alerte | action suggérée
                              |
                              v
                     CULTUREOPS WORKSPACES
```

### Règle de résilience

Chaque adaptateur et chaque moteur est isolable. Une panne NASA POWER ne doit pas empêcher la consultation des mesures manuelles. Une panne Sentinel-2 ne doit pas bloquer le moteur mycologique. Une erreur d'interprétation ne doit jamais empêcher l'enregistrement d'une observation. Les jobs sont asynchrones, idempotents, traçables et réessayables selon une politique bornée.

## 4. Contrat commun d'un moteur

Chaque moteur doit déclarer :

- `engine_code`, `contract_version`, `implementation_version`, domaine et statut ;
- schéma d'entrée et schéma de sortie versionnés ;
- mode d'exécution et point d'entrée autorisé ;
- délai maximal, nombre maximal de tentatives et politique de retry ;
- dépendances, permissions et périmètre organisationnel ;
- critères de santé, dernier succès, dernier échec et latence ;
- tests de contrat, fixtures et jeux de référence.

Chaque job porte un identifiant d'idempotence, l'organisation, le code/version du moteur, le sujet concerné, la période de données, le payload validé et les références de provenance. Un job ne doit pas pouvoir élargir son périmètre d'organisation par le contenu de son payload.

Chaque sortie contient au minimum :

- statut explicite : calculé, partiel, rejeté, indisponible ou en erreur ;
- résultats structurés et unités ;
- références exactes aux observations/mesures d'entrée ;
- versions du moteur, du profil biologique et des formules ;
- qualité et complétude des données ;
- hypothèses, limites et niveau de preuve ;
- date de calcul et clé d'idempotence.

Les sorties d'image ou de raster doivent être stockées comme artefacts externes référencés, pas gonfler les lignes de résultats JSONB.

## 5. Couches fonctionnelles

### A. Ingestion et adaptateurs

Un adaptateur par famille de source : saisie manuelle, capteurs IoT, NASA POWER, catalogue Sentinel-2, calcul raster, import documentaire. Chaque adaptateur traduit vers le vocabulaire canonique sans effacer le type de source.

Les observations externes, estimations de modèles, mesures instrumentales et saisies humaines restent distinguées. Aucun fournisseur ne peut écrire comme s'il était un capteur BA Labs.

### B. Données canoniques et traçabilité

Le modèle actuel est à conserver et consolider, pas à remplacer par une table JSON universelle. Les tables relationnelles portent les relations et contraintes ; JSONB reste réservé aux métadonnées variables et aux payloads contractuels.

Les identifiants organisationnels et les références composées doivent être conservés dans toutes les relations sensibles. Les données restent attribuables à un sujet, un événement, un lot, un lieu, un instrument ou une source.

### C. Résolution du contexte biologique

Le moteur de contexte rassemble, pour une date donnée :

- organisme et taxonomie ;
- souche et profil de souche applicable ;
- stade du cycle biologique ;
- substrat, formulation et traitements ;
- environnement, emplacement et séries temporelles ;
- mesures et observations qualifiées ;
- références biologiques et preuves liées.

La résolution temporelle est obligatoire : un profil valable aujourd'hui ne doit pas être appliqué rétroactivement à une observation ancienne si sa période de validité ne le couvre pas.

### D. Moteurs analytiques

Séparer trois familles :

1. **Déterministes** : conversion d'unités, QC, statistiques, régressions, cinétiques, indices et calculs reproductibles.
2. **Interprétation contextualisée** : comparaison aux plages de référence, détection d'écarts et génération d'hypothèses par domaine.
3. **Synthèse IA** : explication et comparaison des résultats existants. L'IA ne doit ni inventer des mesures, ni remplacer les calculs, ni présenter une hypothèse comme un résultat validé.

### E. Alertes et recommandations

Une recommandation cite le signal déclencheur, le contexte, la source, le profil/version et le degré de confiance. Les actions proposées restent consultatives. Aucun pilotage d'irrigation, de chauffage, d'humidification ou de ventilation ne doit être activé par simple sortie d'un modèle d'interprétation.

## 6. Sécurité et gouvernance

- RLS sur toute table exposée ; politiques testées avec au moins deux organisations et plusieurs rôles.
- Les tables sans politique client doivent être explicitement documentées comme serveur uniquement.
- Aucun secret de service dans le navigateur, le firmware, Git ou les payloads visibles.
- Les RPC `SECURITY DEFINER` restent dans un périmètre maîtrisé, avec `search_path` fixé, contrôle de rôle/organisation, validation des arguments et privilèges EXECUTE minimaux.
- Ne jamais utiliser `user_metadata` comme source d'autorisation.
- Les données partagées/publicables sont des projections dé-identifiées avec consentement explicite, versionné et révocable ; jamais une ouverture des tables opérationnelles.
- Les profils biologiques distinguent hypothèse, référence publiée, référence interne, validation expérimentale et seuil opérationnel.
- Une valeur hors plage déclenche une revue contextualisée, pas automatiquement une action corrective.

## 7. Feuille de route d'implémentation

### Phase 0 — Contrat et inventaire (en cours)
- Documenter l'architecture et l'état réel des composants.
- Établir la matrice des moteurs, versions, contrats, statuts, dépendances et tests.
- Réconcilier le code Edge déployé avec les sources versionnées dans Git.
- Corriger l'écart README/dépôt : créer un dépôt de sources Supabase reproductible à partir des définitions vérifiées, sans reconstituer des migrations au hasard ni réécrire l'historique en production.
- Transformer les alertes de sécurité en tickets de revue qualifiés.

### Phase 1 — Fiabiliser le socle d'exécution
- Ajouter un health check réel par moteur et un état distinct : déclaré, prêt, dégradé, indisponible.
- Tester les transitions queue/lease/heartbeat/retry/idempotence et l'isolation entre organisations.
- Vérifier les limites de taille, timeout, payload, sortie et concurrence.
- Extraire progressivement les handlers du worker monolithique en modules testables, sans changer le contrat externe.

### Phase 2 — Context resolver v1
- Définir un contrat unique de résolution du contexte.
- Résoudre les profils biologiques et environnementaux par date de validité.
- Retourner les références et les manques de données plutôt que compléter par supposition.
- Couvrir d'abord Mycology, puis GreenTech et Laboratory.

### Phase 3 — Moteurs analytiques v1
- Stabiliser QC et normalisation des mesures.
- Stabiliser les séries temporelles, les cinétiques de croissance et les statistiques de réplicats.
- Ajouter des tests numériques de référence et des limites documentées.
- Calculer uniquement quand les unités, horodatages et données requises sont compatibles.

### Phase 4 — Alerting explicable
- Règles versionnées, seuils biologiques sourcés et profils contextualisés.
- Détection des écarts thermiques/hygrométriques, tendances de culture et anomalies de données.
- Distinguer absence de données, données anciennes, données estimées et mesure instrumentale.
- Aucune commande automatique d'actionneur.

### Phase 5 — Couche IA et interface
- Exposer des résultats structurés à l'assistant IA via un contrat d'import/export lisible.
- Permettre la comparaison de lots et de souches avec provenance et conditions comparables.
- Afficher les limites et les données manquantes avant toute conclusion.
- Ajouter les vues de suivi et d'explication dans les trois espaces.

## 8. Critères d'acceptation transversaux

- Une panne d'un moteur ne bloque ni l'enregistrement ni la lecture des autres domaines.
- Un même job rejoué ne crée pas de doublon.
- Un job expiré ne peut pas être finalisé par un ancien lease token.
- Un utilisateur d'une organisation ne lit ni ne modifie les données d'une autre.
- Un profil expiré ou non validé n'est pas utilisé comme seuil validé.
- Chaque résultat dérivé est reproductible à partir de ses entrées et versions.
- Les données externes sont toujours identifiées comme estimations et conservent leur résolution.
- Une sortie IA distingue faits, calculs, hypothèses et recommandations.
- Aucun actionneur n'est commandé par un résultat IA ou une alerte sans circuit de sécurité indépendant.

## 9. Priorité immédiate

La prochaine unité de travail technique est **Phase 1 — fiabilité du moteur d'exécution**, en commençant par :
1. inventorier les contrats et handlers réellement déployés ;
2. ajouter des tests de contrat et de cycle de vie des jobs ;
3. renseigner les états de santé à partir de contrôles réels ;
4. extraire le premier handler autonome sans modifier le comportement observable.

Aucune migration de schéma ne doit être ajoutée tant qu'un besoin relationnel démontré ne l'exige. La priorité est d'exploiter correctement les briques déjà construites et de les rendre testables, extensibles et résilientes.
