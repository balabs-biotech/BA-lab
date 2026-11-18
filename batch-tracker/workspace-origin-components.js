/* BA Labs CultureOps — OriginKit component adaptation.
 * Kinetic Grid by Vellum AI, adapted from the Vellum motion-design component
 * for CultureOps' static HTML/JavaScript runtime (no React/Framer dependency).
 * Original source: https://github.com/vellum-ai/motion-design
 * Preserve the upstream MIT attribution when redistributing this adaptation.
 */
(() => {
  "use strict";
  const host = document.querySelector(".ba-sector-visual--laboratory");
  if (!host || host.dataset.kineticGridMounted === "true") return;
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
  resizeObserver?.observe(host);
  if (!resizeObserver) window.addEventListener("resize", build);

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
      window.removeEventListener("resize", build);
    }, { once: true });
  }
})();