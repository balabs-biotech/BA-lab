/* BA Labs CultureOps — pointer-reactive surfaces inspired by kinetic UI systems.
   Vanilla JS, delegated events, one animation frame at most; no framework dependency. */
(() => {
  "use strict";
  const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
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
