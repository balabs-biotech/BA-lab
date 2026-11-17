/* BA Labs — eight dedicated scientific image stories, reusing verified site assets. */
(()=> {
 const cards=[...document.querySelectorAll('.universe-index-card[data-domain-page]')];
 if(!cards.length||document.documentElement.dataset.universeVisuals==='ready')return;
 document.documentElement.dataset.universeVisuals='ready';
 const images={
  myco:{src:'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pleurotus_ostreatus_on_agar.jpg',page:'https://commons.wikimedia.org/wiki/File:Pleurotus_ostreatus_on_agar.jpg',label:'PLEUROTUS / AGAR CULTURE',alt:'Mycélium de Pleurotus ostreatus en croissance sur milieu gélosé',credit:'Michał Wadas · CC BY-SA 4.0'},
  bio:{src:'https://commons.wikimedia.org/wiki/Special:FilePath/Microscopic%20Image%20of%20Penicillium%20conidial%20fungi.jpg',page:'https://commons.wikimedia.org/wiki/File:Microscopic_Image_of_Penicillium_conidial_fungi.jpg',label:'PENICILLIUM / FLUORESCENCE',alt:'Conidies de Penicillium observées au microscope',credit:'Syed Sajidul Islam · CC BY-SA 4.0'},
  iot:{src:'https://www.iothrifty.com/cdn/shop/products/GS1-callouts3_1200x1200.jpg?v=1652272467',page:'https://www.iothrifty.com/products/gs1-industrial-grade-wifi-or-4g-temperature-humidity-data-logger-remote-environmental-monitoring-system-with-display',label:'FIELD SENSING / DATA LOGGER',alt:'Enregistreur de données IoT pour le suivi de la température et de l’humidité',credit:'UbiBot GS1 · image produit'},
  soil:{src:'https://hotbincomposting.com/cdn/shop/articles/Humus-Compost-8887567.jpg?v=1762172590',page:'https://hotbincomposting.com/blogs/science/all-about-humus-and-compost',label:'ORGANIC MATTER / COMPOST',alt:'Humus et matière organique compostée',credit:'HOTBIN Composting · source image'},
  lab:{src:'https://commons.wikimedia.org/wiki/Special:FilePath/Asco1013.jpg',page:'https://commons.wikimedia.org/wiki/File:Asco1013.jpg',label:'SENSING LAB / INSTRUMENTATION',alt:'Observation microscopique de Penicillium et de ses conidiophores',credit:'Jon Houseman et Matthew Ford · CC BY-SA 3.0'},
  products:{src:'https://www.manitariakolindrou.gr/sites/default/files/styles/basicpagetop/public/ypostroma_top.jpg?itok=NjLTvxKs',page:'https://www.manitariakolindrou.gr/en/mushrooms/pleurotus-mushroom-substrate',label:'GROWTH SYSTEM / SUBSTRATE',alt:'Substrat de production pour pleurotes',credit:'Kolindros Mushrooms · source image'},
  work:{src:'https://webstories.fontagro.org/uploads/adjuntos/3-9.jpg',page:'https://webstories.fontagro.org/',label:'COLONY / RADIAL GROWTH',alt:'Colonie fongique en croissance radiale sur milieu de culture',credit:'FONTAGRO · source image'},
  learn:{src:'https://commons.wikimedia.org/wiki/Special:FilePath/Fungi%20seen%20with%20fluorescence%20microscope.jpg',page:'https://commons.wikimedia.org/wiki/File:Fungi_seen_with_fluorescence_microscope.jpg',label:'PODOSPORA / FLUORESCENCE',alt:'Champignons observés en microscopie à fluorescence',credit:'Juan Carlos Fonseca Mata · CC BY 4.0'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 cards.forEach((card,index)=>{
  const data=images[card.dataset.domainPage];if(!data)return;
  const figure=document.createElement('figure');figure.className='universe-visual';
  const img=document.createElement('img');img.src=data.src;img.alt=data.alt;img.loading=index<4?'eager':'lazy';img.decoding='async';
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