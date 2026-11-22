import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { createFractalGrowthModel } from "./explorer-2d-fractal.js";

const view=document.querySelector("#view"),note=document.querySelector("#note"),status=document.querySelector("#status");
const app=new Application();
await app.init({resizeTo:view,background:0x111b1d,antialias:true,autoDensity:true,resolution:Math.min(devicePixelRatio||1,1.75),preference:"webgl"});
view.appendChild(app.canvas);
const drawing=new Graphics(),labels=new Container();app.stage.addChild(drawing,labels);
const labelStyle=new TextStyle({fontFamily:"Inter,system-ui,sans-serif",fontSize:12,fill:0xd1d0c5,fontWeight:"600",stroke:{color:0x111b1d,width:4}});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let geometry=null,treeNode=null,scale=1,offset={x:0,y:0},drag=null;

function chooseBranch(nodes){
 const candidates=[];
 const walk=(items,depth=0)=>{for(const n of items||[]){const kids=n.children||[];if(kids.length)candidates.push({node:n,depth,score:count(n)});walk(kids,depth+1);}};
 const count=n=>(n.children||[]).reduce((s,c)=>s+Math.max(1,count(c)),0);
 walk(nodes);
 return candidates.filter(x=>x.depth>=1&&x.score>=5).sort((a,b)=>b.score-a.score)[Math.floor(candidates.filter(x=>x.depth>=1&&x.score>=5).length*.22)]?.node
   ||candidates.sort((a,b)=>b.score-a.score)[0]?.node;
}
function draw(){
 if(!geometry)return;
 drawing.clear();labels.removeChildren();
 const w=view.clientWidth,h=view.clientHeight;
 const b=geometry.bounds,gw=Math.max(1,b.maxX-b.minX),gh=Math.max(1,b.maxY-b.minY);
 const fit=Math.min((w-100)/gw,(h-100)/gh,1.8);
 const s=fit*scale,ox=w/2-(b.minX+b.maxX)/2*s+offset.x,oy=h/2-(b.minY+b.maxY)/2*s+offset.y;
 drawing.position.set(ox,oy);drawing.scale.set(s);labels.position.set(0,0);labels.scale.set(1);
 // Fine biological background texture.
 for(let i=0;i<30;i++){const x=((i*7919)%997)/997*gw+b.minX,y=((i*3571)%991)/991*gh+b.minY;drawing.circle(x,y,0.65/s).fill({color:0x78958a,alpha:.16});}
 // Branches are continuous Bezier hyphae, not links between independent dots.
 for(const branch of geometry.branches){
  const hue=branch.depth===1?0xb96b4d:branch.depth===2?0x8eaa98:0x6f9588;
  const width=Math.max(.7,3.2*Math.pow(.78,branch.depth-1));
  drawing.moveTo(branch.start.x,branch.start.y)
   .bezierCurveTo(branch.control1.x,branch.control1.y,branch.control2.x,branch.control2.y,branch.end.x,branch.end.y)
   .stroke({color:hue,alpha:.12,width:width*3.6,cap:"round"});
  drawing.moveTo(branch.start.x,branch.start.y)
   .bezierCurveTo(branch.control1.x,branch.control1.y,branch.control2.x,branch.control2.y,branch.end.x,branch.end.y)
   .stroke({color:hue,alpha:.92,width,cap:"round"});
 }
 // Junctions are biological swellings where daughter branches emerge.
 for(const n of geometry.junctions){
  if(n.kind!=="junction"&&n.kind!=="origin")continue;
  const r=n.kind==="origin"?8:Math.max(2.2,5.5*Math.pow(.82,n.depth));
  drawing.circle(n.x,n.y,r*2.7).fill({color:n.kind==="origin"?0xb96b4d:0x8eaa98,alpha:.075});
  drawing.circle(n.x,n.y,r).fill({color:0x172522}).stroke({color:n.kind==="origin"?0xb96b4d:0x9eb7a5,alpha:.92,width:Math.max(.8,1.5/Math.sqrt(s))});
  if(n.kind==="origin")drawing.circle(n.x,n.y,2.4).fill({color:0xd1d0c5});
 }
 // Terminal geometry: tapered hyphal ends with a small rounded apical bulb.
 for(const terminal of geometry.terminals){
  const incoming=geometry.branches.filter(b=>b.id===terminal.id).at(-1);
  if(!incoming)continue;
  const dx=terminal.x-incoming.control2.x,dy=terminal.y-incoming.control2.y,len=Math.hypot(dx,dy)||1;
  const tx=dx/len,ty=dy/len,rx=-ty,ry=tx;
  const tip=2.1*Math.pow(.86,terminal.depth-1);
  drawing.moveTo(terminal.x-tx*tip*2-rx*tip*.65,terminal.y-ty*tip*2-ry*tip*.65)
   .quadraticCurveTo(terminal.x+rx*tip*.55,terminal.y+ry*tip*.55,terminal.x+tx*tip*1.25,terminal.y+ty*tip*1.25)
   .stroke({color:0xd1d0c5,alpha:.92,width:Math.max(.8,tip),cap:"round"});
  drawing.circle(terminal.x,terminal.y,tip*.72).fill({color:0xb96b4d,alpha:.78});
 }
 const title=new Text({text:treeNode.title||"Branche",style:labelStyle});
 title.anchor.set(.5,1);title.position.set(ox+geometry.origin.x*s,oy+(geometry.origin.y-18)*s);labels.addChild(title);
 const labelCandidates=geometry.terminals.filter((_,i)=>i%Math.max(1,Math.ceil(geometry.terminals.length/18))===0);
 for(const leaf of labelCandidates){
  const text=new Text({text:leaf.title,style:labelStyle.clone()});
  text.style.fontSize=10;text.anchor.set(.5,0);text.position.set(ox+leaf.x*s,oy+(leaf.y+5)*s);labels.addChild(text);
 }
}
const response=await fetch("./notion-tree.fr.json");
if(!response.ok)throw new Error("Catalogue Notion indisponible");
const catalogue=await response.json();
treeNode=chooseBranch(catalogue.domains);
if(!treeNode)throw new Error("Aucune branche avec descendants n'a été trouvée");
geometry=createFractalGrowthModel(treeNode,{originX:0,originY:0,heading:-Math.PI/2,fanAngle:Math.PI*.94,childFanAngle:Math.PI*.78,baseLength:132,lengthDecay:.78,curvature:.24});
note.textContent=treeNode.title+" · "+geometry.stats.branchCount+" ramifications · "+geometry.stats.junctionCount+" jonctions · "+geometry.stats.terminalCount+" terminaisons. Géométrie calculée à partir des descendants réels du catalogue.";
status.textContent="PROFONDEUR "+geometry.stats.maxDepth+" · ESPACE RÉSERVÉ AVANT DESSIN";
draw();
new ResizeObserver(draw).observe(view);
view.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};view.setPointerCapture(e.pointerId);});
view.addEventListener("pointermove",e=>{if(!drag)return;offset.x=drag.ox+e.clientX-drag.x;offset.y=drag.oy+e.clientY-drag.y;draw();});
view.addEventListener("pointerup",()=>drag=null);view.addEventListener("pointercancel",()=>drag=null);
view.addEventListener("wheel",e=>{e.preventDefault();scale=clamp(scale*(e.deltaY<0?1.12:.89),.45,3.8);draw();},{passive:false});
