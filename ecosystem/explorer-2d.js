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
  // A living trunk replaces the radial star: children emerge from staggered
  // attachment points, alternating sides with deterministic organic variation.
  const anchors=[];
  const span=Math.max(1,count-1);
  const startX=-245,step=count>6?86:count>3?112:138;
  kids.forEach((d,i)=>{
   const side=i%2===0?-1:1;
   const phase=(i+1)*1.73;
   const wave=Math.sin(phase)*24;
   const trunkX=startX+i*step;
   // The trunk itself meanders gently; attachment points are not on a ruler.
   const anchor={x:trunkX,y:Math.sin(i*.91)*25+Math.cos(i*.47)*9,r:0};
   anchors.push(anchor);
   const reach=104+((i*53+count*19)%88)+(d.children?.length?28:0);
   const lateral=34+((i*29+count*11)%54);
   const sweep=Math.sin(phase*.83)*31;
   const y=anchor.y+side*(reach+wave);
   const x=trunkX+lateral+sweep;
   const n={id:d.id,title:d.title,x,y,r:d.children?.length?6.5:4.5,level:1,data:d,rootId:parent.rootId};
   nodes.push(n);
   edges.push({a:anchor,b:n,i:i+10,density:Math.min(1,(d.children?.length||0)/8)});
  });
  // Reveal a restrained preview of the next generation before entering a branch.
  kids.forEach((d,i)=>{
   const base=nodes[i+1],grand=(d.children||[]).slice(0,4),side=i%2===0?-1:1;
   grand.forEach((g,j)=>{
    const fan=(j-(grand.length-1)/2)*.72;
    const angle=side<0?(-Math.PI/2+fan):(Math.PI/2+fan);
    const length=48+((i*31+j*23+grand.length*7)%38);
    const tip={id:g.id,title:g.title,x:base.x+Math.cos(angle)*length,y:base.y+Math.sin(angle)*length,r:2.7,level:2,data:g,rootId:parent.rootId};
    nodes.push(tip);edges.push({a:base,b:tip,i:100+i*5+j,tertiary:true});
   });
  });
  // The main hypha runs through the attachment points; it is deliberately
  // segmented and slightly irregular rather than a straight diagram line.
  if(anchors.length){
   edges.push({a:parent,b:anchors[0],i:0});
   for(let i=1;i<anchors.length;i++){
    const mid={x:(anchors[i-1].x+anchors[i].x)/2,y:(anchors[i-1].y+anchors[i].y)/2+Math.sin(i*1.2)*8,r:0};
    edges.push({a:anchors[i-1],b:mid,i:i+1},{a:mid,b:anchors[i],i:i+2});
  }
  }
  // Anastomoses connect non-adjacent branches into a resilient mycelial mesh.
  const kidsOnly=nodes.filter(n=>n.level===1);
  kidsOnly.forEach((n,i)=>{
   if(count>2&&i%2===0)edges.push({a:n,b:kidsOnly[(i+1)%count],i:i+40,cross:true});
   if(count>4&&i%3===0)edges.push({a:n,b:kidsOnly[(i+3)%count],i:i+70,cross:true});
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
  const density=e.density??.45;
  const mainWidth=e.cross?.7:e.tertiary?.48:1.05+density*.62;
  ctx.lineCap="round";ctx.lineJoin="round";
  if(!e.cross&&!e.tertiary&&density>.62){
   ctx.strokeStyle=(PALETTE[e.a.rootId]||"#78958a")+"20";ctx.lineWidth=mainWidth*3.1;ctx.stroke();
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cx,cy,b.x,b.y);
  }
  ctx.strokeStyle=e.cross?"#b96b4d38":(PALETTE[e.a.rootId]||"#78958a")+(e.tertiary?"66":density>.72?"c0":"88");
  ctx.lineWidth=mainWidth;ctx.stroke();
  // Branching hyphae: primary filaments produce tapered-looking lateral growth,
  // then split into two fine tips. Seeded by edge index so the network stays stable.
  if(!e.cross&&!e.tertiary&&len>85){
   const nx=-dy/len,ny=dx/len;
   const density=e.density??.45;
   const marks=density>.72?[.19,.37,.55,.73,.9]:density>.38?[.27,.57,.82]:[.38,.76];
   marks.forEach((t,j)=>{
    const u=1-t,px=u*u*a.x+2*u*t*cx+t*t*b.x,py=u*u*a.y+2*u*t*cy+t*t*b.y;
    const side=((e.i+j)%2?1:-1),reach=Math.min(48,Math.max(13,len*(.09+(j%2)*.025)))*(density<.38?.78:1);
    const ex=px+dx/len*reach*.58+nx*side*reach*.82,ey=py+dy/len*reach*.58+ny*side*reach*.82;
    const mx=(px+ex)/2+nx*side*reach*.18,my=(py+ey)/2+ny*side*reach*.18;
    ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(mx,my,ex,ey);
    ctx.strokeStyle=density>.72?"#b9c8b788":"#9db5a05c";ctx.lineWidth=density>.72?.86:.68;ctx.stroke();
    const tip=reach*.34;
    [-1,1].forEach(fork=>{
     const tx=ex+dx/len*tip*.28+nx*fork*tip*.72,ty=ey+dy/len*tip*.28+ny*fork*tip*.72;
     ctx.beginPath();ctx.moveTo(ex,ey);ctx.quadraticCurveTo(ex+nx*fork*tip*.35,ey+ny*fork*tip*.35,tx,ty);
     ctx.strokeStyle="#9db5a044";ctx.lineWidth=.48;ctx.stroke();
    });
   });
   if(density>.72){
    [.31,.66].forEach((t,j)=>{
     const u=1-t,px=u*u*a.x+2*u*t*cx+t*t*b.x,py=u*u*a.y+2*u*t*cy+t*t*b.y;
     const side=((e.i+j)%2?1:-1),reach=12+((e.i+j*7)%9);
     ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px+nx*side*reach*.55,py+ny*side*reach*.55,px+dx/len*reach*.42+nx*side*reach,py+dy/len*reach*.42+ny*side*reach);
     ctx.strokeStyle="#b9c8b766";ctx.lineWidth=.55;ctx.stroke();
    });
   }
  }
  curves.push({a,b,cx,cy,e});
 });
 if(!reduced){
  const time=performance.now()*.00012;
  curves.forEach((c,i)=>{
   if(c.e.cross)return;
   const density=c.e.density??(c.e.tertiary?.25:.45);
   const count=c.e.tertiary?1:density>.72?3:density>.38?2:1;
   for(let p=0;p<count;p++){
    const speed=c.e.tertiary?.48:.62+density*.22;
    const q=(time*speed+i*.173+p/count)%1,u=1-q;
    const x=u*u*c.a.x+2*u*q*c.cx+q*q*c.b.x,y=u*u*c.a.y+2*u*q*c.cy+q*q*c.b.y;
    const tx=2*u*(c.cx-c.a.x)+2*q*(c.b.x-c.cx),ty=2*u*(c.cy-c.a.y)+2*q*(c.b.y-c.cy),angle=Math.atan2(ty,tx),tail=5+2*density;
    ctx.beginPath();ctx.moveTo(x-Math.cos(angle)*tail,y-Math.sin(angle)*tail);ctx.lineTo(x,y);
    ctx.strokeStyle=c.e.tertiary?"#d1d0c544":"#d1d0c588";ctx.lineWidth=c.e.tertiary?.7:1;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,c.e.tertiary?1:1.25,0,Math.PI*2);ctx.fillStyle=c.e.tertiary?"#c5d0c7aa":"#e1e4d8dd";ctx.fill();
   }
  });
 }
 nodes.forEach(n=>{const p=screen(n),r=Math.max(2.2,n.r*Math.sqrt(scale)),color=PALETTE[n.rootId]||"#d1d0c5";
   // Organic junction: a deterministic, softly lobed outline instead of a perfect circle.
   let seed=0;for(let k=0;k<n.id.length;k++)seed=(seed*31+n.id.charCodeAt(k))>>>0;
   const lobes=n.level===0?9:n.level===1?7:5,pts=[];
   for(let k=0;k<lobes;k++){const a=k/lobes*Math.PI*2,variation=.78+(((seed>>>((k%4)*5))&31)/31)*.38;pts.push({x:p.x+Math.cos(a)*r*variation,y:p.y+Math.sin(a)*r*variation});}
   ctx.beginPath();
   pts.forEach((q,k)=>{const next=pts[(k+1)%pts.length],mx=(q.x+next.x)/2,my=(q.y+next.y)/2;if(k===0)ctx.moveTo(mx,my);ctx.quadraticCurveTo(q.x,q.y,mx,my);});
   ctx.closePath();ctx.strokeStyle=color+"42";ctx.lineWidth=n.level===2?.8:1.2;ctx.stroke();
   ctx.fillStyle="#111b1d";ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=n.level===2?.9:1.45;ctx.stroke();
   if(n.level===0||n.level===1&&n.data?.children?.length>4){
    ctx.beginPath();ctx.arc(p.x-r*.12,p.y-r*.08,Math.max(.8,r*.23),0,Math.PI*2);ctx.fillStyle=color+"aa";ctx.fill();
   }
   if(selected?.id===n.id){ctx.beginPath();ctx.arc(p.x,p.y,r+10,0,Math.PI*2);ctx.setLineDash([2,4]);ctx.strokeStyle="#d1d0c5";ctx.stroke();ctx.setLineDash([])}
  // Labels follow camera zoom, with a readable minimum and a restrained maximum.
  // At overview scale, hide secondary labels to prevent collisions; selected nodes remain named.
  const showLabel=n.level===0||scale>=.68||selected?.id===n.id;
  if(showLabel){
   const font=clamp((n.level===0?12:11)*Math.sqrt(scale),8,14);
   ctx.font=(n.level===0?"600 ":"500 ")+font.toFixed(1)+"px system-ui";
   ctx.textAlign="center";ctx.textBaseline="top";ctx.lineWidth=3;ctx.strokeStyle="#111b1df2";
   if(n.level<2||selected?.id===n.id){ctx.strokeText(n.title,p.x,p.y+r+7,220);ctx.fillStyle=n.level===0?"#e3e7dd":"#c5d0c7";ctx.fillText(n.title,p.x,p.y+r+7,220);}
   if(n.data?.children?.length&&scale>=.82){ctx.font=clamp(9*Math.sqrt(scale),8,10)+"px system-ui";ctx.fillStyle="#8fa498";ctx.fillText(n.data.children.length+" "+t("children"),p.x,p.y+r+22,200)}
  }
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