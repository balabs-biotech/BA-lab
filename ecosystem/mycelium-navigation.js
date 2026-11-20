import { Application, Container, Graphics } from "pixi.js";

/* BA Labs shared mycelium navigation — branching colonies, not decorative nodes. */
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const palette = { trunk: 0x91a99b, branch: 0x9aafa2, fine: 0x78958a, copper: 0xb96b4d, tip: 0xd1d0c5 };
const seedRandom = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

async function mount(rail) {
  if (!rail || rail.dataset.myceliumRenderer === "pixi") return;
  rail.dataset.myceliumRenderer = "loading";
  const canvas = document.createElement("canvas");
  canvas.className = "mycelium-navigation-canvas";
  canvas.setAttribute("aria-hidden", "true");
  rail.insertBefore(canvas, rail.firstChild);
  const svg = rail.querySelector(".neural-network");
  if (svg) svg.hidden = true;

  const app = new Application();
  try {
    await app.init({
      canvas, backgroundAlpha: 0, antialias: true, autoDensity: true,
      resolution: Math.min(devicePixelRatio || 1, 1.35),
      powerPreference: "low-power", autoStart: false, clearBeforeRender: true
    });
  } catch (error) {
    canvas.remove();
    if (svg) svg.hidden = false;
    rail.dataset.myceliumRenderer = "fallback";
    return;
  }
  rail.dataset.myceliumRenderer = "pixi";
  app.ticker.maxFPS = 30;
  const staticLayer = new Graphics();
  const pulseLayer = new Graphics();
  app.stage.addChild(staticLayer, pulseLayer);

  const W = 80, H = 600;
  const centers = [42, 170, 300, 430, 558];
  const rand = seedRandom(0xBA1A85);
  const paths = [];

  function branch(x, y, angle, length, depth, thickness, color, alpha) {
    const bend = (rand() - .5) * .62;
    const a = angle + bend;
    const ex = x + Math.cos(a) * length;
    const ey = y + Math.sin(a) * length;
    const cx = x + Math.cos(a + bend * .35) * length * .52;
    const cy = y + Math.sin(a + bend * .35) * length * .52;
    staticLayer.moveTo(x, y).quadraticCurveTo(cx, cy, ex, ey)
      .stroke({ color, alpha, width: thickness, cap: "round", join: "round" });
    paths.push({ x, y, cx, cy, ex, ey, color, alpha });
    if (depth <= 0 || length < 5) {
      staticLayer.circle(ex, ey, depth === 0 ? 1.15 : .8).fill({ color: palette.tip, alpha: .82 });
      return;
    }
    const forks = depth >= 2 ? 2 : (rand() > .42 ? 2 : 1);
    for (let i = 0; i < forks; i++) {
      const side = i === 0 ? -1 : 1;
      const t = .48 + rand() * .28;
      const bx = x + (ex - x) * t + (cx - (x + ex) / 2) * .55;
      const by = y + (ey - y) * t + (cy - (y + ey) / 2) * .55;
      branch(bx, by, a + side * (.42 + rand() * .56), length * (.48 + rand() * .12),
        depth - 1, Math.max(.38, thickness * .69), depth > 1 ? palette.fine : color, alpha * .82);
    }
  }

  // A single connected hyphal trunk links five distinct colonisation fronts.
  for (let i = 0; i < centers.length - 1; i++) {
    const y1 = centers[i], y2 = centers[i + 1], mid = (y1 + y2) / 2;
    const cx = 40 + (i % 2 ? -5 : 5);
    staticLayer.moveTo(40, y1).quadraticCurveTo(cx, mid, 40, y2)
      .stroke({ color: palette.trunk, alpha: .47, width: 1.15, cap: "round" });
    paths.push({ x: 40, y: y1, cx, cy: mid, ex: 40, ey: y2, color: palette.trunk, alpha: .7 });
    // Small lateral anastomoses keep the trunk biological, not a straight progress bar.
    branch(40, mid, i % 2 ? Math.PI : 0, 8 + rand() * 5, 1, .8, palette.fine, .55);
  }

  centers.forEach((cy, colony) => {
    const count = 5 + (colony % 2);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i / count) + (rand() - .5) * .34;
      branch(40 + (rand() - .5) * 3, cy + (rand() - .5) * 3, angle,
        19 + rand() * 17, 3, 1.35 - rand() * .35,
        i === 0 && colony % 2 === 0 ? palette.copper : palette.branch, .76);
    }
    // Colonisation nucleus and a subtle copper growth ring.
    staticLayer.circle(40, cy, 5.3).stroke({ color: palette.copper, alpha: .82, width: .85 });
    staticLayer.circle(40, cy, 2.1).fill({ color: palette.copper, alpha: .38 });
    staticLayer.circle(40, cy, 1.05).fill({ color: palette.tip, alpha: .95 });
  });

  function resize() {
    const rect = rail.getBoundingClientRect();
    app.renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    const sx = rect.width / W, sy = rect.height / H;
    staticLayer.scale.set(sx, sy);
    pulseLayer.scale.set(sx, sy);
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(rail);

  const spores = paths.filter((_, i) => i % 4 === 0).slice(0, 22).map((path, i) => ({
    path, phase: rand(), speed: .000045 + rand() * .000035, radius: .7 + rand() * .55,
    warm: i % 5 === 0
  }));
  let elapsed = 0;
  function draw() {
    elapsed += 16.7;
    pulseLayer.clear();
    for (const spore of spores) {
      const t = (spore.phase + elapsed * spore.speed) % 1;
      const u = 1 - t, p = spore.path;
      const x = u * u * p.x + 2 * u * t * p.cx + t * t * p.ex;
      const y = u * u * p.y + 2 * u * t * p.cy + t * t * p.ey;
      pulseLayer.circle(x, y, spore.radius * 1.9).fill({ color: spore.warm ? palette.copper : palette.tip, alpha: .12 });
      pulseLayer.circle(x, y, spore.radius).fill({ color: spore.warm ? palette.copper : palette.tip, alpha: .76 });
    }
    app.render();
  }
  if (!reduced) app.ticker.add(draw);
  else app.render();
  window.addEventListener("pagehide", () => { observer.disconnect(); app.destroy({ removeView: false, children: true }); }, { once: true });
}

function start() {
  const rail = document.querySelector("body > .chapter-rail.neural-rail");
  if (rail) mount(rail);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
