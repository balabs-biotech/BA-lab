/* One short, skippable opening scene; no animation library or runtime observers. */
(()=> {
 const root=document.documentElement;
 const intro=document.getElementById('balabsIntro');
 if(!intro) return;
 const finish=()=>{
  if(!root.classList.contains('balabs-intro-pending')) return;
  root.classList.add('balabs-intro-leaving');
  root.classList.remove('balabs-intro-pending');
  try{sessionStorage.setItem('balabs-intro-seen','1')}catch(_){}
  window.setTimeout(()=>{root.classList.remove('balabs-intro-leaving');intro.remove()},760);
 };
 const skip=intro.querySelector('[data-intro-skip]');
 if(skip) skip.addEventListener('click',finish,{once:true});
 const onKey=e=>{if(e.key==='Escape')finish()};
 window.addEventListener('keydown',onKey,{once:true});
 window.setTimeout(finish,3400);
})();
