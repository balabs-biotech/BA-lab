/* BA Labs Batch Tracker — lightweight UI localisation.
 * French is the source language. Arabic, English and Portuguese cover the
 * operational interface; language preference is kept locally in this browser.
 */
(() => {
  "use strict";
  const dictionaries = {
    en: {
      "Aller au contenu principal":"Skip to main content","LAB OPERATIONS":"LAB OPERATIONS","Vue générale":"Overview","Cultures":"Cultures","Lots":"Batches","Données":"Data","Statistiques":"Statistics","ESPACE DE TRAÇABILITÉ":"TRACEABILITY WORKSPACE","← Tous les univers":"← All workspaces","LABORATOIRE & PRODUCTION":"LABORATORY & PRODUCTION","Culture":"Culture","traçabilité biologique":"biological traceability","Du suivi des cultures à la libération des lots : un espace unique pour documenter, piloter et contrôler chaque étape.":"From culture tracking to batch release: one workspace to document, manage and control every step.","Lots de production":"Production batches","Contrôle qualité":"Quality control","ESPACE EXPÉRIMENTAL":"EXPERIMENTAL WORKSPACE","ÉTAT DES DONNÉES":"DATA STATUS","État des données":"Data status","Aperçu des enregistrements chargés depuis Supabase. Les compteurs reflètent les limites de chargement actuelles, pas nécessairement le total de la base.":"Overview of records loaded from Supabase. Counts reflect current loading limits, not necessarily the full database total.","Session connectée":"Session connected","Cultures chargées":"Cultures loaded","Lots récents":"Recent batches","Observations récentes":"Recent observations","Dernières observations chargées":"Latest observations loaded","Ouvrir les données":"Open data","Accès rapides":"Quick access","Créer une culture":"Create a culture","Identité et génération":"Identity and generation","Consulter les lots":"View batches","Étapes et traçabilité":"Stages and traceability","Saisir une donnée":"Record data","Mesure ou observation":"Measurement or observation","Accès BA Labs":"BA Labs access","Connectez-vous avec le compte BA Labs.":"Sign in with the BA Labs account.","Le rattachement à l'organisation BA-LABS est effectué automatiquement après authentification.":"You will be linked to the BA-LABS organisation automatically after authentication.","Mot de passe":"Password","Se connecter":"Sign in","Créer le compte":"Create account","Vérification de la session...":"Checking session...","Se déconnecter":"Sign out","RESSOURCES BIOLOGIQUES":"BIOLOGICAL RESOURCES","Nouvelle culture":"New culture","On commence par identifier la ressource. Les champs suivants apparaissent quand les informations de base sont renseignées.":"Start by identifying the resource. The next fields appear after the basic information is entered.","Souche / ressource biologique":"Strain / biological resource","Chargement...":"Loading...","Sélectionnez une souche.":"Select a strain.","Code de culture":"Culture code","Identifiant unique de la culture, utilisé aussi dans Notion.":"Unique culture identifier, also used in Notion.","Type de culture":"Culture type","Protocole":"Protocol","Aucun protocole":"No protocol","Date de démarrage":"Start date","Génération : —":"Generation: —","Conditions d’utilisation et traitement des données":"Terms of use and data processing","Lire les conditions d’utilisation complètes":"Read the full terms of use","J’ai lu et j’accepte les conditions d’utilisation de BA Labs BatchTracker.":"I have read and accept the BA Labs BatchTracker terms of use.","Obligatoire pour créer une culture.":"Required to create a culture.","Créer la culture":"Create culture","Synchronisation Notion : en attente de connexion.":"Notion sync: waiting for connection.","Réessayer la synchronisation Notion":"Retry Notion sync","Cultures enregistrées":"Recorded cultures","Rechercher":"Search","Code ou type de culture":"Culture code or type","Tous les types":"All types","Connectez-vous pour charger les cultures.":"Sign in to load cultures.","Fermer la fiche":"Close record","FICHE EXPÉRIMENTALE":"EXPERIMENTAL RECORD","Tracer une opération biologique":"Record a biological operation","Opération":"Operation","Repiquage":"Subculture","Passage":"Passage","Transfert":"Transfer","Division en aliquotes":"Aliquot division","Changement de milieu":"Medium change","Contamination suspectée":"Suspected contamination","Conservation":"Storage","Résultat final":"Final result","Autre opération":"Other operation","Date et heure":"Date and time","Codes des descendants (facultatif)":"Descendant codes (optional)","Milieu / conditions / quantité":"Medium / conditions / quantity","État / résultat observé":"Status / observed result","Non renseigné":"Not specified","En cours":"In progress","Conforme":"Compliant","Résultat positif":"Positive result","Résultat négatif":"Negative result","Contamination confirmée":"Confirmed contamination","Matériel conservé":"Material stored","Terminé":"Completed","Arrêté / exclu":"Stopped / excluded","Compte rendu / observations":"Report / observations","Enregistrer l’opération":"Save operation","Filiation biologique":"Biological lineage","Chargement de la filiation…":"Loading lineage…","Chronologie complète":"Full timeline","Sélectionnez une culture pour charger son historique.":"Select a culture to load its history.","PRODUCTION & QUALITÉ":"PRODUCTION & QUALITY","Nouveau batch":"New batch","Création et suivi du cycle complet :":"Create and track the complete cycle:","Code du batch":"Batch code","Nom du batch":"Batch name","Type de batch":"Batch type","Biologique":"Biological","Milieu":"Medium","Substrat":"Substrate","Grain":"Grain","Inoculum":"Inoculum","Préparation biologique":"Biological preparation","Autre":"Other","Culture source":"Source culture","Quantité prévue":"Planned quantity","Unité":"Unit","Créer le batch":"Create batch","Batchs existants":"Existing batches","Étapes du batch":"Batch stages","Passer à l'étape suivante":"Move to next stage","Actualiser":"Refresh","Contrôle qualité":"Quality control","Libérer le batch":"Release batch","ANALYSE DES DONNÉES":"DATA ANALYSIS","Statistiques expérimentales":"Experimental statistics","Variable mesurée":"Measured variable","Sélectionner une variable…":"Select a variable…","Toutes les cultures accessibles":"All accessible cultures","Période":"Period","Toutes les dates disponibles":"All available dates","30 derniers jours":"Last 30 days","90 derniers jours":"Last 90 days","12 derniers mois":"Last 12 months","Analyser les données":"Analyse data","Choisissez une variable pour commencer l’analyse.":"Choose a variable to begin analysis.","Aucune analyse exécutée.":"No analysis run.","DONNÉES EXPÉRIMENTALES":"EXPERIMENTAL DATA","Mesures & observations instrumentales":"Measurements & instrument observations","Enregistrez une mesure numérique avec son unité, son horodatage et sa méthode.":"Record a numeric measurement with its unit, timestamp and method.","SAISIE EXPRESS":"QUICK ENTRY","Qu’est-ce que tu veux noter ?":"What would you like to record?","Un clic prépare la fiche. Choisis ensuite la culture et complète seulement ce qui manque.":"One click prepares the form. Then select the culture and fill in only what is missing.","Acidité":"Acidity","Mesurer le pH":"Measure pH","Température":"Temperature","Air, substrat, milieu…":"Air, substrate, medium…","Observations":"Observations","Enregistrer":"Save","Annuler":"Cancel","Date":"Date","Valeur":"Value","Méthode":"Method","Résultat":"Result","Notes":"Notes","Aucune donnée disponible.":"No data available.","Erreur":"Error","Succès":"Success","Langue":"Language","Français":"French","Anglais":"English","Portugais":"Portuguese","Arabe":"Arabic","Tous les univers":"All workspaces"
    },
    pt: {
      "Aller au contenu principal":"Ir para o conteúdo principal","Vue générale":"Visão geral","Cultures":"Culturas","Lots":"Lotes","Données":"Dados","Statistiques":"Estatísticas","ESPACE DE TRAÇABILITÉ":"ESPAÇO DE RASTREABILIDADE","← Tous les univers":"← Todos os espaços","LABORATOIRE & PRODUCTION":"LABORATÓRIO E PRODUÇÃO","traçabilité biologique":"rastreabilidade biológica","Du suivi des cultures à la libération des lots : un espace unique pour documenter, piloter et contrôler chaque étape.":"Do acompanhamento das culturas à libertação dos lotes: um espaço único para documentar, gerir e controlar cada etapa.","Lots de production":"Lotes de produção","Contrôle qualité":"Controlo de qualidade","ESPACE EXPÉRIMENTAL":"ESPAÇO EXPERIMENTAL","ÉTAT DES DONNÉES":"ESTADO DOS DADOS","Session connectée":"Sessão ligada","Cultures chargées":"Culturas carregadas","Lots récents":"Lotes recentes","Observations récentes":"Observações recentes","Dernières observations chargées":"Últimas observações carregadas","Ouvrir les données":"Abrir dados","Accès rapides":"Acesso rápido","Créer une culture":"Criar cultura","Consulter les lots":"Ver lotes","Saisir une donnée":"Registar dados","Mesure ou observation":"Medição ou observação","Accès BA Labs":"Acesso BA Labs","Connectez-vous avec le compte BA Labs.":"Inicie sessão com a conta BA Labs.","Mot de passe":"Palavra-passe","Se connecter":"Iniciar sessão","Créer le compte":"Criar conta","Vérification de la session...":"A verificar a sessão...","Se déconnecter":"Terminar sessão","RESSOURCES BIOLOGIQUES":"RECURSOS BIOLÓGICOS","Nouvelle culture":"Nova cultura","Souche / ressource biologique":"Estirpe / recurso biológico","Chargement...":"A carregar...","Sélectionnez une souche.":"Selecione uma estirpe.","Code de culture":"Código da cultura","Identifiant unique de la culture, utilisé aussi dans Notion.":"Identificador único da cultura, também usado no Notion.","Type de culture":"Tipo de cultura","Protocole":"Protocolo","Aucun protocole":"Sem protocolo","Date de démarrage":"Data de início","Conditions d’utilisation et traitement des données":"Termos de utilização e tratamento de dados","Lire les conditions d’utilisation complètes":"Ler os termos de utilização completos","Créer la culture":"Criar cultura","Synchronisation Notion : en attente de connexion.":"Sincronização Notion: à espera de ligação.","Réessayer la synchronisation Notion":"Tentar novamente a sincronização Notion","Cultures enregistrées":"Culturas registadas","Rechercher":"Pesquisar","Code ou type de culture":"Código ou tipo de cultura","Tous les types":"Todos os tipos","Connectez-vous pour charger les cultures.":"Inicie sessão para carregar as culturas.","Fermer la fiche":"Fechar ficha","Tracer une opération biologique":"Registar uma operação biológica","Opération":"Operação","Repiquage":"Repicagem","Passage":"Passagem","Transfert":"Transferência","Division en aliquotes":"Divisão em alíquotas","Changement de milieu":"Mudança de meio","Contamination suspectée":"Contaminação suspeita","Conservation":"Conservação","Résultat final":"Resultado final","Autre opération":"Outra operação","Date et heure":"Data e hora","Codes des descendants (facultatif)":"Códigos descendentes (opcional)","Milieu / conditions / quantité":"Meio / condições / quantidade","État / résultat observé":"Estado / resultado observado","Non renseigné":"Não indicado","En cours":"Em curso","Conforme":"Conforme","Résultat positif":"Resultado positivo","Résultat négatif":"Resultado negativo","Contamination confirmée":"Contaminação confirmada","Matériel conservé":"Material conservado","Terminé":"Concluído","Arrêté / exclu":"Interrompido / excluído","Compte rendu / observations":"Relatório / observações","Enregistrer l’opération":"Guardar operação","Filiation biologique":"Linhagem biológica","Chronologie complète":"Cronologia completa","PRODUCTION & QUALITÉ":"PRODUÇÃO E QUALIDADE","Nouveau batch":"Novo lote","Code du batch":"Código do lote","Nom du batch":"Nome do lote","Type de batch":"Tipo de lote","Biologique":"Biológico","Milieu":"Meio","Substrat":"Substrato","Grain":"Grão","Inoculum":"Inóculo","Préparation biologique":"Preparação biológica","Autre":"Outro","Culture source":"Cultura de origem","Quantité prévue":"Quantidade prevista","Unité":"Unidade","Créer le batch":"Criar lote","Batchs existants":"Lotes existentes","Étapes du batch":"Etapas do lote","Passer à l'étape suivante":"Avançar para a etapa seguinte","Actualiser":"Atualizar","Libérer le batch":"Libertar lote","ANALYSE DES DONNÉES":"ANÁLISE DE DADOS","Statistiques expérimentales":"Estatísticas experimentais","Variable mesurée":"Variável medida","Sélectionner une variable…":"Selecionar uma variável…","Toutes les cultures accessibles":"Todas as culturas acessíveis","Période":"Período","Toutes les dates disponibles":"Todas as datas disponíveis","30 derniers jours":"Últimos 30 dias","90 derniers jours":"Últimos 90 dias","12 derniers mois":"Últimos 12 meses","Analyser les données":"Analisar dados","Choisissez une variable pour commencer l’analyse.":"Escolha uma variável para iniciar a análise.","Aucune analyse exécutée.":"Nenhuma análise executada.","DONNÉES EXPÉRIMENTALES":"DADOS EXPERIMENTAIS","Mesures & observations instrumentales":"Medições e observações instrumentais","SAISIE EXPRESS":"REGISTO RÁPIDO","Qu’est-ce que tu veux noter ?":"O que pretende registar?","Acidité":"Acidez","Mesurer le pH":"Medir o pH","Température":"Temperatura","Observations":"Observações","Enregistrer":"Guardar","Annuler":"Cancelar","Date":"Data","Valeur":"Valor","Méthode":"Método","Résultat":"Resultado","Notes":"Notas","Aucune donnée disponible.":"Não existem dados disponíveis.","Erreur":"Erro","Succès":"Sucesso","Langue":"Idioma","Français":"Francês","Anglais":"Inglês","Portugais":"Português","Arabe":"Árabe","Tous les univers":"Todos os espaços"
    },
    ar: {
      "Aller au contenu principal":"انتقل إلى المحتوى الرئيسي","Vue générale":"نظرة عامة","Cultures":"المزارع","Lots":"الدفعات","Données":"البيانات","Statistiques":"الإحصاءات","ESPACE DE TRAÇABILITÉ":"مساحة التتبّع","← Tous les univers":"← جميع المساحات","LABORATOIRE & PRODUCTION":"المختبر والإنتاج","traçabilité biologique":"التتبّع البيولوجي","Du suivi des cultures à la libération des lots : un espace unique pour documenter, piloter et contrôler chaque étape.":"من متابعة المزارع إلى اعتماد الدفعات: مساحة واحدة لتوثيق كل مرحلة وإدارتها ومراقبتها.","Lots de production":"دفعات الإنتاج","Contrôle qualité":"مراقبة الجودة","ESPACE EXPÉRIMENTAL":"المساحة التجريبية","ÉTAT DES DONNÉES":"حالة البيانات","Session connectée":"الجلسة متصلة","Cultures chargées":"المزارع المحمّلة","Lots récents":"الدفعات الأخيرة","Observations récentes":"الملاحظات الأخيرة","Dernières observations chargées":"أحدث الملاحظات المحمّلة","Ouvrir les données":"فتح البيانات","Accès rapides":"وصول سريع","Créer une culture":"إنشاء مزرعة","Consulter les lots":"عرض الدفعات","Saisir une donnée":"تسجيل بيانات","Mesure ou observation":"قياس أو ملاحظة","Accès BA Labs":"الدخول إلى BA Labs","Connectez-vous avec le compte BA Labs.":"سجّل الدخول باستخدام حساب BA Labs.","Mot de passe":"كلمة المرور","Se connecter":"تسجيل الدخول","Créer le compte":"إنشاء حساب","Vérification de la session...":"جارٍ التحقق من الجلسة...","Se déconnecter":"تسجيل الخروج","RESSOURCES BIOLOGIQUES":"الموارد البيولوجية","Nouvelle culture":"مزرعة جديدة","Souche / ressource biologique":"سلالة / مورد بيولوجي","Chargement...":"جارٍ التحميل...","Sélectionnez une souche.":"اختر سلالة.","Code de culture":"رمز المزرعة","Identifiant unique de la culture, utilisé aussi dans Notion.":"معرّف فريد للمزرعة يُستخدم أيضًا في Notion.","Type de culture":"نوع المزرعة","Protocole":"البروتوكول","Aucun protocole":"لا يوجد بروتوكول","Date de démarrage":"تاريخ البدء","Conditions d’utilisation et traitement des données":"شروط الاستخدام ومعالجة البيانات","Lire les conditions d’utilisation complètes":"قراءة شروط الاستخدام كاملة","Créer la culture":"إنشاء المزرعة","Synchronisation Notion : en attente de connexion.":"مزامنة Notion: في انتظار الاتصال.","Réessayer la synchronisation Notion":"إعادة محاولة مزامنة Notion","Cultures enregistrées":"المزارع المسجلة","Rechercher":"بحث","Code ou type de culture":"رمز المزرعة أو نوعها","Tous les types":"كل الأنواع","Connectez-vous pour charger les cultures.":"سجّل الدخول لتحميل المزارع.","Fermer la fiche":"إغلاق السجل","Tracer une opération biologique":"تسجيل عملية بيولوجية","Opération":"العملية","Repiquage":"نقل الزراعة","Passage":"تمرير","Transfert":"نقل","Division en aliquotes":"تقسيم إلى أجزاء","Changement de milieu":"تغيير الوسط","Contamination suspectée":"اشتباه بالتلوث","Conservation":"حفظ","Résultat final":"النتيجة النهائية","Autre opération":"عملية أخرى","Date et heure":"التاريخ والوقت","Codes des descendants (facultatif)":"رموز العينات الناتجة (اختياري)","Milieu / conditions / quantité":"الوسط / الظروف / الكمية","État / résultat observé":"الحالة / النتيجة المرصودة","Non renseigné":"غير محدد","En cours":"قيد التنفيذ","Conforme":"مطابق","Résultat positif":"نتيجة إيجابية","Résultat négatif":"نتيجة سلبية","Contamination confirmée":"تلوث مؤكد","Matériel conservé":"مادة محفوظة","Terminé":"مكتمل","Arrêté / exclu":"متوقف / مستبعد","Compte rendu / observations":"التقرير / الملاحظات","Enregistrer l’opération":"حفظ العملية","Filiation biologique":"النسب البيولوجي","Chronologie complète":"السجل الزمني الكامل","PRODUCTION & QUALITÉ":"الإنتاج والجودة","Nouveau batch":"دفعة جديدة","Code du batch":"رمز الدفعة","Nom du batch":"اسم الدفعة","Type de batch":"نوع الدفعة","Biologique":"بيولوجي","Milieu":"وسط","Substrat":"ركيزة","Grain":"حبوب","Inoculum":"لقاح حيوي","Préparation biologique":"تحضير بيولوجي","Autre":"أخرى","Culture source":"المزرعة المصدر","Quantité prévue":"الكمية المخططة","Unité":"الوحدة","Créer le batch":"إنشاء الدفعة","Batchs existants":"الدفعات الحالية","Étapes du batch":"مراحل الدفعة","Passer à l'étape suivante":"الانتقال إلى المرحلة التالية","Actualiser":"تحديث","Libérer le batch":"اعتماد الدفعة","ANALYSE DES DONNÉES":"تحليل البيانات","Statistiques expérimentales":"الإحصاءات التجريبية","Variable mesurée":"المتغير المقاس","Sélectionner une variable…":"اختر متغيرًا…","Toutes les cultures accessibles":"كل المزارع المتاحة","Période":"الفترة","Toutes les dates disponibles":"كل التواريخ المتاحة","30 derniers jours":"آخر 30 يومًا","90 derniers jours":"آخر 90 يومًا","12 derniers mois":"آخر 12 شهرًا","Analyser les données":"تحليل البيانات","Choisissez une variable pour commencer l’analyse.":"اختر متغيرًا لبدء التحليل.","Aucune analyse exécutée.":"لم يُنفذ أي تحليل.","DONNÉES EXPÉRIMENTALES":"البيانات التجريبية","Mesures & observations instrumentales":"القياسات والملاحظات بالأجهزة","SAISIE EXPRESS":"إدخال سريع","Qu’est-ce que tu veux noter ?":"ما الذي تريد تسجيله؟","Acidité":"الحموضة","Mesurer le pH":"قياس الأس الهيدروجيني","Température":"درجة الحرارة","Observations":"الملاحظات","Enregistrer":"حفظ","Annuler":"إلغاء","Date":"التاريخ","Valeur":"القيمة","Méthode":"الطريقة","Résultat":"النتيجة","Notes":"ملاحظات","Aucune donnée disponible.":"لا توجد بيانات متاحة.","Erreur":"خطأ","Succès":"نجاح","Langue":"اللغة","Français":"الفرنسية","Anglais":"الإنجليزية","Portugais":"البرتغالية","Arabe":"العربية","Tous les univers":"جميع المساحات"
    }
  };
  // Operational feedback and dynamically generated labels.
  const supplemental = [["Aucune session Supabase active.","No active Supabase session.","Não existe uma sessão Supabase ativa.","لا توجد جلسة Supabase نشطة."],["Le mot de passe doit comporter au moins 6 caractères.","The password must contain at least 6 characters.","A palavra-passe deve conter pelo menos 6 caracteres.","يجب أن تتكون كلمة المرور من 6 أحرف على الأقل."],["Sélectionner une souche...","Select a strain...","Selecionar uma estirpe...","اختر سلالة..."],["Aucune souche disponible","No strains available","Não existem estirpes disponíveis","لا توجد سلالات متاحة"],["Sélectionnez une souche.","Select a strain.","Selecione uma estirpe.","اختر سلالة."],["Erreur inconnue","Unknown error","Erro desconhecido","خطأ غير معروف"],["Erreur inattendue","Unexpected error","Erro inesperado","خطأ غير متوقع"],["Synchronisation Notion à jour.","Notion sync is up to date.","A sincronização do Notion está atualizada.","مزامنة Notion محدّثة."],["Sélectionnez un type de culture.","Select a culture type.","Selecione um tipo de cultura.","اختر نوع المزرعة."],["Vous devez accepter les conditions d’utilisation pour créer une culture. Le consentement statistique reste facultatif.","You must accept the terms of use to create a culture. Statistical consent is optional.","Tem de aceitar os termos de utilização para criar uma cultura. O consentimento estatístico é opcional.","يجب الموافقة على شروط الاستخدام لإنشاء مزرعة. الموافقة الإحصائية اختيارية."],["Votre session a expiré. Reconnectez-vous.","Your session has expired. Please sign in again.","A sua sessão expirou. Inicie sessão novamente.","انتهت جلستك. يرجى تسجيل الدخول مجددًا."],["Création...","Creating...","A criar...","جارٍ الإنشاء..."],["Culture synchronisée avec Notion.","Culture synced with Notion.","Cultura sincronizada com o Notion.","تمت مزامنة المزرعة مع Notion."],["Culture enregistrée dans Supabase, mais la synchronisation Notion a échoué. Vérifiez le statut dans Supabase.","Culture saved in Supabase, but Notion sync failed. Check its status in Supabase.","Cultura guardada no Supabase, mas a sincronização com o Notion falhou. Verifique o estado no Supabase.","تم حفظ المزرعة في Supabase، لكن فشلت مزامنة Notion. تحقق من الحالة في Supabase."],["La création de la culture a échoué.","Culture creation failed.","A criação da cultura falhou.","فشل إنشاء المزرعة."],["Sélectionner une culture...","Select a culture...","Selecionar uma cultura...","اختر مزرعة..."],["Aucune culture disponible","No cultures available","Não existem culturas disponíveis","لا توجد مزارع متاحة"],["Contrôle qualité enregistré.","Quality check recorded.","Controlo de qualidade registado.","تم تسجيل فحص الجودة."],["Batch terminé","Batch completed","Lote concluído","اكتملت الدفعة"],["Démarrer / passer à l'étape suivante","Start / move to the next stage","Iniciar / avançar para a etapa seguinte","بدء / الانتقال إلى المرحلة التالية"],["Sélectionnez un type de batch.","Select a batch type.","Selecione um tipo de lote.","اختر نوع الدفعة."],["Sélectionnez une culture source.","Select a source culture.","Selecione uma cultura de origem.","اختر مزرعة المصدر."],["La culture sélectionnée n'est plus disponible.","The selected culture is no longer available.","A cultura selecionada já não está disponível.","المزرعة المحددة لم تعد متاحة."],["La quantité prévue est invalide.","The planned quantity is invalid.","A quantidade prevista é inválida.","الكمية المخططة غير صالحة."],["Batch créé dans Supabase.","Batch created in Supabase.","Lote criado no Supabase.","تم إنشاء الدفعة في Supabase."],["La création du batch a échoué.","Batch creation failed.","A criação do lote falhou.","فشل إنشاء الدفعة."],["Sélectionnez d'abord un batch.","Select a batch first.","Selecione primeiro um lote.","اختر دفعة أولاً."],["Cette étape ne peut pas être avancée avec cette action.","This stage cannot be advanced with this action.","Não é possível avançar esta etapa com esta ação.","لا يمكن الانتقال إلى المرحلة التالية بهذا الإجراء."],["Vérification QC...","Checking quality control...","A verificar o controlo de qualidade...","جارٍ التحقق من مراقبة الجودة..."],["Le batch ne peut pas être libéré.","The batch cannot be released.","Não é possível libertar o lote.","لا يمكن اعتماد الدفعة."],["Sélectionner un paramètre…","Select a parameter…","Selecionar um parâmetro…","اختر معلمة…"],["Aucun paramètre disponible","No parameters available","Não existem parâmetros disponíveis","لا توجد معلمات متاحة"],["Sélectionner une catégorie…","Select a category…","Selecionar uma categoria…","اختر فئة…"],["Aucune catégorie disponible","No categories available","Não existem categorias disponíveis","لا توجد فئات متاحة"],["Créez d’abord une culture ou un lot","Create a culture or batch first","Crie primeiro uma cultura ou um lote","أنشئ مزرعة أو دفعة أولاً"],["Sélectionner une unité…","Select a unit…","Selecionar uma unidade…","اختر وحدة…"],["Aucune unité compatible","No compatible units","Não existem unidades compatíveis","لا توجد وحدات متوافقة"],["Choisissez une culture ou un lot, un paramètre, une valeur numérique et une unité.","Choose a culture or batch, a parameter, a numeric value and a unit.","Escolha uma cultura ou lote, um parâmetro, um valor numérico e uma unidade.","اختر مزرعة أو دفعة ومعلمة وقيمة رقمية ووحدة."],["L’unité choisie n’est pas compatible avec la dimension du paramètre.","The selected unit is not compatible with the parameter dimension.","A unidade selecionada não é compatível com a dimensão do parâmetro.","الوحدة المحددة غير متوافقة مع بُعد المعلمة."],["Mesure enregistrée dans Supabase avec sa provenance.","Measurement saved in Supabase with its provenance.","Medição guardada no Supabase com a respetiva proveniência.","تم حفظ القياس في Supabase مع مصدره."],["L’enregistrement de la mesure a échoué.","Failed to save measurement.","Falha ao guardar a medição.","فشل حفظ القياس."],["Enregistrer la mesure","Save measurement","Guardar medição","حفظ القياس"],["Cible liée par identifiant","Target linked by ID","Alvo associado por identificador","الهدف مرتبط بالمعرّف"],["Date inconnue","Unknown date","Data desconhecida","تاريخ غير معروف"],["Choisissez une cible, une catégorie et décrivez l’observation.","Choose a target and category, then describe the observation.","Escolha um alvo e uma categoria e descreva a observação.","اختر هدفًا وفئة ثم صف الملاحظة."],["Observation enregistrée dans Supabase avec sa provenance.","Observation saved in Supabase with its provenance.","Observação guardada no Supabase com a respetiva proveniência.","تم حفظ الملاحظة في Supabase مع مصدرها."],["L’enregistrement de l’observation a échoué.","Failed to save observation.","Falha ao guardar a observação.","فشل حفظ الملاحظة."],["Enregistrer l’observation","Save observation","Guardar observação","حفظ الملاحظة"],["Aucune variable disponible","No variables available","Não existem variáveis disponíveis","لا توجد متغيرات متاحة"],["Aucune culture ne correspond à cette recherche.","No cultures match this search.","Nenhuma cultura corresponde a esta pesquisa.","لا توجد مزارع تطابق هذا البحث."],["Aucune culture chargée. Créez une culture avec le formulaire ci-dessus.","No cultures loaded. Create one using the form above.","Nenhuma cultura carregada. Crie uma através do formulário acima.","لم يتم تحميل أي مزارع. أنشئ واحدة باستخدام النموذج أعلاه."],["Type non renseigné","Type not specified","Tipo não indicado","النوع غير محدد"],["Date de démarrage non renseignée","Start date not specified","Data de início não indicada","تاريخ البدء غير محدد"],["Connectez-vous pour analyser les données de votre organisation.","Sign in to analyse your organisation's data.","Inicie sessão para analisar os dados da sua organização.","سجّل الدخول لتحليل بيانات مؤسستك."],["Sélectionnez une variable mesurée.","Select a measured variable.","Selecione uma variável medida.","اختر متغيرًا مقاسًا."],["Chargement des mesures depuis Supabase…","Loading measurements from Supabase…","A carregar medições do Supabase…","جارٍ تحميل القياسات من Supabase…"],["Mesures chargées","Measurements loaded","Medições carregadas","تم تحميل القياسات"],["Valeurs numériques","Numeric values","Valores numéricos","القيم الرقمية"],["Valeurs comparables","Comparable values","Valores comparáveis","القيم القابلة للمقارنة"],["Données chargées depuis Supabase. Les résultats sont descriptifs.","Data loaded from Supabase. Results are descriptive.","Dados carregados do Supabase. Os resultados são descritivos.","تم تحميل البيانات من Supabase. النتائج وصفية."],["Aucune mesure ne correspond aux filtres sélectionnés.","No measurements match the selected filters.","Nenhuma medição corresponde aos filtros selecionados.","لا توجد قياسات تطابق عوامل التصفية المحددة."],["Date de mesure","Measurement date","Data da medição","تاريخ القياس"],["Culture liée par identifiant","Culture linked by ID","Cultura associada por identificador","المزرعة مرتبطة بالمعرّف"],["Lot / cible sans culture directe","Batch / target without a direct culture link","Lote / alvo sem ligação direta a uma cultura","دفعة / هدف دون ارتباط مباشر بمزرعة"],["Type de culture non renseigné","Culture type not specified","Tipo de cultura não indicado","نوع المزرعة غير محدد"],["Identifiant matériel","Material identifier","Identificador do material","معرّف المادة"],["Événements","Events","Eventos","الأحداث"],["Mesures / observations","Measurements / observations","Medições / observações","القياسات / الملاحظات"],["Valeur absente","Value missing","Valor em falta","القيمة مفقودة"],["Événement associé à un lot.","Event associated with a batch.","Evento associado a um lote.","حدث مرتبط بدفعة."],["Événement de traçabilité.","Traceability event.","Evento de rastreabilidade.","حدث تتبّع."],["Historique partiel : au moins une catégorie atteint sa limite de chargement. Certaines données anciennes peuvent ne pas apparaître ici.","Partial history: at least one category reached its loading limit. Older data may be missing.","Histórico parcial: pelo menos uma categoria atingiu o limite de carregamento. Podem faltar dados antigos.","السجل جزئي: بلغت فئة واحدة على الأقل حد التحميل. قد تكون بعض البيانات القديمة غير ظاهرة."],["Aucun détail enregistré","No details recorded","Nenhum detalhe registado","لم يتم تسجيل تفاصيل"],["Observation sans description","Observation without a description","Observação sem descrição","ملاحظة دون وصف"],["Cultures végétales et substrats","Plant cultures and substrates","Culturas vegetais e substratos","مزارع نباتية وركائز"],["Souches et cultures fongiques","Fungal strains and cultures","Estirpes e culturas fúngicas","سلالات ومزارع فطرية"],["Observations mycologiques","Mycological observations","Observações micológicas","ملاحظات فطرية"],["Cultures sources et matières biologiques","Source cultures and biological materials","Culturas de origem e materiais biológicos","مزارع المصدر والمواد البيولوجية"],["Mesures et résultats expérimentaux","Measurements and experimental results","Medições e resultados experimentais","القياسات والنتائج التجريبية"],["Analyse expérimentale","Experimental analysis","Análise experimental","التحليل التجريبي"],["Variable modifiée. Lancez l’analyse pour actualiser les résultats.","Variable changed. Run the analysis to refresh results.","Variável alterada. Execute a análise para atualizar os resultados.","تم تغيير المتغير. شغّل التحليل لتحديث النتائج."],["Culture modifiée. Lancez l’analyse pour actualiser les résultats.","Culture changed. Run the analysis to refresh results.","Cultura alterada. Execute a análise para atualizar os resultados.","تم تغيير المزرعة. شغّل التحليل لتحديث النتائج."],["Lot modifié. Lancez l’analyse pour actualiser les résultats.","Batch changed. Run the analysis to refresh results.","Lote alterado. Execute a análise para atualizar os resultados.","تم تغيير الدفعة. شغّل التحليل لتحديث النتائج."],["Période modifiée. Lancez l’analyse pour actualiser les résultats.","Period changed. Run the analysis to refresh results.","Período alterado. Execute a análise para atualizar os resultados.","تم تغيير الفترة. شغّل التحليل لتحديث النتائج."],["Le paramètre n’a pas été reconnu automatiquement. Sélectionnez-le dans la liste ; la saisie express reste disponible.","The parameter was not recognised automatically. Select it from the list; quick entry remains available.","O parâmetro não foi reconhecido automaticamente. Selecione-o na lista; o registo rápido continua disponível.","لم يتم التعرف على المعلمة تلقائيًا. اخترها من القائمة؛ يظل الإدخال السريع متاحًا."],["Suivez les conditions de culture, les mesures environnementales et l’évolution des plantes.","Track growing conditions, environmental measurements and plant development.","Acompanhe as condições de cultivo, as medições ambientais e o desenvolvimento das plantas.","تابع ظروف الزراعة والقياسات البيئية وتطور النباتات."],["Souches, lignées, générations, transferts et fructification.","Strains, lineages, generations, transfers and fruiting.","Estirpes, linhagens, gerações, transferências e frutificação.","السلالات والخطوط والأجيال وعمليات النقل والإثمار."],["Documentez l’identité des souches, les étapes de propagation, les observations morphologiques et les incidents.","Document strain identity, propagation stages, morphological observations and incidents.","Documente a identidade das estirpes, as etapas de propagação, as observações morfológicas e os incidentes.","وثّق هوية السلالات ومراحل الإكثار والملاحظات الشكلية والحوادث."],["Cultures sur milieux, protocoles, variables et résultats.","Cultures on media, protocols, variables and results.","Culturas em meios, protocolos, variáveis e resultados.","مزارع على أوساط الزراعة والبروتوكولات والمتغيرات والنتائج."],["Enregistrez les conditions expérimentales, les variables mesurées et les résultats avec leur contexte.","Record experimental conditions, measured variables and results with their context.","Registe as condições experimentais, as variáveis medidas e os resultados com o respetivo contexto.","سجّل الظروف التجريبية والمتغيرات المقاسة والنتائج مع سياقها."]];
  for (const [fr, en, pt, ar] of supplemental) {
    dictionaries.en[fr] ||= en;
    dictionaries.pt[fr] ||= pt;
    dictionaries.ar[fr] ||= ar;
  }


  const supplementalCoverage = [
  [
    "Préparation",
    "Preparation",
    "Preparação",
    "التحضير"
  ],
  [
    "Stérilisation",
    "Sterilization",
    "Esterilização",
    "التعقيم"
  ],
  [
    "Récolte",
    "Harvest",
    "Colheita",
    "الحصاد"
  ],
  [
    "Libération",
    "Release",
    "Libertação",
    "الإفراج"
  ],
  [
    "À venir",
    "Upcoming",
    "A seguir",
    "قادم"
  ],
  [
    "Terminée",
    "Completed",
    "Concluída",
    "مكتملة"
  ],
  [
    "Échec",
    "Failed",
    "Falhou",
    "فشل"
  ],
  [
    "L'appel à claim-ba-labs a échoué.",
    "The BA Labs account-linking request failed.",
    "O pedido de associação à conta BA Labs falhou.",
    "فشل طلب ربط الحساب بـ BA Labs."
  ],
  [
    "claim-ba-labs n'a retourné aucune donnée.",
    "The account-linking request returned no data.",
    "O pedido de associação da conta não devolveu dados.",
    "لم يُرجع طلب ربط الحساب أي بيانات."
  ],
  [
    "Le compte n'a pas pu être rattaché à BA-LABS.",
    "The account could not be linked to BA-LABS.",
    "Não foi possível associar a conta à BA-LABS.",
    "تعذّر ربط الحساب بـ BA-LABS."
  ],
  [
    "claim-ba-labs n'a pas retourné l'organisation BA-LABS.",
    "The account-linking request did not return the BA-LABS organization.",
    "O pedido de associação não devolveu a organização BA-LABS.",
    "لم يُرجع طلب الربط مؤسسة BA-LABS."
  ],
  [
    "Le mot de passe doit comporter au moins 6 caractères.",
    "The password must contain at least 6 characters.",
    "A palavra-passe deve conter pelo menos 6 caracteres.",
    "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل."
  ],
  [
    "Compte créé. Vérifiez l'email de confirmation Supabase, puis revenez ici et connectez-vous.",
    "Account created. Check the Supabase confirmation email, then return here and sign in.",
    "Conta criada. Verifique o email de confirmação do Supabase e depois volte para iniciar sessão.",
    "تم إنشاء الحساب. تحقّق من رسالة تأكيد Supabase ثم عُد لتسجيل الدخول."
  ],
  [
    "Création du compte impossible.",
    "Unable to create the account.",
    "Não foi possível criar a conta.",
    "تعذّر إنشاء الحساب."
  ],
  [
    "Erreur déconnexion:",
    "Sign-out error:",
    "Erro ao terminar sessão:",
    "خطأ في تسجيل الخروج:"
  ],
  [
    "Non connecté.",
    "Not signed in.",
    "Sessão não iniciada.",
    "لم يتم تسجيل الدخول."
  ],
  [
    "Sélectionner une souche...",
    "Select a strain...",
    "Selecionar uma estirpe...",
    "اختر سلالة..."
  ],
  [
    "Organisation absente avant chargement des références.",
    "Organization is missing before reference data can load.",
    "A organização está em falta antes de carregar os dados de referência.",
    "المؤسسة غير محددة قبل تحميل البيانات المرجعية."
  ],
  [
    "Sélectionner...",
    "Select...",
    "Selecionar...",
    "اختر..."
  ],
  [
    "Votre session a expiré.",
    "Your session has expired.",
    "A sua sessão expirou.",
    "انتهت صلاحية جلستك."
  ],
  [
    "Contrôle qualité enregistré.",
    "Quality control saved.",
    "Controlo de qualidade guardado.",
    "تم حفظ مراقبة الجودة."
  ],
  [
    "QC : utiliser la libération",
    "QC: use the release action",
    "CQ: utilize a ação de libertação",
    "مراقبة الجودة: استخدم إجراء الإفراج"
  ],
  [
    "Batch terminé",
    "Batch completed",
    "Lote concluído",
    "اكتملت الدفعة"
  ],
  [
    "Démarrer / passer à l'étape suivante",
    "Start / move to the next stage",
    "Iniciar / avançar para a etapa seguinte",
    "ابدأ / انتقل إلى المرحلة التالية"
  ],
  [
    "Sélectionnez un type de batch.",
    "Select a batch type.",
    "Selecione um tipo de lote.",
    "اختر نوع الدفعة."
  ],
  [
    "Sélectionnez une culture source.",
    "Select a source culture.",
    "Selecione uma cultura de origem.",
    "اختر مزرعة مصدر."
  ],
  [
    "La culture sélectionnée n'est plus disponible.",
    "The selected culture is no longer available.",
    "A cultura selecionada já não está disponível.",
    "لم تعد المزرعة المحددة متاحة."
  ],
  [
    "La quantité prévue est invalide.",
    "The planned quantity is invalid.",
    "A quantidade prevista é inválida.",
    "الكمية المخططة غير صالحة."
  ],
  [
    "Création...",
    "Creating...",
    "A criar...",
    "جارٍ الإنشاء..."
  ],
  [
    "Batch créé dans Supabase.",
    "Batch created in Supabase.",
    "Lote criado no Supabase.",
    "تم إنشاء الدفعة في Supabase."
  ],
  [
    "La création du batch a échoué.",
    "Batch creation failed.",
    "A criação do lote falhou.",
    "فشل إنشاء الدفعة."
  ],
  [
    "Sélectionnez d'abord un batch.",
    "Select a batch first.",
    "Selecione primeiro um lote.",
    "اختر دفعة أولاً."
  ],
  [
    "Cette étape ne peut pas être avancée avec cette action.",
    "This stage cannot be advanced with this action.",
    "Não é possível avançar esta etapa com esta ação.",
    "لا يمكن تقديم هذه المرحلة بهذا الإجراء."
  ],
  [
    "Vérification QC...",
    "Checking quality control...",
    "A verificar o controlo de qualidade...",
    "جارٍ التحقق من مراقبة الجودة..."
  ],
  [
    "Le batch ne peut pas être libéré.",
    "The batch cannot be released.",
    "Não é possível libertar o lote.",
    "لا يمكن الإفراج عن الدفعة."
  ],
  [
    "Sélectionner un paramètre…",
    "Select a parameter…",
    "Selecionar um parâmetro…",
    "اختر معلماً…"
  ],
  [
    "Aucun paramètre disponible",
    "No parameters available",
    "Nenhum parâmetro disponível",
    "لا توجد معلمات متاحة"
  ],
  [
    "Sélectionner une catégorie…",
    "Select a category…",
    "Selecionar uma categoria…",
    "اختر فئة…"
  ],
  [
    "Aucune catégorie disponible",
    "No categories available",
    "Nenhuma categoria disponível",
    "لا توجد فئات متاحة"
  ],
  [
    "Créez d’abord une culture ou un lot",
    "Create a culture or batch first",
    "Crie primeiro uma cultura ou um lote",
    "أنشئ مزرعة أو دفعة أولاً"
  ],
  [
    "Sélectionner une unité…",
    "Select a unit…",
    "Selecionar uma unidade…",
    "اختر وحدة…"
  ],
  [
    "Aucune unité compatible",
    "No compatible units",
    "Nenhuma unidade compatível",
    "لا توجد وحدات متوافقة"
  ],
  [
    "Choisissez une culture ou un lot, un paramètre, une valeur numérique et une unité.",
    "Choose a culture or batch, a parameter, a numeric value, and a unit.",
    "Escolha uma cultura ou lote, um parâmetro, um valor numérico e uma unidade.",
    "اختر مزرعة أو دفعة ومعلمة وقيمة رقمية ووحدة."
  ],
  [
    "L’unité choisie n’est pas compatible avec la dimension du paramètre.",
    "The selected unit is incompatible with the parameter dimension.",
    "A unidade selecionada é incompatível com a dimensão do parâmetro.",
    "الوحدة المحددة غير متوافقة مع بُعد المعلمة."
  ],
  [
    "Le lot sélectionné n’est plus disponible.",
    "The selected batch is no longer available.",
    "O lote selecionado já não está disponível.",
    "لم تعد الدفعة المحددة متاحة."
  ],
  [
    "Mesure enregistrée dans Supabase avec sa provenance.",
    "Measurement saved in Supabase with its provenance.",
    "Medição guardada no Supabase com a respetiva proveniência.",
    "تم حفظ القياس في Supabase مع مصدره."
  ],
  [
    "L’enregistrement de la mesure a échoué.",
    "Saving the measurement failed.",
    "Falha ao guardar a medição.",
    "فشل حفظ القياس."
  ],
  [
    "Choisissez une cible, une catégorie et décrivez l’observation.",
    "Choose a target and category, then describe the observation.",
    "Escolha um alvo e uma categoria e descreva a observação.",
    "اختر هدفاً وفئة ثم صِف الملاحظة."
  ],
  [
    "Observation enregistrée dans Supabase avec sa provenance.",
    "Observation saved in Supabase with its provenance.",
    "Observação guardada no Supabase com a respetiva proveniência.",
    "تم حفظ الملاحظة في Supabase مع مصدرها."
  ],
  [
    "L’enregistrement de l’observation a échoué.",
    "Saving the observation failed.",
    "Falha ao guardar a observação.",
    "فشل حفظ الملاحظة."
  ],
  [
    "Aucune culture ne correspond à cette recherche.",
    "No cultures match this search.",
    "Nenhuma cultura corresponde a esta pesquisa.",
    "لا توجد مزارع تطابق هذا البحث."
  ],
  [
    "Aucune culture chargée. Créez une culture avec le formulaire ci-dessus.",
    "No cultures loaded. Create one using the form above.",
    "Não foram carregadas culturas. Crie uma usando o formulário acima.",
    "لم يتم تحميل أي مزارع. أنشئ مزرعة باستخدام النموذج أعلاه."
  ],
  [
    "Type non renseigné",
    "Type not specified",
    "Tipo não indicado",
    "النوع غير محدد"
  ],
  [
    "Date de démarrage non renseignée",
    "Start date not specified",
    "Data de início não indicada",
    "تاريخ البدء غير محدد"
  ],
  [
    "Connectez-vous pour analyser les données de votre organisation.",
    "Sign in to analyze your organization's data.",
    "Inicie sessão para analisar os dados da sua organização.",
    "سجّل الدخول لتحليل بيانات مؤسستك."
  ],
  [
    "Sélectionnez une variable mesurée.",
    "Select a measured variable.",
    "Selecione uma variável medida.",
    "اختر متغيراً مقاساً."
  ],
  [
    "Valeurs numériques",
    "Numeric values",
    "Valores numéricos",
    "القيم الرقمية"
  ],
  [
    "Données chargées depuis Supabase. Les résultats sont descriptifs.",
    "Data loaded from Supabase. Results are descriptive.",
    "Dados carregados do Supabase. Os resultados são descritivos.",
    "تم تحميل البيانات من Supabase. النتائج وصفية."
  ],
  [
    "Aucune mesure ne correspond aux filtres sélectionnés.",
    "No measurements match the selected filters.",
    "Nenhuma medição corresponde aos filtros selecionados.",
    "لا توجد قياسات تطابق عوامل التصفية المحددة."
  ],
  [
    "Période représentée :",
    "Period shown:",
    "Período apresentado:",
    "الفترة المعروضة:"
  ],
  [
    "Unité non renseignée",
    "Unit not specified",
    "Unidade não indicada",
    "الوحدة غير محددة"
  ],
  [
    "Culture liée par identifiant",
    "Culture linked by identifier",
    "Cultura associada por identificador",
    "المزرعة مرتبطة بالمعرّف"
  ],
  [
    "Historique partiel : au moins une catégorie atteint sa limite de chargement. Certaines données anciennes peuvent ne pas apparaître ici.",
    "Partial history: at least one category reached its loading limit. Some older data may not appear here.",
    "Histórico parcial: pelo menos uma categoria atingiu o limite de carregamento. Alguns dados antigos podem não aparecer aqui.",
    "السجل جزئي: بلغت فئة واحدة على الأقل حد التحميل. قد لا تظهر بعض البيانات القديمة هنا."
  ],
  [
    "Aucun détail enregistré",
    "No details recorded",
    "Nenhum detalhe registado",
    "لم تُسجّل تفاصيل"
  ],
  [
    "Suivez les conditions de culture, les mesures environnementales et l’évolution des plantes.",
    "Track growing conditions, environmental measurements, and plant development.",
    "Acompanhe as condições de cultivo, as medições ambientais e o desenvolvimento das plantas.",
    "تابع ظروف الزراعة والقياسات البيئية وتطور النباتات."
  ],
  [
    "Cultures végétales et substrats",
    "Plant cultures and substrates",
    "Culturas vegetais e substratos",
    "المحاصيل النباتية والركائز"
  ],
  [
    "Cultures sources et matières biologiques",
    "Source cultures and biological materials",
    "Culturas de origem e materiais biológicos",
    "مزارع المصدر والمواد البيولوجية"
  ],
  [
    "Mesures et résultats expérimentaux",
    "Measurements and experimental results",
    "Medições e resultados experimentais",
    "القياسات والنتائج التجريبية"
  ],
  [
    "ANALYSE EXPLORATOIRE",
    "EXPLORATORY ANALYSIS",
    "ANÁLISE EXPLORATÓRIA",
    "التحليل الاستكشافي"
  ],
  [
    "Comparer mes lots",
    "Compare my batches",
    "Comparar os meus lotes",
    "مقارنة دفعاتي"
  ],
  [
    "Comparez les mesures et observations déjà enregistrées. Aucun enregistrement ne sera créé ou modifié.",
    "Compare measurements and observations already recorded. No records will be created or changed.",
    "Compare as medições e observações já registadas. Nenhum registo será criado ou alterado.",
    "قارن القياسات والملاحظات المسجلة بالفعل. لن يتم إنشاء السجلات أو تعديلها."
  ],
  [
    "Sélection limitée aux 30 lots les plus récents actuellement chargés. Les données sont rattachées à un lot via ses événements ; les données liées uniquement à une culture ne sont attribuées que si cette culture correspond sans ambiguïté à un seul lot sélectionné.",
    "Selection is limited to the 30 most recently loaded batches. Data are linked through events; culture-only data are assigned only when that culture unambiguously maps to one selected batch.",
    "A seleção está limitada aos 30 lotes carregados mais recentes. Os dados são associados através de eventos; dados ligados apenas a uma cultura só são atribuídos quando essa cultura corresponde inequivocamente a um único lote selecionado.",
    "يقتصر الاختيار على أحدث 30 دفعة محملة. تُربط البيانات عبر الأحداث؛ ولا تُنسب البيانات المرتبطة بالثقافة فقط إلا إذا كانت تلك الثقافة مرتبطة بوضوح بدفعة واحدة محددة."
  ],
  [
    "Depuis le",
    "From",
    "Desde",
    "من تاريخ"
  ],
  [
    "Jusqu’au",
    "Through",
    "Até",
    "إلى تاريخ"
  ],
  [
    "Comparer les lots sélectionnés",
    "Compare selected batches",
    "Comparar os lotes selecionados",
    "قارن الدفعات المحددة"
  ],
  [
    "Sélectionnez au moins deux lots pour commencer.",
    "Select at least two batches to begin.",
    "Selecione pelo menos dois lotes para começar.",
    "حدد دفعتين على الأقل للبدء."
  ],
  [
    "1. Constats descriptifs",
    "1. Descriptive findings",
    "1. Constatações descritivas",
    "١. ملاحظات وصفية"
  ],
  [
    "2. Corrélations exploratoires",
    "2. Exploratory correlations",
    "2. Correlações exploratórias",
    "٢. ارتباطات استكشافية"
  ],
  [
    "3. Hypothèses à tester ensuite",
    "3. Hypotheses to test next",
    "3. Hipóteses a testar a seguir",
    "٣. فرضيات للاختبار لاحقًا"
  ],
  [
    "Mesures numériques par lot et unité",
    "Numeric measurements by batch and unit",
    "Medições numéricas por lote e unidade",
    "القياسات الرقمية حسب الدفعة والوحدة"
  ],
  [
    "Observations qualitatives par lot",
    "Qualitative observations by batch",
    "Observações qualitativas por lote",
    "الملاحظات النوعية حسب الدفعة"
  ],
  [
    "Lecture scientifique : les constats décrivent les données disponibles ; les corrélations sont exploratoires et ne démontrent pas de causalité ; les variables suggérées sont des pistes à mesurer lors d’un prochain essai. L’absence de mesure enregistrée ne prouve pas qu’une mesure était prévue. Les unités sont converties seulement si le catalogue permet une conversion compatible et sûre ; sinon, les séries restent séparées.",
    "Scientific interpretation: findings describe available data; correlations are exploratory and do not demonstrate causality; suggested variables are candidates to measure in a future experiment. No recorded measurement does not prove one was scheduled. Units are converted only when the catalogue supports a safe compatible conversion; otherwise series remain separate.",
    "Interpretação científica: as constatações descrevem os dados disponíveis; as correlações são exploratórias e não demonstram causalidade; as variáveis sugeridas são opções a medir numa experiência futura. A ausência de uma medição registada não prova que estivesse prevista. As unidades só são convertidas quando o catálogo permite uma conversão compatível e segura; caso contrário, as séries permanecem separadas.",
    "التفسير العلمي: تصف النتائج البيانات المتاحة؛ والارتباطات استكشافية ولا تثبت السببية؛ والمتغيرات المقترحة خيارات لقياسها في تجربة لاحقة. غياب القياس المسجل لا يثبت أنه كان مقرراً. تُحوّل الوحدات فقط عندما يسمح الكتالوج بتحويل آمن ومتوافق؛ وإلا فتبقى السلاسل منفصلة."
  ],
  [
    "Analyse expérimentale",
    "Experimental analysis",
    "Análise experimental",
    "التحليل التجريبي"
  ],
  [
    "Aucun lot disponible dans le chargement courant. Créez un lot ou vérifiez les droits d’accès à votre organisation.",
    "No batches are available in the current load. Create a batch or check your organization access.",
    "Não há lotes disponíveis no carregamento atual. Crie um lote ou verifique o acesso à organização.",
    "لا توجد دفعات متاحة في التحميل الحالي. أنشئ دفعة أو تحقق من صلاحيات الوصول إلى مؤسستك."
  ],
  [
    "Lot sans code",
    "Batch without a code",
    "Lote sem código",
    "دفعة بلا رمز"
  ],
  [
    "Sans description",
    "No description",
    "Sem descrição",
    "بلا وصف"
  ],
  [
    "Étape non renseignée",
    "Stage not specified",
    "Etapa não indicada",
    "المرحلة غير محددة"
  ],
  [
    "Aucune donnée disponible.",
    "No data available.",
    "Nenhum dado disponível.",
    "لا تتوفر بيانات."
  ],
  [
    "Date de mesure",
    "Measurement date",
    "Data da medição",
    "تاريخ القياس"
  ],
  [
    "Évolution temporelle de",
    "Time evolution of",
    "Evolução temporal de",
    "التغير الزمني لـ"
  ],
  [
    "Lot",
    "Batch",
    "Lote",
    "دفعة"
  ],
  [
    "Connectez-vous pour comparer les lots de votre organisation.",
    "Sign in to compare batches in your organization.",
    "Inicie sessão para comparar os lotes da sua organização.",
    "سجّل الدخول لمقارنة دفعات مؤسستك."
  ],
  [
    "Sélectionnez au moins deux lots.",
    "Select at least two batches.",
    "Selecione pelo menos dois lotes.",
    "حدد دفعتين على الأقل."
  ],
  [
    "La sélection a changé. Actualisez la liste des lots et réessayez.",
    "The selection has changed. Refresh the batch list and try again.",
    "A seleção mudou. Atualize a lista de lotes e tente novamente.",
    "تغير التحديد. حدّث قائمة الدفعات وحاول مرة أخرى."
  ],
  [
    "La date de début doit précéder ou correspondre à la date de fin.",
    "The start date must be on or before the end date.",
    "A data inicial deve ser anterior ou igual à data final.",
    "يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساوياً له."
  ],
  [
    "Comparaison en cours…",
    "Comparison in progress…",
    "Comparação em curso…",
    "المقارنة قيد التنفيذ…"
  ],
  [
    "Lecture des données autorisées dans Supabase…",
    "Reading data authorized by Supabase…",
    "A ler os dados autorizados no Supabase…",
    "جارٍ قراءة البيانات المصرح بها في Supabase…"
  ],
  [
    "unité non renseignée",
    "unit not specified",
    "unidade não indicada",
    "الوحدة غير محددة"
  ],
  [
    "normalisée",
    "normalized",
    "normalizada",
    "مطَبَّعة"
  ],
  [
    "convertie",
    "converted",
    "convertida",
    "محوّلة"
  ],
  [
    "Variable non référencée",
    "Unreferenced variable",
    "Variável sem referência",
    "متغير غير مرجعي"
  ],
  [
    "début non limité",
    "unbounded start",
    "início sem limite",
    "بداية غير محددة"
  ],
  [
    "fin non limitée",
    "unbounded end",
    "fim sem limite",
    "نهاية غير محددة"
  ],
  [
    "aucune date disponible",
    "no dates available",
    "nenhuma data disponível",
    "لا تتوفر تواريخ"
  ],
  [
    "Lots sélectionnés",
    "Selected batches",
    "Lotes selecionados",
    "الدفعات المحددة"
  ],
  [
    "Mesures utilisables",
    "Usable measurements",
    "Medições utilizáveis",
    "القياسات القابلة للاستخدام"
  ],
  [
    "Observations qualitatives",
    "Qualitative observations",
    "Observações qualitativas",
    "الملاحظات النوعية"
  ],
  [
    "Aucune mesure ni observation exploitable n’a été trouvée pour ces lots et cette période. Cela ne permet pas de conclure sur leurs performances.",
    "No usable measurements or observations were found for these batches and this period. No conclusion about their performance can be drawn.",
    "Não foram encontradas medições ou observações utilizáveis para estes lotes e período. Não é possível tirar conclusões sobre o seu desempenho.",
    "لم يُعثر على قياسات أو ملاحظات قابلة للاستخدام لهذه الدفعات والفترة. لا يمكن استخلاص استنتاج بشأن أدائها."
  ],
  [
    "Valeurs atypiques",
    "Outliers",
    "Valores atípicos",
    "قيم شاذة"
  ],
  [
    "Aucune mesure numérique exploitable dans la sélection. Les observations qualitatives restent analysées séparément.",
    "No usable numeric measurements in this selection. Qualitative observations are analyzed separately.",
    "Não há medições numéricas utilizáveis nesta seleção. As observações qualitativas são analisadas separadamente.",
    "لا توجد قياسات رقمية قابلة للاستخدام في هذا التحديد. تُحلل الملاحظات النوعية بشكل منفصل."
  ],
  [
    "variable_non_renseignée",
    "unspecified_variable",
    "variável_não_indicada",
    "متغير_غير_محدد"
  ],
  [
    "Observation sans texte",
    "Observation without text",
    "Observação sem texto",
    "ملاحظة بلا نص"
  ],
  [
    "Aucune observation enregistrée",
    "No observation recorded",
    "Nenhuma observação registada",
    "لم تُسجّل أي ملاحظة"
  ],
  [
    "Variable observée",
    "Observed variable",
    "Variável observada",
    "المتغير المرصود"
  ],
  [
    "Dernière valeur textuelle",
    "Latest text value",
    "Último valor textual",
    "آخر قيمة نصية"
  ],
  [
    "Dernière date",
    "Latest date",
    "Data mais recente",
    "أحدث تاريخ"
  ],
  [
    "Aucune observation qualitative enregistrée pour les lots sélectionnés et la période choisie.",
    "No qualitative observations were recorded for the selected batches and period.",
    "Não foram registadas observações qualitativas para os lotes e período selecionados.",
    "لم تُسجّل ملاحظات نوعية للدفعات والفترة المحددة."
  ],
  [
    "Association linéaire exploratoire marquée",
    "Strong exploratory linear association",
    "Associação linear exploratória forte",
    "ارتباط خطي استكشافي قوي"
  ],
  [
    "Association linéaire exploratoire",
    "Exploratory linear association",
    "Associação linear exploratória",
    "ارتباط خطي استكشافي"
  ],
  [
    "Corrélation de Pearson sur des moyennes journalières appariées au sein du même lot (au moins 4 journées appariées). Les répétitions ne sont pas indépendantes et les effets du temps ou des traitements ne sont pas contrôlés.",
    "Pearson correlation on paired daily means within the same batch (at least 4 paired days). Repeated observations are not independent, and time or treatment effects are not controlled.",
    "Correlação de Pearson sobre médias diárias emparelhadas dentro do mesmo lote (pelo menos 4 dias emparelhados). As repetições não são independentes e os efeitos do tempo ou dos tratamentos não são controlados.",
    "ارتباط بيرسون بين المتوسطات اليومية المقترنة داخل الدفعة نفسها (أربعة أيام مقترنة على الأقل). التكرارات ليست مستقلة ولم تُضبط آثار الزمن أو المعالجات."
  ],
  [
    "Journées appariées (n)",
    "Paired days (n)",
    "Dias emparelhados (n)",
    "الأيام المقترنة (n)"
  ],
  [
    "Associations observées",
    "Observed associations",
    "Associações observadas",
    "الارتباطات المرصودة"
  ],
  [
    "Une corrélation, même forte, ne démontre pas de causalité.",
    "A correlation, even a strong one, does not demonstrate causality.",
    "Uma correlação, mesmo forte, não demonstra causalidade.",
    "الارتباط، حتى إن كان قوياً، لا يثبت السببية."
  ],
  [
    "Pas assez de journées appariées entre variables différentes pour calculer une corrélation interprétable (minimum opérationnel : 4 journées au sein du même lot).",
    "Not enough paired days between different variables to calculate an interpretable correlation (operational minimum: 4 days within the same batch).",
    "Não existem dias emparelhados suficientes entre variáveis diferentes para calcular uma correlação interpretável (mínimo operacional: 4 dias no mesmo lote).",
    "لا توجد أيام مقترنة كافية بين المتغيرات المختلفة لحساب ارتباط قابل للتفسير (الحد الأدنى العملي: 4 أيام داخل الدفعة نفسها)."
  ],
  [
    "Pour un prochain essai, envisager de mesurer conjointement — si pertinent pour le système étudié —",
    "For a future trial, consider measuring together — if relevant to the system studied —",
    "Num próximo ensaio, considere medir em conjunto — se for pertinente para o sistema estudado —",
    "في تجربة لاحقة، فكّر في قياس المتغيرات معاً — إذا كان ذلك مناسباً للنظام المدروس —"
  ],
  [
    "Choisir une variable de réponse et enregistrer en parallèle les facteurs de milieu ou de procédé pertinents déjà présents dans le catalogue. Préspécifier fréquence, méthode, unités et répétitions.",
    "Choose a response variable and simultaneously record relevant environmental or process factors already in the catalogue. Predefine frequency, method, units and replicates.",
    "Escolha uma variável de resposta e registe em paralelo os fatores ambientais ou de processo relevantes já existentes no catálogo. Defina previamente frequência, método, unidades e repetições.",
    "اختر متغير استجابة وسجّل بالتوازي عوامل البيئة أو العملية ذات الصلة الموجودة في الكتالوج. حدّد مسبقاً التواتر والطريقة والوحدات والتكرارات."
  ],
  [
    "Ces variables sont des pistes de protocole, pas des explications démontrées des différences observées.",
    "These variables are protocol ideas, not proven explanations for the observed differences.",
    "Estas variáveis são pistas para o protocolo, não explicações comprovadas das diferenças observadas.",
    "هذه المتغيرات مقترحات للبروتوكول وليست تفسيرات مثبتة للاختلافات المرصودة."
  ],
  [
    "Variable · unité / lot",
    "Variable · unit / batch",
    "Variável · unidade / lote",
    "المتغير · الوحدة / الدفعة"
  ],
  [
    "Min–max",
    "Min–max",
    "Mín.–máx.",
    "الحد الأدنى–الأقصى"
  ],
  [
    "Dernière valeur textuelle",
    "Latest text value",
    "Último valor textual",
    "آخر قيمة نصية"
  ],
  [
    "Période réellement couverte par les données utilisées :",
    "Actual period covered by the data used:",
    "Período efetivamente abrangido pelos dados utilizados:",
    "الفترة الفعلية التي تغطيها البيانات المستخدمة:"
  ]
];
for (const [fr, en, pt, ar] of supplementalCoverage) {
    dictionaries.en[fr] ||= en;
    dictionaries.pt[fr] ||= pt;
    dictionaries.ar[fr] ||= ar;
  }

  const sourceText = new WeakMap();
  const sourceAttrs = new WeakMap();
  let currentLanguage = "fr";
  const normalize = value => (value || "").replace(/\s+/g, " ").trim();
  function translate(value, lang) {
    const source = normalize(value);
    if (!source || lang === "fr") return value;
    const dict = dictionaries[lang] || {};
    if (dict[source]) return value.replace(source, dict[source]);
    return value;
  }
  function translateTree(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!sourceText.has(node)) sourceText.set(node, node.nodeValue);
      const original = sourceText.get(node);
      const result = translate(original, currentLanguage);
      if (node.nodeValue !== result) node.nodeValue = result;
    }
    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of elements) {
      const attrs = ["placeholder", "title", "aria-label"];
      if (!sourceAttrs.has(el)) sourceAttrs.set(el, Object.fromEntries(attrs.filter(a => el.hasAttribute(a)).map(a => [a, el.getAttribute(a)])));
      for (const [attr, original] of Object.entries(sourceAttrs.get(el))) {
        const result = translate(original, currentLanguage);
        if (el.getAttribute(attr) !== result) el.setAttribute(attr, result);
      }
    }
  }
  function setLanguage(lang) {
    currentLanguage = ["fr", "en", "pt", "ar"].includes(lang) ? lang : "fr";
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    translateTree(document.getElementById("workspace-root") || document);
    const select = document.getElementById("languageSelect");
    if (select && select.value !== currentLanguage) select.value = currentLanguage;
    const label = document.getElementById("languageLabel");
    if (label) label.textContent = currentLanguage === "ar" ? "اللغة" : currentLanguage === "pt" ? "Idioma" : currentLanguage === "en" ? "Language" : "Langue";
    try { localStorage.setItem("ba-labs-language", currentLanguage); } catch (_) {}
  }
  function mountSelector() {
    const toolbar = document.querySelector(".app-toolbar");
    if (!toolbar || document.getElementById("languageSelect")) return;
    const wrap = document.createElement("label");
    wrap.className = "language-control";
    wrap.htmlFor = "languageSelect";
    wrap.innerHTML = '<span id="languageLabel">Langue</span><select id="languageSelect" aria-label="Language"><option value="fr">Français</option><option value="en">English</option><option value="pt">Português</option><option value="ar">العربية</option></select>';
    const status = toolbar.querySelector(".toolbar-status");
    toolbar.insertBefore(wrap, status || null);
    document.getElementById("languageSelect").addEventListener("change", event => setLanguage(event.target.value));
  }
  function init() {
    mountSelector();
    let preferred = "fr";
    try { preferred = localStorage.getItem("ba-labs-language") || "fr"; } catch (_) {}
    setLanguage(preferred);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "childList") record.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!sourceText.has(node)) sourceText.set(node, node.nodeValue);
            const result = translate(sourceText.get(node), currentLanguage);
            if (node.nodeValue !== result) node.nodeValue = result;
          } else if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
        });
      }
    });
    observer.observe(document.getElementById("workspace-root") || document.body, {subtree:true, childList:true});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true}); else init();
  window.BALabsI18n = { setLanguage, get language() { return currentLanguage; } };
})();
