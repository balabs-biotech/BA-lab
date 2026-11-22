// Shared graph geometry for the BA Labs Academy and public Notion explorers.
// Both spaces use the same eight root anchors, branching field and anastomosis rules;
// only their Notion trees and optional root layout aliases differ.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0};

export function createVernpixiNetwork(tree,options={}){
 let nodes=[],edges=[],byId=new Map(),relationIndex=new Map();
 const anchorIds=options.rootLayoutIds||tree.map(root=>root.id);
  nodes=[];edges=[];byId.clear();
  const roots=tree.length;
  const rootLayoutIds=options.rootLayoutIds||tree.map(root=>root.id);
  // Uneven biological field anchors: deliberately not an eight-spoke radial layout.
  // Stable per-universe jitter keeps positions deterministic across reloads.
  const anchors=[[-.62,-.34],[-.17,-.62],[.39,-.48],[.68,.08],[.24,.53],[-.34,.57],[-.70,.19],[.02,-.02]];
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
  canvas.dataset.edgeCount=String(edges.length);
 return {nodes,edges,byId,relationIndex,stats:{universeCount:roots,nodeCount:nodes.length,edgeCount:edges.length,verifiedRelations:verifiedRelationCount,explicitRelations:explicitRelationCount,contentRelations:contentRelationCount,crossUniverseConnections,localAnastomoses}};
}
