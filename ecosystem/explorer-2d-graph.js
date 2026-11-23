// Public-site graph topology: one continuous, fractal organism with eight autonomous territories.
// Kept separate from ecosystem-core so the Academy's graph geometry is not changed.
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Eight irregular inoculation points are anchored around the central mycology tissue.
// Unequal distances and angles avoid a radial ring while preserving stable brand positions.
const ANCHORS=[
  {x:-430,y:-112,angle:-2.88},
  {x:-145,y:-355,angle:-1.97},
  {x:310,y:-282,angle:-0.78},
  {x:505,y:48,angle:0.10},
  {x:285,y:385,angle:0.93},
  {x:-72,y:485,angle:1.72},
  {x:-455,y:280,angle:2.59},
  {x:-520,y:12,angle:3.12}
];
const COLOR_KEYS={
  microbiology:"bio",plants:"soil",ecology:"lab",bioprocesses:"products",
  biomaterials:"iot",instrumentation:"work",digital:"evidence",physical:"myco"
};

export function createPublicMycologyNetwork(tree,hub){
  if(!Array.isArray(tree)||tree.length!==8)throw new Error("The public explorer requires exactly eight scientific universes.");
  if(!hub||typeof hub.id!=="string"||typeof hub.url!=="string")throw new Error("A valid public mycology hub is required.");
  const nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
  // The logo is the identity origin; mycology is a distinct tissue immediately around it.
  const brand={id:"balabs-identity",title:"BA Labs",x:0,y:0,r:29,level:0,data:{kind:"identity"},rootId:"balabs-identity",colorKey:"publicCore",parent:null,identity:true};
  const center={id:"mycology-center",title:hub.title,x:0,y:78,r:23,level:0,generation:0,data:{...hub,children:tree},rootId:"mycology-center",colorKey:"publicCore",parent:brand.id};
  nodes.push(brand,center);byId.set(brand.id,brand);byId.set(center.id,center);
  edges.push({a:brand,b:center,depth:0,generation:0,seed:hash("identity|mycology"),identityLink:true,primaryHypha:true});

  // Each knowledge branch grows recursively from its own inoculation point.
  // Seeded angular drift creates a controlled fractal morphology without filler.
  const walk=(data,parent,depth,baseAngle,rootId,inoculationIndex)=>{
    const kids=data.children||[];
    if(!kids.length)return;
    const parentSeed=hash(parent.id);
    const spread=clamp(0.44+Math.log2(kids.length+1)*0.16,0.5,1.35);
    const distance=depth===1?154+Math.sqrt(kids.length)*17:depth===2?126+Math.sqrt(kids.length)*19:depth===3?86:Math.max(30,48-depth*2.1);
    kids.forEach((child,index)=>{
      const seed=hash(child.id),side=index%2===0?-1:1;
      const fraction=kids.length===1?(((seed>>>9)&255)/255-.5)*0.3:index/(kids.length-1)-.5;
      const localDrift=(((seed>>>8)&255)/255-.5)*0.28;
      const inheritedDrift=Math.sin((parentSeed%10000)*0.00071+depth*0.79)*0.08;
      const angle=baseAngle+fraction*spread+localDrift+inheritedDrift;
      const length=distance*(0.76+((seed>>>16)&63)/160);
      const lateral=side*distance*(0.76+((seed>>>2)&255)/255*0.30);
      const x=parent.x+Math.cos(angle)*length-Math.sin(angle)*lateral;
      const y=parent.y+Math.sin(angle)*length+Math.cos(angle)*lateral;
      const node={id:child.id,title:child.title,x,y,r:Math.max(1.8,7.6-depth*1.08),level:depth,generation:depth,data:child,rootId,parent:parent.id,colorKey:COLOR_KEYS[rootId],angle,inoculationIndex};
      if(byId.has(node.id))throw new Error("Duplicate public explorer node id: "+node.id);
      nodes.push(node);byId.set(node.id,node);
      edges.push({a:parent,b:node,depth,generation:depth,branchOrder:index,fractal:true,seed});
      const inheritedSplit=side*(0.14+((seed>>>20)&31)/96);
      walk(child,node,depth+1,angle+inheritedSplit,rootId,inoculationIndex);
    });
  };

  tree.forEach((universe,index)=>{
    if(!universe.id||!universe.title)throw new Error("Every scientific universe needs an id and title.");
    const anchor=ANCHORS[index];
    const root={id:universe.id,title:universe.title,x:anchor.x,y:anchor.y,r:16,level:0,generation:0,data:universe,rootId:universe.id,parent:center.id,colorKey:COLOR_KEYS[universe.id],angle:anchor.angle,inoculationIndex:index,fractal:true};
    if(byId.has(root.id))throw new Error("Duplicate public explorer universe id: "+root.id);
    nodes.push(root);byId.set(root.id,root);
    edges.push({a:center,b:root,depth:0,generation:1,seed:hash("inoculation|"+root.id),hubLink:true,primaryHypha:true,inoculationIndex:index});
    walk(universe,root,1,anchor.angle,universe.id,index);
  });

  // Transverse hyphae may connect any two knowledge nodes in different territories.
  // Relations are read recursively; no decorative or nearest-neighbour edges are invented.
  const relationPairs=new Set();let verifiedRelations=0,explicitRelations=0,contentRelations=0;
  const addIndex=(id,entry)=>{if(!relationIndex.has(id))relationIndex.set(id,[]);relationIndex.get(id).push(entry);};
  const knowledgeNodes=nodes.filter(node=>node.level>=0&&node.data?.relations?.length);
  for(const source of knowledgeNodes){
    for(const relation of source.data.relations){
      const target=byId.get(relation.target);
      if(!target||target.id===source.id||target.id===center.id||source.rootId===target.rootId)continue;
      const key=[source.id,target.id].sort().join("|");
      if(relationPairs.has(key))continue;
      relationPairs.add(key);
      const basis=relation.basis==="notion-link"?"notion-link":"page-content";
      edges.push({a:source,b:target,depth:Math.max(source.level,target.level),generation:Math.max(source.level,target.level)+1,cross:true,verified:true,basis,label:relation.label,evidence:relation.evidence,seed:hash(key)});
      verifiedRelations++;
      if(basis==="notion-link")explicitRelations++;else contentRelations++;
      addIndex(source.id,{target:target.id,label:relation.label,basis,evidence:relation.evidence});
      addIndex(target.id,{target:source.id,label:relation.label,basis,evidence:relation.evidence});
    }
  }
  return {nodes,edges,byId,relationIndex,stats:{universeCount:tree.length,inoculationPoints:ANCHORS.length,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations,explicitRelations,contentRelations,crossUniverseConnections:relationPairs.size,localAnastomoses:0}};
}
