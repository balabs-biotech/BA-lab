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
const LINKS = [['bio','myco'],['myco','soil'],['soil','lab'],['lab','iot'],['lab','products'],['products','work'],['work','iot'],['products','learn']];
const LABELS = Object.fromEntries([...document.querySelectorAll('.sphere[data-sphere]')].map(el => [el.dataset.sphere, {
  title:el.querySelector('b')?.textContent || el.dataset.sphere,
  sub:el.querySelector('small')?.textContent || '',
}]));
const LANG = () => (document.documentElement.lang || 'fr').toLowerCase().split('-')[0];
const COPY = {
  fr:{hint:'FAITES GLISSER POUR TOURNER · PINCEZ POUR ZOOMER · TOUCHEZ UNE CELLULE',open:'ENTRER DANS LE RÉSEAU',home:'Vue d’ensemble',zoomIn:'Zoom avant',zoomOut:'Zoom arrière',reset:'Recentrer',domain:'DOMAINE',resource:'BRANCHE DU RÉSEAU',openPage:'Ouvrir la page Notion ↗',back:'← Retour au domaine',related:'CONNEXIONS',empty:'Aucune branche publique trouvée pour ce domaine.',loading:'Chargement du réseau…'},
  en:{hint:'DRAG TO ROTATE · PINCH TO ZOOM · TAP A CELL',open:'ENTER THE NETWORK',home:'Overview',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Recenter',domain:'DOMAIN',resource:'NETWORK BRANCH',openPage:'Open Notion page ↗',back:'← Back to domain',related:'CONNECTIONS',empty:'No public branches found for this domain.',loading:'Loading network…'},
  ar:{hint:'اسحب للتدوير · اقرص للتكبير · المس خلية',open:'ادخل إلى الشبكة',home:'نظرة عامة',zoomIn:'تكبير',zoomOut:'تصغير',reset:'إعادة التمركز',domain:'المجال',resource:'فرع الشبكة',openPage:'فتح صفحة Notion ↗',back:'→ العودة إلى المجال',related:'الروابط',empty:'لا توجد فروع عامة لهذا المجال.',loading:'جارٍ تحميل الشبكة…'},
  pt:{hint:'ARRASTE PARA RODAR · PINÇA PARA AMPLIAR · TOQUE NUMA CÉLULA',open:'ENTRAR NA REDE',home:'Visão geral',zoomIn:'Aproximar',zoomOut:'Afastar',reset:'Recentralizar',domain:'DOMÍNIO',resource:'RAMO DA REDE',openPage:'Abrir página Notion ↗',back:'← Voltar ao domínio',related:'LIGAÇÕES',empty:'Não foram encontrados ramos públicos.',loading:'A carregar a rede…'},
};
const t = key => (COPY[LANG()] || COPY.fr)[key] || COPY.fr[key];

let THREE, renderer, scene, camera, raycaster, pointer, stage, panel, hint, intro;
let world, cells = new Map(), pickables = [], resourceObjects = [], edges = [], signalPoints = [];
let selected = null, selectedBranch = null, manifest = null, transition = null;
let distance = 13.5, theta = .22, phi = 1.27, target = null, targetGoal = null;
let opened = false, raf = 0, lastFrame = 0, dragging = false, moved = false, dragGesture = false;
let lastPointer = null, pointers = new Map(), pinchStart = 0, pinchDistance = 0, hoverId = null;
let canvasRect = null, cameraInitialized = false;

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #mainView.webgl-ready{display:block!important;position:relative;height:clamp(620px,68vw,820px);min-height:620px;padding:0;overflow:hidden;isolation:isolate;background:radial-gradient(ellipse at 48% 45%,#293b39 0%,#1a2829 48%,#111a1d 100%)}
    @media(max-width:760px){#mainView.webgl-ready{height:640px;min-height:640px}}
    #mainView.webgl-ready>.hub,#mainView.webgl-ready>.sphere,#mainView.webgl-ready>.network,#mainView.webgl-ready>.galaxy{display:none!important}
    #mainView .webgl-stage{position:absolute;inset:0;z-index:4;min-height:100%;touch-action:none;overflow:hidden}
    #mainView .webgl-stage canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}
    #mainView .webgl-stage .webgl-hint{position:absolute;left:16px;bottom:14px;z-index:8;padding:9px 12px;border:1px solid #78958a66;border-radius:999px;background:#142321d9;color:#e5e9df;font:600 9px/1.4 system-ui;letter-spacing:.08em;pointer-events:none;backdrop-filter:blur(12px)}
    #mainView .webgl-stage .webgl-status{position:absolute;right:16px;bottom:17px;z-index:8;color:#c2cfc5;font:600 9px system-ui;letter-spacing:.12em;pointer-events:none}
    #mainView .webgl-controls{position:absolute;right:14px;top:14px;z-index:12;display:flex;gap:6px}
    #mainView .webgl-controls button{width:38px;height:38px;border:1px solid #7b948766;border-radius:12px;background:#172724e8;color:#e5e9df;font:500 21px/1 system-ui;cursor:pointer;backdrop-filter:blur(12px)}
    #mainView .webgl-controls button:hover{background:#344a42;border-color:#b6c8b7}
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
    #mainView .webgl-intro{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 45%,#263b38c9 0%,#142120a8 62%,#111a1ddd 100%);cursor:pointer}
    #mainView .webgl-intro[hidden]{display:none!important}
    #mainView .webgl-intro-card{display:flex;flex-direction:column;align-items:center;gap:15px;text-align:center;padding:24px;max-width:340px}
    #mainView .webgl-intro-orb{width:116px;height:116px;border:1px solid #91aa9a;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#a2b9a044,#293f3a88 60%,#121d1c);box-shadow:inset -16px -12px 28px #07100e88,0 0 0 10px #b96b4d0c,0 0 45px #9db7a333}
    #mainView .webgl-intro-orb b{font:700 33px system-ui;letter-spacing:-.1em;color:#e1e7dc}
    #mainView .webgl-intro-copy{color:#d6ded6;font:600 10px system-ui;letter-spacing:.17em}
    #mainView .webgl-intro-cta{border:1px solid #9eb7a2;border-radius:999px;padding:12px 17px;color:#f1f2e9;background:#21342edb;font:700 10px system-ui;letter-spacing:.1em}
    #mainView .webgl-stage.is-transitioning{cursor:progress}
    @media(max-width:600px){#mainView .webgl-hint{left:9px;bottom:10px;max-width:calc(100% - 130px);font-size:7px;letter-spacing:.02em}#mainView .webgl-status{right:9px;bottom:12px;font-size:7px}#mainView .webgl-focus{left:9px;top:9px;padding:13px;width:min(270px,calc(100% - 78px))}#mainView .webgl-controls{right:9px;top:9px;gap:4px}#mainView .webgl-controls button{width:34px;height:34px}}
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
    const lobe=Math.sin(x*2.8+seed)*Math.sin(y*3.3-seed)*.065;
    const scale=1+wave*.055+lobe;
    position.setXYZ(i,x*scale,y*scale,z*scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeLabel(text, color, size=16) {
  const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
  canvas.width=1024; canvas.height=256;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='600 '+size+'px Inter,system-ui,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='#07110f';ctx.shadowBlur=15;ctx.fillStyle='#f0f2e9';
  const words=String(text).split(/\s+/);let lines=[],line='';
  for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>930&&line){lines.push(line);line=word}else line=next}
  if(line)lines.push(line);
  const shown=lines.slice(0,2),lineHeight=48,start=128-(shown.length-1)*lineHeight/2;
  shown.forEach((part,i)=>ctx.fillText(part,512,start+i*lineHeight));
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
  const bg=new THREE.BufferGeometry(), bgPoints=[];
  for(let i=0;i<520;i++){const r=18+Math.random()*30,a=Math.random()*Math.PI*2,b=(Math.random()-.5)*Math.PI;bgPoints.push(Math.cos(a)*Math.cos(b)*r,Math.sin(b)*r*.65,Math.sin(a)*Math.cos(b)*r)}
  bg.setAttribute('position',new THREE.Float32BufferAttribute(bgPoints,3));
  const dust=new THREE.Points(bg,new THREE.PointsMaterial({color:0xa9b8aa,size:.035,transparent:true,opacity:.32,depthWrite:false}));world.add(dust);
  for(const id of IDS){
    const color=COLORS[id],pos=new THREE.Vector3(...POS[id]);
    const group=new THREE.Group();group.position.copy(pos);group.userData={id,kind:'domain'};
    const soma=new THREE.Mesh(makeCellGeometry(id),new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.08,emissive:color,emissiveIntensity:.21}));
    soma.scale.set(id==='soil'?1.05:.91,id==='lab'?.78:1,id==='myco'?1.08:.9);
    soma.userData={id,kind:'domain'};group.add(soma);
    const glow=new THREE.Mesh(new THREE.SphereGeometry(1.12,24,18),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.055,side:THREE.BackSide,depthWrite:false}));
    glow.scale.copy(soma.scale);group.add(glow);
    const label=makeLabel(LABELS[id]?.title||id, color, 19);label.position.set(0,-1.28,0);label.scale.set(3.1,.65,1);label.userData={id,kind:'domain-label'};group.add(label);
    const hit=new THREE.Mesh(new THREE.SphereGeometry(1.3,16,12),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.userData={id,kind:'domain'};group.add(hit);
    world.add(group);cells.set(id,{group,soma,label,hit,position:pos,color});
    pickables.push(soma,hit,label);
    for(let j=0;j<7;j++){
      const a=j/7*Math.PI*2+IDS.indexOf(id)*.31;
      const start=new THREE.Vector3(Math.cos(a)*.65,Math.sin(a)*.62,0);
      const end=new THREE.Vector3(Math.cos(a)*(.98+Math.random()*.3),Math.sin(a)*(.88+Math.random()*.25),Math.sin(a*1.7)*.25);
      const mid=start.clone().lerp(end,.56).add(new THREE.Vector3(Math.cos(a+1)*.18,Math.sin(a+1)*.18,.12));
      const curve=new THREE.CatmullRomCurve3([start,mid,end]);
      const neurite=new THREE.Mesh(new THREE.TubeGeometry(curve,14,.018,5,false),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35,transparent:true,opacity:.8}));
      neurite.userData={id,kind:'neurite'};group.add(neurite);
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color}));tip.position.copy(end);group.add(tip);
    }
  }
  LINKS.forEach(([a,b],index)=>{
    const A=cells.get(a).position,B=cells.get(b).position;
    const bend=new THREE.Vector3((A.x+B.x)/2+(index%2?-.3:.3),(A.y+B.y)/2+(index%3-.8)*.28,(A.z+B.z)/2+.45);
    const curve=new THREE.CatmullRomCurve3([A.clone(),bend,B.clone()]);
    const line=new THREE.Mesh(new THREE.TubeGeometry(curve,52,.014,5,false),new THREE.MeshBasicMaterial({color:0x8cae9b,transparent:true,opacity:.37}));
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
  for(const item of resourceObjects){world.remove(item);item.traverse?.(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else mDispose(o.material)}});if(item.geometry)item.geometry.dispose();if(item.material)mDispose(item.material)}
  resourceObjects=[];pickables=pickables.filter(o=>o.userData?.kind!=='resource'&&o.userData?.kind!=='resource-label');
  selectedBranch=null;
}
function mDispose(material){material?.map?.dispose();material?.dispose?.()}

