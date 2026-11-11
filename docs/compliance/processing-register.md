# BA Labs CultureOps — registre des activités de traitement (version de travail)

**État :** inventaire initial technique, non encore approuvé par le responsable du traitement / DPO.  
**Version :** 0.1 — 11 novembre 2026.  
**Référence juridique principale :** loi algérienne n° 18-07 du 10 juin 2018, modifiée et complétée notamment par la loi n° 25-11 du 24 juillet 2025.

> Ce document est un registre de travail destiné à préparer le registre exigé par l'article 41 bis 2. Il ne vaut pas registre final tant que l'identité du responsable, le DPO, les bases juridiques, les durées exactes, les contrats de sous-traitance et les transferts ne sont pas validés.

## 1. Responsable et délégué

| Champ | Valeur |
|---|---|
| Responsable du traitement | [Dénomination légale exacte après immatriculation] |
| Forme / siège / RC | [À compléter] |
| Contact responsable | [Adresse électronique dédiée] |
| Délégué à la protection des données | [Nom, fonction et coordonnées du DPO désigné] |
| Communication à l'ANPDP | [Date / référence / preuve à compléter] |
| Sous-traitant principal | Supabase — projet BALabs |
| Région technique actuellement configurée | eu-west-3 — Paris, France |
| Sous-traitant de distribution JS | jsDelivr |
| Synchronisation documentaire | Notion, si la fonction est activée |

## 2. Activités recensées

| Traitement | Finalité | Personnes concernées | Catégories de données | Destinataires | Base / fondement à confirmer | Conservation à fixer |
|---|---|---|---|---|---|---|
| Comptes et authentification | Création, connexion, récupération, sécurité des sessions | Utilisateurs, membres d'organisation | Email, identifiant utilisateur, données de session, événements d'authentification | Supabase Auth, administrateurs autorisés | Exécution du service / consentement ou autre fondement applicable à documenter | Durée du compte + délais techniques et légaux à définir |
| Organisations et habilitations | Rattacher les utilisateurs et contrôler les accès | Utilisateurs, administrateurs d'organisation | Identifiant, rôle, appartenance, statut d'accès | Supabase DB, administrateurs habilités | Exécution du service / intérêt légitime à évaluer | Durée de l'adhésion + archivage limité |
| Traçabilité biologique et expérimentale | Enregistrer cultures, lots, observations, mesures, expériences et résultats | Utilisateurs et toute personne identifiée dans un champ libre | Identifiants, notes, métadonnées, mesures, historiques, éventuelles données personnelles accidentelles | Supabase DB, membres habilités, moteurs internes | Exécution du service et fondement applicable à documenter | Durée de traçabilité à fixer selon nature des données et obligations |
| Analyses biologiques / environnementales | Calculer des indicateurs et contextualiser des observations | Utilisateurs ; personnes éventuellement mentionnées dans les données sources | Données de mesure, identifiants de culture, environnement, horodatages, provenance | Moteurs BA Labs, Supabase, fournisseurs de données environnementales si appel externe | Exécution du service ; aucun profilage personnel prévu | Alignée sur données sources et résultats, durée à définir |
| Alertes et historique opérationnel | Informer les utilisateurs et conserver les états des alertes | Membres autorisés | Identifiants, événements, actions et horodatages | Supabase DB, membres autorisés | Exécution du service / sécurité à documenter | Durée à définir |
| Synchronisation Notion | Synchroniser certaines fiches et informations de culture | Utilisateurs et personnes éventuellement mentionnées dans les fiches | Données de culture, identifiants, métadonnées synchronisées | Notion et ses sous-traitants | Instruction du client / exécution du service ; contrat et transfert à vérifier | Selon politique de synchronisation et suppression à définir |
| Journaux et sécurité | Détecter abus, enquêter sur incidents, prouver les accès et opérations | Utilisateurs, administrateurs, visiteurs techniques | Identifiants, date/heure, événements, IP et métadonnées réseau selon les journaux effectivement collectés | Supabase, personnel sécurité habilité | Obligation de sécurité / intérêt légitime à documenter | Fenêtre courte, précise et validée par le DPO |
| Préférences de navigateur | Mémoriser langue et choix de confidentialité | Visiteurs et utilisateurs | Valeurs localStorage, date de choix, version de politique | Navigateur local ; aucun serveur pour ce mécanisme actuellement | Nécessité fonctionnelle / choix de confidentialité | Jusqu'à effacement du stockage ou renouvellement de version |
| Réutilisation facultative recherche/statistiques | Analyses agrégées ou dé-identifiées | Organisations et utilisateurs concernés | Données biologiques et métadonnées, idéalement agrégées ou dé-identifiées | BA Labs, chercheurs expressément autorisés si applicable | Consentement distinct et documenté ; ne pas assimiler à l'acceptation des CGU | Durée et périmètre à fixer ; retrait à gérer |

