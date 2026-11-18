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

  const style = document.createElement("style");
  style.id = "ba-module-rail-style";
  style.textContent = `
    .ba-module-rail{display:none;grid-template-columns:minmax(170px,.85fr) minmax(180px,1.4fr) auto;align-items:center;gap:22px;margin:0 0 22px;padding:15px 18px;border:1px solid var(--workspace-accent-border,rgba(160,190,170,.22));border-radius:14px;background:linear-gradient(110deg,rgba(255,255,255,.035),rgba(255,255,255,.012));}
    body.workspace-authenticated .ba-module-rail{display:grid}
    .ba-module-rail__meta{display:grid;gap:4px;min-width:0}
    .ba-module-rail__eyebrow{color:var(--workspace-accent,var(--domain-accent));font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
    .ba-module-rail__title{overflow:hidden;color:var(--paper,#eef2ed);font-size:14px;font-weight:760;text-overflow:ellipsis;white-space:nowrap}
    .ba-module-rail__count{color:var(--muted);font-size:10px;font-variant-numeric:tabular-nums;letter-spacing:.08em}
    .ba-module-rail__steps{display:flex;align-items:center;justify-content:center;gap:7px;min-width:0}
    .ba-module-rail__step{position:relative;flex:1 1 0;max-width:62px;height:4px;padding:0;border:0;border-radius:99px;background:rgba(160,180,170,.2);cursor:pointer;transition:background .18s ease,transform .18s ease}
    .ba-module-rail__step[aria-current="step"]{background:var(--workspace-accent,var(--domain-accent));box-shadow:0 0 14px color-mix(in srgb,var(--workspace-accent,var(--domain-accent)) 32%,transparent)}
    .ba-module-rail__step:hover{transform:scaleY(1.8)}
    .ba-module-rail__controls{display:flex;align-items:center;gap:7px}
    .ba-module-rail__hint{margin-right:5px;color:var(--muted);font-size:9px;white-space:nowrap}
    .ba-module-rail__button{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--workspace-accent-border,rgba(160,190,170,.22));border-radius:10px;background:rgba(255,255,255,.035);color:var(--paper,#eef2ed);font-size:18px;line-height:1;cursor:pointer}
    .ba-module-rail__button:hover:not(:disabled){border-color:var(--workspace-accent,var(--domain-accent));background:var(--workspace-accent-soft,rgba(255,255,255,.06))}
    .ba-module-rail__button:disabled{opacity:.3;cursor:not-allowed}
    .ba-module-rail__button:focus-visible,.ba-module-rail__step:focus-visible{outline:2px solid var(--workspace-accent,var(--domain-accent));outline-offset:3px}
    @media(max-width:720px){.ba-module-rail{grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px}.ba-module-rail__steps{grid-column:1/-1;grid-row:2;justify-content:flex-start}.ba-module-rail__step{max-width:none}.ba-module-rail__hint{display:none}}
    @media(prefers-reduced-motion:reduce){.ba-module-rail__step,.ba-module-rail__button{transition:none}}
  `;
  document.head.appendChild(style);

  const rail = document.createElement("nav");
  rail.className = "ba-module-rail";
  rail.setAttribute("aria-label", "Navigation rapide entre les modules");
  rail.innerHTML = `
    <div class="ba-module-rail__meta">
      <span class="ba-module-rail__eyebrow">Parcours du workspace</span>
      <strong class="ba-module-rail__title" aria-live="polite">Vue générale</strong>
      <span class="ba-module-rail__count">01 / 04</span>
    </div>
    <div class="ba-module-rail__steps" aria-label="Étapes du workspace"></div>
    <div class="ba-module-rail__controls">
      <span class="ba-module-rail__hint">ALT + ← / →</span>
      <button class="ba-module-rail__button" type="button" data-direction="-1" aria-label="Module précédent">‹</button>
      <button class="ba-module-rail__button" type="button" data-direction="1" aria-label="Module suivant">›</button>
    </div>`;
  hero.insertAdjacentElement("afterend", rail);

  const stepsHost = rail.querySelector(".ba-module-rail__steps");
  const titleNode = rail.querySelector(".ba-module-rail__title");
  const countNode = rail.querySelector(".ba-module-rail__count");
  const previousButton = rail.querySelector('[data-direction="-1"]');
  const nextButton = rail.querySelector('[data-direction="1"]');
  let links = [];
  let activeIndex = 0;

  const labelFor = (link) => {
    const number = link.querySelector(".nav-number")?.textContent?.trim() || "";
    const label = link.textContent.replace(number, "").replace(/\s+/g, " ").trim();
    return label || link.getAttribute("href")?.slice(1) || "Module";
  };

  const refreshLinks = () => {
    links = Array.from(nav.querySelectorAll('a[href^="#"]')).filter((link) => {
      const id = link.getAttribute("href").slice(1);
      const panel = document.getElementById(id);
      return panel && !link.hidden && !panel.hidden && !panel.classList.contains("hidden") &&
        !link.closest("[hidden]");
    });
    stepsHost.replaceChildren();
    links.forEach((link, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ba-module-rail__step";
      button.setAttribute("aria-label", "Aller au module " + (index + 1) + " : " + labelFor(link));
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
    titleNode.textContent = currentLink ? labelFor(currentLink) : "Workspace";
    countNode.textContent = String(activeIndex + 1).padStart(2, "0") + " / " + String(links.length).padStart(2, "0");
    Array.from(stepsHost.children).forEach((step, index) => {
      if (index === activeIndex) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    previousButton.disabled = activeIndex <= 0;
    nextButton.disabled = activeIndex >= links.length - 1;
  };

  const move = (direction) => {
    if (!links.length) return;
    const nextIndex = Math.max(0, Math.min(links.length - 1, activeIndex + direction));
    if (nextIndex === activeIndex) return;
    links[nextIndex].click();
    activeIndex = nextIndex;
    sync();
  };

  previousButton.addEventListener("click", () => move(-1));
  nextButton.addEventListener("click", () => move(1));

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
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable='true']")) return;
    event.preventDefault();
    move(event.key === "ArrowRight" ? 1 : -1);
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
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
  }, { passive: true });

  refreshLinks();
})();