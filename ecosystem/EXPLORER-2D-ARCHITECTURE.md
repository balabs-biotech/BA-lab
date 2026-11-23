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

### Centre et noyau mycologique

Le logo BA Labs occupe le centre visuel de la composition. Le noyau mycologique se développe autour de cette identité sous une forme organique évoquant un Y vivant : un tronc commun, des bifurcations et des prolongements qui distribuent le réseau.

La mycologie est un noyau de connexion privilégié, pas une catégorie décorative ni un simple bouton central. Elle relie les territoires et donne sa cohérence biologique à l’ensemble.

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

Chaque territoire possède sa propre identité visuelle, ses branches, sous-branches et ressources. Les territoires ne doivent pas être disposés comme huit satellites équidistants autour d’un hub. Leur implantation est irrégulière, organique et guidée par la topologie des connaissances.

### Ramifications et connexions transversales

Les descendants des pages Notion forment les ramifications locales. Les relations transversales ne sont créées que lorsqu’elles sont soutenues par des relations Notion ou des éléments de contenu identifiables et vérifiables.

Le réseau doit distinguer :
- les liens de parenté à l’intérieur d’un territoire ;
- les connexions transversales entre territoires ;
- les liens du noyau mycologique vers les territoires ;
- les nouvelles ramifications ajoutées lorsque la connaissance s’enrichit.

Aucune connexion ne doit être ajoutée uniquement pour remplir visuellement l’espace. L’organisme peut être asymétrique et présenter des densités différentes selon les contenus disponibles.

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
