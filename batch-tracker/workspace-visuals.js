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
