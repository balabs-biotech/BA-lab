/* BA Labs CultureOps — spatial module navigation.
   Uses the existing module links and activation handlers; it does not touch data state. */
(() => {
  "use strict";
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    // Navigation remains fully functional; only animated transitions are disabled.
  }

  const hero = document.querySelector(".app-hero");
  const nav = document.getElementById("sectionNavigation");
  if (!hero || !nav || document.querySelector(".ba-module-rail")) return;

  const modulesByDomain = {
    agronomy: ["overviewCard", "plantCard", "measurementCard", "statisticsCard"],
    mycology: ["overviewCard", "trackerCard", "measurementCard", "statisticsCard"],
    laboratory: ["overviewCard", "trackerCard", "batchCard", "measurementCard", "statisticsCard"],
  };
  const allowedModuleIds = new Set(
    modulesByDomain[document.body.dataset.domain] || modulesByDomain.laboratory
  );
  const navigationCopy = {
    fr: { rail: "Navigation rapide entre les modules", eyebrow: "Parcours du workspace", steps: "Étapes du workspace", group: "Déplacement entre les modules", above: "Module au-dessus", left: "Module à gauche", below: "Module en dessous", right: "Module à droite", goTo: "Aller au module", workspace: "Espace de travail" },
    en: { rail: "Quick navigation between modules", eyebrow: "Workspace path", steps: "Workspace steps", group: "Move between modules", above: "Module above", left: "Module to the left", below: "Module below", right: "Module to the right", goTo: "Go to module", workspace: "Workspace" },
    pt: { rail: "Navegação rápida entre módulos", eyebrow: "Percurso do workspace", steps: "Etapas do workspace", group: "Mover entre módulos", above: "Módulo acima", left: "Módulo à esquerda", below: "Módulo abaixo", right: "Módulo à direita", goTo: "Ir para o módulo", workspace: "Espaço de trabalho" },
    ar: { rail: "التنقل السريع بين الوحدات", eyebrow: "مسار مساحة العمل", steps: "خطوات مساحة العمل", group: "التنقل بين الوحدات", above: "الوحدة أعلاه", left: "الوحدة إلى اليسار", below: "الوحدة أدناه", right: "الوحدة إلى اليمين", goTo: "الانتقال إلى الوحدة", workspace: "مساحة العمل" },
  };
  const copy = () => navigationCopy[document.documentElement.lang] || navigationCopy.fr;


  const style = document.createElement("style");
  style.id = "ba-module-rail-style";
  style.textContent = `
    .ba-module-rail{display:none;grid-template-columns:minmax(170px,.85fr) minmax(180px,1.4fr) auto;align-items:center;gap:22px;margin:0 0 22px;padding:15px 18px;border:1px solid var(--workspace-accent-border,rgba(160,190,170,.22));border-radius:14px;background:linear-gradient(110deg,rgba(255,255,255,.035),rgba(255,255,255,.012));}
    body.workspace-authenticated .ba-module-rail{display:grid}
    .ba-module-rail__meta{display:grid;gap:4px;min-width:0}
    .ba-module-rail__eyebrow{color:var(--workspace-accent,var(--domain-accent));font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
    .ba-module-rail__title{overflow:hidden;color:var(--paper,#eef2ed);font-size:14px;font-weight:760;text-overflow:ellipsis;white-space:nowrap}
    .ba-module-rail__count{color:var(--muted);font-size:10px;font-variant-numeric:tabular-nums;letter-spacing:.08em}
    .ba-module-rail__steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:7px;min-width:0}
    .ba-module-rail__step{position:relative;width:100%;height:5px;padding:0;border:0;border-radius:99px;background:rgba(160,180,170,.2);cursor:pointer;transition:background .18s ease,transform .18s ease}
    .ba-module-rail__step[aria-current="step"]{background:var(--workspace-accent,var(--domain-accent));box-shadow:0 0 14px color-mix(in srgb,var(--workspace-accent,var(--domain-accent)) 32%,transparent)}
    .ba-module-rail__step:hover{transform:scaleY(1.8)}
    .ba-module-rail__controls{display:grid;justify-items:center;gap:4px}
    .ba-module-rail__hint{color:var(--muted);font-size:8px;white-space:nowrap}
    .ba-module-rail__pad{display:grid;grid-template-columns:repeat(3,30px);grid-template-rows:repeat(2,28px);gap:3px}
    .ba-module-rail__button{display:grid;place-items:center;width:30px;height:28px;padding:0;border:1px solid var(--workspace-accent-border,rgba(160,190,170,.22));border-radius:8px;background:rgba(255,255,255,.035);color:var(--paper,#eef2ed);font-size:15px;line-height:1;cursor:pointer}
    .ba-module-rail__button[data-direction="up"]{grid-column:2;grid-row:1}
    .ba-module-rail__button[data-direction="left"]{grid-column:1;grid-row:2}
    .ba-module-rail__button[data-direction="down"]{grid-column:2;grid-row:2}
    .ba-module-rail__button[data-direction="right"]{grid-column:3;grid-row:2}
    .ba-module-rail__button:hover:not(:disabled){border-color:var(--workspace-accent,var(--domain-accent));background:var(--workspace-accent-soft,rgba(255,255,255,.06))}
    .ba-module-rail__button:disabled{opacity:.3;cursor:not-allowed}
    .ba-module-rail__button:focus-visible,.ba-module-rail__step:focus-visible{outline:2px solid var(--workspace-accent,var(--domain-accent));outline-offset:3px}
    @media(max-width:720px){.ba-module-rail{grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px}.ba-module-rail__steps{grid-column:1/-1;grid-row:2;justify-content:flex-start}.ba-module-rail__step{max-width:none}.ba-module-rail__hint{display:none}}
    @media(prefers-reduced-motion:reduce){.ba-module-rail__step,.ba-module-rail__button{transition:none}}
  `;
  document.head.appendChild(style);

  const rail = document.createElement("nav");
  rail.className = "ba-module-rail";
  rail.setAttribute("aria-label", copy().rail);
  rail.innerHTML = `
    <div class="ba-module-rail__meta">
      <span class="ba-module-rail__eyebrow"></span>
      <strong class="ba-module-rail__title" aria-live="polite">Vue générale</strong>
      <span class="ba-module-rail__count">01 / 04</span>
    </div>
    <div class="ba-module-rail__steps"></div>
    <div class="ba-module-rail__controls">
      <span class="ba-module-rail__hint">ALT + ↑ ↓ ← →</span>
      <div class="ba-module-rail__pad" role="group">
        <button class="ba-module-rail__button" type="button" data-direction="up" aria-label="">↑</button>
        <button class="ba-module-rail__button" type="button" data-direction="left" aria-label="">←</button>
        <button class="ba-module-rail__button" type="button" data-direction="down" aria-label="">↓</button>
        <button class="ba-module-rail__button" type="button" data-direction="right" aria-label="">→</button>
      </div>
    </div>`;
  hero.insertAdjacentElement("afterend", rail);

  const stepsHost = rail.querySelector(".ba-module-rail__steps");
  const titleNode = rail.querySelector(".ba-module-rail__title");
  const countNode = rail.querySelector(".ba-module-rail__count");
  const directionButtons = Array.from(rail.querySelectorAll(".ba-module-rail__button"));
  let links = [];
  let activeIndex = 0;

  const updateLabels = () => {
    const labels = copy();
    rail.setAttribute("aria-label", labels.rail);
    rail.querySelector(".ba-module-rail__eyebrow").textContent = labels.eyebrow;
    stepsHost.setAttribute("aria-label", labels.steps);
    rail.querySelector(".ba-module-rail__pad").setAttribute("aria-label", labels.group);
    const names = { up: labels.above, left: labels.left, down: labels.below, right: labels.right };
    directionButtons.forEach((button) => button.setAttribute("aria-label", names[button.dataset.direction]));
    titleNode.textContent = links[activeIndex] ? labelFor(links[activeIndex]) : labels.workspace;
    Array.from(stepsHost.children).forEach((step, index) => {
      step.setAttribute("aria-label", labels.goTo + " " + (index + 1) + " : " + labelFor(links[index]));
    });
  };

  const labelFor = (link) => {
    const number = link.querySelector(".nav-number")?.textContent?.trim() || "";
    const label = link.textContent.replace(number, "").replace(/\s+/g, " ").trim();
    return label || link.getAttribute("href")?.slice(1) || "Module";
  };

  const refreshLinks = () => {
    links = Array.from(nav.querySelectorAll('a[href^="#"]')).filter((link) => {
      const id = link.getAttribute("href").slice(1);
      const panel = document.getElementById(id);
      return allowedModuleIds.has(id) && panel && !link.hidden && !panel.hidden &&
        !panel.classList.contains("hidden") && !link.closest("[hidden]");
    });
    stepsHost.replaceChildren();
    links.forEach((link, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ba-module-rail__step";
      button.setAttribute("aria-label", copy().goTo + " " + (index + 1) + " : " + labelFor(link));
      button.title = labelFor(link);
      button.addEventListener("click", () => link.click());
      stepsHost.appendChild(button);
    });
    sync();
  };

  const sync = () => {
    const current = links.findIndex((link) => link.getAttribute("aria-current") === "page");
    if (current >= 0) activeIndex = current;
    activeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, links.length - 1)));
    const currentLink = links[activeIndex];
    titleNode.textContent = currentLink ? labelFor(currentLink) : copy().workspace;
    countNode.textContent = String(activeIndex + 1).padStart(2, "0") + " / " + String(links.length).padStart(2, "0");
    Array.from(stepsHost.children).forEach((step, index) => {
      if (index === activeIndex) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    const column = activeIndex % 2;
    directionButtons.forEach((button) => {
      const direction = button.dataset.direction;
      button.disabled =
        (direction === "left" && column === 0) ||
        (direction === "right" && (column === 1 || activeIndex + 1 >= links.length)) ||
        (direction === "up" && activeIndex < 2) ||
        (direction === "down" && activeIndex + 2 >= links.length);
    });
  };

  const move = (direction) => {
    if (!links.length) return;
    const column = activeIndex % 2;
    let nextIndex = activeIndex;
    if (direction === "left" && column === 1) nextIndex -= 1;
    if (direction === "right" && column === 0) nextIndex += 1;
    if (direction === "up") nextIndex -= 2;
    if (direction === "down") nextIndex += 2;
    if (nextIndex < 0 || nextIndex >= links.length || nextIndex === activeIndex) return;
    links[nextIndex].click();
    activeIndex = nextIndex;
    sync();
  };

  directionButtons.forEach((button) => {
    button.addEventListener("click", () => move(button.dataset.direction));
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      window.setTimeout(() => {
        refreshLinks();
        sync();
      }, 0);
    }
  });

  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("workspace-authenticated")) {
      refreshLinks();
    }
  });
  observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ["aria-current", "hidden"] });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("workspace-authenticated") || !event.altKey) return;
    const directions = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    const direction = directions[event.key];
    if (!direction) return;
    if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable='true']")) return;
    event.preventDefault();
    move(direction);
  });

  let touchStart = null;
  rail.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    touchStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  rail.addEventListener("pointerup", (event) => {
    if (!touchStart || event.pointerType !== "touch") return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      move(dx < 0 ? "right" : "left");
    } else if (Math.abs(dy) > 48 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      move(dy < 0 ? "down" : "up");
    }
  }, { passive: true });

  updateLabels();
  refreshLinks();
  const languageObserver = new MutationObserver(updateLabels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
})();