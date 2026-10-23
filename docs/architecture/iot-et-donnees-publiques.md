# IoT et données publiques — architecture de raccordement

**État vérifié le 23 octobre 2026.** Le registre IoT existe dans la base active, l’ingestion sécurisée est déployée et les tables d’export public sont en place. Aucun appareil n’est encore provisionné et aucun jeu public n’est publié. Le firmware ESP32 reste hors ligne et non qualifié sur matériel.

## 1. État existant

### Firmware
Le projet PlatformIO canonique est `firmware/`, avec deux nœuds ESP32 :
- `climate_node` : DHT22, température/humidité d'une chambre, relais de chauffage/humidification/ventilation temporisée.
- `irrigation_node` : humidité du substrat, SCD4x pour le CO₂, pompe et extraction.

Le README indique que le firmware n'a pas encore été compilé avec PlatformIO ni testé sur ESP32 réel. Il ne se connecte pas au Wi-Fi et n'envoie aucune télémétrie. Les seuils et paramètres sont provisoires. Les protections logicielles ne remplacent pas les sécurités matérielles.

### Supabase existant
Le schéma comporte déjà :
- `variables` : catalogue de variables et unités canoniques ;
- `measurements` : valeur brute, unité, valeur/unité normalisées, horodatage, méthode, instrument, qualité, liens éventuels vers culture/échantillon/unité expérimentale/événement ;
- `events` : historique contextualisé, dont environnement et emplacement ;
- `environments`, `locations`, `batches`, `cultures` ;
- `culture_data_consents` : acceptation des conditions et choix de participation aux statistiques de recherche ;
- `sharing_consents` et `commons_datasets` : premières briques de gouvernance des données partagées.

Les politiques RLS observées protègent les tables de mesures et d'événements par appartenance à l'organisation. En revanche, aucun flux public filtré de mesures n'a été identifié dans les vues publiques existantes. La table `commons_datasets` est lisible par les utilisateurs authentifiés, mais cela ne constitue pas en soi une publication publique de données scientifiques.

## 2. IoT — état de la première implémentation

1. **Registre existant** : `iot_devices` lie l’appareil à une organisation et à un environnement. Le jeton est stocké sous forme de SHA-256 ; les empreintes sont uniques. Aucun appareil n’est encore enregistré.
2. **Ingestion déployée** : Edge Function `iot-ingest`, version 1, avec authentification par jeton appareil distinct. La validation du jeton est interne à la fonction ; `verify_jwt=false` est nécessaire pour les ESP32, mais toute requête reste refusée sans jeton appareil valide. La clé `service_role` reste côté serveur.
3. **Validation** : 1–20 lectures par paquet, corps limité à 32 kB, variables/unités autorisées, plages plausibles, dates contrôlées et réponses d’erreur génériques.
4. **Idempotence transactionnelle** : `ingest_iot_payload` crée le reçu et toutes les mesures dans une seule transaction. Même identifiant + même empreinte = doublon ignoré ; même identifiant + charge différente = conflit HTTP 409.
5. **Traçabilité** : `measurements` contient désormais `environment_id` et `iot_device_id`, ainsi que la valeur, l’unité, la méthode, l’instrument, l’état qualité `raw` et des métadonnées minimales.
6. **Limites** : le firmware n’envoie toujours rien et ne possède pas de file hors ligne. La commande distante des relais n’est pas implémentée.

### Variables de départ
Mapper les capteurs vers les codes existants : `temperature` (degC), `relative_humidity` (%), `substrate_moisture` (% selon la méthode réelle) et `co2_concentration` (ppm). Ajouter une variable seulement si le catalogue ne couvre réellement pas la mesure. L'humidité du sol issue d'un ADC doit être documentée comme estimation calibrée localement, pas comme teneur volumique absolue.

## 3. Données publiques — surface de publication en place

La publication doit être une projection distincte, pas une ouverture de RLS sur `measurements`, `events`, `cultures` ou `environments`.

- **Privé par défaut** : aucune mesure n'est publique simplement parce qu'elle a été collectée par un capteur.
- **Consentement explicite et granulaire** : portée (lot, expérience, environnement ou jeu de données), version des conditions, profil de dé-identification, date d'accord et retrait.
- **Minimisation** : supprimer les identifiants d'organisation/utilisateur, les noms internes, coordonnées précises, notes libres et métadonnées pouvant révéler une recette ou une localisation. Agréger les horodatages/localisations si nécessaire.
- **Qualité visible** : distinguer données brutes, validées, exclues et données estimées ; exposer unités, méthode, instrument, calibration connue et limites.
- **Publication versionnée** : `commons_datasets` décrit les jeux et `public_dataset_records` stocke les lignes d’export assainies. Les deux sont lisibles par `anon`/`authenticated` uniquement lorsque le jeu parent a `status='published'`. Les clients ne disposent pas de droits d’écriture. La publication réelle reste à construire et aucun jeu n’est actuellement publié.
- **Retrait opérant** : un retrait doit empêcher les exports futurs et entraîner le retrait des données contrôlées de la publication active ; préciser séparément ce qui a déjà été téléchargé par des tiers.
- **Séparation des accès** : API publique limitée à des vues ou fichiers pré-calculés et assainis ; aucun accès anonyme direct aux tables de travail.

