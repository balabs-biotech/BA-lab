// Public-site graph topology: one continuous, fractal organism with eight autonomous territories.
// Kept separate from ecosystem-core so the Academy's graph geometry is not changed.
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Eight inoculation points form a true, evenly spaced first growth ring.
const ROOT_RING_RADIUS=430;
const SECTOR_HALF_ANGLE=.39;
const ANCHORS=Array.from({length:8},(_,index)=>{
  const angle=-Math.PI/2+index*Math.PI/4;
  return{x:Math.cos(angle)*ROOT_RING_RADIUS,y:Math.sin(angle)*ROOT_RING_RADIUS,angle};
});
const COLOR_KEYS={microbiology:"microbiology",plants:"plants",ecology:"ecology",bioprocesses:"bioprocesses",biomaterials:"biomaterials",instrumentation:"instrumentation",digital:"digital",physical:"physical"};
const countSubtree=node=>1+(node.children||[]).reduce((sum,child)=>sum+countSubtree(child),0);


function relaxPublicMorphology(nodes,edges){
  const parentEdges=edges.filter(edge=>!edge.cross);
  const parentPairs=new Set(parentEdges.map(edge=>[edge.a.id,edge.b.id].sort().join("|")));
  const branchParents=new Set(parentEdges.map(edge=>edge.a.id));
  const orderedNodes=[...nodes].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const terminalIds=new Set(orderedNodes.filter(node=>node.level>0&&!branchParents.has(node.id)).map(node=>node.id));
  const originalPositions=new Map(orderedNodes.map(node=>[node.id,{x:node.x,y:node.y}]));
  const movementBudgets=new Map(orderedNodes.map(node=>[node.id,Infinity]));
  for(const edge of parentEdges){
    const length=Math.hypot(edge.b.x-edge.a.x,edge.b.y-edge.a.y);
    movementBudgets.set(edge.a.id,Math.min(movementBudgets.get(edge.a.id),length*.03));
    movementBudgets.set(edge.b.id,Math.min(movementBudgets.get(edge.b.id),length*(terminalIds.has(edge.b.id)?.18:.075)));
  }
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
      const cap=terminalIds.has(node.id)?19:8.2,scale=Math.min(1,cap/length);
      const origin=originalPositions.get(node.id),budget=movementBudgets.get(node.id);
      const proposedX=node.x+shift.x*scale,proposedY=node.y+shift.y*scale;
      const totalX=proposedX-origin.x,totalY=proposedY-origin.y,totalLength=Math.hypot(totalX,totalY);
      const budgetScale=totalLength>budget?budget/totalLength:1;
      node.x=origin.x+totalX*budgetScale;node.y=origin.y+totalY*budgetScale;
      moved.add(node.id);
    }
  }
  const edgeLengthRatios=parentEdges.map(edge=>{
    const originA=originalPositions.get(edge.a.id),originB=originalPositions.get(edge.b.id);
    const originalLength=Math.hypot(originB.x-originA.x,originB.y-originA.y);
    const currentLength=Math.hypot(edge.b.x-edge.a.x,edge.b.y-edge.a.y);
    return currentLength/originalLength;
  });
  const maxParentEdgeStretchRatio=Math.max(1,...edgeLengthRatios);
  const minParentEdgeLengthRatio=Math.min(1,...edgeLengthRatios);
  return {movedNodes:moved.size,maxParentEdgeStretchRatio,minParentEdgeLengthRatio};
}

