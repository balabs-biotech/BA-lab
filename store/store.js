(()=>{'use strict';
const STORE_CATALOGUE_URL='https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/store-catalogue';
const STORE_PUBLISHABLE_KEY='sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992';
const STORE_REMOTE_CATALOGUE_ENABLED=false;
const STORE_ORDER_URL='https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/create-store-order';
const STORE_ORDER_ENABLED=false;
let products=[
{code:'BAL-LC-PPU-ETE-001',family:'liquid',kind:'PLEUROTUS PULMONARIUS',symbol:'P.',titles:{fr:'LC — Pleurotus pulmonarius · été',en:'LC — Pleurotus pulmonarius · summer',ar:'مزرعة سائلة — Pleurotus pulmonarius · الصيف',pt:'LC — Pleurotus pulmonarius · verão'},descriptions:{fr:'Culture liquide de Pleurotus pulmonarius — désignation « été ».',en:'Pleurotus pulmonarius liquid culture — “summer” designation.',ar:'مزرعة سائلة من Pleurotus pulmonarius — تسمية «الصيف».',pt:'Cultura líquida de Pleurotus pulmonarius — designação «verão».'},url:'https://app.notion.com/p/40173152f1718165a79ace1bc6189c24'},
{code:'BAL-LC-PPU-HIV-001',family:'liquid',kind:'PLEUROTUS PULMONARIUS',symbol:'P.',titles:{fr:'LC — Pleurotus pulmonarius · hiver',en:'LC — Pleurotus pulmonarius · winter',ar:'مزرعة سائلة — Pleurotus pulmonarius · الشتاء',pt:'LC — Pleurotus pulmonarius · inverno'},descriptions:{fr:'Culture liquide de Pleurotus pulmonarius — désignation « hiver ».',en:'Pleurotus pulmonarius liquid culture — “winter” designation.',ar:'مزرعة سائلة من Pleurotus pulmonarius — تسمية «الشتاء».',pt:'Cultura líquida de Pleurotus pulmonarius — designação «inverno».'},url:'https://app.notion.com/p/40173152f17181cab9f3e85af551ebde'},
{code:'BAL-LC-PER-HYB-001',family:'liquid',kind:'PLEUROTUS ERYNGII',symbol:'E.',titles:{fr:'LC — Pleurotus eryngii · hybrides',en:'LC — Pleurotus eryngii · hybrids',ar:'مزرعة سائلة — Pleurotus eryngii · هجائن',pt:'LC — Pleurotus eryngii · híbridos'},descriptions:{fr:'Culture liquide de Pleurotus eryngii — sélection hybride.',en:'Pleurotus eryngii liquid culture — hybrid selection.',ar:'مزرعة سائلة من Pleurotus eryngii — مجموعة هجينة.',pt:'Cultura líquida de Pleurotus eryngii — seleção híbrida.'},url:'https://app.notion.com/p/40173152f1718121bb57fd5eb152e64d'},
{code:'BAL-LC-POS-KRYOS-001',family:'liquid',kind:'PLEUROTUS OSTREATUS',symbol:'K.',titles:{fr:'LC — Pleurotus ostreatus · KRYOS',en:'LC — Pleurotus ostreatus · KRYOS',ar:'مزرعة سائلة — Pleurotus ostreatus · KRYOS',pt:'LC — Pleurotus ostreatus · KRYOS'},descriptions:{fr:'Culture liquide de Pleurotus ostreatus — KRYOS.',en:'Pleurotus ostreatus liquid culture — KRYOS.',ar:'مزرعة سائلة من Pleurotus ostreatus — KRYOS.',pt:'Cultura líquida de Pleurotus ostreatus — KRYOS.'},url:'https://app.notion.com/p/40173152f171813081afe4ef7766742b'},
{code:'BAL-LC-POS-GRISAM-001',family:'liquid',kind:'PLEUROTUS OSTREATUS',symbol:'G.',titles:{fr:'LC — Pleurotus ostreatus · Gris américain',en:'LC — Pleurotus ostreatus · American Grey',ar:'مزرعة سائلة — Pleurotus ostreatus · الرمادي الأمريكي',pt:'LC — Pleurotus ostreatus · Cinzento americano'},descriptions:{fr:'Culture liquide de Pleurotus ostreatus — Gris américain.',en:'Pleurotus ostreatus liquid culture — American Grey.',ar:'مزرعة سائلة من Pleurotus ostreatus — Gris américain.',pt:'Cultura líquida de Pleurotus ostreatus — Cinzento americano.'},url:'https://app.notion.com/p/40173152f17181388138ce462dc3596e'},
{code:'BAL-LC-POS-HK35-001',family:'liquid',kind:'PLEUROTUS OSTREATUS',symbol:'H.',titles:{fr:'LC — Pleurotus ostreatus · HK35',en:'LC — Pleurotus ostreatus · HK35',ar:'مزرعة سائلة — Pleurotus ostreatus · HK35',pt:'LC — Pleurotus ostreatus · HK35'},descriptions:{fr:'Culture liquide de Pleurotus ostreatus — HK35.',en:'Pleurotus ostreatus liquid culture — HK35.',ar:'مزرعة سائلة من Pleurotus ostreatus — HK35.',pt:'Cultura líquida de Pleurotus ostreatus — HK35.'},url:'https://app.notion.com/p/40173152f1718150a36eddc52198e963'},
{code:'BAL-LC-PPU-001',family:'liquid',kind:'PLEUROTUS PULMONARIUS',symbol:'P.',titles:{fr:'LC — Pleurotus pulmonarius',en:'LC — Pleurotus pulmonarius',ar:'مزرعة سائلة — Pleurotus pulmonarius',pt:'LC — Pleurotus pulmonarius'},descriptions:{fr:'Culture liquide de Pleurotus pulmonarius.',en:'Pleurotus pulmonarius liquid culture.',ar:'مزرعة سائلة من Pleurotus pulmonarius.',pt:'Cultura líquida de Pleurotus pulmonarius.'},url:'https://app.notion.com/p/40173152f17181ab8b0bd41a5832e355'},
{code:'BAL-LC-PCO-001',family:'liquid',kind:'PLEUROTUS COLUMBINUS',symbol:'C.',titles:{fr:'LC — Pleurotus columbinus',en:'LC — Pleurotus columbinus',ar:'مزرعة سائلة — Pleurotus columbinus',pt:'LC — Pleurotus columbinus'},descriptions:{fr:'Culture liquide de Pleurotus columbinus.',en:'Pleurotus columbinus liquid culture.',ar:'مزرعة سائلة من Pleurotus columbinus.',pt:'Cultura líquida de Pleurotus columbinus.'},url:'https://app.notion.com/p/40173152f17181c393c6c26aa5b9191b'},
{code:'BAL-LC-POS-P80-001',family:'liquid',kind:'PLEUROTUS OSTREATUS',symbol:'P80',titles:{fr:'LC — Pleurotus ostreatus · P80',en:'LC — Pleurotus ostreatus · P80',ar:'مزرعة سائلة — Pleurotus ostreatus · P80',pt:'LC — Pleurotus ostreatus · P80'},descriptions:{fr:'Culture liquide de Pleurotus ostreatus — P80.',en:'Pleurotus ostreatus liquid culture — P80.',ar:'مزرعة سائلة من Pleurotus ostreatus — P80.',pt:'Cultura líquida de Pleurotus ostreatus — P80.'},url:'https://app.notion.com/p/40173152f17181e7acbcd20c85566bc6'},
{code:'BAL-LC-POS-G8-001',family:'liquid',kind:'PLEUROTUS OSTREATUS',symbol:'G8',titles:{fr:'LC — Pleurotus ostreatus · G8',en:'LC — Pleurotus ostreatus · G8',ar:'مزرعة سائلة — Pleurotus ostreatus · G8',pt:'LC — Pleurotus ostreatus · G8'},descriptions:{fr:'Culture liquide de Pleurotus ostreatus — G8.',en:'Pleurotus ostreatus liquid culture — G8.',ar:'مزرعة سائلة من Pleurotus ostreatus — G8.',pt:'Cultura líquida de Pleurotus ostreatus — G8.'},url:'https://app.notion.com/p/40173152f17181f4888dc89c8c43ee76'},
{code:'BAL-LC-POS-BLUE-001',family:'liquid',kind:'PLEUROTUS OSTREATUS',symbol:'B.',titles:{fr:'LC — Pleurotus ostreatus · Blue Oyster',en:'LC — Pleurotus ostreatus · Blue Oyster',ar:'مزرعة سائلة — Pleurotus ostreatus · Blue Oyster',pt:'LC — Pleurotus ostreatus · Blue Oyster'},descriptions:{fr:'Culture liquide de Pleurotus ostreatus — Blue Oyster.',en:'Pleurotus ostreatus liquid culture — Blue Oyster.',ar:'مزرعة سائلة من Pleurotus ostreatus — Blue Oyster.',pt:'Cultura líquida de Pleurotus ostreatus — Blue Oyster.'},url:'https://app.notion.com/p/40173152f17181fc877cd198e7911eac'},
{code:'BAL-CUL-AGAR-001',family:'agar',kind:'WATER AGAR / MILIEU NON NUTRITIF',symbol:'WA',priceDzd:100,titles:{fr:'Water Agar — boîte non inoculée',en:'Water agar — uninoculated Petri dish',ar:'آغار مائي — طبق بتري غير ملقح',pt:'Ágar-água — placa de Petri não inoculada'},descriptions:{fr:'Boîte de Pétri contenant de la gélose à l’eau, non inoculée. Prête pour vos travaux d’isolement et de laboratoire. Prix unitaire.',en:'Petri dish containing uninoculated water agar. Ready for laboratory isolation work. Unit price.',ar:'طبق بتري يحتوي على آغار مائي غير ملقح، جاهز لأعمال العزل المخبري. سعر الوحدة.',pt:'Placa de Petri com ágar-água não inoculado, pronta para trabalhos laboratoriais de isolamento. Preço por unidade.'},url:'https://app.notion.com/p/3f473152f171812a814dd7b951786313'},
{code:'BAL-PETRI-INOC-001',family:'agar',kind:'INOCULATED PETRI DISH',symbol:'P.',priceDzd:2000,titles:{fr:'Boîte de Pétri inoculée · 1 souche',en:'Inoculated Petri dish · 1 strain',ar:'طبق بتري ملقح · سلالة واحدة',pt:'Placa de Petri inoculada · 1 estirpe'},descriptions:{fr:'Boîte de Pétri préparée et inoculée avec une souche. Prix unitaire confirmé.',en:'Prepared Petri dish inoculated with one strain. Confirmed unit price.',ar:'طبق بتري محضر وملقح بسلالة واحدة. السعر الفردي مؤكد.',pt:'Placa de Petri preparada e inoculada com uma estirpe. Preço unitário confirmado.'},url:''},
{code:'BAL-GRAIN-SPAWN-WHEAT-25-001',family:'spawn',kind:'INOCULATED WHEAT GRAIN SPAWN',symbol:'GS',priceDzd:1000,titles:{fr:'Blé inoculé — grain spawn · 2,5 kg',en:'Inoculated wheat grain spawn · 2.5 kg',ar:'حبوب قمح ملقحة · 2.5 كغ',pt:'Grão de trigo inoculado · 2,5 kg'},descriptions:{fr:'Grain spawn de blé inoculé, conditionné en contenant de 3 L. Poids annoncé : 2,5 kg. Prix unitaire.',en:'Inoculated wheat grain spawn in a 3 L container. Stated weight: 2.5 kg. Unit price.',ar:'حبوب قمح ملقحة في عبوة سعة 3 لترات. الوزن المعلن: 2.5 كغ. سعر الوحدة.',pt:'Grão de trigo inoculado num recipiente de 3 L. Peso indicado: 2,5 kg. Preço por unidade.'},url:''},
{code:'BAL-LC-SYR-10ML-001',family:'liquid',kind:'LIQUID CULTURE SYRINGE',symbol:'LC',priceDzd:5000,priceQualifier:{fr:'Prix envisagé · à confirmer',en:'Indicative price · to be confirmed',ar:'سعر تقديري · قيد التأكيد',pt:'Preço indicativo · a confirmar'},titles:{fr:'Seringue de culture liquide · 10 ml',en:'Liquid culture syringe · 10 ml',ar:'حقنة مزرعة سائلة · 10 مل',pt:'Seringa de cultura líquida · 10 ml'},descriptions:{fr:'Culture liquide conditionnée en seringue de 10 ml. Prix de vente envisagé, non définitif.',en:'Liquid culture supplied in a 10 ml syringe. Proposed, non-final selling price.',ar:'مزرعة سائلة في حقنة سعة 10 مل. سعر مقترح وغير نهائي.',pt:'Cultura líquida fornecida numa seringa de 10 ml. Preço proposto, ainda não definitivo.'},url:''}
];
const words={
fr:{
pageTitle:'Catalogue de ressources — BA Labs',metaDescription:'Cultures, milieux et ressources biologiques BA Labs. Consultez les références et contactez notre équipe pour confirmer disponibilité et conditions.',pageTitle:'Biological resources catalogue — BA Labs',metaDescription:'BA Labs cultures, media and biological resources. Browse references and contact our team to confirm availability and terms.',navCatalog:'Catalogue',navApproach:'Notre démarche',navEcosystem:'Écosystème',cart:'Sélection',
heroEyebrow:'BA LABS / RESSOURCES BIOLOGIQUES & APPLICATIONS',heroTitle:'La biotechnologie<br><em>en pratique.</em>',
heroText:'Des cultures, des milieux et des ressources biologiques issus de notre travail en laboratoire. Chaque référence est présentée avec ses informations utiles, dans une démarche de documentation et de traçabilité.',
explore:'Découvrir les références',heroAside:'RECHERCHE<br>→ CULTURE<br>→ APPLICATION',
introEyebrow:'DES RESSOURCES ISSUES DU LABORATOIRE',
introText:'Une sélection construite autour de la <strong>qualité biologique, de la traçabilité et de la documentation technique.</strong>',
introMeta:'SÉTIF · ALGÉRIE',
catalogEyebrow:'SÉLECTION BA LABS',catalogTitle:'Catalogue <em>des ressources</em>',
catalogDescription:'Consultez les références publiées. Les formats, les stocks, les prix définitifs et les modalités de remise sont confirmés lors de l’échange.',
filterAll:'Toutes',filterLiquid:'Cultures liquides',filterSpawn:'Grain spawn',filterAgar:'Milieux & gélose',
searchPlaceholder:'Rechercher un nom, une souche ou une référence…',catalogStatus:'RÉFÉRENCES AU CATALOGUE · DISPONIBILITÉ À CONFIRMER',
available:'Sur demande',details:'Documentation ↗',add:'Ajouter à ma sélection',
processEyebrow:'COMMENT FAIRE UNE DEMANDE',processTitle:'De la référence<br>à la <em>confirmation.</em>',
step1Title:'Explorer',step1Text:'Parcourez les références et consultez les informations disponibles.',
step2Title:'Sélectionner',step2Text:'Ajoutez les ressources souhaitées à votre sélection, sans créer de compte.',
step3Title:'Échanger',step3Text:'Nous vérifions ensemble la disponibilité, le conditionnement, le prix et les modalités de remise.',
ctaEyebrow:'BESOIN D’UN CONSEIL TECHNIQUE ?',ctaTitle:'Une ressource adaptée<br>commence par <em>un échange précis.</em>',
contactTeam:'Contacter BA Labs',footerText:'Biotechnologies appliquées · Cultures, ressources de laboratoire et solutions documentées.',
backEcosystem:'Retour à l’écosystème',legal:'Mentions légales',privacy:'Confidentialité',terms:'Conditions de vente',shipping:'Livraison & retours',privacySettings:'Confidentialité & cookies',
cartTitle:'Ma sélection',emptyCart:'Aucune référence sélectionnée pour le moment.',continueShopping:'Revenir au catalogue ↘',
cartDisclaimer:'Votre sélection est une demande de renseignements, pas une commande ferme. Les prix et la disponibilité restent à confirmer par BA Labs.',
requestQuote:'Préparer ma demande',guestNote:'Sans création de compte · Aucun paiement en ligne',
requestTitle:'Préparer votre<br><em>demande.</em>',
requestDescription:'L’envoi en ligne n’est pas encore activé. À ce stade, les informations saisies dans ce formulaire ne sont pas transmises. Copiez votre sélection, puis contactez BA Labs pour vérifier les disponibilités et les conditions.',
selectionHeading:'01 / VOTRE SÉLECTION',selectionNote:'Les prix, formats et disponibilités seront confirmés par BA Labs avant toute validation.',customerHeading:'02 / VOS COORDONNÉES',
copyRequest:'Copier ma sélection',copySuccess:'Sélection copiée',
integrationNote:'Formulaire en cours de raccordement : aucune coordonnée saisie ici n’est envoyée ni enregistrée. Seule la sélection de références peut être copiée.',
privacyNoticeTitle:'Vos données et votre vie privée',
privacyNoticeText:'Le panier et la préférence de langue sont conservés localement sur cet appareil. Cette version n’active aucun outil publicitaire ni suivi analytique non essentiel.',
understood:'Compris',learnMore:'Lire la politique de confidentialité',referenceCount:'références',emptySearch:'Aucune référence ne correspond à votre recherche.',
customerName:'Nom complet *',customerPhone:'Téléphone *',customerEmail:'Adresse e-mail (facultatif)',customerOrg:'Structure / organisation (facultatif)',customerWilaya:'Wilaya (facultatif)',deliveryMode:'Mode de remise souhaité',deliveryUnset:'À définir ensemble',deliveryPickup:'Retrait à Sétif',deliveryDelivery:'Livraison locale',deliveryShipping:'Expédition (à confirmer)',
customerMessage:'Message / précisions utiles (facultatif)',submitOrder:'Envoyer ma demande',orderNotActive:'Envoi en ligne non activé. Copiez votre sélection et contactez BA Labs.',orderSending:'Transmission en cours…',orderSuccess:'Demande transmise. BA Labs vous recontactera.',orderError:'La transmission a échoué. Vérifiez les informations et réessayez.',orderEmpty:'Votre sélection est vide.',
familyLiquid:'CULTURE LIQUIDE',familySpawn:'GRAIN SPAWN',familyAgar:'MILIEUX & GÉLOSE',pricePerUnit:'DA / unité',decreaseQty:'Diminuer la quantité',increaseQty:'Augmenter la quantité',removeItem:'Retirer de la sélection',skipCatalog:'Aller au catalogue',languageLabel:'Langue',openCart:'Ouvrir la sélection',closeCart:'Fermer la sélection',closeDialog:'Fermer la fenêtre',filterLabel:'Filtrer les références',searchLabel:'Rechercher dans le catalogue',legalNav:'Informations légales',honeypotLabel:'Ne pas remplir'
},
en:{
navCatalog:'Catalogue',navApproach:'Our approach',navEcosystem:'Ecosystem',cart:'Selection',
heroEyebrow:'BA LABS / BIOLOGICAL RESOURCES & APPLICATIONS',heroTitle:'Biotechnology<br><em>in practice.</em>',
heroText:'Cultures, media and biological resources developed through our laboratory work. Each listing is presented with practical information and a focus on documentation and traceability.',
explore:'Explore the references',heroAside:'RESEARCH<br>→ CULTURE<br>→ APPLICATION',
introEyebrow:'RESOURCES DEVELOPED IN THE LAB',
introText:'A curated selection built around <strong>biological quality, traceability and technical documentation.</strong>',
introMeta:'SÉTIF · ALGERIA',
catalogEyebrow:'BA LABS SELECTION',catalogTitle:'Resource <em>catalogue</em>',
catalogDescription:'Browse published references. Formats, stock, final prices and handover arrangements are confirmed during the enquiry.',
filterAll:'All',filterLiquid:'Liquid cultures',filterSpawn:'Grain spawn',filterAgar:'Media & agar',
searchPlaceholder:'Search by name, strain or reference…',catalogStatus:'CATALOGUE REFERENCES · AVAILABILITY TO BE CONFIRMED',
available:'On request',details:'Documentation ↗',add:'Add to my selection',
processEyebrow:'HOW TO MAKE AN ENQUIRY',processTitle:'From reference<br>to <em>confirmation.</em>',
step1Title:'Explore',step1Text:'Browse the references and review the available information.',
step2Title:'Select',step2Text:'Add the resources you are interested in to your selection. No account is required.',
step3Title:'Discuss',step3Text:'We will confirm availability, packaging, pricing and handover arrangements with you.',
ctaEyebrow:'NEED TECHNICAL GUIDANCE?',ctaTitle:'The right resource<br>starts with <em>a focused discussion.</em>',
contactTeam:'Contact BA Labs',footerText:'Applied biotechnology · Cultures, laboratory resources and documented solutions.',
backEcosystem:'Back to the ecosystem',legal:'Legal notice',privacy:'Privacy',terms:'Terms of sale',shipping:'Delivery & returns',privacySettings:'Privacy & cookies',
cartTitle:'My selection',emptyCart:'You have not selected any references yet.',continueShopping:'Return to the catalogue ↘',
cartDisclaimer:'Your selection is an enquiry, not a confirmed order. Prices and availability must be confirmed by BA Labs.',
requestQuote:'Prepare an enquiry',guestNote:'No account required · No online payment',
requestTitle:'Prepare your<br><em>enquiry.</em>',
requestDescription:'Online submission is not active yet. Information entered in this form is not transmitted at this stage. Copy your selection, then contact BA Labs to confirm availability and terms.',
selectionHeading:'01 / YOUR SELECTION',selectionNote:'Prices, formats and availability will be confirmed by BA Labs before any order is accepted.',customerHeading:'02 / YOUR DETAILS',
copyRequest:'Copy my selection',copySuccess:'Selection copied',
integrationNote:'Form connection is pending: contact details entered here are neither sent nor stored. You can copy your selected references only.',
privacyNoticeTitle:'Your data and privacy',
privacyNoticeText:'Your basket and language preference are stored locally on this device. This version does not enable advertising or non-essential analytics tools.',
understood:'Understood',learnMore:'Read the privacy policy',referenceCount:'references',emptySearch:'No references match your search.',
customerName:'Full name *',customerPhone:'Phone number *',customerEmail:'Email address (optional)',customerOrg:'Organisation (optional)',customerWilaya:'Wilaya / province (optional)',deliveryMode:'Preferred handover method',deliveryUnset:'To be agreed',deliveryPickup:'Collection in Sétif',deliveryDelivery:'Local delivery',deliveryShipping:'Shipping (to be confirmed)',
customerMessage:'Message / useful details (optional)',submitOrder:'Submit enquiry',orderNotActive:'Online submission is not active. Copy your selection and contact BA Labs.',orderSending:'Submitting…',orderSuccess:'Enquiry submitted. BA Labs will contact you.',orderError:'Submission failed. Check the details and try again.',orderEmpty:'Your selection is empty.',
familyLiquid:'LIQUID CULTURE',familySpawn:'GRAIN SPAWN',familyAgar:'MEDIA & AGAR',pricePerUnit:'DA / unit',decreaseQty:'Decrease quantity',increaseQty:'Increase quantity',removeItem:'Remove from selection',skipCatalog:'Skip to catalogue',languageLabel:'Language',openCart:'Open selection',closeCart:'Close selection',closeDialog:'Close dialog',filterLabel:'Filter references',searchLabel:'Search the catalogue',legalNav:'Legal information',honeypotLabel:'Leave this field empty'
},
ar:{
pageTitle:'كتالوج الموارد البيولوجية — BA Labs',metaDescription:'مزارع وأوساط وموارد بيولوجية من BA Labs. تصفح المراجع وتواصل معنا لتأكيد التوفر والشروط.',navCatalog:'الكتالوج',navApproach:'منهجيتنا',navEcosystem:'النظام البيئي',cart:'اختياراتي',
heroEyebrow:'BA LABS / موارد بيولوجية وتطبيقات',heroTitle:'التكنولوجيا الحيوية<br><em>في التطبيق.</em>',
heroText:'مزارع وأوساط زراعية وموارد بيولوجية نطوّرها من خلال عملنا المخبري. نقدم كل مرجع بمعلومات عملية مع التركيز على التوثيق وإمكانية التتبع.',
explore:'استكشف المراجع',heroAside:'البحث<br>← الزراعة<br>← التطبيق',
introEyebrow:'موارد ناتجة عن العمل المخبري',
introText:'اختيار يستند إلى <strong>الجودة البيولوجية وإمكانية التتبع والتوثيق التقني.</strong>',
introMeta:'سطيف · الجزائر',
catalogEyebrow:'اختيارات BA LABS',catalogTitle:'كتالوج <em>الموارد</em>',
catalogDescription:'تصفح المراجع المنشورة. يتم تأكيد الأشكال والمخزون والأسعار النهائية وشروط التسليم عند التواصل.',
filterAll:'الكل',filterLiquid:'مزارع سائلة',filterSpawn:'حبوب ملقحة',filterAgar:'أوساط وآغار',
searchPlaceholder:'ابحث بالاسم أو السلالة أو المرجع…',catalogStatus:'مراجع في الكتالوج · التوفر قيد التأكيد',
available:'حسب الطلب',details:'الوثائق ↗',add:'أضف إلى اختياراتي',
processEyebrow:'كيفية تقديم طلب استفسار',processTitle:'من المرجع<br>إلى <em>التأكيد.</em>',
step1Title:'استكشف',step1Text:'تصفح المراجع واطلع على المعلومات المتاحة.',
step2Title:'اختر',step2Text:'أضف الموارد التي تهمك إلى قائمتك دون الحاجة إلى إنشاء حساب.',
step3Title:'تواصل',step3Text:'نتحقق معك من التوفر والتعبئة والسعر وشروط التسليم.',
ctaEyebrow:'هل تحتاج إلى توجيه تقني؟',ctaTitle:'المورد المناسب<br>يبدأ بـ <em>نقاش واضح.</em>',
contactTeam:'تواصل مع BA Labs',footerText:'التكنولوجيا الحيوية التطبيقية · مزارع وموارد مخبرية وحلول موثقة.',
backEcosystem:'العودة إلى النظام البيئي',legal:'الإشعارات القانونية',privacy:'الخصوصية',terms:'شروط البيع',shipping:'التوصيل والإرجاع',privacySettings:'الخصوصية وملفات تعريف الارتباط',
cartTitle:'اختياراتي',emptyCart:'لم تختر أي مرجع بعد.',continueShopping:'العودة إلى الكتالوج ↙',
cartDisclaimer:'هذه القائمة استفسار وليست طلب شراء مؤكداً. يجب تأكيد الأسعار والتوفر من BA Labs.',
requestQuote:'إعداد الاستفسار',guestNote:'دون إنشاء حساب · لا يوجد دفع إلكتروني',
requestTitle:'إعداد <br><em>استفسارك.</em>',
requestDescription:'الإرسال عبر الإنترنت غير مفعل حالياً. لا يتم إرسال المعلومات المدخلة في هذا النموذج في هذه المرحلة. انسخ قائمة اختياراتك ثم تواصل مع BA Labs لتأكيد التوفر والشروط.',
selectionHeading:'01 / اختياراتك',selectionNote:'ستؤكد BA Labs الأسعار والتنسيقات والتوفر قبل اعتماد أي طلب.',customerHeading:'02 / بيانات الاتصال',
copyRequest:'نسخ اختياراتي',copySuccess:'تم نسخ الاختيارات',
integrationNote:'يجري ربط النموذج: لا يتم إرسال أو حفظ بيانات الاتصال المدخلة هنا. يمكنك فقط نسخ المراجع التي اخترتها.',
privacyNoticeTitle:'بياناتك وخصوصيتك',
privacyNoticeText:'يتم حفظ السلة وتفضيل اللغة محلياً على هذا الجهاز. لا يستخدم هذا الإصدار أدوات إعلانية أو تحليلات غير ضرورية.',
understood:'فهمت',learnMore:'قراءة سياسة الخصوصية',referenceCount:'مراجع',emptySearch:'لا توجد مراجع تطابق بحثك.',
customerName:'الاسم الكامل *',customerPhone:'رقم الهاتف *',customerEmail:'البريد الإلكتروني (اختياري)',customerOrg:'الهيئة / المؤسسة (اختياري)',customerWilaya:'الولاية (اختياري)',deliveryMode:'طريقة الاستلام المفضلة',deliveryUnset:'يتم الاتفاق عليها',deliveryPickup:'استلام من سطيف',deliveryDelivery:'توصيل محلي',deliveryShipping:'شحن (يتم التأكيد لاحقاً)',
customerMessage:'رسالة / تفاصيل إضافية (اختياري)',submitOrder:'إرسال الاستفسار',orderNotActive:'الإرسال عبر الإنترنت غير مفعل. انسخ اختياراتك وتواصل مع BA Labs.',orderSending:'جارٍ الإرسال…',orderSuccess:'تم إرسال الاستفسار. ستتواصل معك BA Labs.',orderError:'تعذر الإرسال. تحقق من البيانات وأعد المحاولة.',orderEmpty:'قائمة اختياراتك فارغة.',
familyLiquid:'مزرعة سائلة',familySpawn:'حبوب ملقحة',familyAgar:'أوساط وآغار',pricePerUnit:'دج / الوحدة',decreaseQty:'تقليل الكمية',increaseQty:'زيادة الكمية',removeItem:'إزالة من الاختيارات',skipCatalog:'انتقل إلى الكتالوج',languageLabel:'اللغة',openCart:'فتح الاختيارات',closeCart:'إغلاق الاختيارات',closeDialog:'إغلاق النافذة',filterLabel:'تصفية المراجع',searchLabel:'البحث في الكتالوج',legalNav:'معلومات قانونية',honeypotLabel:'اترك هذا الحقل فارغاً'
},
pt:{
pageTitle:'Catálogo de recursos biológicos — BA Labs',metaDescription:'Culturas, meios e recursos biológicos da BA Labs. Consulte as referências e contacte a equipa para confirmar disponibilidade e condições.',navCatalog:'Catálogo',navApproach:'A nossa abordagem',navEcosystem:'Ecossistema',cart:'A minha seleção',
heroEyebrow:'BA LABS / RECURSOS BIOLÓGICOS E APLICAÇÕES',heroTitle:'Biotecnologia<br><em>na prática.</em>',
heroText:'Culturas, meios e recursos biológicos desenvolvidos através do nosso trabalho laboratorial. Cada referência é apresentada com informação útil e uma abordagem centrada na documentação e rastreabilidade.',
explore:'Explorar referências',heroAside:'INVESTIGAÇÃO<br>→ CULTURA<br>→ APLICAÇÃO',
introEyebrow:'RECURSOS COM ORIGEM NO LABORATÓRIO',
introText:'Uma seleção assente na <strong>qualidade biológica, rastreabilidade e documentação técnica.</strong>',
introMeta:'SÉTIF · ARGÉLIA',
catalogEyebrow:'SELEÇÃO BA LABS',catalogTitle:'Catálogo <em>de recursos</em>',
catalogDescription:'Consulte as referências publicadas. Os formatos, o stock, os preços finais e as condições de entrega são confirmados durante o contacto.',
filterAll:'Todas',filterLiquid:'Culturas líquidas',filterSpawn:'Grão inoculado',filterAgar:'Meios e ágar',
searchPlaceholder:'Pesquisar por nome, estirpe ou referência…',catalogStatus:'REFERÊNCIAS NO CATÁLOGO · DISPONIBILIDADE A CONFIRMAR',
available:'Sob consulta',details:'Documentação ↗',add:'Adicionar à minha seleção',
processEyebrow:'COMO FAZER UM PEDIDO DE INFORMAÇÃO',processTitle:'Da referência<br>à <em>confirmação.</em>',
step1Title:'Explorar',step1Text:'Consulte as referências e a informação disponível.',
step2Title:'Selecionar',step2Text:'Adicione os recursos pretendidos à sua seleção, sem criar uma conta.',
step3Title:'Conversar',step3Text:'Confirmamos consigo a disponibilidade, o acondicionamento, o preço e as condições de entrega.',
ctaEyebrow:'PRECISA DE ORIENTAÇÃO TÉCNICA?',ctaTitle:'O recurso adequado<br>começa com <em>uma conversa clara.</em>',
contactTeam:'Contactar BA Labs',footerText:'Biotecnologia aplicada · Culturas, recursos laboratoriais e soluções documentadas.',
backEcosystem:'Voltar ao ecossistema',legal:'Aviso legal',privacy:'Privacidade',terms:'Condições de venda',shipping:'Entrega e devoluções',privacySettings:'Privacidade e cookies',
cartTitle:'A minha seleção',emptyCart:'Ainda não selecionou nenhuma referência.',continueShopping:'Voltar ao catálogo ↙',
cartDisclaimer:'A sua seleção é um pedido de informação, não uma encomenda confirmada. Os preços e a disponibilidade serão confirmados pela BA Labs.',
requestQuote:'Preparar pedido',guestNote:'Sem criar conta · Sem pagamento online',
requestTitle:'Prepare o seu<br><em>pedido.</em>',
requestDescription:'O envio online ainda não está ativo. Nesta fase, os dados introduzidos neste formulário não são transmitidos. Copie a sua seleção e contacte a BA Labs para confirmar a disponibilidade e as condições.',
selectionHeading:'01 / A SUA SELEÇÃO',selectionNote:'Os preços, formatos e disponibilidade serão confirmados pela BA Labs antes de qualquer validação.',customerHeading:'02 / OS SEUS DADOS',
copyRequest:'Copiar a minha seleção',copySuccess:'Seleção copiada',
integrationNote:'A ligação do formulário está pendente: os dados de contacto introduzidos aqui não são enviados nem guardados. Só pode copiar as referências selecionadas.',
privacyNoticeTitle:'Os seus dados e a sua privacidade',
privacyNoticeText:'O cesto e a preferência de idioma são guardados localmente neste dispositivo. Esta versão não ativa publicidade nem ferramentas analíticas não essenciais.',
understood:'Compreendi',learnMore:'Consultar a política de privacidade',referenceCount:'referências',emptySearch:'Nenhuma referência corresponde à sua pesquisa.',
customerName:'Nome completo *',customerPhone:'Telefone *',customerEmail:'E-mail (opcional)',customerOrg:'Organização (opcional)',customerWilaya:'Wilaya / província (opcional)',deliveryMode:'Método de entrega preferido',deliveryUnset:'A combinar',deliveryPickup:'Levantamento em Sétif',deliveryDelivery:'Entrega local',deliveryShipping:'Expedição (a confirmar)',
customerMessage:'Mensagem / informações úteis (opcional)',submitOrder:'Enviar pedido',orderNotActive:'O envio online não está ativo. Copie a seleção e contacte a BA Labs.',orderSending:'A enviar…',orderSuccess:'Pedido enviado. A BA Labs entrará em contacto.',orderError:'O envio falhou. Verifique os dados e tente novamente.',orderEmpty:'A sua seleção está vazia.',
familyLiquid:'CULTURA LÍQUIDA',familySpawn:'GRÃO INOCULADO',familyAgar:'MEIOS E ÁGAR',pricePerUnit:'DA / unidade',decreaseQty:'Diminuir quantidade',increaseQty:'Aumentar quantidade',removeItem:'Remover da seleção',skipCatalog:'Saltar para o catálogo',languageLabel:'Idioma',openCart:'Abrir seleção',closeCart:'Fechar seleção',closeDialog:'Fechar janela',filterLabel:'Filtrar referências',searchLabel:'Pesquisar no catálogo',legalNav:'Informações legais',honeypotLabel:'Deixe este campo vazio'
}
};;
const $=s=>document.querySelector(s);const safeGet=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch(_){return fallback}};const safeSet=(key,value)=>{try{localStorage.setItem(key,value)}catch(_){}};let language=safeGet('balabs-store-language',safeGet('balabs-language','fr'));if(!words[language])language='fr';let filter='all';let query='';let cart=loadCart();
function loadCart(){try{return JSON.parse(localStorage.getItem('balabs-store-cart')||'{}')}catch(_){return {}}}
function saveCart(){activeRequestId='';safeSet('balabs-store-cart',JSON.stringify(cart));renderCart()}
function t(k){return words[language][k]||words.fr[k]||k}
function applyLanguage(){document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=t('pageTitle');const metaDescription=document.querySelector('meta[name="description"]');if(metaDescription)metaDescription.content=t('metaDescription');$('#languageSelect').value=language;document.querySelectorAll('[data-i18n]').forEach(el=>{const val=t(el.dataset.i18n);if(val.includes('<'))el.innerHTML=val;else el.textContent=val});document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));renderProducts();renderCart()}
function renderProducts(){const grid=$('#productGrid');const filtered=products.filter(p=>(filter==='all'||p.family===filter)&&[p.code,p.kind,p.titles[language],p.descriptions[language]].join(' ').toLowerCase().includes(query));$('#resultCount').textContent=filtered.length+' '+t('referenceCount');grid.innerHTML=filtered.length?filtered.map((p,i)=>'<article class="product-card reveal is-visible"><div class="product-visual"><span class="product-index">REF / '+String(i+1).padStart(2,'0')+'</span><span class="product-family">'+(p.family==='liquid'?t('familyLiquid'):p.family==='spawn'?t('familySpawn'):t('familyAgar'))+'</span><span class="product-symbol">'+p.symbol+'</span></div><div class="product-content"><p class="product-code">'+p.code+'</p><h3>'+p.titles[language]+'</h3><p>'+p.descriptions[language]+'</p><div class="product-card-bottom">'+(p.priceDzd?'<div class="product-price-wrap"><strong class="product-price">'+new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(p.priceDzd)+' DA / '+t('pricePerUnit')+'</strong>'+(p.priceQualifier?'<small class="price-qualifier">'+p.priceQualifier[language]+'</small>':'')+'</div>':'<span class="availability">'+t('available')+'</span>')+'<button class="add-product" data-add="'+p.code+'" aria-label="'+t('add')+' '+p.titles[language]+'">+</button></div></div></article>').join(''):'<div class="no-results">'+t('emptySearch')+'</div>';grid.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.add;cart[id]=(cart[id]||0)+1;saveCart();b.textContent='✓';setTimeout(()=>b.textContent='+',700)}))}
async function loadRemoteCatalogue(){
  if(!STORE_REMOTE_CATALOGUE_ENABLED)return;
  try{
    const response=await fetch(STORE_CATALOGUE_URL,{method:'GET',headers:{apikey:STORE_PUBLISHABLE_KEY},credentials:'omit',cache:'default'});
    if(!response.ok)return;
    const payload=await response.json();
    if(!Array.isArray(payload.products)||payload.products.length===0)return;
    const remote=payload.products.map(p=>({
      code:p.product_code,
      family:p.family,
      kind:p.organism_label,
      symbol:p.family==='agar'?'WA':'LC',
      titles:p.title_i18n,
      descriptions:p.description_i18n,
      url:p.source_notion_url,
      variants:Array.isArray(p.variants)?p.variants:[]
    }));
    if(remote.some(p=>!p.code||!p.titles||!p.descriptions))return;
    products=remote;
    renderProducts();
    renderCart();
  }catch(_){
    // The reviewed static catalogue remains available when the API is offline or not deployed.
  }
}
function renderCart(){const entries=Object.entries(cart).filter(([,n])=>n>0);$('#cartCount').textContent=entries.reduce((s,[,n])=>s+n,0);$('#cartEmpty').hidden=entries.length>0;$('#drawerBottom').hidden=!entries.length;$('#cartItems').innerHTML=entries.map(([id,n])=>{const p=products.find(x=>x.code===id);if(!p)return '';return '<div class="cart-line"><div><h3>'+p.titles[language]+'</h3><small>'+p.code+'</small>'+(p.priceDzd?'<div class="cart-price">'+new Intl.NumberFormat(language,{maximumFractionDigits:0}).format(p.priceDzd)+' '+t('pricePerUnit')+'</div>'+(p.priceQualifier?'<small class="price-qualifier">'+p.priceQualifier[language]+'</small>':''):'')+'<div class="quantity-control"><button data-qty="'+id+'" data-delta="-1" aria-label="'+t('decreaseQty')+'">−</button><span>'+n+'</span><button data-qty="'+id+'" data-delta="1" aria-label="'+t('increaseQty')+'">+</button></div></div><button class="remove-line" data-remove="'+id+'">'+t('removeItem')+'</button></div>'}).join('');$('#cartItems').querySelectorAll('[data-qty]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.qty;cart[id]=Math.max(0,(cart[id]||0)+Number(b.dataset.delta));if(!cart[id])delete cart[id];saveCart()}));$('#cartItems').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{delete cart[b.dataset.remove];saveCart()}))}
function openCart(){const d=$('#cartDrawer');d.classList.add('is-open');d.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';$('#cartClose').focus()}
function closeCart(){const d=$('#cartDrawer');d.classList.remove('is-open');d.setAttribute('aria-hidden','true');document.body.style.overflow=''}
let requestText='';let activeRequestId='';function openRequest(){if(!activeRequestId)activeRequestId=crypto.randomUUID();const entries=Object.entries(cart).filter(([,n])=>n>0);const items=entries.map(([id,n])=>{const p=products.find(x=>x.code===id);return p?'<div>'+n+' × '+p.titles[language]+' <small>('+p.code+')</small></div>':''}).join('');requestText=['BA Labs — '+(language==='fr'?'Demande de disponibilité':language==='ar'?'طلب توفر':language==='pt'?'Pedido de disponibilidade':'Availability request'),...entries.map(([id,n])=>{const p=products.find(x=>x.code===id);return p?n+' × '+p.titles[language]+' — '+(p.priceDzd?new Intl.NumberFormat(language).format(p.priceDzd)+' DA'+(p.priceQualifier?' ('+p.priceQualifier[language]+')':''):'prix sur demande')+' ['+p.code+']':''}),language==='fr'?'Prix et disponibilité à confirmer par BA Labs.':language==='ar'?'يجب تأكيد السعر والتوفر من BA Labs.':language==='pt'?'Preço e disponibilidade a confirmar pela BA Labs.':'Prices and availability to be confirmed by BA Labs.'].filter(Boolean).join('\n');$('#requestSummary').innerHTML=items;$('#copyRequest').textContent=t('copyRequest');$('#requestModal').classList.add('is-open');$('#requestModal').setAttribute('aria-hidden','false');closeCart();document.body.style.overflow='hidden';$('#requestClose').focus()}
function closeRequest(){const m=$('#requestModal');m.classList.remove('is-open');m.setAttribute('aria-hidden','true');document.body.style.overflow=''}
$('#languageSelect').addEventListener('change',e=>{language=e.target.value;safeSet('balabs-store-language',language);applyLanguage()});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{const active=x===b;x.classList.toggle('is-active',active);x.setAttribute('aria-pressed',String(active))});renderProducts()}));
$('#catalogSearch').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderProducts()});
$('#cartOpen').addEventListener('click',openCart);$('#cartClose').addEventListener('click',closeCart);$('#cartBackdrop').addEventListener('click',closeCart);$('#continueShopping').addEventListener('click',closeCart);$('#requestQuote').addEventListener('click',openRequest);$('#copyRequest').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(requestText);$('#copyRequest').textContent=t('copySuccess')}catch(_){$('#copyRequest').textContent=t('copyRequest')}});
const orderForm=$('#orderForm'),orderStatus=$('#orderStatus'),submitOrder=$('#submitOrder');
if(STORE_ORDER_ENABLED){submitOrder.disabled=false;orderStatus.textContent='';}else{orderForm.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el=>{el.disabled=true;});}
orderForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!STORE_ORDER_ENABLED){orderStatus.textContent=t('orderNotActive');return;}
 const entries=Object.entries(cart).filter(([,n])=>n>0);
 if(!entries.length){orderStatus.textContent=t('orderEmpty');return;}
 const f=new FormData(orderForm);
 const payload={request_id:activeRequestId,customer:{name:String(f.get('name')||'').trim(),phone:String(f.get('phone')||'').trim(),email:String(f.get('email')||'').trim(),organization:String(f.get('organization')||'').trim(),wilaya:String(f.get('wilaya')||'').trim(),deliveryMode:String(f.get('deliveryMode')||'À définir'),message:String(f.get('message')||'').trim()},items:entries.map(([code,quantity])=>({code,quantity})),locale:language,website:String(f.get('website')||'')};
 submitOrder.disabled=true;orderStatus.textContent=t('orderSending');
 try{
  const response=await fetch(STORE_ORDER_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:STORE_PUBLISHABLE_KEY},credentials:'omit',body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.success)throw new Error('submission_failed');
  orderStatus.textContent=t('orderSuccess')+' — '+result.orderRef;cart={};saveCart();orderForm.reset();activeRequestId='';
 }catch(_){orderStatus.textContent=t('orderError');}
 finally{submitOrder.disabled=false;}
});$('#requestClose').addEventListener('click',closeRequest);$('#requestBackdrop').addEventListener('click',closeRequest);document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCart();closeRequest()}});
$('#year').textContent=new Date().getFullYear();
const notice=$('#consentNotice');if(!safeGet('balabs-privacy-notice-v1',''))notice.hidden=false;
$('#consentAcknowledge').addEventListener('click',()=>{safeSet('balabs-privacy-notice-v1','acknowledged');notice.hidden=true});
const privacySettings=$('#privacySettings');if(privacySettings)privacySettings.addEventListener('click',()=>{notice.hidden=false;notice.scrollIntoView({behavior:'smooth',block:'end'})});
const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target)}}),{threshold:.12}):null;document.querySelectorAll('.reveal').forEach(el=>observer?observer.observe(el):el.classList.add('is-visible'));
function startField(){const canvas=$('#storeField'),ctx=canvas.getContext('2d');if(!ctx)return;let w=0,h=0,dpr=1,raf=0,paths=[],pointer={x:-1000,y:-1000};const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);paths=[];for(let i=0;i<32;i++){const edge=i%4;let x=edge===0?0:edge===1?w:Math.random()*w;let y=edge===2?0:edge===3?h:Math.random()*h;let angle=Math.atan2(h*.5-y,w*.5-x)+(Math.random()-.5)*1.2;const pts=[{x,y}];for(let j=0;j<7;j++){angle+=(Math.random()-.5)*.45;x+=Math.cos(angle)*24;y+=Math.sin(angle)*24;pts.push({x,y})}paths.push({pts,phase:Math.random()*6.28,copper:i%7===0})}}function draw(time){ctx.clearRect(0,0,w,h);paths.forEach((path,k)=>{ctx.beginPath();path.pts.forEach((p,i)=>{const drift=reduce?0:Math.sin(time*.00035+path.phase+i*.8)*3;const x=p.x+drift+(pointer.x-p.x)*.0009;const y=p.y+Math.cos(time*.0003+path.phase+i)*drift+(pointer.y-p.y)*.0009;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.strokeStyle=path.copper?'rgba(185,107,77,.25)':'rgba(151,180,160,.19)';ctx.lineWidth=path.copper?1.2:.75;ctx.stroke()});if(!reduce)raf=requestAnimationFrame(draw)}resize();if(!reduce)raf=requestAnimationFrame(draw);else draw(0);addEventListener('resize',()=>{cancelAnimationFrame(raf);resize();if(!reduce)raf=requestAnimationFrame(draw);else draw(0)},{passive:true});canvas.parentElement.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top}},{passive:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(raf);else if(!reduce)raf=requestAnimationFrame(draw)})}
startField();applyLanguage();loadRemoteCatalogue();
})();