function flattenTree(node,parent,depth,path,out) {
  (node.children||[]).forEach(child=>{
    const next=[...path,child.title];
    out.push({...child,parentId:parent,depth,path:next.join(' / ')});
    flattenTree(child,child.id,depth+1,next,out);
  });
}
function makeResourceLabel(item,color) {
  const label=makeLabel(item.title,color,item.depth===1?16:13);
  label.scale.set(item.depth===1?2.4:2,.52,1);
  label.userData={kind:'resource-label',...item};
  return label;
}
function buildResources(id) {
  clearResources();
  const domain=manifest?.domains?.find(d=>d.id===id);
  if(!domain){showDomainPanel(id);return}
  const flat=[];flattenTree(domain,domain.id,0,[domain.title],flat);
  if(!flat.length){showDomainPanel(id,t('empty'));return}
  const root=cells.get(id).position;
  const childrenByParent=new Map();
  flat.forEach(item=>{const list=childrenByParent.get(item.parentId)||[];list.push(item);childrenByParent.set(item.parentId,list)});
  const positions=new Map([[domain.id,root.clone()]]);
  const visit=(parentId,level,baseAngle,spread)=>{
    const list=childrenByParent.get(parentId)||[];
    list.forEach((item,index)=>{
      const angle=baseAngle-spread/2+(index+.5)*spread/Math.max(1,list.length);
      const ring=Math.floor(index/11),slot=index%11;
      const radius=level===1?2.55+ring*.95:level===2?1.75:1.35;
      const parent=positions.get(parentId)||root;
      const pos=parent.clone().add(new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius*.76,Math.sin(angle*1.8+level)*.28));
      positions.set(item.id,pos);
      const col=new THREE.Color(COLORS[id]).lerp(new THREE.Color(0xb96b4d),Math.min(.28,(level-1)*.12));
      const radiusNode=level===1?.16:level===2?.12:.09;
      const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(radiusNode,1),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.55,roughness:.38}));
      mesh.position.copy(pos);mesh.userData={kind:'resource',...item,sourceId:id};world.add(mesh);resourceObjects.push(mesh);pickables.push(mesh);
      const hit=new THREE.Mesh(new THREE.SphereGeometry(.46,12,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
      hit.position.copy(pos);hit.userData={kind:'resource',...item,sourceId:id};world.add(hit);resourceObjects.push(hit);pickables.push(hit);
      const label=makeResourceLabel({...item,sourceId:id},col);label.position.copy(pos).add(new THREE.Vector3(0,-.35,.02));world.add(label);resourceObjects.push(label);pickables.push(label);
      const parentPos=parent.clone(),curve=new THREE.QuadraticBezierCurve3(parentPos,parentPos.clone().lerp(pos,.5).add(new THREE.Vector3(0,0,.15)),pos.clone());
      const branch=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.009,4,false),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.52}));
      world.add(branch);resourceObjects.push(branch);
      if(level<3)visit(item.id,level+1,angle,Math.min(Math.PI*.95,spread/Math.max(1,list.length)*1.5));
    });
  };
  visit(domain.id,1,-Math.PI/2,Math.PI*2);
  showDomainPanel(id);
}

