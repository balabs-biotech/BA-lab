const LANGS=["fr","en","ar","pt"];
const PALETTE={bio:"#79a991",myco:"#b18fc2",soil:"#c19b73",lab:"#80aeb8",products:"#c88773",iot:"#7eaaa3",work:"#aa9cbb",learn:"#b5b58d"};
const COPY={
fr:{title:"Réseau vivant",desc:"Huit univers reliés dans un même espace vivant.",hint:"GLISSER · PINCER POUR ZOOMER · TOUCHER POUR EXPLORER",root:"UNIVERS",branch:"BRANCHE",leaf:"RESSOURCE",open:"Ouvrir la ressource ↗",children:"ramifications",home:"Vue globale",loading:"Déploiement du réseau…",error:"Impossible de charger le réseau.",focus:"Centrer",back:"Vue précédente",count:"éléments"},
en:{title:"Living network",desc:"Eight interconnected universes in one living space.",hint:"DRAG · PINCH TO ZOOM · TAP TO EXPLORE",root:"UNIVERSE",branch:"BRANCH",leaf:"RESOURCE",open:"Open resource ↗",children:"branches",home:"Overview",loading:"Growing the network…",error:"Could not load the network.",focus:"Focus",back:"Previous view",count:"items"},
ar:{title:"الشبكة الحية",desc:"ثمانية عوالم مترابطة في فضاء واحد.",hint:"اسحب · كبّر بإصبعين · المس للاستكشاف",root:"العالم",branch:"فرع",leaf:"مورد",open:"افتح المورد ↗",children:"تفرعات",home:"نظرة عامة",loading:"جارٍ بناء الشبكة…",error:"تعذّر تحميل الشبكة.",focus:"تركيز",back:"المنظور السابق",count:"عنصر"},
pt:{title:"Rede viva",desc:"Oito universos interligados num único espaço vivo.",hint:"ARRASTAR · PINÇA PARA ZOOM · TOCAR PARA EXPLORAR",root:"UNIVERSO",branch:"RAMO",leaf:"RECURSO",open:"Abrir recurso ↗",children:"ramificações",home:"Visão geral",loading:"A expandir a rede…",error:"Não foi possível carregar a rede.",focus:"Focar",back:"Vista anterior",count:"itens"}};
const $=id=>document.getElementById(id),canvas=$("field"),ctx=canvas.getContext("2d",{alpha:true}),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
let lang="fr",tree=[],nodes=[],edges=[],byId=new Map(),selected=null,w=0,h=0,dpr=1,scale=1,targetScale=1,offset={x:0,y:0},targetOffset={x:0,y:0},pointers=new Map(),gesture=null,dragged=false,raf=0,previousView=null;
const t=k=>COPY[lang][k]||COPY.fr[k],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};
function screen(n){return{x:w/2+offset.x+n.x*scale,y:h/2+offset.y+n.y*scale}}
function buildNetwork(){
 nodes=[];edges=[];byId.clear();
 const roots=tree.length,rootRadius=570;
 tree.forEach((root,i)=>{
  const angle=-Math.PI/2+i*Math.PI*2/roots,rx=Math.cos(angle)*rootRadius,ry=Math.sin(angle)*rootRadius;
  const rootNode={id:root.id,title:root.title,x:rx,y:ry,r:12,level:0,data:root,rootId:root.id,parent:null,angle};
  nodes.push(rootNode);byId.set(root.id,rootNode);
  const walk=(data,parent,depth,branchAngle,path)=>{
   const kids=data.children||[];if(!kids.length)return;
   const spread=Math.min(2.45,1.05+Math.log2(kids.length+1)*.42);
   const dist=depth===1?220:depth===2?116:depth===3?67:Math.max(29,47-depth*2);
   kids.forEach((child,j)=>{
    const hsh=hash(child.id),fraction=kids.length===1?0:(j/(kids.length-1)-.5);
    const jitter=((hsh%1000)/1000-.5)*.3;
    const a=branchAngle+fraction*spread+jitter;
    const bend=dist*(.82+((hsh>>>8)%40)/100);
    const x=parent.x+Math.cos(a)*bend,y=parent.y+Math.sin(a)*bend;
    const n={id:child.id,title:child.title,x,y,r:Math.max(2.1,8-depth*1.25),level:depth,data:child,rootId:root.id,parent:parent.id,angle:a};
    nodes.push(n);byId.set(n.id,n);edges.push({a:parent,b:n,depth,seed:hsh});
    walk(child,n,depth+1,a+(fraction*.34)+jitter,path.concat(child.id));
   });
  };
  walk(root,rootNode,1,angle,[]);
 });
 // Inter-universe hyphae form a sparse, biologically plausible mesh.
 tree.forEach((root,i)=>{
  const a=byId.get(root.id),b=byId.get(tree[(i+1)%roots].id);
  if(a&&b)edges.push({a,b,depth:0,cross:true,seed:i*97});
  if(i%2===0){const c=byId.get(tree[(i+3)%roots].id);if(c)edges.push({a,b:c,depth:0,cross:true,seed:i*131});}
 });
 // Anastomoses connect nearby branches at each level without turning the map into a grid.
 const levels=new Map();nodes.filter(n=>n.level>0).forEach(n=>{const k=n.rootId+":"+n.level;if(!levels.has(k))levels.set(k,[]);levels.get(k).push(n)});
 levels.forEach(group=>{group.forEach((n,i)=>{if(i%3===0&&group.length>3){const other=group[(i+2)%group.length];if(n.parent!==other.id&&other.parent!==n.id)edges.push({a:n,b:other,depth:n.level,cross:true,seed:hash(n.id+other.id)});}})});
}
function fitOverview(){const roots=nodes.filter(n=>n.level===0),xs=roots.map(n=>n.x),ys=roots.map(n=>n.y),pad=Math.min(150,Math.max(78,w*.16));targetScale=clamp(Math.min((w-pad*2)/(Math.max(...xs)-Math.min(...xs)+250),(h-pad*2)/(Math.max(...ys)-Math.min(...ys)+250)),.26,.62);targetOffset={x:0,y:0};}
function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(nodes.length){fitOverview();scale=targetScale;offset={...targetOffset};draw();}}
function curve(a,b,seed){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,bend=Math.min(42,len*.14)*(seed%2?1:-1);return{x:(a.x+b.x)/2-dy/len*bend,y:(a.y+b.y)/2+dx/len*bend};}
function strokeFilament(a,b,depth,seed,cross=false){
 const p=screen(a),q=screen(b),c=curve(p,q,seed),len=Math.hypot(q.x-p.x,q.y-p.y);
 ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(c.x,c.y,q.x,q.y);
 const rootColor=PALETTE[a.rootId]||"#91a99b",width=cross? .55:Math.max(.45,(depth===1?1.5:depth===2?1.15:.85)*Math.sqrt(scale));
 if(!cross&&depth<=2&&len>34){ctx.strokeStyle=rootColor+"18";ctx.lineWidth=width*3.4;ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(c.x,c.y,q.x,q.y);}
 ctx.strokeStyle=cross?"#b96b4d35":rootColor+(depth>=3?"55":depth===2?"85":"b0");ctx.lineWidth=width;ctx.lineCap="round";ctx.stroke();
 // Fine lateral hyphae and bifurcating tips.
 if(!cross&&len>24&&depth<5){
  const count=depth===1?5:depth===2?3:2,dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
  for(let i=0;i<count;i++){const u=(i+1)/(count+1),x=(1-u)*(1-u)*p.x+2*(1-u)*u*c.x+u*u*q.x,y=(1-u)*(1-u)*p.y+2*(1-u)*u*c.y+u*u*q.y,side=((seed+i)%2?1:-1),reach=Math.min(30,Math.max(7,len*(.13-(depth*.012))));const ex=x+dx/L*reach*.35+nx*side*reach,ey=y+dy/L*reach*.35+ny*side*reach,mx=(x+ex)/2+nx*side*reach*.2,my=(y+ey)/2+ny*side*reach*.2;
   ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(mx,my,ex,ey);ctx.strokeStyle=rootColor+(depth===1?"70":"48");ctx.lineWidth=Math.max(.38,.78-depth*.08);ctx.stroke();
   if(depth<=2){for(let f=-1;f<=1;f+=2){const tx=ex+dx/L*reach*.2+nx*f*reach*.34,ty=ey+dy/L*reach*.2+ny*f*reach*.34;ctx.beginPath();ctx.moveTo(ex,ey);ctx.quadraticCurveTo((ex+tx)/2+nx*f*4,(ey+ty)/2+ny*f*4,tx,ty);ctx.strokeStyle=rootColor+"50";ctx.lineWidth=.48;ctx.stroke();}}
  }
 }
 return{p,q,c};
}
function levelOpacity(level){const thresholds=[0,.25,.62,1.45,2.8,5.0,7.8];const threshold=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((scale-threshold*.72)/(threshold*.42),0,1);}
function draw(){
 ctx.clearRect(0,0,w,h);
 const bg=ctx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.48,Math.max(w,h)*.78);bg.addColorStop(0,"#1b302c");bg.addColorStop(.58,"#142320");bg.addColorStop(1,"#101719");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 // Fine suspended spores give the field depth without a decorative starfield.
 for(let i=0;i<230;i++){const x=((i*137.51)%w),y=((i*83.71)%h),alpha=i%5===0?"30":"12";ctx.fillStyle=i%7===0?"#b96b4d"+alpha:"#d1d0c5"+alpha;ctx.fillRect(x,y,i%9===0?1.6:1,1);}
 const visibleEdges=edges.filter(e=>levelOpacity(Math.max(e.a.level,e.b.level))>.015);
 visibleEdges.forEach(e=>{const alpha=levelOpacity(Math.max(e.a.level,e.b.level));ctx.globalAlpha=alpha;const c=strokeFilament(e.a,e.b,e.depth,e.seed,e.cross);if(!reduced&&!e.cross&&alpha>.2){const phase=performance.now()*.00012+(e.seed%100)*.013,q=(phase*(e.depth===1? .7:.48))%1,u=1-q,x=u*u*c.p.x+2*u*q*c.c.x+q*q*c.q.x,y=u*u*c.p.y+2*u*q*c.c.y+q*q*c.q.y;ctx.beginPath();ctx.arc(x,y,Math.max(.8,1.2*scale**.15),0,Math.PI*2);ctx.fillStyle="#dce5d9";ctx.fill();}ctx.globalAlpha=1;});
 nodes.forEach(n=>{
  const alpha=levelOpacity(n.level);if(alpha<.015)return;const p=screen(n),r=Math.max(1.25,n.r*Math.sqrt(scale)),color=PALETTE[n.rootId]||"#d1d0c5";ctx.globalAlpha=alpha;
  if(n.level===0||n.level===1){ctx.beginPath();ctx.arc(p.x,p.y,r*3.3,0,Math.PI*2);ctx.fillStyle=color+"12";ctx.fill();}
  // Irregular biological junctions, not geometric UI dots.
  const seed=hash(n.id),lobes=n.level===0?11:n.level===1?7:5;ctx.beginPath();
  for(let k=0;k<=lobes;k++){const a=k/lobes*Math.PI*2,variation=.78+(((seed>>>((k%4)*5))&31)/31)*.42,x=p.x+Math.cos(a)*r*variation,y=p.y+Math.sin(a)*r*variation;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.closePath();ctx.fillStyle="#111b1d";ctx.strokeStyle=color+(n.level===0?"e0":n.level===1?"b0":"70");ctx.lineWidth=n.level===0?1.6:.9;ctx.fill();ctx.stroke();
  if(selected?.id===n.id){ctx.beginPath();ctx.arc(p.x,p.y,r+7+Math.min(5,scale),0,Math.PI*2);ctx.strokeStyle="#e4e7dd";ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.stroke();ctx.setLineDash([]);}
  const show=n.level===0||alpha>.5&&scale>(n.level===1? .58:n.level===2?1.15:n.level===3?2.35:4.1)||selected?.id===n.id;
  if(show){const font=clamp((n.level===0?12:10)*Math.sqrt(scale),8,14);ctx.font=(n.level===0?"650 ":"500 ")+font+"px system-ui";ctx.textAlign="center";ctx.textBaseline="top";ctx.lineWidth=3;ctx.strokeStyle="#111b1df0";ctx.strokeText(n.title,p.x,p.y+r+5,190);ctx.fillStyle=n.level===0?"#e4e7dd":"#c5d0c7";ctx.fillText(n.title,p.x,p.y+r+5,190);}
  ctx.globalAlpha=1;
 });
}
function focusNode(n,zoomTo){if(!n)return;previousView={scale:targetScale,offset:{...targetOffset}};const z=zoomTo??(n.level===0?1.05:n.level===1?1.65:n.level===2?2.8:n.level===3?4.5:6.2);targetScale=clamp(z,.3,12);targetOffset={x:-n.x*targetScale,y:-n.y*targetScale};selected=n;updateSelection();draw();}
function hit(x,y){let found=null,best=22;for(const n of nodes){if(levelOpacity(n.level)<.12)continue;const p=screen(n),d=Math.hypot(p.x-x,p.y-y),limit=Math.max(best,n.r*Math.sqrt(scale)+7);if(d<limit){best=d;found=n;}}return found;}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function updateSelection(){const box=$("selection");box.replaceChildren();if(!selected){renderAccessible();return;}const n=selected,data=n.data,card=el("div","card"),body=el("div","card-body"),badge=el("span","badge badge-outline",n.level===0?t("root"):data.children?.length?t("branch"):t("leaf")),title=el("h2","card-title",n.title),desc=el("p","",data.description||((data.children?.length||0)+" "+t("children")));const meta=el("small","",n.level+" / "+t("count"));const actions=el("div","card-actions");const focus=el("button","btn btn-primary btn-sm",t("focus"));focus.onclick=()=>focusNode(n);actions.append(focus);if(data.url){const a=el("a","btn btn-outline btn-sm",t("open"));a.href=data.url;a.target="_blank";a.rel="noopener noreferrer";actions.append(a);}body.append(badge,title,desc,meta,actions);card.append(body);box.append(card);renderAccessible();}
function renderAccessible(){const nav=$("accessibleNodes");nav.replaceChildren();nodes.filter(n=>levelOpacity(n.level)>.15).forEach(n=>{const b=el("button","",n.title);b.onclick=()=>focusNode(n);nav.append(b);});}
function updateUI(){document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";$("heading").textContent=t("title");$("description").textContent=t("desc");$("hint").textContent=t("hint");$("kicker").textContent=t("home");$("language").value=lang;document.title="BA Labs — "+t("title");}
function zoom(f,x=w/2,y=h/2){const next=clamp(targetScale*f,.26,12),ratio=next/targetScale;targetOffset.x=(x-w/2)-(x-w/2-targetOffset.x)*ratio;targetOffset.y=(y-h/2)-(y-h/2-targetOffset.y)*ratio;targetScale=next;if(reduced){scale=targetScale;offset={...targetOffset};draw();renderAccessible();}}
function pointerDown(e){canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;gesture={x:e.clientX,y:e.clientY,ox:targetOffset.x,oy:targetOffset.y};canvas.classList.add("dragging");}
function pointerMove(e){if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&gesture){const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){targetOffset.x=gesture.ox+dx;targetOffset.y=gesture.oy+dy;if(reduced){offset={...targetOffset};draw();}}}else if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(!pointerMove.last)pointerMove.last=d;const rect=canvas.getBoundingClientRect();zoom(d/pointerMove.last,(p[0].x+p[1].x)/2-rect.left,(p[0].y+p[1].y)/2-rect.top);pointerMove.last=d;dragged=true;}}
function pointerUp(e){pointers.delete(e.pointerId);canvas.classList.remove("dragging");if(!pointers.size){if(!dragged){const r=canvas.getBoundingClientRect(),n=hit(e.clientX-r.left,e.clientY-r.top);if(n)focusNode(n);}gesture=null;pointerMove.last=0;}else if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,ox:targetOffset.x,oy:targetOffset.y};pointerMove.last=0;dragged=true;}}
canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerUp);
canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.16:.86,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$("zoomIn").onclick=()=>zoom(1.25);$("zoomOut").onclick=()=>zoom(.8);$("reset").onclick=()=>{fitOverview();selected=null;updateSelection();if(reduced){scale=targetScale;offset={...targetOffset};}draw();};$("back").onclick=()=>{if(previousView){targetScale=previousView.scale;targetOffset={...previousView.offset};previousView=null;if(reduced){scale=targetScale;offset={...targetOffset};draw();}}else{$("reset").click();}};
$("language").onchange=e=>{const l=e.target.value;if(!LANGS.includes(l))return;lang=l;$("loading").hidden=false;try{localStorage.setItem("balabs-language",l);}catch(_){}loadTree();};
window.addEventListener("resize",resize,{passive:true});
function animate(){if(!reduced){scale+=(targetScale-scale)*.12;offset.x+=(targetOffset.x-offset.x)*.12;offset.y+=(targetOffset.y-offset.y)*.12;draw();}raf=requestAnimationFrame(animate);}
async function loadTree(){try{const res=await fetch("./notion-tree."+lang+".json",{cache:"no-cache"});if(!res.ok)throw Error("Tree HTTP "+res.status);const data=await res.json();tree=data.domains||[];if(tree.length!==8)throw Error("Expected 8 universes; received "+tree.length);buildNetwork();fitOverview();scale=targetScale;offset={...targetOffset};selected=null;updateUI();updateSelection();draw();$("loading").hidden=true;}catch(e){console.error(e);$("loading").querySelector("p").textContent=t("error");}}
async function init(){let l=new URLSearchParams(location.search).get("lang");try{if(!LANGS.includes(l))l=localStorage.getItem("balabs-language");}catch(_){}lang=LANGS.includes(l)?l:"fr";resize();await loadTree();if(!reduced)raf=requestAnimationFrame(animate);}
init();