/* BALabs horizontal chapter navigation */
(()=>{
 const main=document.getElementById('main-content'),app=document.getElementById('app');
 if(!main||!app||main.dataset.chaptersReady)return;
 const groups=[
  {id:'home',label:{fr:'Accueil',en:'Home',ar:'الرئيسية',pt:'Início'},sections:['accueil']},
  {id:'research',label:{fr:'Explorations',en:'Explorations',ar:'الاستكشاف',pt:'Exploração'},sections:['chantiers','a-la-une'],extras:['.field-atlas']},
  {id:'network',label:{fr:'Univers',en:'Universe',ar:'العوالم',pt:'Universo'},sections:['universe','universes'],extras:['.universe-bridge']},
  {id:'catalogue',label:{fr:'Catalogue',en:'Catalogue',ar:'الكتالوج',pt:'Catálogo'},sections:['product-catalogue']},
  {id:'about',label:{fr:'BA Labs',en:'About BA Labs',ar:'حول BA Labs',pt:'Sobre BA Labs'},sections:['a-propos','demarche','value-principles']}
 ];
 const directSections=[...main.querySelectorAll(':scope > section')];
 const sections=new Map(directSections.filter(s=>s.id).map(s=>[s.id,s]));
 const unassigned=directSections.filter(s=>!groups.some(g=>g.sections.includes(s.id)));
 const track=document.createElement('div');track.className='experience-track';track.id='experienceTrack';track.tabIndex=0;track.setAttribute('aria-label','BALabs — navigation horizontale');
 const pages=[];
 groups.forEach((group,index)=>{
  const page=document.createElement('section');page.className='experience-page';page.dataset.chapter=group.id;page.id='chapter-'+group.id;page.tabIndex=0;page.setAttribute('role','region');page.setAttribute('aria-roledescription','chapter');page.setAttribute('aria-label',group.label.fr);
  const label=document.createElement('div');label.className='experience-page-label';label.dataset.chapterLabel=group.id;label.textContent=String(index+1).padStart(2,'0')+' / '+group.label.fr;page.append(label);
  group.sections.forEach(id=>{const section=sections.get(id);if(section)page.append(section)});(group.extras||[]).forEach(selector=>{const section=main.querySelector(selector);if(section)page.append(section)});
  track.append(page);pages.push(page);
 });
 unassigned.filter(s=>!s.classList.contains('universe-bridge')&&!s.closest('.experience-page')).forEach(s=>pages[pages.length-1].append(s));
 const footer=app.querySelector(':scope > footer.foot');if(footer)pages[pages.length-1].append(footer);
 // Preserve any future top-level section added to the source page instead of silently hiding it.
 main.querySelectorAll(':scope > section').forEach(section=>{if(!section.closest('.experience-page'))pages[pages.length-1].append(section)});
 main.replaceChildren(track);main.classList.add('experience-main');main.dataset.chaptersReady='true';
 const progress=document.createElement('div');progress.className='experience-progress';progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Progression dans les chapitres');progress.setAttribute('aria-valuemin','1');progress.setAttribute('aria-valuemax',String(pages.length));progress.setAttribute('aria-valuetext','Chapitre 1 sur '+pages.length);progress.innerHTML='<span></span>';main.append(progress);
 const controls=document.createElement('div');controls.className='experience-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Navigation entre les espaces');
 const prev=document.createElement('button'),count=document.createElement('span'),next=document.createElement('button');
 prev.type=next.type='button';prev.innerHTML='←';next.innerHTML='→';prev.setAttribute('aria-label','Espace précédent');next.setAttribute('aria-label','Espace suivant');count.className='experience-count';count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');controls.append(prev,count,next);main.append(controls);
 const rail=document.createElement('div');rail.className='chapter-rail neural-rail';rail.setAttribute('role','group');rail.setAttribute('aria-label','Navigation neuronale des chapitres');
 const svgNS='http://www.w3.org/2000/svg';
 rail.innerHTML='<svg class="neural-network" viewBox="0 0 100 600" preserveAspectRatio="none" aria-hidden="true"><path class="axon-base" d="M50 42 C18 105 82 150 50 175 C18 225 82 275 50 300 C18 350 82 400 50 425 C18 475 82 515 50 558"/><path class="axon-progress" d="M50 42 C18 105 82 150 50 175 C18 225 82 275 50 300 C18 350 82 400 50 425 C18 475 82 515 50 558"/><g class="dendrites"><path d="M50 65 C34 55 29 42 21 31 M34 55 L17 56 M21 31 L22 18 M50 65 C65 52 71 39 80 29 M71 39 L88 42 M80 29 L82 16 M50 185 C35 173 27 161 18 150 M27 161 L12 166 M18 150 L19 137 M50 185 C65 173 73 161 83 149 M73 161 L89 166 M83 149 L82 136 M50 310 C34 298 26 286 17 275 M26 286 L10 291 M17 275 L18 262 M50 310 C66 298 74 286 84 274 M74 286 L90 291 M84 274 L83 261 M50 435 C34 423 26 411 17 400 M26 411 L10 416 M17 400 L18 387 M50 435 C66 423 74 411 84 399 M74 411 L90 416 M84 399 L83 386 M50 550 C35 538 27 526 18 515 M27 526 L12 531 M18 515 L19 502 M50 550 C65 538 73 526 83 514 M73 526 L89 531 M83 514 L82 501"/></g><g class="neuron-nodes"><circle cx="50" cy="42" r="7"/><circle cx="50" cy="175" r="7"/><circle cx="50" cy="300" r="7"/><circle cx="50" cy="425" r="7"/><circle cx="50" cy="558" r="7"/></g><circle class="neural-pulse" cx="50" cy="42" r="3"/></svg>';
 const railNodes=document.createElement('div');railNodes.className='neural-hitareas';
 groups.forEach((g,i)=>{const b=document.createElement('button');b.type='button';b.className='neural-node';b.dataset.index=String(i);b.setAttribute('aria-controls','chapter-'+g.id);b.setAttribute('aria-label',(g.label.fr||g.id)+' — '+(i+1));b.style.setProperty('--node-y',[7,29.2,50,70.8,93][i]+'%');b.innerHTML='<span class="neural-node-core"></span>';b.addEventListener('click',()=>go(i));railNodes.append(b)});
 rail.append(railNodes);document.body.append(rail);
 // Scroll-led editorial typography: reveal only key section headings, not body copy.
 if('IntersectionObserver' in window){
  pages.forEach(page=>{
   const headings=page.querySelectorAll('.work-heading,.universe-index-heading,.value-heading');
   if(!headings.length)return;
   const headingObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    entry.target.classList.add('rb-heading-visible');
    headingObserver.unobserve(entry.target);
   }),{root:page,threshold:.2,rootMargin:'0px 0px -8% 0px'});
   headings.forEach(el=>{el.classList.add('rb-heading-armed');headingObserver.observe(el)});
  });
 }
 // Reveal editorial imagery only when it enters its own chapter viewport.
 if('IntersectionObserver' in window){
  pages.forEach(page=>{
   const images=page.querySelectorAll('.hero-micrograph,.work-media img,.product-catalogue img,.universe-visual img,.feature-photo,.field-frame img,.editorial-about svg,.chapter-atmosphere img');
   if(!images.length)return;
   const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    entry.target.classList.add('rb-image-revealed');
    revealObserver.unobserve(entry.target);
   }),{root:page,threshold:.16,rootMargin:'0px 0px -5% 0px'});
   images.forEach(img=>{img.classList.add('rb-image-armed');revealObserver.observe(img)});
  });
 }
 const axon=rail.querySelector('.axon-progress');
 const axonLength=axon.getTotalLength();
 axon.style.strokeDasharray=String(axonLength);
 axon.style.strokeDashoffset=String(axonLength);
 let current=0;
 const getLanguage=()=>{const value=(document.documentElement.lang||'fr').toLowerCase().split('-')[0];return ['fr','en','ar','pt'].includes(value)?value:'fr'};
 const pageStart=page=>{
  const trackRect=track.getBoundingClientRect(),pageRect=page.getBoundingClientRect();
  return track.scrollLeft+pageRect.left-trackRect.left;
 };
 const trackProgress=()=>{
  const x=track.scrollLeft,starts=pages.map(pageStart);
  if(x<=starts[0])return 0;
  for(let i=0;i<starts.length-1;i++){
   const span=Math.max(1,starts[i+1]-starts[i]);
   if(x<=starts[i+1])return i+Math.max(0,Math.min(1,(x-starts[i])/span));
  }
  return pages.length-1;
 };
 const update=()=>{
  const rawProgress=Math.max(0,Math.min(pages.length-1,trackProgress()));
  const idx=Math.max(0,Math.min(pages.length-1,Math.round(rawProgress)));
  current=idx;count.textContent=String(idx+1).padStart(2,'0')+' / '+String(pages.length).padStart(2,'0');
  prev.disabled=idx===0;next.disabled=idx===pages.length-1;
  prev.setAttribute('aria-controls',pages[Math.max(0,idx-1)].id);next.setAttribute('aria-controls',pages[Math.min(pages.length-1,idx+1)].id);
  progress.firstElementChild.style.width=(rawProgress/Math.max(1,pages.length-1)*100)+'%';progress.setAttribute('aria-valuenow',String(idx+1));progress.setAttribute('aria-valuetext',(groups[idx].label[getLanguage()]||groups[idx].label.fr)+' — '+(idx+1)+' / '+pages.length);
  rail.style.setProperty('--fill',(rawProgress/Math.max(1,pages.length-1)*100)+'%');rail.setAttribute('aria-valuenow',String(idx+1));rail.setAttribute('aria-valuetext',(groups[idx].label[getLanguage()]||groups[idx].label.fr)+' — '+(idx+1)+' / '+pages.length);
  const activeLength=axonLength*(rawProgress/Math.max(1,pages.length-1));
  axon.style.strokeDashoffset=String(axonLength-activeLength);
  railNodes.querySelectorAll('.neural-node').forEach((node,i)=>{
   node.classList.toggle('is-past',i<idx);
   node.classList.toggle('is-active',i===idx);
   node.classList.toggle('is-next',i>idx);
   node.setAttribute('aria-current',i===idx?'step':'false');
  });
  rail.style.setProperty('--active-index',String(idx));
  pages.forEach((p,i)=>p.setAttribute('aria-current',i===idx?'page':'false'));
  // A horizontal chapter can contain several editorial sections. Highlight only
  // the section nearest the reading line, never every link in the same chapter.
  const navLinks=[...app.querySelectorAll('.site-nav a[href*="#"]')];
  const page=pages[idx],pageRect=page.getBoundingClientRect();
  const readingLine=pageRect.top+Math.min(180,page.clientHeight*.28);
  let activeLink=null,activeDistance=Infinity;
  navLinks.forEach(a=>{
   let url;try{url=new URL(a.href,location.href)}catch(_){return}
   if(url.origin!==location.origin||url.pathname!==location.pathname)return;
   let id;try{id=decodeURIComponent(url.hash.slice(1))}catch(_){return}
   const target=id&&document.getElementById(id);
   if(!target||target.closest('.experience-page')!==page)return;
   const rect=target.getBoundingClientRect();
   if(rect.bottom<pageRect.top||rect.top>pageRect.bottom)return;
   const distance=rect.top<=readingLine&&rect.bottom>=readingLine?0:Math.abs(rect.top-readingLine);
   if(distance<activeDistance){activeDistance=distance;activeLink=a}
  });
  navLinks.forEach(a=>{
   const active=a===activeLink;
   if(active){a.setAttribute('aria-current','location');a.classList.add('chapter-active')}
   else{a.removeAttribute('aria-current');a.classList.remove('chapter-active')}
  });
 };
 const scrollBehavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
 const go=i=>{const n=Math.max(0,Math.min(pages.length-1,i));track.scrollTo({left:pageStart(pages[n]),top:0,behavior:scrollBehavior()});pages[n].setAttribute('tabindex','0');};
 prev.addEventListener('click',()=>go(current-1));next.addEventListener('click',()=>go(current+1));
 track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});
 track.addEventListener('scrollend',update,{passive:true});
 // Editorial chapters scroll vertically inside each horizontal panel.
 // Keep the primary section marker synchronized with that independent scroll.
 pages.forEach(page=>{
  page.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});
  page.addEventListener('scrollend',update,{passive:true});
 });
 window.addEventListener('hashchange',()=>requestAnimationFrame(update),{passive:true});
 window.addEventListener('resize',()=>requestAnimationFrame(update),{passive:true});
 // Each chapter-rail button owns its own click handler above; do not dispatch go() twice.
 track.addEventListener('keydown',e=>{const panel=e.target.closest&&e.target.closest('.experience-page');if(e.target!==track&&e.target!==panel)return;if(e.key==='ArrowRight'){e.preventDefault();go(current+1)}else if(e.key==='ArrowLeft'){e.preventDefault();go(current-1)}else if(e.key==='Home'){e.preventDefault();go(0)}else if(e.key==='End'){e.preventDefault();go(pages.length-1)}});
 document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;const t=e.target;if(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable))return;const page=pages[current];if(!page)return;const atTop=page.scrollTop<=4;const atBottom=page.scrollTop+page.clientHeight>=page.scrollHeight-4;if(e.key==='PageDown'&&atBottom&&current<pages.length-1){e.preventDefault();go(current+1)}if(e.key==='PageUp'&&atTop&&current>0){e.preventDefault();go(current-1)}});
 track.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey){e.preventDefault();track.scrollBy({left:e.deltaX||e.deltaY,behavior:'auto'})}},{passive:false});
 app.addEventListener('click',e=>{
  const a=e.target.closest('a[href*="#"]');if(!a)return;
  let url;try{url=new URL(a.href,location.href)}catch(_){return}
  if(url.origin!==location.origin||url.pathname!==location.pathname)return;
  let id;try{id=decodeURIComponent(url.hash.slice(1))}catch(_){return}if(!id)return;
  const target=document.getElementById(id);if(!target)return;
  const page=target.closest('.experience-page');if(!page)return;
  e.preventDefault();go(pages.indexOf(page));
  requestAnimationFrame(()=>{const top=target===page?0:target.offsetTop-page.offsetTop;page.scrollTo({top:Math.max(0,top-12),behavior:scrollBehavior()});history.replaceState(null,'','#'+id)});
 },true);
 const localize=()=>{
  const l=getLanguage(),labels={
   track:{fr:'BALabs — navigation horizontale',en:'BALabs — horizontal navigation',ar:'بالابس — التنقل الأفقي',pt:'BALabs — navegação horizontal'},
   progress:{fr:'Progression dans les chapitres',en:'Chapter progress',ar:'التقدم بين الفصول',pt:'Progresso dos capítulos'},
   page:{fr:'Chapitre',en:'Chapter',ar:'الفصل',pt:'Capítulo'}
  };
  track.setAttribute('aria-label',labels.track[l]||labels.track.fr);
  progress.setAttribute('aria-label',labels.progress[l]||labels.progress.fr);
  groups.forEach((g,i)=>{
   const label=pages[i].querySelector('[data-chapter-label]');
   if(label)label.textContent=String(i+1).padStart(2,'0')+' / '+(g.label[l]||g.label.fr);
   pages[i].setAttribute('aria-roledescription',({fr:'chapitre',en:'chapter',ar:'فصل',pt:'capítulo'})[l]||'chapter');
   pages[i].setAttribute('aria-label',(labels.page[l]||labels.page.fr)+' — '+(g.label[l]||g.label.fr));
  });
  const rtl=document.documentElement.dir==='rtl'||l==='ar';
  prev.textContent=rtl?'→':'←';next.textContent=rtl?'←':'→';
  prev.setAttribute('aria-label',({fr:'Espace précédent',en:'Previous space',ar:'المساحة السابقة',pt:'Espaço anterior'})[l]);
  next.setAttribute('aria-label',({fr:'Espace suivant',en:'Next space',ar:'المساحة التالية',pt:'Próximo espaço'})[l]);
  controls.setAttribute('aria-label',({fr:'Navigation entre les espaces',en:'Navigate between spaces',ar:'التنقل بين المساحات',pt:'Navegar entre espaços'})[l]);
  rail.setAttribute('aria-label',({fr:'Réseau neuronal — navigation des chapitres',en:'Neural network — chapter navigation',ar:'شبكة عصبية — التنقل بين الفصول',pt:'Rede neural — navegação dos capítulos'})[l]);
  update();
 };
 new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
 localize();update();
 const hash=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));
 if(hash){const page=hash.closest('.experience-page');if(page){go(pages.indexOf(page));requestAnimationFrame(()=>hash.scrollIntoView({block:'start',behavior:scrollBehavior()}));}}
})();
