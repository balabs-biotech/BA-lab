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
          color:0x263b38, color2:0xb96b4d, backgroundColor:0x111b1d,
          size:1.15, speed:0.55
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
        'vec3 col=vec3(.067,.106,.114)+a*vec3(.035,.13,.105)+b*vec3(.16,.065,.043)+c*vec3(.06,.10,.08);'+
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

  // Anime.js 4 is the single motion engine: editorial choreography, not generic fade-up presets.
  import('https://cdn.jsdelivr.net/npm/animejs@4.1.3/+esm').then(({animate,stagger})=>{
    if(!animate || reduce) return;
    const track=document.querySelector('#experienceTrack');
    const pages=[...(track||document).querySelectorAll('.experience-page')];
    const observeRoot=track||null;
    const armed=new WeakSet();

    const reveal=(page)=>{
      if(armed.has(page)) return;
      armed.add(page);

      const hero=page.querySelector('.hero');
      if(hero){
        const title=hero.querySelector('h1');
        const image=hero.querySelector('.hero-micrograph');
        if(title) animate(title,{opacity:[0,1],translateY:[28,0],duration:1150,ease:'out(4)'});
        if(image) animate(image,{opacity:[.45,1],duration:1500,ease:'out(3)'});
      }

      const headings=[...page.querySelectorAll('.work-heading,.universe-index-heading,.value-heading,.product-catalogue-head,.editorial-about h2,.editorial-method h2,.bridge-copy h2,.field-atlas-head')];
      headings.forEach((el,i)=>{
        el.style.opacity='0';
        animate(el,{opacity:[0,1],translateX:[i%2?-18:18,0],translateY:[10,0],duration:950,delay:i*85,ease:'out(4)'});
      });

      const media=[...page.querySelectorAll('.field-frame,.editorial-art,.work-media,.product-catalogue-card figure,.feature-photo')].filter(el=>!el.closest('.inline-explorer'));
      media.forEach(el=>{
        el.style.opacity='0';
        el.style.clipPath='inset(0 9% 0 9%)';
      });
      if(media.length) animate(media,{
        opacity:[0,1],clipPath:['inset(0 9% 0 9%)','inset(0 0% 0 0%)'],
        translateY:[14,0],duration:1250,delay:stagger(115,{start:80}),ease:'out(4)'
      });

      const cards=[...page.querySelectorAll('.work-card,.universe-index-card,.product-catalogue-card,.method-steps li,.value-item')].filter(el=>!el.closest('.inline-explorer'));
      cards.forEach(el=>{el.style.opacity='0';});
      if(cards.length) animate(cards,{
        opacity:[0,1],translateY:[24,0],scale:[.975,1],
        rotate:[-.22,0],
        duration:980,delay:stagger(78,{start:130}),ease:'out(4)'
      });

      const copy=[...page.querySelectorAll('.hero p,.work-intro,.editorial-feature p,.editorial-about p,.editorial-method p,.bridge-copy p')];
      copy.forEach((el,i)=>animate(el,{opacity:[0,1],translateY:[12,0],duration:800,delay:220+i*75,ease:'out(3)'}));
    };

    if(!('IntersectionObserver'in window)){pages.forEach(reveal);return;}
    const pageObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting && entry.intersectionRatio>=.24){
          reveal(entry.target);
          pageObserver.unobserve(entry.target);
        }
      });
    },{root:observeRoot,threshold:[.24,.42]});
    pages.forEach(page=>pageObserver.observe(page));

    // A slow, restrained breathing movement gives the hero image depth without competing with reading.
    const heroImage=document.querySelector('.hero-micrograph');
    if(heroImage) animate(heroImage,{scale:[1,1.018],duration:9500,ease:'inOutSine',alternate:true,loop:true});
  }).catch(()=>{ /* The site remains readable and usable if the animation CDN is unavailable. */ });
})();
