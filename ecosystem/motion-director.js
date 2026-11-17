/* BA Labs — editorial motion director.
   Small, one-shot reveals; motion is scoped to the active chapter and respects reduced motion. */
(()=> {
 const track=document.getElementById('experienceTrack');
 if(!track||track.dataset.motionDirectorReady)return;
 track.dataset.motionDirectorReady='1';
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const pages=[...track.querySelectorAll('.experience-page')];
 if(reduce){pages.forEach(p=>p.classList.add('is-motion-active'));return;}
 const mediaSelector='img,video,.hero-micrograph,.feature-photo,.field-frame,.work-media,.product-catalogue-card figure,.editorial-art';
 const headingSelector='.hero h1,.work-heading,.universe-index-heading,.value-heading,.product-catalogue-heading';
 const seen=new WeakSet();
 const revealMedia=page=>{
  page.querySelectorAll(mediaSelector).forEach(el=>{
   if(el.closest('.inline-explorer'))return;
   const target=el.matches('img,video')?(el.parentElement?.matches('figure,.work-media,.field-frame,.editorial-art')?el.parentElement:el):el;
   if(seen.has(target))return;seen.add(target);target.classList.add('rb-motion-media');
   const observer=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){target.classList.add('is-motion-visible');observer.disconnect();}
   },{root:page,threshold:.12,rootMargin:'0px 0px -4% 0px'});
   observer.observe(target);
  });
 };
 const activate=page=>{
  page.classList.add('is-motion-active');
  revealMedia(page);
  page.querySelectorAll(headingSelector).forEach((el,i)=>{el.style.transitionDelay=Math.min(i*90,270)+'ms';});
 };
 if('IntersectionObserver' in window){
  const pageObserver=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{if(entry.isIntersecting&&entry.intersectionRatio>=.48)activate(entry.target);});
  },{root:track,threshold:[.48,.7]});
  pages.forEach(page=>pageObserver.observe(page));
  pages.forEach(page=>revealMedia(page));
 }else pages.forEach(activate);
 // Keep all existing chapter navigation and controls untouched.
})();
