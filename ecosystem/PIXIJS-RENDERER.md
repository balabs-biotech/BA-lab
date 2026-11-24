# PixiJS 2D — moteur public BA Labs

## Périmètre et séparation

Ce document décrit exclusivement le renderer du site public BA Labs.

- `explorer-2d-pixi.js` : renderer PixiJS/WebGL autonome du site public.
- `explorer-2d-graph.js` : topologie publique, centre mycologique, huit points d’inoculation, ramifications déterministes et relations transversales documentées.
- `explorer-2d.js` : données, caméra, gestes, sélection, internationalisation et navigation accessible.
- `../ecosystem-core/explorer-2d-pixi.js` et `../ecosystem-core/explorer-2d-network.js` : moteurs historiques de l’Academy, conservés indépendamment.

Le site public ne doit plus importer le renderer PixiJS de l’Academy. Les deux moteurs partagent uniquement un contrat visuel : identité BA Labs, noyau mycologique, ordre des huit territoires et leurs repères chromatiques. Leurs rendus, géométries, interactions et cycles de vie restent indépendants.

## Organisme et topologie

L’espace public représente un organisme scientifique continu :
- identité BA Labs au centre ;
- mycologie comme tissu vivant de connexion ;
- huit territoires autonomes : `microbiology`, `plants`, `ecology`, `bioprocesses`, `biomaterials`, `instrumentation`, `digital`, `physical` ;
- un point d’inoculation stable par territoire ;
- des ramifications déterministes dont la position dépend des contenus et de leur hiérarchie ;
- des hyphes transversales uniquement lorsqu’une relation documentée relie deux territoires.

La vue globale ne doit pas afficher toutes les relations transversales en même temps : elles sont révélées à la sélection d’un nœud lié, puis en totalité au zoom rapproché. Cette progressive disclosure évite que les relations documentées forment une toile dominante qui masque les filaments hiérarchiques.

L’ajout d’une ressource dans un territoire ne doit pas déplacer ni recolorer les sept autres. Les huit coordonnées actuelles sont provisoires : l’asset source du logo officiel doit encore être ajouté pour caler précisément les points d’inoculation sur le symbole de marque.

## Rendu biologique

Le renderer doit distinguer explicitement :
- **hyphes primaires** : tissu de connexion entre le noyau mycologique et les huit points d’inoculation ;
- **ramifications secondaires et tertiaires** : arêtes réelles de la hiérarchie Notion, avec épaisseur et intensité décroissantes selon la génération ;
- **anastomoses transversales** : relations Notion ou relations de contenu vérifiables, plus fines et moins lumineuses que les filaments hiérarchiques ;
- **pointes de croissance** : extrémités ouvertes et effilées, sans bille terminale.

Aucune branche latérale décorative ne doit être inventée par le renderer pour remplir l’espace. Une bifurcation visible doit correspondre à une ramification réelle du graphe. Les courbures, dérives et épaisseurs peuvent varier de façon déterministe pour donner une morphologie rhizomorphique, sans créer de nouveaux liens. Les ramifications doivent alterner un déport latéral marqué autour de leur direction de croissance héritée. Elles dessinent des trajectoires rhizomorphiques qui se déplacent sur le côté, bifurquent et changent de direction ; elles ne doivent pas former une étoile de rayons ni des éventails réguliers autour des points d’inoculation.

Les filaments sont tracés par des courbes de Bézier cubiques à deux contrôles indépendants. Le premier contrôle détermine la sortie du filament, le second son approche de la branche cible. Leurs orientations et leurs déports peuvent différer pour créer des courbures en S et des inflexions organiques. Le déplacement latéral reste une propriété de placement des nœuds du graphe ; la courbe ne doit pas créer de nœud, de branche ou de relation supplémentaire.

La couleur du filament doit provenir du territoire auquel il appartient, y compris pour les huit hyphes primaires issues du noyau central. Les liens transversaux restent visuellement secondaires. Le fond, les halos et les particules doivent rester sobres et ne pas concurrencer les structures biologiques.

## Interaction et lisibilité

- Un seul champ 2D continu ; zoom et panoramique sans changement de scène.
- Zoom molette, boutons et pincement tactile.
- La sélection centre la caméra et révèle la fiche de ressource.
- L’ouverture de Notion reste une action explicite dans la fiche.
- Les labels apparaissent progressivement selon le zoom et évitent les collisions.
- La navigation DOM/clavier expose les mêmes contenus.
- `prefers-reduced-motion` réduit les animations non essentielles.
- Les animations doivent être suspendues lorsque l’explorateur est hors écran ou que l’onglet est masqué.

## Validation

Avant toute fusion :
1. vérifier la topologie dans FR / EN / AR / PT ;
2. vérifier l’absence de géométrie héritée des trois bras dans le renderer public ;
3. vérifier que les ramifications visibles correspondent aux arêtes du graphe ;
4. exécuter les tests navigateur desktop et mobile ;
5. contrôler les labels, le cadrage, les performances WebGL et `prefers-reduced-motion` ;
6. confirmer que l’Academy conserve son renderer et ses comportements historiques.

## Hors périmètre

Aucune modification de CultureOps, des expériences 3D historiques, de l’hébergement GitHub Pages ou du moteur Academy dans le cadre de ce chantier.
