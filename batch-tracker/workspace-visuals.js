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
      label: "Planche botanique scientifique montrant une feuille, sa nervation principale et son réseau de nervures secondaires",
      particles: {
        count: compact ? 5 : 10,
        color: "#b4f477",
        direction: "none",
        speed: 0.045,
        shape: "circle",
        interactivity: {
          hover: { enable: true, mode: "repulse" },
          click: { enable: true, mode: "push" }
        }
      },
      markup: `
        <div class="ba-sector-visual ba-sector-visual--greentech" data-sector="agronomy" data-visual="botanical-plate">
          <svg class="ba-sector-svg ba-botanical-plate" viewBox="0 0 320 240" role="img" aria-label="Planche botanique : limbe foliaire, nervure médiane, nervures secondaires et réseau de nervilles">
            <defs>
              <linearGradient id="ba-leaf-lamina" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#b9e58a" stop-opacity=".28"/>
                <stop offset=".48" stop-color="#6f9f60" stop-opacity=".16"/>
                <stop offset="1" stop-color="#294c38" stop-opacity=".08"/>
              </linearGradient>
              <linearGradient id="ba-leaf-margin" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#d5f2a7" stop-opacity=".88"/>
                <stop offset="1" stop-color="#7eaf70" stop-opacity=".68"/>
              </linearGradient>
              <linearGradient id="ba-leaf-midrib" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stop-color="#a4d27a"/>
                <stop offset=".55" stop-color="#e0f5b8"/>
                <stop offset="1" stop-color="#8ebd6d"/>
              </linearGradient>
              <radialGradient id="ba-leaf-light" cx=".42" cy=".42" r=".68">
                <stop offset="0" stop-color="#d7f4b1" stop-opacity=".16"/>
                <stop offset="1" stop-color="#d7f4b1" stop-opacity="0"/>
              </radialGradient>
              <pattern id="ba-leaf-grid" width="18" height="18" patternUnits="userSpaceOnUse">
                <path d="M18 0H0V18" fill="none" stroke="#c5e4a7" stroke-opacity=".045" stroke-width=".6"/>
              </pattern>
              <clipPath id="ba-leaf-clip">
                <path d="M47 177C44 139 61 98 91 66C129 26 190 19 273 42C256 91 232 137 197 169C158 205 99 211 47 177Z"/>
              </clipPath>
            </defs>

            <rect x="9" y="9" width="302" height="204" rx="13" fill="url(#ba-leaf-grid)" opacity=".75"/>
            <path d="M47 177C44 139 61 98 91 66C129 26 190 19 273 42C256 91 232 137 197 169C158 205 99 211 47 177Z"
              fill="url(#ba-leaf-lamina)" stroke="url(#ba-leaf-margin)" stroke-width="1.8"/>
            <g clip-path="url(#ba-leaf-clip)">
              <path d="M38 183C112 145 191 91 280 38" fill="none" stroke="url(#ba-leaf-light)" stroke-width="52"/>
              <g fill="none" stroke="#a8d287" stroke-width="1.05" stroke-linecap="round" opacity=".74">
                <path d="M72 163C69 137 60 118 48 105M91 153C85 121 82 94 88 72M112 139C108 108 110 78 124 49M136 123C139 91 151 62 169 37M160 108C172 79 192 57 216 43M184 91C204 70 230 56 257 48"/>
                <path d="M72 163C56 166 44 174 33 188M91 153C71 153 56 162 43 177M112 139C91 143 74 152 60 168M136 123C115 131 99 143 85 158M160 108C143 119 128 133 116 150M184 91C172 105 158 122 147 141"/>
                <path d="M102 146C99 129 95 114 89 101M126 131C124 111 124 93 130 75M150 116C155 97 164 81 176 66M175 100C188 84 204 72 221 63"/>
                <path d="M116 138C100 125 89 111 82 95M141 121C128 107 119 91 114 74M166 105C158 89 154 75 155 58M191 88C190 73 194 61 202 50"/>
              </g>
              <g fill="none" stroke="#d1edaa" stroke-width=".55" stroke-linecap="round" opacity=".42">
                <path d="M61 124L91 153M75 105L112 139M101 82L136 123M128 58L160 108M154 45L184 91M187 43L205 76M73 180L91 153M94 185L112 139M119 184L136 123M148 181L160 108M177 169L184 91M206 144L208 80"/>
              </g>
            </g>
            <path d="M47 177C119 142 196 88 273 42" fill="none" stroke="url(#ba-leaf-midrib)" stroke-width="2.6" stroke-linecap="round"/>
            <path class="ba-leaf-scan" d="M47 177C119 142 196 88 273 42" fill="none" stroke="#e5ffc3" stroke-width="5" stroke-linecap="round"/>
            <path d="M47 177C39 187 31 194 23 199" fill="none" stroke="#8ebd6d" stroke-width="2" stroke-linecap="round"/>
            <circle class="ba-leaf-node" cx="47" cy="177" r="4" fill="#e3f6bd"/>
            <circle class="ba-leaf-node ba-leaf-node--two" cx="273" cy="42" r="3" fill="#e3f6bd"/>

            <g fill="#b7d99b" font-family="Inter,system-ui,sans-serif" font-size="7" letter-spacing="1.25">
              <text x="18" y="27">MORPHOLOGY / 01</text>
              <text x="302" y="27" text-anchor="end">VENATION</text>
              <text x="160" y="229" text-anchor="middle" font-size="8" letter-spacing="2.1">PLANT STRUCTURE / RESPONSE</text>
            </g>
            <g stroke="#8fb875" stroke-opacity=".48" stroke-width=".7" fill="none">
              <path d="M18 34h27M275 34h27M18 204h27M275 204h27"/>
            </g>
          </svg>
          <div class="ba-sector-particles" id="ba-sector-particles" aria-hidden="true"></div>
          <span class="ba-visual-caption">BOTANICAL MORPHOLOGY <i></i></span>
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
