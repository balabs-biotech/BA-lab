(()=>{
 const root=document.querySelector('#app .editorial-method');
 if(!root)return;
 const detail=root.querySelector('#methodDetail');
 if(!detail)return;
 const titles={observe:'methodObserve',question:'methodQuestion',test:'methodTest',share:'methodShare'};
 const indices={observe:'01',question:'02',test:'03',share:'04'};
 const suffixes={observe:'Observe',question:'Question',test:'Test',share:'Share'};
 const labels={fr:'NOTE DE MÉTHODE',en:'METHOD NOTE',ar:'مذكرة منهجية',pt:'NOTA DE MÉTODO'};
 const outputs={fr:'TRACE À PRODUIRE',en:'EXPECTED RECORD',ar:'الأثر المطلوب',pt:'REGISTO ESPERADO'};
 const clear=()=>{
  detail.hidden=true;
  root.querySelectorAll('[data-method-step]').forEach(item=>item.setAttribute('aria-expanded','false'));
 };
 const open=button=>{
  const key=button.dataset.methodStep;
  if(!titles[key])return;
  const wasOpen=button.getAttribute('aria-expanded')==='true';
  root.querySelectorAll('[data-method-step]').forEach(item=>item.setAttribute('aria-expanded','false'));
  if(wasOpen){detail.hidden=true;return;}
  button.setAttribute('aria-expanded','true');
  const lang=document.documentElement.lang||'fr';
  const dict=window.T||{};
  const language=dict[lang]||dict.fr||{};
  const name=root.querySelector('[data-i18n="'+titles[key]+'"]')?.textContent||key;
  detail.querySelector('#methodDetailIndex').textContent=indices[key]+' / '+(labels[lang]||labels.en);
  detail.querySelector('#methodDetailTitle').textContent=name;
  detail.querySelector('#methodDetailText').textContent=language['method'+suffixes[key]+'Detail']||'';
  detail.querySelector('#methodDetailOutput').textContent=language['method'+suffixes[key]+'Output']||'';
  detail.querySelector('#methodOutputLabel').textContent=outputs[lang]||outputs.en;
  detail.hidden=false;
  window.__BALABS_METHOD_LAST_STEP__=key;
  detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
 };
 root.querySelectorAll('[data-method-step]').forEach(button=>{
  button.addEventListener('click',event=>{event.preventDefault();open(button)});
 });
 document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',clear));
 window.__BALABS_METHOD_INTERACTION_READY__=true;
})();