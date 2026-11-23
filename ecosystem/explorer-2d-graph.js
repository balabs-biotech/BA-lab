// Public-site-only graph builder: a continuous, fractal mycelial organism.
// The eight territories inoculate independently around the BA Labs / mycology core.
// Deliberately separate from ecosystem-core so the Academy keeps its own topology.
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};

// Eight stable inoculation points follow the brand's eight-point composition.
// They are intentionally irregular: no three-arm grouping, radial ring or equal spacing.
const INOCULATION_POINTS=[
  {x:-430,y:-190,angle:-2.72},
  {x:-65,y:-390,angle:-1.72},
  {x:330,y:-275,angle:-0.72},
  {x:485,y:65,angle:0.12},
  {x:305,y:390,angle:0.88},
  {x:-80,y:475,angle:1.74},
  {x:-445,y:300,angle:2.55},
  {x:-535,y:25,angle:3.10}
];
const COLOR_KEYS={
  mycology:"publicCore",microbiology:"bio",plants:"soil",ecology:"lab",
  bioprocesses:"products",biomaterials:"iot",instrumentation:"work",
  digital:"evidence",physical:"myco"
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function createPublicMycologyNetwork(tree,hub){
  if(!Array.isArray(tree)||tree.length!==8)throw new Error("The public explorer requires exactly eight scientific universes.");
  if(!hub||typeof hub.id!=="string"||typeof hub.url!=="string")throw new Error("A valid public mycology hub is required.");
  const nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
  const brand={id:"balabs-identity",title:"BA Labs",x:0,y:0,r:29,level:0,data:{kind:"identity"},rootId:"balabs-identity",colorKey:COLOR_KEYS.mycology,parent:null,angle:-Math.PI/2,identity:true};
  const center={id:"mycology-center",title:hub.title,x:0,y:78,r:22,level:0,data:{...hub,children:tree},rootId:"mycology-center",colorKey:COLOR_KEYS.mycology,parent:brand.id,angle:Math.PI/2};
  nodes.push(brand,center);byId.set(brand.id,brand);byId.set(center.id,center);
  edges.push({a:brand,b:center,depth:0,generation:0,seed:hash("identity|mycology"),identityLink:true,primaryHypha:true});

  // Each knowledge branch grows recursively from its own inoculation point.
  // Seeded angular drift makes the morphology organic yet reproducible.
  const walk=(data,parent,depth,baseAngle,rootId)=>{
    const kids=data.children||[];
    if(!kids.length)return;
    const parentSeed=hash(parent.id);
    const spread=clamp(0.92+Math.log2(kids.length+1)*0.39,1.05,2.55);
    const distance=depth===1?164+Math.sqrt(kids.length)*15:depth===2?132+Math.sqrt(kids.length)*18:depth===3?88:Math.max(30,48-depth*2.2);
    kids.forEach((child,index)=>{
      const seed=hash(child.id),fraction=kids.length===1?(((seed>>>9)&255)/255-.5)*0.28:index/(kids.length-1)-.5;
      const side=(index%2===0?-1:1);
      const localDrift=(((seed>>>8)&255)/255-.5)*0.34;
      const inheritedDrift=Math.sin((parentSeed%10000)*0.0007+depth*0.83)*0.12;
      const angle=baseAngle+fraction*spread+localDrift+inheritedDrift;
      const length=distance*(0.78+((seed>>>16)&63)/160);
      const lateral=(((seed>>>2)&255)/255-.5)*Math.min(34,distance*0.22);
      const x=parent.x+Math.cos(angle)*length-Math.sin(angle)*lateral;
      const y=parent.y+Math.sin(angle)*length+Math.cos(angle)*lateral;
      const node={id:child.id,title:child.title,x,y,r:Math.max(1.8,7.6-depth*1.08),level:depth,data:child,rootId,parent:parent.id,colorKey:COLOR_KEYS[rootId]||"bio",angle,inoculationIndex:INOCULATION_POINTS.findIndex((_,i)=>tree[i]?.id===rootId)};
      if(byId.has(node.id))throw new Error("Duplicate public explorer node id: "+node.id);
      nodes.push(node);byId.set(node.id,node);
      edges.push({a:parent,b:node,depth,generation:depth,branchOrder:index,fractal:true,seed});
      // Successive generations inherit their parent's growth direction, with
      // deterministic variation instead of a repeated geometric template.
      walk(child,node,depth+1,angle+side*(0.16+((seed>>>20)&31)/100),rootId);
    });
  };

  tree.forEach((universe,index)=>{
    if(!universe.id||!universe.title)throw new Error("Every scientific universe needs an id and title.");
    const anchor=INOCULATION_POINTS[index];
    const root={id:universe.id,title:universe.title,x:anchor.x,y:anchor.y,r:16,level:0,data:universe,rootId:universe.id,parent:center.id,colorKey:COLOR_KEYS[universe.id]||"bio",angle:anchor.angle,inoculationIndex:index};
    if(byId.has(root.id))throw new Error("Duplicate public explorer node id: "+root.id);
    nodes.push(root);byId.set(root.id,root);
    edges.push({a:center,b:root,depth:0,generation:1,seed:hash("inoculation|"+root.id),hubLink:true,primaryHypha:true,inoculationIndex:index});
    walk(universe,root,1,anchor.angle,universe.id);
  });

  // Transverse hyphae are added only when a Notion manifest documents a relation.
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
      edges.push({a:source,b:target,depth:0,generation:1,cross:true,verified:true,basis,label:relation.label,evidence:relation.evidence,seed:hash(key)});
      verifiedRelations++;
      if(basis==="notion-link")explicitRelations++;else contentRelations++;
      addIndex(source.id,{target:target.id,label:relation.label,basis,evidence:relation.evidence});
      addIndex(target.id,{target:source.id,label:relation.label,basis,evidence:relation.evidence});
    }
  }
  return {nodes,edges,byId,relationIndex,stats:{universeCount:tree.length,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations,explicitRelations,contentRelations,crossUniverseConnections:relationPairs.size,inoculationPoints:INOCULATION_POINTS.length,localAnastomoses:0}};
}
