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
  // Supabase FunctionsHttpError.context is a Response, not a parsed JSON object.
  // Read its body from a clone so the original response remains untouched.
  async function functionErrorMessage(error) {
    const response = error?.context;
    let detail = "";
    const statusCode = Number(response?.status) || 0;
    if (response && typeof response.clone === "function") {
      try {
        const copy = response.clone();
        const contentType = copy.headers?.get("content-type") || "";
        if (contentType.includes("json")) {
          const payload = await copy.json();
          detail = payload?.error || payload?.message || payload?.details || payload?.hint || "";
        } else {
          detail = (await copy.text()).trim();
        }
      } catch (_) {
        // Fall back to the SDK message when the response body is empty or unreadable.
      }
    }
    if (!detail) detail = error?.message || "Erreur inconnue";
    detail = String(detail).replace(/\\s+/g, " ").slice(0, 500);
    return statusCode ? "HTTP " + statusCode + " — " + detail : detail;
  }
  async function init() {
    const plant = document.getElementById("plantCard");
    if (!plant || document.getElementById("environmentalCard")) return;
    const panel = node("section", {id:"environmentalCard", class:"card hidden"});
    // The satellite map is the primary Green Tech view; keep explanatory copy out of the default screen.
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
    const vegetationChart=node("section",{id:"vegetationTrendPanel",class:"card environmental-weather-chart","aria-live":"polite"});
    const agroSynthesisPanel=node("section",{id:"agroSynthesisPanel",class:"card","aria-live":"polite"});
    const uvComparisonPanel=node("section",{id:"uvComparisonPanel",class:"card","aria-live":"polite"});
    vegetationChart.append(node("h3",{},"Évolution de la végétation (NDVI)"),node("p",{class:"muted"},"Comparaison automatique des dernières scènes Sentinel-2 disponibles."));
    agroSynthesisPanel.append(node("h3",{},"Lecture agronomique"),node("p",{class:"muted"},"Mise en relation des signaux météo disponibles. Les données régionales ne remplacent pas les mesures dans la parcelle."));
    const weatherCharts=node("div",{id:"envWeatherCharts",class:"environmental-weather-charts","aria-live":"polite"});
    const details=node("details",{class:"environmental-details"});
    details.append(node("summary",{},"Afficher l’analyse et les données détaillées"));
    details.append(summary,results);
    const coordinates=node("details",{class:"environmental-settings"});
    coordinates.append(node("summary",{},"Paramètres avancés : coordonnées et actualisation"));
    coordinates.append(field("Latitude","envLat",lat),field("Longitude","envLon",lon),field("Précision des coordonnées (m)","envAccuracy",accuracy),field("Origine des coordonnées","envSource",source),save,refresh);
    const locationControl=field("Emplacement","envLocation",location);
    locationControl.style.cssText="display:grid;gap:6px;margin:0 0 10px;";
    location.style.cssText="width:100%;min-height:42px;";
    form.append(locationControl,field("Du","envFrom",from),field("Au","envTo",to),run,coordinates);
    const satelliteHint=node("p",{class:"muted"},"Sentinel-2 : scènes disponibles et couverture nuageuse. L’image ne constitue pas à elle seule un diagnostic de culture.");
    const satelliteMapPanel=node("section",{class:"card",id:"satelliteColorMapPanel"});
    satelliteMapPanel.append(node("h3",{},"Carte satellite"));
    const satelliteMapStatus=node("p",{class:"muted","aria-live":"polite"},"Chargement de l’image satellite…");
    const satelliteMap=node("div",{id:"satelliteColorMap","aria-label":"Carte de télédétection avec imagerie en réflectance visible et couche NDVI",style:"height:340px;min-height:280px;width:100%;border-radius:10px;overflow:hidden;background:#111827"});
    const satelliteMapLegend=node("p",{class:"muted"},"La vue régionale MODIS est un contexte paysager à résolution kilométrique : elle ne permet pas de conclure qu’une parcelle ou toute la région est dépourvue de végétation. Les pixels sans données ne doivent pas être interprétés comme des sols nus.");
    const satelliteViewControls=node("div",{id:"satelliteViewControls",style:"display:flex;flex-wrap:wrap;gap:8px;margin:10px 0"});
    const satelliteModeHelp=node("p",{class:"muted"},"Choisissez d’abord une scène Sentinel-2 dans la liste, puis un rendu. NDVI = intensité relative de végétation ; couleurs naturelles = apparence proche de l’œil humain ; fausses couleurs infrarouges = végétation généralement plus contrastée. L’indice UV est une mesure atmosphérique météo, pas une bande d’imagerie Sentinel-2.");
    const satelliteNDVILegend=node("div",{id:"satelliteNDVILegend",style:"display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 14px;font-size:12px"});
    satelliteNDVILegend.append(node("p",{class:"muted"},"Repères NDVI Sentinel-2 (classes indicatives, non universelles) :"));
    [["#68529e","< −0,05","Eau / valeurs négatives"],["#a6423a","−0,05 à 0,10","Très faible signal végétal"],["#d67e37","0,10 à 0,20","Faible"],["#e7c04c","0,20 à 0,35","Intermédiaire faible"],["#a1c551","0,35 à 0,50","Intermédiaire"],["#4ca653","0,50 à 0,65","Végétation plus active"],["#18703a","> 0,65","Signal végétal élevé"]].forEach(([color,range,label])=>{
      const swatch=node("div",{style:"display:flex;align-items:center;gap:6px;min-width:145px;flex:1"});
      swatch.append(node("span",{style:"display:inline-block;width:18px;height:18px;flex:0 0 18px;border-radius:4px;background:"+color+";border:1px solid #ffffff55"}),node("span",{},range+" · "+label));
      satelliteNDVILegend.append(swatch);
    });
    satelliteNDVILegend.append(node("p",{class:"muted"},"Les pixels transparents correspondent à des données invalides ou masquées, pas à une absence certaine de végétation. Les classes dépendent de la saison, du couvert, du sol et du masque nuageux ; elles ne constituent pas un diagnostic de culture."));
    satelliteMapPanel.append(locationControl,satelliteMapStatus,satelliteMap,satelliteViewControls,satelliteMapLegend,satelliteModeHelp,satelliteNDVILegend);
    const sentinelHighResNote=node("p",{class:"muted"},"Pour examiner les limites de champs et les parcelles, utilisez l’explorateur Sentinel-2 L2A à 10 m. Cette vue externe exploite les bandes multispectrales de Sentinel-2 ; elle ne remplace pas une analyse agronomique validée.");
    const sentinelHighResLink=node("a",{href:"https://sentinel-2.allthingsspatial.io/",target:"_blank",rel:"noopener noreferrer"},"Ouvrir l’explorateur Sentinel-2 haute résolution (10 m) ↗");
    sentinelHighResLink.style.display="inline-block";
    sentinelHighResLink.style.margin="4px 0 12px";
    satelliteMapPanel.append(sentinelHighResNote,sentinelHighResLink);
    const satelliteButton=node("button",{type:"button"},"Chercher les images satellite");
    const satelliteResults=node("div",{id:"satelliteResults",class:"overview-observations","aria-live":"polite"});
    // Keep the default experience focused on the map; advanced climate controls remain in code but are not shown here.
    [form,status,satelliteHint,satelliteButton,satelliteResults,details].forEach(el=>el.style.display="none");
    [satelliteMapLegend,satelliteModeHelp,satelliteNDVILegend,sentinelHighResNote,sentinelHighResLink,satelliteViewControls].forEach(el=>el.style.display="none");
    satelliteMapPanel.querySelector("h3").textContent="Carte satellite";
    satelliteMapPanel.append(locationControl,satelliteMapStatus,satelliteMap);
    panel.append(satelliteMapPanel,vegetationChart,agroSynthesisPanel,weatherCharts,uvComparisonPanel);
    const hero=document.querySelector(".app-hero");
    if(hero?.parentNode) hero.parentNode.insertBefore(panel,hero.nextSibling);
    else plant.parentNode.insertBefore(panel,plant);
    const nav=document.querySelector(".section-nav");
    if(nav && !document.getElementById("envNav")) { const a=node("a",{href:"#environmentalCard",id:"envNav"},"Contexte environnemental"); nav.append(a); }

    let satelliteLeafletMap=null, satelliteMarker=null, satelliteGridCircle=null, selectedSentinelSceneDate=null, selectedSentinelDisplayMode="ndvi";
    let satelliteNDVILayer=null, satelliteTrueColorLayer=null, satelliteSentinelNDVILayer=null, satelliteSentinelObjectUrl=null, satelliteLayerControl=null, leafletPromise=null;
    function loadLeaflet(){
      if(window.L)return Promise.resolve(window.L);
      if(leafletPromise)return leafletPromise;
      if(!document.getElementById("ba-leaflet-css"))document.head.append(node("link",{id:"ba-leaflet-css",rel:"stylesheet",href:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"}));
      leafletPromise=new Promise((resolve,reject)=>{
        const script=node("script",{src:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",async:""});
        script.onload=()=>window.L?resolve(window.L):reject(new Error("Bibliothèque cartographique indisponible"));
        script.onerror=()=>reject(new Error("Chargement de la bibliothèque cartographique impossible"));
        document.head.append(script);
      });
      return leafletPromise;
    }
    function modisCompositeDate(dateValue){
      const d=new Date((dateValue||dateString(new Date()))+"T00:00:00Z");
      if(!Number.isFinite(d.getTime()))return dateString(new Date(Date.now()-17*86400000));
      const period=16*86400000;
      const anchor=Date.UTC(2000,1,18);
      const aligned=anchor+Math.floor((d.getTime()-anchor)/period)*period;
      return dateString(new Date(aligned));
    }
    async function showSentinelNDVI(sceneDate,displayMode="ndvi"){
      if(!location.value||!sceneDate){satelliteMapStatus.textContent="Choisissez un emplacement et une date de scène valide.";return;}
      selectedSentinelSceneDate=sceneDate;selectedSentinelDisplayMode=displayMode;
      satelliteMapStatus.textContent="Préparation du rendu "+displayMode+" Sentinel-2 et chargement dans la carte BA Labs…";
      try{
        const {data:authState,error:authError}=await db.auth.getSession();
        if(authError||!authState?.session?.access_token)throw new Error("Session expirée : reconnectez-vous à CultureOps.");
        const requestHeaders={
          "Authorization":"Bearer "+authState.session.access_token,
          "apikey":"sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992",
          "Content-Type":"application/json",
          "Accept":"image/png"
        };
        let response;
        // Public Earth Search / AWS Open Data is the primary route. Copernicus OAuth
        // is only a fallback, so normal operation does not depend on provider credentials.
        response=await fetch("https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/earth-search-sentinel2-ndvi-preview",{
          method:"POST",headers:requestHeaders,body:JSON.stringify({location_id:location.value,date:sceneDate,mode:displayMode})
        });
        if(!response.ok){
          const payload=await response.clone().json().catch(()=>({}));
          const messages={
            sentinelhub_credentials_not_configured:"Les identifiants Copernicus sont absents et le traitement raster public a échoué.",
            sentinelhub_authentication_failed:"L’authentification Copernicus a échoué.",
            sentinelhub_processing_failed:"Copernicus n’a pas pu produire l’image pour cette date.",
            sentinelhub_rate_limited:"Quota temporaire Sentinel-2 atteint ; réessayez plus tard.",
            sentinelhub_timeout:"Le traitement satellite a dépassé le délai autorisé.",
            no_sentinel2_scene_for_date:"Aucune scène Sentinel-2 ne couvre ce point à cette date. Essayez une date d’acquisition voisine.",
            earth_search_catalogue_unavailable:"Le catalogue public Sentinel-2 est momentanément indisponible.",
            earth_search_raster_timeout:"Le téléchargement/traitement des bandes raster a dépassé le délai autorisé.",
            sentinel2_red_nir_assets_unavailable:"Les bandes rouge et proche infrarouge ne sont pas disponibles pour cette scène.",
            ndvi_raster_processing_failed:"Le calcul NDVI à partir des rasters publics a échoué.",
            raster_window_invalid_or_too_large:"La zone raster demandée est invalide ou trop grande.",
            sentinel2_projection_metadata_missing:"Les métadonnées de projection de cette scène sont absentes.",
            sentinel2_projection_unsupported:"Le système de coordonnées de cette scène n’est pas pris en charge.",
            valid_location_coordinates_required:"Cet emplacement doit avoir des coordonnées valides.",
            past_valid_date_required:"Choisissez une date d’acquisition passée et valide."
          };
          throw new Error(messages[payload.error]||("Traitement Sentinel-2 indisponible (HTTP "+response.status+")."));
        }
        const boundsHeader=response.headers.get("X-Geo-Bounds");
        const values=(boundsHeader||"").split(",").map(Number);
        if(values.length!==4||!values.every(Number.isFinite))throw new Error("L’emprise géographique de l’image est invalide.");
        const [west,south,east,north]=values;
        const L=await loadLeaflet();
        const blob=await response.blob();
        if(!blob.size||blob.type!=="image/png")throw new Error("Le service n’a pas renvoyé une image PNG valide.");
        const objectUrl=URL.createObjectURL(blob);
        if(satelliteSentinelNDVILayer){satelliteLayerControl.removeLayer(satelliteSentinelNDVILayer);satelliteLeafletMap.removeLayer(satelliteSentinelNDVILayer);}
        if(satelliteSentinelObjectUrl)URL.revokeObjectURL(satelliteSentinelObjectUrl);
        satelliteSentinelObjectUrl=objectUrl;
        satelliteSentinelNDVILayer=L.imageOverlay(objectUrl,[[south,west],[north,east]],{opacity:0.88,interactive:true});
        satelliteSentinelNDVILayer.addTo(satelliteLeafletMap);
        satelliteLayerControl.addOverlay(satelliteSentinelNDVILayer,"NDVI Sentinel-2 · "+sceneDate);
        satelliteLeafletMap.fitBounds([[south,west],[north,east]],{padding:[12,12],maxZoom:14});
        // Keep the weather date range independent from the satellite acquisition date.
        const ndviStats=response.headers.get("X-NDVI-Stats");
        let statsText="",meanNDVI=null;
        if(ndviStats){try{const st=JSON.parse(ndviStats);if(Number.isFinite(Number(st.mean_ndvi))){meanNDVI=Number(st.mean_ndvi);statsText=" · NDVI moyen "+meanNDVI.toFixed(2);}}catch(_){}}
        const modeLabels={ndvi:"NDVI",true_color:"couleurs naturelles",false_color:"fausses couleurs IR"};
        satelliteMapStatus.textContent="Sentinel-2 · "+sceneDate+(displayMode==="ndvi"?" · NDVI":" · "+(modeLabels[displayMode]||displayMode))+statsText;
        return {date:sceneDate,mean:meanNDVI};
      }catch(error){
        const message=error?.message||"Erreur de chargement Sentinel-2";
        satelliteMapStatus.textContent="Image Sentinel-2 indisponible : "+message+". "+(satelliteSentinelNDVILayer?"Dernière image conservée.":"Contexte régional conservé.");
        return null;
      }
    }
    async function fetchNDVIStats(sceneDate){
      try{
        const {data:authState,error}=await db.auth.getSession();
        if(error||!authState?.session?.access_token)return null;
        const headers={"Authorization":"Bearer "+authState.session.access_token,"apikey":"sb_publishable_8H4XRh8V07Hlo0WwdfOXwg_2RXRX992","Content-Type":"application/json","Accept":"image/png"};
        let response=await fetch("https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/earth-search-sentinel2-ndvi-preview",{method:"POST",headers,body:JSON.stringify({location_id:location.value,date:sceneDate,mode:"ndvi"})});
        if(!response.ok)return null;const raw=response.headers.get("X-NDVI-Stats");if(!raw)return null;
        const stats=JSON.parse(raw),mean=Number(stats.mean_ndvi);return Number.isFinite(mean)?{date:sceneDate,mean}:null;
      }catch(_){return null;}
    }
    function renderVegetationChart(points){
      vegetationChart.replaceChildren(node("h3",{},"Évolution de la végétation (NDVI)"));
      const valid=(points||[]).filter(p=>p&&Number.isFinite(p.mean)).sort((a,b)=>a.date.localeCompare(b.date));
      if(!valid.length){vegetationChart.append(node("p",{class:"muted"},"Statistiques NDVI indisponibles pour les scènes trouvées."));return;}
      if(valid.length===1){vegetationChart.append(node("p",{},"Dernière scène · "+valid[0].date+" · NDVI moyen "+valid[0].mean.toFixed(3)),node("p",{class:"muted"},"Le comparatif apparaîtra lorsqu’une deuxième scène exploitable sera disponible."));return;}
      const width=760,height=220,left=60,right=22,top=24,bottom=42,min=Math.min(0,...valid.map(p=>p.mean)),max=Math.max(1,...valid.map(p=>p.mean)),span=max-min||1,x=i=>left+i*(width-left-right)/(valid.length-1),y=v=>top+(max-v)*(height-top-bottom)/span,ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
      svg.setAttribute("viewBox","0 0 "+width+" "+height);svg.setAttribute("role","img");svg.setAttribute("aria-label","Comparaison du NDVI moyen sur deux dates Sentinel-2");
      for(let t=0;t<5;t++){const v=min+(max-min)*t/4,yy=y(v),grid=document.createElementNS(ns,"line");grid.setAttribute("x1",left);grid.setAttribute("x2",width-right);grid.setAttribute("y1",yy);grid.setAttribute("y2",yy);grid.setAttribute("stroke","currentColor");grid.setAttribute("opacity",".18");svg.append(grid);const label=document.createElementNS(ns,"text");label.setAttribute("x",left-9);label.setAttribute("y",yy+4);label.setAttribute("text-anchor","end");label.setAttribute("fill","currentColor");label.setAttribute("font-size","12");label.textContent=v.toFixed(2);svg.append(label);}
      const line=document.createElementNS(ns,"polyline");line.setAttribute("points",valid.map((p,i)=>x(i)+","+y(p.mean)).join(" "));line.setAttribute("fill","none");line.setAttribute("stroke","#8ed16d");line.setAttribute("stroke-width","3");svg.append(line);
      valid.forEach((p,i)=>{const dot=document.createElementNS(ns,"circle");dot.setAttribute("cx",x(i));dot.setAttribute("cy",y(p.mean));dot.setAttribute("r","5");dot.setAttribute("fill","#8ed16d");svg.append(dot);const label=document.createElementNS(ns,"text");label.setAttribute("x",x(i));label.setAttribute("y",height-17);label.setAttribute("text-anchor","middle");label.setAttribute("fill","currentColor");label.setAttribute("font-size","12");label.textContent=p.date;svg.append(label);});
      vegetationChart.append(svg,node("p",{class:"muted"},"NDVI moyen : "+valid[0].mean.toFixed(3)+" → "+valid[valid.length-1].mean.toFixed(3)+" · indice spectral, pas une mesure de rendement."));
    }
    async function updateSatelliteMap(){
      const hasSelectedLocation=Boolean(location.value);
      const latitude=Number(lat.value),longitude=Number(lon.value);
      const hasValidCoordinates=hasSelectedLocation&&Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180;
      // Never leave the map blank just because the user has not selected or geocoded a site yet.
      // This is a clearly labelled regional fallback, not a claim about the exact BA Labs parcel.
      const mapLatitude=hasValidCoordinates?latitude:36.19;
      const mapLongitude=hasValidCoordinates?longitude:5.41;
      satelliteMapStatus.textContent="Chargement de la carte régionale et des couches satellitaires…";
      try{
        const L=await loadLeaflet();
        if(!satelliteLeafletMap){
          satelliteLeafletMap=L.map(satelliteMap,{preferCanvas:true,scrollWheelZoom:false}).setView([mapLatitude,mapLongitude],hasValidCoordinates?10:8);
          const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
            maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
          }).addTo(satelliteLeafletMap);
          satelliteLayerControl=L.control.layers({"Carte de référence":osm},{},{collapsed:true}).addTo(satelliteLeafletMap);
        }else{
          satelliteLeafletMap.setView([mapLatitude,mapLongitude],hasValidCoordinates?Math.min(satelliteLeafletMap.getZoom(),10):8);
        }
        if(hasValidCoordinates){
          if(!satelliteMarker){
            satelliteMarker=L.circleMarker([latitude,longitude],{radius:6,color:"#f8fafc",weight:2,fillColor:"#2563eb",fillOpacity:1})
              .bindPopup("Emplacement sélectionné · coordonnées enregistrées").addTo(satelliteLeafletMap);
            satelliteGridCircle=L.circle([latitude,longitude],{radius:500,color:"#f59e0b",weight:1,dashArray:"5 5",fillColor:"#f59e0b",fillOpacity:0.07})
              .bindPopup("Rayon indicatif de 500 m autour du point, pour rappeler l’ordre de grandeur d’une maille MODIS d’environ 1 km — ce n’est pas une limite de parcelle.").addTo(satelliteLeafletMap);
          }else{
            satelliteMarker.setLatLng([latitude,longitude]);
            satelliteGridCircle.setLatLng([latitude,longitude]);
          }
        }else{
          if(satelliteMarker){satelliteLeafletMap.removeLayer(satelliteMarker);satelliteMarker=null;}
          if(satelliteGridCircle){satelliteLeafletMap.removeLayer(satelliteGridCircle);satelliteGridCircle=null;}
        }
        if(satelliteNDVILayer){satelliteLayerControl.removeLayer(satelliteNDVILayer);satelliteLeafletMap.removeLayer(satelliteNDVILayer);}
        if(satelliteTrueColorLayer){satelliteLayerControl.removeLayer(satelliteTrueColorLayer);satelliteLeafletMap.removeLayer(satelliteTrueColorLayer);}
        const composite=modisCompositeDate(to.value);
        satelliteNDVILayer=L.tileLayer(
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDVI_16Day/default/"+composite+"/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png",
          {maxZoom:9,opacity:0.84,attribution:'NDVI &copy; <a href="https://earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA GIBS / MODIS</a>',crossOrigin:true}
        );
        satelliteTrueColorLayer=L.tileLayer(
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/"+(to.value||composite)+"/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
          {maxZoom:9,opacity:0.92,attribution:'Imagerie &copy; <a href="https://earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA GIBS / MODIS</a>',crossOrigin:true}
        );
        satelliteLayerControl.addOverlay(satelliteNDVILayer,"Indice spectral de végétation — NDVI MODIS");
        satelliteLayerControl.addOverlay(satelliteTrueColorLayer,"Réflectance visible — composition en couleurs naturelles");
        // Default to natural-colour imagery: it shows the landscape and cultivated patterns
        // more intuitively. Keep NDVI as an explicit analytical overlay to avoid implying
        // that the native NASA NDVI palette is a simple green=vegetation classification.
        satelliteTrueColorLayer.addTo(satelliteLeafletMap);
        satelliteNDVILayer.on("tileerror",()=>{
          satelliteMapStatus.textContent="Couche NDVI régionale indisponible.";
        });
        satelliteTrueColorLayer.on("tileerror",()=>{satelliteMapStatus.textContent="Couleurs naturelles indisponibles.";});
        satelliteMapStatus.textContent=hasValidCoordinates
          ?"Contexte satellite chargé."
          :"Carte régionale · site non configuré.";
        requestAnimationFrame(()=>satelliteLeafletMap&&satelliteLeafletMap.invalidateSize());
      }catch(error){
        satelliteMapStatus.textContent=(error?.message||"Carte indisponible")+" ; la vue régionale reste en attente du chargement de Leaflet.";
      }
    }
    async function loadLocations() {
      const {data,error}=await db.from("locations").select("id,code,name,latitude,longitude,coordinate_accuracy_m,coordinate_source").order("name");
      if(error){satelliteMapStatus.textContent="Sites indisponibles.";return;}
      data.forEach(x=>location.append(node("option",{value:x.id},x.code?x.name+" ("+x.code+")":x.name)));
      let savedId="";try{savedId=localStorage.getItem("ba-labs-active-environment-location")||"";}catch(_){}
      const saved=data.find(x=>x.id===savedId&&x.latitude!=null&&x.longitude!=null);
      const preferred=saved||data.find(x=>x.latitude!=null&&x.longitude!=null&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude)))||data[0];
      if(preferred){location.value=preferred.id;try{localStorage.setItem("ba-labs-active-environment-location",preferred.id);}catch(_){}}
      await selectLocation();
      if(!location.value) await updateSatelliteMap();
    }
    async function selectLocation(){
      if(!location.value){lat.value="";lon.value="";accuracy.value="";await updateSatelliteMap();return;}
      const {data}=await db.from("locations").select("latitude,longitude,coordinate_accuracy_m,coordinate_source").eq("id",location.value).maybeSingle();
      if(!data)return;
      lat.value=data.latitude??""; lon.value=data.longitude??""; accuracy.value=data.coordinate_accuracy_m??"";
      if(data.coordinate_source && [...source.options].some(o=>o.value===data.coordinate_source))source.value=data.coordinate_source;
      await updateSatelliteMap();
    }
    function renderAgroSynthesis(data){
      agroSynthesisPanel.replaceChildren(node("h3",{},"Lecture agronomique"));
      const byDate=new Map();
      for(const row of data||[]){
        if(row.value===null||row.value===undefined)continue;
        const value=Number(row.value);
        if(!Number.isFinite(value))continue;
        const day=String(row.observed_at||"").slice(0,10);
        if(!day)continue;
        if(!byDate.has(day))byDate.set(day,{});
        byDate.get(day)[row.variable_code]=value;
      }
      // Use calendar days, not only days with observations; otherwise missing data
      // disappear from the denominator and coverage looks better than it is.
      const selectedStart=Date.parse((from.value||to.value)+"T00:00:00Z");
      const selectedEnd=Date.parse((to.value||from.value)+"T00:00:00Z");
      const lastDay=Number.isFinite(selectedEnd)?selectedEnd:Date.now();
      const firstDay=Number.isFinite(selectedStart)?selectedStart:lastDay;
      const windowStart=Math.max(firstDay,lastDay-6*86400000);
      const days=[];
      for(let ts=windowStart;ts<=lastDay;ts+=86400000)days.push(new Date(ts).toISOString().slice(0,10));
      const valueFor=(day,key)=>byDate.get(day)?.[key];
      const temp=days.map(d=>valueFor(d,"air_temperature_max")).filter(Number.isFinite);
      const rain=days.map(d=>valueFor(d,"precipitation_corrected")).filter(Number.isFinite);
      const humidity=days.map(d=>valueFor(d,"relative_humidity_mean")).filter(Number.isFinite);
      const uv=days.map(d=>valueFor(d,"uv_index_daily_mean")).filter(Number.isFinite);
      const coverage=(values)=>Math.round(values.length/Math.max(days.length,1)*100);
      const windowObservations=(data||[]).filter(row=>days.includes(String(row.observed_at||"").slice(0,10))).length;
      const grid=node("div",{class:"grid"});
      const metric=(label,value,note)=>{
        const card=node("article",{class:"card"});
        card.append(node("strong",{},label),node("p",{},value),node("small",{class:"muted"},note));
        grid.append(card);
      };
      metric("Couverture météo",days.length+" date(s) · "+windowObservations+" observation(s)","Fenêtre des 7 derniers jours calendaires de la période sélectionnée ; les jours manquants restent dans le calcul de couverture.");
      metric("Température maximale",temp.length?Math.max(...temp).toFixed(1)+" °C":"—",coverage(temp)+" % des dates avec une valeur");
      metric("Précipitations",rain.length?rain.reduce((a,b)=>a+b,0).toFixed(1)+" mm":"—",rain.length===days.length?"Cumul complet · "+coverage(rain)+" % des dates":"Cumul partiel · "+coverage(rain)+" % des dates");
      metric("Humidité relative",humidity.length?(humidity.reduce((a,b)=>a+b,0)/humidity.length).toFixed(0)+" %":"—",coverage(humidity)+" % des dates avec une valeur");
      agroSynthesisPanel.append(grid);
      const interpretations=[];
      if(!days.length){
        interpretations.push("Aucune observation météo exploitable pour établir un contexte agronomique.");
      }else{
        if(temp.length&&Math.max(...temp)>=35)interpretations.push("Chaleur élevée : contrôlez l’humidité du sol ou du substrat, le flétrissement et la température réelle au niveau des plantes avant de modifier l’irrigation.");
        else if(temp.length&&Math.max(...temp)>=30)interpretations.push("Température élevée : surveillez les cultures sensibles et vérifiez l’humidité réelle avant d’ajuster l’arrosage.");
        if(rain.length===days.length&&rain.reduce((a,b)=>a+b,0)<=2)interpretations.push("Faibles précipitations estimées sur les dates couvertes : vérifiez l’humidité du sol, car la pluie régionale ne mesure pas l’eau disponible dans la zone racinaire.");
        else if(rain.length<days.length)interpretations.push("Couverture des précipitations partielle : ne concluez pas à un déficit hydrique à partir du cumul affiché.");
        if(humidity.length&&humidity.reduce((a,b)=>a+b,0)/humidity.length>=85)interpretations.push("Humidité atmosphérique élevée : vérifiez la ventilation sous serre et inspectez les feuilles ; ce signal ne diagnostique pas une maladie.");
        if(uv.length>=2){
          const first=uv[0],last=uv[uv.length-1],delta=last-first;
          interpretations.push("Indice UV journalier moyen : "+(delta>0?"en hausse":delta<0?"en baisse":"stable")+" entre les valeurs disponibles ("+first.toFixed(1)+" → "+last.toFixed(1)+"). Il décrit l’exposition UV atmosphérique, pas le stress hydrique de la plante.");
        }
        if(!interpretations.length)interpretations.push("Aucun signal simple ne dépasse les seuils généraux actuels. Cela ne garantit pas l’absence de stress : confrontez ce contexte aux observations et mesures locales.");
      }
      interpretations.forEach(line=>agroSynthesisPanel.append(node("p",{class:"muted"},line)));
      agroSynthesisPanel.append(node("small",{class:"muted"},"Source météo : NASA POWER, estimations sur grille. Les dates sans valeur ne sont pas assimilées à zéro. Les seuils sont génériques et ne sont pas adaptés à une espèce, un stade cultural ou un sol précis."));
    }
    function renderClimateSummary(data){
      summary.replaceChildren();
      if(!data.length){summary.append(node("p",{class:"muted"},"Pas encore de données météo pour cette période. Importez l’historique pour obtenir des repères utiles."));return;}
      const byDate=new Map();
      data.forEach(r=>{if(r.value===null||r.value===undefined)return;const value=Number(r.value);if(!Number.isFinite(value))return;const day=String(r.observed_at).slice(0,10);if(!byDate.has(day))byDate.set(day,{});if(!Object.prototype.hasOwnProperty.call(byDate.get(day),r.variable_code))byDate.get(day)[r.variable_code]=value;});
      const allDays=[...byDate.keys()].sort();
      const days=allDays.slice(-7);
      const previousDays=allDays.slice(-14,-7);
      const rows=days.map(d=>byDate.get(d));
      const previousRows=previousDays.map(d=>byDate.get(d));
      const maxTemps=rows.map(x=>x.air_temperature_max).filter(Number.isFinite);
      const rain=rows.map(x=>x.precipitation_corrected).filter(Number.isFinite);
      const humid=rows.map(x=>x.relative_humidity_mean).filter(Number.isFinite);
      const uvValues=rows.map(x=>x.uv_index_daily_mean).filter(Number.isFinite);
      const previousTemps=previousRows.map(x=>x.air_temperature_max).filter(Number.isFinite);
      const previousRain=previousRows.map(x=>x.precipitation_corrected).filter(Number.isFinite);
      const previousHumid=previousRows.map(x=>x.relative_humidity_mean).filter(Number.isFinite);
      const temp=maxTemps.length?Math.max(...maxTemps):null;
      const rainTotal=rain.length?rain.reduce((a,b)=>a+b,0):null;
      const humidity=humid.length?humid.reduce((a,b)=>a+b,0)/humid.length:null;
      const previousTemp=previousTemps.length?Math.max(...previousTemps):null;
      const previousRainTotal=previousRain.length?previousRain.reduce((a,b)=>a+b,0):null;
      const previousHumidity=previousHumid.length?previousHumid.reduce((a,b)=>a+b,0)/previousHumid.length:null;
      const previousUvValues=previousRows.map(x=>x.uv_index_daily_mean).filter(Number.isFinite);
      const uvMean=uvValues.length?uvValues.reduce((a,b)=>a+b,0)/uvValues.length:null;
      const previousUvMean=previousUvValues.length?previousUvValues.reduce((a,b)=>a+b,0)/previousUvValues.length:null;
      const card=(label,value,note)=>{const box=node("div",{class:"card"});box.append(node("strong",{},label),node("p",{},value),node("small",{class:"muted"},note));return box;};
      const grid=node("div",{class:"grid"});
      grid.append(card("Pic de température",temp===null?"Indisponible":temp.toFixed(1)+" °C","Maximum observé sur les 7 dernières dates disponibles"));
      grid.append(card("Pluie cumulée",rainTotal===null?"Indisponible":rainTotal.toFixed(1)+" mm","Somme des précipitations disponibles"));
      grid.append(card("Humidité de l’air",humidity===null?"Indisponible":humidity.toFixed(0)+" %","Moyenne des observations disponibles"));
      grid.append(card("Indice UV moyen quotidien",uvMean===null?"Indisponible":uvMean.toFixed(1),"Estimation journalière NASA POWER ; ce n’est pas le pic UV instantané."));
      summary.append(grid);
      const uvDays=days.map(d=>({date:d,value:byDate.get(d).uv_index_daily_mean})).filter(p=>Number.isFinite(p.value));
      const uvCompare=uvComparisonPanel;uvCompare.replaceChildren(node("h3",{},"Comparatif UV automatique"));
      if(uvDays.length>=2){const first=uvDays[uvDays.length-2],last=uvDays[uvDays.length-1],delta=last.value-first.value;uvCompare.append(node("p",{},first.date+" : "+first.value.toFixed(1)+" → "+last.date+" : "+last.value.toFixed(1)),node("strong",{},(delta>0?"+":"")+delta.toFixed(1)+" point(s) UV"),node("p",{class:"muted"},delta>0?"Indice UV en hausse entre les deux dernières dates disponibles.":delta<0?"Indice UV en baisse entre les deux dernières dates disponibles.":"Indice UV stable entre les deux dernières dates disponibles."));}
      else uvCompare.append(node("p",{class:"muted"},"Le comparatif s’affichera dès que deux dates UV réelles seront disponibles."));
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
      compare("Indice UV moyen quotidien",uvMean,previousUvMean,"indice",3,uvValues.length,previousUvValues.length);
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
      const labels={air_temperature_mean:"Température moyenne",air_temperature_max:"Température maximale",air_temperature_min:"Température minimale",precipitation_corrected:"Précipitations",solar_radiation_all_sky:"Rayonnement solaire",relative_humidity_mean:"Humidité relative moyenne",wind_speed_mean:"Vitesse moyenne du vent",uv_index_daily_mean:"Indice UV moyen journalier"};
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
    function renderWeatherCharts(data){
      weatherCharts.replaceChildren();
      const lang="fr";
      const labels={
        air_temperature_max:{title:"Température maximale",unit:"°C",color:"#d78b56"},
        precipitation_corrected:{title:"Précipitations",unit:"mm",color:"#4b9bd5"},
        relative_humidity_mean:{title:"Humidité relative moyenne",unit:"%",color:"#65b982"},
        uv_index_daily_mean:{title:"Indice UV moyen journalier estimé",unit:"indice UV",color:"#9a6bda"}
      };
      const byDay=new Map();
      (data||[]).forEach(row=>{
        if(row.value===null||row.value===undefined||!Number.isFinite(Number(row.value)))return;
        const day=String(row.observed_at||"").slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
        if(!byDay.has(day))byDay.set(day,{});
        if(!Object.prototype.hasOwnProperty.call(byDay.get(day),row.variable_code))byDay.get(day)[row.variable_code]=Number(row.value);
      });
      const days=[...byDay.keys()].sort();
      if(!days.length){
        weatherCharts.append(node("p",{class:"muted"},"Les graphiques météo apparaîtront après l’import de données historiques réelles."));
        return;
      }
      weatherCharts.append(node("h3",{},"Évolution météo — données historiques NASA POWER"));
      weatherCharts.append(node("p",{class:"muted"},"Chaque graphique conserve sa propre unité. Les points correspondent uniquement aux observations historiques importées ; aucune valeur synthétique ni prévision n’est ajoutée."));
      Object.entries(labels).forEach(([key,meta])=>{
        const points=days.map(day=>({day,value:byDay.get(day)[key]})).filter(point=>Number.isFinite(point.value));
        const card=node("section",{class:"environmental-weather-chart card"});
        card.append(node("h4",{},meta.title+" ("+meta.unit+")"));
        if(points.length<2){
          card.append(node("p",{class:"muted"},"Au moins deux dates avec des valeurs réelles sont nécessaires pour tracer cette variable. Valeurs disponibles : "+points.length+"."));
          weatherCharts.append(card);
          return;
        }
        const width=760,height=230,left=60,right=18,top=20,bottom=42,values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),span=max-min||Math.max(Math.abs(max)*.1,1);
        const x=i=>left+i*(width-left-right)/(points.length-1),y=value=>top+(max-value)*(height-top-bottom)/span,ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
        svg.setAttribute("viewBox","0 0 "+width+" "+height);svg.setAttribute("role","img");svg.setAttribute("aria-label",meta.title+" ("+meta.unit+"), "+points.length+" dates réelles");
        for(let tick=0;tick<5;tick++){
          const value=min+(max-min)*tick/4,yy=y(value),line=document.createElementNS(ns,"line");
          line.setAttribute("x1",left);line.setAttribute("x2",width-right);line.setAttribute("y1",yy);line.setAttribute("y2",yy);line.setAttribute("stroke","currentColor");line.setAttribute("stroke-opacity",".17");svg.append(line);
          const label=node("text",{x:left-8,y:yy+4,"text-anchor":"end","font-size":"11",fill:"currentColor"},Number(value.toPrecision(4)).toString());svg.append(label);
        }
        const line=document.createElementNS(ns,"polyline");line.setAttribute("points",points.map((p,i)=>x(i)+","+y(p.value)).join(" "));line.setAttribute("fill","none");line.setAttribute("stroke",meta.color);line.setAttribute("stroke-width","2.7");line.setAttribute("stroke-linejoin","round");line.setAttribute("stroke-linecap","round");svg.append(line);
        points.forEach((p,i)=>{
          const circle=document.createElementNS(ns,"circle");circle.setAttribute("cx",x(i));circle.setAttribute("cy",y(p.value));circle.setAttribute("r","3.5");circle.setAttribute("fill",meta.color);
          const tip=document.createElementNS(ns,"title");tip.textContent=p.day+": "+p.value+" "+meta.unit;circle.append(tip);svg.append(circle);
        });
        const first=node("text",{x:left,y:height-12,"font-size":"11",fill:"currentColor"},points[0].day);
        const last=node("text",{x:width-right,y:height-12,"text-anchor":"end","font-size":"11",fill:"currentColor"},points[points.length-1].day);
        svg.append(first,last);card.append(svg,node("p",{class:"muted"},"Dates couvertes : "+points.length+" · dernière valeur : "+points[points.length-1].value+" "+meta.unit+" ("+points[points.length-1].day+")"));weatherCharts.append(card);
      });
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
      renderAgroSynthesis(data);
      renderWeatherCharts(data);
      if(!data.length){results.textContent="Aucune observation pour cette période.";return;}
      const table=node("table"); const head=node("tr");
      ["Date","Variable","Valeur","Unité","Source"].forEach(t=>head.append(node("th",{},t)));
      const thead=node("thead");thead.append(head);table.append(thead);
      const tbody=node("tbody");
      const labels={air_temperature_mean:"Température moyenne",air_temperature_max:"Température maximale",air_temperature_min:"Température minimale",precipitation_corrected:"Précipitations",solar_radiation_all_sky:"Rayonnement solaire",relative_humidity_mean:"Humidité relative moyenne",wind_speed_mean:"Vitesse moyenne du vent",uv_index_daily_mean:"Indice UV moyen journalier"};
      data.forEach(r=>{const tr=node("tr");[String(r.observed_at).slice(0,10),labels[r.variable_code]||r.variable_code,r.value==null?"—":String(r.value),r.unit_code||"—",r.provider_code+" · "+(r.quality_flag||"")].forEach(t=>tr.append(node("td",{},t)));tbody.append(tr);});
      table.append(tbody);results.append(table);
    }
    async function searchSatellite(){
      if(!location.value||!from.value||!to.value||from.value>to.value){satelliteMapStatus.textContent="Site satellite non configuré.";return;}
      const days=(Date.parse(to.value)-Date.parse(from.value))/86400000+1;
      if(days>180){satelliteMapStatus.textContent="Période satellite trop longue.";return;}
      satelliteButton.disabled=true;
      satelliteMapStatus.textContent="Recherche de la dernière image satellite…";
      try{
        // Search the open AWS Earth Search catalogue first; Copernicus is a fallback.
        let {data,error}=await db.functions.invoke("earth-search-sentinel2-catalogue",{body:{location_id:location.value,start_date:from.value,end_date:to.value,limit:10,max_cloud_cover:60}});
        let catalogueSource="Earth Search / AWS Open Data (sans OAuth)";
        if(error||!data?.ok||!Array.isArray(data?.scenes)||data.scenes.length===0){
          const fallback=await db.functions.invoke("copernicus-sentinel-catalogue",{body:{location_id:location.value,start_date:from.value,end_date:to.value,limit:10,max_cloud_cover:60}});
          if(!fallback.error&&fallback.data?.ok&&Array.isArray(fallback.data?.scenes)&&fallback.data.scenes.length){
            data=fallback.data;error=null;catalogueSource="Copernicus Data Space (secours)";
          }
        }
        satelliteResults.replaceChildren();
        if(error){satelliteMapStatus.textContent="Catalogue satellite indisponible.";return;}
        if(!data?.ok){satelliteMapStatus.textContent="Catalogue satellite indisponible.";return;}
        satelliteResults.append(node("p",{},data.scenes_found+" scène(s) trouvée(s) via "+catalogueSource+", couverture nuageuse maximale de 60 %."));
        if(!data.scenes?.length){satelliteMapStatus.textContent="Aucune image exploitable sur la période récente.";return;}
        const rankedScenes=[...data.scenes].sort((a,b)=>{
          const cloudA=Number.isFinite(a.cloud_cover_percent)?a.cloud_cover_percent:101;
          const cloudB=Number.isFinite(b.cloud_cover_percent)?b.cloud_cover_percent:101;
          const dateA=Date.parse(a.acquired_at||"")||0;
          const dateB=Date.parse(b.acquired_at||"")||0;
          const usableA=cloudA<=30?0:1, usableB=cloudB<=30?0:1;
          if(usableA!==usableB)return usableA-usableB;
          return usableA===0?dateB-dateA:cloudA-cloudB||dateB-dateA;
        });
        if(!rankedScenes.length){
          satelliteMapStatus.textContent="Aucune image satellite récente disponible.";
          return;
        }
        const candidate=rankedScenes[0];
        const sceneDate=candidate.acquired_at ? candidate.acquired_at.slice(0,10) : "";
        if(!sceneDate){
          satelliteMapStatus.textContent="Date d’image indisponible.";
          return;
        }
        satelliteMapStatus.textContent="Image Sentinel-2 · "+sceneDate+" · calcul en cours…";
        const currentNDVI=await showSentinelNDVI(sceneDate,"ndvi");
        const previousScene=rankedScenes.find(scene=>Number(scene.cloud_cover_percent)<=30&&String(scene.acquired_at||"").slice(0,10)<sceneDate);
        const previousDate=previousScene?String(previousScene.acquired_at).slice(0,10):"";
        const previousNDVI=previousDate?await fetchNDVIStats(previousDate):null;
        renderVegetationChart([previousNDVI,currentNDVI]);
      }catch(e){satelliteMapStatus.textContent="Recherche satellite indisponible.";}
      finally{satelliteButton.disabled=false;}
    }
    location.addEventListener("change",()=>{try{localStorage.setItem("ba-labs-active-environment-location",location.value);}catch(_){} satelliteResults.replaceChildren();selectLocation().then(()=>{if(location.value){loadRows();if(lat.value!==""&&lon.value!=="")searchSatellite();else satelliteMapStatus.textContent="Coordonnées du site manquantes.";}});});
    from.addEventListener("change",()=>location.value&&loadRows());
    to.addEventListener("change",()=>{if(location.value){loadRows();updateSatelliteMap();}});
    save.addEventListener("click",async()=>{
      if(!location.value || lat.value==="" || lon.value===""){status.textContent="Choisissez un emplacement et saisissez latitude et longitude.";return;}
      const a=Number(lat.value),o=Number(lon.value),acc=accuracy.value===""?null:Number(accuracy.value);
      if(!Number.isFinite(a)||a < -90||a>90||!Number.isFinite(o)||o < -180||o>180||(acc!==null&&(!Number.isFinite(acc)||acc<0))){status.textContent="Coordonnées invalides. Vérifiez les plages de latitude, longitude et précision.";return;}
      status.textContent="Enregistrement…";
      const {error}=await db.from("locations").update({latitude:a,longitude:o,coordinate_accuracy_m:acc,coordinate_source:source.value}).eq("id",location.value);
      status.textContent=error?"Échec de l’enregistrement : "+error.message:"Coordonnées enregistrées.";
      if(!error)updateSatelliteMap();
    });
    async function importWeather(forceRefresh=false){
      if(!location.value||!from.value||!to.value||from.value>to.value){status.textContent="Choisissez un emplacement et une période valide.";return;}
      const days=(Date.parse(to.value)-Date.parse(from.value))/86400000+1;
      if(days>366){status.textContent="La période maximale est de 366 jours.";return;}
      run.disabled=true; refresh.disabled=true;
      status.textContent=forceRefresh?"Actualisation forcée en cours…":"Collecte en cours…";
      try{
        const {data,error}=await db.functions.invoke("nasa-power-agroclimate",{body:{location_id:location.value,start_date:from.value,end_date:to.value,refresh:forceRefresh}});
        if(error){status.textContent="Échec de la collecte météo : "+await functionErrorMessage(error);return;}
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
    [
      ["ndvi","NDVI Sentinel-2"],
      ["true_color","Couleurs naturelles"],
      ["false_color","Fausses couleurs IR"]
    ].forEach(([mode,label])=>{
      const button=node("button",{type:"button"},label);
      button.addEventListener("click",()=>{
        if(!selectedSentinelSceneDate){satelliteMapStatus.textContent="Sélectionnez une scène Sentinel-2 dans les résultats avant de choisir ce rendu.";return;}
        showSentinelNDVI(selectedSentinelSceneDate,mode);
      });
      satelliteViewControls.append(button);
    });
    const regionalTrueColorButton=node("button",{type:"button"},"Contexte régional : couleurs naturelles");
    regionalTrueColorButton.addEventListener("click",()=>{if(satelliteLeafletMap&&satelliteTrueColorLayer){if(!satelliteLeafletMap.hasLayer(satelliteTrueColorLayer))satelliteTrueColorLayer.addTo(satelliteLeafletMap);if(satelliteNDVILayer&&satelliteLeafletMap.hasLayer(satelliteNDVILayer))satelliteLeafletMap.removeLayer(satelliteNDVILayer);satelliteMapStatus.textContent="Contexte régional MODIS en couleurs naturelles. Résolution kilométrique ; ne permet pas d’évaluer les parcelles individuellement.";}});
    const regionalNDVIButton=node("button",{type:"button"},"Contexte régional : NDVI MODIS");
    regionalNDVIButton.addEventListener("click",()=>{if(satelliteLeafletMap&&satelliteNDVILayer){if(!satelliteLeafletMap.hasLayer(satelliteNDVILayer))satelliteNDVILayer.addTo(satelliteLeafletMap);if(satelliteTrueColorLayer&&satelliteLeafletMap.hasLayer(satelliteTrueColorLayer))satelliteLeafletMap.removeLayer(satelliteTrueColorLayer);satelliteMapStatus.textContent="Contexte régional MODIS NDVI (composite 16 jours). Palette NASA et résolution kilométrique : interprétation indicative uniquement.";}});
    satelliteViewControls.append(regionalTrueColorButton,regionalNDVIButton);
    const {data: authState}=await db.auth.getSession();
    if(!authState?.session){
      status.textContent="Connectez-vous à CultureOps pour accéder aux emplacements de votre organisation.";
      db.auth.onAuthStateChange((_event,session)=>{if(session){panel.classList.remove("hidden");loadLocations().then(()=>{if(location.value){importWeather(false);if(lat.value!==""&&lon.value!=="")searchSatellite();else satelliteMapStatus.textContent="Coordonnées du site manquantes.";}});}});
      return;
    }
    panel.classList.remove("hidden");
    await loadLocations();
    if(location.value){importWeather(false);if(lat.value!==""&&lon.value!=="")searchSatellite();else satelliteMapStatus.textContent="Coordonnées du site manquantes.";}
  }
  const watch=new MutationObserver(()=>{if(document.getElementById("plantCard")){watch.disconnect();init().catch(e=>console.error("Environmental context",e));}});
  watch.observe(document.getElementById("workspace-root")||document.body,{childList:true,subtree:true});
  if(document.getElementById("plantCard")){watch.disconnect();init().catch(e=>console.error("Environmental context",e));}
})();