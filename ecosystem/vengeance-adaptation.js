/* Vengeance UI-inspired spotlight interactions, adapted for static BALabs. */
(()=> {
 const root=document.documentElement;
 const nav=document.querySelector('#siteNavigation');
 if(nav){
   nav.classList.add('vng-spotlight');
   const links=[...nav.querySelectorAll('a')];
   links.forEach(link=>link.classList.add('vng-line'));
 }
 document.querySelectorAll('.hero-action-primary').forEach(el=>el.classList.add('vng-liquid','vng-spotlight'));
 document.querySelectorAll('.hero-action-secondary,.work-card-link').forEach(el=>el.classList.add('vng-line'));
 const tracked=[...document.querySelectorAll('.vng-spotlight')];
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduced && window.matchMedia('(hover:hover) and (pointer:fine)').matches){
   tracked.forEach(el=>{
     el.addEventListener('pointermove',event=>{
       const r=el.getBoundingClientRect();
       el.style.setProperty('--vng-x',(event.clientX-r.left)+'px');
       el.style.setProperty('--vng-y',(event.clientY-r.top)+'px');
     },{passive:true});
     el.addEventListener('pointerleave',()=>{
       el.style.removeProperty('--vng-x');el.style.removeProperty('--vng-y');
     },{passive:true});
   });
 }
 root.classList.add('vng-ready');
})();