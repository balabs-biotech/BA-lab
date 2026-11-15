/* BALabs horizontal chapter navigation */
(()=>{
 const main=document.getElementById('main-content'),app=document.getElementById('app');
 if(!main||!app||main.dataset.chaptersReady)return;
 const groups=[
  {id:'home',label:{fr:'Accueil',en:'Home',ar:'الرئيسية',pt:'Início'},sections:['accueil']},
  {id:'research',label:{fr:'Explorations',en:'Explorations',ar:'الاستكشاف',pt:'Exploração'},sections:['chantiers','a-la-une']},
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
  const page=document.createElement('section');page.className='experience-page';page.dataset.chapter=group.id;page.id='chapter-'+group.id;page.setAttribute('aria-label',group.label.fr);
  const label=document.createElement('div');label.className='experience-page-label';label.dataset.chapterLabel=group.id;label.textContent=String(index+1).padStart(2,'0')+' / '+group.label.fr;page.append(label);
  group.sections.forEach(id=>{const section=sections.get(id);if(section)page.append(section)});(group.extras||[]).forEach(selector=>{const section=main.querySelector(selector);if(section)page.append(section)});
  track.append(page);pages.push(page);
 });
 unassigned.filter(s=>!s.classList.contains('universe-bridge')).forEach(s=>pages[pages.length-1].append(s));
 const footer=app.querySelector(':scope > footer.foot');if(footer)pages[pages.length-1].append(footer);
 // Preserve any future top-level section added to the source page instead of silently hiding it.
 main.querySelectorAll(':scope > section').forEach(section=>{if(!section.closest('.experience-page'))pages[pages.length-1].append(section)});
 main.replaceChildren(track);main.classList.add('experience-main');main.dataset.chaptersReady='true';
 const progress=document.createElement('div');progress.className='experience-progress';progress.innerHTML='<span></span>';main.append(progress);
 const controls=document.createElement('div');controls.className='experience-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Navigation entre les espaces');
 const prev=document.createElement('button'),count=document.createElement('span'),next=document.createElement('button');
 prev.type=next.type='button';prev.innerHTML='←';next.innerHTML='→';prev.setAttribute('aria-label','Espace précédent');next.setAttribute('aria-label','Espace suivant');count.className='experience-count';controls.append(prev,count,next);main.append(controls);
 let current=0;
 const lang=()=>document.documentElement.lang||'fr';
 const update=()=>{
  const x=track.scrollLeft,idx=Math.max(0,Math.min(pages.length-1,Math.round(x/Math.max(1,track.clientWidth))));
  current=idx;count.textContent=String(idx+1).padStart(2,'0')+' / '+String(pages.length).padStart(2,'0');
  prev.disabled=idx===0;next.disabled=idx===pages.length-1;
  progress.firstElementChild.style.width=((idx+1)/pages.length*100)+'%';
  pages.forEach((p,i)=>p.setAttribute('aria-current',i===idx?'page':'false'));
  app.querySelectorAll('.site-nav a[href^="#"]').forEach(a=>{const t=document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));const active=!!(t&&t.closest('.experience-page')===pages[idx]);if(active){a.setAttribute('aria-current','page');a.classList.add('chapter-active')}else{a.removeAttribute('aria-current');a.classList.remove('chapter-active')}});
 };
 const go=i=>{const n=Math.max(0,Math.min(pages.length-1,i));track.scrollTo({left:pages[n].offsetLeft,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
 prev.addEventListener('click',()=>go(current-1));next.addEventListener('click',()=>go(current+1));
 track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});
 track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowRight'){e.preventDefault();go(current+1)}if(e.key==='ArrowLeft'){e.preventDefault();go(current-1)}});
 document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;const t=e.target;if(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable))return;if(e.key==='PageDown'&&current<pages.length-1){e.preventDefault();go(current+1)}if(e.key==='PageUp'&&current>0){e.preventDefault();go(current-1)}});
 track.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey){e.preventDefault();track.scrollBy({left:e.deltaX||e.deltaY,behavior:'auto'})}},{passive:false});
 app.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');if(!a)return;
  const id=decodeURIComponent(a.getAttribute('href').slice(1));if(!id)return;
  const target=document.getElementById(id);if(!target)return;
  const page=target.closest('.experience-page');if(!page)return;
  e.preventDefault();go(pages.indexOf(page));
  requestAnimationFrame(()=>{const top=target===page?0:target.offsetTop-page.offsetTop;page.scrollTo({top:Math.max(0,top-12),behavior:'smooth'});history.replaceState(null,'','#'+id)});
 },true);
 const localize=()=>{
  const l=lang();groups.forEach((g,i)=>{const label=pages[i].querySelector('[data-chapter-label]');if(label)label.textContent=String(i+1).padStart(2,'0')+' / '+(g.label[l]||g.label.fr)});
  prev.setAttribute('aria-label',({fr:'Espace précédent',en:'Previous space',ar:'المساحة السابقة',pt:'Espaço anterior'})[l]);
  next.setAttribute('aria-label',({fr:'Espace suivant',en:'Next space',ar:'المساحة التالية',pt:'Próximo espaço'})[l]);
  controls.setAttribute('aria-label',({fr:'Navigation entre les espaces',en:'Navigate between spaces',ar:'التنقل بين المساحات',pt:'Navegar entre espaços'})[l]);
 };
 new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 localize();update();
 const hash=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));
 if(hash){const page=hash.closest('.experience-page');if(page){go(pages.indexOf(page));requestAnimationFrame(()=>hash.scrollIntoView({block:'start'}));}}
})();
