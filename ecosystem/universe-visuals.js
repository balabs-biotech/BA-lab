/* BA Labs — eight distinct, source-verified scientific image stories. */
(()=> {
 const cards=[...document.querySelectorAll('.universe-index-card[data-domain-page]')];
 if(!cards.length||document.documentElement.dataset.universeVisuals==='ready')return;
 document.documentElement.dataset.universeVisuals='ready';
 const images={
  myco:{src:commons('Pleurotus ostreatus on agar.jpg'),page:'https://commons.wikimedia.org/wiki/File:Pleurotus_ostreatus_on_agar.jpg',label:'PLEUROTUS / AGAR CULTURE',alt:'Mycélium de Pleurotus ostreatus en croissance sur milieu gélosé',credit:'Michał Wadas · CC BY-SA 4.0'},
  bio:{src:commons('Microscopic Image of Penicillium conidial fungi.jpg'),page:'https://commons.wikimedia.org/wiki/File:Asco1013.jpg',label:'PENICILLIUM / CONIDIOPHORES',alt:'Conidiophores et conidies de Penicillium en microscopie optique',credit:'Jon Houseman & Matthew Ford · CC BY-SA'},
  iot:{src:commons('Data Logger.jpg'),page:'https://commons.wikimedia.org/wiki/File:Data_logger.jpg',label:'FIELD SENSING / DATA LOGGER',alt:'Enregistreur portable de température et d’humidité relative',credit:'Cjp24 · CC BY-SA'},
  soil:{src:commons('Soil layers.jpg'),page:'https://commons.wikimedia.org/wiki/File:Compost.layers.jpg',label:'SOIL / DECOMPOSITION PROFILE',alt:'Coupe d’un tas de compost montrant plusieurs stades de décomposition',credit:'Red58bill · CC BY 3.0'},
  lab:{src:commons('Lab bench with lab equipment.jpg'),page:'https://commons.wikimedia.org/wiki/File:Penicillium_in_LPCB_Tease_Mount_Microscopy.jpg',label:'MICROBIOLOGY / LPCB',alt:'Préparation microscopique de Penicillium colorée au lactophénol coton bleu',credit:'Ajay Kumar Chaurasiya · CC BY-SA'},
  products:{src:commons('20210719 Pleurotus ostreatus 017-024.jpg'),page:'https://commons.wikimedia.org/wiki/File:20210719_Pleurotus_ostreatus_098-127.jpg',label:'PLEUROTUS / CULTIVATION KIT',alt:'Pleurotes gris cultivés sur substrat de copeaux de bois',credit:'Zinnmann · Wikimedia Commons'},
  work:{src:commons('Candida fungus colony grown on agar media.jpg'),page:'https://webstories.fontagro.org/',label:'COLONY / RADIAL GROWTH',alt:'Colonie fongique en croissance radiale sur milieu de culture',credit:'FONTAGRO · source image'},
  evidence:{src:commons('Microscopic View of Penicillium Conidia.jpg'),page:'https://commons.wikimedia.org/wiki/File:Fungi_seen_with_fluorescence_microscope.jpg',label:'FUNGAL CELLS / FLUORESCENCE',alt:'Champignons observés en microscopie à fluorescence',credit:'Juan Carlos Fonseca Mata · CC BY 4.0'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const commons=file=>'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)+'?width=1400';
 cards.forEach((card,index)=>{
  const data=images[card.dataset.domainPage];if(!data)return;
  const figure=document.createElement('figure');figure.className='universe-visual';
  const img=document.createElement('img');img.src=data.src;img.alt=data.alt;img.loading=index<4?'eager':'lazy';img.decoding='async';img.addEventListener('error',()=>figure.classList.add('image-unavailable'),{once:true});figure.dataset.universeVisual=card.dataset.domainPage;
  const caption=document.createElement('figcaption');
  const subject=document.createElement('span');subject.textContent=data.label;
  const credit=document.createElement('small');credit.textContent='IMAGE / '+data.credit;
  const source=document.createElement('a');source.href=data.page;source.target='_blank';source.rel='noopener noreferrer';source.textContent='SOURCE ↗';source.setAttribute('aria-label','Ouvrir la source de cette image');
  caption.append(subject,credit,source);figure.append(img,caption);card.prepend(figure);
  if(!reduced&&matchMedia('(hover:hover) and (pointer:fine)').matches){
   card.addEventListener('pointermove',event=>{const r=card.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;card.style.setProperty('--pointer-x',(x*1.6).toFixed(2)+'%');card.style.setProperty('--pointer-y',(y*1.6).toFixed(2)+'%')});
   card.addEventListener('pointerleave',()=>{card.style.setProperty('--pointer-x','0%');card.style.setProperty('--pointer-y','0%')});
  }
 });
})();