// Shared graph geometry for the BA Labs Academy and public Notion explorers.
// Both spaces share branching, relaxation and anastomosis rules. Root anchor
// fields and territory mass are configurable for graphs with different root counts.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};


/**
 * Organic territory packing + local collision relaxation.
 * The knowledge graph is immutable here: only visual coordinates are adjusted.
 */
function packRootTerritories(nodes,tree,options={}){
 const roots=nodes.filter(n=>n.level===0);
 if(roots.length<2)return;
 const original=new Map(roots.map(r=>[r.id,{x:r.x,y:r.y}]));
 // Keep root territories identical across the public and Academy trees.
 // Content depth must not move the eight shared universe anchors.
 const territoryMass=Number.isFinite(options.rootTerritoryMass)?Math.max(1,options.rootTerritoryMass):144;
 const mass=new Map(tree.map(root=>[root.id,territoryMass]));
 const radius=r=>92+Math.sqrt(mass.get(r.id)||1)*8.5;
 for(let pass=0;pass<34;pass++){
  const shifts=new Map(roots.map(r=>[r.id,{x:0,y:0}]));
  for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++){
   const a=roots[i],b=roots[j],dx=b.x-a.x,dy=b.y-a.y;
   let d=Math.hypot(dx,dy);
   const min=radius(a)+radius(b)+34;
   if(d>=min)continue;
   if(d<.001){const h=hash(a.id+"|"+b.id);d=1;const angle=(h%6283)/1000;const ux=Math.cos(angle),uy=Math.sin(angle);shifts.get(a.id).x-=ux*8;shifts.get(a.id).y-=uy*8;shifts.get(b.id).x+=ux*8;shifts.get(b.id).y+=uy*8;continue;}
   const force=Math.min(8,(min-d)*.17),ux=dx/d,uy=dy/d;
   shifts.get(a.id).x-=ux*force;shifts.get(a.id).y-=uy*force;
   shifts.get(b.id).x+=ux*force;shifts.get(b.id).y+=uy*force;
  }
  for(const root of roots){
   const s=shifts.get(root.id),base=original.get(root.id);
   root.x+=s.x+(base.x-root.x)*.035;
   root.y+=s.y+(base.y-root.y)*.035;
  }
 }
 for(const root of roots){
  const dx=root.x-original.get(root.id).x,dy=root.y-original.get(root.id).y;
  for(const n of nodes)if(n.rootId===root.id){n.x+=dx;n.y+=dy;}
 }
}
function relaxBiologicalMorphology(nodes,edges){
 const parentPairs=new Set(edges.filter(e=>!e.cross).map(e=>[e.a.id,e.b.id].sort().join("|")));
 const branchParents=new Set(edges.filter(e=>!e.cross).map(e=>e.a.id));
 const leaves=nodes.filter(n=>n.level>0&&!branchParents.has(n.id));
 const leafIds=new Set(leaves.map(n=>n.id));
 const cellSize=96;
 for(let pass=0;pass<22;pass++){
  const grid=new Map();
  for(const n of nodes){
   const key=Math.floor(n.x/cellSize)+":"+Math.floor(n.y/cellSize);
   if(!grid.has(key))grid.set(key,[]);
   grid.get(key).push(n);
  }
  const delta=new Map(nodes.map(n=>[n.id,{x:0,y:0,count:0}]));
  for(const a of nodes){
   const gx=Math.floor(a.x/cellSize),gy=Math.floor(a.y/cellSize);
   for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
    const bucket=grid.get((gx+ox)+":"+(gy+oy));if(!bucket)continue;
    for(const b of bucket){
     if(a.id>=b.id)continue;
     const bothTerminal=leafIds.has(a.id)&&leafIds.has(b.id);
     const sameTerritory=a.rootId===b.rootId;
     // Keep root territories distinct while allowing a gentle repulsion
     // between neighbouring branches that drift across territory boundaries.
     if(!sameTerritory&&a.level===0&&b.level===0)continue;
     if(sameTerritory&&parentPairs.has([a.id,b.id].sort().join("|")))continue;
     const dx=b.x-a.x,dy=b.y-a.y;
     let d=Math.hypot(dx,dy);
     const min=bothTerminal?82:sameTerritory?Math.max(23,a.r+b.r+13):Math.max(34,a.r+b.r+22);
     if(d>=min)continue;
     if(d<.001){const h=hash(a.id+"|"+b.id),angle=(h%6283)/1000;d=1;
      const ux=Math.cos(angle),uy=Math.sin(angle),f=bothTerminal?4:2;
      const da=delta.get(a.id),db=delta.get(b.id);
      if(a.level>0){da.x-=ux*f;da.y-=uy*f;da.count++;}
      if(b.level>0){db.x+=ux*f;db.y+=uy*f;db.count++;}
      continue;
     }
     const force=Math.min(bothTerminal?(sameTerritory?7:2.4):(sameTerritory?3.2:1.35),(min-d)*(bothTerminal?(sameTerritory?.24:.10):(sameTerritory?.16:.09)));
     const ux=dx/d,uy=dy/d;
     const wa=a.level===0?0:leafIds.has(a.id)?.78:.42;
     const wb=b.level===0?0:leafIds.has(b.id)?.78:.42;
     const total=wa+wb;if(!total)continue;
     const da=delta.get(a.id),db=delta.get(b.id);
     da.x-=ux*force*wa/total;da.y-=uy*force*wa/total;da.count++;
     db.x+=ux*force*wb/total;db.y+=uy*force*wb/total;db.count++;
    }
   }
  }
  for(const n of nodes){
   if(n.level===0)continue;
   const d=delta.get(n.id),length=Math.hypot(d.x,d.y);
   if(!length)continue;
   const cap=leafIds.has(n.id)?5.5:2.8,scale=Math.min(1,cap/length);
   n.x+=d.x*scale;n.y+=d.y*scale;
  }
 }
}