## 3. Flux et destinataires étrangers

1. **Supabase :** le projet BALabs identifié dans l'infrastructure utilise actuellement la région eu-west-3 (Paris, France). Le responsable doit vérifier la localisation des sauvegardes, journaux, sous-traitants ultérieurs, accès de support et transferts indirects.
2. **jsDelivr :** distribue la bibliothèque JavaScript Supabase référencée par les pages web ; les visiteurs établissent une connexion réseau vers ce CDN.
3. **Notion :** reçoit uniquement les données prévues par la fonction de synchronisation et les autorisations configurées. Le contenu réellement transmis et le lieu de traitement doivent être recensés.
4. **NASA POWER / Copernicus :** fournisseurs de données climatiques et géospatiales. Éviter de leur transmettre des identifiants de personnes ou des données de compte.

Le transfert ou l'hébergement hors d'Algérie doit être examiné au regard de la loi applicable et des exigences de l'ANPDP. La région européenne d'un prestataire ne suffit pas, à elle seule, à démontrer la licéité du transfert. Ne pas ouvrir le traitement de données personnelles réelles en production tant que cette vérification et les garanties contractuelles ne sont pas terminées.

## 4. Mesures de sécurité recensées / à démontrer

- Authentification Supabase et clé publique uniquement côté navigateur ; aucun secret de service ne doit être exposé au client.
- RLS activée sur les tables du schéma public recensées lors de l'inventaire du 11 novembre 2026. **RLS activée ne signifie pas que chaque politique a été auditée** : vérifier les règles, vues, RPC, fonctions privilégiées et Storage.
- Séparation organisationnelle et contrôles de rôle ; tests d'isolation multi-tenant existants à conserver.
- Secrets serveur et clés internes conservés côté serveur.
- Chiffrement en transit HTTPS/TLS ; confirmer le chiffrement au repos et les paramètres de sauvegarde du fournisseur.
- Revue des dépendances, contrôle des accès administratifs, sauvegarde et procédure de restauration à formaliser.
- Journaux d'opérations : implémentation applicative dédiée à vérifier / compléter pour satisfaire l'article 41 bis 3.

## 5. Durées et effacement

Les durées doivent être définies par catégorie, approuvées par le responsable et implémentées (purge, anonymisation ou archivage restreint). Ne pas utiliser une conservation illimitée par défaut. Les exigences de traçabilité biologique peuvent justifier des durées différentes des données de compte et des journaux techniques.

## 6. Obligations et tâches de conformité

- [ ] Confirmer la dénomination sociale, le siège, l'immatriculation et le contact officiel.
- [ ] Désigner le DPO (article 41 bis), formaliser sa mission et communiquer ses coordonnées à l'ANPDP.
- [ ] Approuver et tenir à jour ce registre (article 41 bis 2), y compris les coordonnées des sous-traitants.
- [ ] Mettre en place un carnet automatisé des opérations de traitement (article 41 bis 3) : collecte, inscription, consultation, modification, transmission, extraction, effacement, chiffrement, date/heure, motif, acteur et destinataire dans la mesure prévue.
- [ ] Évaluer et documenter le cadre juridique des traitements et transferts hors du territoire, notamment Supabase en France et Notion.
- [ ] Signer / vérifier les accords de sous-traitance, clauses de confidentialité, sous-traitants ultérieurs et mécanismes de transfert.
- [ ] Définir les durées de conservation et les mécanismes de suppression / restitution.
- [ ] Publier les coordonnées effectives du responsable et du DPO dans les politiques.
- [ ] Formaliser le processus d'exercice des droits, de vérification d'identité et de réponse.
- [ ] Formaliser le plan de réponse aux violations : détection, qualification, confinement, preuves, notifications légales, communication aux personnes et registre d'incident.
- [ ] Examiner la nécessité d'une analyse d'impact / évaluation de risques pour les traitements à risque élevé et documenter la décision.
- [ ] Auditer les politiques RLS, vues, fonctions RPC, journaux, Storage, Auth et accès de support.
- [ ] Vérifier la séparation du consentement recherche/statistiques et de l'acceptation des conditions.
- [ ] Enregistrer côté serveur les versions et horodatages d'acceptation des conditions et notices ; le simple état d'une case à cocher côté navigateur n'est pas une preuve d'audit immuable.
- [ ] Tester le gestionnaire de préférences, son retrait, le blocage de tout futur traceur facultatif et l'accessibilité clavier/mobile.
- [ ] Faire relire les politiques et les conditions par un juriste algérien avant publication définitive.

