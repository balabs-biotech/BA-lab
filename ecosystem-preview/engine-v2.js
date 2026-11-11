// BA Labs 3D Engine v2 — continuous mycelium navigation; domain colonies are filamentary, never solid spheres.
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
const COLORS = { bio:0x78998a, myco:0x9b806d, soil:0x8d9b78, lab:0x829b9d, products:0xb96b4d, iot:0x789c91, work:0xa47c67, learn:0xb1aa8e };
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
  fr:{hint:'1 DOIGT : TOURNER · 2 DOIGTS : DÉPLACER · PINCER : ZOOMER',open:'ENTRER DANS LE RÉSEAU',home:'Vue d’ensemble',zoomIn:'Zoom avant',zoomOut:'Zoom arrière',reset:'Recentrer',domain:'DOMAINE',resource:'BRANCHE DU RÉSEAU',openPage:'Ouvrir la page Notion ↗',back:'← Retour au domaine',related:'CONNEXIONS',empty:'Aucune branche publique trouvée pour ce domaine.',loading:'Chargement du réseau…',overview:'Vue d’ensemble',children:'sous-dossiers'},
  en:{hint:'1 FINGER: ROTATE · 2 FINGERS: PAN · PINCH: ZOOM',open:'ENTER THE NETWORK',home:'Overview',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Recenter',domain:'DOMAIN',resource:'NETWORK BRANCH',openPage:'Open Notion page ↗',back:'← Back to domain',related:'CONNECTIONS',empty:'No public branches found for this domain.',loading:'Loading network…'},
  ar:{hint:'إصبع واحد: تدوير · إصبعان: تحريك · ضمّ الأصابع: تكبير',open:'ادخل إلى الشبكة',home:'نظرة عامة',zoomIn:'تكبير',zoomOut:'تصغير',reset:'إعادة التمركز',domain:'المجال',resource:'فرع الشبكة',openPage:'فتح صفحة Notion ↗',back:'→ العودة إلى المجال',related:'الروابط',empty:'لا توجد فروع عامة لهذا المجال.',loading:'جارٍ تحميل الشبكة…'},
  pt:{hint:'1 DEDO: RODAR · 2 DEDOS: MOVER · PINÇA: ZOOM',open:'ENTRAR NA REDE',home:'Visão geral',zoomIn:'Aproximar',zoomOut:'Afastar',reset:'Recentralizar',domain:'DOMÍNIO',resource:'RAMO DA REDE',openPage:'Abrir página Notion ↗',back:'← Voltar ao domínio',related:'LIGAÇÕES',empty:'Não foram encontrados ramos públicos.',loading:'A carregar a rede…'},
};
const t = key => (COPY[LANG()] || COPY.fr)[key] || COPY.fr[key];

let THREE, renderer, scene, camera, raycaster, pointer, stage, panel, hint, intro, status;
let world, cells = new Map(), pickables = [], resourceObjects = [], edges = [], signalPoints = [];
let resourceHitTargets = new Map(), domainHitTargets = new Map();
let nav, branchDock, currentNode = null, currentAnchor = null, navigationStack = [];
let selected = null, selectedBranch = null, manifest = null, transition = null;
let distance = 19.5, zoomTargetDistance = 19.5, theta = .22, phi = 1.27, target = null, targetGoal = null;
let opened = false, raf = 0, lastFrame = 0, dragging = false, moved = false, dragGesture = false;
let lastPointer = null, pointers = new Map(), pinchStart = 0, pinchDistance = 0, pinchCenter = null, hoverId = null , lastBranchTouchActivationAt = 0;
let canvasRect = null, cameraInitialized = false, lastPickAt = 0;
let _hitWorld = null;
let labelWorldPosition = null, activeResourceLabelDepth = 0;

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #mainView.webgl-ready{display:block!important;position:relative;height:clamp(620px,68vw,820px);min-height:620px;padding:0;overflow:hidden;isolation:isolate;background:radial-gradient(ellipse at 48% 45%,#293b39 0%,#1a2829 48%,#111a1d 100%)}
    @media(max-width:760px){#mainView.webgl-ready{height:640px;min-height:640px}}
    #mainView.webgl-ready>.hub,#mainView.webgl-ready>.sphere,#mainView.webgl-ready>.network,#mainView.webgl-ready>.galaxy{display:none!important}
    #mainView .webgl-stage{position:absolute;inset:0;z-index:4;min-height:100%;touch-action:none;overflow:hidden}
    #mainView .webgl-stage canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
    #mainView .webgl-stage .webgl-hit-target{position:absolute;z-index:30;width:76px;height:76px;min-width:64px;min-height:64px;padding:0;border:0;border-radius:50%;background:transparent;color:transparent;opacity:.015;pointer-events:auto!important;touch-action:manipulation;transform:translate(-50%,-50%);cursor:pointer;-webkit-tap-highlight-color:transparent}
    body > .webgl-hit-target:focus-visible{opacity:.24;outline:2px solid #d1d0c5;background:#b96b4d33}
    #mainView .webgl-stage .webgl-hint{position:absolute;left:16px;bottom:14px;z-index:8;padding:3px 0;max-width:calc(100% - 32px);white-space:normal;border:0;border-radius:0;background:transparent;color:#d1d9d0;font:600 9px/1.4 system-ui;letter-spacing:.06em;pointer-events:none;text-shadow:0 1px 5px #07110f}
    #mainView .webgl-stage .webgl-status{position:absolute;right:16px;bottom:17px;z-index:8;color:#c2cfc5;font:600 9px system-ui;letter-spacing:.12em;pointer-events:none}
    #mainView .webgl-controls{position:absolute;right:14px;top:14px;z-index:16;display:flex;gap:6px}
    #mainView .webgl-controls button{width:38px;height:38px;border:1px solid #7b948766;border-radius:12px;background:#172724e8;color:#e5e9df;font:500 21px/1 system-ui;cursor:pointer;backdrop-filter:blur(12px)}
    #mainView .webgl-controls button:hover{background:#344a42;border-color:#b6c8b7}
    #mainView .webgl-path{position:absolute;left:16px;top:60px;z-index:14;display:flex;align-items:center;gap:5px;max-width:min(560px,calc(100% - 210px));overflow-x:auto;padding:3px 0;border:0;border-radius:0;background:transparent;color:#e8eee7;font:600 10px system-ui;white-space:nowrap;text-shadow:0 1px 5px #07110f}
    #mainView .webgl-path button{border:0;background:transparent;color:#dce8dc;padding:4px 5px;border-radius:6px;font:inherit;cursor:pointer}
    #mainView .webgl-path button:hover{background:#385044}
    #mainView .webgl-path .webgl-depth-marker{flex:0 0 auto;margin-left:7px;padding:3px 6px;border-left:1px solid #b96b4d;color:#d99a7d;font:700 9px/1 system-ui;letter-spacing:.08em;text-shadow:0 1px 5px #07110f}
    #mainView .webgl-path .sep{color:#8fa99a}
    #mainView .webgl-path .current{color:#c8dcae}
    #mainView .webgl-focus{position:absolute;left:16px;top:16px;z-index:12;width:min(310px,calc(100% - 92px));max-height:calc(100% - 108px);overflow:auto;padding:5px 0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;color:#edf0e9;text-shadow:0 1px 5px #07110f}
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
    #mainView .webgl-branch-dock{touch-action:pan-x;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;position:absolute;left:clamp(10px,2vw,24px);right:clamp(10px,2vw,24px);bottom:48px;z-index:24!important;display:flex;flex-wrap:nowrap;justify-content:flex-start;align-items:center;gap:10px;height:48px;max-height:48px;overflow-x:auto;overflow-y:hidden;padding:4px 0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;scrollbar-width:none}
    #mainView .webgl-branch-dock[hidden]{display:none!important}
    #mainView .webgl-branch-dock .webgl-branch-item{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;gap:6px;min-height:36px;max-width:230px;min-width:0;padding:6px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;border-radius:0;background:transparent;color:#e5e9df;font:650 13px/1.2 system-ui,sans-serif;text-align:left;text-decoration:none;cursor:pointer;touch-action:manipulation;text-shadow:0 1px 5px #07110f}
    #mainView .webgl-branch-dock .webgl-branch-item[data-has-children="true"]:after{content:'›';color:#d69a7f;font-size:21px;line-height:1}
    #mainView .webgl-branch-dock .webgl-branch-item:hover,#mainView .webgl-branch-dock .webgl-branch-item:focus-visible{background:#385044;border-color:#d1d0c5;outline:2px solid #d1d0c5;outline-offset:2px}
    #mainView .webgl-branch-dock .webgl-branch-item[aria-current="page"]{background:transparent;color:#d99a7d;text-decoration:underline;text-decoration-color:#b96b4d;text-decoration-thickness:2px;text-underline-offset:5px}
    @media(max-width:600px){#mainView .webgl-branch-dock{left:8px;right:8px;bottom:46px;height:50px;max-height:50px;gap:5px;padding:5px 7px}#mainView .webgl-branch-dock .webgl-branch-item{flex:0 0 auto;min-width:0;max-width:190px;min-height:44px;padding:7px 9px;font-size:13px}}
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
  ctx.font='700 '+(size*14)+'px Inter,system-ui,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  // A firm dark keyline keeps pale glyphs readable over bright hyphae at every zoom level.
  ctx.lineJoin='round';ctx.lineWidth=30;ctx.strokeStyle='rgba(7,17,15,.96)';
  ctx.shadowColor='#07110f';ctx.shadowBlur=18;ctx.fillStyle='#f4f5ed';
  const words=String(text).split(/\s+/);let lines=[],line='';
  for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>1880&&line){lines.push(line);line=word}else line=next}
  if(line)lines.push(line);
  const shown=lines.slice(0,2),lineHeight=210,start=256-(shown.length-1)*lineHeight/2;
  shown.forEach((part,i)=>{const y=start+i*lineHeight;ctx.strokeText(part,1024,y);ctx.fillText(part,1024,y)});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(2.3,.58,1);sprite.userData.labelText=text;
  return sprite;
}