export function createVernpixiNetwork(tree,options={}){
 let nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
  nodes=[];edges=[];byId.clear();
  const roots=tree.length;
  const rootLayoutIds=options.rootLayoutIds||tree.map(root=>root.id);
  // Uneven biological field anchors: deliberately not an eight-spoke radial layout.
  // Stable per-universe jitter keeps positions deterministic across reloads.
  const anchors=options.rootAnchors||[[-.62,-.34],[-.17,-.62],[.39,-.48],[.68,.08],[.24,.53],[-.34,.57],[-.70,.19],[.02,-.02]];
  tree.forEach((root,i)=>{
   const anchor=anchors[i%anchors.length],layoutId=rootLayoutIds[i%rootLayoutIds.length],seed=hash(layoutId);
   const rx=anchor[0]*510+((seed&255)/255-.5)*58;
   const ry=anchor[1]*430+(((seed>>>8)&255)/255-.5)*54;
   const angle=Math.atan2(ry,rx)+(((seed>>>16)&255)/255-.5)*.34;
   const rootNode={id:root.id,title:root.title,x:rx,y:ry,r:12,level:0,data:root,rootId:root.id,colorKey:layoutId,parent:null,angle};
   nodes.push(rootNode);byId.set(root.id,rootNode);
   const walk=(data,parent,depth,branchAngle,path)=>{
    const kids=data.children||[];if(!kids.length)return;
    const spread=Math.min(2.45,1.05+Math.log2(kids.length+1)*.42);
    const dist=depth===1?195+Math.sqrt(kids.length)*12:depth===2?160+Math.sqrt(kids.length)*28:depth===3?86+Math.sqrt(kids.length)*16:Math.max(29,47-depth*2);
    kids.forEach((child,j)=>{
     const hsh=hash(child.id),fraction=kids.length===1?0:(j/(kids.length-1)-.5);
     const jitter=((hsh%1000)/1000-.5)*.3;
     // A smooth, position-dependent curl field bends neighbouring hyphae in related,
     // but not identical, directions. This avoids a repeated starburst at every node.
     const fieldX=Math.sin(parent.x*.0021+parent.y*.0013+depth*.73);
     const fieldY=Math.cos(parent.y*.0018-parent.x*.0011-depth*.51);
     const curl=Math.atan2(fieldY,fieldX)*.22;
     const a=branchAngle+curl+fraction*spread+jitter;
     const bend=dist*(.72+((hsh>>>8)%56)/100);
     const lateral=((hsh>>>17)&255)/255-.5;
     const sway=depth>1?lateral*Math.min(22,dist*.16):0;
     const x=parent.x+Math.cos(a)*bend-Math.sin(a)*sway,y=parent.y+Math.sin(a)*bend+Math.cos(a)*sway;
     const n={id:child.id,title:child.title,x,y,r:Math.max(2.1,8-depth*1.25),level:depth,data:child,rootId:root.id,colorKey:layoutId,parent:parent.id,angle:a};
     nodes.push(n);byId.set(n.id,n);edges.push({a:parent,b:n,depth,seed:hsh});
     const nextDrift=Math.sin((n.x+n.y)*.0017+hsh*.000001)*.16;
     walk(child,n,depth+1,a+(fraction*.22)+jitter*.45+nextDrift,path.concat(child.id));
    });
   };
   walk(root,rootNode,1,angle,[]);
  });
  // Rebalance root territories, then relax local crowding. Leaf tips stay present
  // in the topology but receive a stronger minimum separation in visual space.
  packRootTerritories(nodes,tree,options);
  relaxBiologicalMorphology(nodes,edges);
  // Cross-universe connections come only from the Notion relation manifest.
  // page-content links are explicitly distinguished from direct Notion hyperlinks.
  relationIndex=new Map();const relationPairs=new Set();
  let verifiedRelationCount=0,explicitRelationCount=0,contentRelationCount=0;
  const addRelationIndex=(id,entry)=>{if(!relationIndex.has(id))relationIndex.set(id,[]);relationIndex.get(id).push(entry);};
  tree.forEach(root=>{
   const source=byId.get(root.id);if(!source)return;
   for(const relation of root.relations||[]){
    const target=byId.get(relation.target);if(!target||target.level!==0||target.id===source.id)continue;
    const key=[source.id,target.id].sort().join("|");if(relationPairs.has(key))continue;
    relationPairs.add(key);
    const basis=relation.basis==="notion-link"?"notion-link":"page-content";
    edges.push({a:source,b:target,depth:0,cross:true,verified:true,basis,label:relation.label,evidence:relation.evidence,seed:hash(key)});
    verifiedRelationCount++;
    if(basis==="notion-link")explicitRelationCount++;else contentRelationCount++;
    addRelationIndex(source.id,{target:target.id,label:relation.label,basis,evidence:relation.evidence});
    addRelationIndex(target.id,{target:source.id,label:relation.label,basis,evidence:relation.evidence});
   }
  });
  const crossUniverseConnections=relationPairs.size;
  // Local anastomoses follow spatial proximity, not array order. Each hypha can
  // form one restrained side-connection at its depth, creating irregular meshes
  // while avoiding long chords and the visual regularity of a grid.
  const levels=new Map();
  nodes.filter(n=>n.level>0).forEach(n=>{const k=n.rootId+":"+n.level;if(!levels.has(k))levels.set(k,[]);levels.get(k).push(n)});
  let localAnastomoses=0;
  levels.forEach(group=>{
   if(group.length<4)return;
   const candidates=[];
   const nearestDistances=[];
   group.forEach((a,i)=>{
    const nearby=group.filter((b,j)=>j!==i)
     .map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)}))
     .sort((x,y)=>x.d-y.d).slice(0,3);
    if(nearby.length)nearestDistances.push(nearby[0].d);
    nearby.forEach(pair=>candidates.push(pair));
   });
   nearestDistances.sort((a,b)=>a-b);
   const median=nearestDistances[Math.floor(nearestDistances.length/2)]||60;
   const maxDistance=clamp(median*2.8,48,175);
   candidates.sort((a,b)=>a.d-b.d);
   const degree=new Map(),existing=new Set();
   for(const edge of edges){if(!edge.cross)continue;existing.add([edge.a.id,edge.b.id].sort().join("|"));}
   for(const pair of candidates){
    if(pair.d>maxDistance)break;
    if((degree.get(pair.a.id)||0)>=1||(degree.get(pair.b.id)||0)>=1)continue;
    const key=[pair.a.id,pair.b.id].sort().join("|");
    if(existing.has(key))continue;
    edges.push({a:pair.a,b:pair.b,depth:pair.a.level,cross:true,seed:hash(key)});
    existing.add(key);degree.set(pair.a.id,1);degree.set(pair.b.id,1);localAnastomoses++;
   }
  });
 return {nodes,edges,byId,relationIndex,stats:{universeCount:roots,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations:verifiedRelationCount,explicitRelations:explicitRelationCount,contentRelations:contentRelationCount,crossUniverseConnections,localAnastomoses}};
}
