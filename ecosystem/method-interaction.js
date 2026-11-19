(()=>{
 const root=document.querySelector('#app .editorial-method');
 if(!root)return;
 const detail=root.querySelector('#methodDetail');
 const titles={observe:'methodObserve',question:'methodQuestion',test:'methodTest',share:'methodShare'};
 const indices={observe:'01',question:'02',test:'03',share:'04'};
 const suffixes={observe:'Observe',question:'Question',test:'Test',share:'Share'};
 const labels={fr:'NOTE DE MÉTHODE',en:'METHOD NOTE',ar:'مذكرة منهجية',pt:'NOTA DE MÉTODO'};
 const outputs={fr:'TRACE À PRODUIRE',en:'EXPECTED RECORD',ar:'الأثر المطلوب',pt:'REGISTO ESPERADO'};
 const clear=()=>{detail.hidden=true;root.querySelectorAll('[data-method-step]').forEach(item=>item.setAttribute('aria-expanded','false'));};
 document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target)return;
  if(target.closest('[data-lang]')){clear();return;}
  const button=target.closest('[data-method-step]');
  if(!button||!root.contains(button))return;
  const key=button.dataset.methodStep;
  if(!titles[key])return;
  const wasOpen=button.getAttribute('aria-expanded')==='true';
  root.querySelectorAll('[data-method-step]').forEach(item=>item.setAttribute('aria-expanded','false'));
  if(wasOpen){detail.hidden=true;return;}
  button.setAttribute('aria-expanded','true');
  const lang=document.documentElement.lang||'fr';
  const dict=typeof T!=='undefined'?(T[lang]||T.fr||{}):{};
  const name=root.querySelector('[data-i18n="'+titles[key]+'"]')?.textContent||key;
  detail.querySelector('#methodDetailIndex').textContent=indices[key]+' / '+(labels[lang]||labels.en);
  detail.querySelector('#methodDetailTitle').textContent=name;
  detail.querySelector('#methodDetailText').textContent=dict['method'+suffixes[key]+'Detail']||'';
  detail.querySelector('#methodDetailOutput').textContent=dict['method'+suffixes[key]+'Output']||'';
  detail.querySelector('#methodOutputLabel').textContent=outputs[lang]||outputs.en;
  detail.hidden=false;
  detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
 },true);
})();
