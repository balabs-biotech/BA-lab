# Dunia / EO Africa — stratégie d’intégration pour BA Labs

Date de vérification : 2026-10-23

## Décision d’architecture

Dunia est une plateforme d’accès, de traitement et de diffusion de données d’observation de la Terre optimisée pour les usages en Afrique. Ce n’est pas un satellite unique et il ne faut pas supposer qu’elle fournit une API publique anonyme pour toutes les fonctions. Le site annonce l’accès gratuit aux téléchargements des collections EO et une enveloppe de calcul/stockage pour les premiers utilisateurs ; les quotas de calcul dépendent de l’éligibilité et de l’utilisation.

Sources officielles :
- Catalogue : https://dunia.esa.int/datasets
- Conditions d’utilisation/quota : https://dunia.esa.int/usage
- Vue d’ensemble Copernicus Data Space : https://dataspace.copernicus.eu/ecosystem/services/dunia
- Wiki Application Hub : https://wiki.dunia.esa.int/en/build/application-hub
- Quickstart Sandbox : https://wiki.dunia.esa.int/en/getting-started/quickstart
- Copernicus Data Space APIs : https://dataspace.copernicus.eu/analyse/apis

## Priorité des jeux de données

| Priorité | Source | Usage dans Culture Tracker | Limite importante |
|---|---|---|---|
| P0 | Sentinel-2 L2A | NDVI, suivi temporel de la végétation, indicateurs spectraux | Nuages/ombres ; une scène n’est pas un diagnostic de parcelle |
| P0 | Sentinel-1 | Observations radar malgré les nuages ; évolution de rétrodiffusion | Le signal radar dépend de la structure, de l’humidité et de la géométrie ; interprétation spécifique |
| P1 | Sentinel-3 | Contexte régional, variables de surface à plus grande échelle | Résolution généralement trop grossière pour de petites parcelles |
| P1 | SMOS | Contexte d’humidité des sols à grande échelle | Résolution très grossière : ne pas l’utiliser comme mesure de l’humidité d’une parcelle |
| P1 | Sentinel-5P | Contexte atmosphérique et certains polluants/gaz | Pas une mesure de santé de culture |
| P1 | COPERNICUS DEM 30m | Altitude, pente et contexte topographique | La page Dunia présente un DEM 30 m ; vérifier la couverture et la licence de la ressource choisie |
| P2 | Landsat-5/7/8 | Historique multispectral long terme | Capteurs, résolutions, périodes et lacunes différents |
| P2 | Envisat | Archives historiques et usages spécialisés | Vérifier disponibilité réelle, produit et période |
| P2 | GADM / geoBoundaries | Limites administratives et contexte géographique | Ne remplacent pas les limites de parcelles dessinées/validées par l’utilisateur |

## Architecture proposée

1. **Catalogue et accès initial** : conserver la fonction Supabase existante copernicus-sentinel-catalogue pour découvrir les scènes Sentinel-2 via STAC. Ne pas la remplacer simplement parce que Dunia est disponible.
2. **Prototype de traitement dans Dunia** : utiliser le Sandbox / Application Hub pour sélectionner une zone et une période, tester un calcul reproductible, puis exporter seulement des statistiques agrégées et leur provenance.
3. **Contrat de données commun** : normaliser chaque observation avec provider, dataset, variable, value, unit, observed_at, geometry/source_area, spatial_resolution_m, quality_flags, valid_pixel_fraction, processing_version, source_uri et created_at.
4. **Stockage Supabase** : réutiliser le schéma existant après audit ; ne pas créer une table ou une colonne supposée sans vérifier les migrations et politiques RLS. Les résultats satellitaires sont des observations environnementales, distinctes des mesures prises par capteurs physiques.
5. **Interface** : afficher date, résolution, couverture nuageuse/qualité, source et limites d’interprétation. Ne pas présenter une estimation satellite comme une mesure de terrain.
6. **Production automatisée** : seulement après avoir confirmé une méthode d’accès automatisable et ses conditions d’utilisation. Les identifiants Dunia/CDSE, s’ils sont nécessaires, doivent rester dans les secrets côté serveur, jamais dans le JavaScript du navigateur.

## Premier indicateur à valider

Commencer par Sentinel-2 L2A et le NDVI :
- formule : (B08 - B04) / (B08 + B04) ;
- masquer nuages, cirrus, ombres et pixels NoData à l’aide des couches de classification appropriées ;
- gérer explicitement un dénominateur nul ;
- conserver le nombre de pixels valides et leur fraction ;
- comparer la série temporelle à des observations réelles de culture avant de formuler des recommandations.

Ne pas déduire directement un besoin d’irrigation à partir du seul NDVI. Pour l’irrigation, combiner météo, bilan hydrique, stade cultural, sol et mesures de terrain quand disponibles.

## Points à vérifier dans le compte Dunia

- Compte activé et quota de calcul/stockage affiché.
- Dans le Sandbox / Application Hub, accès aux données nécessaires pour une zone en Algérie.
- Existence d’un exemple officiel ou d’une API documentée permettant une exécution automatisée sans interaction manuelle.
- Modalités d’export et conditions de redistribution des produits dérivés.
- Possibilité d’exécuter le traitement sans consommer inutilement le quota.

## Critères d’acceptation avant déploiement

- Un cas test sur une zone connue et une période définie.
- Résultats reproductibles avec version du script et source enregistrées.
- Tests des masques nuages/ombres/NoData et du dénominateur nul.
- RLS vérifiée : chaque utilisateur ne lit que les observations associées à ses emplacements autorisés.
- Limites d’usage, mise en cache et gestion des erreurs testées.
- Aucun secret côté client et aucune promesse de disponibilité API non vérifiée.