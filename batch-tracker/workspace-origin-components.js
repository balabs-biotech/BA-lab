/* BA Labs CultureOps — OriginKit component adaptation.
 * Kinetic Grid by Vellum AI, adapted from the Vellum motion-design component
 * for CultureOps' static HTML/JavaScript runtime (no React/Framer dependency).
 * Original source: https://github.com/vellum-ai/motion-design
 * Preserve the upstream MIT attribution when redistributing this adaptation.
 */
(() => {
  "use strict";
  const responsiveStyle = document.createElement("style");
  responsiveStyle.id = "ba-originkit-responsive-hero";
  responsiveStyle.textContent = `
    @media (max-width: 760px) {
      html body[data-domain] .app-hero { grid-template-columns: minmax(0, 1fr) !important; }
      html body[data-domain] .hero-art.ba-sector-art {
        grid-column: 1 !important;
        justify-self: stretch !important;
        width: 100% !important;
        min-height: 150px !important;
        margin-top: 8px !important;
      }
      html body[data-domain] .ba-sector-visual { width: min(100%, 270px) !important; }
    }
  `;
  document.head.appendChild(responsiveStyle);

  const applyResponsiveHero = () => {
    const hero = document.querySelector(".app-hero");
    const art = hero?.querySelector(".hero-art");
    const visual = art?.querySelector(".ba-sector-visual");
    const compact = window.matchMedia?.("(max-width: 760px)")?.matches ?? false;
    if (!hero || !art) return;
    if (compact) {
      hero.style.setProperty("grid-template-columns", "minmax(0, 1fr)", "important");
      art.style.setProperty("grid-column", "1", "important");
      art.style.setProperty("justify-self", "stretch", "important");
      art.style.setProperty("width", "100%", "important");
      art.style.setProperty("min-height", "185px", "important");
      art.style.setProperty("margin-top", "8px", "important");
      visual?.style.setProperty("width", "min(100%, 270px)", "important");
      visual?.style.setProperty("height", "170px", "important");
      visual?.style.setProperty("min-height", "170px", "important");
    } else {
      hero.style.removeProperty("grid-template-columns");
      art.style.removeProperty("grid-column");
      art.style.removeProperty("justify-self");
      art.style.removeProperty("width");
      art.style.removeProperty("min-height");
      art.style.removeProperty("margin-top");
      visual?.style.removeProperty("width");
      visual?.style.removeProperty("height");
      visual?.style.removeProperty("min-height");
    }
  };
  applyResponsiveHero();
  window.addEventListener("resize", applyResponsiveHero, { passive: true });

  const mountParticleSphereFallback = (host, reduced, compact) => {
    const canvas = document.createElement("canvas");
    canvas.className = "ba-originkit-particle-sphere ba-originkit-particle-sphere--2d";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute", inset: "0", zIndex: "0",
      width: "100%", height: "100%", pointerEvents: "none"
    });
    host.insertBefore(canvas, host.firstChild);
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const count = compact ? 520 : 1050;
    const points = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / Math.max(1, count - 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = golden * i;
      points.push({ x: Math.cos(angle) * ring, y, z: Math.sin(angle) * ring });
    }
    let width = 1, height = 1, dpr = 1, rotation = 0, raf = 0, visible = false, disposed = false, last = 0;
    let pointer = { x: 0, y: 0, active: false };
    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.4);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) draw(0);
    };
    const draw = (dt) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      const scale = Math.min(width, height) * 0.38;
      const centerX = width / 2, centerY = height / 2;
      const cosY = Math.cos(rotation), sinY = Math.sin(rotation);
      const cosX = Math.cos(rotation * 0.36), sinX = Math.sin(rotation * 0.36);
      for (const point of points) {
        const rx = point.x * cosY - point.z * sinY;
        const rz = point.x * sinY + point.z * cosY;
        const ry = point.y * cosX - rz * sinX;
        const depth = point.y * sinX + rz * cosX;
        const perspective = 2.9 / (2.9 - depth * 0.45);
        let x = centerX + rx * scale * perspective;
        let y = centerY + ry * scale * perspective;
        if (pointer.active) {
          const dx = x - pointer.x, dy = y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 38 && distance > 0.1) {
            const force = (1 - distance / 38) * 10;
            x += (dx / distance) * force;
            y += (dy / distance) * force;
          }
        }
        const alpha = Math.max(0.12, Math.min(0.82, 0.26 + (depth + 1) * 0.28));
        const size = (0.65 + (depth + 1) * 0.42) * (compact ? 0.9 : 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#d69a75";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (!reduced) rotation += dt * 0.34;
    };
    const loop = (time) => {
      if (disposed || !visible || document.hidden) { raf = 0; return; }
      if (time - last < 30) { raf = requestAnimationFrame(loop); return; }
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
      last = time;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!disposed && !reduced && visible && !document.hidden && !raf) { last = 0; raf = requestAnimationFrame(loop); } };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const onMove = (event) => {
      const rect = host.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true };
    };
    const onLeave = () => { pointer.active = false; };
    resize();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(host);
    const intersection = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) start(); else stop();
    }, { rootMargin: "80px" }) : null;
    if (intersection) intersection.observe(host); else { visible = true; start(); }
    if (!reduced) {
      host.addEventListener("pointermove", onMove, { passive: true });
      host.addEventListener("pointerleave", onLeave, { passive: true });
    }
    const onVisibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => {
      disposed = true; stop(); resizeObserver?.disconnect(); intersection?.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    }, { once: true });
  };

  const mountParticleSphere = async () => {
    const sphereHost = document.querySelector(".ba-sector-visual--mycology");
    if (!sphereHost || sphereHost.dataset.particleSphereMounted === "true") return;
    sphereHost.dataset.particleSphereMounted = "true";

    // Particle Sphere is the Vellum component's 3D particle-cloud behavior.
    // Its React wrapper is replaced with a small Three.js runtime for CultureOps.
    const oldParticles = sphereHost.querySelector("#ba-sector-particles");
    oldParticles?.remove();
    try { window.tsParticles?.dom?.().forEach((container) => container.destroy()); } catch (_) {}

    const sphereSvg = sphereHost.querySelector(".ba-sector-svg");
    const sphereCaption = sphereHost.querySelector(".ba-visual-caption");
    sphereHost.style.position = "relative";
    sphereHost.style.isolation = "isolate";
    if (sphereSvg) { sphereSvg.style.position = "relative"; sphereSvg.style.zIndex = "1"; }
    if (sphereCaption) sphereCaption.style.zIndex = "2";

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const compact = window.matchMedia?.("(max-width: 640px)")?.matches ?? false;
    try {
      const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.174.0/build/three.module.js");
      if (!sphereHost.isConnected) return;
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        premultipliedAlpha: true
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.35));
      Object.assign(renderer.domElement.style, {
        position: "absolute", inset: "0", zIndex: "0",
        width: "100%", height: "100%", pointerEvents: "none"
      });
      renderer.domElement.className = "ba-originkit-particle-sphere";
      renderer.domElement.setAttribute("aria-hidden", "true");
      sphereHost.insertBefore(renderer.domElement, sphereHost.firstChild);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0, 0, 3.55);
      const group = new THREE.Group();
      scene.add(group);

      const count = compact ? 2200 : 4600;
      const radius = 1.16;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const base = new Float32Array(count * 3);
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / Math.max(1, count - 1)) * 2;
        const ring = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * i;
        const x = Math.cos(theta) * ring;
        const z = Math.sin(theta) * ring;
        const offset = i * 3;
        base[offset] = positions[offset] = x * radius;
        base[offset + 1] = positions[offset + 1] = y * radius;
        base[offset + 2] = positions[offset + 2] = z * radius;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: new THREE.Color("#d69a75"),
        size: compact ? 0.018 : 0.021,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const points = new THREE.Points(geometry, material);
      group.add(points);

      let pointer = { x: 9, y: 9, active: false };
      let clickImpulse = 0;
      let frameId = 0;
      let lastFrame = 0;
      let visible = false;
      let disposed = false;
      let width = 1;
      let height = 1;

      const resize = () => {
        const rect = sphereHost.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (reduced) renderer.render(scene, camera);
      };
      const onPointerMove = (event) => {
        const rect = sphereHost.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
        pointer.active = true;
      };
      const onPointerLeave = () => { pointer.active = false; };
      const onPointerDown = () => { clickImpulse = 1; };

      const renderFrame = (time) => {
        if (disposed || !visible || document.hidden) { frameId = 0; return; }
        if (time - lastFrame < 30) { frameId = requestAnimationFrame(renderFrame); return; }
        lastFrame = time;
        const positionAttribute = geometry.attributes.position;
        const array = positionAttribute.array;
        const pointerX = pointer.x * 1.35;
        const pointerY = pointer.y * 1.05;
        for (let i = 0; i < count; i++) {
          const k = i * 3;
          const dxHome = base[k] - array[k];
          const dyHome = base[k + 1] - array[k + 1];
          const dzHome = base[k + 2] - array[k + 2];
          let ax = dxHome * 0.018;
          let ay = dyHome * 0.018;
          let az = dzHome * 0.018;
          if (pointer.active) {
            const dx = array[k] - pointerX;
            const dy = array[k + 1] - pointerY;
            const distance = Math.hypot(dx, dy);
            if (distance < 0.62 && distance > 0.001) {
              const force = (1 - distance / 0.62) * 0.012;
              ax += (dx / distance) * force;
              ay += (dy / distance) * force;
              az += clickImpulse * (0.62 - distance) * 0.012;
            }
          }
          velocities[k] = (velocities[k] + ax) * 0.91;
          velocities[k + 1] = (velocities[k + 1] + ay) * 0.91;
          velocities[k + 2] = (velocities[k + 2] + az) * 0.91;
          array[k] += velocities[k];
          array[k + 1] += velocities[k + 1];
          array[k + 2] += velocities[k + 2];
        }
        clickImpulse *= 0.9;
        positionAttribute.needsUpdate = true;
        group.rotation.y += 0.0014;
        group.rotation.x += 0.00045;
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(renderFrame);
      };
      const start = () => {
        if (disposed || reduced || !visible || document.hidden || frameId) return;
        lastFrame = 0;
        frameId = requestAnimationFrame(renderFrame);
      };
      const stop = () => { if (frameId) cancelAnimationFrame(frameId); frameId = 0; };

      resize();
      const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(sphereHost);
      const intersection = "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            if (visible) start(); else stop();
          }, { rootMargin: "80px" })
        : null;
      if (intersection) intersection.observe(sphereHost);
      else { visible = true; start(); }
      if (!reduced) {
        sphereHost.addEventListener("pointermove", onPointerMove, { passive: true });
        sphereHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
        sphereHost.addEventListener("pointercancel", onPointerLeave, { passive: true });
        sphereHost.addEventListener("pointerdown", onPointerDown, { passive: true });
      }
      const onVisibility = () => { if (document.hidden) stop(); else start(); };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", () => {
        disposed = true;
        stop();
        resizeObserver?.disconnect();
        intersection?.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        sphereHost.removeEventListener("pointermove", onPointerMove);
        sphereHost.removeEventListener("pointerleave", onPointerLeave);
        sphereHost.removeEventListener("pointercancel", onPointerLeave);
        sphereHost.removeEventListener("pointerdown", onPointerDown);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      }, { once: true });
    } catch (error) {
      sphereHost.dataset.particleSphereFallback = "true";
      sphereHost.dataset.particleSphereError = String(error?.message || error).slice(0, 180);
      mountParticleSphereFallback(sphereHost, reduced, compact);
      console.info("BA Labs: Particle Sphere utilise le rendu 2D de compatibilité.", error);
    }
  };

  void mountParticleSphere();

  const mountRisingLines = () => {
    const riseHost = document.querySelector(".ba-sector-visual--greentech");
    if (!riseHost || riseHost.dataset.risingLinesMounted === "true") return;
    riseHost.dataset.risingLinesMounted = "true";

    // Replace the previous generic particle layer with Vellum's Rising Lines
    // canvas behavior. The Petri/leaf SVG remains the foreground illustration.
    const oldParticles = riseHost.querySelector("#ba-sector-particles");
    oldParticles?.remove();
    try { window.tsParticles?.dom?.().forEach((container) => container.destroy()); } catch (_) {}

    const riseCanvas = document.createElement("canvas");
    riseCanvas.className = "ba-originkit-rising-lines";
    riseCanvas.setAttribute("aria-hidden", "true");
    Object.assign(riseCanvas.style, {
      position: "absolute", inset: "0", zIndex: "0",
      width: "100%", height: "100%", pointerEvents: "none"
    });
    riseHost.insertBefore(riseCanvas, riseHost.firstChild);
    riseHost.style.position = "relative";
    riseHost.style.isolation = "isolate";
    const riseSvg = riseHost.querySelector(".ba-sector-svg");
    if (riseSvg) { riseSvg.style.position = "relative"; riseSvg.style.zIndex = "1"; }
    const riseCaption = riseHost.querySelector(".ba-visual-caption");
    if (riseCaption) riseCaption.style.zIndex = "2";

    const context = riseCanvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const color = [180, 244, 119];       // GreenTech lime
    const horizonColor = [116, 200, 106];
    let width = 1, height = 1, dpr = 1;
    let sparks = [], blobs = [], raf = 0, visible = false, disposed = false, lastTime = 0;
    let seed = 0xc0ffee;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const centerX = () => ((random() + random() + random()) / 3) * width;
    const sampleHeight = () => Math.max(1, Math.floor((random() < 0.12 ? 70 + random() * 30 : 20 + Math.pow(random(), .7) * 35)));
    const resetSpark = (spark, initial = false) => {
      spark.x = centerX();
      spark.y = initial ? height - random() * height * .94 : height - random() * 8;
      spark.v = 10 + random() * 40;
      spark.length = sampleHeight();
    };
    const resetBlob = (blob, initial = false) => {
      blob.x = centerX();
      blob.y = initial ? height - random() * height * .94 : height - random() * 8;
      blob.v = 8 + random() * 28;
      blob.radius = 1.5 + Math.pow(random(), 1.8) * 3.5;
    };
    const resize = (measuredWidth, measuredHeight) => {
      const rect = riseHost.getBoundingClientRect();
      width = Math.max(1, Math.floor(measuredWidth || riseHost.clientWidth || rect.width || 270));
      height = Math.max(1, Math.floor(measuredHeight || riseHost.clientHeight || rect.height || 170));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      riseCanvas.width = Math.floor(width * dpr);
      riseCanvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = 0xc0ffee;
      const count = Math.min(240, Math.max(18, Math.floor(500 * width * height / 320000)));
      sparks = Array.from({ length: count }, () => {
        const spark = { x: 0, y: 0, v: 0, length: 0 };
        resetSpark(spark, true);
        return spark;
      });
      blobs = Array.from({ length: Math.min(90, Math.floor(count * .3)) }, () => {
        const blob = { x: 0, y: 0, v: 0, radius: 0 };
        resetBlob(blob, true);
        return blob;
      });
      if (reduced) draw(1 / 60);
    };
    const rgba = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, alpha))})`;
    const draw = (delta) => {
      const dt = Math.max(.001, Math.min(.05, delta));
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      // Soft horizon glow, anchored at the bottom of the scene.
      context.save();
      context.translate(width / 2, height);
      context.scale(width / 90, 1);
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, 90);
      glow.addColorStop(0, rgba(horizonColor, .34));
      glow.addColorStop(.4, rgba(horizonColor, .15));
      glow.addColorStop(1, rgba(horizonColor, 0));
      context.fillStyle = glow;
      context.fillRect(-92, -92, 184, 92);
      context.restore();

      for (const blob of blobs) {
        blob.y -= blob.v * 1.35 * dt;
        if (blob.y < -blob.radius * 2) resetBlob(blob);
        const progress = Math.max(0, Math.min(1, (height - blob.y) / height));
        const fade = progress < .2 ? progress / .2 : Math.max(0, 1 - (progress - .2) / .8);
        const alpha = fade * .5;
        if (alpha < .01) continue;
        const gradient = context.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.radius);
        gradient.addColorStop(0, rgba(color, alpha));
        gradient.addColorStop(.4, rgba(color, alpha * .45));
        gradient.addColorStop(1, rgba(color, 0));
        context.fillStyle = gradient;
        context.fillRect(blob.x - blob.radius, blob.y - blob.radius, blob.radius * 2, blob.radius * 2);
      }

      for (const spark of sparks) {
        spark.y -= spark.v * 1.5 * dt;
        if (spark.y < -spark.length) resetSpark(spark);
        const progress = Math.max(0, Math.min(1, (height - spark.y) / height));
        const fade = progress < .2 ? progress / .2 : Math.max(0, 1 - (progress - .2) / .8);
        const alpha = fade * .7;
        if (alpha < .01) continue;
        const head = Math.floor(spark.y);
        const tail = head + spark.length;
        const gradient = context.createLinearGradient(0, head, 0, tail);
        gradient.addColorStop(0, rgba(color, alpha));
        gradient.addColorStop(.3, rgba(color, alpha));
        gradient.addColorStop(1, rgba(color, 0));
        context.fillStyle = gradient;
        context.fillRect(Math.floor(spark.x), head, 1, spark.length);
      }
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
    };
    const loop = (time) => {
      if (disposed || !visible || document.hidden) { raf = 0; return; }
      const delta = lastTime ? (time - lastTime) / 1000 : 1 / 60;
      lastTime = time;
      draw(delta);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (disposed || reduced || !visible || document.hidden || raf) return;
      lastTime = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    resize();
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => resize(entries[0]?.contentRect.width, entries[0]?.contentRect.height))
      : null;
    resizeObserver?.observe(riseHost);
    const intersection = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          if (visible) start(); else stop();
        }, { rootMargin: "80px" })
      : null;
    if (intersection) intersection.observe(riseHost);
    else { visible = true; start(); }
    const onVisibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => {
      disposed = true; stop(); resizeObserver?.disconnect(); intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    }, { once: true });
  };

  mountRisingLines();

  const host = document.querySelector(".ba-sector-visual--laboratory");
  if (host && host.dataset.kineticGridMounted !== "true") {
    host.dataset.kineticGridMounted = "true";

  const canvas = document.createElement("canvas");
  canvas.className = "ba-originkit-kinetic-grid";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    zIndex: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none"
  });
  host.insertBefore(canvas, host.firstChild);
  host.style.position = "relative";
  host.style.isolation = "isolate";

  const svg = host.querySelector(".ba-sector-svg");
  if (svg) {
    svg.style.position = "relative";
    svg.style.zIndex = "1";
  }
  const caption = host.querySelector(".ba-visual-caption");
  if (caption) caption.style.zIndex = "2";

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  // OriginKit Kinetic Grid parameters, tuned to the Laboratory blue palette.
  const GAP = 28;
  const RADIUS = 118;
  const PULL = 1.2;
  const DOT_COLOR = "#a9d7f0";
  const LINE_COLOR = "#6eafd6";
  const TRAIL_COLOR = "#b6e4fb";
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  let width = 1;
  let height = 1;
  let columns = [];
  let dots = [];
  let trail = [];
  let mouse = { x: -9999, y: -9999, active: false };
  let frameId = 0;
  let lastFrame = 0;
  let inView = false;
  let destroyed = false;

  const build = (measuredWidth, measuredHeight) => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.floor(measuredWidth ?? rect.width));
    height = Math.max(1, Math.floor(measuredHeight ?? rect.height));
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    columns = [];
    dots = [];
    const countX = Math.floor(width / GAP) + 2;
    const countY = Math.floor(height / GAP) + 2;
    for (let x = 0; x < countX; x++) {
      const column = [];
      for (let y = 0; y < countY; y++) {
        const homeX = x * GAP;
        const homeY = y * GAP;
        const dot = { hx: homeX, hy: homeY, x: homeX, y: homeY, vx: 0, vy: 0 };
        column.push(dot);
        dots.push(dot);
      }
      columns.push(column);
    }
    if (reducedMotion) drawStatic();
  };

  const drawStatic = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 0.11;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 0.7;
    for (let x = 0; x < columns.length; x++) {
      for (let y = 0; y < columns[x].length; y++) {
        const dot = columns[x][y];
        const right = columns[x + 1]?.[y];
        const down = columns[x]?.[y + 1];
        if (right) {
          ctx.beginPath();
          ctx.moveTo(dot.hx, dot.hy);
          ctx.lineTo(right.hx, right.hy);
          ctx.stroke();
        }
        if (down) {
          ctx.beginPath();
          ctx.moveTo(dot.hx, dot.hy);
          ctx.lineTo(down.hx, down.hy);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = DOT_COLOR;
    for (const dot of dots) {
      ctx.beginPath();
      ctx.arc(dot.hx, dot.hy, 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const setPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.active = true;
    trail.push({ x: mouse.x, y: mouse.y, t: performance.now() });
    if (trail.length > 60) trail.shift();
  };
  const clearPointer = () => {
    mouse = { x: -9999, y: -9999, active: false };
  };

  const frame = (time) => {
    if (destroyed || !inView || document.hidden) {
      frameId = 0;
      return;
    }
    if (time - lastFrame < 30) {
      frameId = requestAnimationFrame(frame);
      return;
    }
    lastFrame = time;
    ctx.clearRect(0, 0, width, height);

    for (const dot of dots) {
      let ax = (dot.hx - dot.x) * 0.08;
      let ay = (dot.hy - dot.y) * 0.08;
      if (mouse.active) {
        const dx = mouse.x - dot.x;
        const dy = mouse.y - dot.y;
        const distance = Math.hypot(dx, dy);
        if (distance < RADIUS && distance > 0.001) {
          const force = (1 - distance / RADIUS) * PULL;
          ax += (dx / distance) * force;
          ay += (dy / distance) * force;
        }
      }
      dot.vx = (dot.vx + ax) * 0.82;
      dot.vy = (dot.vy + ay) * 0.82;
      dot.x += dot.vx;
      dot.y += dot.vy;
    }

    for (let x = 0; x < columns.length; x++) {
      for (let y = 0; y < columns[x].length; y++) {
        const dot = columns[x][y];
        const right = columns[x + 1]?.[y];
        const down = columns[x]?.[y + 1];
        const proximity = mouse.active
          ? Math.max(0, 1 - Math.hypot(mouse.x - dot.x, mouse.y - dot.y) / RADIUS)
          : 0;
        ctx.globalAlpha = 0.055 + proximity * 0.62;
        ctx.strokeStyle = LINE_COLOR;
        ctx.lineWidth = 0.45 + proximity * 1.15;
        if (right) {
          ctx.beginPath();
          ctx.moveTo(dot.x, dot.y);
          ctx.lineTo(right.x, right.y);
          ctx.stroke();
        }
        if (down) {
          ctx.beginPath();
          ctx.moveTo(dot.x, dot.y);
          ctx.lineTo(down.x, down.y);
          ctx.stroke();
        }
      }
    }

    for (const dot of dots) {
      const proximity = mouse.active
        ? Math.max(0, 1 - Math.hypot(mouse.x - dot.x, mouse.y - dot.y) / RADIUS)
        : 0;
      ctx.globalAlpha = 0.2 + proximity * 0.72;
      ctx.fillStyle = DOT_COLOR;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 0.75 + proximity * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const now = performance.now();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < trail.length; i++) {
      const previous = trail[i - 1];
      const current = trail[i];
      const age = now - current.t;
      if (age > 220) continue;
      ctx.globalAlpha = Math.max(0, 1 - age / 220) * 0.62;
      ctx.strokeStyle = TRAIL_COLOR;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
    trail = trail.filter((point) => now - point.t < 260);
    ctx.globalAlpha = 1;
    frameId = requestAnimationFrame(frame);
  };

  const start = () => {
    if (destroyed || reducedMotion || !inView || document.hidden || frameId) return;
    lastFrame = 0;
    frameId = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  };

  build();
  const resizeObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        build(rect?.width, rect?.height);
      })
    : null;
  const onResize = () => build();
  resizeObserver?.observe(host);
  if (!resizeObserver) window.addEventListener("resize", onResize);

  if (!reducedMotion) {
    host.addEventListener("pointermove", setPointer, { passive: true });
    host.addEventListener("pointerleave", clearPointer, { passive: true });
    host.addEventListener("pointercancel", clearPointer, { passive: true });
    const visibilityObserver = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          inView = entries.some((entry) => entry.isIntersecting);
          if (inView) start();
          else stop();
        }, { rootMargin: "80px" })
      : null;
    visibilityObserver?.observe(host);
    if (!visibilityObserver) {
      inView = true;
      start();
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });
    window.addEventListener("pagehide", () => {
      destroyed = true;
      stop();
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      host.removeEventListener("pointermove", setPointer);
      host.removeEventListener("pointerleave", clearPointer);
      host.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("resize", onResize);
    }, { once: true });
  }
  }
})();