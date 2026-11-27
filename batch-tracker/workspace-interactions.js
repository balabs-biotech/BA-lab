/* BA Labs CultureOps — pointer-reactive surfaces inspired by kinetic UI systems.
   Vanilla JS, delegated events, one animation frame at most; no framework dependency. */
(() => {
  "use strict";
  const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // Keep module navigation usable with a keyboard, including touch/reduced-motion
  // environments where pointer-reactive effects are intentionally disabled.
  document.addEventListener("keydown", event => {
    if (!(event.target instanceof Element)) return;
    const current = event.target.closest(".section-nav a");
    if (!current) return;
    const nav = current.closest(".section-nav");
    const links = [...(nav?.querySelectorAll("a") || [])].filter(link =>
      !link.hidden && link.getClientRects().length > 0
    );
    const index = links.indexOf(current);
    if (index < 0 || !links.length) return;
    const rtl = getComputedStyle(nav).direction === "rtl";
    let nextIndex = null;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = links.length - 1;
    else if (event.key === "ArrowRight") nextIndex = index + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") nextIndex = index + (rtl ? 1 : -1);
    if (nextIndex === null) return;
    event.preventDefault();
    links[(nextIndex + links.length) % links.length].focus();
  });

  if (!finePointer || reducedMotion) return;

  const selectors = [
    ".app-hero",
    ".bio-lineage-panel",
    ".bio-operation-panel",
    "#cultureDetailPanel",
    "#plantCard",
    "#batchCard",
    "#environmentalCard",
    "#satelliteColorMapPanel",
    "#agroSynthesisPanel",
    ".batch-production-panel",
    ".overview-shortcuts",
    ".overview-activity"
  ].join(",");
  let pending = false;
  let activeTarget = null;
  let pointerX = 0;
  let pointerY = 0;

  document.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
    const target = event.target.closest(selectors);
    if (!target) {
      activeTarget = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    activeTarget = target;
    pointerX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    pointerY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      if (activeTarget?.isConnected) {
        activeTarget.classList.add("ba-reactive-surface");
        activeTarget.style.setProperty("--ba-pointer-x", pointerX + "%");
        activeTarget.style.setProperty("--ba-pointer-y", pointerY + "%");
      }
      pending = false;
    });
  }, { passive: true });
})();
