/* BA Labs — eight dedicated, credited visual identities. */
(()=> {
 const cards=[...document.querySelectorAll('.universe-index-card[data-domain-page]')];
 if(!cards.length||document.documentElement.dataset.universeVisuals==='ready')return;
 document.documentElement.dataset.universeVisuals='ready';
 const base='https://commons.wikimedia.org/wiki/Special:FilePath/';
 const images={
  myco:{file:'Fungal mycelium.jpg',page:'https://commons.wikimedia.org/wiki/File:Fungal_mycelium.jpg',label:'FUNGAL HYPHAE / MICROSCOPY',alt:'Hyphes et mycélium fongique observés en préparation microscopique',credit:'Ajay Kumar Chaurasiya · CC BY 4.0'},
  bio:{file:'Bioclogging.jpg',page:'https://commons.wikimedia.org/wiki/File:Bioclogging.jpg',label:'PSEUDOMONAS / BIOFILM',alt:'Biofilm de Pseudomonas fluorescens observé en microscopie confocale dans un milieu poreux',credit:'Microbialmatt · CC BY-SA 4.0'},
  iot:{file:'IoT environmental monitoring system solution - Overview.jpg',page:'https://commons.wikimedia.org/wiki/File:IoT_environmental_monitoring_system_solution_-_Overview.jpg',label:'ENVIRONMENTAL IOT / DATA',alt:'Schéma d’un système IoT de surveillance environnementale et acquisition de données',credit:'Stephane Malhomme · CC BY-SA 4.0'},
  soil:{file:'Soil Profile.jpg',page:'https://commons.wikimedia.org/wiki/File:Soil_Profile.jpg',label:'SOIL PROFILE / FIELD STUDY',alt:'Profil pédologique montrant les horizons du sol',credit:'Kamalimaddy · CC BY-SA 4.0'},
  lab:{file:'Confocal Microscopes Center for Biofilm Research MSU.jpg',page:'https://commons.wikimedia.org/wiki/File:Confocal_Microscopes_Center_for_Biofilm_Research_MSU.jpg',label:'CONFOCAL / RESEARCH LAB',alt:'Microscopes confocaux du Center for Biofilm Research de Montana State University',credit:'Unknown Photographers · CC BY-SA 4.0'},
  products:{file:'Mycelium Composites.jpg',page:'https://commons.wikimedia.org/wiki/File:Mycelium_Composites.jpg',label:'MYCELIUM / BIOMATERIALS',alt:'Échantillons de composites développés à partir de mycélium de Ganoderma lucidum',credit:'Eti Issa · CC BY-SA 4.0'},
  work:{file:'Oyster mushroom (Pleurotus ostreatus) mycelium in petri dish on coffee grounds.JPG',page:'https://commons.wikimedia.org/wiki/File:Oyster_mushroom_(Pleurotus_ostreatus)_mycelium_in_petri_dish_on_coffee_grounds.JPG',label:'PLEUROTUS / CULTURE STUDY',alt:'Mycélium de Pleurotus ostreatus cultivé en boîte de Petri sur marc de café',credit:'Tobi Kellner · CC BY-SA 3.0'},
  learn:{file:'Fungal hyphae and mycelium.jpg',page:'https://commons.wikimedia.org/wiki/File:Fungal_hyphae_and_mycelium.jpg',label:'HYPHAE / OPEN SCIENCE',alt:'Hyphes fongiques et réseau mycélien en préparation microscopique',credit:'Ajay Kumar Chaurasiya · CC BY-SA 4.0'}
 };
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 cards.forEach((card,index)=>{
  const data=images[card.dataset.domainPage];if(!data)return;
  const figure=document.createElement('figure');figure.className='universe-visual';figure.dataset.universeVisual=card.dataset.domainPage;
  const img=document.createElement('img');
  img.src=base+encodeURIComponent(data.file)+'?width=1200';
  img.alt=data.alt;img.loading=index<4?'eager':'lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{figure.classList.add('is-unavailable');card.classList.add('visual-fallback')},{once:true});
  const caption=document.createElement('figcaption');
  const subject=document.createElement('span');subject.textContent=data.label;
  const credit=document.createElement('small');credit.textContent='IMAGE / '+data.credit;
  caption.append(subject,credit);figure.append(img,caption);card.prepend(figure);
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