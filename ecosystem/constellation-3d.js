import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const root=document.getElementById('mainView');
if(root){
  const sphereEls=[...document.querySelectorAll('[data-sphere]')];
  const ids=['bio','myco','soil','lab','products','iot','work','learn'];
  const colors={bio:0x9fbea1,myco:0x9c91bd,soil:0xbd936b,lab:0x829fba,products:0xc18b76,iot:0x9eabb7,work:0x9b8fa7,learn:0xb4b9a0};
  const labels=Object.fromEntries(sphereEls.map(el=>[el.dataset.sphere,{title:el.querySelector('b')?.textContent||el.dataset.sphere,sub:el.querySelector('small')?.textContent||''}]));
  const stage=document.createElement('div');stage.className='webgl-stage';stage.setAttribute('role','application');stage.setAttribute('aria-label','Constellation 3D interactive BALabs');
  const hint=document.createElement('div');hint.className='webgl-hint';const hintText={fr:'GLISSER POUR TOURNER · PINCER POUR ZOOMER · TOUCHER UN UNIVERS',en:'DRAG TO ROTATE · PINCH TO ZOOM · TAP A WORLD',ar:'اسحب للتدوير · اقرص للتكبير · المس عالماً',pt:'ARRASTE PARA RODAR · PINÇA PARA ZOOM · TOQUE NUM UNIVERSO'};const refreshHint=()=>{hint.textContent=hintText[document.documentElement.lang]||hintText.fr};refreshHint();new MutationObserver(refreshHint).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const status=document.createElement('div');status.className='webgl-status';status.textContent='BALABS / SPATIAL KNOWLEDGE';
  const focusPanel=document.createElement('div');focusPanel.className='webgl-focus';focusPanel.setAttribute('aria-live','polite');focusPanel.innerHTML='<span class="webgl-focus-kicker">SPATIAL INDEX · 08 WORLDS</span><strong>BA Labs</strong><small>Choisis un univers pour explorer ses connexions.</small>';
  const controls=document.createElement('div');controls.className='webgl-controls';controls.setAttribute('aria-label','Commandes de navigation 3D');controls.innerHTML='<button type="button" data-camera="out" aria-label="Dézoomer" title="Dézoomer">−</button><button type="button" data-camera="in" aria-label="Zoomer" title="Zoomer">+</button><button type="button" data-camera="reset" aria-label="Recentrer la constellation" title="Recentrer">⌖</button>';stage.append(hint,status,focusPanel,controls);root.append(stage);
  let renderer,scene,camera,raycaster,mouse,core,points=[],edges=[],stars,dragging=false,moved=false,lastX=0,lastY=0,theta=.25,phi=1.18,dist=10.2,selected=null,raf=0,worldGroup,hovered=null,transition=null,cameraTarget=new THREE.Vector3(),resourceGroup=null,resourceMeshes=[],resourceSignals=[],rotateVX=0,rotateVY=0,pointers=new Map(),pinchDistance=0;
  const material=(color,emissive=color)=>new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.62,metalness:.12,roughness:.3});
  // Tapered, softly shaded biological processes: broad at the origin and fine at the tip.
  // The taper is built into the mesh so branches read as living extensions, not hoses.
  const makeNeurite=(curve,color,radius=.016,opacity=.78,segments=20)=>{
    const radial=5,geometry=new THREE.TubeGeometry(curve,segments,radius,radial,false);
    const positions=geometry.attributes.position;
    for(let i=0;i<=segments;i++){
      const u=i/segments,center=curve.getPointAt(u);
      const taper=.10+.82*Math.pow(1-u,.72);
      for(let j=0;j<=radial;j++){
        const index=i*(radial+1)+j;
        const x=positions.getX(index)-center.x,y=positions.getY(index)-center.y,z=positions.getZ(index)-center.z;
        positions.setXYZ(index,center.x+x*taper,center.y+y*taper,center.z+z*taper);
      }
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.06),emissiveIntensity:.18,roughness:.88,metalness:0,transparent:opacity<1,opacity,depthWrite:opacity>.8});
    material.userData.baseOpacity=opacity;
    return new THREE.Mesh(geometry,material);
  };
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
        // Faceted, asymmetrical cell body: deliberately not a polished planet.
        const geo=new THREE.IcosahedronGeometry(.34,3),attr=geo.attributes.position;
        for(let v=0;v<attr.count;v++){const x=attr.getX(v),y=attr.getY(v),z=attr.getZ(v);const wave=1+.10*Math.sin(x*7.1+y*5.4+ids.indexOf(id)*.7)+.06*Math.cos(z*6.3-x*4.7+y*2.2);attr.setXYZ(v,x*wave,y*wave,z*wave)}
        geo.computeVertexNormals();
        const mat=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.12),emissiveIntensity:.14,metalness:0,roughness:1,flatShading:false});
        const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(p);mesh.userData={kind:'sphere',id};mesh.scale.setScalar(1);worldGroup.add(mesh);
        // Unequal branching dendrites grow from the soma in several spatial directions.
        const twigs=[];
        for(let k=0;k<9;k++){
          const a=k*2.3999632297+ids.indexOf(id)*.43;
          const dir=new THREE.Vector3(Math.cos(a),Math.sin(a*.83),Math.sin(a*1.37+ids.indexOf(id))).normalize();
          const start=p.clone().addScaledVector(dir,.27);
          const length=.52+(k%4)*.17;
          const end=p.clone().addScaledVector(dir,length);
          const side=new THREE.Vector3(-dir.y,dir.x,Math.cos(a*1.7)).normalize();
          const mid=start.clone().lerp(end,.42+((k%3)-1)*.045).addScaledVector(side,.035*Math.sin(a*1.3)+.018*Math.cos(a*2.1));
          const twigCurve=new THREE.QuadraticBezierCurve3(start,mid,end);
          const twig=makeNeurite(twigCurve,color,.024,.88,18);twig.userData={kind:'dendrite',id};worldGroup.add(twig);twigs.push(twig);
          if(k%2===0){
            const forkStart=twigCurve.getPoint(.58),forkEnd=forkStart.clone().addScaledVector(side,.16+(k%3)*.035).addScaledVector(dir,.08);
            const forkCurve=new THREE.QuadraticBezierCurve3(forkStart,forkStart.clone().addScaledVector(side,.09),forkEnd);
            const fork=makeNeurite(forkCurve,color,.015,.82,14);fork.userData={kind:'dendrite',id};worldGroup.add(fork);twigs.push(fork);
          }
        }
        const hitMesh=new THREE.Mesh(new THREE.SphereGeometry(.36,14,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.0001,depthWrite:false}));hitMesh.position.copy(p);hitMesh.userData={kind:'sphere',id};worldGroup.add(hitMesh);

        const label=makeLabel(labels[id].title,0xf5f7fa,25);label.position.set(p.x,p.y-.52,p.z+.08);label.scale.set(Math.min(3.45,Math.max(1.8,labels[id].title.length*.105)),.52,1);label.userData={kind:'label',id,labelText:labels[id].title};worldGroup.add(label);
        const node={id,mesh,hitMesh,label,base:p,color,twigs};points.push(node);
        // A root soma has no artificial central-hub connection. Every other axon
        // links to its actual biological parent in the graph.
        const parentOf={bio:null,myco:'bio',soil:'myco',lab:'myco',products:'soil',iot:'products',work:'products',learn:'lab'};
        const parentNode=points.find(item=>item.id===parentOf[id]);
        if(parentNode){
          const origin=parentNode.base.clone();
          // Tubular axons below replace the old hairline-only edge material.
          const midpoint=origin.clone().lerp(p,.5);
          const direction=new THREE.Vector3().crossVectors(origin.clone().add(new THREE.Vector3(.001,.002,.003)),p.clone().add(new THREE.Vector3(.013,.007,.019))).normalize();
          const bend=midpoint.addScaledVector(direction,.28+(ids.indexOf(id)%3)*.07).add(new THREE.Vector3(Math.sin(ids.indexOf(id)*1.7)*.15,Math.cos(ids.indexOf(id)*1.3)*.12,Math.cos(ids.indexOf(id)*1.1)*.16));
          const path=new THREE.QuadraticBezierCurve3(origin,bend,p);
          const line=makeNeurite(path,color,.045,.88,52);line.userData={kind:'edge',id};worldGroup.add(line);
          const pulse=new THREE.Mesh(new THREE.IcosahedronGeometry(.034,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.96,depthWrite:false,toneMapped:false}));
          pulse.userData={kind:'signal',id};worldGroup.add(pulse);
          const pulse2=new THREE.Mesh(new THREE.SphereGeometry(.021,10,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.78,depthWrite:false,toneMapped:false}));pulse2.userData={kind:'signal',id};worldGroup.add(pulse2);
          edges.push({line,id,parentId:parentNode.id,a:origin,b:p.clone(),pulse,pulse2,phase:ids.indexOf(id)*.13,curve:path});
          // Side branches break the impression of straight spokes and form dendritic junctions.
          for(let branch=0;branch<3;branch++){
            const seed=ids.indexOf(id)*2.17+branch*1.91;
            const t=.29+branch*.205,anchor=path.getPoint(t),tangent=path.getTangent(t);
            const side=new THREE.Vector3(-tangent.y+Math.sin(seed)*.28,tangent.x+Math.cos(seed*.7)*.22,Math.sin(seed+1.3)*.8).normalize();
            const reach=.22+((ids.indexOf(id)+branch*3)%4)*.055;
            const end=anchor.clone().addScaledVector(side,reach).addScaledVector(tangent,.09+Math.sin(seed)*.055);
            const control=anchor.clone().addScaledVector(side,reach*(.38+((branch+1)%3)*.12)).addScaledVector(tangent,.035*Math.cos(seed));
            const branchCurve=new THREE.QuadraticBezierCurve3(anchor,control,end);
            const branchLine=makeNeurite(branchCurve,color,.012+((branch+ids.indexOf(id))%3)*.002,.72,17);
            branchLine.userData={kind:'dendrite',id};worldGroup.add(branchLine);
            // Fine secondary offshoots make the axon read as branching tissue, not plumbing.
            if(branch!==1){
              const u=.56, junction=branchCurve.getPoint(u), tangent2=branchCurve.getTangent(u);
              const sign=branch===0?1:-1;
              const twigSide=new THREE.Vector3(-tangent2.y*sign+Math.cos(seed)*.25,tangent2.x*sign+Math.sin(seed*.8)*.22,Math.cos(seed+2)*.75).normalize();
              const tip=junction.clone().addScaledVector(twigSide,.105+((ids.indexOf(id)+branch)%3)*.025).addScaledVector(tangent2,.055);
              const twigCurve=new THREE.QuadraticBezierCurve3(junction,junction.clone().addScaledVector(twigSide,.06).addScaledVector(tangent2,.025),tip);
              const twig=makeNeurite(twigCurve,color,.008,.58,11);
              twig.userData={kind:'dendrite',id};worldGroup.add(twig);
            }
            const terminal=new THREE.Mesh(new THREE.IcosahedronGeometry(.022,1),new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.12),emissiveIntensity:.18,roughness:1}));
            terminal.position.copy(end);terminal.scale.set(1,.8,.9);terminal.userData={kind:'synapse',id};worldGroup.add(terminal);
          }
        }
      }
      // Relations reflect the two editorial clusters stated in index.html:
      // biological foundations (bio/myco/soil/lab) and applications/transmission
      // (products/iot/work/learn). Cross-cluster links are limited to explicit
      // R&D-to-application and soil-to-project pathways, not decorative all-to-all links.
      // Sparse, meaningful cross-links: avoid the dense mesh of decorative all-to-all chords.
      const pairs=[
        // Cross-links only: parent-child axons are already drawn above.
        // Each link represents a real feedback loop between BA Labs workstreams.
        ['bio','soil'],['bio','lab'],['soil','lab'],['myco','lab'],
        ['lab','products'],['lab','work'],['soil','work'],['bio','learn'],
        ['iot','learn'],['myco','products'],['soil','iot'],['soil','learn'],
        ['lab','iot'],['lab','learn'],['products','learn'],['work','learn'],
        ['bio','iot'],['myco','work']
      ];
      const mycelialTips=[];
      for(const [a,b] of pairs){const pa=points.find(p=>p.id===a),pb=points.find(p=>p.id===b);if(!pa||!pb)continue;
        const delta=pb.base.clone().sub(pa.base);
        const axis=new THREE.Vector3().crossVectors(delta,new THREE.Vector3(.31,.87,.43)).normalize();
        const bend=.20+((ids.indexOf(a)+ids.indexOf(b))%3)*.075;
        const mid=pa.base.clone().lerp(pb.base,.5).addScaledVector(axis,bend);
        const curve=new THREE.QuadraticBezierCurve3(pa.base,mid,pb.base);
        const signalColor=new THREE.Color(colors[a]).lerp(new THREE.Color(colors[b]),.5);
        const line=makeNeurite(curve,0xc5e8c8,.024,.78,48);
        line.userData={kind:'relation',a,b};worldGroup.add(line);
        // Cross-links branch like mycelial cords / axonal collaterals instead of
        // appearing as plain geometric chords. Each offshoot ends in a small junction.
        for(let branch=0;branch<3;branch++){
          const seed=(ids.indexOf(a)+1)*1.73+(ids.indexOf(b)+1)*.91+branch*2.4;
          const t=[0.27,0.51,0.74][branch];
          const anchor=curve.getPoint(t),tangent=curve.getTangent(t);
          const side=new THREE.Vector3(-tangent.y+Math.sin(seed)*.35,tangent.x+Math.cos(seed*.8)*.28,Math.sin(seed+1.1)*.85).normalize();
          const reach=.20+((ids.indexOf(a)+ids.indexOf(b)+branch)%3)*.055;
          const tip=anchor.clone().addScaledVector(side,reach).addScaledVector(tangent,(branch===0?1:-1)*.075);
          mycelialTips.push({point:tip.clone(),a,b,branch});
          const control=anchor.clone().addScaledVector(side,reach*.55).addScaledVector(tangent,.035*Math.sin(seed));
          const offshoot=new THREE.QuadraticBezierCurve3(anchor,control,tip);
          const twig=makeNeurite(offshoot,signalColor,.011,.66,18);
          twig.userData={kind:'dendrite',id:a,relation:true,a,b};worldGroup.add(twig);
          if(branch===0){
            const junction=new THREE.Mesh(new THREE.IcosahedronGeometry(.018,1),new THREE.MeshStandardMaterial({color:signalColor,emissive:signalColor,emissiveIntensity:.22,roughness:1}));
            junction.position.copy(tip);junction.userData={kind:'synapse',id:a,relation:true,a,b};worldGroup.add(junction);
          }
        }
        const pulse=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),new THREE.MeshBasicMaterial({color:signalColor,transparent:true,opacity:.72,depthWrite:false}));pulse.userData={kind:'relation-signal',a,b};worldGroup.add(pulse);
        edges.push({line,id:a,relation:true,aId:a,bId:b,a:pa.base.clone(),b:pb.base.clone(),pulse,curve,phase:(ids.indexOf(a)+ids.indexOf(b))*.071})}
      // Turn nearby collateral tips from separate cross-links into shared
      // anastomoses. This is the key visual difference between a set of chords
      // and a continuous mycelial/neural mesh.
      const joinedTips=new Set();
      let joinCount=0;
      for(let i=0;i<mycelialTips.length;i++){
        const first=mycelialTips[i];
        let best=-1,bestDistance=1.05;
        for(let j=i+1;j<mycelialTips.length;j++){
          const second=mycelialTips[j];
          if(first.a===second.a&&first.b===second.b)continue;
          const key=[first.a,first.b,second.a,second.b].join(':');
          if(joinedTips.has(key))continue;
          const distance=first.point.distanceTo(second.point);
          if(distance<bestDistance){bestDistance=distance;best=j}
        }
        if(best<0)continue;
        const second=mycelialTips[best];
        const key=[first.a,first.b,second.a,second.b].join(':');
        joinedTips.add(key);
        const delta=second.point.clone().sub(first.point);
        const bend=first.point.clone().lerp(second.point,.5).add(new THREE.Vector3(
          Math.sin((i+1)*1.7)*.055,
          .07+Math.cos((best+1)*1.3)*.045,
          Math.sin((i+best+1)*.9)*.06
        ));
        const anastomosis=new THREE.QuadraticBezierCurve3(first.point,bend,second.point);
        const mix=new THREE.Color(colors[first.a]).lerp(new THREE.Color(colors[second.b]),.5);
        const connector=makeNeurite(anastomosis,mix,.014,.72,20);
        connector.userData={kind:'dendrite',id:first.a,relation:true,a:first.a,b:second.b};
        worldGroup.add(connector);
        const junction=new THREE.Mesh(
          new THREE.IcosahedronGeometry(.024,1),
          new THREE.MeshStandardMaterial({color:mix,emissive:mix,emissiveIntensity:.24,roughness:1})
        );
        junction.position.copy(first.point.clone().add(second.point).multiplyScalar(.5));
        junction.userData={kind:'synapse',id:first.a,relation:true,a:first.a,b:second.b};
        worldGroup.add(junction);
        const signal=new THREE.Mesh(
          new THREE.SphereGeometry(.018,10,8),
          new THREE.MeshBasicMaterial({color:mix,transparent:true,opacity:.82,depthWrite:false,toneMapped:false})
        );
        signal.userData={kind:'relation-signal',a:first.a,b:second.b};
        worldGroup.add(signal);
        edges.push({line:connector,id:first.a,relation:true,anastomosis:true,aId:first.a,bId:second.b,a:first.point.clone(),b:second.point.clone(),pulse:signal,curve:anastomosis,phase:(i+best)*.093});
        joinCount++;
        if(joinCount>=12)break;
      }
      root.classList.add('webgl-ready','universe-open');root.classList.remove('universe-closed');worldGroup.visible=true;new MutationObserver(()=>{if(worldGroup)worldGroup.visible=!root.classList.contains('universe-closed');if(root.classList.contains('universe-closed'))clearResourceNodes()}).observe(root,{attributes:true,attributeFilter:['class']});
      const textObserver=new MutationObserver(()=>refreshLabels());sphereEls.forEach(el=>{const b=el.querySelector('b');if(b)textObserver.observe(b,{childList:true,characterData:true,subtree:true})});
      resize();bind();animate();
    }catch(e){stage.remove();console.warn('BALabs WebGL unavailable; accessible HTML fallback retained.',e)}
  }
  function resize(){if(!renderer||!camera)return;const w=stage.clientWidth||640,h=stage.clientHeight||680;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(!selected)dist=camera.aspect<.78?12.4:camera.aspect<1.05?11:10.2;updateCamera()}
  function updateCamera(){if(!camera)return;camera.position.set(cameraTarget.x+dist*Math.sin(phi)*Math.sin(theta),cameraTarget.y+dist*Math.cos(phi),cameraTarget.z+dist*Math.sin(phi)*Math.cos(theta));camera.lookAt(cameraTarget)}
  function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function refreshFocus(id){const p=points.find(item=>item.id===id);const lang=document.documentElement.lang||'fr';const copy={fr:{index:'INDEX SPATIAL · 08 UNIVERS',home:'Choisis un univers pour explorer ses connexions.',links:'Connexions',next:'Explorer aussi'},en:{index:'SPATIAL INDEX · 08 WORLDS',home:'Choose a world to explore its connections.',links:'Connections',next:'Explore next'},ar:{index:'الفهرس المكاني · ٨ عوالم',home:'اختر عالماً لاستكشاف الروابط بينه وبين العوالم الأخرى.',links:'روابط',next:'استكشف أيضاً'},pt:{index:'ÍNDICE ESPACIAL · 08 UNIVERSOS',home:'Escolha um universo para explorar as suas ligações.',links:'Ligações',next:'Explorar também'}}[lang]||{index:'SPATIAL INDEX · 08 WORLDS',home:'Choose a world to explore its connections.',links:'Connections',next:'Explore next'};if(!p){focusPanel.classList.remove('has-world');focusPanel.innerHTML='';const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';kicker.textContent=copy.index;const title=document.createElement('strong');title.textContent='BA Labs';const sub=document.createElement('small');sub.textContent=copy.home;const open=document.createElement('button');open.type='button';open.dataset.openUniverse='true';open.className='webgl-open-action';open.textContent=({fr:'Ouvrir la constellation',en:'Open constellation',ar:'افتح الكوكبة',pt:'Abrir constelação'}[lang]||'Ouvrir la constellation');open.style.cssText='align-self:flex-start;margin-top:5px;padding:8px 11px;border:1px solid #8eb68a88;border-radius:999px;background:#a9c5a31a;color:#eaf7e5;font:600 11px/1.2 system-ui,sans-serif;cursor:pointer;pointer-events:auto';focusPanel.append(kicker,title,sub);if(root.classList.contains('universe-closed')){focusPanel.append(open)}else{const worlds=document.createElement('div');worlds.className='webgl-focus-links';worlds.setAttribute('aria-label',lang==='ar'?'اختر عالماً':lang==='pt'?'Escolher um universo':lang==='en'?'Choose a world':'Choisir un univers');ids.forEach(worldId=>{const button=document.createElement('button');button.type='button';button.className='webgl-focus-link';button.dataset.world=worldId;button.textContent=labels[worldId].title;worlds.append(button)});focusPanel.append(worlds)}return}const related=[...new Set(edges.filter(edge=>edge.relation&&!edge.anastomosis?(edge.aId===id||edge.bId===id):( !edge.anastomosis&&(edge.id===id||edge.parentId===id))).map(edge=>edge.relation?(edge.aId===id?edge.bId:edge.aId):(edge.id===id?edge.parentId:edge.id)))];
    // Give every visible connection a concrete BA Labs meaning, not just a destination label.
    const relationNotes={
      bio:{myco:{fr:'microbiologie → mycologie',en:'microbiology → mycology',ar:'الأحياء الدقيقة ← الفطريات',pt:'microbiologia → micologia'},soil:{fr:'microbes et fertilité',en:'microbes and fertility',ar:'الميكروبات وخصوبة التربة',pt:'micróbios e fertilidade'},lab:{fr:'mesure et validation',en:'measurement and validation',ar:'القياس والتحقق',pt:'medição e validação'},learn:{fr:'transmettre les bases',en:'share the foundations',ar:'نقل الأساسيات',pt:'partilhar fundamentos'},iot:{fr:'biologie instrumentée',en:'instrumented biology',ar:'أحياء مزودة بأجهزة',pt:'biologia instrumentada'}},
      myco:{soil:{fr:'substrats et transformation',en:'substrates and transformation',ar:'الركائز والتحويل',pt:'substratos e transformação'},lab:{fr:'cultures et protocoles',en:'cultures and protocols',ar:'المزارع والبروتوكولات',pt:'culturas e protocolos'},products:{fr:'cultures vers les kits',en:'cultures into kits',ar:'تحويل المزارع إلى أطقم',pt:'culturas em kits'},work:{fr:'essais et prototypes',en:'trials and prototypes',ar:'التجارب والنماذج الأولية',pt:'ensaios e protótipos'}},
      soil:{lab:{fr:'caractériser les substrats',en:'characterize substrates',ar:'توصيف الركائز',pt:'caracterizar substratos'},products:{fr:'formulations et usages',en:'formulations and uses',ar:'التركيبات والاستعمالات',pt:'formulações e utilizações'},work:{fr:'TechnoSoil et prototypes',en:'TechnoSoil and prototypes',ar:'TechnoSoil والنماذج الأولية',pt:'TechnoSoil e protótipos'},iot:{fr:'suivi des conditions',en:'condition monitoring',ar:'مراقبة الظروف',pt:'monitorização das condições'},learn:{fr:'méthodes et retours',en:'methods and findings',ar:'المنهجيات والنتائج',pt:'métodos e resultados'}},
      lab:{products:{fr:'essais vers produits',en:'testing into products',ar:'من الاختبارات إلى المنتجات',pt:'dos ensaios aos produtos'},work:{fr:'R&D et prototypage',en:'R&D and prototyping',ar:'البحث والتطوير والنمذجة',pt:'I&D e prototipagem'},learn:{fr:'protocoles à transmettre',en:'protocols to share',ar:'بروتوكولات قابلة للمشاركة',pt:'protocolos a partilhar'},iot:{fr:'mesures automatisées',en:'automated measurements',ar:'قياسات آلية',pt:'medições automatizadas'}},
      products:{iot:{fr:'capteurs et suivi',en:'sensors and tracking',ar:'المستشعرات والتتبع',pt:'sensores e monitorização'},learn:{fr:'usage et documentation',en:'use and documentation',ar:'الاستخدام والتوثيق',pt:'utilização e documentação'},work:{fr:'prototypes valorisés',en:'prototypes into practice',ar:'تطبيق النماذج الأولية',pt:'prototipagem aplicada'}},
      iot:{learn:{fr:'outils et apprentissage',en:'tools and learning',ar:'الأدوات والتعلّم',pt:'ferramentas e aprendizagem'}},
      work:{learn:{fr:'documenter les projets',en:'document projects',ar:'توثيق المشاريع',pt:'documentar projetos'}}
    };
    const relationReason=(a,b)=>{const direct=relationNotes[a]?.[b]||relationNotes[b]?.[a];if(direct)return direct[lang]||direct.fr;const parentOf={myco:'bio',soil:'myco',lab:'myco',products:'soil',iot:'products',work:'products',learn:'lab'};if(parentOf[a]===b||parentOf[b]===a)return ({fr:'filiation et continuité',en:'lineage and continuity',ar:'الترابط والاستمرارية',pt:'linhagem e continuidade'}[lang]||'filiation et continuité');return ({fr:'boucle de rétroaction',en:'feedback loop',ar:'حلقة تغذية راجعة',pt:'ciclo de retroação'}[lang]||'boucle de rétroaction')};
    focusPanel.classList.add('has-world');focusPanel.innerHTML='';const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';kicker.textContent='UNIVERS / '+String(ids.indexOf(id)+1).padStart(2,'0');const title=document.createElement('strong');title.textContent=labels[id].title;const sub=document.createElement('small');sub.textContent=labels[id].sub;const meta=document.createElement('span');meta.className='webgl-focus-meta';meta.textContent=copy.links+' · '+related.length;const next=document.createElement('span');next.className='webgl-focus-next';next.textContent=copy.next;const list=document.createElement('div');list.className='webgl-focus-links';related.forEach(other=>{const button=document.createElement('button');button.type='button';button.className='webgl-focus-link';button.dataset.world=other;const name=document.createElement('span');name.textContent=labels[other].title;const reason=document.createElement('small');reason.className='webgl-focus-reason';reason.textContent=relationReason(id,other);button.append(name,reason);button.title=relationReason(id,other);button.setAttribute('aria-label',(lang==='ar'?'استكشف ':lang==='pt'?'Explorar ':lang==='en'?'Explore ':'Explorer ')+labels[other].title+' — '+relationReason(id,other));list.append(button)});focusPanel.append(kicker,title,sub,meta,next,list)}
  function flyTo(target,next){const start={x:cameraTarget.x,y:cameraTarget.y,z:cameraTarget.z,dist};const end=target?{x:target.position.x,y:target.position.y,z:target.position.z,dist:2.65}:{x:0,y:0,z:0,dist:11.8};transition={start,end,at:performance.now(),duration:980,next};selected=target?.userData?.id||null;refreshFocus(selected);stage.classList.add('is-transitioning')}
  function clearResourceNodes(){if(resourceGroup){worldGroup.remove(resourceGroup);resourceGroup.traverse(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}resourceGroup=null;resourceMeshes=[];resourceSignals=[]}
  function buildResourceNodes(id){clearResourceNodes();const mini=document.getElementById('miniView');if(!mini||mini.hidden)return;const anchors=[...mini.querySelectorAll('.linknode')].filter(a=>a.href&&a.href!=='#'&&a.getAttribute('href')!=='#');if(!anchors.length)return;const parent=points.find(p=>p.id===id);if(!parent)return;resourceGroup=new THREE.Group();resourceGroup.userData.kind='resources';worldGroup.add(resourceGroup);const count=anchors.length,radius=1.45+count*.055,color=parent.color,nodes=[];const stopWords=new Set(['page','pages','rubrique','principale','thème','associe','associé','projet','application','fiches','ressources','voir','ouvrir','notion','public','complet','complete','open','main','section','theme','related','resource','resources','project','application','and','the','for','from','with','dans','pour','des','les','une','un','de','du','la','le']);
    const terms=a=>{const title=a.querySelector('b')?.textContent||a.textContent.trim(),sub=a.querySelector('small')?.textContent||'',url=new URL(a.href,location.href);return {title,text:(title+' '+sub+' '+url.pathname).toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>3&&!stopWords.has(w)),url,titleClean:title.trim()}};
    anchors.forEach((a,i)=>{const angle=(i/count)*Math.PI*2-Math.PI/2;const p=new THREE.Vector3(parent.base.x+Math.cos(angle)*radius,parent.base.y+Math.sin(angle)*radius*.72,parent.base.z+Math.sin(angle*.8)*.48);const meta=terms(a);const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.55,metalness:.15,roughness:.3}));mesh.position.copy(p);mesh.userData={kind:'resource',url:a.href,title:meta.titleClean};resourceGroup.add(mesh);const label=makeLabel(meta.titleClean,color,15);label.position.set(p.x,p.y-.24,p.z);label.scale.set(1.8,.32,1);label.userData.kind='resource-label';resourceGroup.add(label);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([parent.base,p]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.52}));resourceGroup.add(line);nodes.push({mesh,p,meta});resourceMeshes.push(mesh)});
    // Match resource wording to other BA Labs workstreams, so Notion pages can bridge domains.
    const domainTerms={
      bio:['biotechnolog','microorganism','microbe','bacter','pgpr','bacillus','bioactiv','biolog','microbial','bacteria'],
      myco:['mycolog','mycel','champignon','pleurot','fungal','fungi','strain','souche','spore','culture','substrat'],
      soil:['soil','sol','technosoil','terre','compost','irrigation','eau','water','humus','substrat','biochar','sable'],
      lab:['laboratoire','laboratory','protocol','protocole','mesure','measurement','essai','test','experiment','experimen','r&d','analyse'],
      products:['produit','product','catalogue','catalog','kit','seringue','syringe','petri','commande','order','packaging'],
      iot:['iot','capteur','sensor','arduino','esp32','automatisation','automation','instrumentation','telemetry','télémétrie'],
      work:['projet','project','prototype','recherche','research','essai','trial','experiment','expériment','développement','development'],
      learn:['guide','formation','learning','apprendre','tutoriel','tutorial','documentation','ressource','resource','fiche','cours','course']
    };
    // Normalize dictionary entries exactly like resource tokens. Short words (e.g. "sol",
    // "eau", "kit") only match as complete tokens; longer stems may match inflections.
    const normalizeToken=value=>value.toLocaleLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
    const normalizedDomainTerms=Object.fromEntries(ids.map(domain=>[
      domain,domainTerms[domain].map(normalizeToken).filter(Boolean)
    ]));
    const matchesDomainTerm=(word,term)=>word===term||(
      term.length>=5&&word.length>=term.length-1&&
      (word.startsWith(term)||term.startsWith(word))
    );
    const matchedDomains=meta=>ids.filter(other=>other!==id&&
      normalizedDomainTerms[other].some(term=>meta.text.some(word=>matchesDomainTerm(word,term))));
    // Rank bridges by evidence and cap each resource's degree to preserve readable topology.
    // A page may connect to at most two other domains; specific multi-word stems outrank broad matches.
    for(const node of nodes){
      const ranked=matchedDomains(node.meta).map(otherId=>{
        const terms=normalizedDomainTerms[otherId];
        const score=terms.reduce((sum,term)=>sum+(node.meta.text.some(word=>word===term)?3:node.meta.text.some(word=>matchesDomainTerm(word,term))?1:0),0);
        return {otherId,score};
      }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||ids.indexOf(a.otherId)-ids.indexOf(b.otherId)).slice(0,2);
      for(const {otherId} of ranked){
        const target=points.find(p=>p.id===otherId);if(!target)continue;
        const delta=target.base.clone().sub(node.p),axis=new THREE.Vector3().crossVectors(delta,new THREE.Vector3(.31,.87,.43)).normalize();
        const mid=node.p.clone().lerp(target.base,.5).addScaledVector(axis,.16);
        const curve=new THREE.QuadraticBezierCurve3(node.p,mid,target.base);
        const bridge=makeNeurite(curve,target.color,.008,.36,20);
        bridge.userData={kind:'resource-domain-link',id:otherId,resource:node.meta.titleClean};resourceGroup.add(bridge);
        const pulse=new THREE.Mesh(new THREE.SphereGeometry(.019,10,8),new THREE.MeshBasicMaterial({color:0xe1f4d9,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
        pulse.userData.kind='resource-signal';resourceGroup.add(pulse);
        resourceSignals.push({mesh:pulse,curve,offset:(nodes.indexOf(node)+ids.indexOf(otherId))*.113,speed:.105+(ids.indexOf(otherId)%3)*.018});
      }
    }
    // Score resource-to-resource links using distinctive shared terms, not generic vocabulary.
    const genericResourceTerms=new Set(['culture','cultures','projet','projets','project','projects','essai','essais','trial','trials','test','tests','guide','guides','fiche','fiches','ressource','ressources','resource','resources','produit','produits','product','products','laboratoire','laboratory','documentation','application','applications','development','developpement','recherche','research','public','notion','catalogue','catalog']);
    const candidates=[];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      const shared=[...new Set(a.meta.text.filter(w=>b.meta.text.includes(w)&&w.length>=5&&!genericResourceTerms.has(w)))];
      const pathA=a.meta.url.pathname.split('/').filter(Boolean).slice(0,-1).join('/');
      const pathB=b.meta.url.pathname.split('/').filter(Boolean).slice(0,-1).join('/');
      const samePath=!!pathA&&pathA===pathB&&a.meta.url.origin===b.meta.url.origin;
      const score=shared.reduce((sum,w)=>sum+Math.min(w.length,12),0)+(samePath?5:0);
      if(score>0)candidates.push({i,j,score});
    }
    candidates.sort((a,b)=>b.score-a.score||a.i-b.i||a.j-b.j);
    const resourceDegree=nodes.map(()=>0),maxResourceLinks=Math.min(nodes.length,Math.ceil(nodes.length*1.25));
    let resourceLinkCount=0;
    for(const candidate of candidates){
      const {i,j}=candidate;
      if(resourceDegree[i]>=3||resourceDegree[j]>=3)continue;
      if(resourceLinkCount>=maxResourceLinks)break;
      const a=nodes[i],b=nodes[j],delta=b.p.clone().sub(a.p);
      const axis=new THREE.Vector3().crossVectors(delta,new THREE.Vector3(.31,.87,.43)).normalize();
      const mid=a.p.clone().lerp(b.p,.5).addScaledVector(axis,.12+((j-i)%4)*.012);
      const curve=new THREE.QuadraticBezierCurve3(a.p,mid,b.p);
      const line=makeNeurite(curve,color,.009,.46,18);
      line.userData={kind:'resource-relation',id,a:a.mesh.userData.title,b:b.mesh.userData.title};resourceGroup.add(line);
      const pulse=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),new THREE.MeshBasicMaterial({color:0xe1f4d9,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
      pulse.userData.kind='resource-signal';resourceGroup.add(pulse);
      resourceSignals.push({mesh:pulse,curve,offset:(i+j)*.137,speed:.12+((i+j)%3)*.018});
      resourceDegree[i]++;resourceDegree[j]++;resourceLinkCount++;
    }
  }
  function refreshLabels(){for(const p of points){const el=document.querySelector('[data-sphere="'+p.id+'"]');if(!el)continue;const next=el.querySelector('b')?.textContent||p.id;if(p.label.userData.labelText===next)continue;p.label.userData.labelText=next;const old=p.label.material.map;const replacement=makeLabel(next,0xf5f7fa,27);p.label.material.map=replacement.material.map;p.label.scale.set(Math.min(3.45,Math.max(1.8,next.length*.105)),.52,1);p.label.material.needsUpdate=true;old?.dispose();replacement.material.dispose()}}
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
  function updateHover(e){if(!renderer||!worldGroup?.visible)return;const hits=hitTest(e),obj=hits[0]?.object||null;const next=obj?.userData?.kind==='sphere'?obj.userData.id:null;const resource=obj?.userData?.kind==='resource'?obj.userData.url:null;if(next===hovered&&resource===stage.dataset.hoverResource)return;hovered=next;if(next)refreshFocus(next);else if(!selected)refreshFocus(null);stage.dataset.hoverResource=resource||'';stage.classList.toggle('resource-hover',!!resource);stage.style.cursor=(next||resource)?'pointer':'grab';for(const p of points){const active=p.id===hovered;p.mesh.material.emissiveIntensity=active?1.05:.62;p.mesh.scale.setScalar(active?1.08:(selected===p.id?1.04:1))}for(const edge of edges){const focus=hovered||selected;const connected=!!focus&&(edge.relation?(edge.aId===focus||edge.bId===focus):(edge.id===focus||edge.parentId===focus));const base=edge.relation?.72:.88;edge.line.material.opacity=focus?(connected?(edge.relation?.94:.98):.045):base;edge.line.material.needsUpdate=true;if(edge.pulse)edge.pulse.material.opacity=focus?(connected?.98:.12):.72;if(edge.pulse2)edge.pulse2.material.opacity=focus?(connected?.88:.08):.58}}
  function pick(e){if(transition)return;const hits=hitTest(e);if(!hits.length)return;const obj=hits[0].object;if(obj.userData.kind==='resource'){window.open(obj.userData.url,'_blank','noopener,noreferrer');return}if(obj.userData.kind==='sphere'){const id=obj.userData.id,node=points.find(p=>p.id===id);flyTo(node.mesh,()=>{document.querySelector('[data-sphere="'+id+'"]')?.click();requestAnimationFrame(()=>requestAnimationFrame(()=>buildResourceNodes(id)));stage.classList.remove('is-transitioning')})}}
  // Relay pulses traverse several universes in sequence, making the network read as one living system.
  const relayRoutes=[
    ['bio','lab','products','iot'],
    ['myco','soil','work','lab','learn'],
    ['bio','myco','soil','products','work'],
    ['iot','products','soil','lab','learn']
  ];
  const relaySignals=[];
  for(const route of relayRoutes){
    const segments=[];
    for(let i=0;i<route.length-1;i++){
      const from=route[i],to=route[i+1];
      const edge=edges.find(e=>!e.anastomosis&&(
        (e.relation&&((e.aId===from&&e.bId===to)||(e.aId===to&&e.bId===from)))||
        (!e.relation&&((e.parentId===from&&e.id===to)||(e.parentId===to&&e.id===from)))
      ));
      if(edge)segments.push({edge,reverse:edge.relation?(edge.aId===to&&edge.bId===from):(edge.parentId===to&&edge.id===from),length:edge.curve.getLength()});
    }
    if(segments.length>1){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.027,12,10),new THREE.MeshBasicMaterial({color:0xe1f4d9,transparent:true,opacity:.95,depthWrite:false,toneMapped:false}));
      mesh.userData={kind:'relay-signal'};worldGroup.add(mesh);
      const trail=new THREE.Mesh(new THREE.SphereGeometry(.016,10,8),new THREE.MeshBasicMaterial({color:0xb7dfbd,transparent:true,opacity:.88,depthWrite:false,toneMapped:false}));
      trail.userData={kind:'relay-signal',trail:true};worldGroup.add(trail);
      const totalLength=segments.reduce((sum,segment)=>sum+segment.length,0);
      relaySignals.push({mesh,trail,segments,totalLength,offset:relaySignals.length*.19,speed:.42+relaySignals.length*.035});
    }
  }
  const placeRelayParticle=(mesh,route,progress)=>{
    const distance=((progress%1)+1)%1*route.totalLength;
    let travelled=0,segment=route.segments[route.segments.length-1],local=1;
    for(const candidate of route.segments){
      if(distance<=travelled+candidate.length){segment=candidate;local=(distance-travelled)/candidate.length;break}
      travelled+=candidate.length;
    }
    const u=segment.reverse?1-local:local;
    mesh.position.copy(segment.edge.curve.getPointAt(THREE.MathUtils.clamp(u,0,1)));
  };
  function animate(){raf=requestAnimationFrame(animate);if(!renderer)return;const now=performance.now(),t=now*.001;if(transition){const k=Math.min(1,(now-transition.at)/transition.duration),e=easeInOut(k);cameraTarget.set(THREE.MathUtils.lerp(transition.start.x,transition.end.x,e),THREE.MathUtils.lerp(transition.start.y,transition.end.y,e),THREE.MathUtils.lerp(transition.start.z,transition.end.z,e));dist=THREE.MathUtils.lerp(transition.start.dist,transition.end.dist,e);if(k>=1){const next=transition.next;transition=null;stage.classList.remove('is-transitioning');next?.()}}const focus=hovered||selected;const activeIds=new Set();if(focus){activeIds.add(focus);for(const edge of edges){if(edge.relation&&(edge.aId===focus||edge.bId===focus)){activeIds.add(edge.aId);activeIds.add(edge.bId)}else if(!edge.relation&&(edge.id===focus||edge.parentId===focus)){activeIds.add(edge.id);activeIds.add(edge.parentId)}}}for(const p of points){const active=p.id===focus,neighbor=activeIds.has(p.id);const f=active?1.24:(selected===p.id?1.12:1+Math.sin(t*1.1+ids.indexOf(p.id))*.018);p.mesh.scale.setScalar(f);p.mesh.rotation.y=t*.09+ids.indexOf(p.id)*.2;p.mesh.rotation.x=Math.sin(t*.32+ids.indexOf(p.id))*.035;p.mesh.material.emissiveIntensity=active?(.62+.35*(.5+.5*Math.sin(t*2.1))):(focus?(neighbor?.34:.08):.14);p.label.material.opacity=focus?(neighbor?1:.36):1;p.label.quaternion.copy(camera.quaternion);for(const twig of p.twigs){const base=twig.material.userData.baseOpacity??.8;twig.material.opacity=focus?(neighbor?Math.min(1,base*(active?1.14:1.04)):base*.2):base;twig.material.emissiveIntensity=focus?(neighbor?.32:.02):.18}}for(const obj of worldGroup.children){const kind=obj.userData?.kind;if((kind==='dendrite'||kind==='synapse')&&obj.material){const id=obj.userData.id,base=obj.material.userData.baseOpacity??.7;obj.material.opacity=focus?(activeIds.has(id)?Math.min(1,base*1.12):base*.18):base;obj.material.emissiveIntensity=focus?(activeIds.has(id)?.28:.015):.18}}for(const e of edges){const focus=hovered||selected;const connected=!!focus&&(e.relation?(e.aId===focus||e.bId===focus):e.id===focus||e.parentId===focus);if(e.line?.material){const base=e.line.material.userData.baseOpacity??e.line.material.opacity;e.line.material.userData.baseOpacity=base;e.line.material.opacity=focus?(connected?Math.min(1,base*1.18):base*.16):base;if('emissiveIntensity'in e.line.material)e.line.material.emissiveIntensity=focus?(connected?.24:.015):.08}if(!e.pulse||!e.curve)continue;const speed=e.relation?.052:.105;const reverse=!!focus&&(e.relation?e.bId===focus:e.parentId===focus);const raw=(t*speed+e.phase)%1,progress=focus&&connected?(reverse?1-raw:raw):raw;e.pulse.position.copy(e.curve.getPoint(progress));e.pulse.material.opacity=focus?(connected?.52+.46*Math.sin(progress*Math.PI):.10):(.48+.42*Math.sin(progress*Math.PI));if(e.pulse2){const raw2=(raw+.47)%1,progress2=focus&&connected?(reverse?1-raw2:raw2):raw2;e.pulse2.position.copy(e.curve.getPoint(progress2));e.pulse2.material.opacity=focus?(connected?.35+.53*Math.sin(progress2*Math.PI):.06):.3+.55*Math.sin(progress2*Math.PI)}}for(const relay of relaySignals){const cycle=(t*relay.speed+relay.offset)%1;placeRelayParticle(relay.mesh,relay,cycle);placeRelayParticle(relay.trail,relay,cycle-.055);relay.mesh.material.opacity=.58+.4*Math.sin(cycle*Math.PI);relay.trail.material.opacity=.36+.48*Math.sin((((cycle-.055)%1)+1)%1*Math.PI)}for(const signal of resourceSignals){const progress=(t*signal.speed+signal.offset)%1;signal.mesh.position.copy(signal.curve.getPoint(progress));signal.mesh.material.opacity=.38+.58*Math.sin(progress*Math.PI)}if(!dragging&&!transition){theta+=rotateVX;phi=THREE.MathUtils.clamp(phi+rotateVY,.35,2.78);rotateVX*=.88;rotateVY*=.88;if(Math.abs(rotateVX)<.00005)rotateVX=0;if(Math.abs(rotateVY)<.00005)rotateVY=0}updateCamera();renderer.render(scene,camera)}
  init();
}
