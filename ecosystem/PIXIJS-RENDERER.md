# PixiJS 2D — moteur de l’organisme BA Labs

## Périmètre

Ce document décrit le rendu 2D du **site public BA Labs**. Il ne redéfinit ni le moteur de l’Academy, ni CultureOps, ni les expériences 3D historiques.

- `../ecosystem-core/explorer-2d-pixi.js` : renderer PixiJS/WebGL partagé lorsqu’il est réutilisé par les interfaces.
- `explorer-2d-graph.js` : topologie dédiée au graphe du site public.
- `explorer-2d.js` : chargement des données, caméra, gestes, sélection, internationalisation et navigation accessible.
- Les arbres Notion FR / EN / AR / PT restent la source de vérité pour les contenus et leurs identifiants.

## Modèle de l’organisme

Le graphe public représente BA Labs comme un organisme scientifique global composé de territoires autonomes et interconnectés.

1. L’identité BA Labs et son logo occupent le centre visuel.
2. Le noyau mycologique forme le tissu de connexion privilégié de l’organisme.
3. Les huit territoires autonomes sont `microbiology`, `plants`, `ecology`, `bioprocesses`, `biomaterials`, `instrumentation`, `digital` et `physical`.
4. Chaque territoire développe ses propres ramifications à partir de ses pages et sous-pages Notion.
5. Des connexions transversales relient les territoires lorsque les relations sont étayées par les données Notion ou par des éléments de contenu vérifiables.

Le noyau mycologique ne doit pas être traité comme un hub en étoile auquel huit satellites seraient suspendus. Il doit apparaître comme une structure vivante qui traverse, relie et nourrit l’organisme. Les territoires gardent néanmoins leur autonomie topologique et éditoriale.

## Topologie et preuve des relations

- Les liens parent-enfant suivent strictement la hiérarchie des arbres Notion.
- Les liens transversaux conservent leur base de preuve : relation Notion explicite ou relation fondée sur le contenu.
- Les connexions entre territoires doivent être traçables et ne doivent jamais être inventées pour améliorer la symétrie.
- Les ramifications peuvent croître à mesure que les manifests Notion évoluent ; les identifiants stables doivent préserver la continuité.
- La géométrie est déterministe pour un même ensemble de données, mais asymétrique et non radiale.

## Rendu biologique

PixiJS dessine un champ continu de filaments, de nœuds et de particules :
- hyphes principales et secondaires ;
- bifurcations et ramifications irrégulières ;
- anastomoses correspondant à des connexions transversales réelles ;
- densité qui augmente avec l’exploration et le niveau de zoom ;
- particules qui suivent les arêtes du graphe plutôt que de dériver sans relation ;
- niveaux de détail et labels adaptés à la caméra.

La référence visuelle combine colonisation mycélienne sur gélose et réseau neuronal. L’effet doit rester organique, fin et lisible, sans tubes, anneaux de satellites, sphères décoratives, planètes ou rayons parfaitement symétriques.

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

- Ne pas modifier le graphe ou le renderer propre à l’Academy.
- Ne pas modifier CultureOps.
- Ne pas modifier les moteurs 3D historiques.
- Ne pas changer l’hébergement GitHub Pages dans le cadre de ce chantier.

## État

La branche `rebuild/public-mycology-constellation` porte la refonte du site public. La validation structurelle multilingue passe, mais le test navigateur de l’explorateur doit encore être corrigé et réussi. La PR ne doit pas être fusionnée ni déployée avant validation complète.