## 4. Ordre de réalisation et critères de validation

### Étape A — terminée : contrat et sécurité de base
- Définir le schéma d'identité des appareils et le format d'un paquet de télémétrie.
- Vérifier les politiques RLS et les contraintes d'intégrité des tables de mesures/événements.
- Définir la matrice de variables, unités, plages, fréquence et précision par capteur.
- Définir le profil public et le cycle de vie du consentement.

### Étape B — ingestion de base déployée ; essais encore requis
- Ajouter registre/secret d'appareil et fonction d'ingestion authentifiée.
- Ajouter déduplication et liaison des mesures à un environnement.
- Garder le firmware hors ligne tant que le contrat n'est pas testé ; ne pas inventer de valeurs de capteur.

### Étape C — structure de publication en place ; pipeline encore requis
- Construire un export public à partir des seuls scopes consentis et des données assainies.
- Ajouter une prévisualisation avant publication, un historique des versions et une procédure de retrait.
- Ne publier aucune donnée BA Labs réelle par défaut ; démarrer par un jeu de démonstration explicitement synthétique ou un jeu de test autorisé.

### Tests bloquants
- appareil inconnu/révoqué ou jeton invalide refusé ;
- mesure dupliquée sans doublon en base ;
- valeur, unité ou taille hors contrat rejetée ;
- utilisateur d'une autre organisation incapable de lire les mesures privées ;
- absence de fuite de coordonnées, notes internes, identifiants ou métadonnées dans l'export public ;
- retrait de consentement effectif sur la publication active ;
- perte Wi-Fi et redémarrage sans perte silencieuse ni mesures inventées ;
- compilation PlatformIO et essais sur matériel réel avant toute commande d'actionneur.

## 5. Hors périmètre immédiat
Pas de commande distante de chauffage/pompe, pas de publication automatique des données brutes, pas de dépendance à un broker externe payant, pas de clé Supabase privilégiée dans l'ESP32. Les seuils de contrôle restent des paramètres expérimentaux jusqu'à calibration et validation matérielle.


## 6. Données météo et satellite — intégration sans coût API obligatoire

Objectif : enrichir les observations agronomiques de chaque environnement avec des variables externes datées, traçables et explicitement distinguées des mesures de capteurs. L'absence de coût API ne garantit pas une disponibilité permanente ni un coût nul de calcul/stockage.

### Sources retenues

| Source | Usage initial | Accès et limites | Décision |
|---|---|---|---|
| NASA POWER Daily API | Historique quotidien météo/énergie solaire à partir de coordonnées : températures, précipitations, humidité, vent et rayonnement selon les paramètres disponibles | API publique sans clé pour les requêtes ordinaires ; données modélisées/grillées, pas une station locale ; respecter les limites et conserver les métadonnées de requête | **Source prioritaire** pour les séries historiques et le contexte agroclimatique |
| Copernicus Data Space — STAC / Sentinel-2 L2A | Découverte de scènes, dates, couverture nuageuse et imagerie de réflectance de surface ; calcul ultérieur d'indices comme NDVI/NDMI si les bandes et la qualité le permettent | Données d'observation de la Terre ouvertes ; la recherche catalogue est distincte du téléchargement et du traitement des rasters. Téléchargement complet/traitement peut nécessiter un compte, OAuth et du calcul | **Deuxième étape** : d'abord catalogue et métadonnées, ensuite indices calculés de façon reproductible |
| Open-Meteo Free API | Prototype de prévisions météo | Conditions officielles : API gratuite réservée à un usage non commercial ; les applications avec abonnement, publicité ou activité commerciale doivent utiliser une offre autorisant l'usage commercial | **Ne pas intégrer comme dépendance de production** pour BA Labs sans licence adaptée |

Références officielles :
- NASA POWER Daily API : https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- Copernicus Data Space APIs : https://dataspace.copernicus.eu/analyse/apis
- Copernicus STAC : https://documentation.dataspace.copernicus.eu/APIs/STAC.html
- Conditions Open-Meteo : https://open-meteo.com/en/terms

### Architecture proposée

