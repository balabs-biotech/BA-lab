/* BA Labs OSINT NDVI MVP: display precomputed regional change summaries. */
(() => {
  "use strict";
  const dataUrl = "../data/osint-ndvi-transitions.json";
  const fmt = (v, digits = 1) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const el = (tag, attrs = {}, text = "") => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text !== "") n.textContent = text;
    return n;
  };
  function render(data) {
    if (document.getElementById("osintNdviCard")) return;
    const anchor = document.getElementById("environmentalCard") || document.getElementById("plantCard");
    if (!anchor || !anchor.parentNode) return false;
    const panel = el("section", { id: "osintNdviCard", class: "card" });
    panel.append(el("div", { class: "section-kicker" }, "OSINT · TÉLÉDÉTECTION"));
    panel.append(el("h2", {}, "Évolution régionale de la végétation (NDVI)"));
    panel.append(el("p", { class: "muted" }, "Analyse Sentinel-2 L2A sur une emprise régionale d’environ 898 km². Ces indicateurs décrivent la variation du signal de végétation ; ils ne constituent pas un diagnostic de culture ni une confirmation de parcelles."));
    const latest = data.transitions[data.transitions.length - 1];
    const largestDecline = data.transitions.reduce((a, b) => b.delta_NDVI_median < a.delta_NDVI_median ? b : a);
    const grid = el("div", { class: "grid" });
    const metric = (label, value, note) => {
      const card = el("article", { class: "card" });
      card.append(el("strong", {}, label), el("p", {}, value), el("small", { class: "muted" }, note));
      grid.append(card);
    };
    metric("Dernière médiane NDVI", fmt(data.observations[data.observations.length - 1].median_ndvi, 3), "22 octobre 2026 · pixels valides : " + fmt(data.observations[data.observations.length - 1].valid_aoi_pct, 2) + " % de l’emprise");
    metric("Baisse médiane la plus forte", fmt(largestDecline.delta_NDVI_median, 3), largestDecline.date_depart + " → " + largestDecline.date_arrivee);
    metric("Couverture comparable récente", fmt(latest.couverture_comparable_pct, 2) + " %", latest.date_depart + " → " + latest.date_arrivee);
    panel.append(grid);
    panel.append(el("h3", {}, "Trajectoire du NDVI médian"));
    const chartWrap = el("div", { class: "card", role: "img", "aria-label": "Graphique du NDVI médian aux cinq dates Sentinel-2" });
    const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("viewBox", "0 0 640 250");
    chart.setAttribute("width", "100%");
    chart.setAttribute("height", "auto");
    chart.setAttribute("aria-hidden", "true");
    const NS = "http://www.w3.org/2000/svg";
    const addSvg = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
      if (text !== undefined) n.textContent = text;
      chart.append(n);
      return n;
    };
    const left = 52, right = 610, top = 18, bottom = 190;
    [0, 0.2, 0.4, 0.6, 0.8].forEach(v => {
      const y = bottom - (v / 0.9) * (bottom - top);
      addSvg("line", { x1: left, y1: y, x2: right, y2: y, stroke: "#dfe5df", "stroke-width": 1 });
      addSvg("text", { x: left - 10, y: y + 4, "text-anchor": "end", fill: "currentColor", "font-size": 11 }, v.toFixed(1));
    });
    const xAt = i => left + i * (right - left) / (data.observations.length - 1);
    const yAt = v => bottom - (v / 0.9) * (bottom - top);
    const points = data.observations.map((o, i) => xAt(i) + "," + yAt(o.median_ndvi)).join(" ");
    addSvg("polyline", { points, fill: "none", stroke: "#276749", "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" });
    data.observations.forEach((o, i) => {
      const x = xAt(i), y = yAt(o.median_ndvi);
      addSvg("circle", { cx: x, cy: y, r: 5, fill: "#276749", stroke: "#ffffff", "stroke-width": 2 });
      addSvg("text", { x, y: y - 11, "text-anchor": "middle", fill: "currentColor", "font-size": 11 }, fmt(o.median_ndvi, 3));
      addSvg("text", { x, y: 211, "text-anchor": "middle", fill: "currentColor", "font-size": 10 }, o.date.slice(5));
    });
    chartWrap.append(chart);
    chartWrap.append(el("p", { class: "muted" }, "Valeurs médianes sur les pixels terrestres valides de chaque acquisition. Les dates sont saisonnières et les surfaces valides diffèrent ; ne pas interpréter la courbe comme une mesure directe de rendement."));
    panel.append(chartWrap);
    panel.append(el("h3", {}, "Comparaison entre acquisitions"));
    const table = el("table", { class: "table" });
    const thead = el("thead");
    const header = el("tr");
    ["Période", "Δ NDVI médian", "Pixels en baisse > 0,05", "Variation faible/modérée", "Couverture commune"].forEach(t => header.append(el("th", {}, t)));
    thead.append(header); table.append(thead);
    const tbody = el("tbody");
    data.transitions.forEach(t => {
      const row = el("tr");
      row.append(el("td", {}, t.date_depart + " → " + t.date_arrivee));
      row.append(el("td", {}, (t.delta_NDVI_median > 0 ? "+" : "") + fmt(t.delta_NDVI_median, 3)));
      row.append(el("td", {}, fmt(t.baisse_inf_moins_0_05_pct, 2) + " %"));
      row.append(el("td", {}, fmt(t.variation_faible_ou_moderee_pct, 2) + " %"));
      row.append(el("td", {}, fmt(t.couverture_comparable_pct, 2) + " %"));
      tbody.append(row);
    });
    table.append(tbody); panel.append(table);
    const note = el("p", { class: "muted" }, "Seuil ±0,05 descriptif uniquement. La transition vers le 22 octobre 2026 ne couvre que 74,68 % de l’emprise en pixels comparables ; interpréter avec prudence. Les baisses estivales peuvent refléter la saisonnalité, les récoltes, le sol nu ou d’autres facteurs.");
    panel.append(note);
    const status = el("p", { class: "muted", "aria-live": "polite" }, "Résumé pré-calculé. Les 65 zones candidates ne sont pas encore affichées : leur GeoJSON complet doit être importé dans les ressources de l’application après contrôle géospatial.");
    panel.append(status);
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    return true;
  }
  async function start() {
    try {
      const response = await fetch(dataUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!Array.isArray(data.transitions) || data.transitions.length !== 4) throw new Error("Format de données inattendu");
      if (render(data)) return;
      const observer = new MutationObserver(() => { if (render(data)) observer.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (error) {
      console.error("OSINT NDVI indisponible :", error);
    }
  }
  start();
})();
