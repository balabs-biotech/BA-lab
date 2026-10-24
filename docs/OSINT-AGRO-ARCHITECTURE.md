# Architecture OSINT agro-environnemental — BA Labs

## Objectif produit

Transformer des observations publiques et des mesures de terrain en décisions agricoles vérifiables, avec des règles explicites avant tout recours à un modèle génératif. L’application doit pouvoir expliquer la source, la période, la qualité et la limite de chaque résultat.

## Architecture cible par couches

1. **Sources**
   - Sentinel-2 L2A / Copernicus Data Space : réflectance et indices de végétation, avec dates d’acquisition, couverture nuageuse et masque de qualité.
   - Open-Meteo : prévisions horaires à court terme et, séparément, historiques/réanalyses lorsque le produit et la variable sont adaptés.
   - NASA POWER : contexte agroclimatique historique à échelle de grille, pas mesure locale.
   - Terrain / capteurs BA Labs : coordonnées, température réelle, humidité, pH, EC et observations visuelles lorsque disponibles.
2. **Ingestion**
   - Adaptateur par fournisseur ; normalisation des unités, fuseaux horaires, coordonnées et identifiants de source.
   - Cache explicite, date de collecte, période couverte, version de l’adaptateur et statut d’erreur.
   - Aucune donnée absente ne doit être convertie en zéro. Les valeurs suspectes sont signalées, pas silencieusement corrigées.
3. **Contrôle qualité**
   - Vérifier les plages plausibles, les unités, les doublons, la fraîcheur, la couverture spatiale et les valeurs manquantes.
   - Conserver la distinction entre observation, estimation de grille, prévision et mesure de capteur.
   - Pour les comparaisons NDVI, utiliser les pixels communs valides et afficher la fraction de couverture ; refuser ou dégrader l’interprétation quand elle est insuffisante.
4. **Stockage**
   - Supabase : organisations, emplacements, observations normalisées, sources, mesures terrain et événements de collecte.
   - Ne pas mélanger les séries météo, les mesures des capteurs et les indices dérivés dans une colonne sémantiquement ambiguë.
   - Les clés de fournisseur, l’horodatage d’ingestion, la qualité et la provenance doivent accompagner chaque observation.
5. **Moteur de règles déterministes**
   - Entrées structurées + seuils explicitement configurés + conditions de validité.
   - Sortie : statut, constat calculé, action de vérification recommandée, justification, limites et références aux observations utilisées.
   - Une règle ne doit pas conclure à une maladie, une carence, un rendement ou un besoin d’irrigation à partir du seul NDVI ou de la seule météo.
   - Aucune commande automatique de pompe, chauffage, ventilation ou traitement à partir d’une prévision seule.
6. **Interface et traçabilité**
   - Montrer les alertes utiles en premier ; cartes satellite et exploration spatiale restent des outils secondaires.
   - Afficher « pourquoi cette alerte ? », la fenêtre temporelle, la source, la couverture et les données manquantes.
   - Les recommandations importantes doivent pouvoir être reproduites à partir des mêmes entrées et de la même version de règle.

## Profils de température

Le panneau de prévision 48 h distingue désormais quatre contextes : culture extérieure, serre, boîtes de Petri / culture microbiologique exposée, et usage personnalisé.

Ces profils adaptent l’interprétation, pas les limites biologiques. L’utilisateur peut saisir une limite basse et/ou haute provenant de son protocole ou d’une référence adaptée. L’application compte les heures prévues hors plage. Elle précise que la prévision concerne l’air extérieur au point géographique et ne prédit pas la température réelle d’une serre, d’un substrat ou d’un milieu gélosé.

Les seuils météo généraux (chaleur, froid, pluie, vent) sont des repères de vigilance et doivent rester visuellement distincts des limites propres à une espèce ou un protocole. Les valeurs configurées par l’utilisateur ne doivent pas être présentées comme scientifiquement validées par l’application.

## Contrat minimal d’une recommandation

Chaque recommandation devrait évoluer vers un objet normalisé comportant :

- `rule_id` et `rule_version`
- `severity` et `status` (information, vigilance, données insuffisantes)
- `subject_type` (culture extérieure, serre, culture microbiologique, emplacement)
- `observation_window` et `generated_at`
- `source_ids` et indicateurs de qualité/couverture
- `computed_facts` (valeurs calculées et unités)
- `recommended_check` (vérification concrète, non prescription non justifiée)
- `limitations` et raison d’une éventuelle abstention

## Priorités d’implémentation

### P0 — Fiabilité avant expansion
- Faire exécuter les contrôles de syntaxe et d’intégrité dans GitHub Actions sur chaque mise à jour de la PR.
- Tester la réponse Open-Meteo, les réponses HTTP en erreur, les données manquantes, les coordonnées invalides et les tableaux horaires incomplets.
- Contrôler la génération des zones candidates NDVI : les étiquettes des composantes connexes doivent correspondre aux objets géométriques réellement extraits.
- Ne pas prendre de décision agronomique sur les 65 points candidats avant validation de leurs géométries et de leur position.

