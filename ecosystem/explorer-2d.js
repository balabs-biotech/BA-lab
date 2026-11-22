import { createPixiRenderer } from "./explorer-2d-pixi.js?v=progressive-reveal-1";
const LANGS=["fr","en","ar","pt"];
const PALETTE={microbiology:"#79a991",plants:"#8fb58c",ecology:"#c19b73",bioprocesses:"#b58d73",biomaterials:"#c88773",instrumentation:"#7eaaa3",digital:"#aa9cbb",physical:"#b5b58d"};
const COPY={
fr:{title:"Réseau vivant",desc:"Huit univers reliés dans un même espace vivant.",hint:"GLISSER · PINCER POUR ZOOMER · 1 CLIC POUR SÉLECTIONNER · DOUBLE-CLIC POUR OUVRIR NOTION",root:"UNIVERS",branch:"BRANCHE",leaf:"RESSOURCE",open:"Ouvrir la ressource ↗",children:"ramifications",home:"Vue globale",loading:"Déploiement du réseau…",error:"Impossible de charger le réseau.",focus:"Centrer",back:"Vue précédente",count:"éléments",relations:"Connexions documentées"},
en:{title:"Living network",desc:"Eight interconnected universes in one living space.",hint:"DRAG · PINCH TO ZOOM · CLICK TO SELECT · DOUBLE-CLICK TO OPEN NOTION",root:"UNIVERSE",branch:"BRANCH",leaf:"RESOURCE",open:"Open resource ↗",children:"branches",home:"Overview",loading:"Growing the network…",error:"Could not load the network.",focus:"Focus",back:"Previous view",count:"items",relations:"Documented connections"},
ar:{title:"الشبكة الحية",desc:"ثمانية عوالم مترابطة في فضاء واحد.",hint:"اسحب · كبّر بإصبعين · نقرة للاختيار · نقرتان لفتح Notion",root:"العالم",branch:"فرع",leaf:"مورد",open:"افتح المورد ↗",children:"تفرعات",home:"نظرة عامة",loading:"جارٍ بناء الشبكة…",error:"تعذّر تحميل الشبكة.",focus:"تركيز",back:"المنظور السابق",count:"عنصر",relations:"روابط موثقة"},
pt:{title:"Rede viva",desc:"Oito universos interligados num único espaço vivo.",hint:"ARRASTAR · PINÇA PARA ZOOM · CLIQUE PARA SELECIONAR · DUPLO CLIQUE PARA ABRIR NOTION",root:"UNIVERSO",branch:"RAMO",leaf:"RECURSO",open:"Abrir recurso ↗",children:"ramificações",home:"Visão geral",loading:"A expandir a rede…",error:"Não foi possível carregar a rede.",focus:"Focar",back:"Vista anterior",count:"itens",relations:"Ligações documentadas"}};
const $=id=>document.getElementById(id),canvas=$("field"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
let pixiRenderer=null,relationIndex=new Map(),overviewPositions=new Map(),radialLayoutRoot=null;
let lang="fr",tree=[],nodes=[],edges=[],byId=new Map(),selected=null,w=0,h=0,dpr=1,scale=1,targetScale=1,offset={x:0,y:0},targetOffset={x:0,y:0},pointers=new Map(),gesture=null,dragged=false,raf=0,viewHistory=[];
const t=k=>COPY[lang][k]||COPY.fr[k],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};
function levelOpacity(level){if(level===0)return 1;const thresholds=[0,.65,1.15,1.8,2.6,3.6,4.8,6.2,7.8,9.6],t=thresholds[Math.min(level,thresholds.length-1)],x=clamp((scale-t*1.3)/(t*1.1),0,1);return .022*Math.pow(.78,Math.max(0,level-1))+.88*x*x*(3-2*x);}
function screen(n){return{x:w/2+offset.x+n.x*scale,y:h/2+offset.y+n.y*scale}}
function buildNetwork(){
 nodes=[];edges=[];byId.clear();
 // Eight evenly spaced universes orbit a central, transversal Mycology hub.
 // The hub is visual only: the navigable Notion tree remains eight universes.
 const orbitRadius=286;
 tree.forEach((root,i)=>{
  const angle=-Math.PI/2+i*Math.PI/4;
  const seed=hash(root.id);
  const rx=Math.cos(angle)*orbitRadius+((seed&255)/255-.5)*8;
  const ry=Math.sin(angle)*orbitRadius+(((seed>>>8)&255)/255-.5)*8;
  const rootNode={id:root.id,title:root.title,x:rx,y:ry,r:13,level:0,data:root,rootId:root.id,parent:null,angle};
  nodes.push(rootNode);byId.set(root.id,rootNode);
  const walk=(data,parent,depth,branchAngle)=>{
   const kids=data.children||[];if(!kids.length)return;
   const spreadCap=depth===1?2.25:depth===2?1.8:depth===3?1.48:1.25;
   const spread=Math.min(spreadCap,.92+Math.log2(kids.length+1)*.34);
   const dist=depth===1?Math.min(126,98+Math.sqrt(kids.length)*3.5):
    depth===2?Math.min(91,68+Math.sqrt(kids.length)*4):
    depth===3?Math.min(63,47+Math.sqrt(kids.length)*2.5):
    depth===4?35:Math.max(22,31-(depth-5)*3);
   kids.forEach((child,j)=>{
    const hsh=hash(child.id),fraction=kids.length===1?0:(j/(kids.length-1)-.5);
    const jitter=((hsh%1000)/1000-.5)*.16;
    const fieldX=Math.sin(parent.x*.0015+parent.y*.0011+depth*.61);
    const fieldY=Math.cos(parent.y*.0013-parent.x*.001+depth*.43);
    const curl=Math.atan2(fieldY,fieldX)*.105;
    const a=branchAngle+curl+fraction*spread+jitter;
    const bend=dist*(.92+((hsh>>>8)%17)/100);
    const lateral=((hsh>>>17)&255)/255-.5;
    const sway=depth>1?lateral*Math.min(10,dist*.09):0;
    const x=parent.x+Math.cos(a)*bend-Math.sin(a)*sway;
    const y=parent.y+Math.sin(a)*bend+Math.cos(a)*sway;
    const n={id:child.id,title:child.title,x,y,r:Math.max(2.1,8-depth*1.25),level:depth,data:child,rootId:root.id,parent:parent.id,angle:a};
    nodes.push(n);byId.set(n.id,n);edges.push({a:parent,b:n,depth,seed:hsh});
    const nextDrift=Math.sin((n.x+n.y)*.0012+hsh*.000001)*.075;
    walk(child,n,depth+1,a+fraction*.12+jitter*.3+nextDrift);
   });
  };
  walk(root,rootNode,1,angle);
 });
 // Cross-universe connections come only from the Notion relation manifest.
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
 canvas.dataset.verifiedRelations=String(verifiedRelationCount);
 canvas.dataset.explicitRelations=String(explicitRelationCount);
 canvas.dataset.contentRelations=String(contentRelationCount);
 canvas.dataset.crossUniverseConnections=String(relationPairs.size);
 // Short, local anastomoses keep neighbouring hyphae connected without long chords.
 const levels=new Map();
 nodes.filter(n=>n.level>0).forEach(n=>{const k=n.rootId+":"+n.level;if(!levels.has(k))levels.set(k,[]);levels.get(k).push(n)});
 let localAnastomoses=0;
 levels.forEach(group=>{
  if(group.length<4)return;
  const candidates=[],nearestDistances=[];
  group.forEach((a,i)=>{
   const nearby=group.filter((b,j)=>j!==i).map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)})).sort((x,y)=>x.d-y.d).slice(0,3);
   if(nearby.length)nearestDistances.push(nearby[0].d);
   nearby.forEach(pair=>candidates.push(pair));
  });
  nearestDistances.sort((a,b)=>a-b);
  const median=nearestDistances[Math.floor(nearestDistances.length/2)]||48;
  const maxDistance=clamp(median*2.3,42,120);
  candidates.sort((a,b)=>a.d-b.d);
  const degree=new Map(),existing=new Set();
  for(const edge of edges)if(edge.cross)existing.add([edge.a.id,edge.b.id].sort().join("|"));
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
 canvas.dataset.layout="eight-around-mycology";
 canvas.dataset.universeCount=String(tree.length);
 canvas.dataset.nodeCount=String(nodes.length);
 canvas.dataset.edgeCount=String(edges.length);
 const branchLengths=edges.filter(e=>!e.cross).map(e=>Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y));
 canvas.dataset.maxBranchLength=String(Math.max(0,...branchLengths).toFixed(1));
 overviewPositions=new Map(nodes.map(n=>[n.id,{x:n.x,y:n.y,angle:n.angle}]));radialLayoutRoot=null;
}
function restoreOverviewLayout(){
 for(const n of nodes){const p=overviewPositions.get(n.id);if(p){n.x=p.x;n.y=p.y;n.angle=p.angle;}}
 radialLayoutRoot=null;canvas.dataset.radialRoot="";canvas.dataset.radialRingRadii="[]";canvas.dataset.radialLevelCounts="{}";
}
function applyRadialLayout(root){
 if(!root)return;
 const scoped=nodes.filter(n=>n.rootId===root.id),children=new Map();
 scoped.forEach(n=>{if(n.parent){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n);}});
 const leafMemo=new Map();
 const leaves=n=>{if(leafMemo.has(n.id))return leafMemo.get(n.id);const kids=children.get(n.id)||[];const count=kids.length?kids.reduce((sum,k)=>sum+leaves(k),0):1;leafMemo.set(n.id,count);return count;};
 const start=-Math.PI/2,end=start+Math.PI*2;
 root.x=0;root.y=0;root.angle=-Math.PI/2;root.sectorStart=start;root.sectorEnd=end;
 const parents=[root],radii=[],counts={};let depth=1,previousRadius=0;
 while(parents.length){
  const parentData=parents.map(parent=>({parent,kids:children.get(parent.id)||[],span:Math.max(.001,parent.sectorEnd-parent.sectorStart)})).filter(x=>x.kids.length);
  if(!parentData.length)break;
  const required=Math.max(...parentData.map(x=>x.kids.length*150/x.span));
  // Long canonical Notion titles need real screen-space room, especially
  // the twelve direct microbiology resources around the selected universe.
  const radius=Math.max(640+(depth-1)*320,previousRadius+300,required);
  radii.push(Math.round(radius));counts[depth]=parentData.reduce((sum,x)=>sum+x.kids.length,0);
  const next=[];
  for(const {parent,kids,span} of parentData){
   const weights=kids.map(child=>1+Math.sqrt(leaves(child))),total=weights.reduce((a,b)=>a+b,0);let cursor=parent.sectorStart;
   kids.forEach((child,index)=>{
    const width=span*weights[index]/total,lo=cursor,hi=cursor+width,angle=(lo+hi)/2;
    child.sectorStart=lo;child.sectorEnd=hi;child.angle=angle;child.x=Math.cos(angle)*radius;child.y=Math.sin(angle)*radius;cursor=hi;next.push(child);
   });
  }
  parents.splice(0,parents.length,...next);previousRadius=radius;depth++;
 }
 radialLayoutRoot=root.id;canvas.dataset.radialRoot=root.id;canvas.dataset.radialRingRadii=JSON.stringify(radii);canvas.dataset.radialLevelCounts=JSON.stringify(counts);
 const minGaps=[];
 for(let level=1;level<depth;level++){const group=scoped.filter(n=>n.level===level);let min=Infinity;for(let i=0;i<group.length;i++)for(let k=i+1;k<group.length;k++)min=Math.min(min,Math.hypot(group[i].x-group[k].x,group[i].y-group[k].y));if(Number.isFinite(min))minGaps.push(min);}
 canvas.dataset.radialMinNodeGap=minGaps.length?Math.min(...minGaps).toFixed(1):"0";
}
function fitOverview(){const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),pad=Math.min(90,Math.max(28,Math.min(w,h)*.07)),spanX=Math.max(...xs)-Math.min(...xs)+100,spanY=Math.max(...ys)-Math.min(...ys)+100;targetScale=clamp(Math.min((w-pad*2)/spanX,(h-pad*2)/spanY),.26,.78);targetOffset={x:0,y:0};}
function resize(){const r=canvas.parentElement.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,2);if(pixiRenderer)pixiRenderer.resize(w,h);if(nodes.length){if(!selected)fitOverview();scale=targetScale;offset={...targetOffset};draw();}}
function draw(){if(!pixiRenderer)return;pixiRenderer.render({nodes,edges,selected,scale,offset,width:w,height:h,reduced,lang,time:performance.now(),radialRings:JSON.parse(canvas.dataset.radialRingRadii||"[]"),core:{x:0,y:0,title:{fr:'MYCOLOGIE',en:'MYCOLOGY',ar:'علم الفطريات',pt:'MICOLOGIA'}[lang]}});}
function renderUniverseRail(){
 const rail=$("universeRail");if(!rail)return;rail.replaceChildren();
 tree.forEach(root=>{const b=el("button","universe-point",root.title);b.type="button";b.dataset.universe=root.id;b.title=root.title;b.setAttribute("aria-label",root.title);b.onclick=()=>{const n=byId.get(root.id);if(n)focusNode(n);};rail.append(b);});
 syncUniverseRail(selected);
}
function syncUniverseRail(n){
 const root=n?(n.level===0?n.id:n.rootId):null;
 const active=root;
 document.querySelectorAll(".universe-rail [data-universe]").forEach(b=>{
  const on=b.dataset.universe===active;
  if(on){b.setAttribute("aria-current","location");b.classList.add("is-active");}
  else{b.removeAttribute("aria-current");b.classList.remove("is-active");}
 });
 canvas.dataset.activeUniverse=active||"";
}
function focusNode(n,zoomTo){if(!n)return;if(!selected||selected.id!==n.id){viewHistory.push({scale:targetScale,offset:{...targetOffset},selected});if(viewHistory.length>80)viewHistory.shift();}const root=n.level===0?n:byId.get(n.rootId);if(root&&radialLayoutRoot!==root.id)applyRadialLayout(root);const depthZoom=[w<700?.72:.85,1.65,2.8,4.5,6.2,7.8,9.4,10.8,12];const z=zoomTo??depthZoom[Math.min(n.level,depthZoom.length-1)];targetScale=clamp(z,.3,12);targetOffset={x:-n.x*targetScale,y:-n.y*targetScale};selected=n;syncUniverseRail(n);updateSelection();draw();}
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
function renderAccessible(){const nav=$("accessibleNodes");nav.replaceChildren();nodes.forEach(n=>{const b=el("button","",n.title);b.type="button";b.dataset.nodeId=n.id;b.dataset.notionTitle=n.title;b.dataset.level=String(n.level);b.setAttribute("aria-label",n.title+" · niveau "+n.level);b.onclick=()=>focusNode(n);nav.append(b);});}
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
function pointerUp(e){pointers.delete(e.pointerId);canvas.classList.remove("dragging");if(!pointers.size){if(!dragged){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,n=hit(x,y),now=performance.now(),previous=pointerUp.lastClick;if(previous&&now-previous.time<650&&Math.hypot(x-previous.x,y-previous.y)<28){pointerUp.lastClick=null;}else if(n){focusNode(n);pointerUp.lastClick={node:n,time:now,x,y};}else pointerUp.lastClick=null;}gesture=null;pointerMove.last=0;}else if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,ox:targetOffset.x,oy:targetOffset.y};pointerMove.last=0;dragged=true;}}
canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerUp);
window.addEventListener("click",e=>{if(e.detail<2)return;const target=e.target;if(target!==canvas&&!target.closest?.("#selection"))return;if(selected)activateNode(selected);},true);

canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.16:.86,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$("zoomIn").onclick=()=>zoom(1.25);$("zoomOut").onclick=()=>zoom(.8);$("reset").onclick=()=>{restoreOverviewLayout();selected=null;fitOverview();syncUniverseRail(null);viewHistory=[];updateSelection();if(reduced){scale=targetScale;offset={...targetOffset};}draw();};$("back").onclick=()=>{if(viewHistory.length){const previous=viewHistory.pop();selected=previous.selected||null;if(selected){const root=selected.level===0?selected:byId.get(selected.rootId);if(root)applyRadialLayout(root);}else restoreOverviewLayout();targetScale=previous.scale;targetOffset={...previous.offset};syncUniverseRail(selected);if(reduced){scale=targetScale;offset={...targetOffset};draw();}updateSelection();}else{$("reset").click();}};
$("language").onchange=e=>{const l=e.target.value;if(!LANGS.includes(l))return;lang=l;$("loading").hidden=false;try{localStorage.setItem("balabs-language",l);}catch(_){}loadTree();};
window.addEventListener("balabs:focus-domain",event=>{const target=event.detail?.domain;const root=nodes.find(n=>n.level===0&&n.id===target);if(root)focusNode(root);});
document.querySelectorAll("[data-lang]").forEach(button=>button.addEventListener("click",()=>{const next=button.dataset.lang;if(!LANGS.includes(next)||next===lang)return;lang=next;$("language").value=lang;updateUI();$("loading").hidden=false;loadTree();}));
window.addEventListener("resize",resize,{passive:true});
function animate(){if(!reduced){scale+=(targetScale-scale)*.12;offset.x+=(targetOffset.x-offset.x)*.12;offset.y+=(targetOffset.y-offset.y)*.12;draw();}raf=requestAnimationFrame(animate);}
async function loadTree(){try{const res=await fetch("./notion-tree."+lang+".json",{cache:"no-cache"});if(!res.ok)throw Error("Tree HTTP "+res.status);const data=await res.json();tree=data.domains||[];if(tree.length!==8)throw Error("Expected 8 universes; received "+tree.length);viewHistory=[];buildNetwork();restoreOverviewLayout();fitOverview();scale=targetScale;offset={...targetOffset};selected=null;syncUniverseRail(null);updateUI();updateSelection();draw();const requestedDomain=new URLSearchParams(location.search).get("domain");const requestedRoot=nodes.find(n=>n.level===0&&n.id===requestedDomain);if(requestedRoot)focusNode(requestedRoot);$("loading").hidden=true;}catch(e){console.error(e);$("loading").querySelector("p").textContent=t("error");}}
async function init(){pixiRenderer=await createPixiRenderer(canvas);let l=new URLSearchParams(location.search).get("lang");try{if(!LANGS.includes(l))l=localStorage.getItem("balabs-language");}catch(_){}lang=LANGS.includes(l)?l:"fr";resize();await loadTree();if(!reduced)raf=requestAnimationFrame(animate);}
init().catch(error=>{console.error("PixiJS initialization failed",error);const loading=$("loading");loading.querySelector("p").textContent="Le moteur graphique WebGL n’a pas pu démarrer. Rechargez la page ou essayez un navigateur compatible.";});