function createWorld() {
  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x071522,.0065);
  world=new THREE.Group();scene.add(world);
  scene.add(new THREE.AmbientLight(0xdce6df,1.65));
  const key=new THREE.PointLight(0x58c9e8,31,42);key.position.set(0,7,8);scene.add(key);
  const warm=new THREE.PointLight(0xb96b4d,9,26);warm.position.set(7,-3,3);scene.add(warm);
  const fill=new THREE.PointLight(0x36b8a8,23,38);fill.position.set(-7,-2,-5);scene.add(fill);
  // Fine background hyphae add depth and interconnect the colonies visually.
  let fieldSeed=81273;const fieldRand=()=>{fieldSeed=(fieldSeed*16807)%2147483647;return(fieldSeed-1)/2147483646};
  const fieldPalette=[0x43c5df,0x42b9aa,0x83d6a1,0x719fe0,0xb96b4d];
  for(let i=0;i<58;i++){const start=new THREE.Vector3(-5+fieldRand()*10,-4+fieldRand()*8,-3.5+fieldRand()*7),end=start.clone().add(new THREE.Vector3((fieldRand()-.5)*3.2,(fieldRand()-.5)*2.8,(fieldRand()-.5)*1.8)),mid=start.clone().lerp(end,.5).add(new THREE.Vector3((fieldRand()-.5)*.8,(fieldRand()-.5)*.8,(fieldRand()-.5)*.5)),curve=new THREE.CatmullRomCurve3([start,mid,end]),color=fieldPalette[Math.floor(fieldRand()*fieldPalette.length)];world.add(new THREE.Mesh(new THREE.TubeGeometry(curve,18,.0018+fieldRand()*.002,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.10+fieldRand()*.14,depthWrite:false})));if(i%2===0){const at=curve.getPoint(.48),tip=at.clone().add(new THREE.Vector3((fieldRand()-.5)*1.5,(fieldRand()-.5)*1.5,(fieldRand()-.5)*.8)),fork=new THREE.CatmullRomCurve3([at,at.clone().lerp(tip,.5).add(new THREE.Vector3(0,.05,.03)),tip]);world.add(new THREE.Mesh(new THREE.TubeGeometry(fork,12,.0016,3,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.12,depthWrite:false})))}}
  for(const id of IDS){
    const color=COLORS[id],pos=new THREE.Vector3(...POS[id]).multiplyScalar(1.62);
    const group=new THREE.Group();group.position.copy(pos);group.userData={id,kind:'domain'};
    // The colony centre is an open hyphal junction, never a solid cell/planet.
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
    const label=makeLabel(LABELS[id]?.title||id, color, 17);label.position.set(0,-1.42,0);label.scale.set(2.8,.66,1);label.userData={id,kind:'domain-label'};group.add(label);
    // Invisible selection volume remains generous for touch, while visible geometry stays filamentary.
    const hit=new THREE.Mesh(new THREE.SphereGeometry(1.12,16,12),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.userData={id,kind:'domain'};group.add(hit);
    world.add(group);cells.set(id,{group,soma,label,hit,position:pos,color});
    const domainButton=document.createElement('button');domainButton.type='button';domainButton.className='webgl-hit-target webgl-domain-target';domainButton.setAttribute('aria-label',(LABELS[id]?.title||id)+' — '+t('domain'));domainButton.title=LABELS[id]?.title||id;domainButton.dataset.domainId=id;domainButton.style.width='116px';domainButton.style.height='116px';domainButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();stage?.focus({preventScroll:true});if(!selected)enterDomain(id)});stage.append(domainButton);domainHitTargets.set(id,{object:hit,button:domainButton});
    pickables.push(soma,hit,label);
    const branches=14,branchTips=[],branchCurves=[];
    for(let j=0;j<branches;j++){
      const seed=IDS.indexOf(id)+1,a=j/branches*Math.PI*2+seed*.31+Math.sin(j*2.37+seed)*.19+Math.cos(j*1.61-seed)*.11;
      const reach=1.0+(j%4)*.24;
      const start=new THREE.Vector3(Math.cos(a)*.10,Math.sin(a)*.09,Math.sin(a*1.7)*.035);
      const end=new THREE.Vector3(Math.cos(a)*reach,Math.sin(a)*reach*.76,Math.sin(a*1.7)*.34);
      branchTips.push(end.clone());
      const mid=start.clone().lerp(end,.52).add(new THREE.Vector3(Math.cos(a+1)*.18,Math.sin(a+1)*.16,.13));
      const curve=new THREE.CatmullRomCurve3([start,mid,end]);branchCurves.push(curve);
      const thickness=.0065+(j%3)*.0014;
      const neurite=new THREE.Mesh(new THREE.TubeGeometry(curve,28,thickness,5,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.28,transparent:true,opacity:.76,roughness:.7}));
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
    // Anastomoses: neighboring hyphae reconnect into a mesh instead of isolated radial spokes.
    // Mid-branch bridges create a true reticulum, not a starburst joined only at its tips.
    for(let j=0;j<12;j++){
      const A=branchCurves[j%branches].getPoint(.48+(j%3)*.08),B=branchCurves[(j*5+3)%branches].getPoint(.52+((j+1)%3)*.07);
      const mid=A.clone().lerp(B,.5).add(new THREE.Vector3(Math.sin(j*1.7)*.12,Math.cos(j*1.3)*.12,(j%2?-.10:.10)));
      const bridge=new THREE.CatmullRomCurve3([A,mid,B]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(bridge,20,.0032,4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.18,transparent:true,opacity:.38,depthWrite:false,roughness:.9})));
    }
    for(let j=0;j<8;j++){
      const A=branchTips[(j*2)%branches],B=branchTips[(j*2+3)%branches];
      const mid=A.clone().lerp(B,.5).multiplyScalar(.91).add(new THREE.Vector3(0,.035,(j%2?-.08:.08)));
      const bridge=new THREE.CatmullRomCurve3([A.clone(),mid,B.clone()]);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(bridge,24,.0028,4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.16,transparent:true,opacity:.30,depthWrite:false,roughness:.9})));
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
function panCameraByPixels(dx,dy) {
  if(!camera||!stage||!target)return;
  camera.updateMatrixWorld(true);
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
  const height=Math.max(1,stage.clientHeight);
  const worldPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))/height;
  target.addScaledVector(right,-dx*worldPerPixel);
  target.addScaledVector(up,dy*worldPerPixel);
  cameraPosition();
}
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
    target=from.clone().lerp(end,e);distance=fromDist+(distTo-fromDist)*e;zoomTargetDistance=distance;
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
function visibleResourceLabelDepth() {
 // Hysteresis prevents labels flickering when pinch/scroll settles on a zoom boundary.
 const thresholds=[6.6,5.5,4.5],margin=.14;
 while(activeResourceLabelDepth<3&&distance<=thresholds[activeResourceLabelDepth]-margin)activeResourceLabelDepth++;
 while(activeResourceLabelDepth>0&&distance>thresholds[activeResourceLabelDepth-1]+margin)activeResourceLabelDepth--;
 return activeResourceLabelDepth;
}
function makeResourceLabel(item,color,depth=0) {
 const size=depth===0?20:depth===1?18:16,label=makeLabel(item.title,color,size);label.material.opacity=0;
 const scale=depth===0?3.35:depth===1?2.9:2.5;
 label.scale.set(scale,depth===0?.86:depth===1?.76:.68,1);
 label.userData={...item,kind:'resource-label'};label.visible=depth===visibleResourceLabelDepth();addResourceHitTarget(label);return label;
}
function addResourceHitTarget(label) {
 const data=label.userData||{},hasChildren=!!data.children?.length;
 const element=document.createElement(hasChildren?'button':'a');
 if(hasChildren){element.type='button';element.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();stage?.focus({preventScroll:true});window.__BALABS_3D_E2E_CLICKS=(window.__BALABS_3D_E2E_CLICKS||0)+1;window.__BALABS_3D_LAST_OPEN__={title:data.title||data.name||'',source:'resource-label',resolved:!!data.sourceItem,hasPosition:!!data.position,hasChildren:!!data.children?.length};try{openResource(data);window.__BALABS_3D_LAST_OPEN_ERROR__=null}catch(error){window.__BALABS_3D_LAST_OPEN_ERROR__={message:error?.message||String(error),stack:error?.stack||''}}});}
 else {element.href=data.url||'#';element.target='_blank';element.rel='noopener noreferrer';element.addEventListener('click',e=>{if(!data.url)e.preventDefault();});}
 element.className='webgl-hit-target webgl-resource-target';
 element.textContent=data.title||data.name||'Ouvrir';
 const compact=window.innerWidth<760;
 const width=Math.min(compact?184:230,Math.max(compact?120:140,String(element.textContent).length*(compact?5.7:6.2)+24));
 Object.assign(element.style,{display:'-webkit-box',WebkitBoxOrient:'vertical',WebkitLineClamp:'4',boxSizing:'border-box',opacity:'1',visibility:'visible',color:'#f4f5ed',background:'transparent',border:'0',borderRadius:'0',boxShadow:'none',textDecoration:'none',font:'650 '+(compact?'11px':'12px')+'/1.18 system-ui,sans-serif',textAlign:'center',whiteSpace:'normal',overflow:'hidden',textOverflow:'ellipsis',textShadow:'0 1px 3px #07110f,0 2px 8px #07110f,1px 0 3px #07110f,-1px 0 3px #07110f,0 0 12px #07110f',WebkitTextStroke:'1.15px #111b1d',paintOrder:'stroke fill',letterSpacing:'.01em',padding:'2px 4px',width:width+'px',height:'auto',minHeight:'40px',maxHeight:'58px',minWidth:compact?'112px':'130px',maxWidth:compact?'184px':'230px',pointerEvents:'auto',touchAction:'manipulation',transform:'translate(-50%,-50%)',cursor:'pointer'});
 element.setAttribute('aria-label',(data.title||data.name||'Branche')+(hasChildren?' — ouvrir le dossier':' — ouvrir la page'));
 element.title=data.title||data.name||'';
 element.dataset.hasChildren=String(hasChildren);element.dataset.depth=String(data.depth||0);element.dataset.resourceUrl=data.url||'';
 stage.append(element);resourceHitTargets.set(label,element);
}
function labelLeaderSegmentHitsRect(a,b,r) {
 const dx=b.x-a.x,dy=b.y-a.y;let t0=0,t1=1;
 for(const [p,q] of [[-dx,a.x-r.l],[dx,r.r-a.x],[-dy,a.y-r.t],[dy,r.b-a.y]]){
  if(Math.abs(p)<1e-6){if(q<0)return false;continue;}
  const t=q/p;if(p<0){if(t>t1)return false;t0=Math.max(t0,t);}else{if(t<t0)return false;t1=Math.min(t1,t);}
 }
 return t0<=t1;
}
function labelLeaderSegmentsCross(a,b,c,d) {
 const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
 return ab1*ab2<0&&cd1*cd2<0;
}
function syncResourceHitTargets() {
 if(!renderer||!camera||!stage)return;
 if(!_hitWorld)_hitWorld=new THREE.Vector3();
 camera.updateMatrixWorld(true);world?.updateMatrixWorld(true);
 const rect=renderer.domElement.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
 let leaderLayer=stage.querySelector('.webgl-label-leaders');
 if(!leaderLayer){leaderLayer=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderLayer.classList.add('webgl-label-leaders');Object.assign(leaderLayer.style,{position:'absolute',inset:'0',width:'100%',height:'100%',overflow:'visible',pointerEvents:'none',zIndex:'11000'});stage.prepend(leaderLayer);}
 leaderLayer.setAttribute('width',String(stageRect.width));leaderLayer.setAttribute('height',String(stageRect.height));leaderLayer.replaceChildren();
 const projected=[];
 const project=(object,button)=>{
  object.getWorldPosition(_hitWorld);const p=_hitWorld.clone().project(camera);
  const depth=Number(button.dataset.depth||0),visible=depth===visibleResourceLabelDepth()&&p.z>-1&&p.z<1&&p.x>=-1.12&&p.x<=1.12&&p.y>=-1.12&&p.y<=1.12;
  button.hidden=!visible;button.style.display=visible?'-webkit-box':'none';
  if(!visible)return;
  projected.push({object,button,p,x:rect.left+(p.x+1)*rect.width/2-stageRect.left,y:rect.top+(1-p.y)*rect.height/2-stageRect.top,depth});
 };
 for(const {object,button} of domainHitTargets.values()){if(!opened||!!selected){button.hidden=true;button.style.display='none';continue;}project(object,button)}
 for(const [label,button] of resourceHitTargets)project(label,button);
 // Place labels in screen space, not directly on top of one another. This is
 // especially important on narrow mobile screens where projected branches cluster.
 projected.sort((a,b)=>Number(b.button.dataset.hasChildren==='true')-Number(a.button.dataset.hasChildren==='true')||a.p.z-b.p.z);
 const occupied=[],leaderSegments=[];
 const obstacles=[...ROOT.querySelectorAll('.webgl-controls,.webgl-status,.webgl-path,.webgl-focus,.webgl-intro,.webgl-branch-dock')]
  .filter(el=>!el.hidden&&getComputedStyle(el).display!=='none')
  .map(el=>{const r=el.getBoundingClientRect();return {l:r.left-stageRect.left,t:r.top-stageRect.top,r:r.right-stageRect.left,b:r.bottom-stageRect.top}});
 const overlaps=(a,b)=>a.l<b.r+8&&a.r>b.l-8&&a.t<b.b+8&&a.b>b.t-8;
 const offsets=[[0,0]];for(let ring=1;ring<=6;ring++){const steps=ring*16;for(let step=0;step<steps;step++){const angle=step/steps*Math.PI*2;offsets.push([Math.cos(angle)*ring,Math.sin(angle)*ring]);}}
 for(const item of projected){
  const {button}=item,columns=stageRect.width<380?2:3,slotWidth=stageRect.width/columns;button.style.maxWidth=Math.max(128,slotWidth-12)+'px';button.style.width=Math.min(button.offsetWidth||150,slotWidth-12)+'px';const w=button.offsetWidth||150,h=button.offsetHeight||50;
  const sx=Math.max(w/2+6,Math.min(stageRect.width-w/2-6,item.x)),sy=Math.max(h/2+6,Math.min(stageRect.height-h/2-6,item.y));
  const stepX=w/2+20,stepY=h/2+22;
  let chosen=null;
  for(const [ox,oy] of offsets){
   const cx=Math.max(w/2+6,Math.min(stageRect.width-w/2-6,sx+ox*stepX));
   const cy=Math.max(h/2+6,Math.min(stageRect.height-h/2-6,sy+oy*stepY));
   const box={l:cx-w/2,t:cy-h/2,r:cx+w/2,b:cy+h/2};
   if(!occupied.some(r=>overlaps(box,r))&&!obstacles.some(r=>overlaps(box,r))){chosen={cx,cy,box};break}
  }
  if(!chosen){
   // Keep the label anchored near its own projected branch. If the viewport is
   // genuinely saturated, prefer the least-overlapping nearby position rather
   // than moving every label into a detached screen-space index.
   const candidates=offsets.map(([ox,oy])=>{
    const cx=Math.max(w/2+6,Math.min(stageRect.width-w/2-6,sx+ox*stepX));
    const cy=Math.max(h/2+6,Math.min(stageRect.height-h/2-6,sy+oy*stepY));
    const box={l:cx-w/2,t:cy-h/2,r:cx+w/2,b:cy+h/2};
    const conflicts=occupied.filter(r=>overlaps(box,r)).length+obstacles.filter(r=>overlaps(box,r)).length;
    return{cx,cy,box,conflicts,displacement:Math.hypot(cx-sx,cy-sy)};
   }).sort((a,b)=>a.conflicts-b.conflicts||a.displacement-b.displacement);
   // Never discard a branch label solely because the viewport is crowded.
   // Use the least-conflicting nearby slot; slight overlap is preferable to a missing destination.
   chosen=candidates[0]||{cx:sx,cy:sy,box:{l:sx-w/2,t:sy-h/2,r:sx+w/2,b:sy+h/2}};
   button.dataset.labelCrowded=String((chosen.conflicts||0)>0);
  }
  occupied.push(chosen.box);
  const endX=Math.max(chosen.box.l,Math.min(chosen.box.r,item.x)),endY=Math.max(chosen.box.t,Math.min(chosen.box.b,item.y)),leaderLength=Math.hypot(endX-item.x,endY-item.y);
  if(leaderLength>26){
   const start={x:item.x,y:item.y},end={x:endX,y:endY},otherLabels=occupied.slice(0,-1);
   const routes=[[start,{x:end.x,y:start.y},end],[start,{x:start.x,y:end.y},end],[start,{x:(start.x+end.x)/2,y:start.y},{x:(start.x+end.x)/2,y:end.y},end]];
   const routeScore=points=>{
    let score=0;
    for(let i=0;i<points.length-1;i++){
     const a=points[i],b=points[i+1];
     for(const r of [...otherLabels,...obstacles])if(labelLeaderSegmentHitsRect(a,b,r))score+=12;
     for(const [c,d] of leaderSegments)if(labelLeaderSegmentsCross(a,b,c,d))score+=5;
    }
    return score;
   };
   const route=routes.map(points=>({points,score:routeScore(points),length:points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0)})).sort((a,b)=>a.score-b.score||a.length-b.length)[0].points;
   for(let i=0;i<route.length-1;i++)leaderSegments.push([route[i],route[i+1]]);
   const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',route.map(p=>p.x+','+p.y).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#B96B4D');line.setAttribute('stroke-width','1.15');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');line.setAttribute('opacity','.76');line.setAttribute('vector-effect','non-scaling-stroke');leaderLayer.append(line);
   const anchor=document.createElementNS('http://www.w3.org/2000/svg','circle');anchor.setAttribute('cx',String(item.x));anchor.setAttribute('cy',String(item.y));anchor.setAttribute('r','2');anchor.setAttribute('fill','#D1D0C5');anchor.setAttribute('opacity','.9');leaderLayer.append(anchor);
  }
  button.style.setProperty('z-index',String(12000+Math.round((1-item.p.z)*100)),'important');
  button.style.left=chosen.cx+'px';button.style.top=chosen.cy+'px';
 }
}
function renderBranchDock() {
  // Spatial branch labels are the only visible navigator; keep the legacy dock inert.
  if(!branchDock)return;branchDock.replaceChildren();branchDock.hidden=true;
}
function renderPath() {
  if(!nav)return;nav.replaceChildren();renderBranchDock();
  const crumbs=[{title:t('overview'),action:goOverview}];
  if(selected)crumbs.push({title:LABELS[selected]?.title||selected,action:()=>{navigationStack=[];currentNode=manifest?.domains?.find(d=>d.id===selected)||null;currentAnchor=cells.get(selected).position.clone();buildResources(selected);smoothCamera(currentAnchor,7.5,650)}});
  navigationStack.slice(1).forEach((entry,index)=>crumbs.push({title:entry.node.title,action:()=>navigateToStack(index+1)}));
  if(currentNode&&currentNode!==manifest?.domains?.find(d=>d.id===selected))crumbs.push({title:currentNode.title});
  crumbs.forEach((crumb,index)=>{if(index){const sep=document.createElement('span');sep.className='sep';sep.textContent='›';sep.setAttribute('aria-hidden','true');nav.append(sep)}const b=document.createElement('button');b.type='button';b.textContent=crumb.title;if(index===crumbs.length-1){b.className='current';b.setAttribute('aria-current','page');b.title='Niveau actif : '+crumb.title}else{b.setAttribute('aria-label','Revenir à '+crumb.title);b.addEventListener('click',crumb.action)}nav.append(b)});
  const depthMarker=document.createElement('span');depthMarker.className='webgl-depth-marker';depthMarker.textContent='N'+(navigationStack.length+1);depthMarker.setAttribute('aria-label','Niveau '+(navigationStack.length+1));nav.append(depthMarker);
  const back=stage?.querySelector('.webgl-controls [data-camera="back"]');if(back){back.setAttribute('aria-label',navigationStack.length?'Revenir au niveau précédent : '+(navigationStack[navigationStack.length-1]?.node?.title||t('domain')):'Quitter le domaine et revenir à la vue d’ensemble');back.title=back.getAttribute('aria-label')}
}
function navigateToStack(index) {
  const entry=navigationStack[index];if(!entry)return;
  navigationStack=navigationStack.slice(0,index);currentNode=entry.node;currentAnchor=entry.anchor.clone();
  buildResources(selected,currentNode,currentAnchor);smoothCamera(currentAnchor,6.2,650);
}
function buildResources(id,parentNode=null,anchor=null) {
 activeResourceLabelDepth=0;
 clearResources();const domain=manifest?.domains?.find(d=>d.id===id);
 if(!domain){
   // The eighth public universe is reserved in the 3D taxonomy, but its Notion page
   // cannot be linked until the workspace permits creating it. Never fabricate a URL.
   if(id==='learn'&&!parentNode){currentNode={id:'learn',title:'RESSOURCES & TRANSMISSION',children:[]};currentAnchor=(anchor||cells.get(id)?.position||new THREE.Vector3()).clone();renderPath();status.textContent='RESSOURCES & TRANSMISSION · DOWNLOADING';}
   return;
 }
 currentNode=parentNode||domain;currentAnchor=(anchor||cells.get(id).position).clone();const children=currentNode.children||[];renderPath();if(!children.length){status.textContent=(currentNode.title||domain.title).toUpperCase();return}
 const baseColor=new THREE.Color(COLORS[id]),accent=new THREE.Color(0xb96b4d);
 const filament=(pts,color,radius,opacity)=>{const curve=new THREE.CatmullRomCurve3(pts),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,18,radius,4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.18,transparent:true,opacity,roughness:.65}));world.add(mesh);resourceObjects.push(mesh);return curve};
 const maxDepth=3; // Keep preview hierarchy depth aligned with the public language manifests.
 const drawNode=(item,pos,depth,parent,angle,index)=>{const has=!!item.children?.length,color=baseColor.clone().lerp(accent,depth===0?.08:depth===1?.23:.36).lerp(new THREE.Color(0xd1d0c5),depth>=2?.10:0),radius=depth===0?(has?.135:.105):depth===1?(has?.085:.065):.043;item.position=pos.clone();item.parentNode=parent;const displayTitle=[item.title,item.name,item.label,item.id].map(value=>String(value??'').trim()).find(Boolean)||('Branche '+(index+1));const data={kind:'resource',...item,title:displayTitle,sourceItem:item,sourceId:id,position:pos.clone(),hasChildren:has,depth,parentNode:parent,denseRoot:depth===0&&children.length>16};const hitRadius=depth===0?.32:depth===1?.25:.19;const hit=new THREE.Mesh(new THREE.SphereGeometry(hitRadius,10,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.copy(pos);hit.userData=data;world.add(hit);resourceObjects.push(hit);pickables.push(hit);
 // Represent each folder/page as a living hyphal junction: fine branching strands, no bead-like node.
 const junction=new THREE.Group();junction.position.copy(pos);junction.userData=data;world.add(junction);resourceObjects.push(junction);
 for(let arm=0;arm<5;arm++){const a=arm/5*Math.PI*2+depth*.37+index*.19,reach=radius*(2.3+(arm%3)*.55),start=new THREE.Vector3(0,0,0),end=new THREE.Vector3(Math.cos(a)*reach,Math.sin(a)*reach*.82,Math.sin(a*1.7)*reach*.5),mid=start.clone().lerp(end,.56).add(new THREE.Vector3(0,.018,.018));const curveArm=new THREE.CatmullRomCurve3([start,mid,end]);const filamentArm=new THREE.Mesh(new THREE.TubeGeometry(curveArm,10,Math.max(.0025,radius*.055),4,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:depth===0?.3:.22,transparent:true,opacity:depth===0?.78:depth===1?.64:.52,roughness:.78}));junction.add(filamentArm);}const l=makeResourceLabel(data,color,depth);l.position.copy(pos).add(new THREE.Vector3(0,depth===0?-.28:depth===1?-.22:-.16,.025));world.add(l);resourceObjects.push(l);pickables.push(l);const pp=parent===currentNode?currentAnchor:(parent.position||currentAnchor),mid=pp.clone().lerp(pos,.52).add(new THREE.Vector3(0,.12+depth*.035,.12)),curve=filament([pp.clone(),mid,pos.clone()],color,depth===0?.012:depth===1?.007:.004,depth===0?.7:depth===1?.58:.48);item.parentFilamentCurve=curve;if(depth<2)for(let f=0;f<2;f++){const at=curve.getPoint(.46+f*.2),sgn=f===0?-1:1,tip=at.clone().add(new THREE.Vector3(Math.cos(angle+sgn*.8)*(.24-depth*.045),Math.sin(angle+sgn*.8)*(.2-depth*.04),.045));filament([at,at.clone().lerp(tip,.55).add(new THREE.Vector3(0,.045,.025)),tip],color,.0035-depth*.0006,.28)}if(depth>=maxDepth||!has)return;const kids=item.children||[],spread=Math.min(1.2,.32+kids.length*.105);kids.forEach((child,childIndex)=>{const frac=kids.length===1?0:(childIndex/(kids.length-1)-.5),childAngle=angle+frac*spread*2+(childIndex%2?-.08:.08),radialTier=kids.length>4?Math.floor(childIndex/2):0,baseDist=depth===0?2.05+Math.min(.7,kids.length*.065):Math.max(1.55,Math.min(2.15,1.4+kids.length*.065)),dist=baseDist+Math.min(.56,radialTier*.14),childPos=pos.clone().add(new THREE.Vector3(Math.cos(childAngle)*dist,Math.sin(childAngle)*dist*.82+((childIndex%3)-1)*.035,.04+(childIndex%2)*.035));drawNode(child,childPos,depth+1,item,childAngle,childIndex)});
 // Anastomoses: lateral hyphae form a sparse, non-redundant mesh between sibling branches.
 if(kids.length>1){
   const bridgeColor=color.clone().lerp(accent,.22);
   // Adjacent branches get one bridge each; no cyclic duplicate for two-node groups.
   for(let i=0;i<kids.length-1;i++){
     const curveA=kids[i].parentFilamentCurve,curveB=kids[i+1].parentFilamentCurve;if(!curveA||!curveB)continue;
     const A=curveA.getPoint(.62),B=curveB.getPoint(.62),delta=B.clone().sub(A),normal=new THREE.Vector3(-delta.y,delta.x,0).normalize(),side=i%2?1:-1;
     const p1=A.clone().lerp(B,.3).addScaledVector(normal,.19*side).add(new THREE.Vector3(0,0,.075));
     const p2=A.clone().lerp(B,.72).addScaledVector(normal,-.14*side).add(new THREE.Vector3(0,0,.11));
     filament([A.clone(),p1,p2,B.clone()],bridgeColor,.0032,.24);
   }
   // Skip-one links create lateral cross-connections without turning the group into a cage.
   if(kids.length>=4){
     for(let i=0;i+2<kids.length;i+=2){
       const curveA=kids[i].parentFilamentCurve,curveC=kids[i+2].parentFilamentCurve;if(!curveA||!curveC)continue;
       const A=curveA.getPoint(.68),C=curveC.getPoint(.68),delta=C.clone().sub(A),normal=new THREE.Vector3(-delta.y,delta.x,0).normalize(),side=i%4===0?1:-1;
       const mid=A.clone().lerp(C,.5).addScaledVector(normal,.2*side).add(new THREE.Vector3(0,0,.16+(i%3)*.025));
       filament([A.clone(),mid,C.clone()],bridgeColor,.0025,.18);
     }
   }
 }
};
 if(children.length>16){const golden=Math.PI*(3-Math.sqrt(5)),mobile=window.innerWidth<760,outer=mobile?3.55:4.35;children.forEach((item,k)=>{const ang=-Math.PI/2+k*golden,rad=1.35+outer*Math.sqrt((k+.5)/children.length),p=currentAnchor.clone().add(new THREE.Vector3(Math.cos(ang)*rad,Math.sin(ang)*rad,.18*Math.sin(k*1.7)));drawNode(item,p,0,currentNode,ang,k)});}else{children.forEach((item,k)=>{const ang=k/Math.max(1,children.length)*Math.PI*2-Math.PI/2+(k%2)*.11,rad=2.15+(k%3)*.16,p=currentAnchor.clone().add(new THREE.Vector3(Math.cos(ang)*rad,Math.sin(ang)*rad*.78,Math.sin(ang*1.6)*.34));drawNode(item,p,0,currentNode,ang,k)});}
 status.textContent=(currentNode.title||domain.title).toUpperCase()+' · '+children.length+' '+t('children').toUpperCase();status.hidden=!!selected;
}
// Resolve raw Notion nodes to their positioned 3D counterparts before camera navigation.
function openResource(item) {
 let data=item?.userData||item;
 const raw=data,source=data?.sourceItem||data,spatial=resourceObjects.find(object=>object.userData?.kind==='resource'&&(object.userData.sourceItem===source||object.userData===source))?.userData;
 if(spatial)data=spatial;
 const before={title:currentNode?.title||null,depth:navigationStack.length,children:currentNode?.children?.length||0};
 if(data.children?.length){
  const previousNode=currentNode,previousAnchor=currentAnchor?.clone()||new THREE.Vector3();
  navigationStack.push({node:previousNode,anchor:previousAnchor});
  let parent=data.parentNode;const ancestors=[];
  while(parent&&parent!==previousNode){ancestors.unshift(parent);parent=parent.parentNode}
  if(parent===previousNode){for(const ancestor of ancestors)navigationStack.push({node:ancestor,anchor:ancestor.position.clone()})}
  currentNode=data;currentAnchor=data.position.clone();renderPath();
  const trace={rawTitle:raw?.title||raw?.name||null,resolved:!!spatial,parentMatches:parent===previousNode,before,after:{title:currentNode?.title||null,depth:navigationStack.length,children:currentNode?.children?.length||0},position:!!currentAnchor,error:null};
  window.__BALABS_3D_NAV_TRACE__=trace;
  smoothCamera(currentAnchor,6.1,720,()=>{try{buildResources(selected,data,currentAnchor);trace.afterBuild={title:currentNode?.title||null,depth:navigationStack.length,children:currentNode?.children?.length||0}}catch(error){trace.error={message:error?.message||String(error),stack:error?.stack||''};window.__BALABS_3D_LAST_OPEN_ERROR__=trace.error}});
  return;
 }
 if(data.url){window.open(data.url,'_blank','noopener');return}
 status.textContent=data.title||'';
}
function showDomainPanel(id,message='') {if(message)status.textContent=message;renderPath()}
function resourceOverviewDistance(rootCount) {
  const mobile=window.innerWidth<760;
  const radius=rootCount>16
    ?1.35+(mobile?3.55:4.35)*Math.sqrt((rootCount-.5)/rootCount)
    :2.47;
  const vertical=THREE.MathUtils.degToRad(camera.fov*.5);
  const horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
  const limitingHalfAngle=Math.max(.08,Math.min(vertical,horizontal));
  return Math.max(7.5,radius/Math.tan(limitingHalfAngle)*1.12);
}
function enterDomain(id) {
  if(!cells.has(id))return;selected=id;if(status)status.hidden=true;selectedBranch=null;opened=true;navigationStack=[];currentNode=manifest?.domains?.find(d=>d.id===id)||null;currentAnchor=cells.get(id).position.clone();
  intro.hidden=true;nav.hidden=false;ROOT.classList.remove('universe-closed');ROOT.classList.add('universe-open');panel.hidden=true;panel.replaceChildren();
  if(typeof window.enterSphere==='function')window.enterSphere(id,false,true); // Populate the hidden legacy content source only; the old engine no longer owns #mainView events.
  const rootCount=manifest?.domains?.find(d=>d.id===id)?.children?.length||0;const initialDistance=resourceOverviewDistance(rootCount);smoothCamera(cells.get(id).position,initialDistance,900,()=>buildResources(id));
}
function goBackLevel() {
  if(navigationStack.length){const previous=navigationStack.pop();currentNode=previous.node;currentAnchor=previous.anchor.clone();smoothCamera(currentAnchor,6.2,650,()=>buildResources(selected,currentNode,currentAnchor));return}
  if(selected)goOverview();
}
function goOverview() {
  selected=null;selectedBranch=null;navigationStack=[];currentNode=null;currentAnchor=null;if(status)status.hidden=false;clearResources();nav?.replaceChildren();nav.hidden=true;if(branchDock){branchDock.replaceChildren();branchDock.hidden=true}panel.hidden=true;panel.replaceChildren();
  const mini=document.getElementById('miniView');if(mini){mini.hidden=true;mini.classList.remove('spatial-source-only')}
  const homeButton=document.getElementById('homeBtn');if(homeButton)homeButton.hidden=true;
  smoothCamera(new THREE.Vector3(0,0,0),19.5,850,()=>{status.textContent='BALABS / LIVING NETWORK'});
}
function showFailure(error) {
  console.error('BA Labs clean 3D engine failed',error);
  ROOT.classList.remove('webgl-ready','universe-open','universe-closed');ROOT.classList.add('webgl-load-error');ROOT.querySelectorAll('.network,.galaxy,.hub,.sphere').forEach(el=>el.style.display='none');
  const p=document.createElement('div');p.className='webgl-load-error-panel';p.style.cssText='min-height:380px;display:grid;place-items:center;padding:30px;text-align:center;color:#e8eee8;background:#172321;border-radius:18px';
  const inner=document.createElement('div');const title=document.createElement('strong');title.textContent=LANG()==='fr'?'Le réseau 3D ne peut pas démarrer':'The 3D network could not start';const retry=document.createElement('button');retry.textContent='↻';retry.addEventListener('click',()=>location.reload());inner.append(title,document.createElement('br'),retry);p.append(inner);ROOT.append(p);
}

