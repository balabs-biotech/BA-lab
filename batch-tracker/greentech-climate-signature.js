/* BA Labs GreenTech — PixiJS climate signature.
   Reads only points already rendered from persisted NASA POWER observations.
   It is a compact visual index, not a second source of climate data. */
(() => {
  "use strict";
  if (document.body.dataset.domain !== "agronomy") return;
  const host = document.getElementById("workspace-root") || document.body;
  let pixi = null, app = null, scheduled = 0, renderRevision = 0;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const panel = document.createElement("section");
  panel.className = "greentech-climate-signature";
  panel.setAttribute("aria-label", "Synthèse visuelle des séries météo historiques");
  panel.innerHTML = '<div class="greentech-climate-heading"><div><span class="greentech-climate-kicker">LECTURE DES SÉRIES</span><h3>Signature climatique</h3><p>Vue condensée des courbes historiques chargées dans ce module</p></div><span class="greentech-climate-source">NASA POWER · DONNÉES IMPORTÉES</span></div><div class="greentech-climate-plot" aria-hidden="true"></div><ul class="greentech-climate-values" aria-label="Dernières valeurs visibles des séries"></ul><p class="greentech-climate-footnote">Les courbes conservent leurs unités propres. Ce contexte météo estimé sur grille ne constitue pas une mesure dans la parcelle.</p>';
  const plot = panel.querySelector(".greentech-climate-plot");
  const values = panel.querySelector(".greentech-climate-values");

  function extractSeries() {
    const charts = [...document.querySelectorAll("#envWeatherCharts > .environmental-weather-chart")];
    return charts.map((card) => {
      const svg = card.querySelector("svg");
      const title = card.querySelector("h4")?.textContent?.trim() || "Variable météo";
      if (!svg) return null;
      const points = [...svg.querySelectorAll("circle")].map((circle) => {
        const tip = circle.querySelector("title")?.textContent?.trim() || "";
        const x = Number(circle.getAttribute("cx")), y = Number(circle.getAttribute("cy"));
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y, tip } : null;
      }).filter(Boolean);
      if (points.length < 2) return null;
      const path = svg.querySelector("polyline");
      const color = path?.getAttribute("stroke") || "#8ed16d";
      return { title, color, points, latest: points[points.length - 1].tip, first: points[0].tip };
    }).filter(Boolean);
  }

  function destroy() {
    if (app) { app.destroy(true, true); app = null; }
    plot.replaceChildren();
  }

  function renderText(series) {
    values.replaceChildren();
    series.forEach((item) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "greentech-climate-dot";
      dot.style.background = item.color;
      const text = document.createElement("span");
      text.textContent = item.title;
      const latest = document.createElement("strong");
      latest.textContent = item.latest || "Valeur indisponible";
      li.append(dot, text, latest);
      values.append(li);
    });
  }

  async function draw() {
    const revision = ++renderRevision;
    const charts = document.getElementById("envWeatherCharts");
    if (!charts) {
      destroy();
      panel.hidden = true;
      panel.dataset.state = "empty";
      return;
    }
    const series = extractSeries();
    if (!series.length) {
      destroy();
      panel.dataset.state = "empty";
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    renderText(series);
    try {
      if (!pixi) pixi = await import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs");
      if (revision !== renderRevision) return;
      destroy();
      const width = Math.max(320, Math.min(1040, Math.floor(charts.clientWidth || 760)));
      const columns = width < 600 ? 1 : 2;
      const rows = Math.ceil(series.length / columns);
      const cellWidth = (width - 36 - (columns - 1) * 14) / columns;
      const cellHeight = 112;
      const height = rows * cellHeight + (rows - 1) * 12 + 24;
      const next = new pixi.Application();
      await next.init({ width, height, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 1.5), autoStart: false, preference: "webgl" });
      if (revision !== renderRevision) { next.destroy(true, true); return; }
      app = next;
      next.canvas.className = "greentech-climate-canvas";
      next.canvas.setAttribute("aria-hidden", "true");
      plot.replaceChildren(next.canvas);
      const { Container, Graphics, Text } = pixi;
      const root = new Container();
      next.stage.addChild(root);
      series.forEach((item, index) => {
        const col = index % columns, row = Math.floor(index / columns);
        const x0 = 12 + col * (cellWidth + 14), y0 = 10 + row * (cellHeight + 12);
        const card = new Container();
        card.position.set(x0, y0);
        const bg = new Graphics().roundRect(0, 0, cellWidth, cellHeight, 10)
          .fill({ color: 0x1c2927, alpha: 0.96 })
          .stroke({ color: 0x45584d, alpha: 0.65, width: 1 });
        card.addChild(bg);
        const heading = new Text({ text: item.title, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 11, fontWeight: "700", fill: 0xdce8d9 } });
        heading.position.set(12, 10); card.addChild(heading);
        const minX = Math.min(...item.points.map(p => p.x)), maxX = Math.max(...item.points.map(p => p.x));
        const minY = Math.min(...item.points.map(p => p.y)), maxY = Math.max(...item.points.map(p => p.y));
        const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
        const px = p => 13 + (p.x - minX) / spanX * (cellWidth - 28);
        const py = p => 43 + (p.y - minY) / spanY * 40;
        const stroke = parseInt(item.color.replace("#", ""), 16);
        const line = new Graphics();
        item.points.forEach((point, pointIndex) => {
          if (!pointIndex) line.moveTo(px(point), py(point));
          else line.lineTo(px(point), py(point));
        });
        line.stroke({ color: Number.isFinite(stroke) ? stroke : 0x8ed16d, width: 2.2, alpha: 0.95 });
        card.addChild(line);
        item.points.forEach((point, pointIndex) => {
          const marker = new Graphics().circle(px(point), py(point), pointIndex === item.points.length - 1 ? 3.8 : 2.1)
            .fill({ color: Number.isFinite(stroke) ? stroke : 0x8ed16d, alpha: pointIndex === item.points.length - 1 ? 1 : 0.62 });
          card.addChild(marker);
        });
        const count = new Text({ text: item.points.length + " dates · " + (item.latest || "dernière valeur"), style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 10, fill: 0xa9b9ae } });
        count.position.set(12, 91); card.addChild(count);
        root.addChild(card);
      });
      next.render();
      next.stop();
      panel.dataset.state = "ready";
    } catch (error) {
      console.info("BA Labs: signature PixiJS indisponible; les graphiques météo natifs restent actifs.", error);
      destroy();
      panel.dataset.state = "fallback";
    }
  }

  function schedule() {
    cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => void draw());
  }

  const observer = new MutationObserver((records) => {
    const relevant = records.some(record => {
      if (record.target === values || record.target === plot || panel.contains(record.target)) return false;
      return [...record.addedNodes, ...record.removedNodes].some(node => node !== panel && !(node.nodeType === 1 && panel.contains(node)));
    });
    if (relevant) schedule();
  });
  observer.observe(host, { childList: true, subtree: true });
  const resizeObserver = new ResizeObserver(schedule);
  const attach = () => {
    const charts = document.getElementById("envWeatherCharts");
    if (!charts || charts.dataset.signatureEnhanced === "true") return;
    charts.dataset.signatureEnhanced = "true";
    charts.prepend(panel);
    resizeObserver.observe(charts);
    schedule();
  };
  const attachObserver = new MutationObserver(attach);
  attachObserver.observe(host, { childList: true, subtree: true });
  attach();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    attachObserver.disconnect();
    resizeObserver.disconnect();
    if (app) app.destroy(true, true);
    app = null;
  }, { once: true });
})();