## 7. Carnet automatisé des opérations — schéma fonctionnel à implémenter

Chaque événement devrait contenir au minimum :

- identifiant d'événement immuable ;
- date/heure UTC ;
- acteur (utilisateur ou service) et organisation ;
- opération (collecte, création, lecture, modification, export, transmission, suppression, chiffrement, etc.) ;
- finalité / motif ;
- catégorie de données et ressource concernée ;
- destinataire ou système destinataire, le cas échéant ;
- résultat (succès / refus / erreur) ;
- identifiant de requête / corrélation ;
- métadonnées techniques strictement nécessaires.

Les valeurs de données personnelles elles-mêmes ne doivent pas être copiées dans les journaux. Les journaux doivent être protégés contre la modification non autorisée, accessibles uniquement aux personnes habilitées et conservés selon une durée documentée.

## 8. Sources

- Journal officiel n° 48 du 24 juillet 2025, loi n° 25-11, notamment articles 41 bis, 41 bis 1, 41 bis 2 et 41 bis 3 : https://www.joradp.dz/FTP/JO-FRANCAIS/2025/F2025048.pdf
- Portail du droit algérien — loi 18-07 et modifications : https://droit.mjustice.gov.dz/fr/content/protection-des-personnes-physiques-dans-le-traitement-des-donn%C3%A9es-%C3%A0-caract%C3%A8re-personnel
- ANPDP — notice d'information sur les droits : https://plaintes.anpdp.dz/notice.php


## 7. Vérification complémentaire — consentements et journalisation (11 novembre 2026)

L'inspection du schéma Supabase de production a identifié une table existante `public.culture_data_consents`. Elle contient notamment `organization_id`, `user_id`, `terms_version`, `terms_accepted_at`, `research_statistics_opt_in` et `research_opt_in_at`.

Cette table ne constitue pas encore un registre juridique complet :
- les politiques RLS autorisent SELECT, INSERT et UPDATE pour le membre concerné ; les privilèges SQL accordent également DELETE à `authenticated` ;
- la contrainte unique porte sur organisation, utilisateur et version des conditions ;
- l'application consulte actuellement la version historique `2026-10-09-v1` au moment de la création d'une culture et peut mettre à jour l'opt-in statistique sur la ligne existante ;
- le parcours d'inscription impose une case côté interface, mais cette case n'écrit pas à elle seule une preuve serveur au moment de la création du compte ;
- aucune table dédiée aux versions des documents juridiques ni aucun journal append-only générique n'a été identifié dans les schémas inspectés.

**Décision d'architecture :** ne pas détourner `culture_data_consents` pour y stocker les acceptations générales des CGU ou de la notice. Elle reste liée au consentement de partage / statistiques associé à la création d'une culture jusqu'à migration dédiée. Le modèle cible est décrit dans `docs/compliance/privacy-audit-engine-design.md`.

Les dates, versions et retraits de consentements facultatifs devront être des événements distincts et append-only. L'acceptation des CGU, la prise de connaissance de la notice de confidentialité et l'opt-in de réutilisation scientifique sont trois actes différents ; ils ne doivent pas être fusionnés en un booléen générique.

## 8. État du carnet automatisé

À ce stade, aucun mécanisme générique de journalisation couvrant les consultations, extractions, transmissions, modifications et effacements de données personnelles n'a été confirmé. Les événements métier de `public.events` sont orientés traçabilité biologique, pas audit de protection des données. Ils ne doivent pas être considérés comme le carnet de l'article 41 bis 3 sans extension et validation spécifiques.
