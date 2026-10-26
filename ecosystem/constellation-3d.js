import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const root=document.getElementById('mainView');
if(root){
  const sphereEls=[...document.querySelectorAll('[data-sphere]')];
  const ids=['bio','myco','soil','lab','products','iot','work','learn'];
  const colors={bio:0xcaff8a,myco:0xd9a5ff,soil:0xefc47b,lab:0x79e0d2,products:0xff9c82,iot:0xf4df85,work:0x8ebaff,learn:0xf5a9ce};
  const labels=Object.fromEntries(sphereEls.map(el=>[el.dataset.sphere,{title:el.querySelector('b')?.textContent||el.dataset.sphere,sub:el.querySelector('small')?.textContent||''}]));
  const stage=document.createElement('div');stage.className='webgl-stage';stage.setAttribute('role','application');stage.setAttribute('aria-label','Constellation 3D interactive BALabs');
  const hint=document.createElement('div');hint.className='webgl-hint';hint.textContent='FAIRE TOURNER · GLISSER POUR EXPLORER · TOUCHER UNE SPHÈRE POUR ENTRER';
  const status=document.createElement('div');status.className='webgl-status';status.textContent='BALABS / SPATIAL KNOWLEDGE';
  stage.append(hint,status);root.append(stage);
  let renderer,scene,camera,raycaster,mouse,core,points=[],edges=[],stars,dragging=false,moved=false,lastX=0,lastY=0,theta=.25,phi=1.18,dist=10.5,selected=null,raf=0,worldGroup,hovered=null,transition=null,cameraTarget=new THREE.Vector3(),resourceGroup=null,resourceMeshes=[];
  const material=(color,emissive=color)=>new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.38,metalness:.18,roughness:.34});
  const makeLabel=(text,color,size=26)=>{
    const cv=document.createElement('canvas'),ctx=cv.getContext('2d');cv.width=512;cv.height=128;
    ctx.clearRect(0,0,512,128);ctx.font='700 '+size+'px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='#000';ctx.shadowBlur=12;ctx.fillStyle='#'+color.toString(16).padStart(6,'0');ctx.fillText(text.slice(0,34),256,64,490);
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));spr.scale.set(2.5,.62,1);return spr;
  };
  function init(){
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Scène 3D BALabs');
      scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x07100b,.025);worldGroup=new THREE.Group();scene.add(worldGroup);
      camera=new THREE.PerspectiveCamera(42,1,.1,100);raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
      scene.add(new THREE.AmbientLight(0xb9d8b5,1.25));
      const key=new THREE.PointLight(0xcaff8a,95,30);key.position.set(0,5,6);scene.add(key);
      const fill=new THREE.PointLight(0x4b9a76,65,24);fill.position.set(-6,-2,-4);scene.add(fill);
      const starGeo=new THREE.BufferGeometry(),arr=[];
      for(let i=0;i<650;i++){const radius=THREE.MathUtils.randFloat(8,22),a=Math.random()*Math.PI*2,z=THREE.MathUtils.randFloatSpread(18);arr.push(Math.cos(a)*radius,Math.sin(a)*radius,z)}
      starGeo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x9ecf8e,size:.025,transparent:true,opacity:.7}));scene.add(stars);
      const coreGeo=new THREE.IcosahedronGeometry(.78,3);
      core=new THREE.Mesh(coreGeo,new THREE.MeshStandardMaterial({color:0x234c2a,emissive:0x83c85a,emissiveIntensity:.75,metalness:.35,roughness:.22}));core.userData.kind='core';scene.add(core);
      const halo=new THREE.Mesh(new THREE.TorusGeometry(1.12,.012,8,120),new THREE.MeshBasicMaterial({color:0xcaff8a,transparent:true,opacity:.65}));halo.rotation.set(.8,.3,.2);core.add(halo);
      const coreLabel=makeLabel('BALabs',0xcaff8a,38);coreLabel.position.set(0,-1.18,0);coreLabel.scale.set(2.2,.55,1);core.add(coreLabel);
      const pos={bio:[0,3.05,0],myco:[-2.55,1.8,1.1],soil:[2.6,1.65,-.7],lab:[-3.15,-.55,-.5],products:[3.1,-.4,1],iot:[-2.15,-2.2,1.15],work:[2.2,-2.2,-.7],learn:[.15,-3.1,0]};
      for(const id of ids){
        const color=colors[id],p=new THREE.Vector3(...pos[id]);
        const geo=new THREE.IcosahedronGeometry(.55,3),mat=material(color,new THREE.Color(color).multiplyScalar(.5));
        const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(p);mesh.userData={kind:'sphere',id};mesh.scale.setScalar(1);worldGroup.add(mesh);
        const wire=new THREE.Mesh(new THREE.IcosahedronGeometry(.59,1),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.22}));wire.position.copy(p);wire.userData.kind='wire';worldGroup.add(wire);
        const label=makeLabel(labels[id].title,color,22);label.position.set(p.x,p.y-.85,p.z);label.scale.set(2.6,.52,1);label.userData={kind:'label',id,labelText:labels[id].title};worldGroup.add(label);
        const node={id,mesh,wire,label,base:p,color};points.push(node);
        const edgeMat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.25});
        const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),p]);
        const line=new THREE.Line(geom,edgeMat);line.userData={kind:'edge',id};worldGroup.add(line);edges.push({line,id,a:new THREE.Vector3(0,0,0),b:p.clone()});
      }
      const pairs=[['bio','myco'],['bio','lab'],['bio','soil'],['myco','lab'],['myco','soil'],['soil','lab'],['soil','products'],['lab','iot'],['lab','work'],['products','iot'],['products','learn'],['iot','work'],['work','learn'],['bio','learn']];
      for(const [a,b] of pairs){const pa=points.find(p=>p.id===a),pb=points.find(p=>p.id===b);if(!pa||!pb)continue;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa.base,pb.base]),new THREE.LineDashedMaterial({color:0x9acb8a,dashSize:.09,gapSize:.09,transparent:true,opacity:.38}));line.computeLineDistances();line.userData={kind:'relation',a,b};worldGroup.add(line);edges.push({line,id:a,relation:true,a:pa.base.clone(),b:pb.base.clone()})}
      root.classList.add('webgl-ready');worldGroup.visible=!root.classList.contains('universe-closed');new MutationObserver(()=>{if(worldGroup)worldGroup.visible=!root.classList.contains('universe-closed');if(root.classList.contains('universe-closed'))clearResourceNodes()}).observe(root,{attributes:true,attributeFilter:['class']});
      const textObserver=new MutationObserver(()=>refreshLabels());sphereEls.forEach(el=>{const b=el.querySelector('b');if(b)textObserver.observe(b,{childList:true,characterData:true,subtree:true})});
      resize();bind();animate();
    }catch(e){stage.remove();console.warn('BALabs WebGL unavailable; accessible HTML fallback retained.',e)}
  }
  function resize(){if(!renderer||!camera)return;const w=stage.clientWidth||640,h=stage.clientHeight||680;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
  function updateCamera(){if(!camera)return;camera.position.set(cameraTarget.x+dist*Math.sin(phi)*Math.sin(theta),cameraTarget.y+dist*Math.cos(phi),cameraTarget.z+dist*Math.sin(phi)*Math.cos(theta));camera.lookAt(cameraTarget)}
  function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function flyTo(target,next){const start={x:cameraTarget.x,y:cameraTarget.y,z:cameraTarget.z,dist};const end=target?{x:target.position.x,y:target.position.y,z:target.position.z,dist:3.25}:{x:0,y:0,z:0,dist:10.5};transition={start,end,at:performance.now(),duration:980,next};selected=target?.userData?.id||null;stage.classList.add('is-transitioning')}
  function clearResourceNodes(){if(resourceGroup){worldGroup.remove(resourceGroup);resourceGroup.traverse(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}resourceGroup=null;resourceMeshes=[]}
  function buildResourceNodes(id){clearResourceNodes();const mini=document.getElementById('miniView');if(!mini||mini.hidden)return;const anchors=[...mini.querySelectorAll('.linknode')].filter(a=>a.href&&a.href!=='#'&&a.getAttribute('href')!=='#');if(!anchors.length)return;const parent=points.find(p=>p.id===id);if(!parent)return;resourceGroup=new THREE.Group();resourceGroup.userData.kind='resources';worldGroup.add(resourceGroup);const count=anchors.length,radius=1.45+count*.055,color=parent.color;anchors.forEach((a,i)=>{const angle=(i/count)*Math.PI*2-Math.PI/2;const p=new THREE.Vector3(parent.base.x+Math.cos(angle)*radius,parent.base.y+Math.sin(angle)*radius*.72,parent.base.z+Math.sin(angle*.8)*.48);const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.55,metalness:.15,roughness:.3}));mesh.position.copy(p);mesh.userData={kind:'resource',url:a.href,title:a.querySelector('b')?.textContent||a.textContent.trim()};resourceGroup.add(mesh);const label=makeLabel(mesh.userData.title,color,15);label.position.set(p.x,p.y-.24,p.z);label.scale.set(1.8,.32,1);label.userData.kind='resource-label';resourceGroup.add(label);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([parent.base,p]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.52}));resourceGroup.add(line);resourceMeshes.push(mesh)})}
  function refreshLabels(){for(const p of points){const el=document.querySelector('[data-sphere="'+p.id+'"]');if(!el)continue;const next=el.querySelector('b')?.textContent||p.id;if(p.label.userData.labelText===next)continue;p.label.userData.labelText=next;const old=p.label.material.map;const replacement=makeLabel(next,p.color,22);p.label.material.map=replacement.material.map;p.label.material.needsUpdate=true;old?.dispose();replacement.material.dispose()}}
  function bind(){
    window.addEventListener('resize',resize);
    stage.addEventListener('pointerdown',e=>{dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture?.(e.pointerId)});
    stage.addEventListener('pointermove',e=>{if(!dragging){updateHover(e);return}const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;theta-=dx*.006;phi=THREE.MathUtils.clamp(phi+dy*.006,.3,2.8);lastX=e.clientX;lastY=e.clientY;updateCamera()});
    const end=e=>{if(!dragging)return;dragging=false;if(!moved)pick(e);};
    stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',()=>dragging=false);
    stage.addEventListener('wheel',e=>{e.preventDefault();dist=THREE.MathUtils.clamp(dist+e.deltaY*.008,6.2,17);updateCamera()},{passive:false});
    stage.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('homeBtn')?.click();if(e.key==='+'||e.key==='=')dist=Math.max(6.2,dist-.7);if(e.key==='-')dist=Math.min(17,dist+.7);updateCamera()});
    updateCamera();
  }
  function hitTest(e){const r=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects([core,...points.map(p=>p.mesh)],false)}
  function updateHover(e){if(!renderer||!worldGroup?.visible)return;const hits=hitTest(e),obj=hits[0]?.object||null;const next=obj?.userData?.kind==='sphere'?obj.userData.id:null;if(next===hovered&&((obj?.userData?.kind==='resource')===stage.classList.contains('resource-hover')))return;hovered=next;stage.classList.toggle('resource-hover',obj?.userData?.kind==='resource');stage.style.cursor=(next||obj?.userData?.kind==='core'||obj?.userData?.kind==='resource')?'pointer':'grab';for(const p of points){const active=p.id===hovered;p.mesh.material.emissiveIntensity=active?.95:.38}}
  function pick(e){if(transition)return;const hits=hitTest(e);if(!hits.length)return;const obj=hits[0].object;if(obj.userData.kind==='resource'){window.open(obj.userData.url,'_blank','noopener,noreferrer');return}if(obj.userData.kind==='core'){if(root.classList.contains('universe-closed')){cameraTarget.set(0,0,0);dist=10.5;document.getElementById('openUniverse')?.click()}else{clearResourceNodes();flyTo(null,()=>document.getElementById('openUniverse')?.click())}return}if(obj.userData.kind==='sphere'){const id=obj.userData.id,node=points.find(p=>p.id===id);flyTo(node.mesh,()=>{document.querySelector('[data-sphere="'+id+'"]')?.click();requestAnimationFrame(()=>requestAnimationFrame(()=>buildResourceNodes(id)));stage.classList.remove('is-transitioning')})}}
  function animate(){raf=requestAnimationFrame(animate);if(!renderer)return;const now=performance.now(),t=now*.001;if(transition){const k=Math.min(1,(now-transition.at)/transition.duration),e=easeInOut(k);cameraTarget.set(THREE.MathUtils.lerp(transition.start.x,transition.end.x,e),THREE.MathUtils.lerp(transition.start.y,transition.end.y,e),THREE.MathUtils.lerp(transition.start.z,transition.end.z,e));dist=THREE.MathUtils.lerp(transition.start.dist,transition.end.dist,e);if(k>=1){const next=transition.next;transition=null;stage.classList.remove('is-transitioning');next?.()}}core.rotation.y=t*.18;core.rotation.x=Math.sin(t*.2)*.08;for(const p of points){const f=p.id===hovered?1.13:(selected===p.id?1.08:1+Math.sin(t*1.1+ids.indexOf(p.id))*.025);p.mesh.scale.setScalar(f);p.mesh.rotation.y=t*.14+ids.indexOf(p.id)*.2;p.wire.rotation.copy(p.mesh.rotation);p.label.quaternion.copy(camera.quaternion)}for(const e of edges){if(e.relation)continue;const p=points.find(n=>n.id===e.id);if(!p)continue;e.line.geometry.setFromPoints([core.position,p.mesh.position])}stars.rotation.y=t*.004;updateCamera();renderer.render(scene,camera)}
  init();
}
