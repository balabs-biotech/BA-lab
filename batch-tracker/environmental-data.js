/* BA Labs Green Tech: NASA POWER historical agroclimate. */
(() => {
  if (document.body.dataset.domain !== "agronomy" || !window.supabase) return;
  const db = window.supabase.createClient(
    "https://axcouwiodqsauwnsiotn.supabase.co",
    "sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992"
  );
  const node = (tag, attrs = {}, value = "") => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (value) n.textContent = value;
    return n;
  };
  const dateString = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  async function init() {
    const plant = document.getElementById("plantCard");
    if (!plant || document.getElementById("environmentalCard")) return;
    const panel = node("section", {id:"environmentalCard", class:"card hidden"});
    panel.append(node("div",{class:"section-kicker"},"OSINT AGRO-ENVIRONNEMENTAL"));
    panel.append(node("h2",{},"Contexte environnemental"));
    panel.append(node("p",{class:"muted"},"Historique NASA POWER : températures, précipitations, rayonnement solaire, humidité relative et vent. Estimations sur grille régionale, pas des mesures locales ni des prévisions."));
    const form = node("div",{class:"grid"});
    const field = (label,id,input) => { const w=node("div"); w.append(node("label",{for:id},label),input); return w; };
    const location=node("select",{id:"envLocation"}); location.append(node("option",{value:""},"Choisir un emplacement…"));
    const lat=node("input",{id:"envLat",type:"number",min:"-90",max:"90",step:"any",placeholder:"Latitude décimale"});
    const lon=node("input",{id:"envLon",type:"number",min:"-180",max:"180",step:"any",placeholder:"Longitude décimale"});
    const accuracy=node("input",{id:"envAccuracy",type:"number",min:"0",step:"any",placeholder:"Précision (m), facultatif"});
    const source=node("select",{id:"envSource"});
    [["user_confirmed","Vérifié par l’utilisateur"],["gps_field","GPS terrain"],["map_estimate","Estimation cartographique"]].forEach(([v,t])=>source.append(node("option",{value:v},t)));
    const end=new Date(); end.setDate(end.getDate()-1);
    const start=new Date(end); start.setDate(start.getDate()-29);
    const from=node("input",{id:"envFrom",type:"date",value:dateString(start)});
    const to=node("input",{id:"envTo",type:"date",value:dateString(end)});
    form.append(field("Emplacement","envLocation",location),field("Latitude","envLat",lat),field("Longitude","envLon",lon),field("Précision des coordonnées (m)","envAccuracy",accuracy),field("Origine des coordonnées","envSource",source),field("Du","envFrom",from),field("Au","envTo",to));
    const save=node("button",{type:"button"},"Enregistrer les coordonnées");
    const run=node("button",{type:"button"},"Importer NASA POWER");
    const refresh=node("button",{type:"button"},"Forcer l’actualisation");
    const status=node("p",{class:"muted","aria-live":"polite"},"Choisissez un emplacement et confirmez ses coordonnées.");
    const summary=node("div",{id:"envSummary",class:"overview-observations","aria-live":"polite"});
    const results=node("div",{id:"envResults",class:"overview-observations"});
    const details=node("details",{class:"environmental-details"});
    details.append(node("summary",{},"Voir les observations détaillées"));
    details.append(results);
    const satelliteButton=node("button",{type:"button"},"Chercher les images satellite");
    const satelliteResults=node("div",{id:"satelliteResults",class:"overview-observations","aria-live":"polite"});
    const satelliteHint=node("p",{class:"muted"},"Sentinel-2 : recherche de scènes disponibles et de couverture nuageuse. Cela ne mesure pas directement l’état de la culture.");
    form.append(save,run,refresh,satelliteButton,status);
    panel.append(form,summary,satelliteHint,satelliteResults,details);
    plant.parentNode.insertBefore(panel,plant.nextSibling);
    const nav=document.querySelector(".section-nav");
    if(nav && !document.getElementById("envNav")) { const a=node("a",{href:"#environmentalCard",id:"envNav"},"Contexte environnemental"); nav.append(a); }

    async function loadLocations() {
      const {data,error}=await db.from("locations").select("id,code,name,latitude,longitude,coordinate_accuracy_m,coordinate_source").order("name");
      if(error){status.textContent="Chargement des emplacements impossible : "+error.message;return;}
      data.forEach(x=>location.append(node("option",{value:x.id},x.code?x.name+" ("+x.code+")":x.name)));
      if(data.length===1) location.value=data[0].id;
      selectLocation();
    }
    async function selectLocation(){
      if(!location.value){lat.value="";lon.value="";accuracy.value="";return;}
      const {data}=await db.from("locations").select("latitude,longitude,coordinate_accuracy_m,coordinate_source").eq("id",location.value).maybeSingle();
      if(!data)return;
      lat.value=data.latitude??""; lon.value=data.longitude??""; accuracy.value=data.coordinate_accuracy_m??"";
      if(data.coordinate_source && [...source.options].some(o=>o.value===data.coordinate_source))source.value=data.coordinate_source;
    }
    function renderClimateSummary(data){
      summary.replaceChildren();
      if(!data.length){summary.append(node("p",{class:"muted"},"Pas encore de données météo pour cette période. Importez l’historique pour obtenir des repères utiles."));return;}
      const byDate=new Map();
      data.forEach(r=>{if(r.value===null||r.value===undefined)return;const value=Number(r.value);if(!Number.isFinite(value))return;const day=String(r.observed_at).slice(0,10);if(!byDate.has(day))byDate.set(day,{});byDate.get(day)[r.variable_code]=value;});
      const days=[...byDate.keys()].sort().slice(-7);
      const rows=days.map(d=>byDate.get(d));
      const maxTemps=rows.map(x=>x.air_temperature_max).filter(Number.isFinite);
      const rain=rows.map(x=>x.precipitation_corrected).filter(Number.isFinite);
      const humid=rows.map(x=>x.relative_humidity_mean).filter(Number.isFinite);
      const temp=maxTemps.length?Math.max(...maxTemps):null;
      const rainTotal=rain.length?rain.reduce((a,b)=>a+b,0):null;
      const humidity=humid.length?humid.reduce((a,b)=>a+b,0)/humid.length:null;
      const card=(label,value,note)=>{const box=node("div",{class:"card"});box.append(node("strong",{},label),node("p",{},value),node("small",{class:"muted"},note));return box;};
      const grid=node("div",{class:"grid"});
      grid.append(card("Pic de température",temp===null?"Indisponible":temp.toFixed(1)+" °C","Maximum observé sur les 7 derniers jours disponibles"));
      grid.append(card("Pluie cumulée",rainTotal===null?"Indisponible":rainTotal.toFixed(1)+" mm","Somme estimée sur les jours disponibles"));
      grid.append(card("Humidité de l’air",humidity===null?"Indisponible":humidity.toFixed(0)+" %","Moyenne des observations disponibles"));
      summary.append(grid);
      const notes=[];
      if(temp!==null&&temp>=35)notes.push("Chaleur forte dans les données : vérifier l’humidité réelle du substrat et le stress thermique avant d’augmenter l’irrigation.");
      if(rainTotal!==null&&rainTotal<=2)notes.push("Pluie estimée faible : pour une culture extérieure, contrôler l’humidité du sol avant d’arroser. En serre, la pluie n’indique pas le besoin en eau.");
      if(humidity!==null&&humidity>=85)notes.push("Humidité de l’air élevée : surveiller la ventilation et les signes de maladies foliaires.");
      if(!notes.length)notes.push("Aucun seuil d’alerte simple détecté dans ces indicateurs. Croisez toujours ces estimations régionales avec les mesures locales.");
      const advice=node("ul",{class:"environmental-advice"});
      notes.forEach(note=>advice.append(node("li",{},note)));
      summary.append(advice,node("p",{class:"muted"},"Repères indicatifs, calculés à partir des 7 derniers jours disponibles (pas nécessairement les 7 derniers jours calendaires). Pas de prévision ni de commande automatique d’irrigation."));
    }
    async function loadRows(){
      const {data,error}=await db.from("environmental_observations").select("observed_at,variable_code,value,unit_code,provider_code,quality_flag").eq("location_id",location.value).eq("data_family","weather").gte("observed_at",from.value+"T00:00:00Z").lte("observed_at",to.value+"T23:59:59Z").order("observed_at",{ascending:false}).limit(1000);
      results.replaceChildren();
      if(error){results.textContent="Historique indisponible : "+error.message;summary.replaceChildren(node("p",{class:"muted"},"Impossible de calculer les indicateurs météo."));return;}
      renderClimateSummary(data||[]);
      if(!data.length){results.textContent="Aucune observation pour cette période.";return;}
      const table=node("table"); const head=node("tr");
      ["Date","Variable","Valeur","Unité","Source"].forEach(t=>head.append(node("th",{},t)));
      const thead=node("thead");thead.append(head);table.append(thead);
      const tbody=node("tbody");
      const labels={air_temperature_mean:"Température moyenne",air_temperature_max:"Température maximale",air_temperature_min:"Température minimale",precipitation_corrected:"Précipitations",solar_radiation_all_sky:"Rayonnement solaire",relative_humidity_mean:"Humidité relative moyenne",wind_speed_mean:"Vitesse moyenne du vent"};
      data.forEach(r=>{const tr=node("tr");[String(r.observed_at).slice(0,10),labels[r.variable_code]||r.variable_code,r.value==null?"—":String(r.value),r.unit_code||"—",r.provider_code+" · "+(r.quality_flag||"")].forEach(t=>tr.append(node("td",{},t)));tbody.append(tr);});
      table.append(tbody);results.append(table);
    }
    async function searchSatellite(){
      if(!location.value||!from.value||!to.value||from.value>to.value){satelliteResults.textContent="Choisissez un emplacement et une période valide.";return;}
      const days=(Date.parse(to.value)-Date.parse(from.value))/86400000+1;
      if(days>180){satelliteResults.textContent="La recherche satellite est limitée à 180 jours. Réduisez la période.";return;}
      satelliteButton.disabled=true;
      satelliteResults.replaceChildren(node("p",{class:"muted"},"Recherche de scènes Sentinel-2…"));
      try{
        const {data,error}=await db.functions.invoke("copernicus-sentinel-catalogue",{body:{location_id:location.value,start_date:from.value,end_date:to.value,limit:10,max_cloud_cover:60}});
        satelliteResults.replaceChildren();
        if(error){satelliteResults.append(node("p",{class:"muted"},"Recherche satellite indisponible : "+(error.context?.json?.error||error.message)));return;}
        if(!data?.ok){satelliteResults.append(node("p",{class:"muted"},"Catalogue indisponible : "+(data?.error||"réponse invalide")));return;}
        satelliteResults.append(node("p",{},data.scenes_found+" scène(s) trouvée(s), couverture nuageuse maximale de 60 %."));
        if(!data.scenes?.length){satelliteResults.append(node("p",{class:"muted"},"Aucune scène ne correspond à ces critères. Essayez une période plus longue ou un seuil nuageux plus élevé."));return;}
        data.scenes.forEach(scene=>{
          const item=node("article",{class:"card"});
          item.append(node("strong",{},scene.acquired_at?new Date(scene.acquired_at).toLocaleDateString():"Date inconnue"));
          item.append(node("p",{},(scene.platform||"Sentinel-2")+" · nuages "+(scene.cloud_cover_percent==null?"inconnus":scene.cloud_cover_percent.toFixed(1)+" %")));
          item.append(node("small",{class:"muted"},scene.id||"Identifiant de scène indisponible"));
          if(scene.catalogue_item_url){const a=node("a",{href:scene.catalogue_item_url,target:"_blank",rel:"noopener noreferrer"},"Ouvrir la fiche de la scène");item.append(a);}
          satelliteResults.append(item);
        });
        satelliteResults.append(node("p",{class:"muted"},"La couverture nuageuse est celle de la scène entière, pas nécessairement celle de la parcelle. Les images et indices végétaux ne sont pas encore analysés."));
      }catch(e){satelliteResults.replaceChildren(node("p",{class:"muted"},"Échec de la recherche : "+(e?.message||"erreur inconnue")));}
      finally{satelliteButton.disabled=false;}
    }
    location.addEventListener("change",selectLocation);
    save.addEventListener("click",async()=>{
      if(!location.value || lat.value==="" || lon.value===""){status.textContent="Choisissez un emplacement et saisissez latitude et longitude.";return;}
      const a=Number(lat.value),o=Number(lon.value),acc=accuracy.value===""?null:Number(accuracy.value);
      if(!Number.isFinite(a)||a < -90||a>90||!Number.isFinite(o)||o < -180||o>180||(acc!==null&&(!Number.isFinite(acc)||acc<0))){status.textContent="Coordonnées invalides. Vérifiez les plages de latitude, longitude et précision.";return;}
      status.textContent="Enregistrement…";
      const {error}=await db.from("locations").update({latitude:a,longitude:o,coordinate_accuracy_m:acc,coordinate_source:source.value}).eq("id",location.value);
      status.textContent=error?"Échec de l’enregistrement : "+error.message:"Coordonnées enregistrées.";
    });
    async function importWeather(forceRefresh=false){
      if(!location.value||!from.value||!to.value||from.value>to.value){status.textContent="Choisissez un emplacement et une période valide.";return;}
      const days=(Date.parse(to.value)-Date.parse(from.value))/86400000+1;
      if(days>366){status.textContent="La période maximale est de 366 jours.";return;}
      run.disabled=true; refresh.disabled=true;
      status.textContent=forceRefresh?"Actualisation forcée en cours…":"Collecte en cours…";
      try{
        const {data,error}=await db.functions.invoke("nasa-power-agroclimate",{body:{location_id:location.value,start_date:from.value,end_date:to.value,refresh:forceRefresh}});
        if(error){status.textContent="Échec : "+(error.context?.json?.error||error.message);return;}
        status.textContent=data?.ok?(data.cached?"Cache récent":forceRefresh?"Actualisation terminée":"Import terminé")+" — "+data.records+" enregistrements. Données estimées sur grille, non mesurées localement.":"Import refusé : "+(data?.error||"réponse invalide");
        await loadRows();
      }catch(error){status.textContent="Échec de la collecte : "+(error?.message||"erreur inconnue");}
      finally{run.disabled=false;refresh.disabled=false;}
    }
    run.addEventListener("click",()=>importWeather(false));
    refresh.addEventListener("click",()=>importWeather(true));
    satelliteButton.addEventListener("click",searchSatellite);
    const {data: authState}=await db.auth.getSession();
    if(!authState?.session){
      status.textContent="Connectez-vous à CultureOps pour accéder aux emplacements de votre organisation.";
      db.auth.onAuthStateChange((_event,session)=>{if(session){panel.classList.remove("hidden");loadLocations().then(()=>location.value&&loadRows());}});
      return;
    }
    panel.classList.remove("hidden");
    await loadLocations();
    if(location.value) await loadRows();
  }
  const watch=new MutationObserver(()=>{if(document.getElementById("plantCard")){watch.disconnect();init().catch(e=>console.error("Environmental context",e));}});
  watch.observe(document.getElementById("workspace-root")||document.body,{childList:true,subtree:true});
  if(document.getElementById("plantCard")){watch.disconnect();init().catch(e=>console.error("Environmental context",e));}
})();