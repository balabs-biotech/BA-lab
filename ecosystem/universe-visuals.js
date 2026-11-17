/* BA Labs — eight distinct, source-verified scientific image stories. */
(()=> {
 const cards=[...document.querySelectorAll('.universe-index-card[data-domain-page]')];
 if(!cards.length||document.documentElement.dataset.universeVisuals==='ready')return;
 document.documentElement.dataset.universeVisuals='ready';
 const images={
  myco:{src:'./assets/universe-myco.jpg',page:'https://commons.wikimedia.org/wiki/File:Pleurotus_ostreatus_on_agar.jpg',label:'PLEUROTUS / AGAR CULTURE',alt:'Mycélium de Pleurotus ostreatus en croissance sur milieu gélosé',credit:'Michał Wadas · CC BY-SA 4.0'},
  bio:{src:'./assets/universe-bio.jpg',page:'https://commons.wikimedia.org/wiki/File:Microscopic_Image_of_Penicillium_conidial_fungi.jpg',label:'PENICILLIUM / CONIDIOPHORES',alt:'Conidiophores et conidies de Penicillium en microscopie optique',credit:'Syed Sajidul Islam · Wikimedia Commons'},
  iot:{src:'./assets/universe-iot.svg',page:'https://doi.org/10.3390/s22155646',label:'AEROPONICS / IoT ARCHITECTURE',alt:'Architecture en couches du système de surveillance IoT appliqué à une serre aéroponique',credit:'BA Labs · illustration vectorielle originale'},
  soil:{src:'./assets/universe-soil.jpg',page:'https://doi.org/10.3389/fpls.2021.668929',label:'TECHNOSOIL / ROOT–MINERAL INTERFACE',alt:'Micrographie d’une section de sol montrant les pores, les dépôts minéraux et une interface racinaire',credit:'Bandara et al. · Frontiers in Plant Science · CC BY 4.0'},
  lab:{src:'./assets/universe-lab.jpg',page:'https://commons.wikimedia.org/wiki/File:Lab_bench_with_lab_equipment.jpg',label:'LAB / INSTRUMENTATION',alt:'Paillasse avec plusieurs équipements de laboratoire',credit:'Jba.batista · CC BY-SA 4.0'},
  products:{src:'./assets/universe-products.jpg',page:'https://commons.wikimedia.org/wiki/File:20210719_Pleurotus_ostreatus_017-024.jpg',label:'PLEUROTUS / CULTIVATION KIT',alt:'Pleurotes gris cultivés sur substrat de copeaux de bois',credit:'Zinnmann · Wikimedia Commons'},
  work:{src:'./assets/universe-work.jpg',page:'https://commons.wikimedia.org/wiki/File:Candida_fungus_colony_grown_on_agar_media.jpg',label:'FUNGAL COLONY / AGAR',alt:'Colonie de levure cultivée sur milieu gélosé',credit:'Ivan Pashkov · Wikimedia Commons'},
  learn:{src:'./assets/universe-evidence.jpg',page:'https://commons.wikimedia.org/wiki/File:Microscopic_View_of_Penicillium_Conidia.jpg',label:'PENICILLIUM / CONIDIA',alt:'Conidies de Penicillium observées au microscope',credit:'Ajay Kumar Chaurasiya · Wikimedia Commons'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 cards.forEach((card,index)=>{
  const data=images[card.dataset.domainPage];if(!data)return;
  const figure=document.createElement('figure');figure.className='universe-visual';
  const img=document.createElement('img');img.src=data.src;img.alt=data.alt;img.loading=index<4?'eager':'lazy';img.decoding='async';img.addEventListener('error',()=>figure.classList.add('is-unavailable'),{once:true});img.addEventListener('load',()=>figure.classList.remove('is-unavailable'));figure.dataset.universeVisual=card.dataset.domainPage;
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