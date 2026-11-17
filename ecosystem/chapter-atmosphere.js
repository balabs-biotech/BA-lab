/* BA Labs — large photographic signatures for each editorial chapter. */
(()=> {
 const track=document.getElementById('experienceTrack');if(!track||track.dataset.atmosphereReady)return;track.dataset.atmosphereReady='true';
 const visuals={
  home:{src:'https://upload.wikimedia.org/wikipedia/commons/e/ee/Mycelium.JPG',alt:'Hyphes de Podospora anserina observées en microscopie à fluorescence',tag:'LIVING SYSTEMS',credit:'Christian Scheckhuber · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Mycelium.JPG'},
  research:{src:'https://www.collezionemicrobica.enea.it/images/uo/brindisi/uo09_foto-1.jpg',alt:'Enregistreur de données IoT pour le suivi de paramètres environnementaux',tag:'FIELD INSTRUMENTATION',credit:'Niau33 · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:LPMDL-110X_IoT_solar_level_monitoring_data_logger.jpg'},
  network:{src:'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pleurotus_ostreatus_on_agar.jpg',alt:'Mycélium de Pleurotus ostreatus se développant sur du marc de café dans une boîte de culture',tag:'BIOLOGICAL NETWORK',credit:'Tobi Kellner · CC BY-SA 3.0',page:'https://commons.wikimedia.org/wiki/File:Oyster_mushroom_(Pleurotus_ostreatus)_mycelium_in_petri_dish_on_coffee_grounds.JPG'},
  catalogue:{src:'https://www.manitariakolindrou.gr/sites/default/files/styles/basicpagetop/public/ypostroma_top.jpg?itok=NjLTvxKs',alt:'Pleurotes en développement sur des blocs de substrat colonisés',tag:'CULTURES & MATERIALS',credit:'Mushroom Materials · source image',page:'https://www.mushroommaterials.com/'},
  about:{src:'https://iiif.wellcomecollection.org/image/B0004843/full/800%2C/0/default.jpg',alt:'Culture fongique en boîte de Petri, photographiée en gros plan dans un laboratoire de biologie',tag:'BIOLOGIE EXPÉRIMENTALE',credit:'Yakuzakorat · CC BY 4.0',page:'https://commons.wikimedia.org/wiki/File:Fungus_in_glass_dish3.jpg'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 Object.entries(visuals).forEach(([key,data])=>{
  const page=track.querySelector('.experience-page[data-chapter="'+key+'"]');if(!page)return;
  const figure=document.createElement('figure');figure.className='chapter-atmosphere';
  const img=document.createElement('img');img.src=data.src;img.alt=data.alt;img.loading=key==='home'?'eager':'lazy';img.decoding='async';
  const fallback=key==='research'?'https://www.collezionemicrobica.enea.it/images/uo/brindisi/uo09_foto-1.jpg':key==='catalogue'?'https://www.manitariakolindrou.gr/sites/default/files/styles/basicpagetop/public/ypostroma_top.jpg?itok=NjLTvxKs':'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pleurotus_ostreatus_on_agar.jpg';

  const caption=document.createElement('figcaption');const tag=document.createElement('span');tag.textContent=data.tag;
  const credit=document.createElement('small');credit.textContent='IMAGE / '+data.credit;
  const source=document.createElement('a');source.href=data.page;source.target='_blank';source.rel='noopener noreferrer';source.textContent='SOURCE ↗';source.setAttribute('aria-label','Ouvrir la source de cette image');
  caption.append(tag,credit,source);
  const filament=document.createElementNS('http://www.w3.org/2000/svg','svg');filament.setAttribute('viewBox','0 0 360 180');filament.setAttribute('preserveAspectRatio','none');filament.setAttribute('aria-hidden','true');
  filament.innerHTML='<path d="M12 150 C78 142 76 34 145 64 S222 156 268 88 S314 26 348 18"/><path d="M145 64 C132 25 102 18 86 8 M268 88 C286 119 313 128 344 146"/>';
  figure.append(img,filament,caption);page.prepend(figure);if(!reduced)figure.classList.add('is-animated');
 });
})();