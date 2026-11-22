/* BA Labs — opening sequence and intuitive chapter wayfinding */
(()=>{
 const root=document.documentElement;
 const overlay=document.getElementById('balabsIntro');
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const finishIntro=()=>{
  if(!overlay||overlay.dataset.finished==='1')return;
  overlay.dataset.finished='1';
  overlay.classList.add('is-leaving');
  root.classList.remove('balabs-intro-pending');
  try{sessionStorage.setItem('balabs-intro-seen','1')}catch(_){}
  window.setTimeout(()=>overlay.remove(),850);
 };
 if(overlay){
  const play=root.classList.contains('balabs-intro-pending')&&!reduced;
  if(play){
   const lang=root.lang||'fr';
   const skip=overlay.querySelector('[data-intro-skip]');
   const labels={fr:['Passer','Biologie appliquée · Recherche · Ingénierie','Biologie appliquée'],en:['Skip','Applied biology · Research · Engineering','Applied biology'],ar:['تخطي','الأحياء التطبيقية · البحث · الهندسة','التكنولوجيا الحيوية التطبيقية'],pt:['Saltar','Biologia aplicada · Pesquisa · Engenharia','Biologia aplicada']};
   if(skip)skip.textContent=(labels[lang]||labels.fr)[0];
   const caption=overlay.querySelector('[data-intro-caption]');
   if(caption)caption.textContent=(labels[lang]||labels.fr)[1];
   const subtitle=overlay.querySelector('[data-intro-subtitle]');
   if(subtitle)subtitle.textContent=(labels[lang]||labels.fr)[2];
   overlay.classList.add('is-playing');
   skip?.addEventListener('click',finishIntro,{once:true});
   const onKey=e=>{if(e.key==='Escape'){finishIntro();document.removeEventListener('keydown',onKey)}};
   document.addEventListener('keydown',onKey);
   window.setTimeout(()=>{finishIntro();document.removeEventListener('keydown',onKey)},2850);
  }else{overlay.remove();root.classList.remove('balabs-intro-pending')}
 }
 const nav=document.getElementById('siteNavigation');
 if(nav){
  let lastActive=null,raf=0;
  const centerActive=()=>{
   const active=nav.querySelector('a.chapter-active,a[aria-current="location"]');
   if(!active||active===lastActive){return}
   lastActive=active;
   if(window.innerWidth<=760){
    const navRect=nav.getBoundingClientRect(),linkRect=active.getBoundingClientRect();
    const delta=linkRect.left+linkRect.width/2-(navRect.left+navRect.width/2);
    nav.scrollBy({left:delta,behavior:reduced?'auto':'smooth'});
   }
  };
  const observer=new MutationObserver(()=>{
   if(raf)cancelAnimationFrame(raf);
   raf=requestAnimationFrame(centerActive);
  });
  observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['class','aria-current']});
  centerActive();
 }
 const pages=[...document.querySelectorAll('.experience-page')];
 if(pages.length){
  let current=null;
  const arrive=page=>{
   if(page===current)return;
   current=page;
   page.classList.remove('is-arriving');
   void page.offsetWidth;
   page.classList.add('is-arriving');
   window.setTimeout(()=>page.classList.remove('is-arriving'),1050);
  };
  if('IntersectionObserver'in window){
   const io=new IntersectionObserver(entries=>{
    const best=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(best&&best.intersectionRatio>=.48)arrive(best.target);
   },{root:document.getElementById('experienceTrack'),threshold:[.48,.65,.85]});
   pages.forEach(page=>io.observe(page));
  }
 }
})();