1. **Lieu et portée** : utiliser les coordonnées d'un environnement uniquement si elles sont fournies et autorisées par son propriétaire. Ne jamais publier de coordonnées précises par défaut. Une zone approximative suffit pour le premier prototype.
2. **Adaptateurs fournisseurs** : un module par source, avec paramètres explicités, délais, cache, gestion des erreurs et attribution. Les clés OAuth éventuelles restent côté serveur.
3. **Cache par point et période** : ne pas refaire la même requête à chaque ouverture d'écran. Dédupliquer par fournisseur, zone, date/période, produit et version de paramètres.
4. **Modèle de provenance** : chaque observation importée doit stocker au minimum fournisseur, identifiant/paramètres du produit, date d'observation, date d'import, unité, résolution spatiale/temporale connue, indicateur de qualité, version de transformation et URL de provenance.
5. **Séparation des mesures** : les données distantes sont des observations externes ou des estimations de modèle, jamais des mesures de capteurs. Elles ne doivent pas être écrites comme si elles provenaient d'un ESP32.
6. **Traitement satellite différé** : conserver d'abord les métadonnées de scène et la couverture nuageuse ; ne calculer NDVI/NDMI qu'après validation des bandes, masque nuage/ombres, projection et résolution. Éviter de stocker des rasters volumineux dans les lignes PostgreSQL.
7. **Utilisation agronomique prudente** : comparer pluie/température/rayonnement à la croissance, l'irrigation et les événements de culture, mais présenter les résultats comme contexte ou signal exploratoire, pas comme diagnostic ni causalité démontrée.
8. **Budget zéro** : démarrer avec des appels ponctuels/cachés à NASA POWER et une recherche de catalogue Copernicus. Pas de service de traitement satellite payant, pas de collecte continue, pas d'achat de données. Les quotas, conditions et disponibilité des services doivent être revérifiés avant mise en production.

### MVP recommandé

- Phase 1 : associer un environnement à une zone autorisée ; récupérer une série quotidienne NASA POWER ; afficher date, fournisseur, unité et statut « donnée externe/modélisée ».
- Phase 2 : calculer quelques agrégats utiles à la culture (pluie cumulée sur 7/30 jours, température minimale/maximale, rayonnement) sans remplacer les relevés locaux.
- Phase 3 : rechercher les scènes Sentinel-2 L2A et afficher date/couverture nuageuse ; ne produire aucun indice si les scènes sont nuageuses ou si la géométrie de la parcelle n'est pas assez précise.
- Phase 4 : ne connecter ces variables à des recommandations que lorsque la validation locale et les limites d'incertitude sont documentées.

**Bloquant avant le code de production :** inspecter le schéma actif et les droits d'accès des tables d'observations environnementales, choisir un modèle de stockage canonique et ajouter des tests de provenance, de cache, d'autorisation et d'absence de fuite de coordonnées.


### État de production vérifié — 23 octobre 2026

- Le schéma actif contient `environmental_observations` avec une clé de déduplication par organisation, lieu, fournisseur, jeu, variable et horodatage. La table est RLS-protégée ; les utilisateurs authentifiés ont un droit de lecture limité à leur organisation, et les clients ne peuvent pas y écrire directement.
- La fonction `nasa-power-agroclimate` est active en version 2 pour les imports à la demande. La fonction `nasa-power-scheduled-import` est active en version 2, avec `verify_jwt=false` mais validation d'un secret de cron côté serveur.
- Le cron de production est actif chaque jour à **04:30 UTC**. Son secret reste dans Supabase Vault. La fonction SQL `verify_nasa_power_cron_secret(text)` a été versionnée dans le dépôt et sa migration appliquée ; les droits d'exécution ont été vérifiés : `service_role` uniquement parmi les rôles applicatifs.
- La source déployée de `nasa-power-scheduled-import` a été comparée au fichier versionné : correspondance exacte (5 972 caractères).
- La table contient actuellement **575 observations météo NASA POWER pour 5 lieux** ; la dernière importation observée date du 23 octobre 2026 à 04:30 UTC. **Aucune observation satellite n'est encore stockée.**
- La fenêtre présente dans ces données va du 23 septembre au 19 octobre 2026, ce qui reflète le décalage des produits NASA POWER ; il ne faut pas présenter ces valeurs comme de la météo en temps réel.
- Le code du job planifié, la fonction de vérification du secret et le contrat de stockage sont versionnés. La définition complète du job `pg_cron` et sa configuration de déploiement restent à documenter de façon reproductible sans jamais mettre le secret dans Git.


### Adaptateur catalogue Sentinel-2 ajouté au dépôt — 23 octobre 2026

Le fichier `supabase/functions/copernicus-sentinel-catalogue/index.ts` est maintenant versionné. Il s'agit d'une fonction **en lecture seule**, non encore déployée en production.

- Authentifie l'utilisateur et vérifie l'accès au lieu par la lecture RLS de `locations`.
- Interroge le catalogue STAC Copernicus pour la collection `sentinel-2-l2a`, sur une fenêtre temporelle maximale de 180 jours et un maximum de 20 scènes par requête.
- Retourne les métadonnées de scène (date, couverture nuageuse, plateforme, emprise et lien catalogue), sans télécharger d'images ni écrire dans la base.
- La zone de recherche est une boîte régionale autour du point enregistré. Elle ne représente pas la parcelle et ne permet pas d'affirmer qu'une scène couvre exactement la culture suivie.
- Les scènes filtrées par couverture nuageuse ne garantissent pas l'absence de nuages sur la parcelle. Aucun NDVI/NDMI ni conseil agronomique n'est calculé.

**Avant déploiement :** exécuter CI, tester une requête STAC réelle et les cas d'accès refusé/coordonnées absentes, vérifier le schéma des propriétés retournées par le fournisseur, puis déployer explicitement la fonction. À ce stade, aucune donnée satellite n'est persistée dans `environmental_observations`.
