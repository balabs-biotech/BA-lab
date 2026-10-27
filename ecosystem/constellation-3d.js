import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const root=document.getElementById('mainView');
if(root){
  const sphereEls=[...document.querySelectorAll('[data-sphere]')];
  const ids=['bio','myco','soil','lab','products','iot','work','learn'];
  const colors={bio:0x78b985,myco:0x9c82d4,soil:0xc18a4d,lab:0x579bd1,products:0xd87858,iot:0x8da6b8,work:0xb17caa,learn:0xb5b86c};
  const labels=Object.fromEntries(sphereEls.map(el=>[el.dataset.sphere,{title:el.querySelector('b')?.textContent||el.dataset.sphere,sub:el.querySelector('small')?.textContent||''}]));
  const stage=document.createElement('div');stage.className='webgl-stage';stage.setAttribute('role','application');stage.setAttribute('aria-label','Constellation 3D interactive BALabs');
  const hint=document.createElement('div');hint.className='webgl-hint';const hintText={fr:'GLISSER POUR TOURNER · PINCER POUR ZOOMER · TOUCHER UN UNIVERS',en:'DRAG TO ROTATE · PINCH TO ZOOM · TAP A WORLD',ar:'اسحب للتدوير · اقرص للتكبير · المس عالماً',pt:'ARRASTE PARA RODAR · PINÇA PARA ZOOM · TOQUE NUM UNIVERSO'};const refreshHint=()=>{hint.textContent=hintText[document.documentElement.lang]||hintText.fr};refreshHint();new MutationObserver(refreshHint).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const status=document.createElement('div');status.className='webgl-status';status.textContent='BALABS / SPATIAL KNOWLEDGE';
  const focusPanel=document.createElement('div');focusPanel.className='webgl-focus';focusPanel.setAttribute('aria-live','polite');focusPanel.innerHTML='<span class="webgl-focus-kicker">SPATIAL INDEX · 08 WORLDS</span><strong>BA Labs</strong><small>Choisis un univers pour explorer ses connexions.</small>';
  const controls=document.createElement('div');controls.className='webgl-controls';controls.setAttribute('aria-label','Commandes de navigation 3D');controls.innerHTML='<button type="button" data-camera="out" aria-label="Dézoomer" title="Dézoomer">−</button><button type="button" data-camera="in" aria-label="Zoomer" title="Zoomer">+</button><button type="button" data-camera="reset" aria-label="Recentrer la constellation" title="Recentrer">⌖</button>';stage.append(hint,status,focusPanel,controls);root.append(stage);
  let renderer,scene,camera,raycaster,mouse,core,points=[],edges=[],stars,dragging=false,moved=false,lastX=0,lastY=0,theta=.25,phi=1.18,dist=10.2,selected=null,raf=0,worldGroup,hovered=null,transition=null,cameraTarget=new THREE.Vector3(),resourceGroup=null,resourceMeshes=[],rotateVX=0,rotateVY=0,pointers=new Map(),pinchDistance=0;
  const material=(color,emissive=color)=>new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.62,metalness:.12,roughness:.3});
  const makeLabel=(text,color,size=26)=>{
    const cv=document.createElement('canvas'),ctx=cv.getContext('2d');cv.width=512;cv.height=128;
    ctx.clearRect(0,0,512,128);ctx.font='800 '+size+'px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const label=text.slice(0,34);ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle='rgba(7,12,16,.96)';ctx.strokeText(label,256,64,490);ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=14;ctx.shadowOffsetY=2;ctx.fillStyle='#f5f7fa';ctx.fillText(label,256,64,490);
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:false}));spr.scale.set(2.5,.62,1);spr.renderOrder=20;return spr;
  };
  function init(){
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Scène 3D BALabs');
      scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x07100b,.025);worldGroup=new THREE.Group();scene.add(worldGroup);
      camera=new THREE.PerspectiveCamera(48,1,.1,100);raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
      scene.add(new THREE.AmbientLight(0xb8c8dc,1.05));
      const key=new THREE.PointLight(0x7eb8f0,38,30);key.position.set(0,5,6);scene.add(key);
      const fill=new THREE.PointLight(0x69c8a6,26,24);fill.position.set(-6,-2,-4);scene.add(fill);
      const warm=new THREE.PointLight(0xffa45e,18,18);warm.position.set(5,-3,4);scene.add(warm);
      // No starfield, orbital rings or central planet: open directly on an irregular biological network.
      const pos={bio:[-1.1,2.35,.35],myco:[-2.65,1.05,.9],soil:[-.35,.85,-.85],lab:[-2.25,-.45,-.25],products:[1.15,.15,.85],iot:[2.75,1.35,-.35],work:[1.9,-1.35,-.7],learn:[-.15,-2.35,.3]};
      for(const id of ids){
        const color=colors[id],p=new THREE.Vector3(...pos[id]).multiplyScalar(.98);
        // Neural soma: a compact, softly glowing junction, not a planet with an orbit.
        const geo=new THREE.IcosahedronGeometry(.078,1),mat=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.45),emissiveIntensity:.28,metalness:0,roughness:.82,flatShading:true});
        const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(p);mesh.userData={kind:'sphere',id};mesh.scale.setScalar(1);worldGroup.add(mesh);
        // Short dendritic spines radiate from each soma and visually merge with the axon network.
        const twigs=[];
        for(let k=0;k<7;k++){
          const a=k*2.3999632297+ids.indexOf(id)*.43;
          const dir=new THREE.Vector3(Math.cos(a),Math.sin(a*.83),Math.sin(a*1.37+ids.indexOf(id))).normalize();
          const start=p.clone().addScaledVector(dir,.06);
          const end=p.clone().addScaledVector(dir,.25+(k%3)*.045);
          const mid=start.clone().lerp(end,.55).add(new THREE.Vector3(Math.sin(a)*.025,Math.cos(a*1.4)*.025,Math.sin(a*.7)*.025));
          const twigCurve=new THREE.QuadraticBezierCurve3(start,mid,end);
          const twig=new THREE.Line(new THREE.BufferGeometry().setFromPoints(twigCurve.getPoints(7)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.34,depthWrite:false}));
          twig.userData={kind:'dendrite',id};worldGroup.add(twig);twigs.push(twig);
        }
        const glow=new THREE.Mesh(new THREE.IcosahedronGeometry(.115,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.025,depthWrite:false,wireframe:true}));glow.position.copy(p);glow.userData.kind='glow';worldGroup.add(glow);
        const hitMesh=new THREE.Mesh(new THREE.SphereGeometry(.25,12,10),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.0001,depthWrite:false}));hitMesh.position.copy(p);hitMesh.userData={kind:'sphere',id};worldGroup.add(hitMesh);\n
        const label=makeLabel(labels[id].title,0xf5f7fa,25);label.position.set(p.x,p.y-.52,p.z+.08);label.scale.set(2.65,.52,1);label.userData={kind:'label',id,labelText:labels[id].title};worldGroup.add(label);
        const node={id,mesh,hitMesh,label,base:p,color,twigs};points.push(node);
        // A root soma has no artificial central-hub connection. Every other axon
        // links to its actual biological parent in the graph.
        const parentOf={bio:null,myco:'bio',soil:'myco',lab:'myco',products:'soil',iot:'products',work:'products',learn:'lab'};
        const parentNode=points.find(item=>item.id===parentOf[id]);
        if(parentNode){
          const origin=parentNode.base.clone();
          const edgeMat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.34,depthWrite:false});
          const midpoint=origin.clone().lerp(p,.5);
          const direction=new THREE.Vector3().crossVectors(origin.clone().add(new THREE.Vector3(.001,.002,.003)),p.clone().add(new THREE.Vector3(.013,.007,.019))).normalize();
          const bend=midpoint.addScaledVector(direction,.28+(ids.indexOf(id)%3)*.07).add(new THREE.Vector3(Math.sin(ids.indexOf(id)*1.7)*.15,Math.cos(ids.indexOf(id)*1.3)*.12,Math.cos(ids.indexOf(id)*1.1)*.16));
          const path=new THREE.QuadraticBezierCurve3(origin,bend,p);
          const geom=new THREE.BufferGeometry().setFromPoints(path.getPoints(32));
          const line=new THREE.Line(geom,edgeMat);line.userData={kind:'edge',id};worldGroup.add(line);
          const pulse=new THREE.Mesh(new THREE.IcosahedronGeometry(.022,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false}));
          pulse.userData={kind:'signal',id};worldGroup.add(pulse);
          edges.push({line,id,a:origin,b:p.clone(),pulse,phase:ids.indexOf(id)*.13,curve:path});
          // Side branches break the impression of straight spokes and form dendritic junctions.
          for(let branch=0;branch<2;branch++){
            const t=.38+branch*.25,anchor=path.getPoint(t),tangent=path.getTangent(t);
            const side=new THREE.Vector3(-tangent.y,tangent.x,Math.sin(ids.indexOf(id)+branch)*.65).normalize();
            const end=anchor.clone().addScaledVector(side,.3+branch*.08).addScaledVector(tangent,.16);
            const branchCurve=new THREE.QuadraticBezierCurve3(anchor,anchor.clone().addScaledVector(side,.17).addScaledVector(tangent,.09),end);
            const branchLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(branchCurve.getPoints(10)),new THREE.LineBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false}));
            branchLine.userData={kind:'dendrite',id};worldGroup.add(branchLine);
          }
        }
      }
      // Relations reflect the two editorial clusters stated in index.html:
      // biological foundations (bio/myco/soil/lab) and applications/transmission
      // (products/iot/work/learn). Cross-cluster links are limited to explicit
      // R&D-to-application and soil-to-project pathways, not decorative all-to-all links.
      // Sparse, meaningful cross-links: avoid the dense mesh of decorative all-to-all chords.
      const pairs=[
        ['bio','soil'],['myco','lab'],['soil','lab'],
        ['products','iot'],['iot','work'],['work','learn'],
        ['lab','products'],['soil','work'],['bio','learn']
      ];
      for(const [a,b] of pairs){const pa=points.find(p=>p.id===a),pb=points.find(p=>p.id===b);if(!pa||!pb)continue;
        const mid=pa.base.clone().lerp(pb.base,.5);
        const axis=new THREE.Vector3().crossVectors(pa.base,pb.base).normalize();
        mid.addScaledVector(axis,.16);
        const curve=new THREE.QuadraticBezierCurve3(pa.base,mid,pb.base);
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),new THREE.LineBasicMaterial({color:0xa9c5a3,transparent:true,opacity:.18,depthWrite:false}));
        line.userData={kind:'relation',a,b};worldGroup.add(line);
        const signalColor=new THREE.Color(colors[a]).lerp(new THREE.Color(colors[b]),.5);
        const pulse=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),new THREE.MeshBasicMaterial({color:signalColor,transparent:true,opacity:.72,depthWrite:false}));pulse.userData={kind:'relation-signal',a,b};worldGroup.add(pulse);
        edges.push({line,id:a,relation:true,aId:a,bId:b,a:pa.base.clone(),b:pb.base.clone(),pulse,curve,phase:(ids.indexOf(a)+ids.indexOf(b))*.071})}
      root.classList.add('webgl-ready','universe-open');root.classList.remove('universe-closed');worldGroup.visible=true;new MutationObserver(()=>{if(worldGroup)worldGroup.visible=!root.classList.contains('universe-closed');if(root.classList.contains('universe-closed'))clearResourceNodes()}).observe(root,{attributes:true,attributeFilter:['class']});
      const textObserver=new MutationObserver(()=>refreshLabels());sphereEls.forEach(el=>{const b=el.querySelector('b');if(b)textObserver.observe(b,{childList:true,characterData:true,subtree:true})});
      resize();bind();animate();
    }catch(e){stage.remove();console.warn('BALabs WebGL unavailable; accessible HTML fallback retained.',e)}
  }
  function resize(){if(!renderer||!camera)return;const w=stage.clientWidth||640,h=stage.clientHeight||680;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(!selected)dist=camera.aspect<.78?12.4:camera.aspect<1.05?11:10.2;updateCamera()}
  function updateCamera(){if(!camera)return;camera.position.set(cameraTarget.x+dist*Math.sin(phi)*Math.sin(theta),cameraTarget.y+dist*Math.cos(phi),cameraTarget.z+dist*Math.sin(phi)*Math.cos(theta));camera.lookAt(cameraTarget)}
  function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function refreshFocus(id){const p=points.find(item=>item.id===id);const lang=document.documentElement.lang||'fr';const copy={fr:{index:'INDEX SPATIAL · 08 UNIVERS',home:'Choisis un univers pour explorer ses connexions.',links:'Connexions',next:'Explorer aussi'},en:{index:'SPATIAL INDEX · 08 WORLDS',home:'Choose a world to explore its connections.',links:'Connections',next:'Explore next'},ar:{index:'الفهرس المكاني · ٨ عوالم',home:'اختر عالماً لاستكشاف الروابط بينه وبين العوالم الأخرى.',links:'روابط',next:'استكشف أيضاً'},pt:{index:'ÍNDICE ESPACIAL · 08 UNIVERSOS',home:'Escolha um universo para explorar as suas ligações.',links:'Ligações',next:'Explorar também'}}[lang]||{index:'SPATIAL INDEX · 08 WORLDS',home:'Choose a world to explore its connections.',links:'Connections',next:'Explore next'};if(!p){focusPanel.classList.remove('has-world');focusPanel.innerHTML='';const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';kicker.textContent=copy.index;const title=document.createElement('strong');title.textContent='BA Labs';const sub=document.createElement('small');sub.textContent=copy.home;const open=document.createElement('button');open.type='button';open.dataset.openUniverse='true';open.className='webgl-open-action';open.textContent=({fr:'Ouvrir la constellation',en:'Open constellation',ar:'افتح الكوكبة',pt:'Abrir constelação'}[lang]||'Ouvrir la constellation');open.style.cssText='align-self:flex-start;margin-top:5px;padding:8px 11px;border:1px solid #8eb68a88;border-radius:999px;background:#a9c5a31a;color:#eaf7e5;font:600 11px/1.2 system-ui,sans-serif;cursor:pointer;pointer-events:auto';focusPanel.append(kicker,title,sub);if(root.classList.contains('universe-closed')){focusPanel.append(open)}else{const worlds=document.createElement('div');worlds.className='webgl-focus-links';worlds.setAttribute('aria-label',lang==='ar'?'اختر عالماً':lang==='pt'?'Escolher um universo':lang==='en'?'Choose a world':'Choisir un univers');ids.forEach(worldId=>{const button=document.createElement('button');button.type='button';button.className='webgl-focus-link';button.dataset.world=worldId;button.textContent=labels[worldId].title;worlds.append(button)});focusPanel.append(worlds)}return}const related=[...new Set(edges.filter(edge=>edge.relation&&(edge.aId===id||edge.bId===id)).map(edge=>edge.aId===id?edge.bId:edge.aId))];focusPanel.classList.add('has-world');focusPanel.innerHTML='';const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';kicker.textContent='UNIVERS / '+String(ids.indexOf(id)+1).padStart(2,'0');const title=document.createElement('strong');title.textContent=labels[id].title;const sub=document.createElement('small');sub.textContent=labels[id].sub;const meta=document.createElement('span');meta.className='webgl-focus-meta';meta.textContent=copy.links+' · '+related.length;const next=document.createElement('span');next.className='webgl-focus-next';next.textContent=copy.next;const list=document.createElement('div');list.className='webgl-focus-links';related.forEach(other=>{const button=document.createElement('button');button.type='button';button.className='webgl-focus-link';button.dataset.world=other;button.textContent=labels[other].title;button.setAttribute('aria-label',(lang==='ar'?'استكشف ':lang==='pt'?'Explorar ':lang==='en'?'Explore ':'Explorer ')+labels[other].title);list.append(button)});focusPanel.append(kicker,title,sub,meta,next,list)}
  function flyTo(target,next){const start={x:cameraTarget.x,y:cameraTarget.y,z:cameraTarget.z,dist};const end=target?{x:target.position.x,y:target.position.y,z:target.position.z,dist:2.65}:{x:0,y:0,z:0,dist:11.8};transition={start,end,at:performance.now(),duration:980,next};selected=target?.userData?.id||null;refreshFocus(selected);stage.classList.add('is-transitioning')}
  function clearResourceNodes(){if(resourceGroup){worldGroup.remove(resourceGroup);resourceGroup.traverse(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}resourceGroup=null;resourceMeshes=[]}
  function buildResourceNodes(id){clearResourceNodes();const mini=document.getElementById('miniView');if(!mini||mini.hidden)return;const anchors=[...mini.querySelectorAll('.linknode')].filter(a=>a.href&&a.href!=='#'&&a.getAttribute('href')!=='#');if(!anchors.length)return;const parent=points.find(p=>p.id===id);if(!parent)return;resourceGroup=new THREE.Group();resourceGroup.userData.kind='resources';worldGroup.add(resourceGroup);const count=anchors.length,radius=1.45+count*.055,color=parent.color;anchors.forEach((a,i)=>{const angle=(i/count)*Math.PI*2-Math.PI/2;const p=new THREE.Vector3(parent.base.x+Math.cos(angle)*radius,parent.base.y+Math.sin(angle)*radius*.72,parent.base.z+Math.sin(angle*.8)*.48);const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.55,metalness:.15,roughness:.3}));mesh.position.copy(p);mesh.userData={kind:'resource',url:a.href,title:a.querySelector('b')?.textContent||a.textContent.trim()};resourceGroup.add(mesh);const label=makeLabel(mesh.userData.title,color,15);label.position.set(p.x,p.y-.24,p.z);label.scale.set(1.8,.32,1);label.userData.kind='resource-label';resourceGroup.add(label);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([parent.base,p]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.52}));resourceGroup.add(line);resourceMeshes.push(mesh)})}
  function refreshLabels(){for(const p of points){const el=document.querySelector('[data-sphere="'+p.id+'"]');if(!el)continue;const next=el.querySelector('b')?.textContent||p.id;if(p.label.userData.labelText===next)continue;p.label.userData.labelText=next;const old=p.label.material.map;const replacement=makeLabel(next,0xf5f7fa,27);p.label.material.map=replacement.material.map;p.label.material.needsUpdate=true;old?.dispose();replacement.material.dispose()}}
  function bind(){
    window.addEventListener('resize',resize);
    document.getElementById('homeBtn')?.addEventListener('click',()=>{transition=null;stage.classList.remove('is-transitioning');selected=null;hovered=null;cameraTarget.set(0,0,0);dist=11.8;theta=.25;phi=1.18;rotateVX=rotateVY=0;clearResourceNodes();refreshFocus(null);updateCamera()});
    stage.addEventListener('pointerdown',e=>{if(e.target.closest('.webgl-controls,.webgl-focus'))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const pts=[...pointers.values()];pinchDistance=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);dragging=true;moved=true;return}dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;rotateVX=rotateVY=0;stage.setPointerCapture?.(e.pointerId)});
    stage.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const pts=[...pointers.values()],next=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);if(pinchDistance>0)dist=THREE.MathUtils.clamp(dist-(next-pinchDistance)*.035,3.2,25);pinchDistance=next;moved=true;updateCamera();return}if(!dragging){updateHover(e);return}const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(e.buttons===2||e.shiftKey){const scale=dist*.0018;cameraTarget.x-=dx*scale;cameraTarget.y+=dy*scale;rotateVX=rotateVY=0}else{rotateVX=-dx*.0044;rotateVY=dy*.0044;theta+=rotateVX;phi=THREE.MathUtils.clamp(phi+rotateVY,.35,2.78)}lastX=e.clientX;lastY=e.clientY;updateCamera()});
    const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinchDistance=0;if(!dragging)return;dragging=false;if(!moved)pick(e);};
    stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);dragging=false;pinchDistance=0});stage.addEventListener('contextmenu',e=>e.preventDefault());stage.addEventListener('dblclick',e=>{if(e.target.closest('.webgl-controls'))return;dist=selected?2.65:11.8;updateCamera()});controls.addEventListener('pointerdown',e=>e.stopPropagation());focusPanel.addEventListener('pointerdown',e=>e.stopPropagation());focusPanel.addEventListener('click',e=>{const b=e.target.closest('button[data-world]');if(b){if(typeof window.enterSphere==='function')window.enterSphere(b.dataset.world);return}if(root.classList.contains('universe-closed')){root.classList.remove('universe-closed');root.classList.add('universe-open');if(worldGroup)worldGroup.visible=true;resize();refreshFocus(null)}});focusPanel.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===focusPanel&&root.classList.contains('universe-closed')){e.preventDefault();root.classList.remove('universe-closed');root.classList.add('universe-open');if(worldGroup)worldGroup.visible=true;resize();refreshFocus(null)}});controls.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const action=b.dataset.camera;if(action==='in')dist=THREE.MathUtils.max(3.2,dist*.82);if(action==='out')dist=THREE.MathUtils.min(25,dist*1.22);if(action==='reset'){selected=null;cameraTarget.set(0,0,0);dist=11.8;theta=.25;phi=1.18;clearResourceNodes();document.getElementById('homeBtn')?.click()}updateCamera()});
    stage.addEventListener('wheel',e=>{e.preventDefault();dist=THREE.MathUtils.clamp(dist+e.deltaY*.012,3.2,25);updateCamera()},{passive:false});
    stage.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('homeBtn')?.click();if(e.key==='+'||e.key==='=')dist=Math.max(3.2,dist-.7);if(e.key==='-')dist=Math.min(25,dist+.7);if(e.key==='ArrowLeft')theta-=.12;if(e.key==='ArrowRight')theta+=.12;if(e.key==='ArrowUp')phi=Math.max(.35,phi-.1);if(e.key==='ArrowDown')phi=Math.min(2.78,phi+.1);updateCamera()});
    updateCamera();
  }
  function hitTest(e){const r=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects([...points.map(p=>p.hitMesh),...points.map(p=>p.mesh),...resourceMeshes],false)}
  function updateHover(e){if(!renderer||!worldGroup?.visible)return;const hits=hitTest(e),obj=hits[0]?.object||null;const next=obj?.userData?.kind==='sphere'?obj.userData.id:null;const resource=obj?.userData?.kind==='resource'?obj.userData.url:null;if(next===hovered&&resource===stage.dataset.hoverResource)return;hovered=next;if(next)refreshFocus(next);else if(!selected)refreshFocus(null);stage.dataset.hoverResource=resource||'';stage.classList.toggle('resource-hover',!!resource);stage.style.cursor=(next||resource)?'pointer':'grab';for(const p of points){const active=p.id===hovered;p.mesh.material.emissiveIntensity=active?1.05:.62;p.mesh.scale.setScalar(active?1.08:(selected===p.id?1.04:1))}for(const edge of edges){if(!edge.relation)continue;const focus=hovered||selected;const connected=!!focus&&(edge.aId===focus||edge.bId===focus);edge.line.material.opacity=focus?(connected?.78:.025):.105;edge.line.material.needsUpdate=true}}
  function pick(e){if(transition)return;const hits=hitTest(e);if(!hits.length)return;const obj=hits[0].object;if(obj.userData.kind==='resource'){window.open(obj.userData.url,'_blank','noopener,noreferrer');return}if(obj.userData.kind==='sphere'){const id=obj.userData.id,node=points.find(p=>p.id===id);flyTo(node.mesh,()=>{document.querySelector('[data-sphere="'+id+'"]')?.click();requestAnimationFrame(()=>requestAnimationFrame(()=>buildResourceNodes(id)));stage.classList.remove('is-transitioning')})}}
  function animate(){raf=requestAnimationFrame(animate);if(!renderer)return;const now=performance.now(),t=now*.001;if(transition){const k=Math.min(1,(now-transition.at)/transition.duration),e=easeInOut(k);cameraTarget.set(THREE.MathUtils.lerp(transition.start.x,transition.end.x,e),THREE.MathUtils.lerp(transition.start.y,transition.end.y,e),THREE.MathUtils.lerp(transition.start.z,transition.end.z,e));dist=THREE.MathUtils.lerp(transition.start.dist,transition.end.dist,e);if(k>=1){const next=transition.next;transition=null;stage.classList.remove('is-transitioning');next?.()}}for(const p of points){const f=p.id===hovered?1.24:(selected===p.id?1.12:1+Math.sin(t*1.1+ids.indexOf(p.id))*.018);p.mesh.scale.setScalar(f);p.mesh.rotation.y=t*.09+ids.indexOf(p.id)*.2;p.mesh.rotation.x=Math.sin(t*.32+ids.indexOf(p.id))*.035;p.label.quaternion.copy(camera.quaternion)}for(const e of edges){if(!e.pulse||!e.curve)continue;const progress=(t*(e.relation?.052:.105)+e.phase)%1;e.pulse.position.copy(e.curve.getPoint(progress));e.pulse.material.opacity=e.relation?.22+.48*Math.sin(progress*Math.PI):.42+.48*Math.sin(progress*Math.PI)}if(!dragging&&!transition){theta+=rotateVX;phi=THREE.MathUtils.clamp(phi+rotateVY,.35,2.78);rotateVX*=.88;rotateVY*=.88;if(Math.abs(rotateVX)<.00005)rotateVX=0;if(Math.abs(rotateVY)<.00005)rotateVY=0}updateCamera();renderer.render(scene,camera)}
  init();
}
