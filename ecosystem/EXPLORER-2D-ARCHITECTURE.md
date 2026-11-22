# BA Labs — architecture de l’explorateur 2D Vernpixi

## Principe directeur
L’Academy est la référence de l’identité spatiale et taxonomique : centre BA Labs, huit univers canoniques, ordre localisé, ancres, palette et géométrie. L’explorateur public reprend ces identifiants et ces positions à l’identique. Sa différence se limite au contenu des ramifications : fiches scientifiques publiques plutôt que modules pédagogiques.

## Dépendance à la géométrie canonique Academy
Le code Academy actuellement présent sur la branche de référence expose les huit racines et le moteur partagé, mais ne publie pas encore un nœud central BA Labs distinct des huit univers. La géométrie du noyau partagé comporte actuellement huit ancres, dont une proche du centre. Cette PR ne fabrique donc pas un centre concurrent et ne modifie pas le moteur partagé. La dernière étape de parité spatiale (un centre BA Labs indépendant entouré des huit univers) sera raccordée depuis la définition Academy dès qu'elle sera disponible dans le dépôt.

## Architecture technique
- **PixiJS v8 / WebGL** : rendu du champ biologique dans `../ecosystem-core/explorer-2d-pixi.js`, partagé par Academy et public.
- **Graphe Vernpixi** : `../ecosystem-core/explorer-2d-network.js` construit les huit univers, les ramifications hiérarchiques, les liens documentés et les anastomoses.
- **Contrôleur public** : `explorer-2d.js` gère chargement des arbres localisés, caméra, gestes, sélection et navigation accessible.
- **Données publiques** : `notion-tree.fr/en/ar/pt.json`. Chaque racine conserve son identifiant de domaine scientifique et porte `academyUniverseId`, l’identité canonique Academy correspondante.
- **Interface** : DaisyUI fournit les commandes et la fiche de sélection; PixiJS dessine le réseau.
- **Séparation** : cette adaptation ne modifie ni le contrôleur Academy, ni ses arbres, ni le moteur 3D historique.

## Correspondance des univers
| Univers Academy | Racine scientifique publique |
|---|---|
| MYCOLOGIE | Microbiologie & sciences cellulaires |
| BIOTECHNOLOGIE | Bioprocédés & bioconversion |
| INSTRUMENTATION & AUTOMATISATION | Instrumentation, ingénierie & automatisation |
| AGROTECHNOLOGIE | Sciences végétales & agronomie |
| LABORATOIRE & EXPÉRIMENTATION | Sciences physiques, chimiques & modélisation |
| PRODUITS & RESSOURCES BIOLOGIQUES | Biomatières & biofabrication |
| RECHERCHE & DÉVELOPPEMENT | Intelligence numérique & données |
| RESSOURCES & TRANSMISSION | Sols, écosystèmes & environnement |

Les arbres publics sont ordonnés selon l’ordre Academy de chaque langue. Les titres affichés des huit racines reprennent exactement les titres Academy localisés. Les noms scientifiques restent dans les fiches et les branches.

## Rendu et interactions
- Un espace continu explorable par zoom progressif, sans remplacement de scène.
- Filaments organiques, ramifications latérales, bifurcations, anastomoses et particules suivant le graphe réel.
- Profondeur révélée progressivement selon le zoom; sélection et centrage d’un nœud.
- Seule l’action explicite « Ouvrir la ressource » ouvre Notion.
- Gestes souris et tactiles, liste DOM accessible et respect de `prefers-reduced-motion`.

## Critères d’acceptation
1. Huit racines publiques dans chaque langue, avec les mêmes identifiants canoniques, titres et ancres que l’Academy.
2. Les branches publiques restent issues des fiches scientifiques et conservent leurs liens Notion.
3. Le graphe public et le graphe Academy utilisent les mêmes modules PixiJS et Vernpixi.
4. Les tests vérifient l’alignement dans FR/EN/AR/PT.
5. Aucun changement au moteur Academy ou au moteur 3D.

## Statut
L’alignement public est préparé sur une branche dédiée. Ne pas publier avant les tests automatisés et une inspection visuelle du rendu dans un navigateur.
