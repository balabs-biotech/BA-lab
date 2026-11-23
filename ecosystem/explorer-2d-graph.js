// Public-site graph topology: one connected organism with eight autonomous inoculation territories.
// Kept separate from ecosystem-core so the Academy's graph geometry is not changed.
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};

const ANCHORS=[
  {x:-12,y:-405,angle:-Math.PI/2,radius:405},
  {x:286,y:-286,angle:-Math.PI/4,radius:405},
  {x:430,y:-38,angle:-.09,radius:432},
  {x:305,y:304,angle:.79,radius:431},
  {x:38,y:438,angle:1.48,radius:440},
  {x:-322,y:286,angle:2.42,radius:431},
  {x:-438,y:-42,angle:3.24,radius:440},
  {x:-300,y:-300,angle:3.93,radius:424}
];
const COLOR_KEYS={
  microbiology:"bio",plants:"soil",ecology:"lab",bioprocesses:"products",
  biomaterials:"iot",instrumentation:"work",digital:"evidence",physical:"myco"
};

export function createPublicMycologyNetwork(tree,hub){
  if(!Array.isArray(tree)||tree.length!==8)throw new Error("The public explorer requires exactly eight scientific universes.");
  if(!hub||typeof hub.id!=="string"||typeof hub.url!=="string")throw new Error("A valid public mycology hub is required.");
  const nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
  const brand={id:"balabs-identity",title:"BA Labs",x:0,y:0,r:29,level:0,data:{kind:"identity"},rootId:"balabs-identity",colorKey:"publicCore",parent:null,identity:true};
  const center={id:"mycology-center",title:hub.title,x:0,y:0,r:23,level:0,data:{...hub,children:tree},rootId:"mycology-center",colorKey:"publicCore",parent:brand.id};
  nodes.push(brand,center);byId.set(brand.id,brand);byId.set(center.id,center);
  edges.push({a:brand,b:center,depth:0,generation:0,seed:hash("identity|mycology"),identityLink:true});
  const walk=(data,parent,depth,baseAngle,rootId)=>{
    const kids=data.children||[];
    if(!kids.length)return;
    const spread=Math.min(2.45,1.05+Math.log2(kids.length+1)*.4);
    kids.forEach((child,index)=>{
      const seed=hash(child.id),fraction=kids.length===1?0:index/(kids.length-1)-.5;
      const angle=baseAngle+fraction*spread+(((seed>>>8)&255)/255-.5)*.32;
      const distance=depth===1?145:depth===2?108:depth===3?76:Math.max(32,54-depth*2);
      const length=distance*(.76+((seed>>>16)&63)/160);
      const sway=(((seed>>>2)&255)/255-.5)*Math.min(34,distance*.28);
      const x=parent.x+Math.cos(angle)*length-Math.sin(angle)*sway;
      const y=parent.y+Math.sin(angle)*length+Math.cos(angle)*sway;
      const node={id:child.id,title:child.title,x,y,r:Math.max(2.1,7.8-depth*1.12),level:depth,generation:depth,data:child,rootId,parent:parent.id,colorKey:COLOR_KEYS[rootId],angle};
      if(byId.has(node.id))throw new Error("Duplicate public explorer node id: "+node.id);
      nodes.push(node);byId.set(node.id,node);
      edges.push({a:parent,b:node,depth,generation:depth,seed});
      walk(child,node,depth+1,angle+Math.sin(seed*.00001)*.19,rootId);
    });
  };
  tree.forEach((universe,index)=>{
    if(!universe.id||!universe.title)throw new Error("Every scientific universe needs an id and title.");
    const anchor=ANCHORS[index];
    const root={id:universe.id,title:universe.title,x:anchor.x,y:anchor.y,r:16,level:0,generation:0,data:universe,rootId:universe.id,parent:center.id,colorKey:COLOR_KEYS[universe.id],angle:anchor.angle,inoculationIndex:index};
    if(byId.has(root.id))throw new Error("Duplicate public explorer universe id: "+root.id);
    nodes.push(root);byId.set(root.id,root);
    edges.push({a:center,b:root,depth:0,generation:1,seed:hash("inoculation|"+root.id),hubLink:true,primaryHypha:true});
    walk(universe,root,1,anchor.angle,universe.id);
  });
  const relationPairs=new Set();let verifiedRelations=0,explicitRelations=0,contentRelations=0;
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
      edges.push({a:source,b:target,depth:0,generation:1,cross:true,verified:true,basis,label:relation.label,evidence:relation.evidence,seed:hash(key)});
      verifiedRelations++;
      if(basis==="notion-link")explicitRelations++;else contentRelations++;
      addIndex(source.id,{target:target.id,label:relation.label,basis,evidence:relation.evidence});
      addIndex(target.id,{target:source.id,label:relation.label,basis,evidence:relation.evidence});
    }
  }
  return {nodes,edges,byId,relationIndex,stats:{universeCount:tree.length,inoculationPoints:tree.length,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations,explicitRelations,contentRelations,crossUniverseConnections:relationPairs.size,localAnastomoses:0}};
}
