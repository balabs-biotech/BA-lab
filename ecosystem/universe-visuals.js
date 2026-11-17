/* BA Labs — eight dedicated scientific image stories, reusing verified site assets. */
(()=> {
 const cards=[...document.querySelectorAll('.universe-index-card[data-domain-page]')];
 if(!cards.length||document.documentElement.dataset.universeVisuals==='ready')return;
 document.documentElement.dataset.universeVisuals='ready';
 const images={
  myco:{src:'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pleurotus_ostreatus_on_agar.jpg',page:'https://commons.wikimedia.org/wiki/File:Pleurotus_ostreatus_on_agar.jpg',label:'PLEUROTUS / AGAR CULTURE',alt:'Mycélium de Pleurotus ostreatus en croissance sur milieu gélosé',credit:'Michał Wadas · CC BY-SA 4.0'},
  bio:{src:'https://www.ifam.fraunhofer.de/en/magazine/DeDrug-Bio/jcr%3Acontent/contentPar/sectioncomponent/sectionParsys/textwithinlinedimage/imageComponent2/image.img.4col.large.png/1742310480431/Mycel-von-Penicillium-angefaerbt-mit-Acridinorange-200x-1.png',page:'https://www.ifam.fraunhofer.de/en/magazine/DeDrug-Bio.html',label:'PENICILLIUM / FLUORESCENCE',alt:'Hyphes de Penicillium marquées à l’acridine orange et observées en fluorescence',credit:'Fraunhofer IFAM · source image'},
  iot:{src:'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/LPMDL-110X_IoT_solar_level_monitoring_data_logger.jpg/1280px-LPMDL-110X_IoT_solar_level_monitoring_data_logger.jpg',page:'https://commons.wikimedia.org/wiki/File:LPMDL-110X_IoT_solar_level_monitoring_data_logger.jpg',label:'FIELD SENSING / DATA LOGGER',alt:'Enregistreur de données IoT portable pour le suivi de paramètres environnementaux',credit:'Niau33 · CC BY-SA 4.0'},
  soil:{src:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Organic_Compost.jpg/1280px-Organic_Compost.jpg',page:'https://commons.wikimedia.org/wiki/File:Organic_Compost.jpg',label:'ORGANIC MATTER / COMPOST',alt:'Matière organique compostée en gros plan',credit:'Azorbli · CC BY-SA 4.0'},
  lab:{src:'https://www.datocms-assets.com/31538/1604050588-sensingsolutionslab19.jpg',page:'https://www.datocms-assets.com/31538/1604050588-sensingsolutionslab19.jpg',label:'SENSING LAB / INSTRUMENTATION',alt:'Banc de laboratoire pour essais de capteurs et mesures environnementales',credit:'Sensing Solutions Lab · source image'},
  products:{src:'https://images.squarespace-cdn.com/content/v1/6094285c54e29a05c2abf169/1630084749140-LWY62FPY6Z0DEI5ZCEJF/IMG_2319.jpeg?format=1000w',page:'https://www.mushroommaterials.com/',label:'GROWTH SYSTEM / SUBSTRATE',alt:'Pleurotes en développement sur des blocs de substrat colonisés',credit:'Mushroom Materials · source image'},
  work:{src:'https://webstories.fontagro.org/uploads/adjuntos/3-9.jpg',page:'https://webstories.fontagro.org/',label:'COLONY / RADIAL GROWTH',alt:'Colonie fongique à croissance radiale dans une boîte de Petri',credit:'FONTAGRO · source image'},
  learn:{src:'https://upload.wikimedia.org/wikipedia/commons/e/ee/Mycelium.JPG',page:'https://commons.wikimedia.org/wiki/File:Mycelium.JPG',label:'PODOSPORA / FLUORESCENCE',alt:'Hyphes de Podospora anserina observées en microscopie à fluorescence',credit:'Christian Scheckhuber · CC BY-SA 4.0'}
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