// Public-site-only graph builder: a mycology hub connected to eight independent scientific universes.
// Deliberately separate from ecosystem-core so the Academy explorer remains untouched.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};

// Three unequal mycelial arms create a living Y-shaped organism rather than
// eight equidistant satellites. The grouping is spatial only; content and
// cross-territory relationships remain sourced from the localized Notion tree.
const ARMS=[
  {id:"upper-left",junction:{x:-128,y:-18},indices:[0,3,4],points:[[-390,-172],[-520,43],[-365,268]]},
  {id:"upper-right",junction:{x:132,y:-14},indices:[1,2,7],points:[[390,-182],[525,58],[370,283]]},
  {id:"lower",junction:{x:0,y:236},indices:[5,6],points:[[-185,523],[190,543]]}
];
const ARM_BY_INDEX=new Map(ARMS.flatMap(arm=>arm.indices.map((index,position)=>[index,{...arm,point:arm.points[position]}])));
const COLOR_KEYS={
  mycology:"myco",microbiology:"bio",plants:"soil",ecology:"lab",
  bioprocesses:"products",biomaterials:"iot",instrumentation:"work",
  digital:"evidence",physical:"bio"
};

export function createPublicMycologyNetwork(tree,hub){
  if(!Array.isArray(tree)||tree.length!==8)throw new Error("The public explorer requires exactly eight scientific universes.");
  if(!hub||typeof hub.id!=="string"||typeof hub.url!=="string")throw new Error("A valid public mycology hub is required.");
  const nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
  const brand={id:"balabs-identity",title:"BA Labs",x:0,y:0,r:29,level:0,data:{kind:"identity"},rootId:"balabs-identity",colorKey:COLOR_KEYS.mycology,parent:null,angle:-Math.PI/2,identity:true};
  const center={id:"mycology-center",title:hub.title,x:0,y:78,r:22,level:0,data:{...hub,children:tree},rootId:"mycology-center",colorKey:COLOR_KEYS.mycology,parent:brand.id,angle:Math.PI/2};
  nodes.push(brand,center);byId.set(brand.id,brand);byId.set(center.id,center);
  edges.push({a:brand,b:center,depth:0,seed:hash("identity|mycology"),identityLink:true});
  const walk=(data,parent,depth,baseAngle,rootId)=>{
    const kids=data.children||[];
    if(!kids.length)return;
    const spread=Math.min(2.35,1.0+Math.log2(kids.length+1)*.38);
    const distance=depth===1?170+Math.sqrt(kids.length)*13:depth===2?145+Math.sqrt(kids.length)*22:depth===3?92:Math.max(34,50-depth*2);
    kids.forEach((child,index)=>{
      const seed=hash(child.id),fraction=kids.length===1?0:index/(kids.length-1)-.5;
      const curl=Math.sin(parent.x*.002+parent.y*.0017+depth*.61)*.2;
      const angle=baseAngle+curl+fraction*spread+(((seed>>>8)&255)/255-.5)*.22;
      const bend=distance*(.78+((seed>>>16)&63)/150);
      const sway=(((seed>>>2)&255)/255-.5)*Math.min(26,distance*.17);
      const x=parent.x+Math.cos(angle)*bend-Math.sin(angle)*sway;
      const y=parent.y+Math.sin(angle)*bend+Math.cos(angle)*sway;
      const node={id:child.id,title:child.title,x,y,r:Math.max(2.1,7.8-depth*1.12),level:depth,data:child,rootId,parent:parent.id,colorKey:COLOR_KEYS[rootId]||"bio",angle};
      if(byId.has(node.id))throw new Error("Duplicate public explorer node id: "+node.id);
      nodes.push(node);byId.set(node.id,node);edges.push({a:parent,b:node,depth,seed});
      walk(child,node,depth+1,angle+Math.sin(seed*.00001)*.13,rootId);
    });
  };
  tree.forEach((universe,index)=>{
    if(!universe.id||!universe.title)throw new Error("Every scientific universe needs an id and title.");
    const arm=ARM_BY_INDEX.get(index);
    if(!arm)throw new Error("Every scientific universe must belong to a mycelial arm.");
    const [x,y]=arm.point,angle=Math.atan2(y,x);
    const root={id:universe.id,title:universe.title,x,y,r:16,level:0,data:universe,rootId:universe.id,parent:center.id,colorKey:COLOR_KEYS[universe.id]||"bio",angle};
    if(byId.has(root.id))throw new Error("Duplicate public explorer universe id: "+root.id);
    nodes.push(root);byId.set(root.id,root);
    edges.push({a:center,b:root,depth:0,seed:hash("hub|"+root.id),hubLink:true,arm:arm.id,branchPoint:arm.junction});
    walk(universe,root,1,angle,universe.id);
  });
  const relationPairs=new Set();
  let verifiedRelations=0,explicitRelations=0,contentRelations=0;
  const addIndex=(id,entry)=>{if(!relationIndex.has(id))relationIndex.set(id,[]);relationIndex.get(id).push(entry);};
  for(const universe of tree){
    const source=byId.get(universe.id);
    for(const relation of universe.relations||[]){
      const target=byId.get(relation.target);
      if(!target||target.level!==0||target.id===source.id||target.id===center.id)continue;
      const key=[source.id,target.id].sort().join("|");
      if(relationPairs.has(key))continue;
      relationPairs.add(key);
      const basis=relation.basis==="notion-link"?"notion-link":"page-content";
      edges.push({a:source,b:target,depth:0,cross:true,verified:true,basis,label:relation.label,evidence:relation.evidence,seed:hash(key)});
      verifiedRelations++;
      if(basis==="notion-link")explicitRelations++;else contentRelations++;
      addIndex(source.id,{target:target.id,label:relation.label,basis,evidence:relation.evidence});
      addIndex(target.id,{target:source.id,label:relation.label,basis,evidence:relation.evidence});
    }
  }
  return {nodes,edges,byId,relationIndex,stats:{universeCount:tree.length,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations,explicitRelations,contentRelations,crossUniverseConnections:relationPairs.size,mycologyArms:ARMS.length,localAnastomoses:0}};
}
