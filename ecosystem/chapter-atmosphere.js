/* BA Labs — chapter atmosphere: one image-led animated signature per public page. */
(()=> {
 const track=document.getElementById('experienceTrack');
 if(!track||track.dataset.atmosphereReady)return;
 track.dataset.atmosphereReady='true';
 const visuals={
  home:{src:'https://upload.wikimedia.org/wikipedia/commons/e/ee/Mycelium.JPG',alt:'Mycelium observé en microscopie',tag:'LIVING SYSTEMS'},
  research:{src:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/LPMDL-110X_IoT_solar_level_monitoring_data_logger.jpg/1280px-LPMDL-110X_IoT_solar_level_monitoring_data_logger.jpg',alt:'Instrumentation et acquisition de données',tag:'FIELD INSTRUMENTATION'},
  network:{src:'https://upload.wikimedia.org/wikipedia/commons/3/31/Oyster_mushroom_%28Pleurotus_ostreatus%29_mycelium_in_petri_dish_on_coffee_grounds.JPG',alt:'Culture de mycélium de Pleurotus ostreatus',tag:'BIOLOGICAL NETWORK'},
  catalogue:{src:'https://www.ifam.fraunhofer.de/en/magazine/DeDrug-Bio/jcr%3Acontent/contentPar/sectioncomponent/sectionParsys/textwithinlinedimage/imageComponent2/image.img.4col.large.png/1742310480431/Mycel-von-Penicillium-angefaerbt-mit-Acridinorange-200x-1.png',alt:'Hyphes fongiques observées en fluorescence',tag:'CULTURES & MATERIALS'},
  about:{src:'https://webstories.fontagro.org/uploads/adjuntos/3-9.jpg',alt:'Observation scientifique de matière biologique',tag:'RESEARCH METHOD'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 Object.entries(visuals).forEach(([key,data])=>{
  const page=track.querySelector('.experience-page[data-chapter="'+key+'"]');
  if(!page)return;
  const figure=document.createElement('figure');
  figure.className='chapter-atmosphere';
  figure.setAttribute('aria-hidden','true');
  const img=document.createElement('img');
  img.src=data.src;img.alt='';img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>figure.classList.add('is-unavailable'),{once:true});
  const caption=document.createElement('figcaption');
  caption.textContent=data.tag;
  const filament=document.createElementNS('http://www.w3.org/2000/svg','svg');
  filament.setAttribute('viewBox','0 0 360 180');filament.setAttribute('preserveAspectRatio','none');
  filament.innerHTML='<path d="M12 150 C78 142 76 34 145 64 S222 156 268 88 S314 26 348 18"/><path d="M145 64 C132 25 102 18 86 8 M268 88 C286 119 313 128 344 146"/>';
  figure.append(img,filament,caption);
  page.prepend(figure);
  if(!reduced)figure.classList.add('is-animated');
 });
})();