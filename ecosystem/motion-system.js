/* BA Labs motion system — Vanta + GLSL gradient + Anime.js
   Progressive enhancement: the editorial site and Vernpixi explorer work without WebGL/CDNs. */
(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  const lowPower = /Android|iPhone|iPad/i.test(navigator.userAgent) && (navigator.hardwareConcurrency || 4) <= 4;
  const canWebGL = (() => { try { const c=document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (_) { return false; } })();

  const loadScript = (src) => new Promise((resolve,reject) => {
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){ if(existing.dataset.loaded==='1') resolve(); else { existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); } return; }
    const s=document.createElement('script'); s.src=src; s.async=true;
    s.onload=()=>{s.dataset.loaded='1';resolve();}; s.onerror=reject; document.head.appendChild(s);
  });

  // Vanta is deliberately limited to the hero: no competing full-page WebGL scenes.
  const hero=document.querySelector('#accueil');
  if(hero && canWebGL && !reduce && !saveData && !lowPower){
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js')
      .then(()=>loadScript('https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.cells.min.js'))
      .then(()=>{
        if(!window.VANTA?.CELLS || !hero.isConnected || hero.dataset.vantaReady) return;
        hero.dataset.vantaReady='1';
        window.__balabsVanta=window.VANTA.CELLS({
          el:hero, THREE:window.THREE, mouseControls:true, touchControls:false, gyroControls:false,
          minHeight:260, minWidth:260, scale:1, scaleMobile:1,
          color:0x79a991, color2:0xb96b4d, backgroundColor:0x111b1d,
          size:1.05, speed:0.32
        });
      }).catch(()=>{ /* CSS/image hero remains the fallback. */ });
  }

  // Lightweight fragment-shader gradient for the Field Atlas, independent from Vanta.
  const atlas=document.querySelector('.field-atlas');
  if(atlas && canWebGL && !reduce && !saveData && !lowPower){
    const canvas=document.createElement('canvas'); canvas.className='balabs-shader-gradient';
    canvas.setAttribute('aria-hidden','true'); atlas.prepend(canvas);
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true});
    if(gl){
      const vertex='attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}';
      const fragment='precision mediump float; uniform vec2 r; uniform float t;\n'+
        'float blob(vec2 p,vec2 c,float s){return exp(-dot(p-c,p-c)/s);}\n'+
        'void main(){vec2 uv=gl_FragCoord.xy/r; vec2 p=(uv-.5)*vec2(r.x/r.y,1.);'+
        'float a=blob(p,vec2(sin(t*.17)*.34,cos(t*.13)*.22),.20);'+
        'float b=blob(p,vec2(cos(t*.11)*.36,sin(t*.19)*.25),.24);'+
        'float c=blob(p,vec2(sin(t*.09+.8)*.12,cos(t*.15+.6)*.36),.18);'+
        'vec3 col=vec3(.067,.106,.114)+a*vec3(.08,.14,.11)+b*vec3(.22,.11,.07)+c*vec3(.10,.11,.09);'+
        'gl_FragColor=vec4(col,.62);}';
      const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
      try{
        const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error('shader link failed');
        gl.useProgram(program);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
        const res=gl.getUniformLocation(program,'r'),time=gl.getUniformLocation(program,'t');let raf=0,start=performance.now();
        const draw=now=>{const w=Math.max(1,atlas.clientWidth),h=Math.max(1,atlas.clientHeight),d=Math.min(devicePixelRatio||1,1.35);canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(res,canvas.width,canvas.height);gl.uniform1f(time,(now-start)/1000);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);raf=requestAnimationFrame(draw);};
        const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){if(!raf)raf=requestAnimationFrame(draw);}else if(raf){cancelAnimationFrame(raf);raf=0;}});
        observer.observe(atlas);window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);observer.disconnect();},{once:true});
      }catch(_){canvas.remove();}
    }else canvas.remove();
  }

  // Anime.js 4 choreographs the real editorial sections. The embedded explorer is deliberately untouched.
  import('https://cdn.jsdelivr.net/npm/animejs@4.1.3/+esm').then(({animate,stagger})=>{
    if(typeof animate!=='function' || reduce) return;
    const sections=[...document.querySelectorAll(
      '#accueil,.editorial-work,.editorial-feature,.editorial-about,.editorial-method,.field-atlas,.product-catalogue,.scene'
    )];
    const seen=new WeakSet();

    const enter=(section)=>{
      if(seen.has(section)) return;
      seen.add(section);

      const hero=section.matches('#accueil');
      const title=section.querySelector(hero?'h1':'.work-heading h2,.editorial-copy h2,.about-copy h2,.method-top h2,.field-atlas-head,.scenehead strong,.product-catalogue-head h2');
      const image=section.querySelector(hero?'.hero-micrograph':'.editorial-art img,.feature-photo,.field-frame img,.product-catalogue-visual-img');
      const copy=section.querySelectorAll(hero?'.hero p,.hero-actions,.aside':'.work-heading p,.editorial-copy p,.about-copy p,.method-top p,.field-frame figcaption');
      const cards=section.querySelectorAll('.work-card,.method-steps li,.value-item,.product-catalogue-card');

      if(title) animate(title,{opacity:[.72,1],translateY:[12,0],duration:1050,ease:'out(3)'});
      if(image && !image.closest('.inline-explorer')) animate(image,{
        opacity:[.72,1],clipPath:['inset(0 7% 0 0)','inset(0 0% 0 0)'],
        translateX:[hero?16:-12,0],duration:1450,ease:'out(3)'
      });
      if(copy.length) animate(copy,{
        opacity:[.65,1],translateY:[9,0],duration:900,
        delay:stagger(95,{start:140}),ease:'out(3)'
      });
      if(cards.length) animate(cards,{
        opacity:[.78,1],translateY:[14,0],scale:[.99,1],
        duration:1050,delay:stagger(105,{start:100}),ease:'out(3)'
      });
    };

    const heroSection=document.querySelector('#accueil');
    if(heroSection) enter(heroSection);
    if(!('IntersectionObserver'in window)){sections.forEach(enter);return;}
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){enter(entry.target);observer.unobserve(entry.target);}
      });
    },{threshold:.18});
    sections.filter(section=>section!==heroSection).forEach(section=>observer.observe(section));

    // Slow breathing is reserved for the documentary hero photograph, never the interface or explorer.
    const heroImage=document.querySelector('#accueil .hero-micrograph');
    if(heroImage) animate(heroImage,{scale:[1.02,1.035],duration:16000,ease:'inOutSine',alternate:true,loop:true});
  }).catch(()=>{ /* Static editorial layout remains fully visible if the animation CDN is unavailable. */ });
})();