function setupUI() {
  stage=document.createElement('div');stage.className='webgl-stage';stage.tabIndex=0;stage.setAttribute('role','application');stage.setAttribute('aria-label','BA Labs interactive biological network');
   stage.addEventListener('click',e=>{if(e.target.closest?.('.webgl-hit-target'))stage.focus({preventScroll:true})},true);
  hint=document.createElement('div');hint.className='webgl-hint';hint.textContent=t('hint');
  status=document.createElement('div');status.className='webgl-status';status.textContent='BALABS / LIVING NETWORK';window.__BALABS_3D_STATUS=status;
  panel=document.createElement('section');panel.className='webgl-focus';panel.hidden=true;panel.setAttribute('aria-live','polite');
  nav=document.createElement('nav');nav.className='webgl-path';nav.setAttribute('aria-label','Navigation dans les dossiers');nav.hidden=true;
  const controls=document.createElement('div');controls.className='webgl-controls';controls.innerHTML='<button type="button" data-camera="back" aria-label="Niveau précédent">‹</button><button type="button" data-camera="out" aria-label="Zoom arrière">−</button><button type="button" data-camera="in" aria-label="Zoom avant">+</button><button type="button" data-camera="reset" aria-label="Recentrer">⌖</button>';
  intro=document.createElement('button');intro.type='button';intro.className='webgl-intro';intro.innerHTML='<span class="webgl-intro-card"><span class="webgl-intro-orb"><b>BA</b></span><span class="webgl-intro-copy">BALABS · APPLIED BIOTECHNOLOGY</span><span class="webgl-intro-cta">'+t('open')+'</span></span>';
  intro.addEventListener('click',()=>{opened=true;intro.hidden=true;nav.hidden=false;ROOT.classList.remove('universe-closed');ROOT.classList.add('universe-open');status.textContent='BALABS / LIVING NETWORK'});
  controls.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.camera;if(action==='back'){goBackLevel();return}if(action==='in')zoomTargetDistance=Math.max(1.25,zoomTargetDistance*.86);if(action==='out')zoomTargetDistance=Math.min(60,zoomTargetDistance*1.16);if(action==='reset'){goOverview();return}cameraPosition()});
  stage.append(hint,status,controls,nav,panel,intro);ROOT.append(stage);
  branchDock=document.createElement('nav');branchDock.className='webgl-branch-dock';branchDock.setAttribute('aria-label','Branches et sous-branches');branchDock.hidden=true;ROOT.append(branchDock);
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
    else if(key==='+'||key==='=')zoomTargetDistance=Math.max(1.25,zoomTargetDistance*.86);
    else if(key==='-'||key==='_')zoomTargetDistance=Math.min(60,zoomTargetDistance*1.16);
    else if(key==='Escape'||key==='Backspace'){if(selected)goBackLevel();return}
    else if(key==='Home'){goOverview();return}
    cameraPosition();
  });
  stage.addEventListener('wheel',e=>{if(e.target.closest('.webgl-controls,.webgl-focus'))return;e.preventDefault();zoomTargetDistance=THREE.MathUtils.clamp(zoomTargetDistance*Math.exp(e.deltaY*.0016),1.25,60);},{passive:false});
  // Pointer input belongs to the stage so mouse, pen and touch-generated
  // pointer events follow the same path. Keep the document-level pointer-up
  // capture as a safety net for browsers that retarget capture during a drag.
  stage.addEventListener('pointerdown',onPointerDown);
  stage.addEventListener('pointermove',onPointerMove);
  stage.addEventListener('pointerup',onPointerUp);
  // Pointer-up is handled once on the stage; a capture-phase document listener
  // previously consumed the pointer before the stage could perform hit-testing.
  stage.addEventListener('pointercancel',onPointerCancel);
  // Direct stage touch fallback for mobile browsers that omit pointer events.
  let touchFallback=null;
  const rememberTouch=e=>{if(e.touches.length===1){const p=e.touches[0];touchFallback={x:p.clientX,y:p.clientY,at:performance.now()}}};
  const finishTouch=e=>{if(e.target.closest?.('.webgl-hit-target,.webgl-branch-dock')){touchFallback=null;return}if(!touchFallback)return;const p=e.changedTouches[0],start=touchFallback;touchFallback=null;if(!p||Math.hypot(p.clientX-start.x,p.clientY-start.y)>12)return;if(performance.now()-lastPickAt>120)pickAt(p.clientX,p.clientY)};
  // Spatial pointer selection is handled exclusively by the WebGL canvas ray-pick.
  stage.addEventListener('touchstart',rememberTouch,{passive:true});
  stage.addEventListener('touchend',finishTouch,{passive:true});
  stage.addEventListener('touchcancel',()=>{touchFallback=null},{passive:true});

  // Mobile Chromium can retarget a tap to a legacy transparent hit button
  // attached outside the stage. Such an event never bubbles through stage,
  // so resolve that pointer-up at document capture using the same projected
  // screen coordinates as canvas picking.
  document.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'||stage.contains(e.target)||!e.target.closest?.('.webgl-hit-target'))return;if(transition||performance.now()-lastPickAt<=120)return;pickAt(e.clientX,e.clientY)},true);
  document.addEventListener('click',e=>{if(performance.now()-lastBranchTouchActivationAt<800){e.preventDefault();e.stopImmediatePropagation();return;}if(!e.detail||dragGesture||!renderer)return;if(e.target.closest?.('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target,.webgl-branch-dock'))return;const r=renderer.domElement.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;if(performance.now()-lastPickAt>120)pickAt(e.clientX,e.clientY)},true);
  stage.addEventListener('lostpointercapture',onLostCapture);
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('resize',resize);
}
function onPointerDown(e) {
  if(e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro,.webgl-hit-target,.webgl-branch-dock'))return;
  stage?.focus({preventScroll:true});
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  stage.setPointerCapture?.(e.pointerId);
  if(pointers.size>=2){
    const p=[...pointers.values()];
    pinchStart=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    pinchCenter={x:p.reduce((sum,v)=>sum+v.x,0)/p.length,y:p.reduce((sum,v)=>sum+v.y,0)/p.length};
    dragging=true;moved=true;dragGesture=true;lastPointer=null;return;
  }
  dragging=true;moved=false;dragGesture=false;lastPointer={x:e.clientX,y:e.clientY};
}
function onPointerMove(e) {
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){
    const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    const center={x:p.reduce((sum,v)=>sum+v.x,0)/p.length,y:p.reduce((sum,v)=>sum+v.y,0)/p.length};
    if(pinchCenter){
      const dx=center.x-pinchCenter.x,dy=center.y-pinchCenter.y;
      if(Math.hypot(dx,dy)>0)panCameraByPixels(dx,dy);
    }
    if(pinchStart)zoomTargetDistance=THREE.MathUtils.clamp(zoomTargetDistance*Math.exp((pinchStart-d)*.006),1.25,60);
    pinchStart=d;pinchCenter=center;moved=true;dragGesture=true;return;
  }
  if(!dragging||!lastPointer)return;
  const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;
  if(Math.hypot(dx,dy)>7){moved=true;dragGesture=true}
  if(dragGesture){theta-=dx*.0045;phi=THREE.MathUtils.clamp(phi+dy*.0045,.35,2.78);cameraPosition()}
  lastPointer={x:e.clientX,y:e.clientY};
}
function onPointerUp(e) {
  const wasPointer=pointers.has(e.pointerId);pointers.delete(e.pointerId);
  if(pointers.size<2){pinchStart=0;pinchCenter=null}
  if(!wasPointer)return;
  if(pointers.size){
    moved=true;dragging=true;
    const remaining=[...pointers.values()][0];lastPointer={x:remaining.x,y:remaining.y};
    return;
  }
  dragging=false;
  if(!moved&&!transition&&performance.now()-lastPickAt>120&&!e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro'))pickAt(e.clientX,e.clientY);
  lastPointer=null;
}function onPointerCancel(){pointers.clear();dragging=false;moved=true;pinchStart=0;pinchCenter=null;lastPointer=null}
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
  const activeDepth=visibleResourceLabelDepth();
  const labels=resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible&&!resourceHitTargets.get(o)?.hidden&&(o.userData.depth||0)===activeDepth);
  let nearestLabel=null,nearestLabelDistance=Infinity;
  for(const label of labels){const p=screenPoint(label);if(p.d<nearestLabelDistance){nearestLabel=label;nearestLabelDistance=p.d}}
  if(nearestLabel&&nearestLabelDistance<(window.innerWidth<760?58:70)){
    if(window.__BALABS_3D_E2E__)window.__BALABS_3D_LAST_PICK__={title:nearestLabel.userData.title,kind:nearestLabel.userData.kind,children:nearestLabel.userData.children?.length||0,distance:nearestLabelDistance};
    openResource(nearestLabel.userData);return;
  }
  let nearestNode=null,nearestNodeDistance=Infinity;
  for(const node of resourceObjects.filter(o=>o.userData?.kind==='resource'&&o.userData.depth===activeDepth)){
    const p=screenPoint(node);if(p.d<nearestNodeDistance){nearestNode=node;nearestNodeDistance=p.d}
  }
  if(nearestNode&&nearestNodeDistance<(window.innerWidth<760?48:56)){openResource(nearestNode.userData);return}
}

