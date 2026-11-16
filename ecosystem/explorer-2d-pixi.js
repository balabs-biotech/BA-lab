import { Application, Container, Graphics, Text, TextStyle } from "https://cdn.jsdelivr.net/npm/pixi.js@8.9.1/+esm";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PALETTE={bio:0x79a991,myco:0xb18fc2,soil:0xc19b73,lab:0x80aeb8,products:0xc88773,iot:0x7eaaa3,work:0xaa9cbb,learn:0xb5b58d};
const hex=(n)=>"#"+n.toString(16).padStart(6,"0");
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};

export async function createPixiRenderer(canvas){
 const app=new Application();
 await app.init({canvas,backgroundAlpha:0,antialias:true,autoDensity:true,resolution:Math.min(window.devicePixelRatio||1,2),powerPreference:"high-performance",preference:"webgl"});
 app.stage.eventMode="none";
 const world=new Container();app.stage.addChild(world);
 const background=new Graphics();app.stage.addChildAt(background,0);
 const textStyle=new TextStyle({fontFamily:"Inter, system-ui, sans-serif",fontSize:12,fill:0xe4e7dd,fontWeight:"500",stroke:{color:0x111b1d,width:3},align:"center"});
 function resize(width,height){app.renderer.resize(width,height);background.clear().rect(0,0,width,height).fill({color:0x111b1d});}
 function render({nodes,edges,selected,scale,offset,width,height,reduced,time=performance.now()}){
  world.removeChildren();
  background.clear().rect(0,0,width,height).fill({color:0x111b1d});
  const field=new Graphics();
  field.circle(width*.5,height*.48,Math.max(width,height)*.78).fill({color:0x172925,alpha:.35});
  // Fine suspended spores, restrained and non-geometric.
  for(let i=0;i<180;i++){const x=(i*137.51)%width,y=(i*83.71)%height;field.circle(x,y,i%9===0?1.2:.65).fill({color:i%7===0?0xb96b4d:0xd1d0c5,alpha:i%5===0?.19:.07});}
  world.addChild(field);
  const filaments=new Graphics();
  const point=n=>({x:width/2+offset.x+n.x*scale,y:height/2+offset.y+n.y*scale});
  const levelAlpha=level=>{const thresholds=[0,.10,.16,.24,.4,.7,1.1],t=thresholds[Math.min(level,thresholds.length-1)];return level===0?1:clamp((scale-t*.72)/(t*.42),0,1);};
  for(const e of edges){
   const depth=Math.max(e.a.level,e.b.level),alpha=levelAlpha(depth);if(alpha<.015)continue;
   const a=point(e.a),b=point(e.b),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,bend=Math.min(42,len*.14)*(e.seed%2?1:-1),cx=(a.x+b.x)/2-dy/len*bend,cy=(a.y+b.y)/2+dx/len*bend;
   const color=PALETTE[e.a.rootId]||0x91a99b,baseWidth=e.cross?.55:Math.max(.45,(e.depth===1?1.5:e.depth===2?1.15:.85)*Math.sqrt(scale));
   if(!e.cross&&depth<=2&&len>34)filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color,alpha:alpha*.10,width:baseWidth*3.4});
   filaments.moveTo(a.x,a.y).quadraticCurveTo(cx,cy,b.x,b.y).stroke({color:e.cross?0xb96b4d:color,alpha:alpha*(e.cross?.36:depth>=3?.34:depth===2?.55:.72),width:baseWidth,cap:"round"});
   // Small, tapered side hyphae add genuine branching structure.
   if(!e.cross&&len>24&&depth<5){
    const count=depth===1?4:depth===2?3:2,nx=-dy/len,ny=dx/len;
    for(let i=0;i<count;i++){const u=(i+1)/(count+1),x=(1-u)*(1-u)*a.x+2*(1-u)*u*cx+u*u*b.x,y=(1-u)*(1-u)*a.y+2*(1-u)*u*cy+u*u*b.y,side=((e.seed+i)%2?1:-1),reach=Math.min(28,Math.max(7,len*(.13-depth*.012))),ex=x+dx/len*reach*.35+nx*side*reach,ey=y+dy/len*reach*.35+ny*side*reach,mx=(x+ex)/2+nx*side*reach*.2,my=(y+ey)/2+ny*side*reach*.2;filaments.moveTo(x,y).quadraticCurveTo(mx,my,ex,ey).stroke({color,alpha:alpha*.38,width:Math.max(.38,.78-depth*.08),cap:"round"});}
   }
   if(!reduced&&!e.cross&&alpha>.2){const phase=time*.00012+(e.seed%100)*.013,q=(phase*(e.depth===1?.7:.48))%1,u=1-q,x=u*u*a.x+2*u*q*cx+q*q*b.x,y=u*u*a.y+2*u*q*cy+q*q*b.y;filaments.circle(x,y,Math.max(.8,1.2*scale**.15)).fill({color:0xdce5d9,alpha:.85});}
  }
  world.addChild(filaments);
  const junctions=new Graphics();
  for(const n of nodes){const alpha=levelAlpha(n.level);if(alpha<.015)continue;const p=point(n),r=Math.max(1.25,n.r*Math.sqrt(scale)),color=PALETTE[n.rootId]||0xd1d0c5,seed=hash(n.id),lobes=n.level===0?11:n.level===1?7:5;
   if(n.level<=1)junctions.circle(p.x,p.y,r*3.3).fill({color,alpha:alpha*.07});
   for(let k=0;k<lobes;k++){const a=k/lobes*Math.PI*2,v=.78+(((seed>>>((k%4)*5))&31)/31)*.42,x=p.x+Math.cos(a)*r*v,y=p.y+Math.sin(a)*r*v;if(k===0)junctions.moveTo(x,y);else junctions.lineTo(x,y);}
   const a=0,variation=.78+((seed&31)/31)*.42;junctions.lineTo(p.x+Math.cos(a)*r*variation,p.y+Math.sin(a)*r*variation).closePath().fill({color:0x111b1d,alpha}).stroke({color,alpha:alpha*(n.level===0?.88:n.level===1?.68:.42),width:n.level===0?1.6:.9});
   if(selected?.id===n.id)junctions.circle(p.x,p.y,r+7+Math.min(5,scale)).stroke({color:0xe4e7dd,alpha:.9,width:1});
  }
  world.addChild(junctions);
  for(const n of nodes){const alpha=levelAlpha(n.level);if(alpha<.015)continue;const p=point(n),show=n.level===0||(alpha>.5&&scale>(n.level===1?.58:n.level===2?1.15:n.level===3?2.35:4.1))||selected?.id===n.id;if(!show)continue;const style=textStyle.clone();style.fontSize=clamp((n.level===0?12:10)*Math.sqrt(scale),8,14);style.fontWeight=n.level===0?"650":"500";const label=new Text({text:n.title,style});label.anchor.set(.5,0);label.position.set(clamp(p.x,100,width-100),p.y+Math.max(1.25,n.r*Math.sqrt(scale))+5);label.alpha=alpha;world.addChild(label);}
  app.render();
 }
 return{render,resize,destroy:()=>app.destroy(true)};
}
