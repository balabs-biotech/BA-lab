/* BA Labs — large photographic signatures for each editorial chapter. */
(()=> {
 const track=document.getElementById('experienceTrack');if(!track||track.dataset.atmosphereReady)return;track.dataset.atmosphereReady='true';
 const visuals={
  home:{src:'https://upload.wikimedia.org/wikipedia/commons/e/ee/Mycelium.JPG',alt:'Hyphes de Podospora anserina observées en microscopie à fluorescence',tag:'LIVING SYSTEMS',credit:'Christian Scheckhuber · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Mycelium.JPG'},
  research:{src:'https://www.collezionemicrobica.enea.it/images/uo/brindisi/uo09_foto-1.jpg',alt:'Système de mesure et instrumentation pour le suivi des environnements',tag:'FIELD INSTRUMENTATION',credit:'ENEA Brindisi · source image',page:'https://www.collezionemicrobica.enea.it/en/sus-mirri/operative-unit-enea-c-r-brindisi.html'},
  network:{src:'https://upload.wikimedia.org/wikipedia/commons/0/0b/Pleurotus_ostreatus_on_agar.jpg',alt:'Culture de Pleurotus ostreatus développant son mycélium sur milieu gélosé',tag:'BIOLOGICAL NETWORK',credit:'Michał Wadas · CC BY-SA 4.0',page:'https://commons.wikimedia.org/wiki/File:Pleurotus_ostreatus_on_agar.jpg'},
  catalogue:{src:'https://www.manitariakolindrou.gr/sites/default/files/styles/basicpagetop/public/ypostroma_top.jpg?itok=NjLTvxKs',alt:'Pleurotes cultivés sur un substrat préparé pour la production',tag:'CULTURES & MATERIALS',credit:'Kolindros Mushrooms · source image',page:'https://www.manitariakolindrou.gr/en/mushrooms/pleurotus-mushroom-substrate'},
  about:{src:'https://iiif.wellcomecollection.org/image/B0004843/full/800%2C/0/default.jpg',alt:'Hyphes fongiques observées en microscopie',tag:'BIOLOGIE EXPÉRIMENTALE',credit:'Wellcome Collection · image scientifique',page:'https://wellcomecollection.org/works/s38jqfs8'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 Object.entries(visuals).forEach(([key,data])=>{
  const page=track.querySelector('.experience-page[data-chapter="'+key+'"]');if(!page)return;
  const figure=document.createElement('figure');figure.className='chapter-atmosphere';
  const img=document.createElement('img');img.src=data.src;img.alt=data.alt;img.loading=key==='home'?'eager':'lazy';img.decoding='async';
  const fallback=null;

  const caption=document.createElement('figcaption');const tag=document.createElement('span');tag.textContent=data.tag;
  const credit=document.createElement('small');credit.textContent='IMAGE / '+data.credit;
  const source=document.createElement('a');source.href=data.page;source.target='_blank';source.rel='noopener noreferrer';source.textContent='SOURCE ↗';source.setAttribute('aria-label','Ouvrir la source de cette image');
  caption.append(tag,credit,source);
  const filament=document.createElementNS('http://www.w3.org/2000/svg','svg');filament.setAttribute('viewBox','0 0 360 180');filament.setAttribute('preserveAspectRatio','none');filament.setAttribute('aria-hidden','true');
  filament.innerHTML='<path d="M12 150 C78 142 76 34 145 64 S222 156 268 88 S314 26 348 18"/><path d="M145 64 C132 25 102 18 86 8 M268 88 C286 119 313 128 344 146"/>';
  figure.append(img,filament,caption);page.prepend(figure);if(!reduced)figure.classList.add('is-animated');
 });
})();