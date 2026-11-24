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
const COLOR_KEYS={microbiology:"microbiology",plants:"plants",ecology:"ecology",bioprocesses:"bioprocesses",biomaterials:"biomaterials",instrumentation:"instrumentation",digital:"digital",physical:"physical"};
const countSubtree=node=>1+(node.children||[]).reduce((sum,child)=>sum+countSubtree(child),0);


function relaxPublicMorphology(nodes,edges){
  const parentPairs=new Set(edges.filter(edge=>!edge.cross).map(edge=>[edge.a.id,edge.b.id].sort().join("|")));
  const branchParents=new Set(edges.filter(edge=>!edge.cross).map(edge=>edge.a.id));
  const orderedNodes=[...nodes].sort((a,b)=>a.id.localeCompare(b.id));
  const terminalIds=new Set(orderedNodes.filter(node=>node.level>0&&!branchParents.has(node.id)).map(node=>node.id));
  const cellSize=104,moved=new Set();
  for(let pass=0;pass<20;pass++){
    const grid=new Map();
    for(const node of orderedNodes){
      const key=Math.floor(node.x/cellSize)+":"+Math.floor(node.y/cellSize);
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(node);
    }
    const delta=new Map(orderedNodes.map(node=>[node.id,{x:0,y:0}]));
    for(const a of orderedNodes){
      const gx=Math.floor(a.x/cellSize),gy=Math.floor(a.y/cellSize);
      for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
        const bucket=grid.get((gx+ox)+":"+(gy+oy));if(!bucket)continue;
        for(const b of bucket){
          if(a.id>=b.id||a.level===0&&b.level===0)continue;
          const sameTerritory=a.rootId===b.rootId;
          if(sameTerritory&&parentPairs.has([a.id,b.id].sort().join("|")))continue;
          const bothTerminal=terminalIds.has(a.id)&&terminalIds.has(b.id);
          const dx=b.x-a.x,dy=b.y-a.y;
          let distance=Math.hypot(dx,dy);
          const minimum=bothTerminal?(sameTerritory?76:52):(sameTerritory?Math.max(25,a.r+b.r+12):Math.max(38,a.r+b.r+24));
          if(distance>=minimum)continue;
          let ux,uy;
          if(distance<.001){
            const seed=hash(a.id+"|"+b.id),angle=(seed%6283)/1000;
            ux=Math.cos(angle);uy=Math.sin(angle);distance=1;
          }else{ux=dx/distance;uy=dy/distance;}
          const force=Math.min(bothTerminal?(sameTerritory?6.5:2.8):(sameTerritory?3:1.4),(minimum-distance)*(bothTerminal?(sameTerritory?.22:.11):(sameTerritory?.15:.08)));
          const wa=a.level<=1?0:terminalIds.has(a.id)?.78:.42;
          const wb=b.level<=1?0:terminalIds.has(b.id)?.78:.42;
          const total=wa+wb;if(!total)continue;
          const da=delta.get(a.id),db=delta.get(b.id);
          da.x-=ux*force*wa/total;da.y-=uy*force*wa/total;
          db.x+=ux*force*wb/total;db.y+=uy*force*wb/total;
        }
      }
    }
    for(const node of orderedNodes){
      if(node.level===0)continue;
      const shift=delta.get(node.id),length=Math.hypot(shift.x,shift.y);
      if(!length)continue;
      const cap=terminalIds.has(node.id)?5:2.6,scale=Math.min(1,cap/length);
      node.x+=shift.x*scale;node.y+=shift.y*scale;moved.add(node.id);
    }
  }
  return moved.size;
}

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
    const territoryScale=parent.territoryScale||1;
    const territoryRadius=parent.territoryRadius||180;
    const envelopeFactor=clamp(territoryRadius/260,0.78,1.42);
    const baseSpread=depth===1?0.18:clamp(0.34+Math.log2(kids.length+1)*0.12,0.40,0.92);
    // Keep the inoculation fan stable; deeper bifurcations widen with the real territory envelope.
    const spread=baseSpread*(depth===1?1:envelopeFactor);
    const distance=(depth===1?154+Math.sqrt(kids.length)*17:depth===2?126+Math.sqrt(kids.length)*19:depth===3?86:Math.max(30,48-depth*2.1))*territoryScale;
    kids.forEach((child,index)=>{
      const seed=hash(child.id),side=(seed&1)===0?-1:1;
      // Stable ID-derived branch placement: appending Notion content must not rotate existing hyphae.
      const fraction=((seed>>>8)/0xffffff)-.5;
      const localDrift=(((seed>>>8)&255)/255-.5)*(depth===1?0.05:0.22);
      const inheritedDrift=Math.sin((parentSeed%10000)*0.00071+depth*0.79)*(depth===1?0.018:0.075);
      const angle=baseAngle+fraction*spread+localDrift+inheritedDrift;
      const length=distance*(0.76+((seed>>>16)&63)/160);
      const lateralRatio=depth===1?0.03+((seed>>>2)&255)/255*0.07:0.16+((seed>>>2)&255)/255*0.20;
      const lateral=side*Math.min(distance*lateralRatio*(depth===1?1:envelopeFactor),territoryRadius*(depth===1?0.10:0.30));
      const x=parent.x+Math.cos(angle)*length-Math.sin(angle)*lateral;
      const y=parent.y+Math.sin(angle)*length+Math.cos(angle)*lateral;
      const node={id:child.id,title:child.title,x,y,r:Math.max(1.8,7.6-depth*1.08),level:depth,generation:depth,data:child,rootId,parent:parent.id,colorKey:COLOR_KEYS[rootId],angle,inoculationIndex,territoryScale,territoryRadius};
      if(byId.has(node.id))throw new Error("Duplicate public explorer node id: "+node.id);
      nodes.push(node);byId.set(node.id,node);
      edges.push({a:parent,b:node,depth,generation:depth,branchOrder:index,fractal:true,seed});
      const inheritedSplit=side*(depth===1?0.04+((seed>>>20)&31)/220:0.12+((seed>>>20)&31)/120);
      walk(child,node,depth+1,angle+inheritedSplit,rootId,inoculationIndex);
    });
  };

  tree.forEach((universe,index)=>{
    if(!universe.id||!universe.title)throw new Error("Every scientific universe needs an id and title.");
    const anchor=ANCHORS[index];
    const territoryMass=countSubtree(universe)-1;
    const territoryScale=clamp(0.82+Math.sqrt(territoryMass)/15,0.9,1.62);
    const root={id:universe.id,title:universe.title,x:anchor.x,y:anchor.y,r:clamp(13+Math.sqrt(territoryMass)*0.72,15,25),level:0,generation:0,data:universe,rootId:universe.id,parent:center.id,colorKey:COLOR_KEYS[universe.id],angle:anchor.angle,inoculationIndex:index,territoryMass,territoryScale,territoryRadius:clamp(90+Math.sqrt(territoryMass)*30,150,300),fractal:true};
    if(byId.has(root.id))throw new Error("Duplicate public explorer universe id: "+root.id);
    nodes.push(root);byId.set(root.id,root);
    edges.push({a:center,b:root,depth:0,generation:1,seed:hash("inoculation|"+root.id),hubLink:true,primaryHypha:true,inoculationIndex:index});
    walk(universe,root,1,anchor.angle,universe.id,index);
  });

  // Relax spatial crowding without moving the eight fixed inoculation anchors.
  const relaxedNodes=relaxPublicMorphology(nodes,edges);

  // Give sibling hyphae a shared advancing trunk before they bifurcate.
  // The junction is geometric only: it adds no synthetic knowledge node or relation.
  const siblingEdges=new Map();
  for(const edge of edges.filter(item=>item.fractal)){
    if(!siblingEdges.has(edge.a.id))siblingEdges.set(edge.a.id,[]);
    siblingEdges.get(edge.a.id).push(edge);
  }
  for(const [parentId,group] of siblingEdges){
    if(group.length<2)continue;
    const parent=byId.get(parentId);
    const children=group.map(edge=>edge.b);
    const centroid=children.reduce((sum,node)=>({x:sum.x+node.x/children.length,y:sum.y+node.y/children.length}),{x:0,y:0});
    let dx=centroid.x-parent.x,dy=centroid.y-parent.y;
    let magnitude=Math.hypot(dx,dy);
    if(magnitude<1){dx=Math.cos(parent.angle||0);dy=Math.sin(parent.angle||0);magnitude=1;}
    const averageLength=group.reduce((sum,edge)=>sum+Math.hypot(edge.b.x-parent.x,edge.b.y-parent.y),0)/group.length;
    const advance=averageLength*.58;
    const branchPoint={x:parent.x+dx/magnitude*advance,y:parent.y+dy/magnitude*advance};
    for(const edge of group)edge.branchPoint=branchPoint;
  }

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
  return {nodes,edges,byId,relationIndex,stats:{universeCount:tree.length,inoculationPoints:ANCHORS.length,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations,explicitRelations,contentRelations,crossUniverseConnections:relationPairs.size,localAnastomoses:0,relaxedNodes}};
}
