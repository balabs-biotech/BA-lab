# PixiJS 2D — moteur de l’organisme BA Labs

## Périmètre

Ce document décrit le rendu 2D du **site public BA Labs**. Il ne redéfinit ni le moteur de l’Academy, ni CultureOps, ni les expériences 3D historiques.

- `../ecosystem-core/explorer-2d-pixi.js` : renderer PixiJS/WebGL partagé lorsqu’il est réutilisé par les interfaces.
- `explorer-2d-graph.js` : topologie dédiée au graphe du site public.
- `explorer-2d.js` : chargement des données, caméra, gestes, sélection, internationalisation et navigation accessible.
- Les arbres Notion FR / EN / AR / PT restent la source de vérité pour les contenus et leurs identifiants.

## Modèle de l’organisme

Le graphe public représente BA Labs comme un organisme scientifique global composé de territoires autonomes et interconnectés.

1. Le symbole BA Labs est le repère central de la composition ; il doit reprendre la même identité visuelle que l’Academy.
2. La mycologie constitue le noyau biologique au centre, intégré au signe de marque et prolongé par le réseau de filaments.
3. Le Y du logo sert de géométrie d’inoculation, pas de classification rigide en trois bras.
4. Les huit univers prennent leurs points d’ancrage autour du centre selon les huit repères du symbole BA Labs.
5. Les univers sont exactement `microbiology`, `plants`, `ecology`, `bioprocesses`, `biomaterials`, `instrumentation`, `digital` et `physical`.
6. Chaque univers développe une croissance fractale organique à partir de ses pages et sous-pages Notion.
7. Des connexions transversales relient les territoires lorsque les relations sont étayées par les données Notion ou par des éléments de contenu vérifiables.

Le centre, les huit univers, leur ordre et leur identité chromatique constituent un contrat visuel partagé avec l’Academy. Les deux expériences gardent leurs moteurs, interactions et comportements propres. Les territoires ne sont ni des satellites décoratifs ni des secteurs fermés : ils restent autonomes, identifiables et connectés au tissu mycologique.

## Topologie et preuve des relations

- Les liens parent-enfant suivent strictement la hiérarchie des arbres Notion.
- Les liens transversaux conservent leur base de preuve : relation Notion explicite ou relation fondée sur le contenu.
- Les connexions entre territoires doivent être traçables et ne doivent jamais être inventées pour améliorer la symétrie.
- Les ramifications peuvent croître à mesure que les manifests Notion évoluent ; les identifiants stables doivent préserver la continuité.
- La géométrie est déterministe, fractale dans sa croissance, asymétrique et non radiale.
- Les huit points d’ancrage et les couleurs de premier niveau doivent être communs au site public et à l’Academy.
- Les ramifications internes appartiennent à leur univers ; leur croissance ne doit pas déplacer arbitrairement les sept autres territoires.
- Les anastomoses locales sont limitées, irrégulières et fondées sur des relations de contenu ; elles ne doivent pas créer de grille ni de toile confuse.
- Le cadrage initial doit inclure le centre et les huit ancrages sans couper les labels sur mobile.

## Rendu biologique

PixiJS dessine un champ continu de filaments, de nœuds et de particules :
- hyphes primaires, secondaires et tertiaires, avec variations de longueur, courbure et épaisseur ;
- bifurcations irrégulières qui évoquent une croissance rhizomorphique depuis chaque point d’inoculation ;
- anastomoses locales, rares et correspondant à des relations réelles ;
- densité qui augmente avec l’exploration et le niveau de zoom ;
- particules qui suivent les arêtes du graphe plutôt que de dériver sans relation ;
- niveaux de détail et labels adaptés à la caméra.

La référence visuelle est un mycélium rhizomorphique qui colonise une gélose depuis plusieurs points d’inoculation, avec une logique de croissance fractale. Le rendu doit rester maîtrisé : les territoires et leurs couleurs doivent être identifiables, les branches principales hiérarchisées et les connexions transversales moins dominantes. L’effet doit être organique, fin et lisible, sans fouillis, sans roues de satellites ni géométrie répétitive.

## Interaction

- Panoramique et zoom molette, boutons et pincement tactile.
- La caméra se centre sur le nœud sélectionné et révèle son voisinage.
- La sélection ne déclenche jamais automatiquement une navigation externe.
- La fiche de sélection expose un lien Notion explicite.
- La navigation DOM accessible et clavier doit offrir le même comportement.
- `prefers-reduced-motion` réduit ou désactive les mouvements non essentiels.

## Performance et validation

- Conserver des identifiants et une topologie déterministes.
- Éviter les allocations répétées de Graphics à chaque frame ; privilégier les conteneurs et géométries retenus.
- Contrôler la densité des filaments, les collisions de labels et le coût des particules sur mobile.
- Vérifier le rendu WebGL sur desktop et mobile réel ou via un navigateur automatisé avec WebGL.
- Ne pas augmenter la densité visuelle au détriment de la lisibilité ou de la fluidité.

## Hors périmètre

- Garder les moteurs et interactions du site public et de l’Academy indépendants ; seul leur contrat visuel central (logo, huit univers, ordre, ancrages et couleurs) est commun.
- Ne pas modifier CultureOps.
- Ne pas modifier les moteurs 3D historiques.
- Ne pas changer l’hébergement GitHub Pages dans le cadre de ce chantier.

## État

La branche `rebuild/public-mycology-constellation` porte la refonte du site public. La topologie à trois bras fixes ne correspond pas à la direction biologique fractale désormais retenue ; elle doit être remplacée par huit points d’inoculation alignés sur le symbole BA Labs, puis des ramifications contrôlées propres à chaque univers. La PR ne doit pas être fusionnée ni déployée avant validation complète.
