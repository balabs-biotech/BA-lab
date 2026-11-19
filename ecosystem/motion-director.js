/* BA Labs — editorial motion director.
   Eyecandy: camera/framing language. Prompt Motion: timed kinetic reveals.
   Motionographer: paced, image-led editorial chapters. */
(()=> {
 const track=document.getElementById('experienceTrack');
 if(!track||track.dataset.motionDirectorReady)return;
 track.dataset.motionDirectorReady='1';
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const pages=[...track.querySelectorAll('.experience-page')];
 const revealSelector='.field-atlas-head,.field-frame,.work-heading,.work-card,.editorial-feature,.product-catalogue-head,.product-catalogue-card,.editorial-about,.editorial-method,.method-steps li,.universe-index-heading,.universe-index-card,.universe-bridge,.value-heading,.value-item';
 const mediaSelector='img,video,.hero-micrograph,.feature-photo,.field-frame,.work-media,.product-catalogue-card figure,.editorial-art';
 const headingSelector='.hero h1,.work-heading h2,.universe-index-heading h2,.product-catalogue-head h2,.editorial-about h2,.editorial-method h2,.value-heading h2,.bridge-copy h2';
 const seen=new WeakSet();
 const once=(el,fn,options={})=>{
  if(!('IntersectionObserver'in window)){fn();return;}
  const observer=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{if(entry.isIntersecting){fn();observer.disconnect();}});
  },{root:options.root||null,threshold:options.threshold??.12,rootMargin:options.rootMargin||'0px 0px -5% 0px'});
  observer.observe(el);
 };
 const revealMedia=page=>{
  page.querySelectorAll(mediaSelector).forEach(el=>{
   if(el.closest('.inline-explorer'))return;
   const target=el.matches('img,video')?(el.parentElement?.matches('figure,.work-media,.field-frame,.editorial-art')?el.parentElement:el):el;
   if(seen.has(target))return;seen.add(target);
   target.classList.add('rb-motion-media');
   once(target,()=>target.classList.add('is-motion-visible'),{root:page});
  });
 };
 const revealEditorial=page=>{
  page.querySelectorAll(revealSelector).forEach((el,i)=>{
   if(el.closest('.inline-explorer'))return;
   el.classList.add('rb-sequence-armed');
   el.style.setProperty('--reveal-delay',Math.min(i%7*75,450)+'ms');
   once(el,()=>el.classList.add('is-sequence-visible'),{root:page,threshold:.09});
  });
 };
 const activate=page=>{
  if(page.classList.contains('is-motion-active'))return;
  page.classList.add('is-motion-active');
  page.querySelectorAll(headingSelector).forEach((el,i)=>el.style.transitionDelay=Math.min(i*90,270)+'ms');
  revealMedia(page);revealEditorial(page);
 };
 if(reduce){pages.forEach(page=>page.classList.add('is-motion-active'));return;}
 if('IntersectionObserver'in window){
  const pageObserver=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{if(entry.isIntersecting&&entry.intersectionRatio>=.42)activate(entry.target);});
  },{root:track,threshold:[.42,.65]});
  pages.forEach(page=>pageObserver.observe(page));
  // Prepare visible media and reveal as it enters each chapter's own scroll viewport.
  pages.forEach(page=>revealMedia(page));
 }else pages.forEach(activate);
})();
