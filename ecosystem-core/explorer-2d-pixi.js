import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PALETTE={bio:0x79a991,myco:0xb18fc2,soil:0xc19b73,lab:0x80aeb8,products:0xc88773,iot:0x7eaaa3,work:0xaa9cbb,evidence:0xb5b58d};
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
  const bezierPoint=(a,c,b,t)=>{const u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};};
  for(const e of edges){
   const depth=Math.max(e.a.level,e.b.level),alpha=alphaFor(depth);if(alpha<.015)continue;
   const a=point(e.a),b=point(e.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const seed=(e.seed??hash(e.a.id+e.b.id))>>>0,side=(seed&1)?1:-1;
   const bend=Math.min(58,len*.19)*side*(.62+((seed>>>5)&63)/100);
   const drift=(((seed>>>12)&255)/255-.5)*Math.min(24,len*.09);
   const cx=(a.x+b.x)/2-dy/len*bend+dx/len*drift,cy=(a.y+b.y)/2+dx/len*bend+dy/len*drift;
   const color=PALETTE[e.a.colorKey||e.a.rootId]||0x91a99b,hot=!!hovered&&(e.a.id===hovered.id||e.b.id===hovered.id),widthBase=(e.verified?1.2:e.cross?.55:Math.max(.45,(e.depth===1?1.5:e.depth===2?1.15:.85)))*(hot?1.55:1);
   const terminalTip=!e.cross&&terminalIds.has(e.b.id);
   const strokeColor=hot?0xe4e7dd:e.verified?(e.basis==="notion-link"?0xb96b4d:0x7eaaa3):e.cross?0xb96b4d:color;
   const strokeAlpha=hot?Math.max(.88,alpha):alpha*(e.verified?.82:e.cross?.34:depth>=3?.42:depth===2?.62:.78);
   if(hot)filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color:0xb96b4d,alpha:.16,width:widthBase*4.2,cap:"round"});
   if(terminalTip){
    // Taper the final hypha progressively; no terminal bead is drawn.
    const cuts=[0,.48,.72,.88,1],widths=[widthBase,widthBase*.82,widthBase*.58,widthBase*.30,.06];
    for(let s=0;s<cuts.length-1;s++){
     const p0=bezierPoint(a,{x:cx,y:cy},b,cuts[s]),p1=bezierPoint(a,{x:cx,y:cy},b,cuts[s+1]);
     const midT=(cuts[s]+cuts[s+1])*.5,mid=bezierPoint(a,{x:cx,y:cy},b,midT);
     filaments.moveTo(p0.x,p0.y).quadraticCurveTo(mid.x,mid.y,p1.x,p1.y).stroke({color:strokeColor,alpha:strokeAlpha*(s===3?.72:1),width:widths[s],cap:"round"});
    }
   }else{
    if(!e.cross&&depth<=2&&len>34)filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color,alpha:alpha*.12,width:widthBase*3.1,cap:"round"});
    filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color:strokeColor,alpha:strokeAlpha,width:widthBase,cap:"round"});
   }
   if(e.verified)junctions.circle(cx,cy,Math.max(1.25,1.8/Math.sqrt(scale))).fill({color:e.basis==="notion-link"?0xb96b4d:0x7eaaa3,alpha:.9});
   if(!e.cross&&len>24&&depth<5){
    const count=depth===1?4:depth===2?3:2,nx=-dy/len,ny=dx/len;
    for(let i=0;i<count;i++){const u=(i+1)/(count+1),x=(1-u)*(1-u)*a.x+2*(1-u)*u*cx+u*u*b.x,y=(1-u)*(1-u)*a.y+2*(1-u)*u*cy+u*u*b.y,side=((e.seed+i)%2?1:-1),reach=Math.min(28,Math.max(7,len*(.13-depth*.012))),ex=x+dx/len*reach*.35+nx*side*reach,ey=y+dy/len*reach*.35+ny*side*reach,mx=(x+ex)/2+nx*side*reach*.2,my=(y+ey)/2+ny*side*reach*.2;filaments.moveTo(x,y).quadraticCurveTo(mx,my,ex,ey).stroke({color,alpha:alpha*.43,width:Math.max(.38,.78-depth*.08),cap:"round"});}
   }
   if(!reduced&&!e.cross&&alpha>.2){const particleCount=depth<=2&&len>150?3:depth<=2&&len>72?2:1;for(let particle=0;particle<particleCount;particle++){const phase=time*.00012+(seed%100)*.013+particle/particleCount,q=(phase*(depth===1?.7:.48))%1,u=1-q,x=u*u*a.x+2*u*q*cx+q*q*b.x,y=u*u*a.y+2*u*q*cy+q*q*b.y;filaments.circle(x,y,Math.max(.8,1.2*scale**.15)).fill({color:0xdce5d9,alpha:particleCount===1?.82:.68});}}
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
   const xMin=anchorX===1?label.width+5:anchorX===.5?label.width/2+5:5;
   const xMax=anchorX===0?width-label.width-5:anchorX===.5?width-label.width/2-5:width-5;
   const yMin=anchorY===1?label.height+64:anchorY===.5?label.height/2+64:64;
   const yMax=anchorY===0?height-18-label.height:anchorY===.5?height-18-label.height/2:height-18;
   const x=clamp(sx+dx*radius,Math.min(xMin,width/2),Math.max(xMax,width/2));
   const y=clamp(sy+dy*radius,Math.min(yMin,height/2),Math.max(yMax,height/2));
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
