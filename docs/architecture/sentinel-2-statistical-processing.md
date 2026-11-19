# Sentinel-2 : trajectoire vers les indicateurs de végétation

État au 23 octobre 2026. Cette note complète le catalogue STAC existant ; elle ne prétend pas que le calcul d'indices est déjà déployé.

## État actuel

- La fonction `copernicus-sentinel-catalogue` authentifie l'utilisateur, vérifie l'accès RLS à `locations` et retourne des métadonnées Sentinel-2 L2A.
- Elle ne télécharge aucune image, ne calcule aucun indice et n'écrit aucune observation satellite.
- Le test `supabase/tests/copernicus-sentinel-catalogue.test.mjs` est exécuté par la CI.
- Le champ de coordonnées actuel décrit un point ; il ne constitue pas un contour de parcelle.

## Voie de traitement retenue pour le prototype

Tester l'API statistique Sentinel Hub du Copernicus Data Space Ecosystem (CDSE), endpoint `https://sh.dataspace.copernicus.eu/statistics/v1`. Elle retourne des statistiques JSON et évite de télécharger les rasters complets.

L'accès à cette API requiert un client OAuth CDSE. Le quota gratuit des utilisateurs généraux est limité (les quotas officiels indiquent notamment 10 000 requêtes et 10 000 Processing Units par mois, ainsi que des limites par minute). Ce quota est partagé à l'échelle du compte CDSE : il faut donc appliquer des limites d'usage dans BA Labs et ne pas promettre un service illimité.

Documentation officielle :
- API statistique : https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html
- Authentification OAuth : https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html
- Quotas : https://documentation.dataspace.copernicus.eu/Quotas.html
- Exemples d'evalscript et de masque : https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical/Examples.html

## Contrat fonctionnel envisagé

### Entrée

- `location_id` obligatoire, vérifié avec le jeton utilisateur et les règles RLS.
- Géométrie GeoJSON Polygon/MultiPolygon fournie par un contour de parcelle enregistré et validé. Ne pas traiter le point de localisation comme une parcelle.
- Fenêtre temporelle passée, limitée (prototype : 90 jours).
- Résolution de calcul explicitement fixée à 10 ou 20 m ; préférer 20 m pour commencer à cause de SCL.
- Aucun paramètre d'evalscript arbitraire fourni par le navigateur.

### Calcul

- Source Sentinel-2 L2A, bandes B04 (rouge), B08 (proche infrarouge), SCL et `dataMask`.
- NDVI : `(B08 - B04) / (B08 + B04)`, uniquement si le dénominateur est positif et les bandes sont finies.
- Exclure les pixels `dataMask=0`, nuages, cirrus, ombres et pixels sans données au moyen de SCL. Documenter les classes exactes et les exclusions.
- Retourner moyenne, médiane si prise en charge, nombre de pixels valides, proportion de pixels valides, fenêtre de dates, scène/intervalle, paramètres de masque et version de l'evalscript.
- Si la couverture valide est trop faible, retourner un statut qualité insuffisante au lieu d'un NDVI présenté comme fiable.
- Ne pas convertir un NDVI isolé en diagnostic de maladie, besoin d'irrigation ou rendement.

### Sécurité et coûts

- Stocker `CDSE_CLIENT_ID` et `CDSE_CLIENT_SECRET` comme secrets Supabase côté serveur uniquement. Ne jamais les exposer au navigateur ou dans Git.
- Obtenir le jeton OAuth une fois et le réutiliser jusqu'à expiration ; ne pas demander un nouveau jeton pour chaque appel statistique.
- Ajouter un cache de résultats indexé par organisation, géométrie/version du contour, dates, résolution, source et version d'evalscript.
- Limiter les requêtes par utilisateur/organisation et traiter proprement les réponses 401, 403, 429, 5xx et timeouts. Ne jamais réessayer sans limite.
- Persister les agrégats dans `environmental_observations` avec `data_family='satellite'`, fournisseur, jeu de données, date d'observation, résolution, qualité, URL/source et provenance dans `metadata`. Pas de stockage de rasters dans cette table.
- Garder les observations en lecture seule pour les clients ; l'ingestion reste côté serveur.

## Bloquants avant déploiement

1. Créer le client OAuth CDSE et configurer les secrets côté Supabase.
2. Choisir et implémenter un modèle de contours de parcelles, avec validation GeoJSON et accès par organisation.
3. Tester l'evalscript contre les exemples officiels et ajouter des tests unitaires de masque, dénominateur nul, pixels NoData et qualité insuffisante.
4. Ajouter un test de contrat pour l'authentification, l'autorisation, le cache et les limites de quota.
5. Déployer seulement après test d'une requête authentifiée réelle et vérification qu'aucun secret n'apparaît dans le bundle frontend, les logs ou Git.

## Critères d'acceptation du premier prototype

- Une session d'une autre organisation ne peut ni lire ni déclencher le calcul pour la parcelle.
- Le même calcul demandé deux fois avec les mêmes paramètres utilise le cache.
- Une réponse vide ou majoritairement masquée ne génère pas une valeur présentée comme fiable.
- Chaque valeur affichée peut être retracée jusqu'au fournisseur, à la période, à la résolution et à la version du traitement.
- La recherche catalogue continue de fonctionner même si les secrets ou quotas de l'API statistique ne sont pas disponibles.