// Labels breathe with camera zoom: prominent at the overview, quieter inside the network.
// A small minimum keeps branch names readable on phones and at deep navigation levels.
function labelTargetPixels(label) {
  const compact=window.innerWidth<760;
  const depth=label?.userData?.depth||0;
  const base=label?.userData?.kind==='domain-label'?(compact?42:50):label?.userData?.denseRoot?(compact?38:44):Math.max(compact?34:40,(compact?44:50)-depth*2);
   // Keep type size stable through zoom; add a restrained 12% emphasis at close range.
  const zoomScale=THREE.MathUtils.clamp(1+Math.max(0,(13.5-distance)/13.5)*.12,1,1.12);
  return base*zoomScale;
}
function syncLabelScales() {
  if(!renderer||!camera)return;
  if(!labelWorldPosition)labelWorldPosition=new THREE.Vector3();
  const viewportHeight=Math.max(1,renderer.domElement.clientHeight);
  const projection=2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))/viewportHeight;
  const apply=label=>{
    if(!label?.userData?.kind?.endsWith('label'))return;
    if(label.userData.kind==='resource-label')label.visible=(label.userData.depth||0)===visibleResourceLabelDepth();
    label.getWorldPosition(labelWorldPosition);
    const cameraDistance=Math.max(.1,camera.position.distanceTo(labelWorldPosition));
    const targetPixels=labelTargetPixels(label);
    const worldHeight=cameraDistance*projection*targetPixels;
    label.scale.set(worldHeight*4.25,worldHeight,1);
  };
  for(const item of cells.values()){if(item.label)item.label.visible=!selected;apply(item.label);}
  for(const item of resourceObjects)if(item.userData?.kind==='resource-label')apply(item);
}


