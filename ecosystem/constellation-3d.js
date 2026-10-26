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
  let renderer,scene,camera,raycaster,mouse,core,points=[],edges=[],stars,dragging=false,moved=false,lastX=0,lastY=0,theta=.25,phi=1.18,dist=10.5,selected=null,raf=0;
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
      scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x07100b,.025);
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
        const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(p);mesh.userData={kind:'sphere',id};mesh.scale.setScalar(1);scene.add(mesh);
        const wire=new THREE.Mesh(new THREE.IcosahedronGeometry(.59,1),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.22}));wire.position.copy(p);wire.userData.kind='wire';scene.add(wire);
        const label=makeLabel(labels[id].title,color,22);label.position.set(p.x,p.y-.85,p.z);label.scale.set(2.6,.52,1);label.userData.kind='label';scene.add(label);
        const node={id,mesh,wire,label,base:p,color};points.push(node);
        const edgeMat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.25});
        const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),p]);
        const line=new THREE.Line(geom,edgeMat);line.userData={kind:'edge',id};scene.add(line);edges.push({line,id,a:new THREE.Vector3(0,0,0),b:p.clone()});
      }
      const pairs=[['bio','myco'],['bio','lab'],['bio','soil'],['myco','lab'],['myco','soil'],['soil','lab'],['soil','products'],['lab','iot'],['lab','work'],['products','iot'],['products','learn'],['iot','work'],['work','learn'],['bio','learn']];
      for(const [a,b] of pairs){const pa=points.find(p=>p.id===a),pb=points.find(p=>p.id===b);if(!pa||!pb)continue;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([pa.base,pb.base]),new THREE.LineDashedMaterial({color:0x9acb8a,dashSize:.09,gapSize:.09,transparent:true,opacity:.38}));line.computeLineDistances();line.userData={kind:'relation',a,b};scene.add(line);edges.push({line,id:a,relation:true,a:pa.base.clone(),b:pb.base.clone()})}
      root.classList.add('webgl-ready');resize();bind();animate();
    }catch(e){stage.remove();console.warn('BALabs WebGL unavailable; accessible HTML fallback retained.',e)}
  }
  function resize(){if(!renderer||!camera)return;const w=stage.clientWidth||640,h=stage.clientHeight||680;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
  function updateCamera(){if(!camera)return;camera.position.set(dist*Math.sin(phi)*Math.sin(theta),dist*Math.cos(phi),dist*Math.sin(phi)*Math.cos(theta));camera.lookAt(0,0,0)}
  function bind(){
    window.addEventListener('resize',resize);
    stage.addEventListener('pointerdown',e=>{dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;stage.setPointerCapture?.(e.pointerId)});
    stage.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;theta-=dx*.006;phi=THREE.MathUtils.clamp(phi+dy*.006,.3,2.8);lastX=e.clientX;lastY=e.clientY;updateCamera()});
    const end=e=>{if(!dragging)return;dragging=false;if(!moved)pick(e);};
    stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',()=>dragging=false);
    stage.addEventListener('wheel',e=>{e.preventDefault();dist=THREE.MathUtils.clamp(dist+e.deltaY*.008,6.2,17);updateCamera()},{passive:false});
    stage.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('homeBtn')?.click();if(e.key==='+'||e.key==='=')dist=Math.max(6.2,dist-.7);if(e.key==='-')dist=Math.min(17,dist+.7);updateCamera()});
    updateCamera();
  }
  function pick(e){const r=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects([core,...points.map(p=>p.mesh)],false);if(!hits.length)return;const obj=hits[0].object;if(obj.userData.kind==='core'){document.getElementById('openUniverse')?.click();return}if(obj.userData.kind==='sphere'){selected=obj.userData.id;window.enterBalabsSphere?.(selected);document.querySelector('[data-sphere="'+selected+'"]')?.click()}}
  function animate(){raf=requestAnimationFrame(animate);if(!renderer)return;const t=performance.now()*.001;core.rotation.y=t*.18;core.rotation.x=Math.sin(t*.2)*.08;for(const p of points){const f=selected===p.id?1.18:1+Math.sin(t*1.1+ids.indexOf(p.id))*.025;p.mesh.scale.setScalar(f);p.mesh.rotation.y=t*.14+ids.indexOf(p.id)*.2;p.wire.rotation.copy(p.mesh.rotation);p.label.quaternion.copy(camera.quaternion)}for(const e of edges){if(e.relation)continue;const p=points.find(n=>n.id===e.id);if(!p)continue;e.line.geometry.setFromPoints([core.position,p.mesh.position])}stars.rotation.y=t*.004;updateCamera();renderer.render(scene,camera)}
  init();
}
