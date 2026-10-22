# IoT et données publiques — architecture de raccordement

**État vérifié le 22 octobre 2026.** Cette note décrit le raccordement à réaliser ; elle ne signifie pas que le firmware a été qualifié ni que des données sont publiées.

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

## 2. Cible IoT minimale

1. **Identité d'appareil dédiée** : registre des appareils avec organisation, environnement, type, statut activé/révoqué et identifiant public non secret. Aucun secret partagé dans le dépôt Git.
2. **Entrée télémétrique dédiée** : Edge Function authentifiant chaque appareil avec un jeton distinct et révocable. Ne jamais exposer la clé `service_role` au firmware.
3. **Validation côté serveur** : liste de variables autorisées, unités contrôlées, plages plausibles, taille de lot limitée, horodatage appareil conservé comme donnée déclarée et horodatage de réception généré par le serveur.
4. **Idempotence** : chaque lecture possède un identifiant d'événement/mesure stable ; la répétition d'un envoi après une coupure réseau ne crée pas de doublons.
5. **Traçabilité** : créer un événement contextualisé à l'environnement puis une ligne dans `measurements`, avec `variable_code`, valeur, unité, méthode, instrument, état qualité et métadonnées de diagnostic.
6. **Mode déconnecté** : file locale bornée, reprise après reconnexion, aucun faux relevé si le capteur est absent ou invalide.
7. **Séparation mesure/commande** : la télémétrie est d'abord en lecture seule. Les commandes distantes d'actionneurs sont un chantier séparé avec authentification, expiration, journal d'audit et sécurité matérielle indépendante.

### Variables de départ
Mapper les capteurs vers les codes existants : `temperature` (degC), `relative_humidity` (%), `substrate_moisture` (% selon la méthode réelle) et `co2_concentration` (ppm). Ajouter une variable seulement si le catalogue ne couvre réellement pas la mesure. L'humidité du sol issue d'un ADC doit être documentée comme estimation calibrée localement, pas comme teneur volumique absolue.

## 3. Données publiques : ne jamais exposer directement les tables privées

La publication doit être une projection distincte, pas une ouverture de RLS sur `measurements`, `events`, `cultures` ou `environments`.

- **Privé par défaut** : aucune mesure n'est publique simplement parce qu'elle a été collectée par un capteur.
- **Consentement explicite et granulaire** : portée (lot, expérience, environnement ou jeu de données), version des conditions, profil de dé-identification, date d'accord et retrait.
- **Minimisation** : supprimer les identifiants d'organisation/utilisateur, les noms internes, coordonnées précises, notes libres et métadonnées pouvant révéler une recette ou une localisation. Agréger les horodatages/localisations si nécessaire.
- **Qualité visible** : distinguer données brutes, validées, exclues et données estimées ; exposer unités, méthode, instrument, calibration connue et limites.
- **Publication versionnée** : `commons_datasets` doit décrire un jeu effectivement exporté (version, politique de source, date, licence, schéma, nombre de lignes et empreinte), pas seulement un catalogue nominal.
- **Retrait opérant** : un retrait doit empêcher les exports futurs et entraîner le retrait des données contrôlées de la publication active ; préciser séparément ce qui a déjà été téléchargé par des tiers.
- **Séparation des accès** : API publique limitée à des vues ou fichiers pré-calculés et assainis ; aucun accès anonyme direct aux tables de travail.

## 4. Ordre de réalisation et critères de validation

### Étape A — contrat de données et sécurité
- Définir le schéma d'identité des appareils et le format d'un paquet de télémétrie.
- Vérifier les politiques RLS et les contraintes d'intégrité des tables de mesures/événements.
- Définir la matrice de variables, unités, plages, fréquence et précision par capteur.
- Définir le profil public et le cycle de vie du consentement.

### Étape B — ingestion sans commande distante
- Ajouter registre/secret d'appareil et fonction d'ingestion authentifiée.
- Ajouter déduplication et liaison des mesures à un environnement.
- Garder le firmware hors ligne tant que le contrat n'est pas testé ; ne pas inventer de valeurs de capteur.

### Étape C — publication contrôlée
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
