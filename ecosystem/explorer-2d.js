const LANGS=["fr","en","ar","pt"],PALETTE={bio:"#79a991",myco:"#b18fc2",soil:"#c19b73",lab:"#80aeb8",products:"#c88773",iot:"#7eaaa3",work:"#aa9cbb",learn:"#b5b58d"};
const COPY={
fr:{title:"Réseau vivant",desc:"Huit univers, une structure interconnectée. Sélectionne un nœud pour voir ses branches.",hint:"GLISSER · PINCER POUR ZOOMER · SÉLECTIONNER UN NŒUD",root:"UNIVERS",branch:"BRANCHE",leaf:"RESSOURCE",explore:"Explorer cette branche",open:"Ouvrir dans Notion ↗",children:"sous-branches",home:"Huit univers",loading:"Chargement du réseau…",error:"Impossible de charger le réseau.",overview:"Vue d’ensemble",back:"Retour"},
en:{title:"Living network",desc:"Eight universes, one interconnected structure. Select a node to inspect its branches.",hint:"DRAG · PINCH TO ZOOM · SELECT A NODE",root:"UNIVERSE",branch:"BRANCH",leaf:"RESOURCE",explore:"Explore this branch",open:"Open in Notion ↗",children:"sub-branches",home:"Eight universes",loading:"Loading network…",error:"Could not load the network.",overview:"Overview",back:"Back"},
ar:{title:"الشبكة الحية",desc:"ثمانية عوالم في بنية مترابطة. اختر عقدة لاستكشاف فروعها.",hint:"اسحب · كبّر بإصبعين · اختر عقدة",root:"العالم",branch:"فرع",leaf:"مورد",explore:"استكشف هذا الفرع",open:"افتح في Notion ↗",children:"فروع فرعية",home:"العوالم الثمانية",loading:"جارٍ تحميل الشبكة…",error:"تعذّر تحميل الشبكة.",overview:"نظرة عامة",back:"رجوع"},
pt:{title:"Rede viva",desc:"Oito universos, uma estrutura interligada. Selecione um nó para explorar os seus ramos.",hint:"ARRASTAR · PINÇA PARA ZOOM · SELECIONAR UM NÓ",root:"UNIVERSO",branch:"RAMO",leaf:"RECURSO",explore:"Explorar este ramo",open:"Abrir no Notion ↗",children:"sub-ramos",home:"Oito universos",loading:"A carregar a rede…",error:"Não foi possível carregar a rede.",overview:"Visão geral",back:"Voltar"}};
const $=id=>document.getElementById(id),canvas=$("field"),ctx=canvas.getContext("2d",{alpha:true}),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
let lang="fr",tree=[],current=null,trail=[],nodes=[],edges=[],selected=null,w=0,h=0,dpr=1,scale=1,targetScale=1,offset={x:0,y:0},targetOffset={x:0,y:0},particles=[],pointers=new Map(),gesture=null,dragged=false,raf=0;
const t=k=>COPY[lang][k]||COPY.fr[k],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);layout(true)}
function screen(n){return{x:w/2+offset.x+n.x*scale,y:h/2+offset.y+n.y*scale}}
function layout(initial=false){
 nodes=[];edges=[];
 if(!current){
  const pos=[[-520,-190],[-180,-340],[220,-330],[540,-90],[440,260],[60,360],[-360,280],[-570,35]];
  tree.forEach((d,i)=>nodes.push({id:d.id,title:d.title,x:pos[i][0],y:pos[i][1],r:7,level:0,data:d,rootId:d.id}));
  const pairs=[["bio","myco"],["myco","soil"],["soil","lab"],["lab","iot"],["lab","products"],["products","work"],["work","iot"],["products","learn"],["bio","lab"],["myco","products"],["soil","work"],["bio","iot"],["myco","learn"],["soil","products"]];
  pairs.forEach(([a,b],i)=>{const A=nodes.find(n=>n.id===a),B=nodes.find(n=>n.id===b);if(A&&B)edges.push({a:A,b:B,i,cross:true})});
 }else{
  const parent={id:current.id,title:current.title,x:0,y:0,r:9,level:0,data:current,rootId:trail[0].id};nodes.push(parent);
  const kids=current.children||[],count=kids.length;
  // Uneven radial growth: branches occupy different lengths instead of a perfect ring.
  kids.forEach((d,i)=>{
   const angle=-Math.PI/2+i*2*Math.PI/Math.max(1,count)+(i%2?-.09:.07);
   const radius=190+((i*67+count*23)%145)+(d.children?.length?24:0);
   const n={id:d.id,title:d.title,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius*.78,r:d.children?.length?6.5:4.5,level:1,data:d,rootId:parent.rootId};
   nodes.push(n);edges.push({a:parent,b:n,i});
  });
  // Anastomoses between neighbouring branches form a mesh, not isolated spokes.
  const kidsOnly=nodes.slice(1);
  kidsOnly.forEach((n,i)=>{
   if(count>2)edges.push({a:n,b:kidsOnly[(i+1)%count],i:i+40,cross:true});
   if(count>4&&i%2===0)edges.push({a:n,b:kidsOnly[(i+3)%count],i:i+70,cross:true});
  });
 }
 if(initial){fit();scale=targetScale;offset={...targetOffset}}
 updateUI();draw();
}
function fit(){const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const pad=w<650?100:160;targetScale=clamp(Math.min((w-pad*2)/Math.max(1,maxX-minX),(h-pad*2)/Math.max(1,maxY-minY)),.4,1.05);targetOffset={x:-(minX+maxX)/2*targetScale,y:-(minY+maxY)/2*targetScale};}
function draw(){
 ctx.clearRect(0,0,w,h);
 for(let i=0;i<42;i++){const x=(i*137.5)%w,y=(i*83.7)%h;ctx.fillStyle=i%4===0?"#b96b4d20":"#d1d0c510";ctx.fillRect(x,y,1,1)}
 const curves=[];
 edges.forEach(e=>{
  const a=screen(e.a),b=screen(e.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  const bend=Math.min(42,len*.17)*(e.i%2?1:-1),cx=(a.x+b.x)/2-dy/len*bend,cy=(a.y+b.y)/2+dx/len*bend;
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cx,cy,b.x,b.y);
  ctx.strokeStyle=e.cross?"#b96b4d38":(PALETTE[e.a.rootId]||"#78958a")+"88";ctx.lineWidth=e.cross?.75:1.05;ctx.stroke();
  // Fine lateral hyphae branch off the main filament at two points.
  if(!e.cross&&len>70){
   [.34,.68].forEach((t,j)=>{
    const u=1-t,px=u*u*a.x+2*u*t*cx+t*t*b.x,py=u*u*a.y+2*u*t*cy+t*t*b.y;
    const side=(e.i+j)%2?1:-1,reach=Math.min(19,len*.09);
    ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px-dy/len*reach*side*.55,py+dx/len*reach*side*.55,px-dy/len*reach*side,py+dx/len*reach*side);
    ctx.strokeStyle="#9db5a044";ctx.lineWidth=.65;ctx.stroke();
   });
  }
  curves.push({a,b,cx,cy,e});
 });
 if(!reduced)curves.forEach((c,i)=>{const q=(performance.now()*.000025+i*.19)%1,u=1-q,x=u*u*c.a.x+2*u*q*c.cx+q*q*c.b.x,y=u*u*c.a.y+2*u*q*c.cy+q*q*c.b.y;ctx.beginPath();ctx.arc(x,y,1.4,0,Math.PI*2);ctx.fillStyle="#d1d0c5aa";ctx.fill()});
 nodes.forEach(n=>{const p=screen(n),r=Math.max(3,n.r*Math.sqrt(scale)),color=PALETTE[n.rootId]||"#d1d0c5";ctx.beginPath();ctx.arc(p.x,p.y,r+5,0,Math.PI*2);ctx.strokeStyle=color+"44";ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle="#111b1d";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();if(selected?.id===n.id){ctx.beginPath();ctx.arc(p.x,p.y,r+10,0,Math.PI*2);ctx.setLineDash([2,4]);ctx.strokeStyle="#d1d0c5";ctx.stroke();ctx.setLineDash([])}
  // Labels are screen-space text: font size is deliberately independent of camera zoom.
  ctx.font=n.level===0?"600 12px system-ui":"500 11px system-ui";ctx.textAlign="center";ctx.textBaseline="top";ctx.lineWidth=3;ctx.strokeStyle="#111b1df2";ctx.strokeText(n.title,p.x,p.y+r+7,230);ctx.fillStyle=n.level===0?"#e3e7dd":"#c5d0c7";ctx.fillText(n.title,p.x,p.y+r+7,230);
  if(n.data?.children?.length){ctx.font="9px system-ui";ctx.fillStyle="#8fa498";ctx.fillText(n.data.children.length+" "+t("children"),p.x,p.y+r+22,210)}
 });
}
function animate(){if(!reduced){scale+=(targetScale-scale)*.14;offset.x+=(targetOffset.x-offset.x)*.14;offset.y+=(targetOffset.y-offset.y)*.14;draw()}raf=requestAnimationFrame(animate)}
function hit(x,y){let found=null,best=26;nodes.forEach(n=>{const p=screen(n),d=Math.hypot(p.x-x,p.y-y);if(d<best){best=d;found=n}});return found}
function element(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
function select(n){selected=n;const box=$("selection");box.replaceChildren();if(!n){renderAccessible();draw();return;}const data=n.data,has=!!data?.children?.length,card=element("div","card"),body=element("div","card-body"),badge=element("span","badge badge-outline",n.level===0?t("root"):has?t("branch"):t("leaf")),title=element("h2","card-title",n.title),desc=element("p","",data.description||"");if(!desc.textContent)desc.textContent=has?(data.children.length+" "+t("children")):t("leaf");const actions=element("div","card-actions");if(has){const b=element("button","btn btn-primary btn-sm",t("explore"));b.onclick=()=>enter(data);actions.append(b)}if(data.url){const a=element("a","btn btn-outline btn-sm",t("open"));a.href=data.url;a.target="_blank";a.rel="noopener noreferrer";actions.append(a)}body.append(badge,title,desc,actions);card.append(body);box.append(card);renderAccessible();draw()}
function renderAccessible(){const nav=$("accessibleNodes");nav.replaceChildren();nodes.forEach(n=>{const b=element("button","",n.title);b.onclick=()=>select(n);nav.append(b)})}
function crumbs(){const ul=$("crumbs");ul.replaceChildren();const add=(label,fn)=>{const li=element("li"),b=fn?element("button","link link-hover",label):element("span","",label);if(fn)b.onclick=fn;li.append(b);ul.append(li)};add(t("overview"),()=>home());trail.forEach((n,i)=>add(n.title,()=>{trail=trail.slice(0,i+1);current=n;selected=n;layout(true)}))}
function updateUI(){const langSelect=$("language");langSelect.value=lang;document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";$("heading").textContent=current?.title||t("title");$("description").textContent=current?.description||t("desc");$("hint").textContent=t("hint");$("kicker").textContent=current?(t("branch")+" / "+(trail.length+1)):t("overview");$("back").disabled=!current;$("back3d").href="./index.html?lang="+lang+"#universe";document.title="BA Labs — "+t("title");crumbs();select(selected)}
function enter(data){if(!data.children?.length)return;trail.push(data);current=data;selected={id:data.id,title:data.title,data,rootId:trail[0].id,level:0};layout(true)}
function home(){trail=[];current=null;selected=null;layout(true)}
function back(){if(trail.length>1){trail.pop();current=trail[trail.length-1];selected={id:current.id,title:current.title,data:current,rootId:trail[0].id,level:0};layout(true)}else home()}
function language(l){if(!LANGS.includes(l))return;lang=l;try{localStorage.setItem("balabs-language",l)}catch(_){}const dataUrl="./notion-tree."+lang+".json";fetch(dataUrl,{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(d=>{tree=d.domains||[];home()}).catch(console.error)}
function zoom(f,x=w/2,y=h/2){const next=clamp(targetScale*f,.35,2.2),ratio=next/targetScale;targetOffset.x=(x-w/2)-(x-w/2-targetOffset.x)*ratio;targetOffset.y=(y-h/2)-(y-h/2-targetOffset.y)*ratio;targetScale=next;if(reduced){scale=targetScale;offset={...targetOffset};draw()}}
function pointerDown(e){canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragged=false;gesture={x:e.clientX,y:e.clientY,ox:targetOffset.x,oy:targetOffset.y};canvas.classList.add("dragging")}
function pointerMove(e){if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&gesture){const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;if(dragged){targetOffset.x=gesture.ox+dx;targetOffset.y=gesture.oy+dy;if(reduced){offset={...targetOffset};draw()}}}else if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(!pointerMove.last)pointerMove.last=d;const rect=canvas.getBoundingClientRect();zoom(d/pointerMove.last,(p[0].x+p[1].x)/2-rect.left,(p[0].y+p[1].y)/2-rect.top);pointerMove.last=d;dragged=true}}
function pointerUp(e){pointers.delete(e.pointerId);canvas.classList.remove("dragging");if(!pointers.size){if(!dragged){const r=canvas.getBoundingClientRect(),n=hit(e.clientX-r.left,e.clientY-r.top);if(n)select(n)}gesture=null;pointerMove.last=0}else if(pointers.size===1){const p=[...pointers.values()][0];gesture={x:p.x,y:p.y,ox:targetOffset.x,oy:targetOffset.y};pointerMove.last=0;dragged=true}}
canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointermove",pointerMove);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerUp);canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.12:.89,e.clientX-r.left,e.clientY-r.top)},{passive:false});
$("zoomIn").onclick=()=>zoom(1.2);$("zoomOut").onclick=()=>zoom(.83);$("reset").onclick=()=>{fit();if(reduced){scale=targetScale;offset={...targetOffset}}draw()};$("back").onclick=back;$("language").onchange=e=>language(e.target.value);
window.addEventListener("resize",resize,{passive:true});
async function init(){try{const params=new URLSearchParams(location.search);let l=params.get("lang");try{if(!LANGS.includes(l))l=localStorage.getItem("balabs-language")}catch(_){}if(!LANGS.includes(l))l="fr";lang=l;const res=await fetch("./notion-tree."+lang+".json",{cache:"no-cache"});if(!res.ok)throw Error("Tree HTTP "+res.status);const data=await res.json();tree=data.domains||[];if(tree.length!==8)throw Error("Expected 8 universes; received "+tree.length);resize();$("loading").hidden=true;if(!reduced)raf=requestAnimationFrame(animate)}catch(e){console.error(e);$("loading").querySelector("p").textContent=t("error")}}
init();