# Publication contrôlée des documents juridiques CultureOps

Ce document décrit le passage des pages juridiques de travail à des versions opposables utilisées par le mécanisme d'inscription. Il ne vaut pas validation juridique.

## 1. Conditions de publication

Ne pas publier une version tant que les points suivants ne sont pas réglés :
- dénomination juridique exacte de l'exploitant, forme, siège et identifiants d'immatriculation applicables ;
- coordonnées contractuelles et contact vie privée ;
- désignation et coordonnées du DPO, si requis ;
- finalités et bases juridiques détaillées dans le registre des traitements ;
- prestataires, rôles, sous-traitants et lieux de traitement confirmés ;
- transferts internationaux et formalités applicables validés ;
- durées de conservation et procédure de suppression/anonymisation définies ;
- droits des personnes et procédure de réponse opérationnelle définis ;
- texte relu et validé par le conseil compétent au regard du droit algérien applicable.

## 2. Contrôle de contenu

Pour chaque fichier destiné à être publié (legal/terms.html, legal/privacy.html, éventuellement legal/cookies.html) :
1. Supprimer tous les champs provisoires, crochets, formulations « à valider » et commentaires internes.
2. Vérifier que le texte visible correspond exactement au contenu relu.
3. Vérifier les liens, l'accessibilité mobile, la langue et la date d'entrée en vigueur.
4. Faire une revue finale du rendu public.
5. Calculer le SHA-256 du fichier final après gel du contenu. Toute modification ultérieure crée une nouvelle version et une nouvelle empreinte.

Une page de confidentialité est une information sur le traitement ; son affichage ou son accusé de prise de connaissance ne doit pas être décrit automatiquement comme un consentement. L'acceptation contractuelle des CGU et les consentements facultatifs (ex. réutilisation scientifique) sont des actes distincts.

## 3. Enregistrement du registre

Après validation seulement :
- attribuer un identifiant de version immuable à chaque document ;
- enregistrer document_type, version, content_sha256, document_path et effective_at dans private.legal_document_versions ;
- ne jamais réutiliser une version pour un contenu modifié ;
- ne pas remplacer un document publié : publier une nouvelle version et retirer l'ancienne selon une date définie ;
- vérifier que le contenu servi au navigateur correspond exactement à l'empreinte enregistrée ;
- publier via l'API `legal-document-registry` réservée à un administrateur plateforme, jamais depuis une console navigateur avec une clé privilégiée.

Les versions proposées pour l'inscription sont transmises dans options.data sous legal_terms_version et legal_privacy_version. Le client ne doit pas inventer ces valeurs ni les maintenir en dur dans plusieurs fichiers : elles devront provenir d'une configuration versionnée unique.

## 4. Activation progressive

Ordre requis :
1. Générer la migration via supabase migration new dans le dépôt local, jamais en inventant un nom de migration.
2. Exécuter les tests SQL localement, y compris les tests comportementaux du hook, du trigger, de l'immutabilité et des privilèges.
3. Exécuter Supabase Advisors et revoir les fonctions SECURITY DEFINER.
4. Appliquer la migration à l'environnement de test.
5. Configurer explicitement le hook Auth before-user-created vers public.hook_validate_signup_legal_versions.
6. Tester une inscription avec confirmation e-mail activée : la création doit être bloquée si une version est absente ou obsolète ; si elle est valide, les deux événements doivent être enregistrés avant la confirmation.
7. Tester les parcours d'invitation et OAuth avant de les autoriser.
8. Provisionner au moins un administrateur plateforme hors bande, après vérification d'identité ; ne pas utiliser un rôle `owner` ou `admin` d'organisation comme substitut.
9. Déployer la fonction Edge et tester les actions `list`, `publish` et `retire` avec un compte administrateur et un compte non-administrateur.
10. Après validation, préparer le déploiement production et conserver la preuve de la version déployée.

## 5. État au 11 novembre 2026

- Les pages juridiques sont des documents de travail avec des champs à compléter.
- Les tables et fonctions du Privacy & Audit Engine sont dans un brouillon SQL de revue, pas dans une migration active.
- Le hook Auth n'est pas configuré dans le projet.
- L'API Edge du registre et la console statique `legal/admin.html` sont versionnées mais non déployées ; la console n'est pas un contrôle d'accès et toutes les actions sont autorisées côté serveur.
- Aucun administrateur plateforme n'est provisionné par le code.
- Le formulaire d'inscription ne transmet pas encore d'identifiants de versions.
- Aucun document juridique n'est considéré comme publié par le registre.
- Aucune modification du schéma live n'a été effectuée dans le cadre de ce chantier.

Règle de sécurité : ne pas activer le hook tant que le registre ne contient pas les versions réellement validées et publiées. Son activation prématurée bloquerait les nouvelles inscriptions ; son absence après déploiement de la fonction ne constitue pas une preuve d'acceptation.