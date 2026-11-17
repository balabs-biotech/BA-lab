/* BA Labs — dedicated visual identity for each of the eight universes. */
(()=> {
 const cards=[...document.querySelectorAll('.universe-index-card[data-domain-page]')];
 if(!cards.length||document.documentElement.dataset.universeVisuals==='ready')return;
 document.documentElement.dataset.universeVisuals='ready';
 const images={
  myco:{file:'Fungal_mycelium.jpg',page:'https://commons.wikimedia.org/wiki/File:Fungal_mycelium.jpg',label:'FUNGAL HYPHAE / MICROSCOPY',alt:'Mycélium fongique observé au microscope'},
  bio:{file:'Bioclogging.jpg',page:'https://commons.wikimedia.org/wiki/File:Bioclogging.jpg',label:'PSEUDOMONAS / BIOFILM',alt:'Biofilm de Pseudomonas observé en microscopie confocale'},
  iot:{file:'Environmental_Cameras_and_Sensors.jpg',page:'https://commons.wikimedia.org/wiki/File:Environmental_Cameras_and_Sensors.jpg',label:'FIELD SENSORS / MONITORING',alt:'Capteurs environnementaux pour le suivi des cultures'},
  soil:{file:'Installation_of_soil_sensors.jpg',page:'https://commons.wikimedia.org/wiki/File:Installation_of_soil_sensors.jpg',label:'SOIL PROBES / FIELD STUDY',alt:'Installation de sondes de mesure dans le sol'},
  lab:{file:'Confocal_Microscopes_Center_for_Biofilm_Research_MSU.jpg',page:'https://commons.wikimedia.org/wiki/File:Confocal_Microscopes_Center_for_Biofilm_Research_MSU.jpg',label:'CONFOCAL / RESEARCH LAB',alt:'Microscopes confocaux dans un laboratoire de recherche'},
  products:{file:'Mycelium_Composites.jpg',page:'https://commons.wikimedia.org/wiki/File:Mycelium_Composites.jpg',label:'MYCELIUM / BIOCOMPOSITES',alt:'Matériaux composites développés à partir de mycélium'},
  work:{file:'Biofilm.jpg',page:'https://commons.wikimedia.org/wiki/File:Biofilm.jpg',label:'BIOFILM / DEVELOPMENT',alt:'Étapes de développement d’un biofilm observées au microscope'},
  learn:{file:'NFDI4BIOIMAGE_Calendar_March_2025_-_image_march.png',page:'https://commons.wikimedia.org/wiki/File:NFDI4BIOIMAGE_Calendar_March_2025_-_image_march.png',label:'BIOIMAGE / OPEN SCIENCE',alt:'Image de microscopie d’un biofilm de Pseudomonas'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 cards.forEach((card,index)=>{
  const data=images[card.dataset.domainPage];if(!data)return;
  const figure=document.createElement('figure');figure.className='universe-visual';figure.setAttribute('aria-hidden','true');
  const img=document.createElement('img');img.src='https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(data.file)+'?width=1200';img.alt=data.alt;img.loading=index<4?'eager':'lazy';img.decoding='async';
  img.addEventListener('error',()=>{figure.classList.add('is-unavailable');},{once:true});
  const caption=document.createElement('figcaption');const link=document.createElement('a');link.href=data.page;link.target='_blank';link.rel='noopener';link.textContent=data.label;caption.append(link);
  figure.append(img,caption);card.prepend(figure);
  if(!reduced&&matchMedia('(hover:hover) and (pointer:fine)').matches){
   card.addEventListener('pointermove',event=>{
    const r=card.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;
    card.style.setProperty('--pointer-x',(x*1.6).toFixed(2)+'%');
    card.style.setProperty('--pointer-y',(y*1.6).toFixed(2)+'%');
   });
   card.addEventListener('pointerleave',()=>{card.style.setProperty('--pointer-x','0%');card.style.setProperty('--pointer-y','0%')});
  }
 });
 if(!reduced&&'IntersectionObserver'in window){
  const io=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(entry.isIntersecting){entry.target.classList.add('is-visual-active');io.unobserve(entry.target)}
  }),{threshold:.12});
  cards.forEach(card=>io.observe(card));
 }
})();