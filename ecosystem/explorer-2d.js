import { createPixiRenderer } from "./explorer-2d-pixi.js?v=zoom-label-gating-1";
const LANGS=["fr","en","ar","pt"];
const PALETTE={bio:"#79a991",myco:"#b18fc2",soil:"#c19b73",lab:"#80aeb8",products:"#c88773",iot:"#7eaaa3",work:"#aa9cbb",evidence:"#b5b58d"};
const COPY={
fr:{title:"Réseau vivant",desc:"Huit univers reliés dans un même espace vivant.",hint:"GLISSER · PINCER POUR ZOOMER · TOUCHER UN POINT POUR SÉLECTIONNER",root:"UNIVERS",branch:"BRANCHE",leaf:"RESSOURCE",open:"Ouvrir la ressource ↗",children:"ramifications",home:"Vue globale",loading:"Déploiement du réseau…",error:"Impossible de charger le réseau.",focus:"Centrer",back:"Vue précédente",count:"éléments",relations:"Connexions documentées"},
en:{title:"Living network",desc:"Eight interconnected universes in one living space.",hint:"DRAG · PINCH TO ZOOM · TAP A NODE TO SELECT",root:"UNIVERSE",branch:"BRANCH",leaf:"RESOURCE",open:"Open resource ↗",children:"branches",home:"Overview",loading:"Growing the network…",error:"Could not load the network.",focus:"Focus",back:"Previous view",count:"items",relations:"Documented connections"},
ar:{title:"الشبكة الحية",desc:"ثمانية عوالم مترابطة في فضاء واحد.",hint:"اسحب · كبّر بإصبعين · المس نقطة لاختيارها",root:"العالم",branch:"فرع",leaf:"مورد",open:"افتح المورد ↗",children:"تفرعات",home:"نظرة عامة",loading:"جارٍ بناء الشبكة…",error:"تعذّر تحميل الشبكة.",focus:"تركيز",back:"المنظور السابق",count:"عنصر",relations:"روابط موثقة"},
pt:{title:"Rede viva",desc:"Oito universos interligados num único espaço vivo.",hint:"ARRASTAR · PINÇA PARA ZOOM · TOCAR NUM PONTO PARA SELECIONAR",root:"UNIVERSO",branch:"RAMO",leaf:"RECURSO",open:"Abrir recurso ↗",children:"ramificações",home:"Visão geral",loading:"A expandir a rede…",error:"Não foi possível carregar a rede.",focus:"Focar",back:"Vista anterior",count:"itens",relations:"Ligações documentadas"}};
const $=id=>document.getElementById(id),canvas=$("field"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
let pixiRenderer=null,relationIndex=new Map();
let lang="fr",tree=[],nodes=[],edges=[],byId=new Map(),selected=null,w=0,h=0,dpr=1,scale=1,targetScale=1,offset={x:0,y:0},targetOffset={x:0,y:0},pointers=new Map(),gesture=null,dragged=false,raf=0,viewHistory=[];
const t=k=>COPY[lang][k]||COPY.fr[k],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};
function levelOpacity(level){const thresholds=[0,.10,.16,.24,.4,.7,1.1],t=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((scale-t*.72)/(t*.42),0,1);}
function screen(n){return{x:w/2+offset.x+n.x*scale,y:h/2+offset.y+n.y*scale}}
function buildNetwork(){
 nodes=[];edges=[];byId.clear();
 const roots=tree.length;
 // Uneven biological field anchors: deliberately not an eight-spoke radial layout.
 // Stable per-universe jitter keeps positions deterministic across reloads.
 const anchors=[[-.62,-.34],[-.17,-.62],[.39,-.48],[.68,.08],[.24,.53],[-.34,.57],[-.70,.19],[.02,-.02]];
 tree.forEach((root,i)=>{
  const anchor=anchors[i%anchors.length],seed=hash(root.id);
  const rx=anchor[0]*510+((seed&255)/255-.5)*58;
  const ry=anchor[1]*430+(((seed>>>8)&255)/255-.5)*54;
  const angle=Math.atan2(ry,rx)+(((seed>>>16)&255)/255-.5)*.34;
  const rootNode={id:root.id,title:root.title,x:rx,y:ry,r:12,level:0,data:root,rootId:root.id,parent:null,angle};
  nodes.push(rootNode);byId.set(root.id,rootNode);
  const walk=(data,parent,depth,branchAngle,path)=>{
   const expandSections=items=>items.flatMap(item=>item.kind==="section"?expandSections(item.children||[]):[item]);
   const kids=expandSections(data.children||[]);if(!kids.length)return;
   const spread=Math.min(2.45,1.05+Math.log2(kids.length+1)*.42);
   const dist=depth===1?195+Math.sqrt(kids.length)*12:depth===2?160+Math.sqrt(kids.length)*28:depth===3?86+Math.sqrt(kids.length)*16:Math.max(29,47-depth*2);
   kids.forEach((child,j)=>{
    const hsh=hash(child.id),fraction=kids.length===1?0:(j/(kids.length-1)-.5);
    const jitter=((hsh%1000)/1000-.5)*.3;
    // A smooth, position-dependent curl field bends neighbouring hyphae in related,
    // but not identical, directions. This avoids a repeated starburst at every node.
    const fieldX=Math.sin(parent.x*.0021+parent.y*.0013+depth*.73);
    const fieldY=Math.cos(parent.y*.0018-parent.x*.0011-depth*.51);
    const curl=Math.atan2(fieldY,fieldX)*.22;
    const a=branchAngle+curl+fraction*spread+jitter;
    const bend=dist*(.72+((hsh>>>8)%56)/100);
    const lateral=((hsh>>>17)&255)/255-.5;
    const sway=depth>1?lateral*Math.min(22,dist*.16):0;
    const x=parent.x+Math.cos(a)*bend-Math.sin(a)*sway,y=parent.y+Math.sin(a)*bend+Math.cos(a)*sway;
    const n={id:child.id,title:child.title,x,y,r:Math.max(2.1,8-depth*1.25),level:depth,data:child,rootId:root.id,parent:parent.id,angle:a};
    nodes.push(n);byId.set(n.id,n);edges.push({a:parent,b:n,depth,seed:hsh});
    const nextDrift=Math.sin((n.x+n.y)*.0017+hsh*.000001)*.16;
    walk(child,n,depth+1,a+(fraction*.22)+jitter*.45+nextDrift,path.concat(child.id));
   });
  };
  walk(root,rootNode,1,angle,[]);
 });
 // Cross-universe connections come only from the Notion relation manifest.
 // page-content links are explicitly distinguished from direct Notion hyperlinks.
 relationIndex=new Map();const relationPairs=new Set();
 let verifiedRelationCount=0,explicitRelationCount=0,contentRelationCount=0;
 const addRelationIndex=(id,entry)=>{if(!relationIndex.has(id))relationIndex.set(id,[]);relationIndex.get(id).push(entry);};
 tree.forEach(root=>{
  const source=byId.get(root.id);if(!source)return;
  for(const relation of root.relations||[]){
   const target=byId.get(relation.target);if(!target||target.level!==0||target.id===source.id)continue;
   const key=[source.id,target.id].sort().join("|");if(relationPairs.has(key))continue;
   relationPairs.add(key);
   const basis=relation.basis==="notion-link"?"notion-link":"page-content";
   edges.push({a:source,b:target,depth:0,cross:true,verified:true,basis,label:relation.label,evidence:relation.evidence,seed:hash(key)});
   verifiedRelationCount++;
   if(basis==="notion-link")explicitRelationCount++;else contentRelationCount++;
   addRelationIndex(source.id,{target:target.id,label:relation.label,basis,evidence:relation.evidence});
   addRelationIndex(target.id,{target:source.id,label:relation.label,basis,evidence:relation.evidence});
  }
 });
 const crossUniverseConnections=relationPairs.size;
 canvas.dataset.verifiedRelations=String(verifiedRelationCount);
 canvas.dataset.explicitRelations=String(explicitRelationCount);
 canvas.dataset.contentRelations=String(contentRelationCount);
 canvas.dataset.crossUniverseConnections=String(crossUniverseConnections);
 // Local anastomoses follow spatial proximity, not array order. Each hypha can
 // form one restrained side-connection at its depth, creating irregular meshes
 // while avoiding long chords and the visual regularity of a grid.
 const levels=new Map();
 nodes.filter(n=>n.level>0).forEach(n=>{const k=n.rootId+":"+n.level;if(!levels.has(k))levels.set(k,[]);levels.get(k).push(n)});
 let localAnastomoses=0;
 levels.forEach(group=>{
  if(group.length<4)return;
  const candidates=[];
  const nearestDistances=[];
  group.forEach((a,i)=>{
   const nearby=group.filter((b,j)=>j!==i)
    .map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)}))
    .sort((x,y)=>x.d-y.d).slice(0,3);
   if(nearby.length)nearestDistances.push(nearby[0].d);
   nearby.forEach(pair=>candidates.push(pair));
  });
  nearestDistances.sort((a,b)=>a-b);
  const median=nearestDistances[Math.floor(nearestDistances.length/2)]||60;
  const maxDistance=clamp(median*2.8,48,175);
  candidates.sort((a,b)=>a.d-b.d);
  const degree=new Map(),existing=new Set();
  for(const edge of edges){if(!edge.cross)continue;existing.add([edge.a.id,edge.b.id].sort().join("|"));}
  for(const pair of candidates){
   if(pair.d>maxDistance)break;
   if((degree.get(pair.a.id)||0)>=1||(degree.get(pair.b.id)||0)>=1)continue;
   const key=[pair.a.id,pair.b.id].sort().join("|");
   if(existing.has(key))continue;
   edges.push({a:pair.a,b:pair.b,depth:pair.a.level,cross:true,seed:hash(key)});
   existing.add(key);degree.set(pair.a.id,1);degree.set(pair.b.id,1);localAnastomoses++;
  }
 });
 canvas.dataset.localAnastomoses=String(localAnastomoses);
 canvas.dataset.universeCount=String(roots);
 canvas.dataset.nodeCount=String(nodes.length);
 canvas.dataset.edgeCount=String(edges.length);
}
function fitOverview(){const roots=nodes.filter(n=>n.level===0),xs=roots.map(n=>n.x),ys=roots.map(n=>n.y),pad=Math.min(150,Math.max(78,w*.16));targetScale=clamp(Math.min((w-pad*2)/(Math.max(...xs)-Math.min(...xs)+250),(h-pad*2)/(Math.max(...ys)-Math.min(...ys)+250)),.26,.62);targetOffset={x:0,y:0};}
function resize(){const r=canvas.parentElement.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,2);if(pixiRenderer)pixiRenderer.resize(w,h);if(nodes.length){fitOverview();scale=targetScale;offset={...targetOffset};draw();}}
function draw(){if(!pixiRenderer)return;pixiRenderer.render({nodes,edges,selected,scale,offset,width:w,height:h,reduced,lang,time:performance.now()});}
function renderUniverseRail(){
 const rail=$("universeRail");if(!rail)return;rail.replaceChildren();
 const names={fr:{bio:"BIO",myco:"MYCO",soil:"SOL",lab:"R&D",products:"OBJ",iot:"IoT",work:"PROJ",evidence:"DOC"},en:{bio:"BIO",myco:"MYCO",soil:"SOIL",lab:"R&D",products:"KIT",iot:"IoT",work:"WORK",evidence:"LOG"},ar:{bio:"حيوي",myco:"فطر",soil:"تربة",lab:"بحث",products:"عدة",iot:"IoT",work:"عمل",evidence:"توثيق"},pt:{bio:"BIO",myco:"MICO",soil:"SOLO",lab:"I&D",products:"KIT",iot:"IoT",work:"PROJ",evidence:"DOC"}};
 tree.forEach(root=>{const b=el("button","universe-point",(names[lang]||names.fr)[root.id]||root.title.slice(0,4));b.type="button";b.dataset.universe=root.id;b.title=root.title;b.setAttribute("aria-label",root.title);b.onclick=()=>{const n=byId.get(root.id);if(n)focusNode(n);};rail.append(b);});
 syncUniverseRail(selected);
}
function syncUniverseRail(n){
 const root=n?(n.level===0?n.id:n.rootId):null;
 // The public rail calls the evidence universe "learn" for visitors.
 const active=root==="evidence"?"learn":root;
 document.querySelectorAll(".universe-rail [data-universe]").forEach(b=>{
  const on=b.dataset.universe===active;
  if(on){b.setAttribute("aria-current","location");b.classList.add("is-active");}
  else{b.removeAttribute("aria-current");b.classList.remove("is-active");}
 });
 canvas.dataset.activeUniverse=active||"";
}
function focusNode(n,zoomTo){if(!n)return;if(!selected||selected.id!==n.id){viewHistory.push({scale:targetScale,offset:{...targetOffset},selected});if(viewHistory.length>80)viewHistory.shift();}const z=zoomTo??(n.level===0?1.05:n.level===1?1.65:n.level===2?2.8:n.level===3?4.5:6.2);targetScale=clamp(z,.3,12);targetOffset={x:-n.x*targetScale,y:-n.y*targetScale};selected=n;syncUniverseRail(n);updateSelection();draw();}
function activateNode(n){if(!n)return;focusNode(n);const url=n.data?.url;if(typeof url==="string"&&/^https:\/\/app\.notion\.com\/p\/[a-f0-9]{32}$/.test(url))window.open(url,"_blank","noopener,noreferrer");}
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
 const labelZoom=[0,.72,1.3,2.55,4.3];
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
 path.forEach((node,index)=>{const li=el("li",""),button=el("button","breadcrumb-link",node.title);button.type="button";button.setAttribute("aria-current",index===path.length-1?"page":"false");button.onclick=()=>activateNode(node);li.append(button);nav.append(li);});
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
 if(selected.data.description){
  const description=el("p","selection-description",selected.data.description);
  dock.append(description);
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
function renderAccessible(){const nav=$("accessibleNodes");nav.replaceChildren();nodes.forEach(n=>{const b=el("button","",n.title);b.type="button";b.dataset.nodeId=n.id;b.dataset.level=String(n.level);b.setAttribute("aria-label",n.title+" · niveau "+n.level);b.onclick=()=>activateNode(n);nav.append(b);});}
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
 renderUniverseRail();
}
function zoom(f,x=w/2,y=h/2){const next=clamp(targetScale*f,.26,12),ratio=next/targetScale;targetOffset.x=(x-w/2)-(x-w/2-targetOffset.x)*ratio;targetOffset.y=(y-h/2)-(y-h/2-targetOffset.y)*ratio;targetScale=next;if(reduced){scale=targetScale;offset={...targetOffset};draw();renderAccessible();}}
function pointerDown(e){canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;gesture={x:e.clientX,y:e.clientY,ox:targetOffset.x,oy:targetOffset.y};canvas.classList.add("dragging");}
function pointerMove(e){if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&gesture){const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){targetOffset.x=gesture.ox+dx;targetOffset.y=gesture.oy+dy;if(reduced){offset={...targetOffset};draw();}}}else if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(!pointerMove.last)pointerMove.last=d;const rect=canvas.getBoundingClientRect();zoom(d/pointerMove.last,(p[0].x+p[1].x)/2-rect.left,(p[0].y+p[1].y)/2-rect.top);pointerMove.last=d;dragged=true;}}
function pointerUp(e){pointers.delete(e.pointerId);canvas.classList.remove("dragging");if(!pointers.size){if(!dragged){const r=canvas.getBoundingClientRect(),n=hit(e.clientX-r.left,e.clientY-r.top);if(n)activateNode(n);}gesture=null;pointerMove.last=0;}else if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,ox:targetOffset.x,oy:targetOffset.y};pointerMove.last=0;dragged=true;}}
canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerUp);
canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.16:.86,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$("zoomIn").onclick=()=>zoom(1.25);$("zoomOut").onclick=()=>zoom(.8);$("reset").onclick=()=>{fitOverview();selected=null;syncUniverseRail(null);viewHistory=[];updateSelection();if(reduced){scale=targetScale;offset={...targetOffset};}draw();};$("back").onclick=()=>{if(viewHistory.length){const previousView=viewHistory.pop();targetScale=previousView.scale;targetOffset={...previousView.offset};selected=previousView.selected||null;syncUniverseRail(selected);if(reduced){scale=targetScale;offset={...targetOffset};draw();}updateSelection();}else{$("reset").click();}};
$("language").onchange=e=>{const l=e.target.value;if(!LANGS.includes(l))return;lang=l;$("loading").hidden=false;try{localStorage.setItem("balabs-language",l);}catch(_){}loadTree();};
window.addEventListener("balabs:focus-domain",event=>{const requested=event.detail?.domain,target=requested==="learn"?"evidence":requested;const root=nodes.find(n=>n.level===0&&n.id===target);if(root)focusNode(root);});
document.querySelectorAll("[data-lang]").forEach(button=>button.addEventListener("click",()=>{const next=button.dataset.lang;if(!LANGS.includes(next)||next===lang)return;lang=next;$("language").value=lang;updateUI();$("loading").hidden=false;loadTree();}));
window.addEventListener("resize",resize,{passive:true});
function animate(){if(!reduced){scale+=(targetScale-scale)*.12;offset.x+=(targetOffset.x-offset.x)*.12;offset.y+=(targetOffset.y-offset.y)*.12;draw();}raf=requestAnimationFrame(animate);}
async function loadTree(){try{const res=await fetch("./notion-tree."+lang+".json",{cache:"no-cache"});if(!res.ok)throw Error("Tree HTTP "+res.status);const data=await res.json();tree=data.domains||[];if(tree.length!==8)throw Error("Expected 8 universes; received "+tree.length);viewHistory=[];buildNetwork();fitOverview();scale=targetScale;offset={...targetOffset};selected=null;syncUniverseRail(null);updateUI();updateSelection();draw();const requestedDomain=new URLSearchParams(location.search).get("domain");const requestedRoot=nodes.find(n=>n.level===0&&n.id===requestedDomain);if(requestedRoot)focusNode(requestedRoot);$("loading").hidden=true;}catch(e){console.error(e);$("loading").querySelector("p").textContent=t("error");}}
async function init(){pixiRenderer=await createPixiRenderer(canvas);let l=new URLSearchParams(location.search).get("lang");try{if(!LANGS.includes(l))l=localStorage.getItem("balabs-language");}catch(_){}lang=LANGS.includes(l)?l:"fr";resize();await loadTree();if(!reduced)raf=requestAnimationFrame(animate);}
init().catch(error=>{console.error("PixiJS initialization failed",error);const loading=$("loading");loading.querySelector("p").textContent="Le moteur graphique WebGL n’a pas pu démarrer. Rechargez la page ou essayez un navigateur compatible.";});