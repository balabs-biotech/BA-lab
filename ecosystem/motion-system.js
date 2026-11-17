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

  // Anime.js is the single timing layer for editorial reveals; no layout-affecting loops.
  import('https://cdn.jsdelivr.net/npm/animejs@4.1.3/+esm').then(({animate,stagger})=>{
    if(!animate || reduce) return;
    const groups=['.field-atlas .field-frame','.universe-index-card','.work-card'];
    groups.forEach(selector=>{
      document.querySelectorAll(selector).forEach((el,i)=>{
        el.style.opacity='0'; el.style.transform='translateY(14px)';
        const io=new IntersectionObserver(entries=>{
          if(!entries[0].isIntersecting) return;
          io.disconnect();
          animate(el,{opacity:[0,1],translateY:[14,0],duration:720,delay:Math.min(i*55,330),ease:'out(3)'});
        },{threshold:.12});
        io.observe(el);
      });
    });
  }).catch(()=>{ /* Existing CSS transitions remain the fallback. */ });
})();
