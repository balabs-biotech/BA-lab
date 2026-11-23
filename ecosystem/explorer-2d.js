import { createPixiRenderer } from "./explorer-2d-pixi.js?v=public-mycology-renderer-1";
import { createPublicMycologyNetwork } from "./explorer-2d-graph.js?v=mycology-constellation-1";
const LANGS=["fr","en","ar","pt"];
const PALETTE={microbiology:"#79a991",plants:"#8fb58c",ecology:"#c19b73",bioprocesses:"#b58d73",biomaterials:"#c88773",instrumentation:"#7eaaa3",digital:"#aa9cbb",physical:"#b5b58d"};
const COPY={
fr:{title:"Réseau vivant",desc:"La mycologie au cœur de BA Labs, reliée à huit univers scientifiques autonomes.",hint:"GLISSER · PINCER POUR ZOOMER · CLIQUER POUR EXPLORER",root:"UNIVERS",branch:"BRANCHE",leaf:"RESSOURCE",open:"Ouvrir la ressource ↗",children:"ramifications",home:"Vue globale",loading:"Déploiement du réseau…",error:"Impossible de charger le réseau.",focus:"Centrer",back:"Vue précédente",count:"éléments",relations:"Connexions documentées"},
en:{title:"Living network",desc:"Mycology at the heart of BA Labs, connected to eight independent scientific universes.",hint:"DRAG · PINCH TO ZOOM · CLICK TO EXPLORE",root:"UNIVERSE",branch:"BRANCH",leaf:"RESOURCE",open:"Open resource ↗",children:"branches",home:"Overview",loading:"Growing the network…",error:"Could not load the network.",focus:"Focus",back:"Previous view",count:"items",relations:"Documented connections"},
ar:{title:"الشبكة الحية",desc:"علم الفطريات في قلب BA Labs، مرتبط بثمانية عوالم علمية مستقلة.",hint:"اسحب · كبّر بإصبعين · انقر للاستكشاف",root:"العالم",branch:"فرع",leaf:"مورد",open:"افتح المورد ↗",children:"تفرعات",home:"نظرة عامة",loading:"جارٍ بناء الشبكة…",error:"تعذّر تحميل الشبكة.",focus:"تركيز",back:"المنظور السابق",count:"عنصر",relations:"روابط موثقة"},
pt:{title:"Rede viva",desc:"A micologia no centro da BA Labs, ligada a oito universos científicos autónomos.",hint:"ARRASTAR · PINÇA PARA ZOOM · CLIQUE PARA EXPLORAR",root:"UNIVERSO",branch:"RAMO",leaf:"RECURSO",open:"Abrir recurso ↗",children:"ramificações",home:"Visão geral",loading:"A expandir a rede…",error:"Não foi possível carregar a rede.",focus:"Focar",back:"Vista anterior",count:"itens",relations:"Ligações documentadas"}};

