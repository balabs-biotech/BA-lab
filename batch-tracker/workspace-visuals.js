/* BA Labs CultureOps — progressive visual runtime.
   tsParticles provides a low-density ambient field. Domain-specific scientific SVGs
   remain the primary hero illustrations; PixiJS is reserved for data visualisations. */
(() => {
  "use strict";

  const hero = document.querySelector(".app-hero");
  const art = hero?.querySelector(".hero-art");
  const particleLayer = document.getElementById("ba-particle-field");
  const core = hero?.querySelector(".hero-core");
  if (!hero || hero.dataset.visualRuntime === "ready") return;
  hero.dataset.visualRuntime = "ready";

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const compact = window.matchMedia?.("(max-width: 640px)")?.matches;
  const accentByDomain = {
    agronomy: "#b4f477",
    mycology: "#c98259",
    laboratory: "#78b8e8"
  };
  const accent = accentByDomain[document.body.dataset.domain] || "#b4f477";
  const accentNumber = Number.parseInt(accent.slice(1), 16);

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Visual library failed to load"));
    document.head.appendChild(script);
  });

  async function startParticleField() {
    if (!particleLayer || reducedMotion) return;

    try {
      if (!window.tsParticles?.load || typeof window.loadSlim !== "function") {
        await loadScript("https://cdn.jsdelivr.net/npm/@tsparticles/slim@4/tsparticles.slim.bundle.min.js");
      }
      if (!window.tsParticles?.load || typeof window.loadSlim !== "function") {
        throw new Error("tsParticles v4 loader is unavailable");
      }

      await window.loadSlim(window.tsParticles);
      await window.tsParticles.load({
        id: "ba-particle-field",
        options: {
          fullScreen: { enable: false },
          detectRetina: true,
          fpsLimit: 30,
          pauseOnBlur: true,
          pauseOnOutsideViewport: true,
          particles: {
            number: {
              value: compact ? 12 : 24,
              density: { enable: true, width: 800, height: 600 }
            },
            color: { value: accent },
            links: {
              enable: true,
              color: accent,
              distance: compact ? 92 : 128,
              opacity: 0.16,
              width: 0.65
            },
            move: {
              enable: true,
              speed: 0.22,
              direction: "none",
              random: false,
              straight: false,
              outModes: { default: "out" }
            },
            opacity: { value: { min: 0.12, max: 0.32 } },
            size: { value: { min: 1, max: 2 } },
            shape: { type: "circle" }
          }
        }
      });
    } catch (error) {
      console.info("BA Labs: fond tsParticles désactivé, rendu statique conservé.", error);
    }
  }

  const start = () => startParticleField();
  if ("IntersectionObserver" in window && art) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void start();
      }
    }, { rootMargin: "120px" });
    observer.observe(art);
  } else {
    void start();
  }
})();
