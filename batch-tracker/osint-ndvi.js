/* BA Labs OSINT NDVI MVP: display precomputed regional change summaries. */
(() => {
  "use strict";
  const dataUrl = "../data/osint-ndvi-transitions.json";
  const zonesUrl = "../data/osint-priority-zones.csv";
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
    panel.append(el("h3", {}, "Zones candidates à examiner"));
    panel.append(el("p", { class: "muted" }, "65 points candidats issus du tableau zonal. Ce ne sont pas des limites parcellaires ni des diagnostics agronomiques confirmés."));
    const mapNode = el("div", { id: "osintPriorityMap", role: "region", "aria-label": "Carte des zones candidates de baisse NDVI" });
    mapNode.style.cssText = "height:420px;min-height:320px;border-radius:10px;border:1px solid #dfe5df;overflow:hidden;background:#f5f7f5;";
    panel.append(mapNode);
    const zoneStatus = el("p", { class: "muted", "aria-live": "polite" }, "Chargement des zones candidates…");
    panel.append(zoneStatus);
    const zoneTable = el("table", { class: "table" });
    const zhead = el("thead"), zrow = el("tr");
    ["Zone", "Surface estimée (ha)", "Fréquence moyenne de baisse", "Pixels avec 3 baisses ou plus", "Coordonnées"].forEach(t => zrow.append(el("th", {}, t)));
    zhead.append(zrow); zoneTable.append(zhead);
    const zbody = el("tbody"); zoneTable.append(zbody); panel.append(zoneTable);
    loadZones(mapNode, zoneStatus, zbody);
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    return true;
  }
  async function loadZones(mapNode, statusNode, tbody) {
    try {
      const response = await fetch(zonesUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const lines = (await response.text()).trim().split(/\r?\n/);
      const headers = lines.shift().split(",");
      const records = lines.filter(Boolean).map(line => {
        const values = line.split(","), row = {};
        headers.forEach((h, i) => row[h] = values[i]);
        ["zone_id","pixels","surface_ha","longitude","latitude","frequence_baisse_moyenne","frequence_baisse_mediane","pixels_3_baisses_ou_plus_pct","transitions_valides_moyenne","pixels_3_baisses_estimes"].forEach(k => row[k] = Number(row[k]));
        return row;
      }).filter(z => Number.isFinite(z.longitude) && Number.isFinite(z.latitude));
      if (!records.length) throw new Error("Aucune zone exploitable");
      [...records].sort((a,b) => b.pixels_3_baisses_ou_plus_pct-a.pixels_3_baisses_ou_plus_pct).slice(0,15).forEach(z => {
        const tr = el("tr"), td = el("td");
        tr.append(el("td", {}, String(z.zone_id)), el("td", {}, fmt(z.surface_ha,2)), el("td", {}, fmt(z.frequence_baisse_moyenne*100,1)+" %"), el("td", {}, fmt(z.pixels_3_baisses_ou_plus_pct,2)+" %"));
        td.append(el("a", { href:"https://www.openstreetmap.org/?mlat="+z.latitude+"&mlon="+z.longitude+"#map=15/"+z.latitude+"/"+z.longitude, target:"_blank", rel:"noopener noreferrer" }, fmt(z.latitude,5)+", "+fmt(z.longitude,5)));
        tr.append(td); tbody.append(tr);
      });
      statusNode.textContent = records.length+" zones chargées. Le tableau affiche les 15 points avec la plus forte proportion de pixels ayant connu au moins trois baisses.";
      const css = document.createElement("link"); css.rel="stylesheet"; css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.append(css);
      await new Promise((resolve,reject) => { if(window.L) return resolve(); const s=document.createElement("script"); s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload=resolve; s.onerror=()=>reject(new Error("Leaflet indisponible")); document.head.append(s); });
      const map = window.L.map(mapNode).setView([36.24,5.36],10);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap contributors"}).addTo(map);
      const markers=[];
      records.forEach(z => { const m=window.L.circleMarker([z.latitude,z.longitude],{radius:Math.max(4,Math.min(10,3+Math.sqrt(z.surface_ha))),color:"#7f1d1d",fillColor:"#dc6b45",fillOpacity:0.72,weight:1}).bindPopup("<strong>Zone "+z.zone_id+"</strong><br>Surface estimée : "+fmt(z.surface_ha,2)+" ha<br>Fréquence moyenne de baisse : "+fmt(z.frequence_baisse_moyenne*100,1)+" %<br>Pixels avec 3 baisses ou plus : "+fmt(z.pixels_3_baisses_ou_plus_pct,2)+" %").addTo(map); markers.push(m); });
      if(markers.length) map.fitBounds(window.L.featureGroup(markers).getBounds().pad(0.08));
      setTimeout(() => map.invalidateSize(),150);
    } catch(error) {
      console.error("Carte OSINT indisponible :", error);
      statusNode.textContent = error && error.message === "Leaflet indisponible"
        ? "Les données sont chargées, mais la bibliothèque cartographique externe est inaccessible. Réessayez avec une connexion active ; le tableau de points reste disponible."
        : "Impossible de charger les données des zones. Vérifiez que le fichier CSV est accessible puis rechargez la page.";
    }
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
