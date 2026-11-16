/* BA Labs CultureOps — restrained visual runtime.
   tsParticles supplies the ambient field; PixiJS draws the hero instrument.
   Both are progressive enhancements: the static SVG remains the fallback. */
(() => {
  "use strict";

  const hero = document.querySelector(".app-hero");
  const art = hero?.querySelector(".hero-art");
  const particleCanvas = document.getElementById("ba-particle-field");
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
    script.onerror = reject;
    document.head.appendChild(script);
  });

  async function startParticleField() {
    if (!particleCanvas || reducedMotion || typeof window.particles === "function") {
      if (typeof window.particles === "function" && particleCanvas && !reducedMotion) {
        await window.particles("ba-particle-field", particleOptions());
      }
      return;
    }

    try {
      await loadScript("https://cdn.jsdelivr.net/npm/@tsparticles/particles@4/tsparticles.particles.bundle.min.js");
      if (typeof window.particles === "function") {
        await window.particles("ba-particle-field", particleOptions());
      }
    } catch (error) {
      console.info("BA Labs: le fond particulaire reste désactivé.", error);
    }
  }

  function particleOptions() {
    return {
      count: compact ? 13 : 30,
      color: accent,
      linksColor: accent,
      links: true,
      linksWidth: 0.55,
      radius: compact ? 1 : 1.35,
      speed: 0.22,
      opacity: 0.26
    };
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
        autoStart: false
      });

      const canvas = app.canvas;
      canvas.className = "hero-pixi-canvas";
      canvas.setAttribute("aria-hidden", "true");
      core.appendChild(canvas);

      const scene = new Container();
      app.stage.addChild(scene);

      const rings = new Graphics()
        .circle(58, 58, 48).stroke({ color: accentNumber, alpha: 0.22, width: 1 })
        .circle(58, 58, 34).stroke({ color: accentNumber, alpha: 0.34, width: 1 })
        .circle(58, 58, 12).fill({ color: accentNumber, alpha: 0.12 })
        .circle(58, 58, 5).fill({ color: accentNumber, alpha: 0.9 });
      scene.addChild(rings);

      const orbit = new Container();
      scene.addChild(orbit);
      const nodeCount = 8;
      for (let index = 0; index < nodeCount; index += 1) {
        const angle = (Math.PI * 2 * index) / nodeCount;
        const radius = index % 2 === 0 ? 43 : 31;
        const node = new Graphics()
          .circle(0, 0, index % 2 === 0 ? 2.8 : 2)
          .fill({ color: accentNumber, alpha: index % 2 === 0 ? 0.92 : 0.58 });
        node.position.set(58 + Math.cos(angle) * radius, 58 + Math.sin(angle) * radius);
        orbit.addChild(node);
      }

      const corePulse = new Graphics()
        .circle(58, 58, 8)
        .stroke({ color: accentNumber, alpha: 0.5, width: 1 });
      scene.addChild(corePulse);

      const fallbackSvg = core.querySelector("svg");
      if (fallbackSvg) fallbackSvg.hidden = true;
      core.classList.add("is-pixi-ready");

      app.ticker.add((ticker) => {
        orbit.rotation += 0.0018 * ticker.deltaTime;
        corePulse.alpha = 0.48 + Math.sin(performance.now() / 850) * 0.2;
      });
      app.start();

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) app.stop();
        else app.start();
      });
    } catch (error) {
      console.info("BA Labs: le noyau graphique conserve son rendu statique.", error);
    }
  }

  async function start() {
    await Promise.allSettled([startParticleField(), startPixiCore()]);
  }

  if ("IntersectionObserver" in window && art) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    }, { rootMargin: "120px" });
    observer.observe(art);
  } else {
    start();
  }
})();
