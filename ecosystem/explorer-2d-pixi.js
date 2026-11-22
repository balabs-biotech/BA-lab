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
 const style=new TextStyle({fontFamily:"Inter, system-ui, sans-serif",fontSize:12,fill:0xf2f1e9,fontWeight:"600",stroke:{color:0x07100f,width:4.5},align:"center"});
 let lastWidth=0,lastHeight=0;
 function resize(width,height){lastWidth=width;lastHeight=height;app.renderer.resize(width,height);}
 const alphaFor=level=>{const thresholds=[0,.10,.16,.24,.4,.7,1.1],t=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((cameraScale-t*.72)/(t*.42),0,1);};
 let cameraScale=1;
 function render({nodes,edges,selected,scale,offset,width,height,reduced,lang="fr",time=performance.now(),core,radialRings=[]}){
  cameraScale=scale;
  field.clear().rect(0,0,width,height).fill({color:0x111b1d});
  field.circle(width*.5,height*.48,Math.max(width,height)*.78).fill({color:0x172925,alpha:.35});
  const biome=selected?(PALETTE[selected.rootId]||0x78958a):0x78958a;
  // A restrained microscopy-like hyphal grain sits behind the navigable network.
  // Its geometry is deterministic; only the spore drift animates.
  for(let i=0;i<18;i++){
   const seed=hash("field-hypha-"+i),x=(seed%997)/997*width,y=((seed>>>9)%991)/991*height;
   const length=24+(seed%86),bend=((seed>>>7)%41)-20,side=(seed&1)?1:-1;
   field.moveTo(x,y).quadraticCurveTo(x+length*.48,y+bend*side,x+length,y+bend*.28).stroke({color:biome,alpha:selected?.035:.022,width:.65,cap:"round"});
  }
  filaments.clear();junctions.clear();
  const point=n=>({x:n.x,y:n.y});
  // Overview: eight universes orbit the transversal Mycology hub.
  if(!selected){
   const roots=nodes.filter(n=>n.level===0);
   for(const root of roots){
    const dx=root.x,dy=root.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    filaments.moveTo(0,0).quadraticCurveTo(dx*.48+nx*18,dy*.48+ny*18,root.x,root.y)
     .stroke({color:0x78958a,alpha:.24,width:1.15,cap:"round"});
    if(!reduced){const q=(time*.000075+(hash(root.id)%100)*.009)%1,u=1-q,x=2*u*q*(dx*.48+nx*18)+q*q*root.x,y=2*u*q*(dy*.48+ny*18)+q*q*root.y;filaments.circle(x,y,1.25).fill({color:0xdce5d9,alpha:.72});}
   }
   junctions.circle(0,0,34).fill({color:0xb96b4d,alpha:.075});
   junctions.circle(0,0,25).stroke({color:0xb96b4d,alpha:.78,width:1.6});
   junctions.circle(0,0,16).stroke({color:0xd1d0c5,alpha:.62,width:1});
   junctions.circle(0,0,5.5).fill({color:0xb96b4d,alpha:.95});
   for(let k=0;k<8;k++){const a=k*Math.PI/4;junctions.circle(Math.cos(a)*29,Math.sin(a)*29,1.8).fill({color:0x91a99b,alpha:.8});}
  }else{
   // A focused universe unfolds as concentric, evenly spaced hierarchy rings.
   for(const radius of radialRings)filaments.circle(0,0,radius).stroke({color:0x78958a,alpha:.13,width:1.15/scale});
  }

  const byId=new Map(nodes.map(n=>[n.id,n]));
  const lineage=new Set();let ancestor=selected;
  while(ancestor){lineage.add(ancestor.id);ancestor=ancestor.parent?byId.get(ancestor.parent):null;}
  const activeBranch=new Set();
  if(selected){
   activeBranch.add(selected.id);
   let grew=true;
   while(grew){grew=false;for(const n of nodes){if(n.parent&&activeBranch.has(n.parent)&&!activeBranch.has(n.id)){activeBranch.add(n.id);grew=true;}}}
  }
  for(const e of edges){
   if(!selected&&!e.verified)continue;
   if(selected&&(e.a.rootId!==selected.rootId||e.b.rootId!==selected.rootId))continue;
   const depth=Math.max(e.a.level,e.b.level);let alpha=alphaFor(depth);if(alpha<.015)continue;
   if(selected&&!e.verified)alpha*=activeBranch.has(e.a.id)&&activeBranch.has(e.b.id)?1:.16;
   const a=point(e.a),b=point(e.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const seed=(e.seed??hash(e.a.id+e.b.id))>>>0,side=(seed&1)?1:-1;
   const bend=Math.min(58,len*.19)*side*(.62+((seed>>>5)&63)/100);
   const drift=(((seed>>>12)&255)/255-.5)*Math.min(24,len*.09);
   const cx=(a.x+b.x)/2-dy/len*bend+dx/len*drift,cy=(a.y+b.y)/2+dx/len*bend+dy/len*drift;
   const color=PALETTE[e.a.rootId]||0x91a99b,widthBase=e.verified?1.2:e.cross?.55:Math.max(.45,(e.depth===1?1.5:e.depth===2?1.15:.85));
   if(!e.cross&&depth<=2&&len>34)filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color,alpha:alpha*.12,width:widthBase*3.1,cap:"round"});
   filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color:e.verified?(e.basis==="notion-link"?0xb96b4d:0x7eaaa3):e.cross?0xb96b4d:color,alpha:alpha*(e.verified?.82:e.cross?.34:depth>=3?.42:depth===2?.62:.78),width:widthBase,cap:"round"});
   if(e.verified)junctions.circle(cx,cy,Math.max(1.25,1.8/Math.sqrt(scale))).fill({color:e.basis==="notion-link"?0xb96b4d:0x7eaaa3,alpha:.9});
   if(!e.cross&&len>24&&depth<5){
    const count=depth===1?4:depth===2?3:2,nx=-dy/len,ny=dx/len;
    for(let i=0;i<count;i++){const u=(i+1)/(count+1),x=(1-u)*(1-u)*a.x+2*(1-u)*u*cx+u*u*b.x,y=(1-u)*(1-u)*a.y+2*(1-u)*u*cy+u*u*b.y,side=((e.seed+i)%2?1:-1),reach=Math.min(28,Math.max(7,len*(.13-depth*.012))),ex=x+dx/len*reach*.35+nx*side*reach,ey=y+dy/len*reach*.35+ny*side*reach,mx=(x+ex)/2+nx*side*reach*.2,my=(y+ey)/2+ny*side*reach*.2;filaments.moveTo(x,y).quadraticCurveTo(mx,my,ex,ey).stroke({color,alpha:alpha*.43,width:Math.max(.38,.78-depth*.08),cap:"round"});}
   }
   if(!reduced&&!e.cross&&alpha>.2){const particleCount=depth<=2&&len>150?3:depth<=2&&len>72?2:1;for(let particle=0;particle<particleCount;particle++){const phase=time*.00012+(seed%100)*.013+particle/particleCount,q=(phase*(depth===1?.7:.48))%1,u=1-q,x=u*u*a.x+2*u*q*cx+q*q*b.x,y=u*u*a.y+2*u*q*cy+q*q*b.y;filaments.circle(x,y,Math.max(.8,1.2*scale**.15)).fill({color:0xdce5d9,alpha:particleCount===1?.82:.68});}}
  }
  for(const n of nodes){
   if(!selected&&n.level!==0)continue;
   if(selected&&n.rootId!==selected.rootId)continue;
   let alpha=alphaFor(n.level);if(alpha<.015)continue;
   if(selected&&!activeBranch.has(n.id)&&!lineage.has(n.id))alpha*=.34;
   const r=Math.max(1.25,n.r),color=PALETTE[n.rootId]||0xd1d0c5,seed=hash(n.id),lobes=n.level===0?11:n.level===1?7:5;
   if(n.level<=1)junctions.circle(n.x,n.y,r*3.3).fill({color,alpha:alpha*.07});
   const polygon=[];for(let k=0;k<lobes;k++){const a=k/lobes*Math.PI*2,v=.78+(((seed>>>((k%4)*5))&31)/31)*.42;polygon.push(n.x+Math.cos(a)*r*v,n.y+Math.sin(a)*r*v);}
   junctions.poly(polygon).fill({color:0x111b1d,alpha}).stroke({color,alpha:alpha*(n.level===0?.88:n.level===1?.68:.42),width:n.level===0?1.6:.9});
   if(selected?.id===n.id)junctions.circle(n.x,n.y,r+7/scale+5/scale).stroke({color:0xe4e7dd,alpha:.9,width:1/scale});
  }
  // One camera transform controls all biological geometry; labels remain screen-readable.
  filaments.position.set(width/2+offset.x,height/2+offset.y);filaments.scale.set(scale);
  junctions.position.copyFrom(filaments.position);junctions.scale.set(scale);
  const live=new Set();
  const shortRoots={
   fr:{bio:"BIOTECH",myco:"MYCO",soil:"TECHNOSOIL",lab:"LABO",products:"PRODUITS",iot:"IOT",work:"R&D",evidence:"PREUVES"},
   en:{bio:"BIOTECH",myco:"MYCOLOGY",soil:"TECHNOSOIL",lab:"LAB",products:"PRODUCTS",iot:"IOT",work:"PROJECTS",evidence:"EVIDENCE"},
   ar:{bio:"حيوية",myco:"فطريات",soil:"تربة",lab:"مختبر",products:"منتجات",iot:"إنترنت",work:"مشاريع",evidence:"الأدلة"},
   pt:{bio:"BIOTECH",myco:"MICO",soil:"TECHNOSOIL",lab:"LAB",products:"PRODUTOS",iot:"IOT",work:"PROJETOS",evidence:"EVIDÊNCIAS"}
  };
  const coreScreen={x:width/2+offset.x,y:height/2+offset.y};
  let coreText=labelPool.get("__mycology-core");
  if(!coreText){coreText=new Text({text:"MYCOLOGY",style:style.clone()});labelPool.set("__mycology-core",coreText);labels.addChild(coreText);}
  coreText.text=core?.title||"MYCOLOGY";coreText.style.fontSize=12.5;coreText.style.fontWeight="700";coreText.anchor.set(.5,0);
  coreText.position.set(coreScreen.x,coreScreen.y+39);coreText.alpha=.96;
  coreText.visible=!selected&&coreScreen.x>-100&&coreScreen.x<width+100&&coreScreen.y>-70&&coreScreen.y<height+70;
  if(coreText.visible)live.add("__mycology-core");
  const candidates=[];
  for(const n of nodes){
   if(!selected&&n.level!==0)continue;
   if(selected&&n.rootId!==selected.rootId)continue;
   let alpha=alphaFor(n.level);if(alpha<.015)continue;
   if(selected&&!activeBranch.has(n.id)&&!lineage.has(n.id))alpha*=.22;
   const sx=width/2+offset.x+n.x*scale,sy=height/2+offset.y+n.y*scale;
   if(sx < -80 || sx > width+80 || sy < 45 || sy > height+45)continue;
   const threshold=n.level===0?0:n.level===1?.78:n.level===2?1.55:n.level===3?2.65:4.1;
   const show=n.level===0||(alpha>.5&&scale>threshold)||lineage.has(n.id);
   if(show)candidates.push({n,alpha,priority:selected?.id===n.id?0:lineage.has(n.id)?1:n.level===0?2:3,distance:selected?Math.hypot(n.x-selected.x,n.y-selected.y):Math.hypot(n.x,n.y)});
  }
  candidates.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);
  const rootCount=candidates.filter(c=>c.n.level===0).length;
  const labelBudget=rootCount+Math.min(52,Math.max(12,Math.round(14+scale*6)));
  const occupied=[];const hitBoxes={};let drawn=0;
  for(const {n,alpha} of candidates){
   if(n.level!==0&&drawn>=labelBudget)continue;
   const sx=width/2+offset.x+n.x*scale,sy=height/2+offset.y+n.y*scale;
   let label=labelPool.get(n.id);if(!label){label=new Text({text:n.title,style:style.clone()});labelPool.set(n.id,label);labels.addChild(label);}
   const title=n.title;
   let fontSize=n.level===0?clamp(11.5+Math.log2(Math.max(.5,scale))*1.25,10.5,15):clamp(10.2+Math.log2(Math.max(.7,scale))*.92,9.5,13.5);if(selected&&activeBranch.has(n.id))fontSize+=.7;if(selected?.id===n.id)fontSize+=1;
   label.text=title;label.style.fontSize=fontSize;label.style.fontWeight=n.level===0?"650":"500";
   // Wrap long names to the available phone width before positioning the label.
   label.style.wordWrap=true;label.style.breakWords=true;label.style.align="center";
   label.style.wordWrapWidth=Math.max(145,Math.min(width*.62,270));
   const angle=Number.isFinite(n.angle)?n.angle:Math.atan2(n.y,n.x),dx=Math.cos(angle),dy=Math.sin(angle);
   const anchorX=dx>.32?0:dx<-.32?1:.5,anchorY=dy>.48?0:dy<-.48?1:.5;
   const radius=n.level===0?Math.max(15,n.r*scale+10):Math.max(7,n.r*scale+5);
   label.anchor.set(anchorX,anchorY);
   const rawX=sx+dx*radius,rawY=sy+dy*radius;
   const x=clamp(rawX,8+anchorX*label.width,width-8-(1-anchorX)*label.width);
   const y=clamp(rawY,56+anchorY*label.height,height-14-(1-anchorY)*label.height);
   label.position.set(x,y);label.alpha=Math.max(alpha,selected?0.76:0.88);label.visible=true;
   const box={left:x-anchorX*label.width,right:x+(1-anchorX)*label.width,top:y-anchorY*label.height,bottom:y+(1-anchorY)*label.height};
   hitBoxes[n.id]=box;
   const collides=occupied.some(o=>box.left<o.right+7&&box.right>o.left-7&&box.top<o.bottom+5&&box.bottom>o.top-5);
   if(collides&&selected?.id!==n.id&&n.level!==0){label.visible=false;continue;}
   occupied.push(box);hitBoxes[n.id]=box;live.add(n.id);drawn++;
  }
  for(const [id,label] of labelPool){if(!live.has(id))label.visible=false;}
  canvas.dataset.visibleNodeIds=JSON.stringify([...live]);
  canvas.dataset.visibleNodeHitBoxes=JSON.stringify(hitBoxes);
  app.render();
 }
 return{render,resize,destroy:()=>app.destroy({removeView:false,children:true})};
}
