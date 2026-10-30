// A stalled CDN must never block the entire public interface. Give each pinned
// Three.js module host a bounded window, then move to the next one.
const importThreeWithTimeout=(url,host,timeoutMs=8000)=>Promise.race([
  import(url),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error(host+' did not respond within '+timeoutMs+' ms')),timeoutMs))
]);
let THREE;
try{
  THREE=await importThreeWithTimeout('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','jsDelivr');
}catch(primaryImportError){
  try{
    THREE=await importThreeWithTimeout('https://unpkg.com/three@0.169.0/build/three.module.js','unpkg');
  }catch(secondaryImportError){
    try{
      THREE=await importThreeWithTimeout('https://esm.sh/three@0.169.0','esm.sh');
    }catch(fallbackImportError){
      console.error('BALabs 3D engine could not be loaded from the available module hosts.',primaryImportError,secondaryImportError,fallbackImportError);
    }
  }
}

const root=document.getElementById('mainView');
const show3DFailure=()=>{
  if(!root)return;
  root.classList.remove('webgl-ready','universe-open','universe-closed');
  root.classList.add('webgl-load-error');
  root.querySelectorAll('.network,.galaxy,.hub,.sphere').forEach(el=>{el.style.display='none'});
  root.querySelector('.webgl-load-error-panel')?.remove();
  const lang=document.documentElement.lang||'fr';
  const copy={
    fr:{title:'Le réseau 3D ne peut pas démarrer',body:'Le moteur graphique n’a pas répondu. Réessaie le chargement pour retrouver l’univers interactif.',action:'RÉESSAYER'},
    en:{title:'The 3D network could not start',body:'The graphics engine did not respond. Reload to try opening the interactive universe again.',action:'RETRY'},
    ar:{title:'تعذّر تشغيل الشبكة ثلاثية الأبعاد',body:'لم يستجب محرك الرسوميات. أعد التحميل لمحاولة فتح العالم التفاعلي.',action:'إعادة المحاولة'},
    pt:{title:'A rede 3D não iniciou',body:'O motor gráfico não respondeu. Recarregue para tentar abrir novamente o universo interativo.',action:'TENTAR NOVAMENTE'}
  }[lang]||{title:'The 3D network could not start',body:'The graphics engine did not respond. Reload to try again.',action:'RETRY'};
  const panel=document.createElement('div');panel.className='webgl-load-error-panel';
  panel.style.cssText='position:relative;z-index:12;min-height:360px;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 22px;text-align:center;color:#e8edf0;background:radial-gradient(ellipse at 50% 35%,#405a70 0%,#263d52 58%,#182b3b 100%);border-radius:18px;font-family:system-ui,sans-serif';
  const title=document.createElement('strong');title.textContent=copy.title;title.style.cssText='font:500 clamp(20px,3vw,28px)/1.25 Georgia,serif;color:#f2e8d7';
  const body=document.createElement('p');body.textContent=copy.body;body.style.cssText='max-width:390px;margin:0;color:#d1dce3;font-size:13px;line-height:1.7';
  const retry=document.createElement('button');retry.type='button';retry.textContent=copy.action;retry.style.cssText='margin-top:8px;padding:11px 18px;border:1px solid #d2b17c;border-radius:999px;background:#172d3d;color:#f2dfbf;font:700 10px system-ui;letter-spacing:.12em;cursor:pointer';retry.addEventListener('click',()=>window.location.reload());
  panel.append(title,body,retry);root.append(panel);
};
if(root&&!THREE){show3DFailure()}
else if(root){
  const sphereEls=[...document.querySelectorAll('[data-sphere]')];
  const ids=['bio','myco','soil','lab','products','iot','work','learn'];
  const colors={bio:0x9bc58a,myco:0xe29a62,soil:0xd2b078,lab:0x78b2d0,products:0xd77b68,iot:0x83aeb2,work:0xb39bc9,learn:0xd3c27d};
  const labels=Object.fromEntries(sphereEls.map(el=>[el.dataset.sphere,{title:el.querySelector('b')?.textContent||el.dataset.sphere,sub:el.querySelector('small')?.textContent||''}]));
  const stage=document.createElement('div');stage.className='webgl-stage';stage.setAttribute('role','application');stage.setAttribute('aria-label','Constellation 3D interactive BALabs');stage.tabIndex=0;
  const hint=document.createElement('div');hint.className='webgl-hint';hint.id='webgl-navigation-hint';stage.setAttribute('aria-describedby',hint.id);const hintText={fr:'GLISSER POUR TOURNER · PINCER POUR ZOOMER · TOUCHER UN UNIVERS',en:'DRAG TO ROTATE · PINCH TO ZOOM · TAP A WORLD',ar:'اسحب للتدوير · اقرص للتكبير · المس عالماً',pt:'ARRASTE PARA RODAR · USE DOIS DEDOS PARA AMPLIAR · TOQUE NUM UNIVERSO'};const refreshHint=()=>{hint.textContent=hintText[document.documentElement.lang]||hintText.fr};refreshHint();new MutationObserver(refreshHint).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const status=document.createElement('div');status.className='webgl-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');status.textContent='BALABS / LIVING NETWORK';
  const focusPanel=document.createElement('div');focusPanel.className='webgl-focus';focusPanel.hidden=true;focusPanel.style.display='none';focusPanel.setAttribute('aria-live','polite');focusPanel.innerHTML='';
  const controls=document.createElement('div');controls.className='webgl-controls';controls.setAttribute('aria-label','Commandes de navigation 3D');controls.innerHTML='<button type="button" data-camera="out" aria-label="Dézoomer" title="Dézoomer">−</button><button type="button" data-camera="in" aria-label="Zoomer" title="Zoomer">+</button><button type="button" data-camera="reset" aria-label="Recentrer la constellation" title="Recentrer">⌖</button>';
  const intro=document.createElement('button');intro.type='button';intro.className='webgl-intro';intro.setAttribute('aria-label','Entrer dans l’univers BA Labs');
  intro.innerHTML='<span class="webgl-intro-kicker">APPLIED BIOTECHNOLOGY</span><span class="webgl-intro-orb"><i></i><i></i><i></i><b>BA</b></span><strong>BA Labs</strong><small class="webgl-intro-copy">Un écosystème. Huit mondes. Des connexions vivantes.</small><span class="webgl-intro-cta">ENTRER DANS L’UNIVERS <b>↗</b></span>';
  const introStyle=document.createElement('style');introStyle.textContent='.webgl-stage{position:relative;overflow:hidden}.webgl-intro{position:absolute;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;width:100%;min-height:inherit;padding:28px 18px;border:0;color:#edf4eb;background:radial-gradient(ellipse at 50% 34%,#60785cf5 0%,#405941f7 48%,#2d4335fa 100%);cursor:pointer;text-align:center}.webgl-intro:focus-visible{outline:2px solid #b8d7a6;outline-offset:-7px}.webgl-intro-kicker{font:700 10px/1.4 system-ui,sans-serif;letter-spacing:.28em;color:#d0e3c6}.webgl-intro-orb{position:relative;display:grid;place-items:center;width:clamp(150px,25vw,235px);aspect-ratio:1;border:1px solid #b6d8aa7a;border-radius:50%;background:radial-gradient(circle at 32% 26%,#d5f4d72a,#8bbd9a12 35%,#12251d70 72%,#0e1715cc);box-shadow:inset -22px -18px 45px #0007,inset 10px 9px 32px #e1ffe51a,0 0 50px #9ed99c19;backdrop-filter:blur(2px);animation:introFloat 5s ease-in-out infinite}.webgl-intro-orb:before,.webgl-intro-orb:after{content:"";position:absolute;inset:12%;border:1px solid #c7eacb45;border-radius:48% 52% 43% 57%;transform:rotate(34deg) scaleX(.72)}.webgl-intro-orb:after{inset:3%;transform:rotate(-38deg) scaleY(.58);border-color:#c7eacb2b}.webgl-intro-orb i{position:absolute;width:7px;height:7px;border-radius:50%;background:#c6e5b7;box-shadow:0 0 16px 4px #a9c5a366}.webgl-intro-orb i:nth-child(1){top:18%;left:31%}.webgl-intro-orb i:nth-child(2){right:17%;top:47%;background:#c98b52}.webgl-intro-orb i:nth-child(3){left:26%;bottom:20%;background:#829fba}.webgl-intro-orb b{font-size:clamp(38px,7vw,58px);letter-spacing:.12em;color:#d3e9c8;text-shadow:0 0 28px #a9c5a34a}.webgl-intro>strong{font-size:clamp(25px,4vw,38px);letter-spacing:.07em}.webgl-intro-copy{max-width:340px;color:#e0e9dc;font-size:13px;line-height:1.75}.webgl-intro-cta{margin-top:7px;padding:11px 15px;border:1px solid #a9c5a36e;border-radius:999px;color:#d8ebd1;font-size:10px;font-weight:800;letter-spacing:.12em;background:#a9c5a30c}.webgl-intro-cta b{margin-left:9px;color:#b7d7a7}.webgl-intro:hover .webgl-intro-orb{box-shadow:inset -22px -18px 45px #0007,0 0 70px #9ed99c35;border-color:#d3edc2b0}.webgl-intro:hover .webgl-intro-cta{background:#a9c5a31c;border-color:#b8d7a6}@keyframes introFloat{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-7px) rotate(2deg)}}@media(prefers-reduced-motion:reduce){.webgl-intro-orb{animation:none}}';
  introStyle.textContent+='.webgl-intro{background:radial-gradient(ellipse at 50% 36%,#405b79 0%,#293f58 48%,#1b2a3b 100%)}.webgl-intro-kicker{color:#d5e4ef}.webgl-intro-orb{border-color:#9ab9d17a;background:radial-gradient(circle at 32% 26%,#a9d5f044,#6796bd20 36%,#203a547a 72%,#142234e8);box-shadow:inset -22px -18px 45px #0007,inset 10px 9px 32px #e1f2ff1a,0 0 50px #83b8df26}.webgl-intro-orb:before{border-color:#a9d8a96b;background:linear-gradient(135deg,transparent 30%,#8fbd8a12 52%,transparent 72%)}.webgl-intro-orb:after{border-color:#d99b6a55}.webgl-intro-orb i:nth-child(1){background:#a9d2a0;box-shadow:0 0 16px 4px #9acb8c77}.webgl-intro-orb i:nth-child(2){background:#e0a16b;box-shadow:0 0 16px 4px #df9a6377}.webgl-intro-orb i:nth-child(3){background:#a9d4ef;box-shadow:0 0 16px 4px #91c4e977}.webgl-intro:hover .webgl-intro-orb{box-shadow:inset -22px -18px 45px #0007,0 0 70px #8dbbe044;border-color:#c2d9e8b0}.webgl-intro-copy{color:#d3e0e9}.webgl-intro-cta{border-color:#a9c5d26e;color:#e2edf3;background:#8bb5d00c}.webgl-intro-cta b{color:#d6a174}.webgl-intro:hover .webgl-intro-cta{background:#8bb5d01c;border-color:#b8d7e6}';
  introStyle.textContent+='.webgl-intro{background:radial-gradient(ellipse at 50% 36%,#405b79 0%,#293f58 48%,#172a38 100%);gap:16px}.webgl-intro-kicker{font:800 9px ui-monospace,monospace;letter-spacing:.24em;color:#e1c18b}.webgl-intro-orb{border-radius:43% 57% 48% 52% / 56% 43% 57% 44%;border:1px solid #c4d4bc;background:radial-gradient(circle at 34% 28%,#d8c18b55,#6796bd20 37%,#203a547a 72%,#142234e8);box-shadow:inset -22px -18px 45px #0007,inset 10px 9px 32px #e1f2ff1a,0 0 0 10px #d4ad5312,0 0 55px #83b8df30}.webgl-intro-orb:before{border-color:#b8d6a76b;border-radius:48% 52% 61% 39%}.webgl-intro-orb:after{border-color:#d99b6a77;border-radius:62% 38% 45% 55%}.webgl-intro-orb b{font:italic 400 clamp(42px,7vw,64px) Georgia,serif;letter-spacing:.04em;color:#f1e5cc}.webgl-intro>strong{font:italic 400 clamp(29px,4vw,43px) Georgia,serif;letter-spacing:.02em}.webgl-intro-copy{font:11px/1.8 ui-monospace,monospace;color:#d4e0e3}.webgl-intro-cta{border:0;border-bottom:1px solid #d4ad53;border-radius:0;background:transparent;color:#f1d8ad;padding:12px 4px;font:9px ui-monospace,monospace;letter-spacing:.17em}.webgl-intro-cta b{color:#d4ad53}.webgl-intro:hover .webgl-intro-cta{background:transparent;border-color:#f0d9a8}';
  const networkLegend=document.createElement('div');networkLegend.className='webgl-network-legend';networkLegend.setAttribute('aria-label','Légende du réseau');networkLegend.innerHTML='<span><i class="legend-structural"></i><b data-legend="structure">STRUCTURE</b></span><span><i class="legend-cross"></i><b data-legend="connections">CONNEXIONS</b></span><span><i class="legend-signal"></i><b data-legend="signals">SIGNAUX VIVANTS</b></span>';
  const refreshNetworkLegend=()=>{const lang=document.documentElement.lang||'fr';const copy={fr:{label:'Légende du réseau',structure:'STRUCTURE',connections:'CONNEXIONS',signals:'SIGNAUX VIVANTS'},en:{label:'Network legend',structure:'STRUCTURE',connections:'CONNECTIONS',signals:'LIVING SIGNALS'},ar:{label:'مفتاح الشبكة',structure:'البنية',connections:'الروابط',signals:'إشارات حيّة'},pt:{label:'Legenda da rede',structure:'ESTRUTURA',connections:'LIGAÇÕES',signals:'SINAIS VIVOS'}}[lang]||{label:'Network legend',structure:'STRUCTURE',connections:'CONNECTIONS',signals:'LIVING SIGNALS'};networkLegend.setAttribute('aria-label',copy.label);networkLegend.querySelector('[data-legend="structure"]').textContent=copy.structure;networkLegend.querySelector('[data-legend="connections"]').textContent=copy.connections;networkLegend.querySelector('[data-legend="signals"]').textContent=copy.signals};
  refreshNetworkLegend();new MutationObserver(refreshNetworkLegend).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  introStyle.textContent+='.webgl-network-legend{position:absolute;left:14px;bottom:42px;z-index:3;display:flex;flex-wrap:wrap;gap:8px 14px;max-width:calc(100% - 28px);padding:9px 11px;border:1px solid #b6d8aa25;border-radius:10px;background:linear-gradient(110deg,#2b4035ed,#354039e8);backdrop-filter:blur(10px);box-shadow:0 8px 24px #0b140e55;pointer-events:none;color:#e4eee3;font:700 8px/1.3 system-ui,sans-serif;letter-spacing:.09em}.webgl-network-legend span{display:flex;align-items:center;gap:6px;white-space:nowrap}.webgl-network-legend i{display:inline-block;width:17px;height:2px;border-radius:4px;background:#b6d8aa}.webgl-network-legend .legend-cross{background:#c98b52;box-shadow:0 0 7px #c98b5266}.webgl-network-legend .legend-signal{height:5px;width:5px;border-radius:50%;background:#e1f4d9;box-shadow:0 0 8px 2px #b7dfbd99}@media(max-width:520px){.webgl-network-legend{left:9px;bottom:38px;gap:6px 9px;padding:7px 8px;font-size:7px}.webgl-network-legend i{width:12px}}';
  introStyle.textContent+='.webgl-stage{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:100%!important;z-index:5!important;overflow:hidden!important}.webgl-stage>canvas{position:absolute;inset:0;display:block;width:100%;height:100%;z-index:0}.webgl-stage>.webgl-intro{z-index:8}.webgl-stage>.webgl-controls,.webgl-stage>.webgl-hint,.webgl-stage>.webgl-status,.webgl-stage>.webgl-network-legend{z-index:9}#mainView.webgl-ready>.network,#mainView.webgl-ready>.galaxy,#mainView.webgl-ready>.hub,#mainView.webgl-ready>.sphere{display:none!important}#mainView.webgl-ready{position:relative;overflow:hidden;isolation:isolate}#mainView.webgl-ready.universe-closed .webgl-stage{display:block!important}';
  introStyle.textContent+='.webgl-intro{background:radial-gradient(ellipse at 50% 42%,#344e67a8 0%,#243b5288 48%,#172a38a0 100%)!important;backdrop-filter:blur(4px) saturate(1.08);gap:15px}.webgl-intro-orb{display:none!important}.webgl-intro-orb{width:clamp(138px,22vw,194px);border-radius:42% 58% 49% 51% / 55% 43% 57% 45%;background:radial-gradient(circle at 32% 27%,#d8c18b4a,#6f9fc32b 38%,#203a5470 72%,#142234b8);box-shadow:inset -18px -16px 36px #0006,inset 9px 8px 26px #e1f2ff20,0 0 0 9px #d4ad5310,0 0 44px #83b8df2b}.webgl-intro-orb:before{inset:10%;border-radius:58% 42% 62% 38%;transform:rotate(32deg) scaleX(.76);border-color:#b8d6a77a}.webgl-intro-orb:after{inset:1%;border-radius:44% 56% 39% 61%;transform:rotate(-31deg) scaleY(.68);border-color:#d99b6a66}.webgl-intro>strong{color:#f2eee2;text-shadow:0 2px 20px #0b1a2a99}.webgl-intro-copy{color:#dbe6e9}.webgl-intro-cta{margin-top:4px;border:1px solid #c8d8d366;border-radius:999px;padding:10px 16px;background:#152b3a55;color:#f1dfc1}.webgl-intro-cta b{color:#e0a16b}.webgl-intro:hover .webgl-intro-cta{background:#31516a88;border-color:#d8c18b}';
  stage.append(hint,status,controls,networkLegend,introStyle,intro);root.append(stage);
  let renderer,scene,camera,raycaster,mouse,core,points=[],edges=[],tissuePickables=[],stars,dragging=false,moved=false,lastX=0,lastY=0,theta=.25,phi=1.18,dist=10.2,selected=null,raf=0,worldGroup,hovered=null,transition=null,cameraTarget=new THREE.Vector3(),resourceGroup=null,resourceMeshes=[],resourceSignals=[],rotateVX=0,rotateVY=0,pointers=new Map(),pinchDistance=0;
  const stageVisibility={visible:true};
  const pixelRatio=()=>Math.min(window.devicePixelRatio||1,window.innerWidth<=760?1.1:1.5);
  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');let reduceMotion=motionPreference.matches;motionPreference.addEventListener?.('change',event=>{reduceMotion=event.matches});
  const spatialUiCopy={
    fr:{group:'Commandes de navigation 3D',stage:'Constellation 3D interactive de BA Labs',canvas:'Scène 3D de BA Labs',status:'BALABS / RÉSEAU VIVANT',out:'Dézoomer',in:'Zoomer',reset:'Recentrer la constellation'},
    en:{group:'3D navigation controls',stage:'Interactive BA Labs 3D constellation',canvas:'BA Labs 3D scene',status:'BALABS / LIVING NETWORK',out:'Zoom out',in:'Zoom in',reset:'Reset constellation view'},
    ar:{group:'أدوات التنقل ثلاثي الأبعاد',stage:'كوكبة BA Labs ثلاثية الأبعاد التفاعلية',canvas:'مشهد BA Labs ثلاثي الأبعاد',status:'BALABS / شبكة حيّة',out:'تصغير',in:'تكبير',reset:'إعادة ضبط عرض الكوكبة'},
    pt:{group:'Controlos de navegação 3D',stage:'Constelação 3D interativa da BA Labs',canvas:'Cena 3D da BA Labs',status:'BALABS / REDE VIVA',out:'Diminuir zoom',in:'Aumentar zoom',reset:'Recentrar a constelação'}
  };
  const introCopy={fr:['Un écosystème. Huit mondes. Des connexions vivantes.','ENTRER DANS L’UNIVERS'],en:['One ecosystem. Eight worlds. Living connections.','ENTER THE UNIVERSE'],ar:['منظومة واحدة. ثمانية عوالم. روابط حيّة.','ادخل إلى العالم'],pt:['Um ecossistema. Oito mundos. Ligações vivas.','ENTRAR NO UNIVERSO']};
  const refreshIntro=()=>{const copy=introCopy[document.documentElement.lang]||introCopy.fr;intro.querySelector('.webgl-intro-copy').textContent=copy[0];intro.querySelector('.webgl-intro-cta').childNodes[0].textContent=copy[1]+' ';intro.setAttribute('aria-label',copy[1]);};
  refreshIntro();new MutationObserver(refreshIntro).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  // Keep the gateway click isolated from the canvas pointer-up picker. Otherwise the same tap can select a hidden world underneath the intro and open directly into its close-up.
  intro.addEventListener('pointerdown',e=>e.stopPropagation());
  intro.addEventListener('pointerup',e=>e.stopPropagation());
  intro.addEventListener('pointercancel',e=>e.stopPropagation());
  intro.addEventListener('click',e=>{e.stopPropagation();intro.classList.add('is-opening');intro.disabled=true;intro.style.transition='opacity .55s ease,transform .55s ease';intro.style.opacity='0';intro.style.transform='scale(1.035)';window.setTimeout(()=>{intro.style.display='none';intro.style.opacity='';intro.style.transform='';intro.classList.remove('is-opening');intro.disabled=false;root.classList.remove('universe-closed');root.classList.add('universe-open');if(worldGroup)worldGroup.visible=true;selected=null;hovered=null;cameraTarget.set(0,0,0);dist=11.8;theta=.25;phi=1.18;updateCamera();refreshFocus(null);},480);});
  const refreshSpatialUi=()=>{
    const lang=document.documentElement.lang||'fr';
    const copy=spatialUiCopy[lang]||spatialUiCopy.fr;
    const legendCopy={fr:{structure:'STRUCTURE',connections:'CONNEXIONS',signals:'SIGNAUX VIVANTS',label:'Légende du réseau'},en:{structure:'STRUCTURE',connections:'CONNECTIONS',signals:'LIVE SIGNALS',label:'Network legend'},ar:{structure:'البنية',connections:'الروابط',signals:'إشارات حيّة',label:'دليل الشبكة'},pt:{structure:'ESTRUTURA',connections:'LIGAÇÕES',signals:'SINAIS ATIVOS',label:'Legenda da rede'}}[lang]||{structure:'STRUCTURE',connections:'CONNEXIONS',signals:'SIGNAUX VIVANTS',label:'Légende du réseau'};
    networkLegend.setAttribute('aria-label',legendCopy.label);
    for(const item of networkLegend.querySelectorAll('[data-legend]'))item.textContent=legendCopy[item.dataset.legend];
    stage.setAttribute('aria-label',copy.stage);
    status.textContent=copy.status;
    renderer?.domElement?.setAttribute('aria-label',copy.canvas);
    controls.setAttribute('aria-label',copy.group);
    for(const button of controls.querySelectorAll('[data-camera]')){
      const label=copy[button.dataset.camera];
      if(label){button.setAttribute('aria-label',label);button.title=label;}
    }
    refreshFocus(selected);
  };
  new MutationObserver(refreshSpatialUi).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  refreshSpatialUi();
  const material=(color,emissive=color)=>new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.48,metalness:.04,roughness:.56});
  // Tapered, softly shaded biological processes: broad at the origin and fine at the tip.
  // The taper is built into the mesh so branches read as living extensions, not hoses.
  const makeNeurite=(curve,color,radius=.016,opacity=.78,segments=20)=>{
    const radial=5,geometry=new THREE.TubeGeometry(curve,segments,radius,radial,false);
    const positions=geometry.attributes.position;
    for(let i=0;i<=segments;i++){
      const u=i/segments,center=curve.getPointAt(u);
      const taper=.08+.88*Math.pow(1-u,.72);
      for(let j=0;j<=radial;j++){
        const index=i*(radial+1)+j;
        const x=positions.getX(index)-center.x,y=positions.getY(index)-center.y,z=positions.getZ(index)-center.z;
        positions.setXYZ(index,center.x+x*taper,center.y+y*taper,center.z+z*taper);
      }
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();
    const baseOpacity=THREE.MathUtils.clamp(opacity,0,1);
    const material=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.16),emissiveIntensity:.28,roughness:.94,metalness:0,transparent:baseOpacity<1,opacity:baseOpacity,depthWrite:baseOpacity>.92});
    material.userData.baseOpacity=baseOpacity;
    return new THREE.Mesh(geometry,material);
  };
  const makeLabel=(text,color,size=26)=>{
    const cv=document.createElement('canvas'),ctx=cv.getContext('2d');cv.width=512;cv.height=128;
    ctx.clearRect(0,0,512,128);ctx.font='800 '+size+'px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const label=text.slice(0,34);ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle='rgba(7,12,16,.96)';ctx.strokeText(label,256,64,490);ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=14;ctx.shadowOffsetY=2;ctx.fillStyle='#f5f7fa';ctx.fillText(label,256,64,490);
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:false}));spr.scale.set(2.5,.62,1);spr.renderOrder=20;return spr;
  };
  // Shared by the anastomosis builder and the relay animator below init().
  let junctionPaths=[];
  function init(){
    try{
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(pixelRatio());renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Scène 3D BALabs');
      scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xb9c9c2,.0068);worldGroup=new THREE.Group();scene.add(worldGroup);worldGroup.visible=false;
      camera=new THREE.PerspectiveCamera(48,1,.1,100);raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
      scene.add(new THREE.AmbientLight(0xe3ece5,1.42));
      const key=new THREE.PointLight(0x91bfe0,34,32);key.position.set(0,5,6);scene.add(key);
      const fill=new THREE.PointLight(0x9acdb5,26,28);fill.position.set(-6,-2,-4);scene.add(fill);
      const warm=new THREE.PointLight(0xe3aa7d,15,20);warm.position.set(5,-3,4);scene.add(warm);
      // No starfield, orbital rings or central planet: open directly on an irregular biological network.
      const pos={bio:[-1.1,2.35,.35],myco:[-2.65,1.05,.9],soil:[-.35,.85,-.85],lab:[-2.25,-.45,-.25],products:[1.15,.15,.85],iot:[2.75,1.35,-.35],work:[1.9,-1.35,-.7],learn:[-.15,-2.35,.3]};
      for(const id of ids){
        const color=colors[id],p=new THREE.Vector3(...pos[id]).multiplyScalar(.98);
        // Neural soma: a compact, softly glowing junction, not a planet with an orbit.
        // Faceted, asymmetrical cell body: deliberately not a polished planet.
        const cellProfiles={
          bio:{scale:[1.08,.88,.94],freq:[8.5,7.2,3.1],base:.91,lobe:.11,groove:.17,micro:.025,power:5},
          myco:{scale:[.94,.84,1.14],freq:[10.2,6.1,4.4],base:.90,lobe:.15,groove:.13,micro:.038,power:4},
          soil:{scale:[.82,1.16,.91],freq:[6.4,9.1,5.2],base:.92,lobe:.13,groove:.19,micro:.031,power:3},
          lab:{scale:[1.16,.78,.88],freq:[7.1,5.8,8.6],base:.94,lobe:.08,groove:.12,micro:.018,power:6},
          products:{scale:[1.14,.91,.84],freq:[9.7,8.3,6.2],base:.90,lobe:.17,groove:.11,micro:.034,power:4},
          iot:{scale:[.91,.92,1.13],freq:[12.1,7.4,5.7],base:.93,lobe:.07,groove:.20,micro:.016,power:7},
          work:{scale:[1.19,.79,.91],freq:[6.8,10.4,4.1],base:.91,lobe:.12,groove:.15,micro:.027,power:5},
          learn:{scale:[.86,1.13,.88],freq:[8.1,11.2,7.3],base:.92,lobe:.14,groove:.16,micro:.032,power:4}
        };
        const profile=cellProfiles[id],phase=ids.indexOf(id);
        const geo=new THREE.IcosahedronGeometry(.138,3),attr=geo.attributes.position;
        // Each domain has its own membrane proportions and surface rhythm:
        // elongated hyphal, descending rhizosphere, flattened culture, angular
        // instrument, connected specimen, project chain, or branching knowledge.
        for(let v=0;v<attr.count;v++){
          const x=attr.getX(v),y=attr.getY(v),z=attr.getZ(v);
          const n=new THREE.Vector3(x,y,z).normalize();
          const lobes=Math.sin(n.x*profile.freq[0]+n.z*profile.freq[2]+phase*.7)*Math.cos(n.y*profile.freq[1]-n.x*2.4);
          const grooves=Math.pow(Math.max(0,Math.sin(n.x*5.1+n.y*4.7+n.z*6.3+phase)),profile.power);
          // A low-amplitude, domain-specific microfold breaks the repeated
          // icosphere rhythm without making the membrane spiky or noisy.
          const microFold=Math.sin(n.x*13.7+n.z*8.9+phase*1.31)*Math.cos(n.y*11.3-n.x*4.1+phase*.63);
          const polarBias=(n.x*.42-n.y*.27+n.z*.19)*profile.micro;
          const wave=profile.base+profile.lobe*lobes-profile.groove*grooves+profile.micro*microFold+polarBias;
          attr.setXYZ(v,x*wave*profile.scale[0],y*wave*profile.scale[1],z*wave*profile.scale[2]);
        }
        geo.computeVertexNormals();
        const mat=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.09),emissiveIntensity:.14,metalness:0,roughness:.88,flatShading:false});
        const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(p);mesh.userData={kind:'sphere',id,membranePhase:phase,membraneAmplitude:profile.micro};mesh.scale.set(.98,.72,.82);worldGroup.add(mesh);
        // Polarized neuronal morphology: one unmistakable axon plus an
        // asymmetric dendritic crown. Avoid the radial "sea urchin" silhouette.
        const twigs=[];
        const polarity=p.clone().normalize();
        const axonDir=polarity.clone().add(new THREE.Vector3(Math.sin(ids.indexOf(id)*1.7)*.22,Math.cos(ids.indexOf(id)*1.1)*.16,Math.sin(ids.indexOf(id)*.83)*.2)).normalize();
        const axonStart=p.clone().addScaledVector(axonDir,.055);
        const axonEnd=p.clone().addScaledVector(axonDir,1.94051+((ids.indexOf(id)%3)*.213785));
        const axonSide=new THREE.Vector3().crossVectors(axonDir,new THREE.Vector3(.31,.87,.43)).normalize();
        const axonMid=axonStart.clone().lerp(axonEnd,.52).addScaledVector(axonSide,.10);
        const axonCurve=new THREE.QuadraticBezierCurve3(axonStart,axonMid,axonEnd);
        const axon=makeNeurite(axonCurve,color,.052,1,34);
        axon.userData={kind:'dendrite',id,process:'axon'};worldGroup.add(axon);twigs.push(axon);
        // Terminal axon collaterals branch only near the far end.
        for(let b=0;b<2;b++){
          const u=.76+b*.12,anchor=axonCurve.getPoint(u),tangent=axonCurve.getTangent(u);
          const side=new THREE.Vector3().crossVectors(tangent,axonSide).normalize().multiplyScalar(b===0?1:-1);
          const tip=anchor.clone().addScaledVector(side,.234).addScaledVector(tangent,.13);
          const collateral=new THREE.QuadraticBezierCurve3(anchor,anchor.clone().addScaledVector(side,.10),tip);
          const branchMesh=makeNeurite(collateral,color,.013,.78,14);
          branchMesh.userData={kind:'dendrite',id,process:'axon-collateral'};worldGroup.add(branchMesh);twigs.push(branchMesh);
        }
        // Dendrites emerge mainly from the side facing back toward the network,
        // with varied lengths and two-level bifurcation rather than a symmetric halo.
        const dendriteDirs=[
          polarity.clone().negate().addScaledVector(axonSide,.78).add(new THREE.Vector3(.04,.12,-.08)).normalize(),
          polarity.clone().negate().addScaledVector(axonSide,-.66).add(new THREE.Vector3(-.12,.03,.11)).normalize(),
          axonSide.clone().addScaledVector(polarity,-.28).normalize(),
          axonSide.clone().negate().addScaledVector(polarity,-.18).normalize()
        ];
        for(let k=0;k<dendriteDirs.length;k++){
          const dir=dendriteDirs[k];
          const start=p.clone().addScaledVector(dir,.055);
          const length=[.598,.793,.494,.676][k]+((ids.indexOf(id)+k)%3)*.045;
          const end=p.clone().addScaledVector(dir,length);
          const side=new THREE.Vector3().crossVectors(dir,polarity).normalize();
          const mid=start.clone().lerp(end,.46).addScaledVector(side,(k%2?-.11:.12));
          const curve=new THREE.QuadraticBezierCurve3(start,mid,end);
          const dendrite=makeNeurite(curve,color,.047,.98,22);
          dendrite.userData={kind:'dendrite',id,process:'dendrite'};worldGroup.add(dendrite);twigs.push(dendrite);
          for(let forkIndex=0;forkIndex<2;forkIndex++){
            const u=forkIndex===0?.58:.78,junction=curve.getPoint(u),tangent=curve.getTangent(u);
            const sign=forkIndex===0?1:-1;
            const forkSide=side.clone().multiplyScalar(sign*(k%2?-1:1));
            const tip=junction.clone().addScaledVector(forkSide,.221+((k+forkIndex)%2)*.0585).addScaledVector(tangent,.09);
            const forkCurve=new THREE.QuadraticBezierCurve3(junction,junction.clone().addScaledVector(forkSide,.09).addScaledVector(tangent,.035),tip);
            const fork=makeNeurite(forkCurve,color,.0182,.84,15);
            fork.userData={kind:'dendrite',id,process:'dendritic-branch'};worldGroup.add(fork);twigs.push(fork);
            if(forkIndex===0){
              const terminal=tip.clone().addScaledVector(forkSide,.075).addScaledVector(tangent,.04);
              const fineCurve=new THREE.QuadraticBezierCurve3(tip,tip.clone().addScaledVector(forkSide,.04),terminal);
              const fine=makeNeurite(fineCurve,color,.007,.66,10);
              fine.userData={kind:'dendrite',id,process:'terminal-dendrite'};worldGroup.add(fine);twigs.push(fine);
            }
          }
        }

        // Domain-specific tissue silhouettes: each discipline grows according to its own visual grammar.
        const addProcess=(points3D,radius,opacity=.88)=>{
          const curve=new THREE.CatmullRomCurve3(points3D);
          const tube=makeNeurite(curve,color,radius,opacity,Math.max(16,points3D.length*7));
          tube.userData={kind:'dendrite',id,process:'domain-morphology'};
          worldGroup.add(tube);twigs.push(tube);return tube;
        };
        const addTerminal=(v,r=.027)=>{
          const tip=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color).multiplyScalar(.14),emissiveIntensity:.2,roughness:1}));
          tip.position.copy(v);tip.userData={kind:'synapse',id,process:'domain-terminal'};worldGroup.add(tip);twigs.push(tip);
        };
        if(id==='myco'){
          // Mycelium: repeated bifurcation, anastomosis loops and fine hyphal tips.
          for(let branch=0;branch<7;branch++){
            const a=branch*Math.PI*2/7,dir=new THREE.Vector3(Math.cos(a),Math.sin(a)*.72,Math.sin(a*1.7)*.55);
            const p1=p.clone().addScaledVector(dir,.55),p2=p.clone().addScaledVector(dir.clone().add(new THREE.Vector3(Math.sin(a*2)*.3,.22*Math.cos(a),.1)).normalize(),1.02);
            addProcess([p.clone(),p.clone().addScaledVector(dir,.24),p1,p2],.022,.9);
            const side=new THREE.Vector3(-dir.y,dir.x,.18).normalize();
            const tipA=p1.clone().addScaledVector(side,.28),tipB=p1.clone().addScaledVector(side,-.25);
            addProcess([p1,p1.clone().addScaledVector(side,.12),tipA],.010,.78);
            addProcess([p1,p1.clone().addScaledVector(side,-.1),tipB],.009,.76);
            addTerminal(p2,.022);
          }
          for(let j=0;j<3;j++){
            const a=j*2.094+.35, b=a+1.35;
            const u=p.clone().add(new THREE.Vector3(Math.cos(a)*.64,Math.sin(a)*.5,.18));
            const v=p.clone().add(new THREE.Vector3(Math.cos(b)*.64,Math.sin(b)*.5,-.12));
            const mid=u.clone().lerp(v,.5).add(new THREE.Vector3(0,.18,.12));
            addProcess([u,mid,v],.008,.55);
          }
        }else if(id==='soil'){
          // Rhizosphere: a descending taproot with lateral roots and fine root hairs.
          const down=new THREE.Vector3(.18,-1,.08).normalize();
          const rootEnd=p.clone().addScaledVector(down,1.25);
          addProcess([p,p.clone().addScaledVector(down,.35),rootEnd],.036,.95);
          for(let branch=0;branch<6;branch++){
            const t=.22+branch*.115,anchor=p.clone().lerp(rootEnd,t);
            const side=new THREE.Vector3(Math.cos(branch*2.4),.12,Math.sin(branch*2.4)).normalize();
            const tip=anchor.clone().addScaledVector(side,.55+(branch%3)*.12).addScaledVector(down,.12);
            addProcess([anchor,anchor.clone().addScaledVector(side,.25).addScaledVector(down,.05),tip],.018,.86);
            for(let fine=0;fine<2;fine++){
              const start=anchor.clone().lerp(tip,.58+fine*.18),fTip=start.clone().addScaledVector(new THREE.Vector3(-side.z,.08,side.x).normalize(),.22);
              addProcess([start,fTip],.007,.62);
            }
            addTerminal(tip,.02);
          }
        }else if(id==='iot'){
          // Instrumentation: branching signal traces with clear junctions and short terminal contacts.
          for(let branch=0;branch<5;branch++){
            const y=(branch-2)*.19;
            const a=p.clone().add(new THREE.Vector3(-.52,y,-.18)),b=p.clone().add(new THREE.Vector3(.62,y+.08,.18));
            const mid1=a.clone().add(new THREE.Vector3(.22,0,0)),mid2=b.clone().add(new THREE.Vector3(-.2,0,0));
            addProcess([a,mid1,mid1.clone().add(new THREE.Vector3(0,.08,.04)),mid2,b],.014,.92);
            const junction=mid1.clone().add(new THREE.Vector3(.04,.08,.04));
            addTerminal(junction,.032);
            const branchEnd=junction.clone().add(new THREE.Vector3(.02,branch%2?.3:-.3,.06));
            addProcess([junction,junction.clone().add(new THREE.Vector3(.02,.14,0)),branchEnd],.009,.78);
          }
        }else if(id==='lab'){
          // Culture/lab: a vessel-like outline with a narrow neck and a growth medium base.
          const left=[p.clone().add(new THREE.Vector3(-.42,.46,0)),p.clone().add(new THREE.Vector3(-.34,.12,0)),p.clone().add(new THREE.Vector3(-.48,-.35,0)),p.clone().add(new THREE.Vector3(-.3,-.55,0))];
          const right=left.map(v=>new THREE.Vector3(2*p.x-v.x,v.y,v.z+.02));
          addProcess(left,.019,.84);addProcess(right,.019,.84);
          addProcess([p.clone().add(new THREE.Vector3(-.42,.46,0)),p.clone().add(new THREE.Vector3(-.2,.5,0)),p.clone().add(new THREE.Vector3(.2,.5,0)),p.clone().add(new THREE.Vector3(.42,.46,0))],.016,.82);
          addProcess([p.clone().add(new THREE.Vector3(-.3,-.55,0)),p.clone().add(new THREE.Vector3(0,-.62,.02)),p.clone().add(new THREE.Vector3(.3,-.55,0))],.018,.88);
          for(let k=0;k<4;k++){const q=p.clone().add(new THREE.Vector3(-.2+k*.13,-.38,.035));addTerminal(q,.018)}
        }else if(id==='products'){
          // Product cultures: several connected specimen/vessel outlines rather than a spherical cluster.
          for(let vessel=0;vessel<3;vessel++){
            const x=(vessel-1)*.34,top=p.clone().add(new THREE.Vector3(x,.48,0)),neck=p.clone().add(new THREE.Vector3(x,.28,.02)),base=p.clone().add(new THREE.Vector3(x,-.42,.02));
            addProcess([top,top.clone().add(new THREE.Vector3(-.11,-.04,0)),neck,base.clone().add(new THREE.Vector3(-.14,.08,0)),base.clone().add(new THREE.Vector3(.14,.08,0)),neck.clone().add(new THREE.Vector3(.11,-.04,0)),top],.014,.82);
            addProcess([base.clone().add(new THREE.Vector3(-.12,.19,.02)),base.clone().add(new THREE.Vector3(0,.16,.02)),base.clone().add(new THREE.Vector3(.12,.19,.02))],.009,.72);
          }
        }else if(id==='bio'){
          // Applied biology: a membrane-like cell with uneven protrusions and internal bridges.
          for(let k=0;k<5;k++){
            const a=k*1.19+.2,dir=new THREE.Vector3(Math.cos(a),Math.sin(a)*.82,Math.sin(a*1.6)*.24);
            const tip=p.clone().addScaledVector(dir,.92+(k%2)*.16),shoulder=p.clone().addScaledVector(dir,.48);
            addProcess([p.clone().addScaledVector(dir,.12),shoulder,tip],.018,.86);
            const side=new THREE.Vector3(-dir.y,dir.x,.12).normalize();
            addProcess([shoulder,shoulder.clone().addScaledVector(side,.18),shoulder.clone().addScaledVector(side,.34).addScaledVector(dir,.08)],.009,.7);
            addTerminal(tip,.024);
          }
          for(let k=0;k<3;k++){
            const a=k*2.094,from=p.clone().add(new THREE.Vector3(Math.cos(a)*.35,Math.sin(a)*.3,.08)),to=p.clone().add(new THREE.Vector3(Math.cos(a+1.2)*.48,Math.sin(a+1.2)*.38,-.06));
            addProcess([from,from.clone().lerp(to,.5).add(new THREE.Vector3(0,.13,.08)),to],.008,.56);
          }
        }else if(id==='work'){
          // Applied projects: a branching process chain with visible checkpoints.
          const stations=[-.72,-.24,.24,.72].map((x,k)=>p.clone().add(new THREE.Vector3(x,Math.sin(k*1.1)*.12,.02)));
          for(let k=0;k<stations.length-1;k++){
            const mid=stations[k].clone().lerp(stations[k+1],.5).add(new THREE.Vector3(0,.13,.08));
            addProcess([stations[k],mid,stations[k+1]],.022,.9);
            addTerminal(stations[k],.032);
          }
          addTerminal(stations[3],.04);
          for(let k=0;k<3;k++){
            const anchor=stations[k+1],up=anchor.clone().add(new THREE.Vector3(0,.36,.04)),down=anchor.clone().add(new THREE.Vector3(0,-.32,.04));
            addProcess([anchor,anchor.clone().add(new THREE.Vector3(.02,.16,.06)),up],.011,.78);
            addProcess([anchor,anchor.clone().add(new THREE.Vector3(-.02,-.14,.06)),down],.009,.66);
          }
        }else if(id==='learn'){
          // Knowledge growth: a trunk that bifurcates into increasingly fine branches.
          const trunk=p.clone().add(new THREE.Vector3(0,-.72,0)),crown=p.clone().add(new THREE.Vector3(0,.72,.02));
          addProcess([trunk,p.clone().add(new THREE.Vector3(-.06,-.22,.03)),p.clone().add(new THREE.Vector3(.04,.22,.02)),crown],.027,.92);
          for(let k=0;k<4;k++){
            const y=-.36+k*.22,anchor=p.clone().add(new THREE.Vector3((k%2?-.03:.03),y,.02));
            for(const sign of [-1,1]){
              const end=anchor.clone().add(new THREE.Vector3(sign*(.38+k*.055),.25,.04));
              const fork=anchor.clone().add(new THREE.Vector3(sign*.18,.12,.06));
              addProcess([anchor,fork,end],.014-k*.001,.82);
              const twig=end.clone().add(new THREE.Vector3(sign*.14,.12,.01));
              addProcess([fork, fork.clone().add(new THREE.Vector3(sign*.1,.08,.02)),twig],.007,.64);
              addTerminal(end,.018);
            }
          }
        }
        const hitMesh=new THREE.Mesh(new THREE.SphereGeometry(.34,16,14),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.0001,depthWrite:false}));hitMesh.position.copy(p);hitMesh.userData={kind:'sphere',id};worldGroup.add(hitMesh);

        const label=makeLabel(labels[id].title,0xf5f7fa,25);label.position.set(p.x,p.y-.676,p.z+.104);label.scale.set(Math.min(3.45,Math.max(1.8,labels[id].title.length*.105)),.52,1);label.userData={kind:'label',id,labelText:labels[id].title};worldGroup.add(label);
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
          const line=makeNeurite(path,color,.066,1,64);line.userData={kind:'edge',id};worldGroup.add(line);
          const pulse=new THREE.Mesh(new THREE.IcosahedronGeometry(.047,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));
          pulse.userData={kind:'signal',id};worldGroup.add(pulse);
          const pulse2=new THREE.Mesh(new THREE.SphereGeometry(.03,12,10),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));pulse2.userData={kind:'signal',id};worldGroup.add(pulse2);
          edges.push({line,id,parentId:parentNode.id,a:origin,b:p.clone(),pulse,pulse2,phase:ids.indexOf(id)*.13,curve:path});
          // Side branches break the impression of straight spokes and form dendritic junctions.
          for(let branch=0;branch<5;branch++){
            const seed=ids.indexOf(id)*2.17+branch*1.91;
            const t=[.17,.34,.51,.68,.84][branch],anchor=path.getPoint(t),tangent=path.getTangent(t);
            const side=new THREE.Vector3(-tangent.y+Math.sin(seed)*.28,tangent.x+Math.cos(seed*.7)*.22,Math.sin(seed+1.3)*.8).normalize();
            const reach=.27+((ids.indexOf(id)+branch*3)%4)*.065;
            const end=anchor.clone().addScaledVector(side,reach).addScaledVector(tangent,.09+Math.sin(seed)*.055);
            const control=anchor.clone().addScaledVector(side,reach*(.38+((branch+1)%3)*.12)).addScaledVector(tangent,.035*Math.cos(seed));
            const branchCurve=new THREE.QuadraticBezierCurve3(anchor,control,end);
            const branchLine=makeNeurite(branchCurve,color,.017+((branch+ids.indexOf(id))%3)*.0025,.86,20);
            branchLine.userData={kind:'dendrite',id};worldGroup.add(branchLine);
            // Fine secondary offshoots make the axon read as branching tissue, not plumbing.
            {
              const u=.56, junction=branchCurve.getPoint(u), tangent2=branchCurve.getTangent(u);
              const sign=branch===0?1:-1;
              const twigSide=new THREE.Vector3(-tangent2.y*sign+Math.cos(seed)*.25,tangent2.x*sign+Math.sin(seed*.8)*.22,Math.cos(seed+2)*.75).normalize();
              const tip=junction.clone().addScaledVector(twigSide,.13+((ids.indexOf(id)+branch)%3)*.035).addScaledVector(tangent2,.055);
              const twigCurve=new THREE.QuadraticBezierCurve3(junction,junction.clone().addScaledVector(twigSide,.06).addScaledVector(tangent2,.025),tip);
              const twig=makeNeurite(twigCurve,color,.0105,.72,14);
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
        ['bio','soil'],['bio','lab'],['soil','lab'],
        ['lab','products'],['lab','work'],['soil','work'],['bio','learn'],
        ['iot','learn'],['myco','products'],['soil','iot'],['soil','learn'],
        ['lab','iot'],['products','learn'],['work','learn'],
        ['bio','iot'],['myco','work'],
        // Additional cross-domain loops only. Parent-child axons already cover
        // bio→myco, myco→soil, myco→lab and products→work; repeating them here
        // creates doubled lines that look like accidental overdraw, not richer links.
        ['bio','products'],['iot','work'],
        // Culture monitoring connects mycology to instrumentation; project execution
        // links biological experimentation back to the operational workflow.
        ['myco','iot'],['bio','work'],
        // Close the knowledge loop: protocols, cultivation practice and instrumented products feed learning back into R&D.
        ['myco','learn'],['lab','learn'],['products','iot'],['soil','products']
      ];
      const mycelialTips=[];
      junctionPaths.length=0;
      for(const [a,b] of pairs){const pa=points.find(p=>p.id===a),pb=points.find(p=>p.id===b);if(!pa||!pb)continue;
        const delta=pb.base.clone().sub(pa.base);
        const axis=new THREE.Vector3().crossVectors(delta,new THREE.Vector3(.31,.87,.43)).normalize();
        const bend=.20+((ids.indexOf(a)+ids.indexOf(b))%3)*.075;
        const mid=pa.base.clone().lerp(pb.base,.5).addScaledVector(axis,bend);
        const curve=new THREE.QuadraticBezierCurve3(pa.base,mid,pb.base);
        const signalColor=new THREE.Color(colors[a]).lerp(new THREE.Color(colors[b]),.5);
        const line=makeNeurite(curve,signalColor,.052,1,72);
        // Keep transverse pathways legible without letting them overpower the biological branches.
        line.material.emissive.copy(signalColor).multiplyScalar(.40);line.material.emissiveIntensity=.48;
        line.userData={kind:'relation',a,b};worldGroup.add(line);
        // Cross-links branch like mycelial cords / axonal collaterals instead of
        // appearing as plain geometric chords. Each offshoot ends in a small junction.
        for(let branch=0;branch<5;branch++){
          const seed=(ids.indexOf(a)+1)*1.73+(ids.indexOf(b)+1)*.91+branch*2.4;
          const t=[0.18,0.34,0.51,0.68,0.84][branch];
          const anchor=curve.getPoint(t),tangent=curve.getTangent(t);
          const side=new THREE.Vector3(-tangent.y+Math.sin(seed)*.35,tangent.x+Math.cos(seed*.8)*.28,Math.sin(seed+1.1)*.85).normalize();
          const reach=.24+((ids.indexOf(a)+ids.indexOf(b)+branch)%4)*.065;
          const tip=anchor.clone().addScaledVector(side,reach).addScaledVector(tangent,(branch===0?1:-1)*.075);
          const control=anchor.clone().addScaledVector(side,reach*.55).addScaledVector(tangent,.035*Math.sin(seed));
          const offshoot=new THREE.QuadraticBezierCurve3(anchor,control,tip);
          mycelialTips.push({point:tip.clone(),tangent:offshoot.getTangent(1).normalize(),curve:offshoot,parentCurve:curve,anchorT:t,a,b,branch});
          const twig=makeNeurite(offshoot,signalColor,.021,.94,26);
          twig.material.emissive.copy(signalColor).multiplyScalar(.24);twig.material.emissiveIntensity=.34;
          twig.userData={kind:'dendrite',id:a,relation:true,a,b};worldGroup.add(twig);
          // Fine secondary hypha: each collateral gives rise to another
          // independent branch, so the network reads as tissue, not a comb.
          const secondaryU=.58,secondaryAnchor=offshoot.getPoint(secondaryU),secondaryTangent=offshoot.getTangent(secondaryU);
          const secondarySide=new THREE.Vector3(-secondaryTangent.y+Math.cos(seed*1.4)*.42,secondaryTangent.x+Math.sin(seed*.9)*.34,Math.cos(seed+2.7)*.92).normalize();
          const secondaryTip=secondaryAnchor.clone().addScaledVector(secondarySide,.17+((branch+ids.indexOf(a))%3)*.045).addScaledVector(secondaryTangent,.045);
          const secondaryControl=secondaryAnchor.clone().addScaledVector(secondarySide,.095).addScaledVector(secondaryTangent,.025);
          const secondaryCurve=new THREE.QuadraticBezierCurve3(secondaryAnchor,secondaryControl,secondaryTip);
          const secondaryTwig=makeNeurite(secondaryCurve,signalColor,.0125,.84,18);
          secondaryTwig.material.emissive.copy(signalColor).multiplyScalar(.2);secondaryTwig.material.emissiveIntensity=.26;
          secondaryTwig.userData={kind:'dendrite',id:a,relation:true,a,b};worldGroup.add(secondaryTwig);
          mycelialTips.push({point:secondaryTip.clone(),tangent:secondaryCurve.getTangent(1).normalize(),a,b,branch:branch+10});
          const secondaryJunction=new THREE.Mesh(new THREE.IcosahedronGeometry(.014,1),new THREE.MeshStandardMaterial({color:signalColor,emissive:signalColor,emissiveIntensity:.18,roughness:1}));
          secondaryJunction.position.copy(secondaryTip);secondaryJunction.userData={kind:'synapse',id:a,relation:true,a,b};worldGroup.add(secondaryJunction);
          if(branch===0||branch===3){
            const junction=new THREE.Mesh(new THREE.IcosahedronGeometry(.021,1),new THREE.MeshStandardMaterial({color:signalColor,emissive:signalColor,emissiveIntensity:.22,roughness:1}));
            junction.position.copy(tip);junction.userData={kind:'synapse',id:a,relation:true,a,b};worldGroup.add(junction);
          }
        }
        const pulse=new THREE.Mesh(new THREE.SphereGeometry(.052,16,14),new THREE.MeshBasicMaterial({color:signalColor,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));pulse.userData={kind:'relation-signal',a,b};worldGroup.add(pulse);
        const pulse2=new THREE.Mesh(new THREE.SphereGeometry(.027,12,10),new THREE.MeshBasicMaterial({color:signalColor,transparent:true,opacity:.86,depthWrite:false,toneMapped:false}));pulse2.userData={kind:'relation-signal',a,b,trail:true};worldGroup.add(pulse2);
        edges.push({line,id:a,relation:true,aId:a,bId:b,a:pa.base.clone(),b:pb.base.clone(),pulse,pulse2,curve,phase:(ids.indexOf(a)+ids.indexOf(b))*.071})}
      // Turn nearby collateral tips from separate cross-links into shared
      // anastomoses. This is the key visual difference between a set of chords
      // and a continuous mycelial/neural mesh.
      const joinedTips=new Set(),usedTipIndices=new Set();
      let joinCount=0;
      for(let i=0;i<mycelialTips.length;i++){
        if(usedTipIndices.has(i))continue;
        const first=mycelialTips[i];
        let best=-1,bestDistance=1.18;
        for(let j=i+1;j<mycelialTips.length;j++){
          if(usedTipIndices.has(j))continue;
          const second=mycelialTips[j];
          if(first.branch>=10||second.branch>=10)continue;
          if(first.a===second.a&&first.b===second.b)continue;
          const key=[first.a,first.b,second.a,second.b].join(':');
          if(joinedTips.has(key))continue;
          const distance=first.point.distanceTo(second.point);
          if(distance<bestDistance){bestDistance=distance;best=j}
        }
        if(best<0)continue;
        const second=mycelialTips[best];
        usedTipIndices.add(i);usedTipIndices.add(best);
        const key=[first.a,first.b,second.a,second.b].join(':');
        joinedTips.add(key);
        const span=first.point.distanceTo(second.point);
        const joinReach=Math.min(.42,Math.max(.12,span*.34));
        // Tangent-aligned handles let each new bridge leave and enter its parent
        // branch smoothly, like a real hyphal anastomosis rather than a sharp chord.
        const handleA=first.point.clone().addScaledVector(first.tangent,joinReach);
        const handleB=second.point.clone().addScaledVector(second.tangent,-joinReach);
        const anastomosis=new THREE.CubicBezierCurve3(first.point,handleA,handleB,second.point);
        // Build a continuous route: domain A → collateral → anastomosis → collateral → domain B.
        const firstAnchor=first.parentCurve.getPoint(first.anchorT);
        const firstControl=first.parentCurve.v0.clone().lerp(first.parentCurve.v1,first.anchorT);
        const firstStem=new THREE.QuadraticBezierCurve3(first.parentCurve.v0.clone(),firstControl,firstAnchor);
        const secondAnchor=second.parentCurve.getPoint(second.anchorT);
        const secondControl=second.parentCurve.v1.clone().lerp(second.parentCurve.v2,second.anchorT);
        const secondStem=new THREE.QuadraticBezierCurve3(secondAnchor,secondControl,second.parentCurve.v2.clone());
        const pathSegments=[
          {edge:{curve:firstStem,relation:false,id:first.a,parentId:first.a},reverse:false},
          {edge:{curve:first.curve,relation:false,id:first.a,parentId:first.a},reverse:false},
          {edge:{curve:anastomosis,relation:true,aId:first.a,bId:second.b},reverse:false},
          {edge:{curve:second.curve,relation:false,id:second.b,parentId:second.b},reverse:true},
          {edge:{curve:secondStem,relation:false,id:second.b,parentId:second.b},reverse:false}
        ];
        pathSegments.forEach(segment=>segment.length=segment.edge.curve.getLength());
        // Split the anastomosis at its midpoint. Two daughter flows leave the
        // junction simultaneously, one toward each parent domain.
        const c0=anastomosis.v0,c1=anastomosis.v1,c2=anastomosis.v2,c3=anastomosis.v3;
        const c01=c0.clone().lerp(c1,.5),c12=c1.clone().lerp(c2,.5),c23=c2.clone().lerp(c3,.5);
        const c012=c01.clone().lerp(c12,.5),c123=c12.clone().lerp(c23,.5),mid=c012.clone().lerp(c123,.5);
        const leftHalf=new THREE.CubicBezierCurve3(c0.clone(),c01,c012,mid);
        const rightHalf=new THREE.CubicBezierCurve3(mid,c123,c23,c3.clone());
        const forkA=[
          {edge:{curve:leftHalf,relation:true,aId:first.a,bId:second.b},reverse:true},
          {edge:{curve:first.curve,relation:false,id:first.a,parentId:first.a},reverse:true},
          {edge:{curve:firstStem,relation:false,id:first.a,parentId:first.a},reverse:true}
        ];
        const forkB=[
          {edge:{curve:rightHalf,relation:true,aId:first.a,bId:second.b},reverse:false},
          {edge:{curve:second.curve,relation:false,id:second.b,parentId:second.b},reverse:true},
          {edge:{curve:secondStem,relation:false,id:second.b,parentId:second.b},reverse:false}
        ];
        for(const fork of [forkA,forkB])fork.forEach(segment=>segment.length=segment.edge.curve.getLength());
        junctionPaths.push({segments:pathSegments,totalLength:pathSegments.reduce((sum,segment)=>sum+segment.length,0),forkPaths:[forkA,forkB]});
        const mix=new THREE.Color(colors[first.a]).lerp(new THREE.Color(colors[second.b]),.5);
        const connector=makeNeurite(anastomosis,mix,.019,.88,24);
        connector.material.emissive.copy(mix).multiplyScalar(.18);connector.material.emissiveIntensity=.28;
        connector.userData={kind:'dendrite',id:first.a,relation:true,a:first.a,b:second.b};
        worldGroup.add(connector);
        const junction=new THREE.Mesh(
          new THREE.IcosahedronGeometry(.024,1),
          new THREE.MeshStandardMaterial({color:mix,emissive:mix,emissiveIntensity:.24,roughness:1})
        );
        junction.position.copy(anastomosis.getPoint(.5));
        junction.userData={kind:'synapse',id:first.a,relation:true,a:first.a,b:second.b};
        worldGroup.add(junction);
        // Two counter-flowing signals make the junction read as a live exchange,
        // not a one-way decorative light running along a cable.
        const signal=new THREE.Mesh(
          new THREE.SphereGeometry(.018,10,8),
          new THREE.MeshBasicMaterial({color:mix,transparent:true,opacity:.82,depthWrite:false,toneMapped:false})
        );
        signal.userData={kind:'relation-signal',a:first.a,b:second.b};
        worldGroup.add(signal);
        const returnSignal=new THREE.Mesh(
          new THREE.SphereGeometry(.012,9,7),
          new THREE.MeshBasicMaterial({color:mix.clone().lerp(new THREE.Color(0xffffff),.28),transparent:true,opacity:.7,depthWrite:false,toneMapped:false})
        );
        returnSignal.userData={kind:'relation-signal',a:first.a,b:second.b,returnFlow:true};
        worldGroup.add(returnSignal);
        edges.push({line:connector,id:first.a,relation:true,anastomosis:true,aId:first.a,bId:second.b,a:first.point.clone(),b:second.point.clone(),pulse:signal,pulse2:returnSignal,curve:anastomosis,phase:(i+best)*.093});
        joinCount++;
        if(joinCount>=48)break;
      }
      root.classList.add('webgl-ready','universe-closed');root.classList.remove('universe-open');worldGroup.visible=true;worldGroup.scale.setScalar(.34);new MutationObserver(()=>{const closed=root.classList.contains('universe-closed');if(worldGroup){worldGroup.visible=true;worldGroup.scale.setScalar(closed?.34:1)}if(closed){clearResourceNodes();intro.style.display='flex';intro.style.opacity='1';intro.style.transform='';intro.disabled=false;intro.classList.remove('is-opening')}}).observe(root,{attributes:true,attributeFilter:['class']});
      const textObserver=new MutationObserver(()=>refreshLabels());sphereEls.forEach(el=>{const b=el.querySelector('b');if(b)textObserver.observe(b,{childList:true,characterData:true,subtree:true})});
      tissuePickables=points.flatMap(p=>p.twigs);resize();bind();animate();
      document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0}else if(renderer&&!raf){animate()}});
      const stageObserver=new IntersectionObserver(entries=>{const visible=entries.some(entry=>entry.isIntersecting);stageVisibility.visible=visible;if(!visible&&raf){cancelAnimationFrame(raf);raf=0}else if(visible&&!document.hidden&&renderer&&!raf){animate()}},{rootMargin:'120px 0px',threshold:0.01});stageObserver.observe(stage);
      if('ResizeObserver'in window){const stageResizeObserver=new ResizeObserver(()=>resize());stageResizeObserver.observe(stage)}
    }catch(e){stage.remove();show3DFailure();console.warn('BALabs WebGL unavailable; legacy sphere fallback intentionally suppressed.',e)}
  }
  function resize(){if(!renderer||!camera)return;const w=stage.clientWidth||640,h=stage.clientHeight||680;renderer.setPixelRatio(pixelRatio());renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(!selected)dist=camera.aspect<.78?12.4:camera.aspect<1.05?11:10.2;updateCamera()}
  function updateCamera(){if(!camera)return;camera.position.set(cameraTarget.x+dist*Math.sin(phi)*Math.sin(theta),cameraTarget.y+dist*Math.cos(phi),cameraTarget.z+dist*Math.sin(phi)*Math.cos(theta));camera.lookAt(cameraTarget)}
  function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function refreshFocus(id){const p=points.find(item=>item.id===id);const lang=document.documentElement.lang||'fr';const copy={fr:{index:'INDEX SPATIAL · 08 UNIVERS',home:'Choisis un univers pour explorer ses connexions.',links:'Connexions',structural:'structure',transverse:'transversales',next:'Explorer aussi'},en:{index:'SPATIAL INDEX · 08 WORLDS',home:'Choose a world to explore its connections.',links:'Connections',structural:'structural',transverse:'cross-domain',next:'Explore next'},ar:{index:'الفهرس المكاني · ٨ عوالم',home:'اختر عالماً لاستكشاف الروابط بينه وبين العوالم الأخرى.',links:'روابط',structural:'بنيوية',transverse:'عابرة للمجالات',next:'استكشف أيضاً'},pt:{index:'ÍNDICE ESPACIAL · 08 UNIVERSOS',home:'Escolha um universo para explorar as suas ligações.',links:'Ligações',structural:'estruturais',transverse:'transversais',next:'Explorar também'}}[lang]||{index:'SPATIAL INDEX · 08 WORLDS',home:'Choose a world to explore its connections.',links:'Connections',next:'Explore next'};if(!p){focusPanel.hidden=true;focusPanel.style.display='none';focusPanel.classList.remove('has-world');focusPanel.innerHTML='';return}focusPanel.hidden=false;focusPanel.style.display='flex';const related=[...new Set(edges.filter(edge=>edge.relation&&!edge.anastomosis?(edge.aId===id||edge.bId===id):( !edge.anastomosis&&(edge.id===id||edge.parentId===id))).map(edge=>edge.relation?(edge.aId===id?edge.bId:edge.aId):(edge.id===id?edge.parentId:edge.id)))];
    // Give every visible connection a concrete BA Labs meaning, not just a destination label.
    const relationNotes={
      bio:{myco:{fr:'microbiologie → mycologie',en:'microbiology → mycology',ar:'من الأحياء الدقيقة إلى علم الفطريات',pt:'microbiologia → micologia'},soil:{fr:'microbes et fertilité',en:'microbes and fertility',ar:'الميكروبات وخصوبة التربة',pt:'micróbios e fertilidade'},lab:{fr:'mesure et validation',en:'measurement and validation',ar:'القياس والتحقق',pt:'medição e validação'},learn:{fr:'transmettre les bases',en:'share the foundations',ar:'نقل الأساسيات',pt:'partilhar fundamentos'},iot:{fr:'biologie instrumentée',en:'instrumented biology',ar:'أحياء مزودة بأجهزة',pt:'biologia instrumentada'},products:{fr:'du vivant aux applications',en:'from biology to applications',ar:'من الأحياء إلى التطبيقات',pt:'da biologia às aplicações'},work:{fr:'expérimentation et exécution des projets',en:'experimentation and project execution',ar:'التجارب وتنفيذ المشاريع',pt:'experimentação e execução de projetos'}},
      myco:{soil:{fr:'substrats et transformation',en:'substrates and transformation',ar:'الركائز والتحويل',pt:'substratos e transformação'},lab:{fr:'cultures et protocoles',en:'cultures and protocols',ar:'المزارع والبروتوكولات',pt:'culturas e protocolos'},products:{fr:'cultures vers les kits',en:'cultures into kits',ar:'تحويل المزارع إلى أطقم',pt:'culturas em kits'},work:{fr:'essais et prototypes',en:'trials and prototypes',ar:'التجارب والنماذج الأولية',pt:'ensaios e protótipos'},iot:{fr:'suivi instrumental des cultures',en:'instrumented culture monitoring',ar:'المتابعة الآلية للمزارع',pt:'monitorização instrumental das culturas'},learn:{fr:'cultures documentées et savoir-faire transmis',en:'documented cultures and shared know-how',ar:'توثيق المزارع ونقل الخبرة',pt:'culturas documentadas e partilha de conhecimento'}},
      soil:{lab:{fr:'caractériser les substrats',en:'characterize substrates',ar:'توصيف الركائز',pt:'caracterizar substratos'},products:{fr:'formulations et usages',en:'formulations and uses',ar:'التركيبات والاستعمالات',pt:'formulações e utilizações'},work:{fr:'TechnoSoil et prototypes',en:'TechnoSoil and prototypes',ar:'TechnoSoil والنماذج الأولية',pt:'TechnoSoil e protótipos'},iot:{fr:'suivi des conditions',en:'condition monitoring',ar:'مراقبة الظروف',pt:'monitorização das condições'},learn:{fr:'méthodes et retours',en:'methods and findings',ar:'المنهجيات والنتائج',pt:'métodos e resultados'}},
      lab:{products:{fr:'essais vers produits',en:'testing into products',ar:'من الاختبارات إلى المنتجات',pt:'dos ensaios aos produtos'},work:{fr:'R&D et prototypage',en:'R&D and prototyping',ar:'البحث والتطوير والنمذجة',pt:'I&D e prototipagem'},learn:{fr:'protocoles à transmettre',en:'protocols to share',ar:'بروتوكولات قابلة للمشاركة',pt:'protocolos a partilhar'},iot:{fr:'mesures automatisées',en:'automated measurements',ar:'قياسات آلية',pt:'medições automatizadas'}},
      products:{iot:{fr:'capteurs et suivi',en:'sensors and tracking',ar:'المستشعرات والتتبع',pt:'sensores e monitorização'},learn:{fr:'usage et documentation',en:'use and documentation',ar:'الاستخدام والتوثيق',pt:'utilização e documentação'},work:{fr:'prototypes valorisés',en:'prototypes into practice',ar:'تطبيق النماذج الأولية',pt:'prototipagem aplicada'}},
      iot:{learn:{fr:'outils et apprentissage',en:'tools and learning',ar:'الأدوات والتعلّم',pt:'ferramentas e aprendizagem'}},
      work:{iot:{fr:'instrumentation intégrée aux flux de projet',en:'instrumentation integrated into project workflows',ar:'دمج القياس والأجهزة في سير المشاريع',pt:'instrumentação integrada aos fluxos de projeto'},learn:{fr:'documenter les projets',en:'document projects',ar:'توثيق المشاريع',pt:'documentar projetos'}}
    };
    const relationReason=(a,b)=>{const direct=relationNotes[a]?.[b]||relationNotes[b]?.[a];if(direct)return direct[lang]||direct.fr;const parentOf={myco:'bio',soil:'myco',lab:'myco',products:'soil',iot:'products',work:'products',learn:'lab'};if(parentOf[a]===b||parentOf[b]===a)return ({fr:'filiation et continuité',en:'lineage and continuity',ar:'الترابط والاستمرارية',pt:'linhagem e continuidade'}[lang]||'filiation et continuité');return ({fr:'boucle de rétroaction',en:'feedback loop',ar:'حلقة تغذية راجعة',pt:'ciclo de retroação'}[lang]||'boucle de rétroaction')};
    const structuralCount=edges.filter(edge=>!edge.relation&&!edge.anastomosis&&(edge.id===id||edge.parentId===id)).length;const transverseCount=edges.filter(edge=>edge.relation&&!edge.anastomosis&&(edge.aId===id||edge.bId===id)).length;focusPanel.classList.add('has-world');focusPanel.innerHTML='';const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';const worldLabel={fr:'UNIVERS',en:'WORLD',ar:'عالم',pt:'UNIVERSO'}[lang]||'WORLD';kicker.textContent=worldLabel+' / '+String(ids.indexOf(id)+1).padStart(2,'0');const title=document.createElement('strong');title.textContent=labels[id].title;const sub=document.createElement('small');sub.textContent=labels[id].sub;const meta=document.createElement('span');meta.className='webgl-focus-meta';meta.textContent=copy.links+' · '+related.length+' ('+structuralCount+' '+copy.structural+' / '+transverseCount+' '+copy.transverse+')';const next=document.createElement('span');next.className='webgl-focus-next';next.textContent=copy.next;const list=document.createElement('div');list.className='webgl-focus-links';related.forEach(other=>{const button=document.createElement('button');button.type='button';button.className='webgl-focus-link';button.dataset.world=other;const name=document.createElement('span');name.textContent=labels[other].title;const reason=document.createElement('small');reason.className='webgl-focus-reason';reason.textContent=relationReason(id,other);button.append(name,reason);button.title=relationReason(id,other);button.setAttribute('aria-label',(lang==='ar'?'استكشف ':lang==='pt'?'Explorar ':lang==='en'?'Explore ':'Explorer ')+labels[other].title+' — '+relationReason(id,other));list.append(button)});focusPanel.append(kicker,title,sub,meta,next,list)}
  function flyTo(target,next){const start=new THREE.Vector3(cameraTarget.x,cameraTarget.y,cameraTarget.z);const end=target?target.position.clone():new THREE.Vector3(0,0,0);const direction=end.clone().sub(start);const side=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(.31,.87,.43)).normalize();if(side.lengthSq()<.01)side.set(1,0,0);const lift=Math.min(1.15,.28+direction.length()*.075);const control=start.clone().lerp(end,.5).addScaledVector(side,lift).add(new THREE.Vector3(0,lift*.48,0));const path=new THREE.QuadraticBezierCurve3(start,control,end);transition={path,startDist:dist,endDist:target?2.65:11.8,at:performance.now(),duration:target?1280:1080,next};selected=target?.userData?.id||null;refreshFocus(selected);stage.classList.add('is-transitioning')}
  function clearResourceNodes(){if(resourceGroup){worldGroup.remove(resourceGroup);resourceGroup.traverse(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}resourceGroup=null;resourceMeshes=[];resourceSignals=[]}
  function buildResourceNodes(id){clearResourceNodes();const mini=document.getElementById('miniView');if(!mini||mini.hidden)return;const anchors=[...mini.querySelectorAll('.linknode')].filter(a=>a.href&&a.href!=='#'&&a.getAttribute('href')!=='#');if(!anchors.length)return;const parent=points.find(p=>p.id===id);if(!parent)return;resourceGroup=new THREE.Group();resourceGroup.userData.kind='resources';worldGroup.add(resourceGroup);const count=anchors.length,radius=1.45+count*.055,color=parent.color,nodes=[];const stopWords=new Set(['page','pages','rubrique','principale','thème','associe','associé','projet','application','fiches','ressources','voir','ouvrir','notion','public','complet','complete','open','main','section','theme','related','resource','resources','project','application','and','the','for','from','with','dans','pour','des','les','une','un','de','du','la','le','في','من','على','إلى','الى','عن','مع','هذا','هذه','ذلك','تلك','هو','هي','هم','كما','كان','تكون','بين','كل','بعض','ما','لا','لم','لن','و','أو','ثم','بعد','قبل','عند','ضمن','حول','عبر','الذي','التي','الذين','هناك','هنا','ال','التي','الذي','هذه','هذا','لكن','لذلك','أيضا','ايضا','قد','تم','يتم','يمكن','عندها','حيث','حتى','إذا','اذا','إن','ان','أن','كلها','جميع','بشكل','أكثر','اقل','منها','عليها','لهذا','ضمنها','أمام','امام','عليه','لدى','عبر','معها','عنها','وهي','وهو','وذلك','بهذا','هذه','تلك']);
    const terms=a=>{const title=a.querySelector('b')?.textContent||a.textContent.trim(),sub=a.querySelector('small')?.textContent||'',url=new URL(a.href,location.href),tokenize=value=>value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u064B-\u065F\u0670\u0640]/g,'').split(/[^\p{L}\p{N}]+/u).filter(w=>(w.length>3||(/[\p{Script=Arabic}]/u.test(w)&&w.length>1))&&!stopWords.has(w));return {title,text:tokenize(title+' '+sub+' '+url.pathname),titleTokens:tokenize(title),url,titleClean:title.trim()}};
    anchors.forEach((a,i)=>{const angle=(i/count)*Math.PI*2-Math.PI/2;const p=new THREE.Vector3(parent.base.x+Math.cos(angle)*radius,parent.base.y+Math.sin(angle)*radius*.72,parent.base.z+Math.sin(angle*.8)*.48);const meta=terms(a);const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,1),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.55,metalness:.15,roughness:.3,transparent:true,depthWrite:false}));mesh.position.copy(p);mesh.userData={kind:'resource',sourceId:id,url:a.href,title:meta.titleClean};resourceGroup.add(mesh);const label=makeLabel(meta.titleClean,color,15);label.position.set(p.x,p.y-.24,p.z);label.scale.set(1.8,.32,1);label.userData={kind:'resource-label',sourceId:id,url:a.href,title:meta.titleClean};resourceGroup.add(label);resourceMeshes.push(label);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([parent.base,p]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.52}));line.userData={kind:'resource-spoke',sourceId:id,url:a.href};resourceGroup.add(line);nodes.push({mesh,p,meta});resourceMeshes.push(mesh)});
    // Match resource wording to other BA Labs workstreams, so Notion pages can bridge domains.
    const domainTerms={
      bio:['biotechnolog','microorganism','microbe','bacter','pgpr','bacillus','bioactiv','biolog','microbial','bacteria','تقنية','حيوية','أحياء','احياء','دقيقة','بكتيريا','ميكروب','بيولوجيا'],
      myco:['mycolog','mycel','champignon','pleurot','fungal','fungi','strain','souche','spore','culture','substrat','فطر','فطريات','فطري','ميسيليوم','ميسيليا','غزل','مشروم','أبواغ','ابواغ'],
      soil:['soil','sol','technosoil','terre','compost','irrigation','eau','water','humus','substrat','biochar','sable','تربة','التربة','رمل','رملي','سماد','تسميد','ري','ماء','مياه','احتفاظ','رطوبة','زراعة'],
      lab:['laboratoire','laboratory','protocol','protocole','mesure','measurement','essai','test','experiment','experimen','r&d','analyse','مختبر','المختبر','مخبر','مخبري','بروتوكول','تحليل','تجربة','تجارب','قياس','قياسات','علمي'],
      products:['produit','product','catalogue','catalog','kit','seringue','syringe','petri','commande','order','packaging','منتج','منتجات','كتالوج','طلب','طلبات','حقنة','أطباق','تغليف','عبوة','عبوات','شراء'],
      iot:['iot','capteur','sensor','arduino','esp32','automatisation','automation','instrumentation','telemetry','télémétrie','إنترنت','الاشياء','أشياء','مستشعر','مستشعرات','حساس','حساسات','أتمتة','اردوينو','بيانات','رقمي'],
      work:['projet','project','prototype','recherche','research','essai','trial','experiment','expériment','développement','development','مشروع','مشاريع','بحث','تطوير','نموذج','أولي','ابتكار','تجريبي','تجارب'],
      learn:['guide','formation','learning','apprendre','tutoriel','tutorial','documentation','ressource','resource','fiche','cours','course','تعليم','تعلّم','تعلم','تدريب','دليل','شرح','دورة','دروس','تعليمي','تعليمية','معرفة','مهارة','مهارات']
    };
    // Normalize dictionary entries exactly like resource tokens. Short words (e.g. "sol",
    // "eau", "kit") only match as complete tokens; longer stems may match inflections.
    // Match multi-word scientific concepts as adjacent tokens, not concatenated strings.
    const domainPhrases={
      bio:['applied biotechnology','biotechnologie appliquee','biotecnologia aplicada','التقنية الحيوية','تقنية حيوية','أحياء دقيقة','microbial biotechnology'],
      myco:['liquid culture','culture liquide','cultura liquida','tissue culture','culture cellulaire','mycelial growth','croissance mycelienne','نمو فطري','غزل فطري'],
      soil:['soil amendment','amelioration du sol','mejoramiento del suelo','water retention','retention eau','احتفاظ بالماء','تحسين التربة','agriculture regenerative'],
      lab:['research protocol','protocole de recherche','protocolo de pesquisa','experimental design','plan experimental','تصميم تجريبي','تحليل مخبري'],
      products:['culture kit','kit de culture','kit de cultivo','sterile syringe','seringue sterile','emballage produit','تغليف المنتجات'],
      iot:['smart sensor','capteur intelligent','sensor inteligente','remote monitoring','surveillance a distance','مراقبة عن بعد','internet of things'],
      work:['proof of concept','prototype experimental','prototipo experimental','applied research','recherche appliquee','بحث تطبيقي','نموذج اولي'],
      learn:['learning resource','ressource pedagogique','recurso educativo','training module','module de formation','وحدة تعليمية','تعلم تطبيقي']
    };
    const normalizeWords=value=>value.toLocaleLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[\\u064B-\\u065F\\u0670\\u0640]/g,'').split(/[^\\p{L}\\p{N}]+/u).filter(Boolean);
    const normalizedDomainPhrases=Object.fromEntries(ids.map(domain=>[
      domain,domainPhrases[domain].map(normalizeWords).filter(parts=>parts.length>1)
    ]));
    const allDomainPhrases=[...new Map(Object.values(normalizedDomainPhrases).flat().map(phrase=>[phrase.join(' '),phrase])).values()];
    const matchesPhrase=(words,phrase)=>{
      for(let i=0;i<=words.length-phrase.length;i++){
        let matched=true;
        for(let j=0;j<phrase.length;j++)if(words[i+j]!==phrase[j]){matched=false;break;}
        if(matched)return true;
      }
      return false;
    };
    const normalizeToken=value=>value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
    const broadDomainTerms=new Set(['culture','cultures','substrat','substrats','test','tests','product','products','produit','produits','kit','kits','catalogue','catalog','project','projects','projet','projets','guide','guides']);
    const normalizedBroadDomainTerms=new Set([...broadDomainTerms].map(normalizeToken));
    const normalizedDomainTerms=Object.fromEntries(ids.map(domain=>[
      domain,domainTerms[domain].map(normalizeToken).filter(term=>term&&!normalizedBroadDomainTerms.has(term))
    ]));
    const matchesDomainTerm=(word,term)=>word===term||(
      term.length>=5&&word.length>=term.length-1&&
      (word.startsWith(term)||term.startsWith(word))
    );
    const matchedDomains=meta=>ids.filter(other=>other!==id&&(
      normalizedDomainTerms[other].some(term=>meta.text.some(word=>matchesDomainTerm(word,term)))||
      normalizedDomainPhrases[other].some(phrase=>matchesPhrase(meta.text,phrase))
    ));
    // Rank bridges by evidence while allowing enough domain coverage to reveal cross-disciplinary links.
    // A page may connect to at most three other domains; specific multi-word stems outrank broad matches.
    for(const node of nodes){
      const ranked=matchedDomains(node.meta).map(otherId=>{
        const terms=normalizedDomainTerms[otherId];
        // Score each distinct resource token once: overlapping stems and translations must not inflate a bridge.
        const matchedTerms=[...new Set(terms.map(term=>({term,word:node.meta.text.find(word=>matchesDomainTerm(word,term))})).filter(match=>match.word).map(match=>match.word))];
        const termScore=matchedTerms.reduce((sum,word)=>{
          const exact=terms.some(term=>term===word);
          const specificity=Math.min(1.6,Math.max(.65,word.length/7));
          return sum+(exact?2.4:1.1)*specificity;
        },0);
        const matchedPhrases=normalizedDomainPhrases[otherId].filter(phrase=>matchesPhrase(node.meta.text,phrase));
        const phraseScore=matchedPhrases.length*5;
        const score=termScore+phraseScore;
        return {otherId,score,evidence:matchedTerms.length+matchedPhrases.length};
      }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||b.evidence-a.evidence||ids.indexOf(a.otherId)-ids.indexOf(b.otherId)).slice(0,3);
      for(const {otherId} of ranked){
        const target=points.find(p=>p.id===otherId);if(!target)continue;
        const delta=target.base.clone().sub(node.p),axis=new THREE.Vector3().crossVectors(delta,new THREE.Vector3(.31,.87,.43)).normalize();
        const mid=node.p.clone().lerp(target.base,.5).addScaledVector(axis,.16);
        const curve=new THREE.QuadraticBezierCurve3(node.p,mid,target.base);
        const bridge=makeNeurite(curve,target.color,.014,.56,28);
        bridge.userData={kind:'resource-domain-link',id:otherId,sourceId:id,targetId:otherId,resource:node.meta.titleClean,resourceUrl:node.meta.url.href};resourceGroup.add(bridge);
        const pulse=new THREE.Mesh(new THREE.SphereGeometry(.019,10,8),new THREE.MeshBasicMaterial({color:0xe1f4d9,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
        pulse.userData.kind='resource-signal';resourceGroup.add(pulse);
        resourceSignals.push({mesh:pulse,curve,sourceId:parent.id,targetId:otherId,resourceUrl:node.meta.url.href,offset:(nodes.indexOf(node)+ids.indexOf(otherId))*.113,speed:.105+(ids.indexOf(otherId)%3)*.018});
      }
    }
    // Score resource-to-resource links using distinctive shared terms, not generic vocabulary.
    const genericResourceTerms=new Set(['culture','cultures','projet','projets','project','projects','essai','essais','trial','trials','test','tests','guide','guides','fiche','fiches','ressource','ressources','resource','resources','produit','produits','product','products','laboratoire','laboratory','documentation','application','applications','development','developpement','recherche','research','public','notion','catalogue','catalog','تقنية','حيوية','أحياء','احياء','دقيقة','فطر','فطريات','غزل','تربة','التربة','رمل','سماد','زراعة','مختبر','مخبر','تجربة','تجارب','قياس','منتج','منتجات','طلب','طلبات','تعليم','تعلم','تدريب','دليل','شرح','دورة','دروس','مشروع','مشاريع','بحث','تطوير','بيانات','رقمي','ماء','مياه','مستشعر','حساس','أتمتة']);
    const normalizedGenericResourceTerms=new Set([...genericResourceTerms].map(normalizeToken));
    // Rare shared terms carry more semantic evidence than words repeated across many pages.
    const tokenFrequency=new Map();
    for(const node of nodes)for(const word of new Set(node.meta.text)){
      tokenFrequency.set(word,(tokenFrequency.get(word)||0)+1);
    }
    const candidates=[];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      const shared=[...new Set(a.meta.text.filter(w=>b.meta.text.includes(w)&&w.length>=4&&!normalizedGenericResourceTerms.has(normalizeToken(w))))];
      const sharedPhrases=allDomainPhrases.filter(phrase=>matchesPhrase(a.meta.text,phrase)&&matchesPhrase(b.meta.text,phrase));
      const pathA=a.meta.url.pathname.split('/').filter(Boolean).slice(0,-1).join('/');
      const pathB=b.meta.url.pathname.split('/').filter(Boolean).slice(0,-1).join('/');
      const samePath=!!pathA&&pathA===pathB&&a.meta.url.origin===b.meta.url.origin;
      const sharedTitles=[...new Set(a.meta.titleTokens.filter(word=>b.meta.titleTokens.includes(word)&&word.length>=4&&!normalizedGenericResourceTerms.has(normalizeToken(word))))];
      // Score title matches separately so the same word is never counted twice.
      const nonTitleShared=shared.filter(word=>!sharedTitles.includes(word));
      const weightedTerms=nonTitleShared.map(word=>{
        const frequency=tokenFrequency.get(word)||nodes.length;
        return {word,weight:Math.max(.5,Math.min(4,Math.log2((nodes.length+1)/(frequency+1))*1.5))};
      }).sort((x,y)=>y.weight-x.weight||x.word.localeCompare(y.word));
      // Cap lexical evidence so long URL slugs cannot overwhelm a precise phrase match.
      const lexicalTerms=weightedTerms.slice(0,6);
      const lexicalScore=lexicalTerms.reduce((sum,item)=>sum+item.weight,0);
      const titleScore=sharedTitles.map(word=>Math.max(.25,Math.min(2,Math.log2((nodes.length+1)/((tokenFrequency.get(word)||nodes.length)+1))))).sort((x,y)=>y-x).slice(0,3).reduce((sum,weight)=>sum+weight,0);
      const semanticScore=lexicalScore+titleScore+(sharedPhrases.length*5);
      // Shared folder paths may reinforce a semantic match, but never create a link alone.
      const score=semanticScore+(samePath&&semanticScore>0?2:0);
      const evidence=lexicalTerms.length+sharedPhrases.length+sharedTitles.length;
      if(score>0)candidates.push({i,j,score,evidence,sharedTerms:lexicalTerms.length,sharedTitles:sharedTitles.length,sharedPhrases:sharedPhrases.length});
    }
    candidates.sort((a,b)=>b.score-a.score||b.sharedPhrases-a.sharedPhrases||b.sharedTitles-a.sharedTitles||b.sharedTerms-a.sharedTerms||a.i-b.i||a.j-b.j);
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
      const line=makeNeurite(curve,color,.012,.66,22);
      line.userData={kind:'resource-relation',id,sourceId:id,targetId:id,a:a.mesh.userData.title,b:b.mesh.userData.title,aUrl:a.meta.url.href,bUrl:b.meta.url.href};resourceGroup.add(line);
      const pulse=new THREE.Mesh(new THREE.SphereGeometry(.028,12,10),new THREE.MeshBasicMaterial({color:0xe1f4d9,transparent:true,opacity:.98,depthWrite:false,toneMapped:false}));
      pulse.userData.kind='resource-signal';resourceGroup.add(pulse);
      resourceSignals.push({mesh:pulse,curve,sourceId:id,targetId:id,sourceUrl:a.meta.url.href,targetUrl:b.meta.url.href,offset:(i+j)*.137,speed:.12+((i+j)%3)*.018});
      resourceDegree[i]++;resourceDegree[j]++;resourceLinkCount++;
    }
  }
  function refreshLabels(){for(const p of points){const el=document.querySelector('[data-sphere="'+p.id+'"]');if(!el)continue;const next=el.querySelector('b')?.textContent||p.id;if(p.label.userData.labelText===next)continue;p.label.userData.labelText=next;const old=p.label.material.map;const replacement=makeLabel(next,0xf5f7fa,27);p.label.material.map=replacement.material.map;p.label.scale.set(Math.min(3.45,Math.max(1.8,next.length*.105)),.52,1);p.label.material.needsUpdate=true;old?.dispose();replacement.material.dispose()}}
  function bind(){
    window.addEventListener('resize',resize);
    document.getElementById('homeBtn')?.addEventListener('click',()=>{transition=null;stage.classList.remove('is-transitioning');selected=null;hovered=null;cameraTarget.set(0,0,0);dist=11.8;theta=.25;phi=1.18;rotateVX=rotateVY=0;clearResourceNodes();refreshFocus(null);updateCamera()});
    stage.addEventListener('pointerdown',e=>{if(e.target.closest('.webgl-controls,.webgl-focus')||pointers.size>=2)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture?.(e.pointerId);if(pointers.size===2){const pts=[...pointers.values()];pinchDistance=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);dragging=true;moved=true;return}dragging=true;moved=false;lastX=e.clientX;lastY=e.clientY;rotateVX=rotateVY=0});
    stage.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){const pts=[...pointers.values()],next=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);if(pinchDistance>0)dist=THREE.MathUtils.clamp(dist-(next-pinchDistance)*.035,3.2,25);pinchDistance=next;moved=true;updateCamera();return}if(!dragging){updateHover(e);return}const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(e.buttons===2||e.shiftKey){const scale=dist*.0018;cameraTarget.x-=dx*scale;cameraTarget.y+=dy*scale;rotateVX=rotateVY=0}else{rotateVX=-dx*.0044;rotateVY=dy*.0044;theta+=rotateVX;phi=THREE.MathUtils.clamp(phi+rotateVY,.35,2.78)}lastX=e.clientX;lastY=e.clientY;updateCamera()});stage.addEventListener('pointerleave',()=>{if(dragging||pointers.size)return;hovered=null;stage.dataset.hoverResource='';stage.classList.remove('resource-hover');stage.style.cursor='grab';refreshFocus(selected);for(const p of points){p.mesh.material.emissiveIntensity=.62;p.mesh.scale.setScalar(selected===p.id?1.04:1);const labelScale=Math.min(3.45,Math.max(1.8,(p.label.userData.labelText||p.id).length*.105));p.label.scale.set(labelScale,.52,1)}for(const edge of edges){const focus=selected;const connected=!!focus&&(edge.relation?(edge.aId===focus||edge.bId===focus):(edge.id===focus||edge.parentId===focus));const base=edge.relation?.72:.88;edge.line.material.opacity=focus?(connected?(edge.relation?.94:.98):.10):base;if(edge.pulse)edge.pulse.material.opacity=focus?(connected?.98:.12):.72;if(edge.pulse2)edge.pulse2.material.opacity=focus?(connected?.88:.08):.58}});
    const end=e=>{pointers.delete(e.pointerId);if(pointers.size===1&&moved){const remaining=[...pointers.values()][0];lastX=remaining.x;lastY=remaining.y;pinchDistance=0;rotateVX=rotateVY=0;dragging=true;return}if(pointers.size<2)pinchDistance=0;if(!dragging)return;dragging=false;if(!moved)pick(e)};
    stage.addEventListener('pointerup',e=>{if(pointers.has(e.pointerId))end(e)});stage.addEventListener('lostpointercapture',e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size===1&&moved){const remaining=[...pointers.values()][0];lastX=remaining.x;lastY=remaining.y;pinchDistance=0;rotateVX=rotateVY=0;dragging=true;return}if(pointers.size<2)pinchDistance=0;if(!pointers.size){dragging=false;rotateVX=rotateVY=0}});stage.addEventListener('pointercancel',()=>{pointers.clear();dragging=false;moved=true;pinchDistance=0;rotateVX=rotateVY=0;hovered=null;stage.dataset.hoverResource='';stage.classList.remove('resource-hover');stage.style.cursor='grab';refreshFocus(selected)});stage.addEventListener('contextmenu',e=>e.preventDefault());stage.addEventListener('dblclick',e=>{if(e.target.closest('.webgl-controls'))return;dist=selected?2.65:11.8;updateCamera()});controls.addEventListener('pointerdown',e=>e.stopPropagation());focusPanel.addEventListener('pointerdown',e=>e.stopPropagation());focusPanel.addEventListener('click',e=>{const b=e.target.closest('button[data-world]');if(b){if(typeof window.enterSphere==='function')window.enterSphere(b.dataset.world);return}if(root.classList.contains('universe-closed')){root.classList.remove('universe-closed');root.classList.add('universe-open');if(worldGroup)worldGroup.visible=true;resize();refreshFocus(null)}});focusPanel.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===focusPanel&&root.classList.contains('universe-closed')){e.preventDefault();root.classList.remove('universe-closed');root.classList.add('universe-open');if(worldGroup)worldGroup.visible=true;resize();refreshFocus(null)}});controls.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const action=b.dataset.camera;if(action==='in')dist=THREE.MathUtils.max(3.2,dist*.82);if(action==='out'){if(selected){flyTo(null,()=>{clearResourceNodes();hovered=null;refreshFocus(null)});return}dist=THREE.MathUtils.min(25,dist*1.22);}if(action==='reset'){selected=null;cameraTarget.set(0,0,0);dist=11.8;theta=.25;phi=1.18;clearResourceNodes();document.getElementById('homeBtn')?.click()}updateCamera()});
    stage.addEventListener('wheel',e=>{if(e.target.closest('.webgl-controls,.webgl-focus'))return;e.preventDefault();const delta=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*(stage.clientHeight||680):e.deltaY;const nextDist=THREE.MathUtils.clamp(dist+delta*.012,3.2,25);if(selected&&nextDist>dist+1.25&&nextDist>5.2){flyTo(null,()=>{clearResourceNodes();hovered=null;refreshFocus(null)});return}dist=nextDist;updateCamera()},{passive:false});
    stage.addEventListener('keydown',e=>{const key=e.key;if(key==='Escape'){document.getElementById('homeBtn')?.click();return}const navKeys=['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];if(!navKeys.includes(key))return;if(e.target!==stage&&e.target.closest('button,input,textarea,select,a,[contenteditable="true"]'))return;e.preventDefault();if(key==='+'||key==='=')dist=Math.max(3.2,dist-.7);if(key==='-')dist=Math.min(25,dist+.7);if(key==='ArrowLeft')theta-=.12;if(key==='ArrowRight')theta+=.12;if(key==='ArrowUp')phi=Math.max(.35,phi-.1);if(key==='ArrowDown')phi=Math.min(2.78,phi+.1);updateCamera()});
    updateCamera();
  }
  function hitTest(e){const r=renderer.domElement.getBoundingClientRect();mouse.x=((e.clientX-r.left)/r.width)*2-1;mouse.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(mouse,camera);return raycaster.intersectObjects([...points.map(p=>p.hitMesh),...points.map(p=>p.mesh),...points.map(p=>p.label),...tissuePickables,...resourceMeshes],false)}
  function updateHover(e){if(!renderer||!worldGroup?.visible)return;const hits=hitTest(e),obj=hits[0]?.object||null;const isResource=obj?.userData?.kind==='resource'||obj?.userData?.kind==='resource-label';const resource=isResource?obj.userData.url:null;const isWorld=obj?.userData?.kind==='sphere'||obj?.userData?.kind==='label';const next=isWorld?obj.userData.id:(isResource?obj.userData.sourceId:null);if(next===hovered&&resource===stage.dataset.hoverResource)return;hovered=next;refreshFocus(next||selected||null);const relationFocus=next||selected;const lang=document.documentElement.lang||'fr';if(relationFocus){const linkedEdges=edges.filter(edge=>!edge.anastomosis&&(edge.relation?(edge.aId===relationFocus||edge.bId===relationFocus):(edge.id===relationFocus||edge.parentId===relationFocus)));const linked=[...new Set(linkedEdges.map(edge=>edge.relation?(edge.aId===relationFocus?edge.bId:edge.aId):(edge.id===relationFocus?edge.parentId:edge.id)))];const crossCount=linkedEdges.filter(edge=>edge.relation).length;const structuralCount=linkedEdges.length-crossCount;const relationStatus={fr:'EXPLORATION · ',en:'EXPLORING · ',ar:'استكشاف · ',pt:'A EXPLORAR · '}[lang]||'EXPLORATION · ';const linkLabel={fr:'univers reliés',en:'linked worlds',ar:'عوالم مترابطة',pt:'universos ligados'}[lang]||'univers reliés';const crossLabel={fr:'transversales',en:'cross-domain',ar:'عابرة للمجالات',pt:'transversais'}[lang]||'transversales';const structuralLabel={fr:'structurelles',en:'structural',ar:'بنيوية',pt:'estruturais'}[lang]||'structurelles';const linkButtons=[...focusPanel.querySelectorAll('.webgl-focus-link[data-world]')];const linkedDescriptions=linkButtons.slice(0,2).map(button=>{const name=button.querySelector('span')?.textContent||button.textContent;const reason=button.querySelector('.webgl-focus-reason')?.textContent;return reason?name+' — '+reason:name}).join('  •  ');status.textContent=relationStatus+labels[relationFocus].title+' · '+linked.length+' '+linkLabel+' ('+crossCount+' '+crossLabel+', '+structuralCount+' '+structuralLabel+')'+(linkedDescriptions?'  ↔  '+linkedDescriptions:'')}else{const statusCopy={fr:'BALABS / RÉSEAU VIVANT',en:'BALABS / LIVING NETWORK',ar:'BALABS / شبكة حيّة',pt:'BALABS / REDE VIVA'};status.textContent=statusCopy[lang]||statusCopy.fr}stage.dataset.hoverResource=resource||'';stage.classList.toggle('resource-hover',!!resource);stage.style.cursor=(next||resource)?'pointer':'grab';for(const p of points){const active=p.id===hovered;p.mesh.material.emissiveIntensity=active?1.05:.62;p.mesh.scale.setScalar(active?1.08:(selected===p.id?1.04:1));const labelScale=Math.min(3.45,Math.max(1.8,(p.label.userData.labelText||p.id).length*.105));p.label.scale.set(labelScale*(active?1.1:1),.52*(active?1.1:1),1)}for(const edge of edges){const focus=hovered||selected;const connected=!!focus&&(edge.relation?(edge.aId===focus||edge.bId===focus):(edge.id===focus||edge.parentId===focus));const base=edge.relation?.72:.88;edge.line.material.opacity=focus?(connected?(edge.relation?.94:.98):.10):base;edge.line.material.needsUpdate=true;if(edge.pulse)edge.pulse.material.opacity=focus?(connected?.98:.12):.72;if(edge.pulse2)edge.pulse2.material.opacity=focus?(connected?.88:.08):.58}}
  function pick(e){if(transition)return;const hits=hitTest(e);if(!hits.length)return;const obj=hits[0].object;if(obj.userData.kind==='resource'||obj.userData.kind==='resource-label'){const rawUrl=obj.userData.url;if(typeof rawUrl!=='string'||!rawUrl.trim())return;let targetUrl;try{targetUrl=new URL(rawUrl,window.location.href)}catch{return}if(targetUrl.protocol!=='https:'&&targetUrl.protocol!=='http:')return;window.open(targetUrl.href,'_blank','noopener,noreferrer');return}if(obj.userData.kind==='sphere'||obj.userData.kind==='label'||obj.userData.kind==='dendrite'||obj.userData.kind==='synapse'){const id=obj.userData.id,node=points.find(p=>p.id===id);if(!node)return;clearResourceNodes();stage.dataset.hoverResource='';stage.classList.remove('resource-hover');hovered=null;selected=id;refreshFocus(id);flyTo(node.mesh,()=>{if(typeof window.enterSphere==='function')window.enterSphere(id,false);requestAnimationFrame(()=>requestAnimationFrame(()=>buildResourceNodes(id)));stage.classList.remove('is-transitioning')})}}
  // Relay pulses traverse several universes in sequence, making the network read as one living system.
  const relayRoutes=[
    ['bio','lab','products','iot'],
    ['myco','soil','work','lab','learn'],
    ['bio','myco','soil','products','work'],
    ['iot','products','soil','lab','learn'],
    // A visible feedback loop connecting biological output, productization and instrumentation.
    ['bio','products','work','iot','learn'],
    // Complementary routes expose links that are easy to miss in the primary circulation.
    ['bio','soil','iot','work'],
    ['myco','lab','learn','products'],
    ['soil','lab','iot','products'],
    // Close the loop from culture monitoring through project execution back to biology.
    ['myco','iot','work','bio','lab']
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
    // Never animate a misleading partial journey: every hop must exist in the graph.
    if(segments.length===route.length-1){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.052,16,12),new THREE.MeshBasicMaterial({color:0xe1f4d9,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));
      mesh.userData={kind:'relay-signal'};worldGroup.add(mesh);
      const trail=new THREE.Mesh(new THREE.SphereGeometry(.03,14,10),new THREE.MeshBasicMaterial({color:0xb7dfbd,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));
      trail.userData={kind:'relay-signal',trail:true};worldGroup.add(trail);
      const totalLength=segments.reduce((sum,segment)=>sum+segment.length,0);
      // Keep signal velocity consistent in world space: longer routes take proportionally longer to complete instead of racing through more distance.
      relaySignals.push({mesh,trail,segments,totalLength,offset:relaySignals.length*.19,speed:1.05/Math.max(totalLength,.1)});
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
    const edge=segment.edge;
    const targetId=segment.reverse?(edge.relation?edge.aId:edge.parentId):(edge.relation?edge.bId:edge.id);
    return {edge,targetId,arrival:1-local};
  };
  const branchRelaySignals=[];
  for(const path of junctionPaths.slice(0,6)){
    for(const fork of path.forkPaths){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.029,12,10),new THREE.MeshBasicMaterial({color:0xeaf5df,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
      const trail=new THREE.Mesh(new THREE.SphereGeometry(.016,10,8),new THREE.MeshBasicMaterial({color:0xc7e4cf,transparent:true,opacity:.72,depthWrite:false,toneMapped:false}));
      mesh.userData={kind:'junction-relay'};trail.userData={kind:'junction-relay',trail:true};worldGroup.add(mesh,trail);
      const totalLength=fork.reduce((sum,segment)=>sum+segment.length,0);
      branchRelaySignals.push({mesh,trail,segments:fork,totalLength,offset:branchRelaySignals.length*.137,speed:.82/Math.max(totalLength,.1)});
    }
  }
  function animate(){if(document.hidden||!stageVisibility.visible){raf=0;return}raf=requestAnimationFrame(animate);if(!renderer)return;const now=performance.now(),t=reduceMotion?0:now*.001;if(transition){const k=Math.min(1,(now-transition.at)/transition.duration),e=easeInOut(k);cameraTarget.copy(transition.path.getPoint(e));dist=THREE.MathUtils.lerp(transition.startDist,transition.endDist,e);if(k>=1){const next=transition.next;transition=null;stage.classList.remove('is-transitioning');next?.()}}const focus=hovered||selected;const activeIds=new Set();if(focus){activeIds.add(focus);for(const edge of edges){if(edge.relation&&(edge.aId===focus||edge.bId===focus)){activeIds.add(edge.aId);activeIds.add(edge.bId)}else if(!edge.relation&&(edge.id===focus||edge.parentId===focus)){activeIds.add(edge.id);activeIds.add(edge.parentId)}}}for(const p of points){const active=p.id===focus,neighbor=activeIds.has(p.id);const f=active?1.24:(selected===p.id?1.12:1+Math.sin(t*1.1+ids.indexOf(p.id))*.018);const membranePhase=p.mesh.userData.membranePhase??ids.indexOf(p.id),membraneBreath=1+Math.sin(t*.92+membranePhase*.81)*.009+Math.sin(t*.37+membranePhase*1.7)*.004;p.mesh.scale.set(.98*f*membraneBreath,.72*f*membraneBreath,.82*f*membraneBreath);p.mesh.rotation.y=t*.09+ids.indexOf(p.id)*.2;p.mesh.rotation.x=Math.sin(t*.32+ids.indexOf(p.id))*.035;p.mesh.material.emissiveIntensity=active?(.62+.35*(.5+.5*Math.sin(t*2.1))):(focus?(neighbor?.34:.08):.14);p.label.material.opacity=focus?(neighbor?1:.38):1;p.label.quaternion.copy(camera.quaternion);for(const twig of p.twigs){const base=twig.material.userData.baseOpacity??.8;twig.material.opacity=focus?(neighbor?Math.min(1,base*(active?1.14:1.04)):base*.2):base;twig.material.emissiveIntensity=focus?(neighbor?.32:.02):.18}}for(const obj of worldGroup.children){const kind=obj.userData?.kind;if((kind==='dendrite'||kind==='synapse')&&obj.material){const id=obj.userData.id,base=obj.material.userData.baseOpacity??.7;obj.material.opacity=focus?(activeIds.has(id)?Math.min(1,base*1.12):base*.18):base;obj.material.emissiveIntensity=focus?(activeIds.has(id)?.28:.015):.18;if(kind==='synapse'){const breath=.88+.22*Math.sin(t*3.1+ids.indexOf(id)*.7);obj.scale.setScalar(breath*(focus?(activeIds.has(id)?1.18:.82):1));obj.material.emissiveIntensity=focus?(activeIds.has(id)?.52:.025):.24+.14*(.5+.5*Math.sin(t*3.1))}}}for(const e of edges){const focus=hovered||selected;const connected=!!focus&&(e.relation?(e.aId===focus||e.bId===focus):e.id===focus||e.parentId===focus);if(e.line?.material){const base=e.line.material.userData.baseOpacity??e.line.material.opacity;e.line.material.userData.baseOpacity=base;e.line.material.opacity=focus?(connected?Math.min(1,base*1.22):base*.36):base;if('emissiveIntensity'in e.line.material)e.line.material.emissiveIntensity=focus?(connected?(e.relation?.38:.24):.035):(e.relation?.46:.20)}if(!e.pulse||!e.curve)continue;const speed=e.relation?.072:.105;const reverse=!!focus&&(e.relation?e.bId===focus:e.id===focus);const raw=(t*speed+e.phase)%1,progress=focus&&connected?(reverse?1-raw:raw):raw;e.pulse.position.copy(e.curve.getPoint(progress));const pulseBreath=.9+.24*Math.sin(t*4.2+e.phase);e.pulse.scale.setScalar(focus&&connected?1.3*pulseBreath:pulseBreath);e.pulse.material.opacity=focus?(connected?.62+.38*Math.sin(progress*Math.PI):.16):(.56+.4*Math.sin(progress*Math.PI));if(e.pulse2){const raw2=(raw+(focus&&connected&&reverse?.53:.47))%1,progress2=focus&&connected?(reverse?1-raw2:raw2):raw2;e.pulse2.position.copy(e.curve.getPoint(progress2));e.pulse2.scale.setScalar(focus&&connected?1.18:1);e.pulse2.material.opacity=focus?(connected?.46+.44*Math.sin(progress2*Math.PI):.11):.38+.5*Math.sin(progress2*Math.PI)}}for(const relay of [...relaySignals,...branchRelaySignals]){const cycle=(t*relay.speed+relay.offset)%1;const activeHop=placeRelayParticle(relay.mesh,relay,cycle);const trailHop=placeRelayParticle(relay.trail,relay,cycle-.055);const activeNode=points.find(p=>p.id===activeHop.targetId);const trailNode=points.find(p=>p.id===trailHop.targetId);if(activeNode)relay.mesh.material.color.set(activeNode.color);if(trailNode)relay.trail.material.color.set(trailNode.color);const arrivalGlow=1+Math.max(0,1-activeHop.arrival/.2)*.42;relay.mesh.scale.setScalar(arrivalGlow);relay.trail.scale.setScalar(1+Math.max(0,1-trailHop.arrival/.2)*.22);const focus=hovered||selected;const touchesFocus=edge=>!!focus&&(edge.relation?(edge.aId===focus||edge.bId===focus):(edge.id===focus||edge.parentId===focus));const signalLocal=touchesFocus(activeHop.edge),trailLocal=touchesFocus(trailHop.edge);relay.mesh.material.opacity=focus?(signalLocal?.72+.26*Math.sin(cycle*Math.PI):.18):.58+.4*Math.sin(cycle*Math.PI);relay.trail.material.opacity=focus?(trailLocal?.4+.42*Math.sin((((cycle-.055)%1)+1)%1*Math.PI):.075):.36+.48*Math.sin((((cycle-.055)%1)+1)%1*Math.PI)}for(const obj of resourceGroup?.children||[]){const kind=obj.userData?.kind;if(!obj.material||!['resource-domain-link','resource-relation','resource-spoke','resource-label','resource'].includes(kind))continue;const focus=hovered||selected;const activeResource=stage.dataset.hoverResource;const resourceMatch=!activeResource||(kind==='resource-relation'?(obj.userData.aUrl===activeResource||obj.userData.bUrl===activeResource):(['resource-domain-link','resource-spoke','resource'].includes(kind)?obj.userData.resourceUrl===activeResource||obj.userData.url===activeResource:true));const relevant=(!focus||obj.userData.sourceId===focus||obj.userData.targetId===focus)&&resourceMatch;const mats=Array.isArray(obj.material)?obj.material:[obj.material];for(const mat of mats){const base=mat.userData.baseOpacity??mat.opacity;mat.userData.baseOpacity=base;mat.opacity=focus?(relevant?(kind==='resource-relation'?Math.min(1,base*1.42):base):base*.2):base;if('emissiveIntensity'in mat)mat.emissiveIntensity=focus?(relevant?(kind==='resource-relation'?1.05:.72):.08):.55}if(kind==='resource')obj.scale.setScalar(focus?(relevant?1.16:.78):1+.035*Math.sin(t*2.1+(obj.userData.title?.length||0)));if(kind==='resource-label'){const base=obj.userData.baseScale||(obj.userData.baseScale=obj.scale.clone());const activeResource=!!stage.dataset.hoverResource&&obj.userData.url===stage.dataset.hoverResource;const factor=activeResource?1.14:(focus?.94:1);obj.scale.set(base.x*factor,base.y*factor,base.z)}}for(const signal of resourceSignals){const raw=(t*signal.speed+signal.offset)%1;const focus=hovered||selected;const reverse=!!focus&&signal.targetId===focus&&signal.sourceId!==focus;const progress=reverse?1-raw:raw;signal.mesh.position.copy(signal.curve.getPoint(progress));const activeResource=stage.dataset.hoverResource;const relevant=(!focus||signal.sourceId===focus||signal.targetId===focus)&&(!activeResource||signal.sourceUrl===activeResource||signal.targetUrl===activeResource||signal.resourceUrl===activeResource);signal.mesh.material.opacity=focus?(relevant?.72+.28*Math.sin(progress*Math.PI):.06):.38+.58*Math.sin(progress*Math.PI)}if(!dragging&&!transition){theta+=rotateVX;phi=THREE.MathUtils.clamp(phi+rotateVY,.35,2.78);rotateVX*=.88;rotateVY*=.88;if(Math.abs(rotateVX)<.00005)rotateVX=0;if(Math.abs(rotateVY)<.00005)rotateVY=0}updateCamera();renderer.render(scene,camera)}
  init();
}