function animate(now=0) {
  raf=requestAnimationFrame(animate);
  const dt=Math.min(.05,(now-lastFrame)/1000||0);lastFrame=now;
  if(!transition){const blend=1-Math.exp(-dt*13);const nextDistance=distance+(zoomTargetDistance-distance)*blend;if(Math.abs(nextDistance-distance)>.0001){distance=nextDistance;cameraPosition()}else distance=zoomTargetDistance;}
  if(world){
    // Keep domain anchors world-stable; only cells pulse, so pointer targets never drift.
    for(const item of signalPoints){const p=item.curve.getPoint((now*.000075+item.offset)%1);item.pulse.position.copy(p)}
    for(const [id,item] of cells){const phase=now*.0006+IDS.indexOf(id)*.7;const pulse=1+Math.sin(phase)*.012;item.soma.scale.set((id==='soil'?.62:.56)*pulse,(id==='lab'?.48:id==='myco'?.66:.61)*pulse,(id==='myco'?.66:.55)*pulse);item.group.rotation.y=Math.sin(phase*.6)*.018}
  }
  syncLabelScales();
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
    stage.prepend(renderer.domElement);renderer.domElement.setAttribute('tabindex','0');renderer.domElement.setAttribute('role','application');renderer.domElement.setAttribute('aria-label','BA Labs 3D network. Use arrow keys to rotate, plus and minus to zoom, Escape to go back, and Home for overview.');
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(46,1,.1,180);raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();target=new THREE.Vector3();
    createWorld();resize();cameraInitialized=true;
    const loadManifest=()=>fetch('./notion-tree.'+LANG()+'.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.version===1&&Array.isArray(data.domains)){manifest=data;if(selected&&!transition)buildResources(selected,currentNode,currentAnchor)}}).catch(()=>{});loadManifest();new MutationObserver(()=>{hint.textContent=t('hint');loadManifest()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    window.__BALABS_3D_E2E__=()=>{
      const rect=renderer.domElement.getBoundingClientRect();
      const project=obj=>{const p=obj.getWorldPosition(new THREE.Vector3()).project(camera);return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,z:p.z,title:obj.userData.title||obj.userData.id,hasChildren:!!obj.userData.hasChildren,depth:obj.userData.depth??0,url:obj.userData.url||null}};
      const inside=p=>p.z>-1&&p.z<1&&p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom;
      const branches=resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible)
        .map(project)
        .filter(p=>p&&p.z>-1&&p.z<1&&p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom);
      const center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
      const targetBranch=branches.sort((a,b)=>Number(b.hasChildren)-Number(a.hasChildren)||Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y))[0]||null;
      const domain=cells.get('bio'),domainTarget=domain?project(domain.hit):null;
      const domainLabelPixels=domain?labelTargetPixels(domain.label):0;
      return{count:resourceObjects.filter(o=>o.userData?.kind==='resource-label').length,visible:branches.length,nestedAvailable:resourceObjects.some(o=>o.userData?.kind==='resource'&&o.userData.depth===0&&o.userData.children?.length),visibleDepths:[...new Set(resourceObjects.filter(o=>o.userData?.kind==='resource').map(o=>o.userData.depth??0))].sort(),visibleLabelDepths:[...new Set(resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible).map(o=>o.userData.depth??0))].sort(),visibleLabelCount:resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible).length,visibleLabelCountsByDepth:Object.fromEntries([0,1,2,3].map(depth=>[depth,resourceObjects.filter(o=>o.userData?.kind==='resource-label'&&o.visible&&(o.userData.depth??0)===depth).length])),resourceHitTargetStates:[...resourceHitTargets.entries()].map(([label,button])=>({title:label.userData?.title||'',depth:label.userData?.depth??0,hasChildren:button.dataset.hasChildren==='true',visible:!button.hidden&&button.style.display!=='none',width:button.offsetWidth,height:button.offsetHeight})),target:targetBranch,domainTarget:domainTarget&&inside(domainTarget)?domainTarget:null,lastPick:window.__BALABS_3D_LAST_PICK__||null,lastOpen:window.__BALABS_3D_LAST_OPEN__||null,lastOpenError:window.__BALABS_3D_LAST_OPEN_ERROR__||null,navTrace:window.__BALABS_3D_NAV_TRACE__||null,miniHidden:!!document.getElementById('miniView')?.hidden,transitioning:!!transition,selected,currentTitle:currentNode?.title||null,depth:navigationStack.length,childCount:currentNode?.children?.length||0,clickCount:window.__BALABS_3D_E2E_CLICKS||0,cameraDistance:distance,labelPixels:{domain:domainLabelPixels},cameraTarget:{x:target.x,y:target.y,z:target.z},pointerDowns:window.__BALABS_3D_POINTERDOWN||0,pointerUps:window.__BALABS_3D_POINTERUP||0,pickCalls:window.__BALABS_3D_PICK_CALLS||0};
    };
    animate();
  } catch(error){showFailure(error)}
}
init();