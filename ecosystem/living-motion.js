/* BA Labs — living interface motion layer.
   Lightweight, original interactions. No effect touches the Vernpixi 2D renderer. */
(()=> {
 const root=document.documentElement;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
 const saveData=navigator.connection?.saveData===true;
 const track=document.getElementById('experienceTrack');
 if(!track||root.dataset.livingMotion==='ready')return;
 root.dataset.livingMotion='ready';

 // Short branded loader: never blocks navigation or waits indefinitely for remote assets.
 if(!reduce){
  const loader=document.createElement('div');
  loader.className='balabs-entry-loader';
  loader.setAttribute('role','status');
  loader.setAttribute('aria-label','BALabs — entrée dans le réseau vivant');
  loader.innerHTML='<span class="entry-loader-mark">BA<span>·</span>LABS</span><span class="entry-loader-line"><i></i></span><small>APPLIED BIOLOGY / LIVING SYSTEMS</small>';
  document.body.append(loader);
  let removed=false;
  const remove=()=>{if(removed)return;removed=true;loader.classList.add('is-leaving');setTimeout(()=>loader.remove(),650);};
  const start=performance.now();
  const ready=()=>setTimeout(remove,Math.max(0,520-(performance.now()-start)));
  if(document.readyState==='complete')ready();else window.addEventListener('load',ready,{once:true});
  setTimeout(remove,1500);
 }

 const pages=[...track.querySelectorAll('.experience-page')];
 const revealItems='.work-card,.universe-index-card,.product-catalogue-card,.method-steps li,.value-item,.editorial-art,.field-frame';
 if('IntersectionObserver'in window){
  pages.forEach(page=>{
   const io=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
     if(!entry.isIntersecting)return;
     entry.target.classList.add('is-in-view');
     io.unobserve(entry.target);
    });
   },{root:page,threshold:.08,rootMargin:'0px 0px -4% 0px'});
   page.querySelectorAll(revealItems).forEach((el,i)=>{
    el.classList.add('living-reveal');
    el.style.setProperty('--living-delay',Math.min(i%6*65,325)+'ms');
    io.observe(el);
   });
  });
 }

 // Pointer depth: gentle magnetic tilt and local light, only on devices with a real hover pointer.
 if(fine&&!reduce){
  const targets=track.querySelectorAll('.work-card,.universe-index-card,.product-catalogue-card,.value-item');
  targets.forEach(el=>{
   el.classList.add('living-surface');
   let rect=null;
   el.addEventListener('pointerenter',()=>{rect=el.getBoundingClientRect();el.classList.add('is-pointed');},{passive:true});
   el.addEventListener('pointermove',e=>{
    rect=rect||el.getBoundingClientRect();
    const x=(e.clientX-rect.left)/rect.width-.5;
    const y=(e.clientY-rect.top)/rect.height-.5;
    el.style.setProperty('--pointer-x',(x*100).toFixed(1)+'%');
    el.style.setProperty('--pointer-y',(y*100).toFixed(1)+'%');
    el.style.setProperty('--tilt-x',(y*-2.2).toFixed(2)+'deg');
    el.style.setProperty('--tilt-y',(x*2.8).toFixed(2)+'deg');
   },{passive:true});
   const reset=()=>{rect=null;el.classList.remove('is-pointed');el.style.setProperty('--pointer-x','50%');el.style.setProperty('--pointer-y','50%');el.style.setProperty('--tilt-x','0deg');el.style.setProperty('--tilt-y','0deg');};
   el.addEventListener('pointerleave',reset,{passive:true});
   el.addEventListener('blur',reset,true);
  });
  track.querySelectorAll('.hero-action-primary,.hero-action-secondary,.work-card-link,.experience-controls button,.site-nav a').forEach(el=>{
   el.addEventListener('pointermove',e=>{
    const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    el.style.setProperty('--mag-x',(x*4).toFixed(1)+'px');
    el.style.setProperty('--mag-y',(y*3).toFixed(1)+'px');
   },{passive:true});
   el.addEventListener('pointerleave',()=>{el.style.setProperty('--mag-x','0px');el.style.setProperty('--mag-y','0px');},{passive:true});
  });
 }

 // Low-amplitude scroll parallax is isolated to editorial photography, never the interactive explorer.
 if(!reduce&&!saveData){
  pages.forEach(page=>{
   let raf=0;
   const update=()=>{
    raf=0;
    const h=page.clientHeight||1;
    const p=page.scrollTop;
    page.querySelectorAll('.chapter-atmosphere,.hero-micrograph,.work-media img,.editorial-art img').forEach((el,i)=>{
     if(el.closest('.inline-explorer'))return;
     const factor=el.classList.contains('chapter-atmosphere')?-.035:el.classList.contains('hero-micrograph')?-.055:-.022;
     el.style.setProperty('--scroll-depth',(p*factor).toFixed(2)+'px');
    });
   };
   page.addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update);},{passive:true});
   update();
  });
 }

 // Tiny navigation response makes the selected chapter feel tactile without changing its behavior.
 track.querySelectorAll('.chapter-rail-node,.site-nav a').forEach(el=>{
  el.addEventListener('click',()=>{el.classList.add('motion-tap');setTimeout(()=>el.classList.remove('motion-tap'),420);});
 });
})();