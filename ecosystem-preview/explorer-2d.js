import { createPixiRenderer } from "../ecosystem-core/explorer-2d-pixi.js";
import { createVernpixiNetwork } from "../ecosystem-core/explorer-2d-network.js";
const LANGS=["fr","en","ar","pt"];
const PALETTE={bio:"#79a991",myco:"#b18fc2",soil:"#c19b73",lab:"#80aeb8",products:"#c88773",iot:"#7eaaa3",work:"#aa9cbb",evidence:"#b5b58d"};
const COPY={
fr:{title:"Réseau vivant",desc:"Huit univers reliés dans un même espace vivant.",hint:"GLISSER · PINCER POUR ZOOMER · TOUCHER POUR EXPLORER",root:"UNIVERS",branch:"BRANCHE",leaf:"RESSOURCE",open:"Ouvrir la ressource ↗",children:"ramifications",home:"Vue globale",loading:"Déploiement du réseau…",error:"Impossible de charger le réseau.",focus:"Centrer",back:"Vue précédente",count:"éléments",relations:"Connexions documentées"},
en:{title:"Living network",desc:"Eight interconnected universes in one living space.",hint:"DRAG · PINCH TO ZOOM · TAP TO EXPLORE",root:"UNIVERSE",branch:"BRANCH",leaf:"RESOURCE",open:"Open resource ↗",children:"branches",home:"Overview",loading:"Growing the network…",error:"Could not load the network.",focus:"Focus",back:"Previous view",count:"items",relations:"Documented connections"},
ar:{title:"الشبكة الحية",desc:"ثمانية عوالم مترابطة في فضاء واحد.",hint:"اسحب · كبّر بإصبعين · المس للاستكشاف",root:"العالم",branch:"فرع",leaf:"مورد",open:"افتح المورد ↗",children:"تفرعات",home:"نظرة عامة",loading:"جارٍ بناء الشبكة…",error:"تعذّر تحميل الشبكة.",focus:"تركيز",back:"المنظور السابق",count:"عنصر",relations:"روابط موثقة"},
pt:{title:"Rede viva",desc:"Oito universos interligados num único espaço vivo.",hint:"ARRASTAR · PINÇA PARA ZOOM · TOCAR PARA EXPLORAR",root:"UNIVERSO",branch:"RAMO",leaf:"RECURSO",open:"Abrir recurso ↗",children:"ramificações",home:"Visão geral",loading:"A expandir a rede…",error:"Não foi possível carregar a rede.",focus:"Focar",back:"Vista anterior",count:"itens",relations:"Ligações documentadas"}};
const $=id=>document.getElementById(id),canvas=$("field"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
let pixiRenderer=null,relationIndex=new Map();
let lang="fr",tree=[],nodes=[],edges=[],byId=new Map(),selected=null,w=0,h=0,dpr=1,scale=1,targetScale=1,offset={x:0,y:0},targetOffset={x:0,y:0},pointers=new Map(),gesture=null,dragged=false,raf=0,previousView=null;
const t=k=>COPY[lang][k]||COPY.fr[k],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};
function levelOpacity(level){const thresholds=[0,.10,.16,.24,.4,.7,1.1],t=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((scale-t*.72)/(t*.42),0,1);}
function screen(n){return{x:w/2+offset.x+n.x*scale,y:h/2+offset.y+n.y*scale}}
function buildNetwork(){
 canvas.dataset.engine="vernpixi-shared";
 const graph=createVernpixiNetwork(tree);
 nodes=graph.nodes;edges=graph.edges;byId=graph.byId;relationIndex=graph.relationIndex;
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
function fitOverview(){const roots=nodes.filter(n=>n.level===0),xs=roots.map(n=>n.x),ys=roots.map(n=>n.y),pad=Math.min(150,Math.max(78,w*.16));targetScale=clamp(Math.min((w-pad*2)/(Math.max(...xs)-Math.min(...xs)+250),(h-pad*2)/(Math.max(...ys)-Math.min(...ys)+250)),.26,.62);targetOffset={x:0,y:0};}
function resize(){const r=canvas.parentElement.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,2);if(pixiRenderer)pixiRenderer.resize(w,h);if(nodes.length){fitOverview();scale=targetScale;offset={...targetOffset};draw();}}
function draw(){if(!pixiRenderer)return;pixiRenderer.render({nodes,edges,selected,scale,offset,width:w,height:h,reduced,lang,time:performance.now()});}
function focusNode(n,zoomTo){if(!n)return;previousView={scale:targetScale,offset:{...targetOffset},selected};const z=zoomTo??(n.level===0?1.05:n.level===1?1.65:n.level===2?2.8:n.level===3?4.5:6.2);targetScale=clamp(z,.3,12);targetOffset={x:-n.x*targetScale,y:-n.y*targetScale};selected=n;updateSelection();draw();}
function hit(x,y){let found=null,best=22;for(const n of nodes){if(levelOpacity(n.level)<.12)continue;const p=screen(n),d=Math.hypot(p.x-x,p.y-y),limit=Math.max(best,n.r*Math.sqrt(scale)+7);if(d<limit){best=d;found=n;}}return found;}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function updateBreadcrumbs(){
 const nav=$("crumbs");if(!nav)return;nav.replaceChildren();
 const path=[];let current=selected;
 while(current){path.unshift(current);current=current.parent?byId.get(current.parent):null;}
 if(!path.length){const li=el("li","", "BA Labs");nav.append(li);return;}
 path.forEach((node,index)=>{const li=el("li",""),button=el("button","breadcrumb-link",node.title);button.type="button";button.setAttribute("aria-current",index===path.length-1?"page":"false");button.onclick=()=>focusNode(node);li.append(button);nav.append(li);});
}
function updateSelection(){
 const box=$("selection");box.replaceChildren();updateBreadcrumbs();
 $("back").disabled=!previousView;
 if(!selected){renderAccessible();return;}
 const n=selected,data=n.data,card=el("div","card"),body=el("div","card-body");
 const badge=el("span","badge badge-outline",n.level===0?t("root"):data.children?.length?t("branch"):t("leaf"));
 const title=el("h2","card-title",n.title),desc=el("p","",data.description||((data.children?.length||0)+" "+t("children")));
 const meta=el("small","",n.level+" / "+t("count")),actions=el("div","card-actions");
 const focus=el("button","btn btn-primary btn-sm",t("focus"));focus.type="button";focus.onclick=()=>focusNode(n);actions.append(focus);
 if(data.url){const a=el("a","btn btn-outline btn-sm",t("open"));a.href=data.url;a.target="_blank";a.rel="noopener noreferrer";actions.append(a);}
 body.append(badge,title,desc,meta,actions);
 const children=(data.children||[]).map(child=>byId.get(child.id)).filter(Boolean);
 if(children.length){
  const childNav=el("nav","child-branches");childNav.setAttribute("aria-label",t("children"));
  children.forEach(child=>{const button=el("button","btn btn-ghost btn-xs",child.title);button.type="button";button.onclick=()=>focusNode(child);childNav.append(button);});
  body.append(childNav);
 }
 const related=relationIndex.get(n.id)||[];
 if(related.length){
  const relationNav=el("nav","related-universes");relationNav.setAttribute("aria-label",t("relations"));
  const heading=el("small","relation-heading",t("relations"));relationNav.append(heading);
  related.forEach(relation=>{const target=byId.get(relation.target);if(!target)return;const button=el("button","btn btn-outline btn-xs",relation.label);button.type="button";button.title=relation.evidence+" · "+(relation.basis==="notion-link"?"Notion":"contenu documenté");button.onclick=()=>focusNode(target);relationNav.append(button);});
  body.append(relationNav);
 }
 card.append(body);box.append(card);renderAccessible();
}
function renderAccessible(){const nav=$("accessibleNodes");nav.replaceChildren();nodes.filter(n=>levelOpacity(n.level)>.15).forEach(n=>{const b=el("button","",n.title);b.onclick=()=>focusNode(n);nav.append(b);});}
function updateUI(){document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";$("heading").textContent=t("title");$("description").textContent=t("desc");$("hint").textContent=t("hint");$("kicker").textContent=t("home");$("language").value=lang;document.title="BA Labs — "+t("title");}
function zoom(f,x=w/2,y=h/2){const next=clamp(targetScale*f,.26,selected?12:.82),ratio=next/targetScale;targetOffset.x=(x-w/2)-(x-w/2-targetOffset.x)*ratio;targetOffset.y=(y-h/2)-(y-h/2-targetOffset.y)*ratio;targetScale=next;if(reduced){scale=targetScale;offset={...targetOffset};draw();renderAccessible();}}
function pointerDown(e){canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;gesture={x:e.clientX,y:e.clientY,ox:targetOffset.x,oy:targetOffset.y};canvas.classList.add("dragging");}
function pointerMove(e){if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&gesture){const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){targetOffset.x=gesture.ox+dx;targetOffset.y=gesture.oy+dy;if(reduced){offset={...targetOffset};draw();}}}else if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(!pointerMove.last)pointerMove.last=d;const rect=canvas.getBoundingClientRect();zoom(d/pointerMove.last,(p[0].x+p[1].x)/2-rect.left,(p[0].y+p[1].y)/2-rect.top);pointerMove.last=d;dragged=true;}}
function pointerUp(e){pointers.delete(e.pointerId);canvas.classList.remove("dragging");if(!pointers.size){if(!dragged){const r=canvas.getBoundingClientRect(),n=hit(e.clientX-r.left,e.clientY-r.top);if(n)focusNode(n);}gesture=null;pointerMove.last=0;}else if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,ox:targetOffset.x,oy:targetOffset.y};pointerMove.last=0;dragged=true;}}
canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerUp);
canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.16:.86,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$("zoomIn").onclick=()=>zoom(1.25);$("zoomOut").onclick=()=>zoom(.8);$("reset").onclick=()=>{fitOverview();selected=null;previousView=null;updateSelection();if(reduced){scale=targetScale;offset={...targetOffset};}draw();};$("back").onclick=()=>{if(previousView){targetScale=previousView.scale;targetOffset={...previousView.offset};selected=previousView.selected||null;previousView=null;if(reduced){scale=targetScale;offset={...targetOffset};draw();}updateSelection();}else{$("reset").click();}};
$("language").onchange=e=>{const l=e.target.value;if(!LANGS.includes(l))return;lang=l;$("loading").hidden=false;try{localStorage.setItem("balabs-language",l);}catch(_){}loadTree();};
window.addEventListener("resize",resize,{passive:true});
function animate(){if(!reduced){scale+=(targetScale-scale)*.12;offset.x+=(targetOffset.x-offset.x)*.12;offset.y+=(targetOffset.y-offset.y)*.12;draw();}raf=requestAnimationFrame(animate);}
async function loadTree(){try{const res=await fetch("./notion-tree."+lang+".json",{cache:"no-cache"});if(!res.ok)throw Error("Tree HTTP "+res.status);const data=await res.json();tree=data.domains||[];if(tree.length!==8)throw Error("Expected 8 universes; received "+tree.length);buildNetwork();fitOverview();scale=targetScale;offset={...targetOffset};selected=null;updateUI();updateSelection();draw();const requestedDomain=new URLSearchParams(location.search).get("domain");const requestedRoot=nodes.find(n=>n.level===0&&n.id===requestedDomain);if(requestedRoot)focusNode(requestedRoot);$("loading").hidden=true;}catch(e){console.error(e);$("loading").querySelector("p").textContent=t("error");}}
async function init(){pixiRenderer=await createPixiRenderer(canvas);let l=new URLSearchParams(location.search).get("lang");try{if(!LANGS.includes(l))l=localStorage.getItem("balabs-language");}catch(_){}lang=LANGS.includes(l)?l:"fr";resize();await loadTree();if(!reduced)raf=requestAnimationFrame(animate);}
init().catch(error=>{console.error("PixiJS initialization failed",error);const loading=$("loading");loading.querySelector("p").textContent="Le moteur graphique WebGL n’a pas pu démarrer. Rechargez la page ou essayez un navigateur compatible.";});