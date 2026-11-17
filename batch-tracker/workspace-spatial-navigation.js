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

  const translations = {
    fr: {
      nav: "Navigation spatiale CultureOps", group: "Déplacements entre modules", kicker: "ESPACE ACTIF",
      primary: "Pilotage & opérations", secondary: "Données & analyse",
      up: "Monter vers le pilotage", down: "Descendre vers les données",
      left: "Module précédent", right: "Module suivant", active: "Espace actif : ",
      labels: { overviewCard: "Vue générale", trackerCard: "Cultures", plantCard: "Cultures végétales", batchCard: "Lots de production", measurementCard: "Données & observations", statisticsCard: "Analyse" }
    },
    en: {
      nav: "CultureOps spatial navigation", group: "Move between modules", kicker: "ACTIVE SPACE",
      primary: "Operations & control", secondary: "Data & analysis",
      up: "Move up to control", down: "Move down to data",
      left: "Previous module", right: "Next module", active: "Active space: ",
      labels: { overviewCard: "Overview", trackerCard: "Cultures", plantCard: "Plant cultures", batchCard: "Production batches", measurementCard: "Data & observations", statisticsCard: "Analysis" }
    },
    pt: {
      nav: "Navegação espacial CultureOps", group: "Mover entre módulos", kicker: "ESPAÇO ATIVO",
      primary: "Gestão & operações", secondary: "Dados & análise",
      up: "Subir para gestão", down: "Descer para dados",
      left: "Módulo anterior", right: "Módulo seguinte", active: "Espaço ativo: ",
      labels: { overviewCard: "Visão geral", trackerCard: "Culturas", plantCard: "Culturas vegetais", batchCard: "Lotes de produção", measurementCard: "Dados & observações", statisticsCard: "Análise" }
    },
    ar: {
      nav: "التنقل المكاني CultureOps", group: "التنقل بين الوحدات", kicker: "المساحة النشطة",
      primary: "الإدارة والعمليات", secondary: "البيانات والتحليل",
      up: "الصعود إلى الإدارة", down: "النزول إلى البيانات",
      left: "الوحدة السابقة", right: "الوحدة التالية", active: "المساحة النشطة: ",
      labels: { overviewCard: "نظرة عامة", trackerCard: "المزارع الفطرية", plantCard: "المحاصيل النباتية", batchCard: "دفعات الإنتاج", measurementCard: "البيانات والملاحظات", statisticsCard: "التحليل" }
    }
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
    dock.setAttribute("aria-label", translations.fr.nav);
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
    toolbar.appendChild(dock);
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
    const language = (window.BALabsI18n?.language || document.documentElement.lang || "fr").slice(0, 2).toLowerCase();
    const t = translations[language] || translations.fr;
    dock.setAttribute("aria-label", t.nav);
    dock.querySelector(".ba-spatial-kicker").textContent = t.kicker;
    dock.querySelector(".ba-spatial-pad").setAttribute("aria-label", t.group);
    controls.up.setAttribute("aria-label", t.up);
    controls.up.title = t.up;
    controls.down.setAttribute("aria-label", t.down);
    controls.down.title = t.down;
    controls.left.setAttribute("aria-label", t.left);
    controls.left.title = t.left;
    controls.right.setAttribute("aria-label", t.right);
    controls.right.title = t.right;
    const row = activeRow(map, current);
    const rowItems = map[row].filter(available);
    const index = Math.max(0, rowItems.indexOf(current));
    const allItems = [...map.primary, ...map.secondary].filter(available);
    const overallIndex = Math.max(0, allItems.indexOf(current));
    const title = dock.querySelector("#baSpatialTitle");
    const plane = dock.querySelector("#baSpatialPlane");
    const count = dock.querySelector("#baSpatialCount");
    const progress = dock.querySelector("#baSpatialProgress");
    if (title) title.textContent = t.labels[current] || "Workspace";
    if (plane) plane.textContent = row === "primary" ? t.primary : t.secondary;
    if (count) count.textContent = String(overallIndex + 1).padStart(2, "0") + " / " + String(allItems.length).padStart(2, "0");
    if (progress) progress.style.width = ((overallIndex + 1) / Math.max(1, allItems.length) * 100) + "%";
    if (status) status.textContent = t.active + (t.labels[current] || current);
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
      const vectors = {
        left: [-14, 0],
        right: [14, 0],
        up: [0, -12],
        down: [0, 12]
      };
      const [enterX, enterY] = vectors[direction] || [12, 0];
      panel.style.setProperty("--ba-spatial-enter-x", enterX + "px");
      panel.style.setProperty("--ba-spatial-enter-y", enterY + "px");
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
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-domain"] });
    [...mapForDomain().primary, ...mapForDomain().secondary].forEach(id => {
      const panel = document.getElementById(id);
      if (panel) observer.observe(panel, { attributes: true, attributeFilter: ["class", "hidden"] });
    });
  }

  document.addEventListener("keydown", event => {
    if (!dock || dock.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest("input,textarea,select,[contenteditable='true']")) return;
      const focusedButton = target.closest("button");
      if (focusedButton && !focusedButton.closest(".ba-spatial-pad")) return;
    }
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
    if (event.target.closest("input,textarea,select,button,a,summary,canvas,[role='slider'],.statistics-table-wrap,.culture-catalog-list,.measurement-history,[data-horizontal-scroll]")) return;
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
  const languageObserver = new MutationObserver(syncDock);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();
