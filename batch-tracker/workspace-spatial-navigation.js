/* BA Labs CultureOps — spatial module navigation.
   Keeps the existing data/workflow engine intact and exposes its modules as a
   compact two-plane workspace: operations above, analysis below. */
(() => {
  "use strict";

  const domainMaps = {
    agronomy: {
      primary: ["overviewCard", "plantCard"],
      secondary: ["measurementCard", "statisticsCard"]
    },
    mycology: {
      primary: ["overviewCard", "trackerCard"],
      secondary: ["measurementCard", "statisticsCard"]
    },
    laboratory: {
      primary: ["overviewCard", "trackerCard", "batchCard"],
      secondary: ["measurementCard", "statisticsCard"]
    }
  };

  const labels = {
    overviewCard: "Vue générale",
    trackerCard: "Cultures",
    plantCard: "Cultures végétales",
    batchCard: "Lots de production",
    measurementCard: "Données & observations",
    statisticsCard: "Analyse"
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let dock;
  let status;
  let controls = {};
  let observer;

  const mapForDomain = () => domainMaps[document.body.dataset.domain] || domainMaps.laboratory;
  const available = id => {
    const panel = document.getElementById(id);
    return Boolean(panel && !panel.hidden && !panel.classList.contains("hidden"));
  };

  function currentModule(map = mapForDomain()) {
    return [...map.primary, ...map.secondary].find(id => {
      const panel = document.getElementById(id);
      return panel && !panel.classList.contains("workspace-inactive") && available(id);
    }) || "overviewCard";
  }

  function createDock() {
    if (dock || !document.querySelector(".app-toolbar")) return;
    dock = document.createElement("nav");
    dock.className = "ba-spatial-dock";
    dock.setAttribute("aria-label", "Navigation spatiale CultureOps");
    dock.innerHTML = `
      <div class="ba-spatial-context">
        <span class="ba-spatial-kicker">ESPACE ACTIF</span>
        <strong class="ba-spatial-title" id="baSpatialTitle">Vue générale</strong>
        <span class="ba-spatial-plane" id="baSpatialPlane">Pilotage</span>
      </div>
      <div class="ba-spatial-pad" role="group" aria-label="Déplacements entre modules">
        <button type="button" data-ba-direction="up" aria-label="Monter vers le pilotage" title="Monter">↑</button>
        <button type="button" data-ba-direction="left" aria-label="Module précédent" title="À gauche">←</button>
        <span class="ba-spatial-center" aria-hidden="true"><i></i></span>
        <button type="button" data-ba-direction="right" aria-label="Module suivant" title="À droite">→</button>
        <button type="button" data-ba-direction="down" aria-label="Descendre vers les données" title="Descendre">↓</button>
      </div>
      <div class="ba-spatial-progress" aria-hidden="true"><span id="baSpatialCount">01 / 04</span><div><i id="baSpatialProgress"></i></div></div>
      <span class="ba-spatial-live" id="baSpatialLive" aria-live="polite" aria-atomic="true"></span>
    `;
    const toolbar = document.querySelector(".app-toolbar");
    toolbar.insertAdjacentElement("afterend", dock);
    status = dock.querySelector("#baSpatialLive");
    dock.querySelectorAll("[data-ba-direction]").forEach(button => {
      controls[button.dataset.baDirection] = button;
      button.addEventListener("click", () => move(button.dataset.baDirection));
    });
  }

  function activeRow(map, id) {
    return map.primary.includes(id) ? "primary" : "secondary";
  }

  function destination(direction, map, current) {
    const row = activeRow(map, current);
    const rowItems = map[row].filter(available);
    const index = Math.max(0, rowItems.indexOf(current));
    if (direction === "left" || direction === "right") {
      const nextIndex = index + (direction === "left" ? -1 : 1);
      return rowItems[nextIndex] || null;
    }
    const other = row === "primary" ? "secondary" : "primary";
    const otherItems = map[other].filter(available);
    if (!otherItems.length) return null;
    return otherItems[Math.min(index, otherItems.length - 1)] || otherItems[0];
  }

  function syncDock() {
    if (!dock) return;
    const map = mapForDomain();
    const current = currentModule(map);
    const row = activeRow(map, current);
    const rowItems = map[row].filter(available);
    const index = Math.max(0, rowItems.indexOf(current));
    const allItems = [...map.primary, ...map.secondary].filter(available);
    const overallIndex = Math.max(0, allItems.indexOf(current));
    const title = dock.querySelector("#baSpatialTitle");
    const plane = dock.querySelector("#baSpatialPlane");
    const count = dock.querySelector("#baSpatialCount");
    const progress = dock.querySelector("#baSpatialProgress");
    if (title) title.textContent = labels[current] || "Espace";
    if (plane) plane.textContent = row === "primary" ? "Pilotage & opérations" : "Données & analyse";
    if (count) count.textContent = String(overallIndex + 1).padStart(2, "0") + " / " + String(allItems.length).padStart(2, "0");
    if (progress) progress.style.width = ((overallIndex + 1) / Math.max(1, allItems.length) * 100) + "%";
    if (status) status.textContent = "Espace actif : " + (labels[current] || current);
    Object.entries(controls).forEach(([direction, button]) => {
      const target = destination(direction, map, current);
      button.disabled = !target;
      button.setAttribute("aria-disabled", String(!target));
    });
    dock.hidden = !document.body.classList.contains("workspace-authenticated");
  }

  function move(direction) {
    const map = mapForDomain();
    const current = currentModule(map);
    const target = destination(direction, map, current);
    if (!target || typeof window.activateWorkspaceModule !== "function") return;
    window.activateWorkspaceModule(target);
    const panel = document.getElementById(target);
    if (panel) {
      panel.classList.remove("ba-spatial-enter");
      void panel.offsetWidth;
      panel.classList.add("ba-spatial-enter");
      panel.scrollIntoView({
        block: "start",
        behavior: reducedMotion ? "auto" : "smooth"
      });
      const heading = panel.querySelector("h2");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
    syncDock();
  }

  function initialize() {
    createDock();
    if (!dock) return;
    syncDock();
    if (observer) observer.disconnect();
    observer = new MutationObserver(syncDock);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-domain"], subtree: true });
  }

  document.addEventListener("keydown", event => {
    if (!dock || dock.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true'],button:not(.ba-spatial-pad button)")) return;
    const directions = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const direction = directions[event.key];
    if (!direction) return;
    const button = controls[direction];
    if (!button || button.disabled) return;
    event.preventDefault();
    move(direction);
  });

  let touchStart = null;
  document.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" || !(event.target instanceof Element)) return;
    if (event.target.closest("input,textarea,select,button,a,summary,canvas,[role='slider']")) return;
    if (!event.target.closest(".app-hero,.card")) return;
    touchStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  document.addEventListener("pointerup", event => {
    if (!touchStart || event.pointerType !== "touch") return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    const direction = dx < 0 ? "right" : "left";
    if (controls[direction] && !controls[direction].disabled) move(direction);
  }, { passive: true });

  initialize();
  const authObserver = new MutationObserver(() => {
    if (!dock) createDock();
    syncDock();
  });
  authObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-domain"] });
})();