### P1 — Qualité des données
- Ajouter un indicateur de fraîcheur, provenance et complétude par variable.
- Distinguer cumul de précipitations prévu, probabilité horaire et observation historique ; ne jamais substituer l’un à l’autre.
- Comparer les observations satellitaires uniquement sur des pixels communs et signaler les changements de couverture.

### P2 — Aide à la décision par culture
- Introduire des profils documentés avec référence, plage, stade de développement, unité, contexte d’usage et date de révision.
- Pour les profils microbiologiques, exiger espèce/souche et protocole avant toute interprétation biologique ; sinon rester en mode observation.
- Ajouter les données de capteurs locales pour comparer la météo extérieure à la température réellement subie.

### P3 — Exploitation
- Mettre en cache les prévisions pour limiter les appels redondants, avec une durée de cache explicite et un bouton d’actualisation.
- Ajouter des tests unitaires du moteur de règles avec cas normaux, limites, données manquantes et valeurs aberrantes.
- Surveiller erreurs d’API, latence, données périmées et coût opérationnel. Prioriser les sources gratuites sans supposer une disponibilité illimitée.

## Critères d’acceptation

- Les unités, dates et sources sont visibles.
- Les valeurs absentes restent absentes et les données non comparables sont signalées.
- Les limites utilisateur invalides sont refusées ; limites non renseignées = aucune conclusion « dans la plage ».
- Les conseils sont déterministes et expliquent leur déclencheur.
- Aucune action matérielle ou prescription de traitement n’est déclenchée automatiquement.
- Une validation CI verte et un test navigateur réel sont requis avant de considérer le module comme validé.


## État réel de la base et sécurité (audit du 24 octobre 2026)

Le projet Supabase actif possède déjà les briques utiles : `locations`, `environmental_observations`, `measurements`, `observations`, `plant_cultures`, `cultures`, `events`, `analyses`, `evidence`, `provenance` et `iot_devices`. Les tables inspectées ont RLS activé. `environmental_observations` conserve déjà fournisseur, jeu de données, variable, unité, horodatage d’observation et de récupération, résolution spatiale, indicateur qualité, URL source et métadonnées : réutiliser cette table plutôt que créer une table météo concurrente.

### Constats à traiter avant ouverture plus large

- **Alerte Supabase RLS sans politiques** : `iot_devices` et `iot_ingest_receipts` ont RLS activé mais aucune politique. Cela peut être intentionnel si seuls les Edge Functions avec clé serveur y accèdent ; vérifier les privilèges SQL et les chemins d’accès avant d’ajouter une politique. Ne pas exposer les jetons de dispositifs via une politique `authenticated` générique.
- **Fonctions `SECURITY DEFINER` exposées par RPC** : les advisors signalent `advance_batch_stage`, `create_batch_with_stages`, `move_batch_to_location` et `release_batch`. L’inspection montre des contrôles d’appartenance à l’organisation dans ces fonctions, mais l’avertissement reste à traiter : confirmer les droits `EXECUTE` accordés à `PUBLIC` et `authenticated`, le comportement attendu pour chaque rôle, et la validation des paramètres. Ne pas révoquer ou changer leur mode sans tests de régression, car CultureOps les utilise probablement.
- **Protection contre les mots de passe compromis désactivée** : activer cette option dans Supabase Auth avant d’élargir les comptes utilisateurs.
- **Séparation des données** : les politiques vérifiées sur `locations`, `measurements` et `plant_cultures` utilisent `private.is_org_member(organization_id)`. La politique de lecture observée pour `environmental_observations` est également limitée aux membres de l’organisation. Vérifier que les politiques INSERT/UPDATE/DELETE nécessaires à l’ingestion historique sont intentionnellement réservées aux fonctions serveur.
- **Ingestion IoT** : l’Edge Function utilise un jeton de dispositif stocké sous forme SHA-256, borne la taille du corps, valide les unités et les plages, limite le nombre de mesures par paquet et transmet un identifiant de message et une empreinte de charge utile à une RPC atomique. Conserver ces propriétés ; ajouter des tests d’abus, de répétition et de révocation avant le déploiement massif.

Références d’audit : Supabase Security Advisor et inspection en lecture seule des politiques/RPC du projet BALabs le 24 octobre 2026. Ces constats ne constituent pas une preuve d’exploitation ; ce sont des points de durcissement à vérifier.

## Architecture des tests

Le calcul de plage de température est isolé dans `batch-tracker/forecast-rules.js` sans dépendance réseau ni DOM. Le test Node couvre les dépassements basse/haute, les données manquantes, les limites inversées, l’absence de configuration et l’absence de températures valides. Le workflow GitHub Actions doit vérifier ce module ainsi que la syntaxe des modules environnemental et NDVI.
