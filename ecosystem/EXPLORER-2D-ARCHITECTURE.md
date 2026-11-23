# BA Labs — architecture cible de l’explorateur 2D

## Intention générale

L’explorateur représente BA Labs comme **un organisme scientifique global**, continu et évolutif. Il ne s’agit ni d’un organigramme, ni d’une roue de catégories, ni d’une constellation de huit satellites indépendants.

L’organisme possède :
- une identité centrale BA Labs, portée par le logo au cœur de la composition ;
- un noyau mycologique qui constitue le tissu vivant de connexion ;
- huit territoires scientifiques autonomes ;
- des ramifications internes propres à chaque territoire ;
- des connexions transversales documentées entre territoires.

Chaque territoire peut croître sans perdre son autonomie, tout en restant relié à l’organisme global.

## Modèle spatial et biologique

### Centre de marque et noyau mycologique

Le centre visuel reprend le symbole BA Labs fourni comme référence : même identité centrale pour le site public et l’Academy. Le logo n’est pas un simple nœud de plus dans le graphe ; c’est le repère de marque qui donne son origine à l’organisme.

La mycologie constitue le noyau biologique au centre de cette composition. Elle doit être perceptible dans le signe central et dans le tissu de filaments qui relie les huit territoires. Elle ne doit pas devenir une branche latérale, un neuvième univers ni un simple hub en étoile.

Le Y du logo sert de géométrie d’inoculation et de repère initial. Il ne dicte pas une classification en trois grands bras rigides. Les huit territoires prennent leurs points d’ancrage autour du centre selon la géométrie du symbole de marque.

### Huit territoires autonomes

Les huit territoires de premier niveau sont exactement :
1. `microbiology`
2. `plants`
3. `ecology`
4. `bioprocesses`
5. `biomaterials`
6. `instrumentation`
7. `digital`
8. `physical`

Les huit points d’ancrage, leur ordre et leurs couleurs forment un contrat visuel commun au site public et à l’Academy. Les deux moteurs peuvent avoir des interactions, des règles de navigation, des données et des comportements différents ; ils doivent néanmoins présenter le même centre BA Labs / mycologie et les mêmes huit territoires, avec les mêmes repères chromatiques.

Chaque territoire possède son identité chromatique, son point d’inoculation, sa propre densité et ses ramifications. Il reste autonome : ajouter une branche dans un territoire ne doit pas déplacer arbitrairement les autres territoires ni modifier leur identité.

### Croissance fractale contrôlée

La croissance évoque un mycélium rhizomorphique qui colonise progressivement une gélose depuis plusieurs points d’inoculation :
- un filament primaire se prolonge, puis se divise en branches secondaires et tertiaires ;
- les bifurcations sont irrégulières, asymétriques et déterministes pour un même jeu de données ;
- la direction, la longueur, la courbure et l’épaisseur varient selon la profondeur et le territoire ;
- les branches peuvent s’anastomoser lorsqu’une relation réelle relie deux connaissances ;
- la densité locale augmente avec le contenu disponible et le niveau de zoom ;
- les extrémités restent fines et ouvertes, pour suggérer une croissance encore possible.

La géométrie est fractale dans son principe de croissance, mais ne doit pas être une fractale mathématique répétitive. Les branches ne doivent pas se multiplier artificiellement pour remplir l’écran : chaque prolongement représente un contenu, une sous-discipline, une ressource ou une relation réelle.

### Lisibilité et maîtrise de la densité

L’organicité ne doit jamais redevenir le fouillis de l’ancienne version. La lisibilité repose sur des règles explicites :
- les huit territoires gardent des zones de croissance reconnaissables, sans être enfermés dans des secteurs ou des cercles ;
- les filaments principaux sont plus lisibles que les branches secondaires, qui sont elles-mêmes plus lisibles que les hyphes terminales ;
- les labels ne s’affichent qu’au niveau de zoom où ils peuvent être lus sans collision ;
- les connexions transversales sont plus fines et moins lumineuses que les branches hiérarchiques ;
- les anastomoses restent rares, locales et fondées sur des relations documentées ;
- la couleur du territoire accompagne les ramifications sans transformer le réseau en huit blocs colorés ;
- les zones denses se révèlent progressivement par zoom, plutôt que d’être toutes affichées à la même échelle.

Aucune connexion ne doit être ajoutée uniquement pour remplir visuellement l’espace. Le graphe peut rester asymétrique et présenter des densités différentes selon les contenus disponibles.

## Expérience d’exploration

- Un seul espace 2D continu, sans remplacement de scène.
- Zoom progressif : les ramifications secondaires et tertiaires apparaissent avec le niveau de détail.
- Déplacement libre et zoom à la souris, au clavier et au tactile.
- La sélection d’un nœud centre et rapproche la caméra sans quitter l’explorateur.
- La fiche de sélection propose une action explicite pour ouvrir la ressource Notion ; la sélection seule ne déclenche pas de navigation externe.
- La liste DOM accessible permet d’atteindre les nœuds au clavier.
- Les préférences `prefers-reduced-motion` sont respectées.

## Données et internationalisation

- Les quatre arbres Notion FR / EN / AR / PT restent les sources de vérité pour les territoires et leurs contenus.
- Les identifiants stables sont conservés entre langues.
- Les destinations Notion restent localisées.
- L’arabe utilise le sens de lecture RTL.
- Les relations transversales sont fondées sur les données disponibles ; leur preuve et leur type doivent rester traçables.

## Direction visuelle

- Référence biologique : mycélium qui colonise une gélose depuis un point d’inoculation, avec une densité et des ramifications qui augmentent progressivement.
- Référence complémentaire : réseau neuronal, avec des nœuds et des prolongements qui établissent des connexions.
- Filaments courbes, bifurcations irrégulières, anastomoses documentées, variations d’épaisseur et de densité.
- Lueur maîtrisée et particules qui suivent les connexions réelles.
- Palette BA Labs : graphite pétrole, vert minéral, cuivre oxydé et gris minéral.
- Pas de roue radiale, d’anneau de satellites, de planètes, de cartes radiales, de tubes décoratifs ou de connexions arbitraires.

## Critères d’acceptation

1. BA Labs est identifiable au centre de la composition.
2. La mycologie forme le noyau vivant de connexion, visuellement distinct des huit territoires.
3. Les huit territoires restent autonomes et peuvent se ramifier indépendamment.
4. Les connexions transversales relient les territoires uniquement sur la base de relations documentées.
5. L’ensemble est un organisme continu et asymétrique, pas un organigramme ni une roue.
6. Le zoom révèle les ramifications sans changer de page ni remplacer la scène.
7. La sélection ne déclenche pas automatiquement l’ouverture de Notion.
8. FR / EN / AR / PT, RTL, tactile et accessibilité clavier fonctionnent.
9. Le moteur de l’Academy, CultureOps et les expériences 3D historiques restent hors du périmètre de modification.

## État

La refonte du moteur du site public est en cours sur la branche `rebuild/public-mycology-constellation`. Aucun déploiement public ne doit intervenir avant validation des tests, inspection visuelle desktop/mobile et revue de la PR.
