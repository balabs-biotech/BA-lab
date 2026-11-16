/* BA Labs CultureOps — progressive visual runtime.
   tsParticles provides a low-density ambient field; PixiJS renders the hero instrument.
   Both are optional enhancements. Static SVG remains the fallback. */
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

  async function startPixiCore() {
    if (!core || reducedMotion || compact) return;

    try {
      const { Application, Container, Graphics } = await import(
        "https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs"
      );
      const app = new Application();
      await app.init({
        width: 116,
        height: 116,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        autoStart: false,
        preference: "webgl"
      });

      const canvas = app.canvas;
      canvas.className = "hero-pixi-canvas";
      canvas.setAttribute("aria-hidden", "true");
      core.appendChild(canvas);

      const scene = new Container();
      app.stage.addChild(scene);

      const rings = new Graphics()
        .circle(58, 58, 48).stroke({ color: accentNumber, alpha: 0.2, width: 1 })
        .circle(58, 58, 34).stroke({ color: accentNumber, alpha: 0.32, width: 1 })
        .circle(58, 58, 12).fill({ color: accentNumber, alpha: 0.12 })
        .circle(58, 58, 5).fill({ color: accentNumber, alpha: 0.9 });
      scene.addChild(rings);

      const orbit = new Container();
      scene.addChild(orbit);
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        const radius = index % 2 === 0 ? 43 : 31;
        const node = new Graphics()
          .circle(0, 0, index % 2 === 0 ? 2.8 : 2)
          .fill({ color: accentNumber, alpha: index % 2 === 0 ? 0.92 : 0.58 });
        node.position.set(58 + Math.cos(angle) * radius, 58 + Math.sin(angle) * radius);
        orbit.addChild(node);
      }

      const pulse = new Graphics()
        .circle(58, 58, 8)
        .stroke({ color: accentNumber, alpha: 0.5, width: 1 });
      scene.addChild(pulse);

      const fallbackSvg = core.querySelector("svg");
      if (fallbackSvg) fallbackSvg.hidden = true;
      core.classList.add("is-pixi-ready");

      app.ticker.add((ticker) => {
        orbit.rotation += 0.0018 * ticker.deltaTime;
        pulse.alpha = 0.48 + Math.sin(performance.now() / 850) * 0.2;
      });

      const onVisibilityChange = () => {
        if (document.hidden) app.stop();
        else app.start();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", () => {
        app.stop();
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }, { once: true });
      if (!document.hidden) app.start();
    } catch (error) {
      console.info("BA Labs: noyau PixiJS indisponible, rendu SVG conservé.", error);
    }
  }

  const start = () => Promise.allSettled([startParticleField(), startPixiCore()]);
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
