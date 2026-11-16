/* BA Labs Mycology — interactive strain lineage graph.
   PixiJS is progressive enhancement; the semantic button list remains available. */
(() => {
  "use strict";
  if (document.body.dataset.domain !== "mycology") return;
  const target = document.getElementById("cultureLineage");
  if (!target || target.dataset.graphEnhanced === "true") return;
  target.dataset.graphEnhanced = "true";

  const panel = target.closest(".bio-lineage-panel");
  if (!panel) return;
  const shell = document.createElement("div");
  shell.className = "lineage-graph-shell";
  shell.innerHTML = '<div class="lineage-graph-heading"><span>CARTE DE FILIATION</span><small>Chaque nœud ouvre la fiche de la culture correspondante</small></div><div class="lineage-graph-stage" role="img" aria-label="Graphe interactif des cultures parentes, de la culture sélectionnée et de ses descendantes"><p class="lineage-graph-status">Préparation de la carte de filiation…</p></div>';
  const details = document.createElement("details");
  details.className = "lineage-data-details";
  const summary = document.createElement("summary");
  summary.textContent = "Liste détaillée et navigation clavier";
  details.appendChild(summary);
  panel.insertBefore(shell, target);
  panel.insertBefore(details, target.nextSibling);
  details.appendChild(target);

  const stage = shell.querySelector(".lineage-graph-stage");
  let PIXI = null;
  let app = null;
  let frame = 0;
  let renderToken = 0;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const colors = { ancestor: 0x83a7a0, current: 0xc98259, descendant: 0xb4f477, line: 0x657b70, text: 0xe9eee7, muted: 0xa8b9ad };

  function collectNodes() {
    return [...target.querySelectorAll("button.culture-lineage-node[data-culture-id]")].map(button => ({
      id: button.dataset.cultureId,
      parentId: button.dataset.parentCultureId || "",
      role: button.dataset.lineageRole || "related",
      depth: Number(button.dataset.lineageDepth || 0),
      title: button.querySelector("strong")?.textContent?.trim() || "Culture sans code",
      subtitle: button.querySelector("small")?.textContent?.trim() || "",
      button
    }));
  }

  function showFallback(message) {
    stage.replaceChildren();
    const note = document.createElement("p");
    note.className = "lineage-graph-status";
    note.textContent = message;
    stage.appendChild(note);
    details.open = true;
  }

  async function loadPixi() {
    if (!PIXI) PIXI = await import("https://cdn.jsdelivr.net/npm/pixi.js@8.17.1/dist/pixi.min.mjs");
    return PIXI;
  }

  function layout(nodes) {
    const ancestors = nodes.filter(n => n.role === "ancestor");
    const current = nodes.find(n => n.role === "current");
    const descendants = nodes.filter(n => n.role === "descendant");
    const levels = new Map();
    descendants.forEach(node => {
      if (!levels.has(node.depth)) levels.set(node.depth, []);
      levels.get(node.depth).push(node);
    });
    const maxDepth = Math.max(0, ...levels.keys());
    const gapX = 226, gapY = 104, left = 34, top = 48;
    const currentX = left + ancestors.length * gapX;
    const positions = new Map();
    ancestors.forEach((node, index) => {
      positions.set(node.id, { x: left + index * gapX, y: top + 40, node });
    });
    if (current) positions.set(current.id, { x: currentX, y: top + 40, node: current });
    levels.forEach((items, depth) => {
      const totalHeight = Math.max(0, items.length - 1) * gapY;
      items.forEach((node, index) => {
        positions.set(node.id, { x: currentX + depth * gapX, y: top + 40 + index * gapY - totalHeight / 2, node });
      });
    });
    // Center the complete graph vertically when generations contain many branches.
    const maxCount = Math.max(1, ...[...levels.values()].map(items => items.length));
    const height = Math.max(210, maxCount * gapY + 112);
    positions.forEach(point => { point.y += Math.max(0, (height - (maxCount * gapY + 112)) / 2); });
    return { positions, width: Math.max(560, currentX + (maxDepth + 1) * gapX + 220), height };
  }

  async function render() {
    const token = ++renderToken;
    const nodes = collectNodes();
    if (!nodes.length) {
      if (app) { app.destroy(true); app = null; }
      showFallback("La carte apparaîtra lorsqu’une culture sera sélectionnée.");
      return;
    }
    try {
      const pixi = await loadPixi();
      if (token !== renderToken) return;
      if (app) { app.destroy(true); app = null; }
      stage.replaceChildren();
      const graph = layout(nodes);
      const nextApp = new pixi.Application();
      await nextApp.init({
        width: graph.width,
        height: graph.height,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        autoStart: false,
        preference: "webgl"
      });
      if (token !== renderToken) { nextApp.destroy(true); return; }
      app = nextApp;
      nextApp.canvas.className = "lineage-graph-canvas";
      nextApp.canvas.setAttribute("aria-hidden", "true");
      nextApp.canvas.style.width = graph.width + "px";
      nextApp.canvas.style.height = graph.height + "px";
      stage.appendChild(nextApp.canvas);

      const { Container, Graphics, Text, Rectangle } = pixi;
      const scene = new Container();
      nextApp.stage.addChild(scene);
      const nodeWidth = 184, nodeHeight = 68;
      const byId = graph.positions;
      const drawEdge = (from, to) => {
        if (!from || !to) return;
        const line = new Graphics().moveTo(from.x + nodeWidth, from.y + nodeHeight / 2)
          .lineTo(to.x, to.y + nodeHeight / 2)
          .stroke({ color: colors.line, alpha: 0.72, width: 1.5 });
        scene.addChild(line);
      };
      nodes.forEach(node => {
        if (node.parentId && byId.has(node.parentId)) drawEdge(byId.get(node.parentId), byId.get(node.id));
      });
      // Keep the source-to-current chain visible even when a parent record is outside the loaded data.
      const orderedAncestors = nodes.filter(n => n.role === "ancestor");
      const current = nodes.find(n => n.role === "current");
      orderedAncestors.forEach((node, index) => {
        const child = orderedAncestors[index + 1] || current;
        if (child && !node.parentId) drawEdge(byId.get(node.id), byId.get(child.id));
      });

      const drawNode = (node, point) => {
        const color = colors[node.role] || colors.line;
        const card = new Container();
        card.position.set(point.x, point.y);
        card.eventMode = "static";
        card.cursor = "pointer";
        card.hitArea = new Rectangle(0, 0, nodeWidth, nodeHeight);
        const plate = new Graphics().roundRect(0, 0, nodeWidth, nodeHeight, 10)
          .fill({ color: 0x202d2b, alpha: 0.98 })
          .stroke({ color, alpha: node.role === "current" ? 0.9 : 0.52, width: node.role === "current" ? 2 : 1 });
        card.addChild(plate);
        const marker = new Graphics().roundRect(0, 0, 4, nodeHeight, 3).fill({ color, alpha: 0.95 });
        card.addChild(marker);
        const title = new Text({ text: node.title.length > 24 ? node.title.slice(0, 22) + "…" : node.title, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 12, fontWeight: "700", fill: colors.text } });
        title.position.set(14, 14);
        card.addChild(title);
        const subtitle = new Text({ text: node.subtitle.length > 30 ? node.subtitle.slice(0, 28) + "…" : node.subtitle, style: { fontFamily: "Inter,Arial,sans-serif", fontSize: 9, fill: colors.muted } });
        subtitle.position.set(14, 39);
        card.addChild(subtitle);
        card.on("pointertap", () => node.button.click());
        card.on("pointerover", () => { plate.clear().roundRect(0, 0, nodeWidth, nodeHeight, 10).fill({ color: 0x2c3b36, alpha: 1 }).stroke({ color, alpha: 1, width: 2 }); });
        card.on("pointerout", () => { plate.clear().roundRect(0, 0, nodeWidth, nodeHeight, 10).fill({ color: 0x202d2b, alpha: 0.98 }).stroke({ color, alpha: node.role === "current" ? 0.9 : 0.52, width: node.role === "current" ? 2 : 1 }); });
        scene.addChild(card);
      };
      nodes.forEach(node => {
        const point = byId.get(node.id);
        if (point) drawNode(node, point);
      });
      if (reducedMotion) nextApp.stop();
      else nextApp.start();
      shell.dataset.graphState = "ready";
    } catch (error) {
      console.info("BA Labs: carte PixiJS indisponible, liste de filiation conservée.", error);
      shell.dataset.graphState = "fallback";
      showFallback("La visualisation graphique est indisponible. La liste détaillée reste accessible ci-dessous.");
    }
  }

  const scheduleRender = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { void render(); });
  };
  const observer = new MutationObserver(scheduleRender);
  observer.observe(target, { childList: true, subtree: true });
  scheduleRender();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    if (app) app.destroy(true);
    app = null;
  }, { once: true });
})();
