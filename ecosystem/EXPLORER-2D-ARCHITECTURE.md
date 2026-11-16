# BA Labs — architecture cible de l’explorateur 2D

## Objectif
Développer une expérience 2D immersive sur une page secondaire, comparée au moteur 3D historique avant toute bascule. La page principale conserve son moteur 3D pendant cette phase.

## Architecture retenue
- **Canvas 2D natif** : rendu des filaments, connexions, jonctions et particules. Les libellés sont dessinés en coordonnées écran et conservent une taille fixe pendant le zoom.
- **Données existantes** : lecture de `notion-tree.fr.json`, `en`, `ar` ou `pt`. Pas de duplication de contenu ni de nouvelle base.
- **DaisyUI 5.8.1** : couche d’interface uniquement — navbar, boutons, badges, breadcrumbs, carte de sélection et sélecteur de langue. Le thème reprend le graphite pétrole, le vert minéral, le cuivre et le gris minéral de BA Labs.
- **Navigation hiérarchique** : vue des huit univers, sélection d’un nœud, exploration explicite de ses enfants, fil d’Ariane et retour au niveau précédent. Les ressources ouvrent leur URL Notion.
- **Gestes** : déplacement, zoom molette, pincement tactile, commandes visibles de zoom et recentrage.
- **Accessibilité** : liste DOM des nœuds visibles pour clavier et technologies d’assistance; prise en compte de `prefers-reduced-motion`; libellés ARIA.
- **Comparaison** : lien de retour au moteur 3D, sans suppression ni modification du moteur historique.

## DaisyUI : règles
DaisyUI ne doit pas dessiner le réseau biologique. Il sert aux commandes et aux éléments de contexte. Aucun panneau latéral permanent; la fiche de sélection est compacte et flottante. Le moteur Canvas reste indépendant de DaisyUI.

## Critères d’acceptation
1. Les huit univers sont affichés et sélectionnables.
2. Les sous-branches s’ouvrent à chaque niveau avec un fil d’Ariane fonctionnel.
3. Chaque feuille ouvre sa bonne URL Notion.
4. Les quatre langues et le RTL arabe sont pris en charge.
5. La taille du texte reste constante au zoom.
6. Les interactions tactiles, souris et clavier restent utilisables.
7. Le moteur 3D reste disponible comme version de comparaison.
8. Tester les performances sur mobile avant de promouvoir le 2D.

## Étape actuelle
Cette branche ajoute le shell DaisyUI et le moteur Canvas 2D hiérarchique. Le layout organique est déterministe; une simulation de croissance plus poussée viendra après validation de la navigation, des données et des performances.
