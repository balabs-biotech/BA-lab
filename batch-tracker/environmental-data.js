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
    const from=node("input",{id:"envFrom",type:"date",value:dateString(start),max:dateString(end)});
    const to=node("input",{id:"envTo",type:"date",value:dateString(end),max:dateString(end)});
    const save=node("button",{type:"button"},"Enregistrer les coordonnées");
    const run=node("button",{type:"button"},"Actualiser la météo");
    const refresh=node("button",{type:"button"},"Forcer l’actualisation météo");
    const status=node("p",{class:"muted","aria-live":"polite"},"Choisissez un emplacement pour consulter les indicateurs météo et les scènes satellite disponibles.");
    const summary=node("div",{id:"envSummary",class:"overview-observations","aria-live":"polite"});
    const results=node("div",{id:"envResults",class:"overview-observations"});
    const details=node("details",{class:"environmental-details"});
    details.append(node("summary",{},"Voir les observations détaillées"));
    details.append(results);
    const coordinates=node("details",{class:"environmental-settings"});
    coordinates.append(node("summary",{},"Paramètres avancés : coordonnées et actualisation"));
    coordinates.append(field("Latitude","envLat",lat),field("Longitude","envLon",lon),field("Précision des coordonnées (m)","envAccuracy",accuracy),field("Origine des coordonnées","envSource",source),save,refresh);
    const picker=node("section",{class:"location-picker card","aria-labelledby":"locationPickerTitle"});
    picker.append(node("h3",{id:"locationPickerTitle"},"Définir l’emplacement sans saisir de coordonnées"));
    picker.append(node("p",{class:"muted"},"Utilisez votre position si vous êtes sur place, ou cliquez sur la carte puis déplacez le repère. Vérifiez le point avant de l’enregistrer."));
    const pickerActions=node("div",{class:"location-picker-actions"});
    const locateButton=node("button",{type:"button",class:"small-button"},"Me localiser");
    const mapSaveButton=node("button",{type:"button",class:"small-button secondary-button"},"Enregistrer cet emplacement");
    pickerActions.append(locateButton,mapSaveButton);
    const mapStatus=node("p",{class:"muted","aria-live":"polite"},"Carte en chargement…");
    const mapNode=node("div",{id:"envLocationMap","role":"application","aria-label":"Carte interactive : cliquer pour choisir un emplacement"});
    mapNode.style.cssText="height:320px;min-height:240px;border:1px solid #cbd5c7;border-radius:12px;overflow:hidden;background:#eef2ea;z-index:0";
    picker.append(pickerActions,mapStatus,mapNode);
    const mapStyle=node("style");
    mapStyle.textContent=".location-picker-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.location-picker-actions button{margin-top:8px}.location-picker h3{margin-top:0;padding-top:0;border-top:0}.leaflet-container{font:inherit}.leaflet-control-attribution{font-size:10px!important}@media(max-width:600px){.location-picker-actions{grid-template-columns:1fr}.location-picker #envLocationMap{height:280px!important}}";
    document.head.append(mapStyle);
    form.append(field("Emplacement","envLocation",location),field("Du","envFrom",from),field("Au","envTo",to),run,coordinates);

    const satelliteButton=node("button",{type:"button"},"Chercher les images satellite");
    const satelliteResults=node("div",{id:"satelliteResults",class:"overview-observations","aria-live":"polite"});
    const satelliteHint=node("p",{class:"muted"},"Sentinel-2 : scènes disponibles et couverture nuageuse. L’image ne constitue pas à elle seule un diagnostic de culture.");
    panel.append(form,picker,status,summary,satelliteHint,satelliteButton,satelliteResults,details);
    let locationMap=null, locationMarker=null, mapReady=false;
    function setMapPoint(latitude,longitude,origin,precision=null,zoomToPoint=false){
      lat.value=String(latitude);lon.value=String(longitude);accuracy.value=precision==null?"":String(precision);
      source.value=origin;
      if(locationMap){
        const point=[latitude,longitude];
        if(!locationMarker){
          locationMarker=L.marker(point,{draggable:true}).addTo(locationMap);
          locationMarker.on("dragend",event=>{
            const p=event.target.getLatLng();
            lat.value=p.lat.toFixed(6);lon.value=p.lng.toFixed(6);accuracy.value="";source.value="map_estimate";
            mapStatus.textContent="Repère déplacé : "+p.lat.toFixed(6)+", "+p.lng.toFixed(6)+". Enregistrez pour confirmer.";
          });
        } else locationMarker.setLatLng(point);
        if(zoomToPoint)locationMap.setView(point,Math.max(locationMap.getZoom(),13));
      }
      mapStatus.textContent="Point sélectionné : "+latitude.toFixed(6)+", "+longitude.toFixed(6)+(precision==null?"":" · précision estimée "+Math.round(precision)+" m")+". Enregistrez pour l’associer à l’emplacement choisi.";
    }
    function loadMapLibrary(){
      if(window.L){initMap();return;}
      if(!document.getElementById("leaflet-css")){
        const css=node("link",{id:"leaflet-css",rel:"stylesheet",href:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"});
        document.head.append(css);
      }
      if(window.__baLeafletLoading){window.__baLeafletLoading.then(initMap).catch(()=>mapStatus.textContent="Carte indisponible. Vous pouvez toujours utiliser « Me localiser ».");return;}
      window.__baLeafletLoading=new Promise((resolve,reject)=>{
        const script=node("script",{src:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"});
        script.onload=resolve;script.onerror=reject;document.head.append(script);
      });
      window.__baLeafletLoading.then(initMap).catch(()=>mapStatus.textContent="Carte indisponible. Vérifiez la connexion ou utilisez « Me localiser ».");
    }
    function initMap(){
      if(mapReady||!window.L)return;
      locationMap=L.map(mapNode,{scrollWheelZoom:false}).setView([28,2],4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(locationMap);
      locationMap.on("click",event=>setMapPoint(event.latlng.lat,event.latlng.lng,"map_estimate"));
      mapReady=true;
      if(lat.value!==""&&lon.value!=="")setMapPoint(Number(lat.value),Number(lon.value),source.value||"user_confirmed",accuracy.value===""?null:Number(accuracy.value),true);
      else mapStatus.textContent="Cliquez sur la carte pour placer le repère. La carte peut être déplacée et zoomée.";
      setTimeout(()=>locationMap.invalidateSize(),100);
    }
    locateButton.addEventListener("click",()=>{
      if(!navigator.geolocation){mapStatus.textContent="La géolocalisation n’est pas prise en charge par ce navigateur.";return;}
      locateButton.disabled=true;mapStatus.textContent="Demande de position… Autorisez la localisation dans le navigateur si demandé.";
      navigator.geolocation.getCurrentPosition(pos=>{
        setMapPoint(pos.coords.latitude,pos.coords.longitude,"gps_field",pos.coords.accuracy,true);
        if(locationMap)locationMap.setView([pos.coords.latitude,pos.coords.longitude],16);
        locateButton.disabled=false;
      },err=>{
        const reasons={1:"Autorisation refusée. Autorisez la localisation dans les paramètres du navigateur.",2:"Position indisponible. Vérifiez les services de localisation ou choisissez le point sur la carte.",3:"Délai dépassé. Réessayez ou choisissez le point sur la carte."};
        mapStatus.textContent=reasons[err.code]||"Géolocalisation impossible. Choisissez le point sur la carte.";
        locateButton.disabled=false;
      },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
    });
    mapSaveButton.addEventListener("click",()=>save.click());
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
      if(mapReady&&data.latitude!=null&&data.longitude!=null)setMapPoint(Number(data.latitude),Number(data.longitude),source.value, data.coordinate_accuracy_m==null?null:Number(data.coordinate_accuracy_m),true);
    }
    function renderClimateSummary(data){
      summary.replaceChildren();
      if(!data.length){summary.append(node("p",{class:"muted"},"Pas encore de données météo pour cette période. Importez l’historique pour obtenir des repères utiles."));return;}
      const byDate=new Map();
      data.forEach(r=>{if(r.value===null||r.value===undefined)return;const value=Number(r.value);if(!Number.isFinite(value))return;const day=String(r.observed_at).slice(0,10);if(!byDate.has(day))byDate.set(day,{});byDate.get(day)[r.variable_code]=value;});
      const allDays=[...byDate.keys()].sort();
      const days=allDays.slice(-7);
      const previousDays=allDays.slice(-14,-7);
      const rows=days.map(d=>byDate.get(d));
      const previousRows=previousDays.map(d=>byDate.get(d));
      const maxTemps=rows.map(x=>x.air_temperature_max).filter(Number.isFinite);
      const rain=rows.map(x=>x.precipitation_corrected).filter(Number.isFinite);
      const humid=rows.map(x=>x.relative_humidity_mean).filter(Number.isFinite);
      const previousTemps=previousRows.map(x=>x.air_temperature_max).filter(Number.isFinite);
      const previousRain=previousRows.map(x=>x.precipitation_corrected).filter(Number.isFinite);
      const previousHumid=previousRows.map(x=>x.relative_humidity_mean).filter(Number.isFinite);
      const temp=maxTemps.length?Math.max(...maxTemps):null;
      const rainTotal=rain.length?rain.reduce((a,b)=>a+b,0):null;
      const humidity=humid.length?humid.reduce((a,b)=>a+b,0)/humid.length:null;
      const previousTemp=previousTemps.length?Math.max(...previousTemps):null;
      const previousRainTotal=previousRain.length?previousRain.reduce((a,b)=>a+b,0):null;
      const previousHumidity=previousHumid.length?previousHumid.reduce((a,b)=>a+b,0)/previousHumid.length:null;
      const card=(label,value,note)=>{const box=node("div",{class:"card"});box.append(node("strong",{},label),node("p",{},value),node("small",{class:"muted"},note));return box;};
      const grid=node("div",{class:"grid"});
      grid.append(card("Pic de température",temp===null?"Indisponible":temp.toFixed(1)+" °C","Maximum observé sur les 7 dernières dates disponibles"));
      grid.append(card("Pluie cumulée",rainTotal===null?"Indisponible":rainTotal.toFixed(1)+" mm","Somme des précipitations disponibles"));
      grid.append(card("Humidité de l’air",humidity===null?"Indisponible":humidity.toFixed(0)+" %","Moyenne des observations disponibles"));
      summary.append(grid);
      const trend=node("div",{class:"card"});
      trend.append(node("h3",{},"Évolution par rapport aux 7 dates précédentes"));
      const comparisons=[];
      const compare=(label,current,previous,unit,minCount,currentCount,previousCount)=>{
        if(currentCount<minCount||previousCount<minCount||current===null||previous===null){
          comparisons.push(label+" : comparaison indisponible (historique insuffisant).");
          return;
        }
        const delta=current-previous;
        const direction=Math.abs(delta)<0.1?"stable":delta>0?"en hausse":"en baisse";
        comparisons.push(label+" : "+direction+" ("+(delta>0?"+":"")+delta.toFixed(1)+" "+unit+").");
      };
      compare("Pic de température",temp,previousTemp,"°C",5,maxTemps.length,previousTemps.length);
      compare("Pluie cumulée",rainTotal,previousRainTotal,"mm",7,rain.length,previousRain.length);
      compare("Humidité moyenne",humidity,previousHumidity,"points de %",3,humid.length,previousHumid.length);
      comparisons.forEach(line=>trend.append(node("p",{class:"muted"},line)));
      trend.append(node("small",{class:"muted"},"Comparaison descriptive de périodes constituées des dernières dates disponibles, pas nécessairement de 7 jours calendaires consécutifs. Une hausse ou une baisse n’établit pas à elle seule un stress cultural."));
      summary.append(trend);
      const signals=[];
      const rainCoverage=rain.length;
      const heatCoverage=maxTemps.length;
      const humidityCoverage=humid.length;
      if(temp!==null&&temp>=35)signals.push({priority:"Priorité élevée",title:"Épisode de chaleur à vérifier",text:"Le maximum régional atteint "+temp.toFixed(1)+" °C. Vérifiez l’humidité réelle du sol ou du substrat, le flétrissement et l’état des plantes aux heures chaudes. N’augmentez pas l’irrigation automatiquement sans contrôle de terrain."});
      else if(temp!==null&&temp>=30)signals.push({priority:"Vigilance",title:"Températures élevées",text:"Le maximum régional atteint "+temp.toFixed(1)+" °C. Surveillez les cultures sensibles, surtout en pot ou sous serre, et contrôlez l’humidité réelle avant d’ajuster l’arrosage."});
      if(rainCoverage>=5&&rainTotal!==null&&rainTotal<=2)signals.push({priority:"À vérifier",title:"Peu de précipitations récentes",text:"Le cumul estimé est de "+rainTotal.toFixed(1)+" mm sur "+rainCoverage+" jour(s) renseigné(s). En plein champ, contrôlez l’humidité du sol avant toute décision d’irrigation. Cette information ne permet pas de déduire seule le besoin en eau."});
      else if(rainCoverage<5)signals.push({priority:"Données partielles",title:"Cumul de pluie insuffisamment couvert",text:"Seulement "+rainCoverage+" jour(s) contiennent une valeur de précipitation exploitable sur les jours affichés. Le cumul ne permet pas de conclure sur le déficit hydrique."});
      if(humidityCoverage>=3&&humidity!==null&&humidity>=85)signals.push({priority:"Vigilance",title:"Humidité atmosphérique élevée",text:"La moyenne des valeurs disponibles est de "+humidity.toFixed(0)+" %. Vérifiez la ventilation sous serre et inspectez les feuilles. L’humidité régionale ne confirme ni la présence ni le risque certain d’une maladie."});
      if(!signals.length)signals.push({priority:"Pas de signal simple",title:"Aucune alerte détectée par les règles actuelles",text:"Cela ne signifie pas que la culture est sans stress. Vérifiez les observations de terrain et les mesures locales ; les seuils ne sont pas encore adaptés à une espèce, un stade cultural ou un type de sol précis."});
      const advice=node("div",{class:"environmental-advice"});
      signals.forEach(signal=>{
        const item=node("article",{class:"card"});
        item.append(node("small",{class:"muted"},signal.priority),node("h3",{},signal.title),node("p",{},signal.text));
        advice.append(item);
      });
      const latestDay=days.length?days[days.length-1]:null;
      const selectedEnd=to.value;
      const lagDays=latestDay&&selectedEnd?Math.round((Date.parse(selectedEnd+"T00:00:00Z")-Date.parse(latestDay+"T00:00:00Z"))/86400000):null;
      const coverage=node("p",{class:"muted"},"Qualité des données : "+days.length+" jour(s) avec au moins une valeur exploitable ; températures maximales "+heatCoverage+" jour(s), précipitations "+rainCoverage+" jour(s), humidité "+humidityCoverage+" jour(s)."+(latestDay?" Dernière date disponible : "+latestDay+".":""));
      if(lagDays!==null&&lagDays>2)coverage.append(node("strong",{}," Écart de couverture : "+lagDays+" jours entre la fin de période sélectionnée et la dernière date disponible."));
      summary.append(node("h3",{},"Lecture agronomique provisoire"),advice,coverage,node("p",{class:"muted"},"Ces signaux sont des règles indicatives appliquées à des estimations NASA POWER sur grille régionale, pas à des mesures locales. Ils servent à décider quoi vérifier, pas à établir un diagnostic. La météo affichée est historique : aucune prévision ni commande automatique d’irrigation."));
    }
    function renderVariableCoverage(data){
      const labels={air_temperature_mean:"Température moyenne",air_temperature_max:"Température maximale",air_temperature_min:"Température minimale",precipitation_corrected:"Précipitations",solar_radiation_all_sky:"Rayonnement solaire",relative_humidity_mean:"Humidité relative moyenne",wind_speed_mean:"Vitesse moyenne du vent"};
      const coverage=node("div",{class:"card"});
      coverage.append(node("h3",{},"Couverture par variable"));
      const startMs=Date.parse(from.value+"T00:00:00Z");
      const endMs=Date.parse(to.value+"T00:00:00Z");
      const expected=Math.floor((endMs-startMs)/86400000)+1;
      const byVariable=new Map();
      (data||[]).forEach(r=>{
        if(r.value===null||r.value===undefined||!Number.isFinite(Number(r.value)))return;
        const key=r.variable_code;
        if(!byVariable.has(key))byVariable.set(key,new Set());
        byVariable.get(key).add(String(r.observed_at).slice(0,10));
      });
      const table=node("table");
      const head=node("tr");
      ["Variable","Jours couverts","Couverture","Dernière date","État"].forEach(t=>head.append(node("th",{},t)));
      const thead=node("thead");thead.append(head);table.append(thead);
      const tbody=node("tbody");
      Object.entries(labels).forEach(([key,label])=>{
        const dates=[...(byVariable.get(key)||[])].sort();
        const count=dates.length;
        const last=dates.length?dates[dates.length-1]:"—";
        const percent=expected>0?Math.round(count/expected*100):0;
        const gapDays=dates.length&&Number.isFinite(endMs)?Math.floor((endMs-Date.parse(last+"T00:00:00Z"))/86400000):null;
        const state=!count?"Aucune donnée":percent<80?"Couverture faible":gapDays>2?"Dernière donnée à plus de 2 jours":"À surveiller normalement";
        const tr=node("tr");
        [label,count+" / "+Math.max(expected,0),expected>0?percent+" %":"—",last,state].forEach(t=>tr.append(node("td",{},String(t))));
        tbody.append(tr);
      });
      table.append(tbody);coverage.append(table);
      coverage.append(node("p",{class:"muted"},"La couverture compte les dates calendaires avec une valeur numérique dans la période sélectionnée. « Couverture faible » signifie moins de 80 % des jours attendus ; « Dernière donnée à plus de 2 jours » signale un écart avec la fin de période. Ces signaux ne déterminent pas seuls la cause : retard du fournisseur, import incomplet ou coordonnées peuvent être en jeu. NASA POWER fournit des estimations régionales, pas des mesures locales."));
      summary.append(coverage);
    }
    async function loadRows(){
      results.replaceChildren();
      const columns="observed_at,variable_code,value,unit_code,provider_code,quality_flag";
      let data=[];
      let offset=0;
      const pageSize=1000;
      while(true){
        const {data:page,error}=await db.from("environmental_observations").select(columns).eq("location_id",location.value).eq("data_family","weather").gte("observed_at",from.value+"T00:00:00Z").lte("observed_at",to.value+"T23:59:59Z").order("observed_at",{ascending:false}).range(offset,offset+pageSize-1);
        if(error){results.textContent="Historique indisponible : "+error.message;summary.replaceChildren(node("p",{class:"muted"},"Impossible de calculer les indicateurs météo."));return;}
        data=data.concat(page||[]);
        if(!page||page.length<pageSize)break;
        offset+=pageSize;
      }
      renderClimateSummary(data);
      renderVariableCoverage(data);
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
          if(scene.preview_url){
            const preview=node("img",{src:scene.preview_url,alt:"Aperçu satellite Sentinel-2 du "+(scene.acquired_at||"date inconnue"),loading:"lazy",decoding:"async",style:"display:block;width:100%;max-height:320px;object-fit:contain;background:#111827;border-radius:8px;margin:12px 0"});
            preview.addEventListener("error",()=>{preview.remove();item.append(node("p",{class:"muted"},"Aperçu non accessible depuis le navigateur pour cette scène."));},{once:true});
            item.append(preview);
          } else {
            item.append(node("p",{class:"muted"},"Aucun aperçu image fourni par le catalogue pour cette scène."));
          }
          if(scene.browser_url){
            const browserLink=node("a",{href:scene.browser_url,target:"_blank",rel:"noopener noreferrer"},"Visualiser cette date dans Copernicus Browser");
            browserLink.style.display="block";
            browserLink.style.marginTop="8px";
            item.append(browserLink);
            item.append(node("small",{class:"muted"},"Vue de la zone et de la date dans le navigateur Copernicus ; ce lien ne garantit pas l’affichage exact du produit listé."));
          }
          if(scene.catalogue_item_url){const a=node("a",{href:scene.catalogue_item_url,target:"_blank",rel:"noopener noreferrer"},"Ouvrir la fiche de la scène");item.append(a);}
          satelliteResults.append(item);
        });
        satelliteResults.append(node("p",{class:"muted"},"Les aperçus sont des vignettes de catalogue, pas une analyse de la parcelle. Le calcul NDVI et le traitement des bandes satellite restent à intégrer."));
      }catch(e){satelliteResults.replaceChildren(node("p",{class:"muted"},"Échec de la recherche : "+(e?.message||"erreur inconnue")));}
      finally{satelliteButton.disabled=false;}
    }
    location.addEventListener("change",()=>{satelliteResults.replaceChildren();selectLocation().then(()=>location.value&&loadRows());});
    from.addEventListener("change",()=>location.value&&loadRows());
    to.addEventListener("change",()=>location.value&&loadRows());
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
        if(data?.ok){
          const detail=data.cached
            ? "Cache réutilisé ; "+(data.variables_checked??0)+" variables principales vérifiées."
            : (data.records??0)+" enregistrements importés.";
          status.textContent=(data.cached?"Cache historique validé":forceRefresh?"Actualisation terminée":"Import terminé")+" — "+detail+" Données estimées sur grille, non mesurées localement.";
          if(Array.isArray(data.coverage_by_variable)&&data.coverage_by_variable.length){
            status.textContent+=" Couverture du cache : "+data.coverage_by_variable.map(x=>x.variable+" "+x.days+" j").join(", ")+".";
          }
        }else{
          status.textContent="Import refusé : "+(data?.error||"réponse invalide");
        }
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
      db.auth.onAuthStateChange((_event,session)=>{if(session){panel.classList.remove("hidden");loadMapLibrary();loadLocations().then(()=>location.value&&loadRows());}});
      return;
    }
    panel.classList.remove("hidden");
    loadMapLibrary();
    await loadLocations();
    if(location.value) await loadRows();
  }
  const watch=new MutationObserver(()=>{if(document.getElementById("plantCard")){watch.disconnect();init().catch(e=>console.error("Environmental context",e));}});
  watch.observe(document.getElementById("workspace-root")||document.body,{childList:true,subtree:true});
  if(document.getElementById("plantCard")){watch.disconnect();init().catch(e=>console.error("Environmental context",e));}
})();