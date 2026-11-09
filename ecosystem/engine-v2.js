// BA Labs 3D Engine v2 — clean interaction core.
// The legacy HTML remains the content source; this module owns all spatial navigation.
const importThree = async () => {
  const sources = [
    ['https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js', 8000],
    ['https://unpkg.com/three@0.169.0/build/three.module.js', 8000],
    ['https://esm.sh/three@0.169.0', 8000],
  ];
  let last;
  for (const [url, timeout] of sources) {
    try {
      return await Promise.race([
        import(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Three.js timeout: ' + url)), timeout)),
      ]);
    } catch (error) { last = error; }
  }
  throw last || new Error('Three.js unavailable');
};

const ROOT = document.getElementById('mainView');
const IDS = ['bio','myco','soil','lab','products','iot','work','learn'];
const COLORS = { bio:0x79a991, myco:0xa88fc3, soil:0xc19b73, lab:0x80aeb8, products:0xc88773, iot:0x7eaaa3, work:0xa99dbb, learn:0xb5b58d };
const POS = {
  bio:[0,2.55,0], myco:[-2.35,1.05,.35], soil:[-2.15,-1.05,-.1], lab:[-.05,.35,-.7],
  products:[.2,-1.35,.55], iot:[2.45,.85,-.25], work:[2.15,-1.25,-.45], learn:[-.15,-2.8,.1],
};
const LINKS = [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn'],['bio','lab'],['myco','products'],['soil','work'],['bio','iot'],['myco','learn'],['soil','products']];
const LABELS = Object.fromEntries([...document.querySelectorAll('.sphere[data-sphere]')].map(el => [el.dataset.sphere, {
  title:el.querySelector('b')?.textContent || el.dataset.sphere,
  sub:el.querySelector('small')?.textContent || '',
}]));
const LANG = () => (document.documentElement.lang || 'fr').toLowerCase().split('-')[0];
const COPY = {
  fr:{hint:'FAITES GLISSER POUR TOURNER · PINCEZ POUR ZOOMER · TOUCHEZ UNE CELLULE',open:'ENTRER DANS LE RÉSEAU',home:'Vue d’ensemble',zoomIn:'Zoom avant',zoomOut:'Zoom arrière',reset:'Recentrer',domain:'DOMAINE',resource:'BRANCHE DU RÉSEAU',openPage:'Ouvrir la page Notion ↗',back:'← Retour au domaine',related:'CONNEXIONS',empty:'Aucune branche publique trouvée pour ce domaine.',loading:'Chargement du réseau…',overview:'Vue d’ensemble',children:'sous-dossiers'},
  en:{hint:'DRAG TO ROTATE · PINCH TO ZOOM · TAP A CELL',open:'ENTER THE NETWORK',home:'Overview',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Recenter',domain:'DOMAIN',resource:'NETWORK BRANCH',openPage:'Open Notion page ↗',back:'← Back to domain',related:'CONNECTIONS',empty:'No public branches found for this domain.',loading:'Loading network…'},
  ar:{hint:'اسحب للتدوير · اقرص للتكبير · المس خلية',open:'ادخل إلى الشبكة',home:'نظرة عامة',zoomIn:'تكبير',zoomOut:'تصغير',reset:'إعادة التمركز',domain:'المجال',resource:'فرع الشبكة',openPage:'فتح صفحة Notion ↗',back:'→ العودة إلى المجال',related:'الروابط',empty:'لا توجد فروع عامة لهذا المجال.',loading:'جارٍ تحميل الشبكة…'},
  pt:{hint:'ARRASTE PARA RODAR · PINÇA PARA AMPLIAR · TOQUE NUMA CÉLULA',open:'ENTRAR NA REDE',home:'Visão geral',zoomIn:'Aproximar',zoomOut:'Afastar',reset:'Recentralizar',domain:'DOMÍNIO',resource:'RAMO DA REDE',openPage:'Abrir página Notion ↗',back:'← Voltar ao domínio',related:'LIGAÇÕES',empty:'Não foram encontrados ramos públicos.',loading:'A carregar a rede…'},
};
const t = key => (COPY[LANG()] || COPY.fr)[key] || COPY.fr[key];

let THREE, renderer, scene, camera, raycaster, pointer, stage, panel, hint, intro, status;
let world, cells = new Map(), pickables = [], resourceObjects = [], edges = [], signalPoints = [];
let resourceHitTargets = new Map();
let nav, currentNode = null, currentAnchor = null, navigationStack = [];
let selected = null, selectedBranch = null, manifest = null, transition = null;
let distance = 13.5, theta = .22, phi = 1.27, target = null, targetGoal = null;
let opened = false, raf = 0, lastFrame = 0, dragging = false, moved = false, dragGesture = false;
let lastPointer = null, pointers = new Map(), pinchStart = 0, pinchDistance = 0, hoverId = null;
let canvasRect = null, cameraInitialized = false, lastPickAt = 0;

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #mainView.webgl-ready{display:block!important;position:relative;height:clamp(620px,68vw,820px);min-height:620px;padding:0;overflow:hidden;isolation:isolate;background:radial-gradient(ellipse at 48% 45%,#293b39 0%,#1a2829 48%,#111a1d 100%)}
    @media(max-width:760px){#mainView.webgl-ready{height:640px;min-height:640px}}
    #mainView.webgl-ready>.hub,#mainView.webgl-ready>.sphere,#mainView.webgl-ready>.network,#mainView.webgl-ready>.galaxy{display:none!important}
    #mainView .webgl-stage{position:absolute;inset:0;z-index:4;min-height:100%;touch-action:none;overflow:hidden}
    #mainView .webgl-stage canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
    #mainView .webgl-hit-target{position:absolute!important;z-index:30!important;width:76px;height:76px;min-width:64px;min-height:64px;padding:0;border:0;border-radius:50%;background:transparent;color:transparent;opacity:.015;pointer-events:auto!important;touch-action:manipulation;transform:translate(-50%,-50%);cursor:pointer;-webkit-tap-highlight-color:transparent}
    #mainView .webgl-hit-target:focus-visible{opacity:.24;outline:2px solid #d1d0c5;background:#b96b4d33}
    #mainView .webgl-stage .webgl-hint{position:absolute;left:16px;bottom:14px;z-index:8;padding:9px 12px;border:1px solid #78958a66;border-radius:999px;background:#142321d9;color:#e5e9df;font:600 9px/1.4 system-ui;letter-spacing:.08em;pointer-events:none;backdrop-filter:blur(12px)}
    #mainView .webgl-stage .webgl-status{position:absolute;right:16px;bottom:17px;z-index:8;color:#c2cfc5;font:600 9px system-ui;letter-spacing:.12em;pointer-events:none}
    #mainView .webgl-controls{position:absolute;right:14px;top:14px;z-index:16;display:flex;gap:6px}
    #mainView .webgl-controls button{width:38px;height:38px;border:1px solid #7b948766;border-radius:12px;background:#172724e8;color:#e5e9df;font:500 21px/1 system-ui;cursor:pointer;backdrop-filter:blur(12px)}
    #mainView .webgl-controls button:hover{background:#344a42;border-color:#b6c8b7}
    #mainView .webgl-path{position:absolute;left:16px;top:60px;z-index:14;display:flex;align-items:center;gap:5px;max-width:min(560px,calc(100% - 210px));overflow-x:auto;padding:7px 9px;border:1px solid #78958a66;border-radius:12px;background:#142321e8;backdrop-filter:blur(14px);color:#e8eee7;font:600 10px system-ui;white-space:nowrap}
    #mainView .webgl-path button{border:0;background:transparent;color:#dce8dc;padding:4px 5px;border-radius:6px;font:inherit;cursor:pointer}
    #mainView .webgl-path button:hover{background:#385044}
    #mainView .webgl-path .sep{color:#8fa99a}
    #mainView .webgl-path .current{color:#c8dcae}
    #mainView .webgl-focus{position:absolute;left:16px;top:16px;z-index:12;width:min(310px,calc(100% - 92px));max-height:calc(100% - 108px);overflow:auto;padding:17px;border:1px solid #78958a66;border-radius:17px;background:linear-gradient(145deg,#1b2928f2,#10191bf2);box-shadow:0 18px 48px #0006;backdrop-filter:blur(16px);color:#edf0e9}
    #mainView .webgl-focus[hidden]{display:none!important}
    #mainView .webgl-focus-kicker{display:block;color:#b3c5b5;font:700 9px system-ui;letter-spacing:.17em;margin-bottom:8px}
    #mainView .webgl-focus strong{display:block;font:650 18px/1.25 system-ui;letter-spacing:-.02em}
    #mainView .webgl-focus small{display:block;color:#c1cbc2;font:12px/1.6 system-ui;margin-top:7px}
    #mainView .webgl-focus .webgl-focus-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
    #mainView .webgl-focus button,#mainView .webgl-focus a{border:1px solid #6f8d7c77;border-radius:10px;padding:9px 11px;background:#2b4038;color:#edf0e9;font:600 11px system-ui;text-decoration:none;cursor:pointer}
    #mainView .webgl-focus button:hover,#mainView .webgl-focus a:hover{border-color:#c2d1c2;background:#354e43}
    #mainView .webgl-focus .webgl-focus-link{display:flex;justify-content:space-between;gap:12px;width:100%;margin-top:6px;text-align:left}
    #mainView .webgl-focus .webgl-focus-link span{color:#bdc9c0;font-weight:400}
    #mainView .webgl-intro{position:absolute;inset:0;z-index:10;width:100%;height:100%;border:0;padding:0;color:inherit;font:inherit;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 45%,#263b38c9 0%,#142120a8 62%,#111a1ddd 100%);cursor:pointer}
    #mainView .webgl-intro[hidden]{display:none!important}
    #mainView .webgl-intro-card{display:flex;flex-direction:column;align-items:center;gap:15px;text-align:center;padding:24px;max-width:340px}
    #mainView .webgl-intro-orb{width:116px;height:116px;border:1px solid #91aa9a;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#a2b9a044,#293f3a88 60%,#121d1c);box-shadow:inset -16px -12px 28px #07100e88,0 0 0 10px #b96b4d0c,0 0 45px #9db7a333}
    #mainView .webgl-intro-orb b{font:700 33px system-ui;letter-spacing:-.1em;color:#e1e7dc}
    #mainView .webgl-intro-copy{color:#d6ded6;font:600 10px system-ui;letter-spacing:.17em}
    #mainView .webgl-intro-cta{border:1px solid #9eb7a2;border-radius:999px;padding:12px 17px;color:#f1f2e9;background:#21342edb;font:700 10px system-ui;letter-spacing:.1em}
    #mainView .webgl-stage.is-transitioning{cursor:progress}
    @media(max-width:600px){#mainView .webgl-path{left:9px;top:52px;max-width:min(260px,calc(100% - 78px));font-size:9px}#mainView .webgl-hint{left:9px;bottom:10px;max-width:calc(100% - 130px);font-size:7px;letter-spacing:.02em}#mainView .webgl-status{right:9px;bottom:12px;font-size:7px}#mainView .webgl-focus{left:9px;top:9px;padding:13px;width:min(270px,calc(100% - 78px))}#mainView .webgl-controls{right:9px;top:9px;gap:4px}#mainView .webgl-controls button{width:34px;height:34px}}
  `;
  document.head.append(style);
}

function makeCellGeometry(id) {
  const geometry = new THREE.IcosahedronGeometry(1, 4);
  const position = geometry.attributes.position;
  const seed = IDS.indexOf(id) + 1;
  for (let i=0;i<position.count;i++) {
    const x=position.getX(i), y=position.getY(i), z=position.getZ(i);
    const wave=Math.sin(x*5.7+seed)*Math.cos(y*4.4-seed*.7)*Math.sin(z*5.1+seed*.4);
    const lobe=Math.sin(x*2.8+seed)*Math.sin(y*3.3-seed)*.12;
    const asym=Math.sin(x*2.1+z*3.7+seed)*Math.cos(y*2.6-seed)*.07;
    const scale=1+wave*.09+lobe+asym;
    position.setXYZ(i,x*scale,y*scale,z*scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeLabel(text, color, size=16) {
  const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
  // Render labels at high texture resolution: zoom enlarges sprites, not glyph detail.
  canvas.width=2048; canvas.height=512;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='700 '+(size*4)+'px Inter,system-ui,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='#07110f';ctx.shadowBlur=22;ctx.fillStyle='#f4f5ed';
  const words=String(text).split(/\s+/);let lines=[],line='';
  for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>1880&&line){lines.push(line);line=word}else line=next}
  if(line)lines.push(line);
  const shown=lines.slice(0,2),lineHeight=142,start=256-(shown.length-1)*lineHeight/2;
  shown.forEach((part,i)=>ctx.fillText(part,1024,start+i*lineHeight));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(2.3,.58,1);sprite.userData.labelText=text;
  return sprite;
}

function createWorld() {
  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x172321,.009);
  world=new THREE.Group();scene.add(world);
  scene.add(new THREE.AmbientLight(0xdce6df,1.65));
  const key=new THREE.PointLight(0xa6c1ad,24,35);key.position.set(0,7,8);scene.add(key);
  const warm=new THREE.PointLight(0xb96b4d,9,26);warm.position.set(7,-3,3);scene.add(warm);
  const fill=new THREE.PointLight(0x78958a,15,32);fill.position.set(-7,-2,-5);scene.add(fill);
  // Sparse background hyphae connect the field without forming panels or solid spheres.
  let fieldSeed=81273;const fieldRand=()=>{fieldSeed=(fieldSeed*16807)%2147483647;return(fieldSeed-1)/2147483646};
  const fieldPalette=[0x263b38,0xb96b4d,0xd1d0c5,0x78958a];
  for(let i=0;i<58;i++){const start=new THREE.Vector3(-5+fieldRand()*10,-4+fieldRand()*8,-3.5+fieldRand()*7),end=start.clone().add(new THREE.Vector3((fieldRand()-.5)*3.2,(fieldRand()-.5)*2.8,(fieldRand()-.5)*1.8)),mid=start.clone().lerp(end,.5).add(new THREE.Vector3((fieldRand()-.5)*.8,(fieldRand()-.5)*.8,(fieldRand()-.5)*.5)),curve=new THREE.CatmullRomCurve3([start,mid,end]),color=fieldPalette[Math.floor(fieldRand()*fieldPalette.length)];world.add(new THREE.Mesh(new THREE.TubeGeometry(curve,18,.0018+fieldRand()*.002,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.10+fieldRand()*.14,depthWrite:false})));if(i%2===0){const at=curve.getPoint(.48),tip=at.clone().add(new THREE.Vector3((fieldRand()-.5)*1.5,(fieldRand()-.5)*1.5,(fieldRand()-.5)*.8)),fork=new THREE.CatmullRomCurve3([at,at.clone().lerp(tip,.5).add(new THREE.Vector3(0,.05,.03)),tip]);world.add(new THREE.Mesh(new THREE.TubeGeometry(fork,12,.0016,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.12,depthWrite:false})));}}
  for(const id of IDS){
    const color=COLORS[id],pos=new THREE.Vector3(...POS[id]);
    const group=new THREE.Group();group.position.copy(pos);group.userData={id,kind:'domain'};
    // Open hyphal junction: the identity node is a branching intersection, not a solid cell.
    const soma=new THREE.Group();soma.userData={id,kind:'domain'};group.add(soma);
    for(let strand=0;strand<7;strand++){
      const a=strand/7*Math.PI*2+IDS.indexOf(id)*.23;
      const start=new THREE.Vector3(Math.cos(a)*.025,Math.sin(a)*.025,-.045);
      const end=new THREE.Vector3(Math.cos(a+.72)*.19,Math.sin(a+.72)*.16,.075+(strand%3)*.025);
      const mid=start.clone().lerp(end,.52).add(new THREE.Vector3(0,.025,.035));
      const curve=new THREE.CatmullRomCurve3([start,mid,end]);
      const strandMesh=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.0045,4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.28,transparent:true,opacity:.8,roughness:.8}));
      soma.add(strandMesh);
    }
    const glow=new THREE.Mesh(new THREE.SphereGeometry(1.18,24,18),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.035,side:THREE.BackSide,depthWrite:false}));
    glow.scale.copy(soma.scale);group.add(glow);
    const label=makeLabel(LABELS[id]?.title||id, color, 17);label.position.set(0,-.94,0);label.scale.set(2.8,.66,1);label.userData={id,kind:'domain-label'};group.add(label);
    const hit=new THREE.Mesh(new THREE.SphereGeometry(.96,16,12),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.userData={id,kind:'domain'};group.add(hit);
    world.add(group);cells.set(id,{group,soma,label,hit,position:pos,color});
    pickables.push(soma,hit,label);
    for(let j=0;j<14;j++){
      const a=j/14*Math.PI*2+IDS.indexOf(id)*.31;
      const start=new THREE.Vector3(Math.cos(a)*.10,Math.sin(a)*.09,Math.sin(a*1.7)*.035);
      const reach=1.0+(j%4)*.24;
      const end=new THREE.Vector3(Math.cos(a)*reach,Math.sin(a)*reach*.76,Math.sin(a*1.7)*.34);
      const mid=start.clone().lerp(end,.52).add(new THREE.Vector3(Math.cos(a+1)*.18,Math.sin(a+1)*.16,.13));
      const curve=new THREE.CatmullRomCurve3([start,mid,end]);
      const neurite=new THREE.Mesh(new THREE.TubeGeometry(curve,28,.0065+(j%3)*.0014,5,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.28,transparent:true,opacity:.76,roughness:.7}));
      neurite.userData={id,kind:'neurite'};group.add(neurite);
      for(let fork=0;fork<2;fork++){
        const at=curve.getPoint(.48+fork*.22),side=fork===0?-1:1;
        const forkEnd=at.clone().add(new THREE.Vector3(Math.cos(a+side*.72)*(.34+(j%3)*.08),Math.sin(a+side*.72)*(.28+(j%2)*.07),.07));
        const forkCurve=new THREE.CatmullRomCurve3([at,at.clone().lerp(forkEnd,.55).add(new THREE.Vector3(0,.035,.035)),forkEnd]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(forkCurve,14,.0038,4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.22,transparent:true,opacity:.52,roughness:.8})));
      }
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.026+(j%3)*.006,8,6),new THREE.MeshStandardMaterial({color,roughness:.75,emissive:color,emissiveIntensity:.18}));
      tip.position.copy(end);group.add(tip);
    }
  }
  LINKS.forEach(([a,b],index)=>{
    const A=cells.get(a).position,B=cells.get(b).position;
    const bend=new THREE.Vector3((A.x+B.x)/2+(index%2?-.3:.3),(A.y+B.y)/2+(index%3-.8)*.28,(A.z+B.z)/2+.45);
    const curve=new THREE.CatmullRomCurve3([A.clone(),bend,B.clone()]);
    const line=new THREE.Mesh(new THREE.TubeGeometry(curve,64,.009,5,false),new THREE.MeshBasicMaterial({color:0x8cae9b,transparent:true,opacity:.37}));
    line.userData={kind:'connection',a,b,curve};world.add(line);edges.push({curve,line,a,b});
    const pulse=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color:0xd0d9c5,transparent:true,opacity:.9}));world.add(pulse);signalPoints.push({pulse,curve,offset:index/LINKS.length});
  });
}

function cameraPosition() {
  const c=target || new THREE.Vector3();
  camera.position.set(c.x+distance*Math.sin(phi)*Math.sin(theta),c.y+distance*Math.cos(phi),c.z+distance*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(c);
}
function setCameraTarget(v) { target=v.clone();cameraPosition(); }
function resize() {
  if(!renderer||!camera||!stage)return;
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,window.innerWidth<760?1.2:1.65));
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h>1.25?43:58;camera.updateProjectionMatrix();cameraPosition();
}
function smoothCamera(to,distTo,duration=950,done) {
  if(transition?.frame)cancelAnimationFrame(transition.frame);
  const from=target.clone(),fromDist=distance,started=performance.now();
  const end=to.clone();
  stage.classList.add('is-transitioning');
  transition={frame:0};
  const step=now=>{
    const raw=Math.min(1,(now-started)/duration),e=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;
    target=from.clone().lerp(end,e);distance=fromDist+(distTo-fromDist)*e;
    cameraPosition();
    if(raw<1)transition.frame=requestAnimationFrame(step);
    else{transition=null;stage.classList.remove('is-transitioning');targetGoal=null;done?.()}
  };
  transition.frame=requestAnimationFrame(step);
}

function clearResources() {
  for(const button of resourceHitTargets.values())button.remove();resourceHitTargets.clear();
  for(const item of resourceObjects){world.remove(item);item.traverse?.(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else mDispose(o.material)}});if(item.geometry)item.geometry.dispose();if(item.material)mDispose(item.material)}
  resourceObjects=[];pickables=pickables.filter(o=>o.userData?.kind!=='resource'&&o.userData?.kind!=='resource-label');selectedBranch=null;
}
function mDispose(material){material?.map?.dispose();material?.dispose?.()}
function makeResourceLabel(item,color,depth=0) { const size=depth===0?18:depth===1?16:14;const label=makeLabel(item.title,color,size);const scale=depth===0?2.55:depth===1?1.95:1.5;label.scale.set(scale,depth===0?.58:depth===1?.48:.38,1);label.userData={...item,kind:'resource-label'};addResourceHitTarget(label);return label; }
function addResourceHitTarget(label) {
 // Labels are visual WebGL objects, never transparent DOM hit targets.
}
function syncResourceHitTargets() {
 // Canvas ray-picking is the only pointer-selection path.
}
function renderPath() {
  if(!nav)return;nav.replaceChildren();
  const crumbs=[{title:t('overview'),action:goOverview}];
  if(selected)crumbs.push({title:LABELS[selected]?.title||selected,action:()=>{navigationStack=[];currentNode=manifest?.domains?.find(d=>d.id===selected)||null;currentAnchor=cells.get(selected).position.clone();buildResources(selected);smoothCamera(currentAnchor,7.5,650)}});
  navigationStack.slice(1).forEach((entry,index)=>crumbs.push({title:entry.node.title,action:()=>navigateToStack(index+1)}));
  if(currentNode&&currentNode!==manifest?.domains?.find(d=>d.id===selected))crumbs.push({title:currentNode.title});
  crumbs.forEach((crumb,index)=>{if(index){const sep=document.createElement('span');sep.className='sep';sep.textContent='›';nav.append(sep)}const b=document.createElement('button');b.type='button';b.textContent=crumb.title;if(index===crumbs.length-1)b.className='current';else b.addEventListener('click',crumb.action);nav.append(b)});
}
function navigateToStack(index) {
  const entry=navigationStack[index];if(!entry)return;
  navigationStack=navigationStack.slice(0,index);currentNode=entry.node;currentAnchor=entry.anchor.clone();
  buildResources(selected,currentNode,currentAnchor);smoothCamera(currentAnchor,6.2,650);
}
function buildResources(id,parentNode=null,anchor=null) {
 clearResources();const domain=manifest?.domains?.find(d=>d.id===id);if(!domain)return;currentNode=parentNode||domain;currentAnchor=(anchor||cells.get(id).position).clone();const children=currentNode.children||[];renderPath();if(!children.length){status.textContent=(currentNode.title||domain.title).toUpperCase();return}
 const baseColor=new THREE.Color(COLORS[id]),accent=new THREE.Color(0xb96b4d);
 const filament=(pts,color,radius,opacity)=>{const curve=new THREE.CatmullRomCurve3(pts),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,18,radius,4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.18,transparent:true,opacity,roughness:.65}));world.add(mesh);resourceObjects.push(mesh);return curve};
 const maxDepth=2;
 const drawNode=(item,pos,depth,parent,angle,index)=>{const has=!!item.children?.length,color=baseColor.clone().lerp(accent,Math.min(.34,depth*.12+(index%3)*.025)),radius=depth===0?(has?.135:.105):depth===1?(has?.085:.065):.043;item.position=pos.clone();item.parentNode=parent;const data={kind:'resource',...item,sourceId:id,position:pos.clone(),hasChildren:has,depth,parentNode:parent};const node=new THREE.Mesh(new THREE.IcosahedronGeometry(radius,1),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:depth===0?.42:.24,roughness:.48,metalness:.04,transparent:depth===2,opacity:depth===2?.78:1}));node.position.copy(pos);node.userData=data;world.add(node);resourceObjects.push(node);pickables.push(node);const hitRadius=depth===0?.32:depth===1?.25:.19;const hit=new THREE.Mesh(new THREE.SphereGeometry(hitRadius,10,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.copy(pos);hit.userData=data;world.add(hit);resourceObjects.push(hit);pickables.push(hit);const l=makeResourceLabel(data,color,depth);l.position.copy(pos).add(new THREE.Vector3(0,depth===0?-.28:depth===1?-.19:-.13,.025));world.add(l);resourceObjects.push(l);pickables.push(l);const pp=parent===currentNode?currentAnchor:(parent.position||currentAnchor),mid=pp.clone().lerp(pos,.52).add(new THREE.Vector3(0,.12+depth*.035,.12)),curve=filament([pp.clone(),mid,pos.clone()],color,depth===0?.012:depth===1?.007:.004,depth===0?.66:depth===1?.52:.38);if(depth<2)for(let f=0;f<2;f++){const at=curve.getPoint(.46+f*.2),sgn=f===0?-1:1,tip=at.clone().add(new THREE.Vector3(Math.cos(angle+sgn*.8)*(.24-depth*.045),Math.sin(angle+sgn*.8)*(.2-depth*.04),.045));filament([at,at.clone().lerp(tip,.55).add(new THREE.Vector3(0,.045,.025)),tip],color,.0035-depth*.0006,.28)}if(depth>=maxDepth||!has)return;const kids=item.children||[],spread=Math.min(1.2,.32+kids.length*.105);kids.forEach((child,childIndex)=>{const frac=kids.length===1?0:(childIndex/(kids.length-1)-.5),childAngle=angle+frac*spread*2+(childIndex%2?-.08:.08),dist=depth===0?.88+Math.min(.25,kids.length*.018):.48,childPos=pos.clone().add(new THREE.Vector3(Math.cos(childAngle)*dist,Math.sin(childAngle)*dist*.82+((childIndex%3)-1)*.035,.04+(childIndex%2)*.035));drawNode(child,childPos,depth+1,item,childAngle,childIndex)});
 // Anastomoses: sibling branches reconnect into a mesh instead of ending as a radial tree.
 if(kids.length>1){
   const bridgeColor=color.clone().lerp(accent,.22);
   for(let i=0;i<kids.length;i++){
     const A=kids[i].position,B=kids[(i+1)%kids.length].position,delta=B.clone().sub(A),normal=new THREE.Vector3(-delta.y,delta.x,0).normalize(),side=i%2?1:-1;
     const p1=A.clone().lerp(B,.32).addScaledVector(normal,.16*side).add(new THREE.Vector3(0,0,.07));
     const p2=A.clone().lerp(B,.7).addScaledVector(normal,-.12*side).add(new THREE.Vector3(0,0,.1));
     filament([A.clone(),p1,p2,B.clone()],bridgeColor,.0032,.24);
     if(kids.length>3&&i%2===0){
       const C=kids[(i+2)%kids.length].position,mid=A.clone().lerp(C,.5).addScaledVector(normal,.22).add(new THREE.Vector3(0,0,.14));
       filament([A.clone(),mid,C.clone()],bridgeColor,.0024,.16);
     }
   }
 }
};
 children.forEach((item,k)=>{const ang=k/Math.max(1,children.length)*Math.PI*2-Math.PI/2+(k%2)*.11,rad=2.15+(k%3)*.16,p=currentAnchor.clone().add(new THREE.Vector3(Math.cos(ang)*rad,Math.sin(ang)*rad*.78,Math.sin(ang*1.6)*.34));drawNode(item,p,0,currentNode,ang,k)});
 status.textContent=(currentNode.title||domain.title).toUpperCase()+' · '+children.length+' '+t('children').toUpperCase();
}
function openResource(item) { const data=item.userData||item;if(data.children?.length){const ancestors=[];let parent=data.parentNode;while(parent&&parent!==currentNode){ancestors.unshift(parent);parent=parent.parentNode}if(parent===currentNode){navigationStack.push({node:currentNode,anchor:currentAnchor.clone()});for(const ancestor of ancestors)navigationStack.push({node:ancestor,anchor:ancestor.position.clone()})}currentNode=data;currentAnchor=data.position.clone();smoothCamera(currentAnchor,6.1,720,()=>buildResources(selected,currentNode,currentAnchor));return}if(data.url){window.open(data.url,'_blank','noopener');return}status.textContent=data.title||'';}
function showDomainPanel(id,message='') {if(message)status.textContent=message;renderPath()}
function enterDomain(id) {
  if(!cells.has(id))return;selected=id;selectedBranch=null;opened=true;navigationStack=[];currentNode=manifest?.domains?.find(d=>d.id===id)||null;currentAnchor=cells.get(id).position.clone();
  intro.hidden=true;nav.hidden=false;ROOT.classList.remove('universe-closed');ROOT.classList.add('universe-open');panel.hidden=true;panel.replaceChildren();
  if(typeof window.enterSphere==='function')window.enterSphere(id,false,true); // Populate the hidden legacy content source only; the old engine no longer owns #mainView events.
  smoothCamera(cells.get(id).position,7.5,900,()=>buildResources(id));
}
function goBackLevel() {
  if(navigationStack.length){const previous=navigationStack.pop();currentNode=previous.node;currentAnchor=previous.anchor.clone();smoothCamera(currentAnchor,6.2,650,()=>buildResources(selected,currentNode,currentAnchor));return}
  if(selected)goOverview();
}
function goOverview() {
  selected=null;selectedBranch=null;navigationStack=[];currentNode=null;currentAnchor=null;clearResources();nav?.replaceChildren();nav.hidden=true;panel.hidden=true;panel.replaceChildren();
  const mini=document.getElementById('miniView');if(mini){mini.hidden=true;mini.classList.remove('spatial-source-only')}
  const homeButton=document.getElementById('homeBtn');if(homeButton)homeButton.hidden=true;
  smoothCamera(new THREE.Vector3(0,0,0),13.5,850,()=>{status.textContent='BALABS / LIVING NETWORK'});
}
function showFailure(error) {
  console.error('BA Labs clean 3D engine failed',error);
  ROOT.classList.remove('webgl-ready','universe-open','universe-closed');ROOT.classList.add('webgl-load-error');ROOT.querySelectorAll('.network,.galaxy,.hub,.sphere').forEach(el=>el.style.display='none');
  const p=document.createElement('div');p.className='webgl-load-error-panel';p.style.cssText='min-height:380px;display:grid;place-items:center;padding:30px;text-align:center;color:#e8eee8;background:#172321;border-radius:18px';
  const inner=document.createElement('div');const title=document.createElement('strong');title.textContent=LANG()==='fr'?'Le réseau 3D ne peut pas démarrer':'The 3D network could not start';const retry=document.createElement('button');retry.textContent='↻';retry.addEventListener('click',()=>location.reload());inner.append(title,document.createElement('br'),retry);p.append(inner);ROOT.append(p);
}

function setupUI() {
  stage=document.createElement('div');stage.className='webgl-stage';stage.tabIndex=0;stage.setAttribute('role','application');stage.setAttribute('aria-label','BA Labs interactive biological network');
  hint=document.createElement('div');hint.className='webgl-hint';hint.textContent=t('hint');
  status=document.createElement('div');status.className='webgl-status';status.textContent='BALABS / LIVING NETWORK';window.__BALABS_3D_STATUS=status;
  panel=document.createElement('section');panel.className='webgl-focus';panel.hidden=true;panel.setAttribute('aria-live','polite');
  nav=document.createElement('nav');nav.className='webgl-path';nav.setAttribute('aria-label','Navigation dans les dossiers');nav.hidden=true;
  const controls=document.createElement('div');controls.className='webgl-controls';controls.innerHTML='<button type="button" data-camera="back" aria-label="Niveau précédent">‹</button><button type="button" data-camera="out" aria-label="Zoom arrière">−</button><button type="button" data-camera="in" aria-label="Zoom avant">+</button><button type="button" data-camera="reset" aria-label="Recentrer">⌖</button>';
  intro=document.createElement('button');intro.type='button';intro.className='webgl-intro';intro.innerHTML='<span class="webgl-intro-card"><span class="webgl-intro-orb"><b>BA</b></span><span class="webgl-intro-copy">BALABS · APPLIED BIOTECHNOLOGY</span><span class="webgl-intro-cta">'+t('open')+'</span></span>';
  intro.addEventListener('click',()=>{opened=true;intro.hidden=true;nav.hidden=false;ROOT.classList.remove('universe-closed');ROOT.classList.add('universe-open');status.textContent='BALABS / LIVING NETWORK'});
  controls.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.camera;if(action==='back'){goBackLevel();return}if(action==='in')distance=Math.max(3.5,distance*.82);if(action==='out'){if(selected){goBackLevel();return}distance=Math.min(42,distance*1.2)}if(action==='reset'){goOverview();return}cameraPosition()});
  stage.append(hint,status,controls,nav,panel,intro);ROOT.append(stage);
  document.getElementById('homeBtn')?.addEventListener('click',()=>{if(selected)goOverview()});
  stage.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight + - Escape Backspace Home');
  stage.addEventListener('keydown',e=>{
    if(e.target!==stage&&e.target!==renderer?.domElement)return;
    const key=e.key;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','=','-','_','Escape','Backspace','Home'].includes(key))e.preventDefault();
    if(key==='ArrowLeft')theta-=.12;
    else if(key==='ArrowRight')theta+=.12;
    else if(key==='ArrowUp')phi=THREE.MathUtils.clamp(phi-.10,.35,2.78);
    else if(key==='ArrowDown')phi=THREE.MathUtils.clamp(phi+.10,.35,2.78);
    else if(key==='+'||key==='=')distance=Math.max(3.5,distance*.86);
    else if(key==='-'||key==='_'){const next=Math.min(42,distance*1.16);if(selected&&next>9.5){goBackLevel();return}distance=next}
    else if(key==='Escape'||key==='Backspace'){if(selected)goBackLevel();return}
    else if(key==='Home'){goOverview();return}
    cameraPosition();
  });
  stage.addEventListener('wheel',e=>{if(e.target.closest('.webgl-controls,.webgl-focus'))return;e.preventDefault();const nextDistance=THREE.MathUtils.clamp(distance+e.deltaY*.012,3.5,42);if(selected&&e.deltaY>0&&nextDistance>9.5){goBackLevel();return}distance=nextDistance;cameraPosition()},{passive:false});
  // Pointer input belongs to the stage so mouse, pen and touch-generated
  // pointer events follow the same path. Keep the document-level pointer-up
  // capture as a safety net for browsers that retarget capture during a drag.
  stage.addEventListener('pointerdown',onPointerDown);
  stage.addEventListener('pointermove',onPointerMove);
  stage.addEventListener('pointerup',onPointerUp);
  document.addEventListener('pointerup',onPointerUp,true);
  stage.addEventListener('pointercancel',onPointerCancel);
  // Direct stage touch fallback for mobile browsers that omit pointer events.
  let touchFallback=null;
  const rememberTouch=e=>{if(e.touches.length===1){const p=e.touches[0];touchFallback={x:p.clientX,y:p.clientY,at:performance.now()}}};
  const finishTouch=e=>{if(e.target.closest?.('.webgl-hit-target')){touchFallback=null;return}if(!touchFallback)return;const p=e.changedTouches[0],start=touchFallback;touchFallback=null;if(!p||Math.hypot(p.clientX-start.x,p.clientY-start.y)>12)return;if(performance.now()-lastPickAt>450)pickAt(p.clientX,p.clientY)};
  stage.addEventListener('touchstart',rememberTouch,{passive:true});
  stage.addEventListener('touchend',finishTouch,{passive:true});
  stage.addEventListener('touchcancel',()=>{touchFallback=null},{passive:true});

  document.addEventListener('click',e=>{if(!e.detail||dragGesture||!renderer)return;if(e.target.closest?.('.webgl-controls,.webgl-focus,.webgl-intro'))return;const r=renderer.domElement.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;if(performance.now()-lastPickAt>450)pickAt(e.clientX,e.clientY)},true);
  stage.addEventListener('lostpointercapture',onLostCapture);
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('resize',resize);
}
function onPointerDown(e) {
  if(e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target'))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture?.(e.pointerId);
  if(pointers.size===2){const p=[...pointers.values()];pinchStart=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);dragging=true;moved=true;return}
  dragging=true;moved=false;dragGesture=false;lastPointer={x:e.clientX,y:e.clientY};
}
function onPointerMove(e) {
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinchStart)distance=THREE.MathUtils.clamp(distance-(d-pinchStart)*.035,3.5,42);pinchStart=d;moved=true;if(selected&&distance>9.5){goBackLevel();return}cameraPosition();return}
  if(!dragging||!lastPointer)return;
  const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;
  if(Math.hypot(dx,dy)>7){moved=true;dragGesture=true}
  if(dragGesture){theta-=dx*.0045;phi=THREE.MathUtils.clamp(phi+dy*.0045,.35,2.78);cameraPosition()}
  lastPointer={x:e.clientX,y:e.clientY};
}
function onPointerUp(e) {
  const wasPointer=pointers.has(e.pointerId);pointers.delete(e.pointerId);
  if(pointers.size<2)pinchStart=0;
  if(!wasPointer)return;
  if(pointers.size){moved=true;return}
  dragging=false;
  if(!moved&&!transition&&performance.now()-lastPickAt>450&&!e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro'))pickAt(e.clientX,e.clientY);
  lastPointer=null;
}
function onPointerCancel(){pointers.clear();dragging=false;moved=true;pinchStart=0;lastPointer=null}
function onLostCapture(e){if(pointers.has(e.pointerId)){pointers.delete(e.pointerId);if(!pointers.size){dragging=false;lastPointer=null}}}
function pickAt(x,y) {
  lastPickAt=performance.now();
  const rect=renderer.domElement.getBoundingClientRect();
  camera.updateMatrixWorld(true);world.updateMatrixWorld(true);
  const screenPoint=obj=>{
    const p=obj.getWorldPosition(new THREE.Vector3()).project(camera);
    if(p.z<-1||p.z>1)return{x:Infinity,y:Infinity,d:Infinity};
    const sx=rect.left+(p.x+1)*rect.width/2,sy=rect.top+(1-p.y)*rect.height/2;
    return{x:sx,y:sy,d:Math.hypot(sx-x,sy-y)};
  };
  if(!selected){
    let nearest=null,nearestDistance=Infinity;
    for(const item of cells.values()){const p=screenPoint(item.hit);if(p.d<nearestDistance){nearest=item;nearestDistance=p.d}}
    if(nearest&&nearestDistance<(window.innerWidth<760?72:88)){enterDomain(nearest.group.userData.id);return}
    return;
  }
  // The active folder owns all taps while inside a universe: never let an
  // overlapping neighbouring universe steal a branch selection.
  const labels=resourceObjects.filter(o=>o.userData?.kind==='resource-label');
  let nearestLabel=null,nearestLabelDistance=Infinity;
  for(const label of labels){const p=screenPoint(label);if(p.d<nearestLabelDistance){nearestLabel=label;nearestLabelDistance=p.d}}
  // Keep touch targets tight: a wide radius makes adjacent labels steal taps in dense branches.
  if(nearestLabel&&nearestLabelDistance<(window.innerWidth<760?58:70)){
    if(window.__BALABS_3D_E2E__)window.__BALABS_3D_LAST_PICK__={title:nearestLabel.userData.title,kind:nearestLabel.userData.kind,children:nearestLabel.userData.children?.length||0,distance:nearestLabelDistance};
    openResource(nearestLabel.userData);return;
  }
  let nearestNode=null,nearestNodeDistance=Infinity;
  for(const node of resourceObjects.filter(o=>o.userData?.kind==='resource'&&o.userData.depth>0)){
    const p=screenPoint(node);if(p.d<nearestNodeDistance){nearestNode=node;nearestNodeDistance=p.d}
  }
  if(nearestNode&&nearestNodeDistance<(window.innerWidth<760?48:56)){openResource(nearestNode.userData);return}
}

function animate(now=0) {
  raf=requestAnimationFrame(animate);
  const dt=Math.min(.05,(now-lastFrame)/1000||0);lastFrame=now;
  if(world){
    // Keep domain anchors world-stable; only cells pulse, so pointer targets never drift.
    for(const item of signalPoints){const p=item.curve.getPoint((now*.000075+item.offset)%1);item.pulse.position.copy(p)}
    for(const [id,item] of cells){const phase=now*.0006+IDS.indexOf(id)*.7;const pulse=1+Math.sin(phase)*.012;item.soma.scale.set((id==='soil'?.62:.56)*pulse,(id==='lab'?.48:id==='myco'?.66:.61)*pulse,(id==='myco'?.66:.55)*pulse);item.group.rotation.y=Math.sin(phase*.6)*.018}
  }
  syncResourceHitTargets();
  renderer.render(scene,camera);
}

async function init() {
  try {
    if(!ROOT)throw new Error('Missing #mainView');
    THREE=await importThree();
    addStyles();
    ROOT.classList.add('webgl-ready','universe-closed');ROOT.classList.remove('universe-open','webgl-load-error');
    ROOT.querySelectorAll('.hub,.sphere,.network,.galaxy').forEach(el=>el.style.display='none');
    setupUI();
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','BA Labs 3D network canvas');
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(46,1,.1,180);raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();target=new THREE.Vector3();
    createWorld();resize();cameraInitialized=true;
    const loadManifest=()=>fetch('./notion-tree.'+LANG()+'.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.version===1&&Array.isArray(data.domains)){manifest=data;if(selected&&!transition)buildResources(selected,currentNode,currentAnchor)}}).catch(()=>{});loadManifest();new MutationObserver(()=>{hint.textContent=t('hint');loadManifest()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    window.__BALABS_3D_E2E__=()=>{
      const rect=renderer.domElement.getBoundingClientRect();
      const project=obj=>{const p=obj.getWorldPosition(new THREE.Vector3()).project(camera);return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,z:p.z,title:obj.userData.title||obj.userData.id,hasChildren:!!obj.userData.hasChildren,depth:obj.userData.depth??0,url:obj.userData.url||null}};
      const inside=p=>p.z>-1&&p.z<1&&p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom;
      const branches=resourceObjects.filter(o=>o.userData?.kind==='resource-label').map(project).filter(inside);
      const center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
      const targetBranch=branches.sort((a,b)=>Number(b.hasChildren)-Number(a.hasChildren)||Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y))[0]||null;
      const domain=cells.get('bio'),domainTarget=domain?project(domain.hit):null;
      return{count:resourceObjects.filter(o=>o.userData?.kind==='resource-label').length,visible:branches.length,visibleDepths:[...new Set(resourceObjects.filter(o=>o.userData?.kind==='resource').map(o=>o.userData.depth??0))].sort(),target:targetBranch,domainTarget:domainTarget&&inside(domainTarget)?domainTarget:null,lastPick:window.__BALABS_3D_LAST_PICK__||null,lastOpen:window.__BALABS_3D_LAST_OPEN__||null,miniHidden:!!document.getElementById('miniView')?.hidden,transitioning:!!transition,selected,currentTitle:currentNode?.title||null,depth:navigationStack.length,childCount:currentNode?.children?.length||0,clickCount:window.__BALABS_3D_E2E_CLICKS||0,pointerDowns:window.__BALABS_3D_POINTERDOWN||0,pointerUps:window.__BALABS_3D_POINTERUP||0,pickCalls:window.__BALABS_3D_PICK_CALLS||0};
    };
    animate();
  } catch(error){showFailure(error)}
}
init();