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
 const rail=document.createElement('nav');rail.className='chapter-rail';rail.setAttribute('aria-label','Parcours des chapitres');
 rail.innerHTML='<svg class="chapter-filament" viewBox="0 0 64 500" aria-hidden="true"><path class="filament-base" d="M32 24 C8 76 55 108 32 150 S8 224 32 276 S55 350 32 402 S8 456 32 476"/><path class="filament-progress" d="M32 24 C8 76 55 108 32 150 S8 224 32 276 S55 350 32 402 S8 456 32 476"/><circle class="filament-signal" cx="32" cy="24" r="4"/><path class="filament-branch" d="M31 86 C20 82 14 70 9 59 M34 174 C46 168 51 156 56 145 M31 298 C19 291 13 281 8 270 M34 414 C46 407 51 395 57 384"/></svg><div class="chapter-rail-nodes"></div>';
 const railNodes=rail.querySelector('.chapter-rail-nodes');
 groups.forEach((g,i)=>{const b=document.createElement('button');b.type='button';b.className='chapter-rail-node';b.dataset.index=String(i);b.setAttribute('aria-controls','chapter-'+g.id);b.innerHTML='<span class="chapter-rail-dot"></span><span class="chapter-rail-name"></span>';b.addEventListener('click',()=>go(i));railNodes.append(b)});
 document.body.append(rail);
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
   const images=page.querySelectorAll('.hero-micrograph,.work-media img,.product-catalogue img,.universe-index-card,.feature-photo,.field-frame img,.editorial-about svg,.chapter-atmosphere img');
   if(!images.length)return;
   const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    entry.target.classList.add('rb-image-revealed');
    revealObserver.unobserve(entry.target);
   }),{root:page,threshold:.16,rootMargin:'0px 0px -5% 0px'});
   images.forEach(img=>{img.classList.add('rb-image-armed');revealObserver.observe(img)});
  });
 }
 const filament=rail.querySelector('.filament-progress');let filamentLength=0;
 try{filamentLength=filament.getTotalLength();filament.style.strokeDasharray=String(filamentLength);filament.style.strokeDashoffset=String(filamentLength)}catch(_){}
 let current=0;
 const lang=()=>document.documentElement.lang||'fr';
 const update=()=>{
  const pageWidth=Math.max(1,track.clientWidth);
  const rawProgress=Math.max(0,Math.min(pages.length-1,track.scrollLeft/pageWidth));
  const idx=Math.round(rawProgress);
  current=idx;count.textContent=String(idx+1).padStart(2,'0')+' / '+String(pages.length).padStart(2,'0');
  prev.disabled=idx===0;next.disabled=idx===pages.length-1;
  prev.setAttribute('aria-controls',pages[Math.max(0,idx-1)].id);next.setAttribute('aria-controls',pages[Math.min(pages.length-1,idx+1)].id);
  progress.firstElementChild.style.width=(rawProgress/Math.max(1,pages.length-1)*100)+'%';progress.setAttribute('aria-valuenow',String(idx+1));progress.setAttribute('aria-valuetext',(groups[idx].label[lang()]||groups[idx].label.fr)+' — '+(idx+1)+' / '+pages.length);
  rail.querySelectorAll('.chapter-rail-node').forEach((b,i)=>{b.classList.toggle('is-active',i===idx);b.classList.toggle('is-past',i<idx);b.setAttribute('aria-current',i===idx?'step':'false');});
  rail.querySelectorAll('.chapter-rail-name').forEach((n,i)=>{n.textContent=groups[i].label[lang()]||groups[i].label.fr});
  if(filamentLength){const filamentProgress=rawProgress/Math.max(1,pages.length-1);filament.style.strokeDashoffset=String(filamentLength*(1-filamentProgress));const signal=rail.querySelector('.filament-signal');if(signal){const point=filament.getPointAtLength(filamentLength*filamentProgress);signal.setAttribute('cx',point.x.toFixed(2));signal.setAttribute('cy',point.y.toFixed(2));}}
  pages.forEach((p,i)=>p.setAttribute('aria-current',i===idx?'page':'false'));
  app.querySelectorAll('.site-nav a[href^="#"]').forEach(a=>{const t=document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));const active=!!(t&&t.closest('.experience-page')===pages[idx]);if(active){a.setAttribute('aria-current','page');a.classList.add('chapter-active')}else{a.removeAttribute('aria-current');a.classList.remove('chapter-active')}});
 };
 const scrollBehavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
 const go=i=>{const n=Math.max(0,Math.min(pages.length-1,i));track.scrollTo({left:pages[n].offsetLeft,behavior:scrollBehavior()});};
 prev.addEventListener('click',()=>go(current-1));next.addEventListener('click',()=>go(current+1));
 track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});
 track.addEventListener('keydown',e=>{const panel=e.target.closest&&e.target.closest('.experience-page');if(e.target!==track&&e.target!==panel)return;if(e.key==='ArrowRight'){e.preventDefault();go(current+1)}else if(e.key==='ArrowLeft'){e.preventDefault();go(current-1)}else if(e.key==='Home'){e.preventDefault();go(0)}else if(e.key==='End'){e.preventDefault();go(pages.length-1)}});
 document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;const t=e.target;if(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable))return;const page=pages[current];if(!page)return;const atTop=page.scrollTop<=4;const atBottom=page.scrollTop+page.clientHeight>=page.scrollHeight-4;if(e.key==='PageDown'&&atBottom&&current<pages.length-1){e.preventDefault();go(current+1)}if(e.key==='PageUp'&&atTop&&current>0){e.preventDefault();go(current-1)}});
 track.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey){e.preventDefault();track.scrollBy({left:e.deltaX||e.deltaY,behavior:'auto'})}},{passive:false});
 app.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');if(!a)return;
  const id=decodeURIComponent(a.getAttribute('href').slice(1));if(!id)return;
  const target=document.getElementById(id);if(!target)return;
  const page=target.closest('.experience-page');if(!page)return;
  e.preventDefault();go(pages.indexOf(page));
  requestAnimationFrame(()=>{const top=target===page?0:target.offsetTop-page.offsetTop;page.scrollTo({top:Math.max(0,top-12),behavior:scrollBehavior()});history.replaceState(null,'','#'+id)});
 },true);
 const localize=()=>{
  const l=lang(),labels={
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
  rail.setAttribute('aria-label',({fr:'Parcours des chapitres',en:'Chapter navigation',ar:'التنقل بين الفصول',pt:'Navegação por capítulos'})[l]);
  rail.querySelectorAll('.chapter-rail-node').forEach((b,i)=>{const label=groups[i].label[l]||groups[i].label.fr;b.setAttribute('aria-label',label);const name=b.querySelector('.chapter-rail-name');if(name)name.textContent=label;});
 };
 new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang','dir']});
 localize();update();
 const hash=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));
 if(hash){const page=hash.closest('.experience-page');if(page){go(pages.indexOf(page));requestAnimationFrame(()=>hash.scrollIntoView({block:'start',behavior:scrollBehavior()}));}}
})();
