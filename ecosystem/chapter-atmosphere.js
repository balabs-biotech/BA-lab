/* BA Labs — large photographic signatures for each editorial chapter. */
(()=> {
 const track=document.getElementById('experienceTrack');if(!track||track.dataset.atmosphereReady)return;track.dataset.atmosphereReady='true';
 const visuals={
  home:{src:'./assets/chapter-home.jpg',alt:'Morphologies de croissance de Pleurotus ostreatus sur milieux de culture à différents pH',tag:'PLEUROTUS / CULTURE MORPHOLOGY',credit:'Maseko et al. · International Journal of Food Science · CC BY 4.0',page:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11698607/'},
  research:{src:'./assets/chapter-research.jpg',alt:'Croissance de Pleurotus ostreatus sur plusieurs formulations de milieux nutritifs',tag:'NUTRIENT MEDIA / CULTURE',credit:'Maseko et al. · International Journal of Food Science · CC BY 4.0',page:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11698607/'},
  network:{src:'./assets/chapter-network.jpg',alt:'Croissance fongique en boîte de Petri lors d’une fermentation à l’état solide',tag:'BIOPROCESS / CULTURE',credit:'Luis Fernando Flores LAB · CC BY',page:'https://commons.wikimedia.org/wiki/File:Petri_dish_with_solid-state_fermentation.jpg'},
  catalogue:{src:'./assets/chapter-catalogue.jpg',alt:'Pleurotus ostreatus cultivé sur substrat à base de copeaux de bois',tag:'CULTURES & MATERIALS',credit:'Zinnmann · Wikimedia Commons',page:'https://commons.wikimedia.org/wiki/File:20210719_Pleurotus_ostreatus_025-047.jpg'},
  about:{src:'./assets/chapter-about.jpg',alt:'Graphiques de contribution des variables à la production de protéines mycéliennes de Pleurotus ostreatus',tag:'MYCELIUM / NUTRIENT MODEL',credit:'Maseko et al. · International Journal of Food Science · CC BY 4.0',page:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11698607/'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 Object.entries(visuals).forEach(([key,data])=>{
  const page=track.querySelector('.experience-page[data-chapter="'+key+'"]');if(!page)return;
  const figure=document.createElement('figure');figure.className='chapter-atmosphere';
  const img=document.createElement('img');img.src=data.src;img.alt=data.alt;img.loading=key==='home'?'eager':'lazy';img.decoding='async';img.addEventListener('error',()=>figure.classList.add('is-unavailable'),{once:true});img.addEventListener('load',()=>figure.classList.remove('is-unavailable'));

  const caption=document.createElement('figcaption');const tag=document.createElement('span');tag.textContent=data.tag;
  const credit=document.createElement('small');credit.textContent='IMAGE / '+data.credit;
  const source=document.createElement('a');source.href=data.page;source.target='_blank';source.rel='noopener noreferrer';source.textContent='SOURCE ↗';source.setAttribute('aria-label','Ouvrir la source de cette image');
  caption.append(tag,credit,source);
  const filament=document.createElementNS('http://www.w3.org/2000/svg','svg');filament.setAttribute('viewBox','0 0 360 180');filament.setAttribute('preserveAspectRatio','none');filament.setAttribute('aria-hidden','true');
  filament.innerHTML='<path d="M12 150 C78 142 76 34 145 64 S222 156 268 88 S314 26 348 18"/><path d="M145 64 C132 25 102 18 86 8 M268 88 C286 119 313 128 344 146"/>';
  figure.append(img,filament,caption);page.prepend(figure);if(!reduced)figure.classList.add('is-animated');
 });
})();