const HUB={
 fr:{id:"mycology-center",title:"🍄 Mycologie",description:"Le cœur identitaire et opérationnel de BA Labs : diversité fongique, physiologie, taxonomie, cultures, multiplication, substrats, interactions, applications, production et contrôle qualité.",url:"https://app.notion.com/p/3e273152f1718161b154d8b8fc50f063"},
 en:{id:"mycology-center",title:"🍄 Mycology",description:"The identity and operational core of BA Labs: fungal diversity, physiology, taxonomy, cultures, propagation, substrates, interactions, applications, production and quality control.",url:"https://app.notion.com/p/40173152f17181019838de83de8173f3"},
 ar:{id:"mycology-center",title:"🍄 علم الفطريات",description:"القلب العلمي والتشغيلي لـ BA Labs: التنوع الفطري، وعلم وظائف الأعضاء، والتصنيف، والزراعة والإكثار، والركائز، والتفاعلات، والتطبيقات، والإنتاج ومراقبة الجودة.",url:"https://app.notion.com/p/40173152f171813ba690d5064844f54a"},
 pt:{id:"mycology-center",title:"🍄 Micologia",description:"O núcleo identitário e operacional da BA Labs: diversidade fúngica, fisiologia, taxonomia, culturas, multiplicação, substratos, interações, aplicações, produção e controlo de qualidade.",url:"https://app.notion.com/p/40173152f171814dad1adcd7559c7823"}
};
const $=id=>document.getElementById(id),canvas=$("field"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
let pixiRenderer=null,relationIndex=new Map();
let lang="fr",tree=[],nodes=[],edges=[],byId=new Map(),selected=null,hovered=null,w=0,h=0,dpr=1,scale=1,targetScale=1,offset={x:0,y:0},targetOffset={x:0,y:0},pointers=new Map(),gesture=null,dragged=false,raf=0,viewHistory=[];
const t=k=>COPY[lang][k]||COPY.fr[k],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};
function levelOpacity(level){const thresholds=[0,.10,.16,.24,.4,.7,1.1],t=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((scale-t*.72)/(t*.42),0,1);}
function screen(n){return{x:w/2+offset.x+n.x*scale,y:h/2+offset.y+n.y*scale}}
function buildNetwork(){
 canvas.dataset.engine="public-mycology-constellation";
 const graph=createPublicMycologyNetwork(tree,HUB[lang]);
 nodes=graph.nodes;edges=graph.edges;byId=graph.byId;relationIndex=graph.relationIndex;canvas.dataset.hubConnections=String(edges.filter(edge=>edge.hubLink).length);
 for(const [key,value] of Object.entries(graph.stats))canvas.dataset[key]=String(value);
 canvas.dataset.universeCount=String(graph.stats.universeCount);
 canvas.dataset.nodeCount=String(graph.stats.nodeCount);
 canvas.dataset.edgeCount=String(graph.stats.edgeCount);
 canvas.dataset.verifiedRelations=String(graph.stats.verifiedRelations);
 canvas.dataset.explicitRelations=String(graph.stats.explicitRelations);
 canvas.dataset.contentRelations=String(graph.stats.contentRelations);
 canvas.dataset.crossUniverseConnections=String(graph.stats.crossUniverseConnections);
 canvas.dataset.localAnastomoses=String(graph.stats.localAnastomoses);
}
function fitOverview(){
 const roots=nodes.filter(n=>n.level===0);
 if(!roots.length){targetScale=.5;targetOffset={x:0,y:0};return;}
 const minX=Math.min(...roots.map(n=>n.x)),maxX=Math.max(...roots.map(n=>n.x));
 const minY=Math.min(...roots.map(n=>n.y)),maxY=Math.max(...roots.map(n=>n.y));
 // Fit the complete central tissue and eight asymmetric inoculation territories.
 // The camera follows their combined bounds while preserving the brand origin.
 const pad=Math.min(88,Math.max(28,Math.min(w,h)*.075));
 // Root labels extend beyond their node coordinates, with the longest labels
 // on the lateral arms. Reserve an explicit text-safe envelope on both axes.
 const labelSafeEnvelope=w<600?180:280;
 const scaleX=(w-pad*2)/(maxX-minX+labelSafeEnvelope);
 const scaleY=(h-pad*2)/(maxY-minY+labelSafeEnvelope);
 targetScale=clamp(Math.min(scaleX,scaleY),.14,.62);
 targetOffset={x:-(minX+maxX)*.5*targetScale,y:-(minY+maxY)*.5*targetScale};
}
function resize(){const r=canvas.parentElement.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,2);if(pixiRenderer)pixiRenderer.resize(w,h);if(nodes.length){fitOverview();scale=targetScale;offset={...targetOffset};draw();}}
function draw(){if(!pixiRenderer)return;canvas.dataset.scale=String(scale);canvas.dataset.targetScale=String(targetScale);canvas.dataset.viewportWidth=String(w);canvas.dataset.viewportHeight=String(h);pixiRenderer.render({nodes,edges,selected,hovered,scale,offset,width:w,height:h,reduced,lang,time:performance.now()});}
function syncUniverseRail(n){
 const root=n?(n.level===0?n.id:n.rootId):null;
 document.querySelectorAll(".universe-rail [data-universe]").forEach(button=>{
  const active=button.dataset.universe===root;
  if(active)button.setAttribute("aria-current","location");else button.removeAttribute("aria-current");
 });
 canvas.dataset.activeUniverse=root||"";
}
function focusNode(n,zoomTo){if(!n)return;if(!selected||selected.id!==n.id){viewHistory.push({scale:targetScale,offset:{...targetOffset},selected});if(viewHistory.length>80)viewHistory.shift();}targetScale=zoomTo??(n.level===0?1.05:n.level===1?1.65:n.level===2?2.8:n.level===3?4.5:6.2);targetScale=clamp(targetScale,.3,12);targetOffset={x:-n.x*targetScale,y:-n.y*targetScale};selected=n;syncUniverseRail(n);updateSelection();draw();}
function activateNode(n){if(!n)return;focusNode(n);}
function hit(x,y){
 const visibleLabels=new Set(JSON.parse(canvas.dataset.visibleNodeIds||"[]"));
 const hitBoxes=JSON.parse(canvas.dataset.visibleNodeHitBoxes||"{}");
 // Pixi labels are offset from their anchor points. Test the full rendered
 // label rectangle first so clicking a visible resource title activates it.
 let labelHit=null,labelArea=Infinity;
 for(const n of nodes){
  if(!visibleLabels.has(n.id))continue;
  const box=hitBoxes[n.id];if(!box)continue;
  if(x>=box.left-8&&x<=box.right+8&&y>=box.top-6&&y<=box.bottom+6){
   const area=(box.right-box.left)*(box.bottom-box.top);
   if(area<labelArea){labelHit=n;labelArea=area;}
  }
 }
 if(labelHit)return labelHit;
 let found=null,best=22;
 const labelZoom=[0,1.2,2.0,3.0,4.2,5.5,7.0,8.6,10.2];
 for(const n of nodes){
  const threshold=labelZoom[Math.min(n.level,labelZoom.length-1)]||0;
  if(!visibleLabels.has(n.id)||scale<threshold||levelOpacity(n.level)<.5)continue;
  const p=screen(n),d=Math.hypot(p.x-x,p.y-y),limit=Math.max(best,n.r*Math.sqrt(scale)+7);
  if(d<limit){best=d;found=n;}
 }
 return found;
}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function updateBreadcrumbs(){
 const nav=$("crumbs");if(!nav)return;nav.replaceChildren();
 const path=[];let current=selected;
 while(current){path.unshift(current);current=current.parent?byId.get(current.parent):null;}
 if(!path.length){const li=el("li","", "BA Labs");nav.append(li);return;}
 path.forEach((node,index)=>{const li=el("li",""),button=el("button","breadcrumb-link",node.title);button.type="button";button.setAttribute("aria-current",index===path.length-1?"page":"false");button.onclick=()=>focusNode(node);li.append(button);nav.append(li);});
}
function updateSelection(){
 const box=$("selection");updateBreadcrumbs();
 $("back").disabled=!viewHistory.length;
 box.replaceChildren();
 if(!selected){box.hidden=true;renderAccessible();return;}
 const dock=el("div","selection-dock");
 const title=el("h3","selection-title",selected.title);
 const root=byId.get(selected.rootId||selected.id);
 const levelLabel=selected.level===0?t("root"):selected.level===1?t("branch"):t("leaf");
 const context=el("p","selection-context",root&&root.id!==selected.id?root.title+" · "+levelLabel:levelLabel);
 dock.append(title,context);
 // Keep the complete hierarchy visible inside the selection panel, including
 // on phones where the desktop breadcrumb bar is intentionally hidden.
 const ancestry=[];let ancestor=selected.parent?byId.get(selected.parent):null;
 while(ancestor){ancestry.unshift(ancestor);ancestor=ancestor.parent?byId.get(ancestor.parent):null;}
 if(ancestry.length){
  const pathNav=el("nav","selection-path");pathNav.setAttribute("aria-label",lang==="fr"?"Chemin de navigation":lang==="ar"?"مسار التنقل":lang==="pt"?"Caminho de navegação":"Navigation path");
  ancestry.forEach((node,index)=>{
   const button=el("button","selection-path-link",node.title);button.type="button";button.title=node.title;button.onclick=()=>focusNode(node);pathNav.append(button);
   const separator=el("span","selection-path-separator", "›");separator.setAttribute("aria-hidden","true");pathNav.append(separator);
  });
  const current=el("span","selection-path-current",selected.title);current.title=selected.title;current.setAttribute("aria-current","page");pathNav.append(current);dock.append(pathNav);
 }
 if(selected.data.description){
  const description=el("p","selection-description",selected.data.description);
  dock.append(description);
 }
 const directChildren=(selected.data.children||[]).map(child=>byId.get(child.id)).filter(Boolean);
 if(directChildren.length){
  const branches=el("div","child-branches");
  directChildren.forEach(child=>{
   const button=el("button","btn btn-xs btn-outline",child.title);
   button.type="button";button.title=child.title;button.onclick=()=>focusNode(child);
   branches.append(button);
  });
  dock.append(branches);
 }
 const notionUrl=selected.data.url;
 if(typeof notionUrl==="string"&&/^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/.test(notionUrl)){
  const link=el("a","selection-open-link",t("open"));
  link.href=notionUrl;link.target="_blank";link.rel="noopener noreferrer";
  dock.append(link);
 }
 box.append(dock);box.hidden=false;
 renderAccessible();
}
function renderAccessible(){const nav=$("accessibleNodes");nav.replaceChildren();nodes.forEach(n=>{const b=el("button","",n.title);b.type="button";b.dataset.nodeId=n.id;b.dataset.notionTitle=n.title;b.dataset.level=String(n.level);b.setAttribute("aria-label",n.title+" · niveau "+n.level);b.onclick=()=>activateNode(n);nav.append(b);});}
function updateUI(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";
 $("heading").textContent=t("title");$("description").textContent=t("desc");$("hint").textContent=t("hint");$("kicker").textContent=t("home");$("language").value=lang;
 const legend=$("relationLegend");
 if(legend){
  const labels={fr:["Lien Notion","Lien de contenu","Ramification"],en:["Notion link","Content relation","Hyphal branch"],ar:["رابط Notion","صلة في المحتوى","تفرّع خيطي"],pt:["Ligação Notion","Relação no conteúdo","Ramificação"]}[lang]||["Notion link","Content relation","Hyphal branch"];
  legend.replaceChildren();
  ["notion","content","hypha"].forEach((kind,i)=>{const item=el("span",kind);item.append(el("i",""),document.createTextNode(labels[i]));legend.append(item);});
 }
 if(!document.getElementById("inlineExplorer"))document.title="BA Labs — "+t("title");

}
function zoom(f,x=w/2,y=h/2){const next=clamp(targetScale*f,.26,selected?12:.82),ratio=next/targetScale;targetOffset.x=(x-w/2)-(x-w/2-targetOffset.x)*ratio;targetOffset.y=(y-h/2)-(y-h/2-targetOffset.y)*ratio;targetScale=next;if(reduced){scale=targetScale;offset={...targetOffset};draw();renderAccessible();}}
function pointerDown(e){hovered=null;canvas.style.cursor="grabbing";canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;gesture={x:e.clientX,y:e.clientY,ox:targetOffset.x,oy:targetOffset.y};canvas.classList.add("dragging");}
function pointerMove(e){
 if(!pointers.has(e.pointerId)){
  if(!pointers.size){const rect=canvas.getBoundingClientRect(),next=hit(e.clientX-rect.left,e.clientY-rect.top);if(next?.id!==hovered?.id){hovered=next;canvas.style.cursor=hovered?"pointer":"grab";draw();}}
  return;
 }
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1&&gesture){const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){targetOffset.x=gesture.ox+dx;targetOffset.y=gesture.oy+dy;if(reduced){offset={...targetOffset};draw();}}}
 else if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(!pointerMove.last)pointerMove.last=d;const rect=canvas.getBoundingClientRect();zoom(d/pointerMove.last,(p[0].x+p[1].x)/2-rect.left,(p[0].y+p[1].y)/2-rect.top);pointerMove.last=d;dragged=true;}
}
function pointerLeave(){if(pointers.size)return;if(hovered){hovered=null;draw();}canvas.style.cursor="grab";}
function pointerUp(e){pointers.delete(e.pointerId);canvas.classList.remove("dragging");if(!pointers.size){canvas.style.cursor="grab";if(!dragged){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,n=hit(x,y);if(n)activateNode(n);}gesture=null;pointerMove.last=0;}else if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,ox:targetOffset.x,oy:targetOffset.y};pointerMove.last=0;dragged=true;}}
canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerleave",pointerLeave);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerUp);


canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.16:.86,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$("zoomIn").onclick=()=>zoom(1.25);$("zoomOut").onclick=()=>zoom(.8);$("reset").onclick=()=>{fitOverview();selected=null;viewHistory=[];syncUniverseRail(null);updateSelection();if(reduced){scale=targetScale;offset={...targetOffset};}draw();};$("back").onclick=()=>{if(viewHistory.length){const previous=viewHistory.pop();selected=previous.selected||null;syncUniverseRail(selected);targetScale=previous.scale;targetOffset={...previous.offset};if(reduced){scale=targetScale;offset={...targetOffset};draw();}updateSelection();}else{$("reset").click();}};
$("language").onchange=e=>{const l=e.target.value;if(!LANGS.includes(l))return;lang=l;$("loading").hidden=false;try{localStorage.setItem("balabs-language",l);}catch(_){}loadTree();};
window.addEventListener("balabs:focus-domain",event=>{const target=event.detail?.domain;const root=nodes.find(n=>n.level===0&&n.id===target);if(root)focusNode(root);});
document.querySelectorAll("[data-lang]").forEach(button=>button.addEventListener("click",()=>{const next=button.dataset.lang;if(!LANGS.includes(next)||next===lang)return;lang=next;$("language").value=lang;updateUI();$("loading").hidden=false;loadTree();}));
window.addEventListener("resize",resize,{passive:true});
let inViewport=true;
const canAnimate=()=>!reduced&&inViewport&&!document.hidden;
function startAnimation(){if(canAnimate()&&!raf)raf=requestAnimationFrame(animate);}
function stopAnimation(){if(raf){cancelAnimationFrame(raf);raf=0;}}
function animate(){raf=0;if(!canAnimate())return;scale+=(targetScale-scale)*.12;offset.x+=(targetOffset.x-offset.x)*.12;offset.y+=(targetOffset.y-offset.y)*.12;draw();raf=requestAnimationFrame(animate);}
const visibilityObserver="IntersectionObserver" in window?new IntersectionObserver(entries=>{inViewport=entries[0]?.isIntersecting??true;if(canAnimate())startAnimation();else stopAnimation();},{threshold:.01}):null;
if(visibilityObserver)visibilityObserver.observe(canvas);
document.addEventListener("visibilitychange",()=>{if(canAnimate())startAnimation();else stopAnimation();});
async function loadTree(){try{const res=await fetch("./notion-tree."+lang+".json",{cache:"no-cache"});if(!res.ok)throw Error("Tree HTTP "+res.status);const data=await res.json();tree=data.domains||[];if(tree.length!==8)throw Error("Expected 8 scientific universes; received "+tree.length);const expected=["microbiology","plants","ecology","bioprocesses","biomaterials","instrumentation","digital","physical"];if(expected.some(id=>!tree.some(item=>item.id===id)))throw Error("The public universe manifest does not match the approved eight-universe architecture.");viewHistory=[];buildNetwork();fitOverview();scale=targetScale;offset={...targetOffset};selected=null;syncUniverseRail(null);updateUI();updateSelection();draw();const requestedDomain=new URLSearchParams(location.search).get("domain");const requestedRoot=nodes.find(n=>n.level===0&&n.id===requestedDomain);if(requestedRoot)focusNode(requestedRoot);$("loading").hidden=true;}catch(e){console.error(e);$("loading").querySelector("p").textContent=t("error");}}
async function init(){pixiRenderer=await createPixiRenderer(canvas);let l=new URLSearchParams(location.search).get("lang");try{if(!LANGS.includes(l))l=localStorage.getItem("balabs-language");}catch(_){}lang=LANGS.includes(l)?l:"fr";resize();await loadTree();startAnimation();}
init().catch(error=>{console.error("PixiJS initialization failed",error);const loading=$("loading");loading.querySelector("p").textContent="Le moteur graphique WebGL n’a pas pu démarrer. Rechargez la page ou essayez un navigateur compatible.";});