function openResource(item) {
  selectedBranch=item;
  panel.hidden=false;panel.classList.add('has-world');panel.replaceChildren();
  const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';kicker.textContent=t('resource');
  const title=document.createElement('strong');title.textContent=item.title;
  const path=document.createElement('small');path.textContent=item.path||item.title;
  const desc=document.createElement('small');desc.textContent=item.description||'';
  const actions=document.createElement('div');actions.className='webgl-focus-actions';
  const open=document.createElement('a');open.dataset.resourceOpen='true';open.href=item.url;open.target='_blank';open.rel='noopener noreferrer';open.dataset.resourceOpen='true';open.textContent=t('openPage');
  const back=document.createElement('button');back.type='button';back.dataset.resourceClear='true';back.textContent=t('back');back.addEventListener('click',()=>showDomainPanel(selected));
  actions.append(open,back);panel.append(kicker,title,path);if(item.description)panel.append(desc);panel.append(actions);
}
function showDomainPanel(id,message='') {
  const meta=LABELS[id]||{title:id,sub:''};panel.hidden=false;panel.classList.add('has-world');panel.replaceChildren();
  const kicker=document.createElement('span');kicker.className='webgl-focus-kicker';kicker.textContent=t('domain');
  const title=document.createElement('strong');title.textContent=meta.title;
  const desc=document.createElement('small');desc.textContent=message||meta.sub;
  const actions=document.createElement('div');actions.className='webgl-focus-actions';
  const home=document.createElement('button');home.type='button';home.dataset.resourceClear='true';home.textContent=t('home');home.addEventListener('click',goOverview);actions.append(home);
  panel.append(kicker,title,desc);
  const related=LINKS.filter(([a,b])=>a===id||b===id).map(([a,b])=>a===id?b:a);
  if(related.length){const sub=document.createElement('span');sub.className='webgl-focus-kicker';sub.style.marginTop='14px';sub.textContent=t('related');panel.append(sub);
    related.forEach(other=>{const btn=document.createElement('button');btn.type='button';btn.className='webgl-focus-link';btn.dataset.world=other;btn.innerHTML='<span></span><b>↗</b>';btn.querySelector('span').textContent=LABELS[other]?.title||other;btn.addEventListener('click',()=>enterDomain(other));panel.append(btn)})}
  panel.append(actions);
}
function enterDomain(id) {
  if(!cells.has(id))return;
  selected=id;selectedBranch=null;opened=true;intro.hidden=true;ROOT.classList.remove('universe-closed');ROOT.classList.add('universe-open');
  panel.hidden=true;panel.replaceChildren();
  if(typeof window.enterSphere==='function')window.enterSphere(id,false,true);
  const pos=cells.get(id).position;
  smoothCamera(pos,7.5,900,()=>{buildResources(id);status.textContent=(LABELS[id]?.title||id).toUpperCase()+' · BA LABS'});
}
function goOverview() {
  selected=null;selectedBranch=null;clearResources();panel.hidden=true;panel.replaceChildren();
  if(typeof document.getElementById('homeBtn')?.click==='function')document.getElementById('homeBtn').click();
  else {const mini=document.getElementById('miniView');mini?.classList.remove('spatial-source-only');if(mini)mini.hidden=true}
  smoothCamera(new THREE.Vector3(0,0,0),13.5,850,()=>{status.textContent='BALABS / LIVING NETWORK'});
}
function showFailure(error) {
  console.error('BA Labs clean 3D engine failed',error);
  ROOT.classList.remove('webgl-ready','universe-open','universe-closed');ROOT.classList.add('webgl-load-error');
  const p=document.createElement('div');p.className='webgl-load-error-panel';p.style.cssText='min-height:380px;display:grid;place-items:center;padding:30px;text-align:center;color:#e8eee8;background:#172321;border-radius:18px';
  const inner=document.createElement('div');const title=document.createElement('strong');title.textContent=LANG()==='fr'?'Le réseau 3D ne peut pas démarrer':'The 3D network could not start';const retry=document.createElement('button');retry.textContent='↻';retry.addEventListener('click',()=>location.reload());inner.append(title,document.createElement('br'),retry);p.append(inner);ROOT.append(p);
}

