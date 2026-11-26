/* BA Labs CultureOps — sector-specific visual runtime.
   Removes the generic particle field and the branched "vermicelli" hero graphic.
   Motion is decorative, bounded to the hero, and never touches business data. */
(() => {
  "use strict";

  const hero = document.querySelector(".app-hero");
  const art = hero?.querySelector(".hero-art");
  if (!hero || !art || hero.dataset.visualRuntime === "sector-ready") return;
  hero.dataset.visualRuntime = "sector-ready";

  const domain = document.body.dataset.domain || "agronomy";

  // Shared BA Labs ambient mycelium: the same organic visual language as the
  // public site's hero, adapted as a light, decorative canvas for the app shell.
  function mountOrganicField(host, sector) {
    if (host.querySelector(".ba-organic-field")) return;
    const canvas = document.createElement("canvas");
    canvas.className = "ba-organic-field";
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) { canvas.remove(); return; }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const saveData = navigator.connection?.saveData === true;
    const compact = window.matchMedia?.("(max-width: 640px)")?.matches;
    const staticMode = reduced || saveData;
    const palettes = {
      mycology: ["rgba(185,107,77,.30)", "rgba(155,174,164,.25)"],
      agronomy: ["rgba(181,211,139,.28)", "rgba(155,174,164,.25)"],
      laboratory: ["rgba(120,184,232,.28)", "rgba(155,174,164,.25)"]
    };
    const palette = palettes[sector] || palettes.agronomy;
    let width = 1, height = 1, dpr = 1, paths = [], raf = 0, visible = true, lastFrame = 0;
    const random = seed => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const makePath = (start, angle, steps, distance, seed, depth, colour) => {
      const nodes = [start];
      let x = start.x, y = start.y;
      for (let i = 1; i <= steps; i++) {
        angle += (random(seed + i * 3.1) - .5) * .62;
        const span = distance * (.72 + random(seed + i * 7.7) * .48);
        x += Math.cos(angle) * span;
        y += Math.sin(angle) * span;
        nodes.push({ x, y, phase: random(seed + i * 11.3) * 6.28, amp: depth === 0 ? 1.5 : 1.1 });
      }
      return { nodes, depth, colour, seed };
    };
    const rebuild = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.25);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paths = [];
      const mainPaths = [];
      const count = compact ? 6 : 9;
      const step = Math.min(width, height) * .105;
      for (let i = 0; i < count; i++) {
        const side = i % 2;
        const band = (Math.floor(i / 2) + .5) / Math.ceil(count / 2);
        const x = side ? width : 0;
        const y = height * band;
        const root = { x, y, phase: random(i + 10) * 6.28, amp: 1.5 };
        const angle = Math.atan2(height * (.5 - band), width * (side ? -1 : 1));
        const main = makePath(root, angle, 7, step, 41 + i * 31, 0, i % 4 === 0 ? 0 : 1);
        paths.push(main);
        mainPaths.push(main);
        [2, 4].forEach((at, branchIndex) => {
          const node = main.nodes[at];
          const before = main.nodes[at - 1], after = main.nodes[at + 1];
          const tangent = Math.atan2(after.y - before.y, after.x - before.x);
          [-1, 1].forEach((direction, branchSide) => {
            const branch = makePath(
              node,
              tangent + direction * (.62 + random(i + branchIndex * 7 + branchSide) * .25),
              4,
              step * .58,
              301 + i * 29 + branchIndex * 5 + branchSide,
              1,
              (i + branchIndex + branchSide) % 7 === 0 ? 0 : 1
            );
            paths.push(branch);
            if (branchIndex === 1) {
              const fork = branch.nodes[2];
              const p0 = branch.nodes[1], p2 = branch.nodes[3];
              const forkAngle = Math.atan2(p2.y - p0.y, p2.x - p0.x);
              paths.push(makePath(fork, forkAngle + direction * .78, 3, step * .3,
                701 + i * 17 + branchSide, 2, 1));
            }
          });
        });
      }
      // Sparse curved anastomoses reconnect neighbouring fronts without
      // turning the field into a straight-line constellation.
      const bridges = [];
      for (let i = 0; i < mainPaths.length; i++) {
        for (let j = i + 1; j < mainPaths.length; j++) {
          for (let a = 2; a < 6; a += 2) {
            for (let b = 2; b < 6; b += 2) {
              const p = mainPaths[i].nodes[a], q = mainPaths[j].nodes[b];
              const distance = Math.hypot(q.x - p.x, q.y - p.y);
              if (distance > Math.min(width, height) * .035 &&
                  distance < Math.min(width, height) * .28) bridges.push({ p, q, distance, index: bridges.length });
            }
          }
        }
      }
      bridges.sort((a, b) => a.distance - b.distance);
      bridges.slice(0, compact ? 7 : 14).forEach((bridge, index) => {
        const dx = bridge.q.x - bridge.p.x, dy = bridge.q.y - bridge.p.y;
        const bend = (index % 2 ? 1 : -1) * Math.min(12, bridge.distance * .12);
        const middle = {
          x: (bridge.p.x + bridge.q.x) / 2 - dy / (bridge.distance || 1) * bend,
          y: (bridge.p.y + bridge.q.y) / 2 + dx / (bridge.distance || 1) * bend,
          phase: random(index + 901) * 6.28,
          amp: .7
        };
        paths.push({ nodes: [bridge.p, middle, bridge.q], depth: 2, colour: 1 });
      });
    };
    const drawPath = (path, time) => {
      const points = path.nodes.map(node => ({
        x: node.x + Math.sin(time * .20 + (node.phase || 0)) * (node.amp || .8),
        y: node.y + Math.cos(time * .17 + (node.phase || 0) * .83) * (node.amp || .8)
      }));
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)], p1 = points[i];
        const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
          p2.x, p2.y
        );
      }
      ctx.globalAlpha = path.depth === 0 ? .64 : path.depth === 1 ? .38 : .22;
      ctx.strokeStyle = palette[path.colour === 0 ? 0 : 1];
      ctx.lineWidth = path.depth === 0 ? 1.25 : path.depth === 1 ? .9 : .65;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const draw = now => {
      raf = 0;
      if (!visible || document.hidden) return;
      const interval = compact ? 50 : 34;
      if (!staticMode && now - lastFrame < interval) { raf = requestAnimationFrame(draw); return; }
      lastFrame = now;
      ctx.clearRect(0, 0, width, height);
      const time = staticMode ? 0 : now * .001;
      paths.forEach(path => drawPath(path, time));
      if (!staticMode) raf = requestAnimationFrame(draw);
    };
    const start = () => { if (!staticMode && visible && !document.hidden && !raf) raf = requestAnimationFrame(draw); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => { rebuild(); if (staticMode) draw(0); }) : null;
    resize?.observe(host);
    rebuild();
    if (staticMode) draw(0);
    else {
      const observer = "IntersectionObserver" in window
        ? new IntersectionObserver(entries => { visible = entries[0].isIntersecting; visible ? start() : stop(); }, { threshold: .01 })
        : null;
      observer?.observe(host);
      document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
      start();
      window.addEventListener("pagehide", () => { stop(); observer?.disconnect(); resize?.disconnect(); }, { once: true });
    }
  }

  mountOrganicField(hero, domain);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const compact = window.matchMedia?.("(max-width: 640px)")?.matches;

  const scenes = {
    mycology: {
      label: "Croissance concentrique d'une colonie en boîte de Petri",
      particles: { count: compact ? 5 : 9, color: "#d69a75", direction: "none", speed: 0.12 },
      markup: `
        <div class="ba-sector-visual ba-sector-visual--mycology" data-sector="mycology">
          <svg class="ba-sector-svg" viewBox="0 0 260 200" role="img" aria-label="Boîte de Petri avec anneaux de croissance concentriques">
            <defs>
              <radialGradient id="ba-petri-fill"><stop offset="0" stop-color="#c98259" stop-opacity=".19"/><stop offset=".72" stop-color="#c98259" stop-opacity=".035"/><stop offset="1" stop-color="#c98259" stop-opacity=".01"/></radialGradient>
              <linearGradient id="ba-petri-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8b38f"/><stop offset=".52" stop-color="#b96b4d"/><stop offset="1" stop-color="#80513f"/></linearGradient>
            </defs>
            <circle cx="130" cy="94" r="76" fill="url(#ba-petri-fill)" stroke="url(#ba-petri-edge)" stroke-width="2.4"/>
            <circle cx="130" cy="94" r="68" fill="none" stroke="#d9a17d" stroke-opacity=".3" stroke-width="1"/>
            <circle class="ba-colony-ring ba-colony-ring--outer" cx="130" cy="94" r="53" fill="none" stroke="#d18b63" stroke-width="1.3" stroke-dasharray="2 5"/>
            <circle class="ba-colony-ring ba-colony-ring--middle" cx="130" cy="94" r="38" fill="none" stroke="#e2ad89" stroke-width="1.6" stroke-dasharray="90 150" stroke-linecap="round"/>
            <circle class="ba-colony-ring ba-colony-ring--inner" cx="130" cy="94" r="23" fill="none" stroke="#e9bd9c" stroke-width="1.8" stroke-dasharray="54 92" stroke-linecap="round"/>
            <circle class="ba-colony-core" cx="130" cy="94" r="10" fill="#c98259" fill-opacity=".22" stroke="#e5b08c" stroke-opacity=".85"/>
            <g fill="#e6b18d"><circle cx="82" cy="61" r="2"/><circle cx="174" cy="73" r="1.7"/><circle cx="161" cy="137" r="2"/><circle cx="94" cy="132" r="1.6"/></g>
            <path d="M32 94h16M212 94h16M130 0v16M130 172v16" stroke="#c98259" stroke-opacity=".55" stroke-width="1"/>
            <text x="130" y="190" text-anchor="middle" fill="#d9a17d" font-size="8" letter-spacing="2.2">COLONY GROWTH / PETRI</text>
          </svg>
          <div class="ba-sector-particles" id="ba-sector-particles" aria-hidden="true"></div>
          <span class="ba-visual-caption">COLONY DEVELOPMENT <i></i></span>
        </div>`
    },
    agronomy: {
      label: "Feuille stylisée avec balayage lumineux le long de la nervure",
      particles: {
        count: compact ? 5 : 10, color: "#b4f477", direction: "top", speed: 0.13,
        shape: "circle",
        interactivity: { hover: { enable: true, mode: "repulse" }, click: { enable: true, mode: "push" } }
      },
      markup: `
        <div class="ba-sector-visual ba-sector-visual--greentech" data-sector="agronomy">
          <svg class="ba-sector-svg" viewBox="0 0 260 200" role="img" aria-label="Feuille stylisée et nervure centrale">
            <defs>
              <linearGradient id="ba-leaf-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b4f477" stop-opacity=".2"/><stop offset="1" stop-color="#5e9c56" stop-opacity=".025"/></linearGradient>
              <linearGradient id="ba-leaf-scan"><stop stop-color="#b4f477" stop-opacity="0"/><stop offset=".5" stop-color="#d9ffae" stop-opacity=".95"/><stop offset="1" stop-color="#b4f477" stop-opacity="0"/></linearGradient>
            </defs>
            <path d="M39 139C48 66 115 24 220 28c-7 84-55 139-132 142-23 1-39-10-49-31Z" fill="url(#ba-leaf-fill)" stroke="#91c86d" stroke-width="2"/>
            <path d="M39 139C100 108 158 67 220 28" fill="none" stroke="#b4f477" stroke-width="2.2" stroke-linecap="round"/>
            <g fill="none" stroke="#91c86d" stroke-width="1.2" stroke-linecap="round" opacity=".76">
              <path d="M76 120c-5-23-17-38-31-48M106 103c-2-27-1-47 7-67M140 82c8-23 19-38 33-49M81 118c-18-1-31 5-42 21M111 101c-17-8-29-20-38-34M145 79c-12-16-17-31-17-47M104 105c18 7 36 7 53 1M139 83c19 6 37 4 55-5M171 59c16 2 31-2 45-12"/>
            </g>
            <path class="ba-leaf-scan" d="M39 139C100 108 158 67 220 28" fill="none" stroke="url(#ba-leaf-scan)" stroke-width="5" stroke-linecap="round"/>
            <circle class="ba-leaf-node" cx="39" cy="139" r="4" fill="#d6f6a8"/>
            <circle class="ba-leaf-node ba-leaf-node--two" cx="220" cy="28" r="3" fill="#d6f6a8"/>
            <text x="130" y="190" text-anchor="middle" fill="#b4f477" font-size="8" letter-spacing="2.2">PLANT SIGNAL / GROWTH</text>
          </svg>
          <div class="ba-sector-particles" id="ba-sector-particles" aria-hidden="true"></div>
          <span class="ba-visual-caption">PLANT RESPONSE <i></i></span>
        </div>`
    },
    laboratory: {
      label: "Bioréacteur avec niveau de liquide et bulles de gaz",
      particles: {
        count: compact ? 4 : 8, color: ["#8ec6e8", "#b9e1f5"], direction: "top", speed: 0.075,
        shape: "circle",
        interactivity: { hover: { enable: true, mode: "bubble" } }
      },
      markup: `
        <div class="ba-sector-visual ba-sector-visual--laboratory" data-sector="laboratory">
          <svg class="ba-sector-svg" viewBox="0 0 260 200" role="img" aria-label="Bioréacteur avec agitation, liquide et bulles">
            <defs>
              <linearGradient id="ba-reactor-glass" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#78b8e8" stop-opacity=".12"/><stop offset=".5" stop-color="#78b8e8" stop-opacity=".035"/><stop offset="1" stop-color="#78b8e8" stop-opacity=".14"/></linearGradient>
              <clipPath id="ba-reactor-clip"><path d="M91 49h78v15l12 17v66q0 13-13 13h-76q-13 0-13-13V81l12-17Z"/></clipPath>
            </defs>
            <path d="M105 30h50M111 30v19l-20 32v66q0 13 13 13h52q13 0 13-13V81l-20-32V30" fill="url(#ba-reactor-glass)" stroke="#8ec6e8" stroke-width="2.2" stroke-linejoin="round"/>
            <g clip-path="url(#ba-reactor-clip)">
              <path class="ba-reactor-liquid" d="M77 105q24-7 48 0t48 0t24 0v70H77Z" fill="#4f91bd" fill-opacity=".24"/>
              <path class="ba-reactor-wave" d="M77 105q24-7 48 0t48 0t24 0" fill="none" stroke="#9bd4f1" stroke-width="1.5"/>
              <g class="ba-reactor-bubbles" fill="none" stroke="#a9d9f1" stroke-width="1.4">
                <circle cx="112" cy="137" r="3"/><circle cx="139" cy="145" r="2.2"/><circle cx="151" cy="124" r="2.7"/><circle cx="127" cy="119" r="1.8"/>
              </g>
            </g>
            <path d="M130 16v111m-8-8h16m-8 0v16m-8 0h16M91 92h-23V76H55m114 16h23V76h17" fill="none" stroke="#78b8e8" stroke-width="1.5" stroke-linecap="round"/>
            <circle class="ba-reactor-signal" cx="130" cy="127" r="5" fill="#b9e1f5"/>
            <g fill="#a8d4eb" font-size="7" letter-spacing="1.2"><text x="35" y="69">AIR IN</text><text x="187" y="69">pH / DO</text><text x="130" y="190" text-anchor="middle" letter-spacing="2.2">BIOPROCESS / CONTROL</text></g>
          </svg>
          <span class="ba-visual-caption">PROCESS MONITORING <i></i></span>
        </div>`
    }
  };

  const scene = scenes[domain] || scenes.agronomy;
  art.innerHTML = scene.markup;
  art.setAttribute("aria-label", scene.label);
  art.classList.add("ba-sector-art");
  document.getElementById("ba-particle-field")?.remove();

  if (reducedMotion || !scene.particles) return;
  const particleHost = art.querySelector("#ba-sector-particles");
  if (!particleHost) return;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("tsParticles indisponible"));
    document.head.appendChild(script);
  });

  const startParticles = async () => {
    try {
      if (!window.tsParticles?.load || typeof window.loadSlim !== "function") {
        await loadScript("https://cdn.jsdelivr.net/npm/@tsparticles/slim@4/tsparticles.slim.bundle.min.js");
      }
      if (!window.tsParticles?.load || typeof window.loadSlim !== "function") return;
      await window.loadSlim(window.tsParticles);
      await window.tsParticles.load({
        id: "ba-sector-particles",
        options: {
          fullScreen: { enable: false },
          detectRetina: false,
          fpsLimit: compact ? 24 : 30,
          pauseOnBlur: true,
          pauseOnOutsideViewport: true,
          particles: {
            number: { value: scene.particles.count, density: { enable: true, width: 320, height: 220 } },
            color: { value: scene.particles.color },
            links: { enable: false },
            move: {
              enable: true,
              direction: scene.particles.direction,
              speed: scene.particles.speed,
              random: true,
              straight: false,
              outModes: { default: "out" }
            },
            opacity: { value: { min: 0.12, max: 0.42 } },
            size: { value: { min: 1, max: 2.1 } },
            shape: { type: scene.particles.shape || "circle" }
          },
          interactivity: scene.particles.interactivity ? {
            detectsOn: "canvas",
            events: {
              onHover: { enable: Boolean(scene.particles.interactivity.hover?.enable), mode: scene.particles.interactivity.hover?.mode || "repulse" },
              onClick: { enable: Boolean(scene.particles.interactivity.click?.enable), mode: scene.particles.interactivity.click?.mode || "push" },
              resize: { enable: true }
            },
            modes: {
              repulse: { distance: 88, duration: 0.35 },
              push: { quantity: 2 },
              bubble: { distance: 90, size: 4, duration: 1.2, opacity: 0.45 }
            }
          } : { events: { onHover: { enable: false }, onClick: { enable: false } } }
        }
      });
    } catch (error) {
      console.info("BA Labs: couche de particules optionnelle ignorée; SVG/CSS conservé.", error);
    }
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void startParticles();
      }
    }, { rootMargin: "80px" });
    observer.observe(art);
  } else {
    void startParticles();
  }

  window.addEventListener("pagehide", () => {
    try {
      window.tsParticles?.dom?.().forEach((container) => container.destroy());
    } catch (error) {
      console.info("BA Labs: nettoyage visuel différé.", error);
    }
  }, { once: true });
})();
