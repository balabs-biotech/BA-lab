# BA Labs — architecture cible de l’explorateur 2D

## Direction retenue
Un seul espace Canvas 2D continu, explorable par zoom progressif. Les huit univers, leurs branches, sous-branches et ressources restent dans le même espace et conservent leurs coordonnées. Cliquer sur un nœud ne change jamais de page ni de scène : le moteur centre le nœud, augmente le niveau de zoom et révèle les ramifications suivantes.

## Architecture
- **Canvas 2D natif** : filaments organiques, ramifications latérales, bifurcations, anastomoses, jonctions irrégulières et particules en mouvement.
- **Graphe hiérarchique global** : tous les descendants des huit arbres JSON sont positionnés dès le chargement. La profondeur est révélée progressivement selon le niveau de zoom; aucune navigation par remplacement de scène.
- **Zoom profond** : zoom molette, boutons et pincement tactile; caméra centrée sur le point de zoom; niveaux de zoom élevés pour parcourir les branches les plus fines.
- **Sélection directe** : toucher/clic sur un nœud sélectionne et centre la ressource. La fiche flottante propose explicitement le lien Notion, sans redirection automatique.
- **Données** : arbres notion-tree.fr/en/ar/pt.json, sans duplication de contenu.
- **DaisyUI 5.8.1** : commandes et fiche de sélection uniquement. Le réseau biologique reste dessiné par Canvas.
- **Accessibilité** : liste DOM des nœuds visibles, libellés ARIA et prise en compte de prefers-reduced-motion.

## Principes visuels
- Densité organique croissante avec le zoom, sans grille ni disposition en cartes.
- Ramifications secondaires et tertiaires visibles à mesure que la caméra s’approche.
- Anastomoses limitées et irrégulières pour relier le réseau sans créer une grille artificielle.
- Labels hiérarchisés : univers à la vue globale, ressources profondes au zoom rapproché.
- Palette BA Labs : graphite pétrole, vert minéral, cuivre oxydé et gris minéral.

## Critères d’acceptation
1. Les huit univers et tous leurs descendants sont chargés dans un graphe unique.
2. Le zoom révèle les sous-branches sans changer de page ni remplacer la scène.
3. Un clic sur un nœud centre et agrandit cette zone; seule l'action explicite « Ouvrir la ressource » ouvre Notion.
4. Le déplacement et le zoom fonctionnent à la souris et au tactile.
5. Les quatre langues FR/EN/AR/PT restent disponibles; arabe en RTL.
6. Le moteur 3D historique n'est pas modifié par ce travail.

## État
Refonte continue en cours sur la branche feat/continuous-mycelium-explorer. Le déploiement public ne doit intervenir qu'après revue et validation du rendu.
