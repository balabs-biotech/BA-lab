/* BA Labs — one image-led, animated signature for every editorial chapter.
   Image sources and licences are documented in IMAGE-CREDITS.md. */
(()=> {
 const track=document.getElementById('experienceTrack');
 if(!track||track.dataset.atmosphereReady)return;
 track.dataset.atmosphereReady='true';
 const base='https://commons.wikimedia.org/wiki/Special:FilePath/';
 const visuals={
  home:{file:'Fungal mycelium.jpg',page:'https://commons.wikimedia.org/wiki/File:Fungal_mycelium.jpg',alt:'Hyphes et mycélium fongique observés en préparation microscopique',tag:'LIVING SYSTEMS',credit:'Ajay Kumar Chaurasiya · CC BY 4.0'},
  research:{file:'IoT environmental monitoring system solution - Overview.jpg',page:'https://commons.wikimedia.org/wiki/File:IoT_environmental_monitoring_system_solution_-_Overview.jpg',alt:'Architecture de surveillance environnementale par capteurs et acquisition de données',tag:'FIELD INSTRUMENTATION',credit:'Stephane Malhomme · CC BY-SA 4.0'},
  network:{file:'Oyster mushroom (Pleurotus ostreatus) mycelium in petri dish on coffee grounds.JPG',page:'https://commons.wikimedia.org/wiki/File:Oyster_mushroom_(Pleurotus_ostreatus)_mycelium_in_petri_dish_on_coffee_grounds.JPG',alt:'Culture de Pleurotus ostreatus développant son mycélium sur marc de café',tag:'BIOLOGICAL NETWORK',credit:'Tobi Kellner · CC BY-SA 3.0'},
  catalogue:{file:'Mycelium Composites.jpg',page:'https://commons.wikimedia.org/wiki/File:Mycelium_Composites.jpg',alt:'Échantillons de biomatériaux composites développés à partir de mycélium',tag:'CULTURES & MATERIALS',credit:'Eti Issa · CC BY-SA 4.0'},
  about:{file:'Confocal Microscopes Center for Biofilm Research MSU.jpg',page:'https://commons.wikimedia.org/wiki/File:Confocal_Microscopes_Center_for_Biofilm_Research_MSU.jpg',alt:'Équipements de microscopie confocale dans un centre de recherche sur les biofilms',tag:'RESEARCH METHOD',credit:'Unknown Photographers · CC BY-SA 4.0'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 Object.entries(visuals).forEach(([key,data])=>{
  const page=track.querySelector('.experience-page[data-chapter="'+key+'"]');if(!page)return;
  const figure=document.createElement('figure');figure.className='chapter-atmosphere';
  const img=document.createElement('img');img.src=base+encodeURIComponent(data.file)+'?width=1600';img.alt=data.alt;img.loading=key==='home'?'eager':'lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>figure.classList.add('is-unavailable'),{once:true});
  const caption=document.createElement('figcaption');
  const tag=document.createElement('span');tag.textContent=data.tag;
  const credit=document.createElement('small');credit.textContent='IMAGE / '+data.credit;
  const source=document.createElement('a');source.href=data.page;source.target='_blank';source.rel='noopener';source.textContent='SOURCE ↗';source.setAttribute('aria-label','Voir la source de l’image : '+data.tag);
  caption.append(tag,credit,source);
  const filament=document.createElementNS('http://www.w3.org/2000/svg','svg');
  filament.setAttribute('viewBox','0 0 360 180');filament.setAttribute('preserveAspectRatio','none');filament.setAttribute('aria-hidden','true');
  filament.innerHTML='<path d="M12 150 C78 142 76 34 145 64 S222 156 268 88 S314 26 348 18"/><path d="M145 64 C132 25 102 18 86 8 M268 88 C286 119 313 128 344 146"/>';
  figure.append(img,filament,caption);page.prepend(figure);
  if(!reduced)figure.classList.add('is-animated');
 });
})();