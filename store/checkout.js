(() => {
"use strict";
const ENDPOINT="https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/notion-store-order";
const SUPABASE_KEY="sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992";
const $=s=>document.querySelector(s);
const tr={
fr:{intro:"Renseignez vos coordonnées. Votre demande sera enregistrée dans le registre commercial BA Labs ; disponibilité, prix final et livraison seront confirmés par notre équipe.",name:"Nom complet",phone:"Téléphone",email:"E-mail (facultatif)",company:"Organisation (facultatif)",wilaya:"Wilaya",commune:"Commune",delivery:"Mode de remise",pickup:"Retrait au laboratoire",shipping:"Livraison / expédition",address:"Adresse de livraison",note:"Instructions complémentaires (facultatif)",consent:"J'accepte l'utilisation de mes coordonnées pour traiter cette demande. Voir la politique de confidentialité.",submit:"Envoyer ma demande",sending:"Enregistrement…",success:"Demande enregistrée dans le registre commercial BA Labs.",ref:"Référence de demande",error:"La demande n'a pas pu être enregistrée. Réessayez dans un instant.",required:"Vérifiez les champs obligatoires.",cart:"Récapitulatif de votre sélection",noItems:"Votre panier est vide.",integration:"Transmission vers le registre commercial Notion BA Labs. Aucun paiement n'est effectué à cette étape."},
en:{intro:"Enter your contact details. Your request will be saved to the BA Labs commercial register; availability, final pricing and delivery will be confirmed by our team.",name:"Full name",phone:"Phone",email:"Email (optional)",company:"Organization (optional)",wilaya:"Wilaya / province",commune:"City / district",delivery:"Fulfilment method",pickup:"Laboratory pickup",shipping:"Delivery / shipping",address:"Delivery address",note:"Additional instructions (optional)",consent:"I agree to the use of my contact details to process this request. See the privacy policy.",submit:"Send my request",sending:"Saving…",success:"Request saved to the BA Labs commercial register.",ref:"Request reference",error:"The request could not be saved. Please try again shortly.",required:"Please check the required fields.",cart:"Your selection",noItems:"Your basket is empty.",integration:"Submission to the BA Labs Notion commercial register. No payment is taken at this stage."},
ar:{intro:"أدخل بيانات الاتصال. سيتم حفظ طلبك في السجل التجاري لـ BA Labs؛ وسيؤكد فريقنا التوفر والسعر النهائي والتوصيل.",name:"الاسم الكامل",phone:"الهاتف",email:"البريد الإلكتروني (اختياري)",company:"المؤسسة (اختياري)",wilaya:"الولاية",commune:"البلدية",delivery:"طريقة الاستلام",pickup:"الاستلام من المختبر",shipping:"التوصيل / الشحن",address:"عنوان التوصيل",note:"تعليمات إضافية (اختياري)",consent:"أوافق على استخدام بيانات الاتصال لمعالجة هذا الطلب. راجع سياسة الخصوصية.",submit:"إرسال الطلب",sending:"جارٍ الحفظ…",success:"تم حفظ الطلب في السجل التجاري لـ BA Labs.",ref:"مرجع الطلب",error:"تعذر حفظ الطلب. حاول مرة أخرى بعد قليل.",required:"يرجى التحقق من الحقول المطلوبة.",cart:"ملخص اختيارك",noItems:"سلتك فارغة.",integration:"إرسال إلى السجل التجاري في Notion الخاص بـ BA Labs. لا يتم الدفع في هذه المرحلة."},
pt:{intro:"Introduza os seus contactos. O pedido será guardado no registo comercial da BA Labs; a disponibilidade, o preço final e a entrega serão confirmados pela nossa equipa.",name:"Nome completo",phone:"Telefone",email:"E-mail (opcional)",company:"Organização (opcional)",wilaya:"Wilaya / província",commune:"Localidade",delivery:"Modo de entrega",pickup:"Levantamento no laboratório",shipping:"Entrega / expedição",address:"Morada de entrega",note:"Instruções adicionais (opcional)",consent:"Aceito a utilização dos meus contactos para tratar este pedido. Consulte a política de privacidade.",submit:"Enviar pedido",sending:"A guardar…",success:"Pedido guardado no registo comercial da BA Labs.",ref:"Referência do pedido",error:"Não foi possível guardar o pedido. Tente novamente.",required:"Verifique os campos obrigatórios.",cart:"Resumo da seleção",noItems:"O cesto está vazio.",integration:"Envio para o registo comercial Notion da BA Labs. Não é efetuado pagamento nesta fase."}
};
const lang=()=>window.BALABS_STORE?.getLanguage?.()||"fr";
const t=k=>(tr[lang()]||tr.fr)[k]||tr.fr[k]||k;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const modal=$("#requestModal"),form=$("#checkoutForm"),feedback=$("#checkoutFeedback"),summary=$("#requestSummary");
let submitting=false;
const items=()=>window.BALABS_STORE?.getCartItems?.()||[];
function renderSummary(){
 const selected=items();
 if(!selected.length){summary.textContent=t("noItems");return false;}
 summary.innerHTML="<h3>"+esc(t("cart"))+"</h3><ul>"+selected.map(item=>"<li><span>"+esc(item.title)+"</span><strong>× "+Number(item.quantity)+"</strong><small>"+esc(item.product_code)+"</small></li>").join("")+"</ul>";
 return true;
}
function applyLanguage(){
 document.documentElement.dir=lang()==="ar"?"rtl":"ltr";
 document.querySelectorAll("[data-checkout-i18n]").forEach(n=>n.textContent=t(n.dataset.checkoutI18n));
 $("#checkoutIntro").textContent=t("intro");
 $("#checkoutIntegration").textContent=t("integration");
 if(!submitting)$("#checkoutSubmit").textContent=t("submit");
}
function showFeedback(message,success,ref){
 feedback.hidden=false;
 feedback.className=success?"checkout-feedback is-success":"checkout-feedback is-error";
 feedback.innerHTML=success?"<strong>"+esc(message)+"</strong><p>"+esc(t("ref"))+" : <b>"+esc(ref)+"</b></p>":esc(message);
}
function setAddressRequirement(){
 const delivery=$("#checkoutDelivery").value==="delivery";
 $("#checkoutAddressWrap").hidden=!delivery;
 $("#checkoutAddress").required=delivery;
 $("#checkoutCommuneWrap").hidden=!delivery;
}
function open(){
 if(!renderSummary())return;
 form.hidden=false;feedback.hidden=true;feedback.textContent="";
 $("#copyRequest").hidden=true;$("#checkoutSubmit").disabled=false;$("#checkoutSubmit").textContent=t("submit");
 $("#cartDrawer").classList.remove("is-open");$("#cartDrawer").setAttribute("aria-hidden","true");
 modal.classList.add("is-open");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
 applyLanguage();$("#checkoutName").focus();
}
$("#checkoutDelivery").addEventListener("change",setAddressRequirement);
$("#languageSelect").addEventListener("change",()=>queueMicrotask(applyLanguage));
$("#requestQuote").addEventListener("click",event=>{event.preventDefault();event.stopImmediatePropagation();open();},true);
form.addEventListener("submit",async event=>{
 event.preventDefault();if(submitting)return;
 const selected=items();
 if(!selected.length||!form.reportValidity()){showFeedback(t("required"),false);return;}
 const data=new FormData(form);
 let requestId;
 try{requestId=sessionStorage.getItem("balabs-store-request-id");if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem("balabs-store-request-id",requestId);}}catch{requestId=crypto.randomUUID();}
 const payload={
  request_id:requestId,website:String(data.get("website")||""),
  customer:{
   name:String(data.get("customer_name")||"").trim(),phone:String(data.get("customer_phone")||"").trim(),
   email:String(data.get("customer_email")||"").trim(),organization:String(data.get("company_name")||"").trim(),
   wilaya:String(data.get("wilaya")||"").trim(),commune:String(data.get("commune")||"").trim(),
   delivery_mode:String(data.get("delivery_mode")||"pickup"),address:String(data.get("delivery_address")||"").trim(),
   note:String(data.get("customer_note")||"").trim(),locale:lang(),consent:data.get("privacy_consent")==="on"
  },
  items:selected.map(item=>({product_code:item.product_code,title:item.title,family:item.family,quantity:Number(item.quantity)}))
 };
 submitting=true;$("#checkoutSubmit").disabled=true;$("#checkoutSubmit").textContent=t("sending");feedback.hidden=true;
 try{
  const response=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify(payload),credentials:"omit",cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok||!result.order_ref)throw new Error(result.error||"submission_failed");
  form.hidden=true;showFeedback(t("success"),true,result.order_ref);
  window.BALABS_STORE?.clearCart?.();
  try{sessionStorage.removeItem("balabs-store-request-id");}catch{}
 }catch(error){
  showFeedback(t("error"),false);$("#checkoutSubmit").disabled=false;$("#checkoutSubmit").textContent=t("submit");
 }finally{submitting=false;}
});
setAddressRequirement();applyLanguage();
window.BALABS_STORE_CHECKOUT={open};
})();