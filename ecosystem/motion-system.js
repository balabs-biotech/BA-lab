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

  // Organic mycelium field for the homepage hero.
  // Curved hyphae replace Vanta's geometric cells/constellation look; pointer movement
  // gently deforms the filaments instead of moving dots or drawing straight connections.
  const hero=document.querySelector('#accueil');
  if(hero){
    const canvas=document.createElement('canvas');
    canvas.className='balabs-organic-field';
    canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style,{
      position:'absolute',inset:'0',width:'100%',height:'100%',
      zIndex:'0',pointerEvents:'none',opacity:'1'
    });
    hero.prepend(canvas);
    const ctx=canvas.getContext('2d',{alpha:true});
    if(ctx){
      let width=0,height=0,dpr=1,raf=0,visible=true,lastFrame=0;
      let pointer={x:0,y:0,tx:0,ty:0,active:false};
      let paths=[];
      const rand=(seed)=>{const x=Math.sin(seed*127.1+311.7)*43758.5453;return x-Math.floor(x);};
      const buildPath=(x,y,angle,steps,length,seed,weight,colour,startNode=null)=>{
        const nodes=[startNode || {x,y,phase:rand(seed)*6.28,amp:0}];
        for(let i=1;i<=steps;i++){
          angle+=(rand(seed+i*3.1)-.5)*.72;
          const distance=length*(.68+rand(seed+i*7.7)*.58);
          x+=Math.cos(angle)*distance;y+=Math.sin(angle)*distance;
          nodes.push({x,y,phase:rand(seed+i*11.3)*6.28,amp:2.2+rand(seed+i*13.9)*2.2});
        }
        return {nodes,weight,colour,seed};
      };
      const rebuild=()=>{
        const rect=hero.getBoundingClientRect();
        width=Math.max(1,rect.width);height=Math.max(1,rect.height);
        dpr=Math.min(window.devicePixelRatio||1,1.35);
        canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
        ctx.setTransform(dpr,0,0,dpr,0,0);
        paths=[];
        const span=Math.min(width,height),step=span*.105;
        // Twenty-four inoculation fronts distributed around the perimeter.
        // Each front grows inward; lateral hyphae branch from existing nodes.
        const roots=[
          [0,.04,.04],[0,.17,-.02],[0,.32,.03],[0,.48,-.04],[0,.65,.03],[0,.82,-.02],[0,.96,.04],
          [1,.04,-.04],[1,.19,.02],[1,.35,-.03],[1,.52,.04],[1,.69,-.03],[1,.85,.02],[1,.97,-.04],
          [.08,0,.02],[.28,0,-.03],[.5,0,.03],[.72,0,-.02],[.92,0,.03],
          [.08,1,-.02],[.3,1,.03],[.52,1,-.03],[.74,1,.02],[.94,1,-.03]
        ];
        const mainRoots=[];
        roots.forEach((a,i)=>{
          const x=a[0]*width,y=a[1]*height;
          const inward=Math.atan2(height*.5-y,width*.5-x)+a[2];
          const root=buildPath(x,y,inward,7,step,131+i*29,1.05+rand(i)*.5,
            i%5===0?'copper':'green');
          paths.push(root);mainRoots.push(root);
          // Primary laterals: alternate sides and originate on the parent hypha.
          [2,4,6].forEach((at,j)=>{
            const node=root.nodes[at],prev=root.nodes[at-1],next=root.nodes[at+1];
            const tangent=Math.atan2(next.y-prev.y,next.x-prev.x);
            [-1,1].forEach((side,k)=>{
              const branch=buildPath(node.x,node.y,tangent+side*(.68+rand(i+j+k)*.32),
                4,step*(.48+rand(i+j+k+8)*.16),271+i*31+j*7+k,
                .58+rand(i+j+k+19)*.22,(i+j+k)%7===0?'copper':'green',node);
              paths.push(branch);
              // Secondary twigs also emerge from the lateral itself, never as loose strokes.
              if(j<2){
                const bn=branch.nodes[2],bp=branch.nodes[1],bnext=branch.nodes[3];
                const bt=Math.atan2(bnext.y-bp.y,bnext.x-bp.x);
                const twig=buildPath(bn.x,bn.y,bt+(k===0?1:-1)*(.82+rand(i+j+k+33)*.25),
                  2,step*.34,511+i*17+j*3+k,.34,'green',bn);
                paths.push(twig);
              }
            });
          });
        });
        // Anastomoses: join nearby nodes from distinct inoculation fronts.
        // A shared pair of endpoints makes each bridge a real topological connection.
        const candidates=[];
        for(let i=0;i<mainRoots.length;i++) for(let j=i+1;j<mainRoots.length;j++){
          for(let a=2;a<mainRoots[i].nodes.length-1;a++) for(let b=2;b<mainRoots[j].nodes.length-1;b++){
            const p=mainRoots[i].nodes[a],q=mainRoots[j].nodes[b];
            const d=Math.hypot(p.x-q.x,p.y-q.y);
            if(d>span*.025&&d<span*.30)candidates.push({p,q,d,i,j});
          }
        }
        candidates.sort((a,b)=>a.d-b.d);
        const degree=Array(mainRoots.length).fill(0),used=new Set();
        let fused=0;
        for(const link of candidates){
          const pair=link.i+':'+link.j;
          if(fused>=34||degree[link.i]>=3||degree[link.j]>=3||used.has(pair))continue;
          const dx=link.q.x-link.p.x,dy=link.q.y-link.p.y;
          const bend=(fused%2?1:-1)*Math.min(18,link.d*.12);
          const mid={x:(link.p.x+link.q.x)/2-dy/(link.d||1)*bend,
            y:(link.p.y+link.q.y)/2+dx/(link.d||1)*bend,
            phase:rand(fused+1901)*6.28,amp:1.0};
          paths.push({nodes:[link.p,mid,link.q],weight:.58,
            colour:fused%6===0?'copper':'green',seed:1900+fused});
          degree[link.i]++;degree[link.j]++;used.add(pair);fused++;
        }
      };
      const resize=new ResizeObserver(rebuild);
      resize.observe(hero);rebuild();
      const onPointer=(event)=>{
        const rect=hero.getBoundingClientRect();
        pointer.tx=event.clientX-rect.left;pointer.ty=event.clientY-rect.top;
        pointer.active=true;
      };
      const leave=()=>{pointer.active=false;};
      hero.addEventListener('pointermove',onPointer,{passive:true});
      hero.addEventListener('pointerleave',leave,{passive:true});
      hero.addEventListener('pointerdown',onPointer,{passive:true});
      const drawPath=(path,time)=>{
        const pts=path.nodes.map(n=>{
          // Shared node objects mean a daughter hypha starts at the exact moving
          // junction of its parent: no visual gaps at branch origins.
          let x=n.x+Math.sin(time*.22+n.phase)*n.amp;
          let y=n.y+Math.cos(time*.19+n.phase*.83)*n.amp;
          if(pointer.active){
            const dx=x-pointer.x,dy=y-pointer.y,dist=Math.hypot(dx,dy);
            const influence=Math.exp(-(dist*dist)/(2*175*175));
            const curl=8*influence;
            x+=(-dx/(dist||1)*18-dy/(dist||1)*curl);
            y+=(-dy/(dist||1)*18+dx/(dist||1)*curl);
          }
          return {x,y};
        });
        if(pts.length<2)return;
        // Catmull–Rom converted to cubic Béziers: the curve passes through
        // every biological junction instead of merely bending near it.
        ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
        for(let i=0;i<pts.length-1;i++){
          const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
          const c1={x:p1.x+(p2.x-p0.x)/6,y:p1.y+(p2.y-p0.y)/6};
          const c2={x:p2.x-(p3.x-p1.x)/6,y:p2.y-(p3.y-p1.y)/6};
          ctx.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,p2.x,p2.y);
        }
        const copper=path.colour==='copper';
        ctx.strokeStyle=copper?'rgba(185,107,77,.28)':'rgba(121,169,145,.30)';
        ctx.lineWidth=path.weight;ctx.lineCap='round';ctx.lineJoin='round';
        ctx.shadowColor=copper?'rgba(185,107,77,.18)':'rgba(121,169,145,.2)';
        ctx.shadowBlur=path.weight>1?8:4;ctx.stroke();ctx.shadowBlur=0;
      };
      const draw=(now)=>{
        if(!visible)return;
        if(!reduce && now-lastFrame<32){raf=requestAnimationFrame(draw);return;}
        lastFrame=now;
        pointer.x+=(pointer.tx-pointer.x)*.075;pointer.y+=(pointer.ty-pointer.y)*.075;
        ctx.clearRect(0,0,width,height);
        const time=reduce?0:now*.001;
        paths.forEach(path=>drawPath(path,time));
        if(!reduce){raf=requestAnimationFrame(draw);}
      };
      if(!reduce){
        const observer=new IntersectionObserver(entries=>{
          visible=entries[0].isIntersecting;
          if(visible&&!raf)raf=requestAnimationFrame(draw);
          else if(!visible&&raf){cancelAnimationFrame(raf);raf=0;}
        },{threshold:.01});
        observer.observe(hero);
        raf=requestAnimationFrame(draw);
        window.addEventListener('pagehide',()=>{
          cancelAnimationFrame(raf);observer.disconnect();resize.disconnect();
          hero.removeEventListener('pointermove',onPointer);
          hero.removeEventListener('pointerleave',leave);
          hero.removeEventListener('pointerdown',onPointer);
        },{once:true});
      }else{
        draw(0);
        resize.disconnect();
      }
    }else canvas.remove();
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
