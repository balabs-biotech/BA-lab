import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PALETTE={bio:0x79a991,myco:0xb18fc2,publicCore:0xb96b4d,soil:0xc19b73,lab:0x80aeb8,products:0xc88773,iot:0x7eaaa3,work:0xaa9cbb,evidence:0xb5b58d};
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};

export async function createPixiRenderer(canvas){
 const app=new Application();
 await app.init({canvas,backgroundAlpha:0,antialias:true,autoDensity:true,resolution:Math.min(window.devicePixelRatio||1,1.75),powerPreference:"high-performance",preference:"webgl",clearBeforeRender:true,autoStart:false});
 app.stage.eventMode="none";
 canvas.dataset.renderer="pixijs-webgl";
 const field=new Graphics(),filaments=new Graphics(),junctions=new Graphics(),labels=new Container();
 app.stage.addChild(field,filaments,junctions,labels);
 const labelPool=new Map();
 const style=new TextStyle({fontFamily:"Inter, system-ui, sans-serif",fontSize:12,fill:0xe4e7dd,fontWeight:"500",stroke:{color:0x111b1d,width:3},align:"center"});
 let lastWidth=0,lastHeight=0;
 function resize(width,height){lastWidth=width;lastHeight=height;app.renderer.resize(width,height);}
 const alphaFor=level=>{const thresholds=[0,.10,.16,.24,.4,.7,1.1],t=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((cameraScale-t*.72)/(t*.42),0,1);};
 let cameraScale=1;
 function render({nodes,edges,selected,hovered=null,scale,offset,width,height,reduced,lang="fr",time=performance.now()}){
  cameraScale=scale;
  field.clear().rect(0,0,width,height).fill({color:0x111b1d});
  field.circle(width*.5,height*.48,Math.max(width,height)*.78).fill({color:0x172925,alpha:.35});
  for(let i=0;i<110;i++){const x=(i*137.51)%width,y=(i*83.71)%height;field.circle(x,y,i%9===0?1.1:.6).fill({color:i%7===0?0xb96b4d:0xd1d0c5,alpha:i%5===0?.16:.055});}
  filaments.clear();junctions.clear();
  const point=n=>({x:n.x,y:n.y});
  const branchParents=new Set(edges.filter(e=>!e.cross).map(e=>e.a.id));
  const terminalIds=new Set(nodes.filter(n=>n.level>0&&!branchParents.has(n.id)).map(n=>n.id));
  const bezierPoint=(a,c1,c2,b,t)=>{const u=1-t;return{x:u*u*u*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*b.y};};
  const drawnTrunks=new Set();
  for(const edge of edges){
   if(!edge.branchPoint||drawnTrunks.has(edge.a.id))continue;
   drawnTrunks.add(edge.a.id);
   const parent=edge.a,p=edge.branchPoint,dx=p.x-parent.x,dy=p.y-parent.y,len=Math.hypot(dx,dy)||1;
   const seed=(edge.seed??hash(parent.id))>>>0,side=(seed&1)?1:-1;
   const bend=Math.min(24,len*.22)*side;
   const c1={x:parent.x+dx*.34-dy/len*bend,y:parent.y+dy*.34+dx/len*bend};
   const c2={x:p.x-dx*.32+dy/len*bend*.55,y:p.y-dy*.32-dx/len*bend*.55};
   const color=PALETTE[edge.b.colorKey||edge.a.colorKey]||0x91a99b;
   filaments.moveTo(parent.x,parent.y).bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p.x,p.y).stroke({color,alpha:alphaFor(parent.level+1)*.82,width:parent.level===0?2.15:parent.level===1?1.45:1.02,cap:"round"});
  }
  for(const e of edges){
   const selectedRelation=!!selected&&(e.a.id===selected.id||e.b.id===selected.id);
   if(e.cross&&!selectedRelation&&scale<3)continue;
   const depth=Math.max(e.a.level,e.b.level),alpha=alphaFor(depth);if(alpha<.015)continue;
   const a=e.branchPoint?{x:e.branchPoint.x,y:e.branchPoint.y}:point(e.a),b=point(e.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const seed=(e.seed??hash(e.a.id+e.b.id))>>>0,side=(seed&1)?1:-1;
   const bendLimit=e.primaryHypha?Math.min(210,len*.36):e.cross?Math.min(150,len*.31):Math.min(112,len*.29);
   const bendA=bendLimit*side*(.48+((seed>>>5)&63)/110),bendB=bendLimit*(-side)*(.22+((seed>>>13)&63)/150);
   const driftA=(((seed>>>12)&255)/255-.5)*Math.min(58,len*.18),driftB=(((seed>>>20)&255)/255-.5)*Math.min(48,len*.15);
   let c1={x:a.x+dx*.31-dy/len*bendA+dx/len*driftA,y:a.y+dy*.31+dx/len*bendA+dy/len*driftA};
   let c2={x:b.x-dx*.31-dy/len*bendB+dx/len*driftB,y:b.y-dy*.31+dx/len*bendB+dy/len*driftB};
   if(e.hyphaPath?.length===2){c1=e.hyphaPath[0];c2=e.hyphaPath[1];}
   const generation=e.generation??Math.max(e.a.level,e.b.level),color=PALETTE[e.b.colorKey||e.a.colorKey||e.b.rootId||e.a.rootId]||0x91a99b,hot=!!hovered&&(e.a.id===hovered.id||e.b.id===hovered.id),widthBase=(e.verified?1.15:e.cross?.55:e.primaryHypha?2.35:generation<=2?1.55:generation===3?1.12:Math.max(.42,.78-generation*.055))*(hot?1.55:1);
   const terminalTip=!e.cross&&terminalIds.has(e.b.id);
   const strokeColor=hot?0xe4e7dd:e.verified?(e.basis==="notion-link"?0xb96b4d:0x7eaaa3):e.cross?0xb96b4d:color;
   const strokeAlpha=hot?Math.max(.88,alpha):e.cross?(selectedRelation?.78:.13)*alpha:alpha*(depth>=3?.42:depth===2?.62:.78);
   if(hot)filaments.moveTo(a.x,a.y).bezierCurveTo(c1.x,c1.y,c2.x,c2.y,b.x,b.y).stroke({color:0xb96b4d,alpha:.16,width:widthBase*4.2,cap:"round"});
   if(terminalTip){
    // Taper the final hypha progressively; no terminal bead is drawn.
    const cuts=[0,.48,.72,.88,1],widths=[widthBase,widthBase*.82,widthBase*.58,widthBase*.30,.06];
    for(let s=0;s<cuts.length-1;s++){
     const p0=bezierPoint(a,c1,c2,b,cuts[s]),p1=bezierPoint(a,c1,c2,b,cuts[s+1]);
     const midT=(cuts[s]+cuts[s+1])*.5,mid=bezierPoint(a,c1,c2,b,midT);
     filaments.moveTo(p0.x,p0.y).bezierCurveTo(p0.x+(mid.x-p0.x)*1.35,p0.y+(mid.y-p0.y)*1.35,p1.x+(mid.x-p1.x)*1.35,p1.y+(mid.y-p1.y)*1.35,p1.x,p1.y).stroke({color:strokeColor,alpha:strokeAlpha*(s===3?.72:1),width:widths[s],cap:"round"});
    }
   }else{
    if(!e.cross&&depth<=2&&len>34)filaments.moveTo(a.x,a.y).bezierCurveTo(c1.x,c1.y,c2.x,c2.y,b.x,b.y).stroke({color,alpha:alpha*.12,width:widthBase*3.1,cap:"round"});
    filaments.moveTo(a.x,a.y).bezierCurveTo(c1.x,c1.y,c2.x,c2.y,b.x,b.y).stroke({color:strokeColor,alpha:strokeAlpha,width:widthBase,cap:"round"});
   }
   if(e.verified&&(selectedRelation||scale>=3))junctions.circle(bezierPoint(a,c1,c2,b,.5).x,bezierPoint(a,c1,c2,b,.5).y,Math.max(1.1,1.45/Math.sqrt(scale))).fill({color:e.basis==="notion-link"?0xb96b4d:0x7eaaa3,alpha:selectedRelation?.8:.48});
   if(!reduced&&!e.cross&&alpha>.2){const particleCount=depth<=2&&len>150?3:depth<=2&&len>72?2:1;for(let particle=0;particle<particleCount;particle++){const phase=time*.00012+(seed%100)*.013+particle/particleCount,q=(phase*(depth===1?.7:.48))%1,p=bezierPoint(a,c1,c2,b,q);filaments.circle(p.x,p.y,Math.max(.8,1.2*scale**.15)).fill({color:0xdce5d9,alpha:particleCount===1?.82:.68});}}
  }
  for(const n of nodes){
   const alpha=alphaFor(n.level);if(alpha<.015)continue;
   const r=Math.max(1.25,n.r),color=PALETTE[n.colorKey||n.rootId]||0xd1d0c5,seed=hash(n.id),lobes=n.level===0?11:n.level===1?7:5;
   if(n.level<=1)junctions.circle(n.x,n.y,r*3.3).fill({color,alpha:alpha*.07});
   const polygon=[];for(let k=0;k<lobes;k++){const a=k/lobes*Math.PI*2,v=.78+(((seed>>>((k%4)*5))&31)/31)*.42;polygon.push(n.x+Math.cos(a)*r*v,n.y+Math.sin(a)*r*v);}
   junctions.poly(polygon).fill({color:0x111b1d,alpha}).stroke({color,alpha:alpha*(n.level===0?.88:n.level===1?.68:.42),width:n.level===0?1.6:.9});
   if(hovered?.id===n.id){junctions.circle(n.x,n.y,r+10/scale).fill({color,alpha:.18});junctions.circle(n.x,n.y,r+7/scale).stroke({color:0xe4e7dd,alpha:.96,width:1.35/scale});}
   if(selected?.id===n.id)junctions.circle(n.x,n.y,r+7/scale+5/scale).stroke({color:0xe4e7dd,alpha:.9,width:1/scale});
  }
  // One camera transform controls all biological geometry; labels remain screen-readable.
  filaments.position.set(width/2+offset.x,height/2+offset.y);filaments.scale.set(scale);
  junctions.position.copyFrom(filaments.position);junctions.scale.set(scale);
  const live=new Set();
  const shortRoots={
   fr:{bio:"BIOTECH",myco:"MYCO",soil:"TECHNOSOIL",lab:"LABO",products:"PRODUITS",iot:"IOT",work:"R&D",evidence:"PREUVES",microbiology:"MICROBIO",plants:"PLANTES",ecology:"ÉCO",bioprocesses:"PROCÉDÉS",biomaterials:"MATIÈRES",instrumentation:"INGÉ",digital:"NUMÉRIQUE",physical:"PHYSIQUE"},
   en:{bio:"BIOTECH",myco:"MYCOLOGY",soil:"TECHNOSOIL",lab:"LAB",products:"PRODUCTS",iot:"IOT",work:"PROJECTS",evidence:"EVIDENCE",microbiology:"MICROBIO",plants:"PLANTS",ecology:"ECOLOGY",bioprocesses:"BIOPROCESS",biomaterials:"BIOMATERIALS",instrumentation:"ENGINEERING",digital:"DIGITAL",physical:"PHYSICS"},
   ar:{bio:"حيوية",myco:"فطريات",soil:"تربة",lab:"مختبر",products:"منتجات",iot:"إنترنت",work:"مشاريع",evidence:"الأدلة",microbiology:"أحياء دقيقة",plants:"نباتات",ecology:"بيئة",bioprocesses:"عمليات حيوية",biomaterials:"مواد حيوية",instrumentation:"هندسة",digital:"رقمي",physical:"فيزياء"},
   pt:{bio:"BIOTECH",myco:"MICO",soil:"TECHNOSOIL",lab:"LAB",products:"PRODUTOS",iot:"IOT",work:"PROJETOS",evidence:"EVIDÊNCIAS",microbiology:"MICROBIO",plants:"PLANTAS",ecology:"ECOLOGIA",bioprocesses:"BIOPROCESSOS",biomaterials:"BIOMATERIAIS",instrumentation:"ENGENHARIA",digital:"DIGITAL",physical:"FÍSICA"}
  };
  const candidates=[];
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const lineage=new Set();let ancestor=selected;
  while(ancestor){lineage.add(ancestor.id);ancestor=ancestor.parent?byId.get(ancestor.parent):null;}
  for(const n of nodes){
   const alpha=alphaFor(n.level);if(alpha<.015)continue;
   const sx=width/2+offset.x+n.x*scale,sy=height/2+offset.y+n.y*scale;
   if(sx < -80 || sx > width+80 || sy < 45 || sy > height+45)continue;
   const threshold=n.level===0?0:n.level===1?.6:n.level===2?1.3:n.level===3?2.55:4.3;
   const show=n.level===0||(alpha>.5&&scale>threshold)||lineage.has(n.id);
   if(show)candidates.push({n,alpha,priority:selected?.id===n.id?0:lineage.has(n.id)?1:n.level===0?2:3,distance:selected?Math.hypot(n.x-selected.x,n.y-selected.y):Math.hypot(n.x,n.y)});
  }
  candidates.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);
  const rootCount=candidates.filter(c=>c.n.level===0).length;
  const labelBudget=rootCount+Math.min(34,Math.max(8,Math.round(10+scale*5)));
  const occupied=[];const hitBoxes={};let drawn=0;
  for(const {n,alpha} of candidates){
   if(n.level!==0&&drawn>=labelBudget)continue;
   const sx=width/2+offset.x+n.x*scale,sy=height/2+offset.y+n.y*scale;
   let label=labelPool.get(n.id);if(!label){label=new Text({text:n.title,style:style.clone()});labelPool.set(n.id,label);labels.addChild(label);}
   const title=n.level===0&&scale<1.2?(shortRoots[lang]||shortRoots.fr)[n.rootId]||n.title:n.title;
   const fontSize=n.level===0?clamp(9+Math.log2(Math.max(.5,scale))*1.1,8,10.5):clamp(7.5+Math.log2(Math.max(.7,scale))*.65,7,9.5);
   label.text=title;label.style.fontSize=fontSize;label.style.fontWeight=n.level===0?"650":"500";
   const angle=Number.isFinite(n.angle)?n.angle:Math.atan2(n.y,n.x),dx=Math.cos(angle),dy=Math.sin(angle);
   const anchorX=dx>.32?0:dx<-.32?1:.5,anchorY=dy>.48?0:dy<-.48?1:.5;
   const radius=n.level===0?Math.max(15,n.r*scale+10):Math.max(7,n.r*scale+5);
   const rawX=sx+dx*radius,rawY=sy+dy*radius;
   const x=clamp(rawX,5+(anchorX===1?label.width:anchorX===.5?label.width/2:0),width-5-(anchorX===0?label.width:anchorX===.5?label.width/2:0));
   const y=clamp(rawY,64+(anchorY===1?label.height:anchorY===.5?label.height/2:0),height-18-(anchorY===0?label.height:anchorY===.5?label.height/2:0));
   label.anchor.set(anchorX,anchorY);label.position.set(x,y);label.alpha=alpha;label.visible=true;
   const box={left:x-(anchorX===1?label.width:anchorX===.5?label.width/2:0),right:x+(anchorX===0?label.width:anchorX===.5?label.width/2:0),top:y-(anchorY===1?label.height:anchorY===.5?label.height/2:0),bottom:y+(anchorY===0?label.height:anchorY===.5?label.height/2:0)};
   const collides=occupied.some(o=>box.left<o.right+7&&box.right>o.left-7&&box.top<o.bottom+5&&box.bottom>o.top-5);
   if(collides&&selected?.id!==n.id&&n.level!==0){label.visible=false;continue;}
   occupied.push(box);hitBoxes[n.id]=box;live.add(n.id);drawn++;
  }
  for(const [id,label] of labelPool){if(!live.has(id))label.visible=false;}
  canvas.dataset.visibleNodeIds=JSON.stringify([...live]);
  canvas.dataset.visibleNodeHitBoxes=JSON.stringify(hitBoxes);
  canvas.dataset.labelCandidateCount=String(candidates.length);
  canvas.dataset.labelLiveCount=String(live.size);
  canvas.dataset.rootCandidateCount=String(rootCount);
  canvas.dataset.viewportWidth=String(width);
  canvas.dataset.viewportHeight=String(height);
  app.render();
 }
 return{render,resize,destroy:()=>app.destroy({removeView:false,children:true})};
}