export function createPublicMycologyNetwork(tree,hub){
  if(!Array.isArray(tree)||tree.length!==8)throw new Error("The public explorer requires exactly eight scientific universes.");
  if(!hub||typeof hub.id!=="string"||typeof hub.url!=="string")throw new Error("A valid public mycology hub is required.");
  const nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
  // Mycology is the sole biological center. BA Labs remains the site identity,
  // not an extra graph node or a label competing with the central organism.
  const center={id:"mycology-center",title:hub.title,x:0,y:0,r:28,level:0,generation:0,data:{...hub,children:tree},rootId:"mycology-center",colorKey:"publicCore",parent:null};
  nodes.push(center);byId.set(center.id,center);

  // Each knowledge branch grows recursively from its own inoculation point.
  // Seeded angular drift creates a controlled fractal morphology without filler.
  const walk=(data,parent,depth,rootId,inoculationIndex)=>{
    const kids=[...(data.children||[])].sort((a,b)=>a.id.localeCompare(b.id));
    if(!kids.length)return;
    const territoryRadius=parent.territoryRadius||180;
    // Hyphae advance from the real parent, not from the global origin.
    // This preserves a constant local growth step while allowing each generation
    // to form a genuinely branching, tree-like colony instead of concentric fans.
    const inheritedMin=parent.sectorMin??parent.angle-SECTOR_HALF_ANGLE+.015;
    const inheritedMax=parent.sectorMax??parent.angle+SECTOR_HALF_ANGLE-.015;
    // Keep every child fan centred on its actual parent, while respecting the
    // non-overlapping territory lane inherited from the previous generation.
    const parentMin=Math.max(inheritedMin,parent.angle-.39);
    const parentMax=Math.min(inheritedMax,parent.angle+.39);
    // Allocate space by actual subtree complexity: a dense colony receives a wider
    // growth sector, while every sibling keeps a separate, non-overlapping lane.
    const gap=kids.length>1?Math.min(.006,(parentMax-parentMin)/(kids.length*3)):0;
    const usable=Math.max(0,parentMax-parentMin-gap*(kids.length-1));
    const growthLength=Math.max(165,Math.min(320,22/(2*Math.sin(Math.max(.001,usable/Math.max(1,kids.length))/2))));
    // Keep the eight inoculation fans stable; below that first ring, use a
    // sublinear branch-mass law so one dense subtree cannot starve smaller siblings.
    const masses=kids.map(child=>parent.level===0?countSubtree(child):Math.pow(countSubtree(child),0.35));
    const totalMass=masses.reduce((sum,mass)=>sum+mass,0)||1;
    let cursor=parentMin;
    const created=[];
    kids.forEach((child,index)=>{
      const seed=hash(child.id);
      const laneWidth=usable*masses[index]/totalMass;
      const sectorMin=cursor;
      const sectorMax=cursor+laneWidth;
      const angle=(sectorMin+sectorMax)/2;
      cursor=sectorMax+gap;
      const radialJitter=(((seed>>>16)&63)/63-.5)*(depth===1?5:depth===2?8:11);
      const radial=growthLength+radialJitter;
      const x=parent.x+Math.cos(angle)*radial;
      const y=parent.y+Math.sin(angle)*radial;
      const node={id:child.id,title:child.title,x,y,r:Math.max(1.8,7.6-depth*1.08),level:depth,generation:depth,data:child,rootId,parent:parent.id,colorKey:COLOR_KEYS[rootId],angle,sectorMin,sectorMax,inoculationIndex,territoryRadius};
      if(byId.has(node.id))throw new Error("Duplicate public explorer node id: "+node.id);
      nodes.push(node);byId.set(node.id,node);
      edges.push({a:parent,b:node,depth,generation:depth,branchOrder:index,fractal:true,seed});
      created.push(node);
    });
    // Each child inherits a local growth fan around its own axis, not the
    // narrow midpoint lane between siblings. This lets every generation branch
    // laterally while keeping the colony inside a bounded territory.
    const territoryCenter=ANCHORS[inoculationIndex].angle;
    const territoryHalfAngle=.62;
    const orderedFan=[...created].sort((a,b)=>a.angle-b.angle);
    orderedFan.forEach((node,index)=>{
      // Give every child a parent-centred fan, but divide the available
      // territory at the midpoints between sibling axes so descendant
      // subtrees remain disjoint instead of growing into one another.
      const previous=orderedFan[index-1];
      const next=orderedFan[index+1];
      const lower=previous?(previous.angle+node.angle)/2:territoryCenter-territoryHalfAngle;
      const upper=next?(node.angle+next.angle)/2:territoryCenter+territoryHalfAngle;
      node.sectorMin=Math.max(territoryCenter-territoryHalfAngle,lower);
      node.sectorMax=Math.min(territoryCenter+territoryHalfAngle,upper);
    });
    for(const node of created)walk(node.data,node,depth+1,rootId,inoculationIndex);
  };

  tree.forEach((universe,index)=>{
    if(!universe.id||!universe.title)throw new Error("Every scientific universe needs an id and title.");
    const anchor=ANCHORS[index];
    const territoryMass=countSubtree(universe)-1;
    const territoryScale=clamp(0.82+Math.sqrt(territoryMass)/15,0.9,1.62);
    const root={id:universe.id,title:universe.title,x:anchor.x,y:anchor.y,r:clamp(13+Math.sqrt(territoryMass)*0.72,15,25),level:0,generation:0,data:universe,rootId:universe.id,parent:center.id,colorKey:COLOR_KEYS[universe.id],angle:anchor.angle,inoculationIndex:index,territoryMass,territoryScale,territoryRadius:clamp(90+Math.sqrt(territoryMass)*30,150,300),sectorMin:anchor.angle-SECTOR_HALF_ANGLE+.015,sectorMax:anchor.angle+SECTOR_HALF_ANGLE-.015,fractal:true};
    if(byId.has(root.id))throw new Error("Duplicate public explorer universe id: "+root.id);
    nodes.push(root);byId.set(root.id,root);
    edges.push({a:center,b:root,depth:0,generation:1,seed:hash("inoculation|"+root.id),hubLink:true,primaryHypha:true,inoculationIndex:index});
    walk(universe,root,1,universe.id,index);
  });

  // Relax spatial crowding without moving the eight fixed inoculation anchors.
  const relaxation=relaxPublicMorphology(nodes,edges);

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
  return {nodes,edges,byId,relationIndex,stats:{universeCount:tree.length,inoculationPoints:ANCHORS.length,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations,explicitRelations,contentRelations,crossUniverseConnections:relationPairs.size,localAnastomoses:0,relaxedNodes:relaxation.movedNodes,maxParentEdgeStretchRatio:relaxation.maxParentEdgeStretchRatio,minParentEdgeLengthRatio:relaxation.minParentEdgeLengthRatio}};
}