function setupUI() {
  stage=document.createElement('div');stage.className='webgl-stage';stage.tabIndex=0;stage.setAttribute('role','application');stage.setAttribute('aria-label','BA Labs interactive biological network');
  hint=document.createElement('div');hint.className='webgl-hint';hint.textContent=t('hint');
  const status=document.createElement('div');status.className='webgl-status';status.textContent='BALABS / LIVING NETWORK';window.__BALABS_3D_STATUS=status;
  panel=document.createElement('section');panel.className='webgl-focus';panel.hidden=true;panel.setAttribute('aria-live','polite');
  const controls=document.createElement('div');controls.className='webgl-controls';controls.innerHTML='<button type="button" data-camera="out" aria-label="Zoom arrière">−</button><button type="button" data-camera="in" aria-label="Zoom avant">+</button><button type="button" data-camera="reset" aria-label="Recentrer">⌖</button>';
  intro=document.createElement('button');intro.type='button';intro.className='webgl-intro';intro.innerHTML='<span class="webgl-intro-card"><span class="webgl-intro-orb"><b>BA</b></span><span class="webgl-intro-copy">BALABS · APPLIED BIOTECHNOLOGY</span><span class="webgl-intro-cta">'+t('open')+'</span></span>';
  intro.addEventListener('click',()=>{opened=true;intro.hidden=true;ROOT.classList.remove('universe-closed');ROOT.classList.add('universe-open');status.textContent='BALABS / LIVING NETWORK'});
  controls.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.camera;if(action==='in')distance=Math.max(3.5,distance*.82);if(action==='out'){if(selected){goOverview();return}distance=Math.min(42,distance*1.2)}if(action==='reset'){goOverview();return}cameraPosition()});
  stage.append(hint,status,controls,panel,intro);ROOT.append(stage);
  document.getElementById('homeBtn')?.addEventListener('click',()=>{if(selected)goOverview()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selected)goOverview()});
  stage.addEventListener('wheel',e=>{if(e.target.closest('.webgl-controls,.webgl-focus'))return;e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.012,3.5,42);cameraPosition()},{passive:false});
  stage.addEventListener('pointerdown',onPointerDown);
  stage.addEventListener('pointermove',onPointerMove);
  document.addEventListener('pointerup',onPointerUp,true);
  stage.addEventListener('pointercancel',onPointerCancel);
  stage.addEventListener('lostpointercapture',onLostCapture);
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('resize',resize);
}
function onPointerDown(e) {
  if(e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro'))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture?.(e.pointerId);
  if(pointers.size===2){const p=[...pointers.values()];pinchStart=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);dragging=true;moved=true;return}
  dragging=true;moved=false;dragGesture=false;lastPointer={x:e.clientX,y:e.clientY};
}
function onPointerMove(e) {
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinchStart)distance=THREE.MathUtils.clamp(distance-(d-pinchStart)*.035,3.5,42);pinchStart=d;moved=true;cameraPosition();return}
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
  if(!moved&&!transition&&!e.target.closest('.webgl-controls,.webgl-focus,.webgl-intro'))pickAt(e.clientX,e.clientY);
  lastPointer=null;
}
function onPointerCancel(){pointers.clear();dragging=false;moved=true;pinchStart=0;lastPointer=null}
function onLostCapture(e){if(pointers.has(e.pointerId)){pointers.delete(e.pointerId);if(!pointers.size){dragging=false;lastPointer=null}}}
function pickAt(x,y) {
  const rect=renderer.domElement.getBoundingClientRect();pointer.x=((x-rect.left)/rect.width)*2-1;pointer.y=-((y-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(pickables,false);
  const hit=hits.find(h=>['resource','resource-label','domain','domain-label'].includes(h.object.userData?.kind));
  if(!hit)return;
  const data=hit.object.userData;
  if(data.kind==='resource'||data.kind==='resource-label'){openResource(data);return}
  if(data.kind==='domain'||data.kind==='domain-label')enterDomain(data.id);
}

function animate(now=0) {
  raf=requestAnimationFrame(animate);
  const dt=Math.min(.05,(now-lastFrame)/1000||0);lastFrame=now;
  if(world){
    // Keep domain anchors world-stable; only cells pulse, so pointer targets never drift.
    for(const item of signalPoints){const p=item.curve.getPoint((now*.000075+item.offset)%1);item.pulse.position.copy(p)}
    for(const [id,item] of cells){const phase=now*.0006+IDS.indexOf(id)*.7;item.soma.scale.setScalar(.98+Math.sin(phase)*.018);item.group.rotation.y=Math.sin(phase*.6)*.035}
  }
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
    const loadManifest=()=>fetch('./notion-tree.'+LANG()+'.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.version===1&&Array.isArray(data.domains)){manifest=data;if(selected&&!transition)buildResources(selected)}}).catch(()=>{});loadManifest();new MutationObserver(()=>{hint.textContent=t('hint');loadManifest()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    window.__BALABS_3D_E2E__=()=>{
      const rect=renderer.domElement.getBoundingClientRect();
      const project=obj=>{const p=obj.getWorldPosition(new THREE.Vector3()).project(camera);return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2,z:p.z,title:obj.userData.title||obj.userData.id}};
      const inside=p=>p.z>-1&&p.z<1&&p.x>=rect.left&&p.x<=rect.right&&p.y>=rect.top&&p.y<=rect.bottom;
      const branches=resourceObjects.filter(o=>o.userData?.kind==='resource-label').map(project).filter(inside);
      const center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
      const targetBranch=branches.sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y))[0]||null;
      const domain=cells.get('bio'),domainTarget=domain?project(domain.hit):null;
      return{count:resourceObjects.filter(o=>o.userData?.kind==='resource-label').length,visible:branches.length,target:targetBranch,domainTarget:domainTarget&&inside(domainTarget)?domainTarget:null,miniHidden:!!document.getElementById('miniView')?.hidden,transitioning:!!transition,selected,clickCount:window.__BALABS_3D_E2E_CLICKS||0};
    };
    animate();
  } catch(error){showFailure(error)}
}
init();
