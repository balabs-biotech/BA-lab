# CultureOps — architecture visuelle cible des animations sectorielles

Date: 2026-11-17
Périmètre: interface d'accueil des trois espaces CultureOps. Aucun changement aux données, à Supabase ou aux règles métier.

## Problème à corriger

L'illustration mycélienne ramifiée et le champ de particules générique en tête de page produisent un motif de « vermicelles » sans valeur fonctionnelle. Ils sont supprimés. L'animation doit identifier le secteur, pas décorer la page.

## Architecture cible

### 1. Contrat commun : SectorVisual
- Un seul conteneur `.ba-sector-visual` dans `.hero-art`.
- Le secteur est déterminé par `body[data-domain]`.
- Le moteur remplace l'ancien SVG générique au chargement et n'ajoute aucun contenu aux données métier.
- L'animation est isolée, non interactive par défaut, masquée aux lecteurs d'écran si elle n'apporte pas d'information.
- Aucun canvas plein écran ni effet global derrière le texte.

### 2. Trois animations distinctes
- **Mycology — croissance en boîte de Petri** : géométrie concentrique, anneaux de colonie qui progressent lentement et quelques spores indépendantes. Pas de réseau de filaments, pas de liens entre particules. tsParticles est limité au conteneur de l'illustration.
- **GreenTech — signal de croissance foliaire** : silhouette foliaire nette, nervure centrale et balayage lumineux lent. Quelques points de pollen peuvent dériver, sans réseau de lignes.
- **Laboratory — bioréacteur en fonctionnement** : cuve technique, niveau de liquide animé, bulles séparées et impulsion de mesure. La forme doit évoquer un instrument, pas un aquarium.

### 3. Rôle des bibliothèques
- **tsParticles** : particules ponctuelles localisées dans les illustrations qui en ont besoin. Configuration basse densité, 24–30 FPS, chargement différé, pause hors écran, aucune liaison entre points.
- **OriginKit** : référence de composition et de mouvement (Line Ripple / Glowing Particles / Rising Lines). Les motifs sont adaptés au langage visuel BA Labs et réimplémentés en SVG/CSS natifs dans cette application HTML/JS; aucune dépendance React/Tailwind n'est ajoutée à cette base.
- **PixiJS** : reste réservé aux visualisations 2D qui bénéficient réellement d'un canvas (notamment le graphe de filiation Mycology). Pas de moteur Pixi permanent pour une animation décorative de haut de page.

### 4. Règles de performance et accessibilité
- Respect de `prefers-reduced-motion`: illustration statique, aucune boucle.
- Sur mobile: densité réduite et animation bornée au conteneur; pas de canvas plein écran.
- Chargement du moteur uniquement si le secteur et son illustration sont présents et visibles.
- Arrêt/cleanup à la sortie de page; aucun ticker Pixi permanent.
- Le texte, la navigation et les formulaires restent au-dessus de l'illustration.
- Si CDN ou bibliothèque indisponible, l'illustration SVG/CSS reste visible.

### 5. Direction visuelle inchangée
- Mycology: graphite + cuivre/terracotta.
- GreenTech: graphite + vert botanique.
- Laboratory: graphite + bleu scientifique.
- Les animations sont discrètes, lentes et spécifiques au secteur. Elles ne remplacent ni les données, ni les titres, ni les contrôles de l'application.

## Première tranche d'implémentation
1. Remplacer le SVG mycélien ramifié et le champ de particules générique par un rendu sectoriel.
2. Ajouter les trois animations SVG/CSS avec tokens de couleur par secteur.
3. Charger tsParticles uniquement dans les scènes à spores/pollen, sans liens.
4. Conserver PixiJS pour le graphe de filiation, qui est une visualisation de données et non un décor.
5. Vérifier le smoke test des trois secteurs en desktop et mobile avant de qualifier le rendu de validé.