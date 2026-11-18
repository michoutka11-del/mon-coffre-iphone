(function(){
 'use strict';
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const supportsMask=window.CSS&&(CSS.supports('mask-image','linear-gradient(white,transparent)')||CSS.supports('-webkit-mask-image','linear-gradient(white,transparent)'));
 const heads=[],reveals=new Map(),observers=new Map();let scheduled=false,keyboard=false;
 const visible=id=>{const el=document.getElementById(id);return el&&!el.hidden;};
 function position(root){return Math.max(0,root===window?window.scrollY:root.scrollTop);}
 function active(state){
  if(!state.el.getClientRects().length)return false;
  if(state.el.closest('.appearance-sheet'))return visible('appearance-panel');
  if(visible('appearance-panel')||visible('viewer'))return false;
  if(state.el.closest('#form-sheet'))return visible('form-sheet');
  if(visible('form-sheet'))return false;
  if(state.el.closest('#detail'))return visible('detail');
  return !visible('detail');
 }
 function masks(state){
  const r=state.el.getBoundingClientRect(),w=Math.round(r.width),h=Math.round(r.height);if(w<1||h<1)return [];
  if(state.geometry===w+'x'+h)return state.masks;
  state.geometry=w+'x'+h;const cells=[],size=8;
  for(let y=0;y<h;y+=size)for(let x=0;x<w;x+=size){let hash=Math.imul(x+17,73856093)^Math.imul(y+11,19349663);hash=Math.imul(hash^(hash>>>16),2246822507);hash=Math.imul(hash^(hash>>>13),3266489909);hash=(hash^(hash>>>16))>>>0;cells.push({x,y,rank:hash/4294967296});}
  state.masks=[];state.images=[];const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');
  for(let step=0;step<=14;step++){
   context.clearRect(0,0,w,h);context.fillStyle='#fff';const threshold=step/14;
   for(const c of cells)if(c.rank>=threshold)context.fillRect(c.x,c.y,size,size);
   const url=canvas.toDataURL('image/png'),image=new Image();image.src=url;state.images.push(image);state.masks.push('url("'+url+'")');
  }return state.masks;
 }
 function paint(state){
  const value=reduce.matches?0:state.p,p=value<.006?0:value>.994?1:value;state.el.dataset.dissolve=String(Math.round(p*100));
  state.el.style.opacity=p>=.999?'0':String(1-p);
  state.el.style.pointerEvents=p>.96?'none':'';
  let mask='none';if(p>.001&&p<.999&&supportsMask){const frames=masks(state);mask=frames[Math.round(p*14)]||'none';}
  state.el.style.webkitMaskImage=mask;state.el.style.maskImage=mask;
 }
 function animate(state,target,immediate){
  if(reduce.matches)target=0;if(state.target===target&&!immediate)return;state.target=target;
  cancelAnimationFrame(state.frame);if(immediate){state.p=target;paint(state);return;}
  const from=state.p,start=performance.now(),duration=(target?245:195)*Math.max(.35,Math.abs(target-from));
  function tick(now){const t=Math.min(1,(now-start)/duration),e=1-Math.pow(1-t,3);state.p=from+(target-from)*e;paint(state);if(t<1)state.frame=requestAnimationFrame(tick);}
  state.frame=requestAnimationFrame(tick);
 }
 function registerHead(el,root){
  if(!el)return;const state={el,root,p:0,target:0,last:position(root),down:0,up:0,frame:0,timer:0,wasActive:false,masks:[]};heads.push(state);el.classList.add('pixel-header');paint(state);
  const show=()=>{clearTimeout(state.timer);state.down=state.up=0;animate(state,0,true);};
  el.addEventListener('pointerdown',show,{capture:true,passive:true});el.addEventListener('focusin',show);
  root.addEventListener('scroll',()=>{
   const now=position(root),delta=now-state.last;state.last=now;
   if(!active(state)||reduce.matches)return;
   state.wasActive=true;
   if(now<=8||keyboard&&el.contains(document.activeElement)||el.classList.contains('detail-toolbar')&&visible('detail-menu')){animate(state,0);return;}
   if(delta>0){state.down+=delta;state.up=0;if(now>22&&state.down>=12)animate(state,1);}
   else if(delta<0){state.up-=delta;state.down=0;if(state.up>=4)animate(state,0);}
   clearTimeout(state.timer);state.timer=setTimeout(()=>{state.down=state.up=0;animate(state,0);},450);
  },{passive:true});
 }
 function rootFor(el){return el.closest('.sheet')||el.closest('#detail')||null;}
 function observerFor(root){
  if(observers.has(root))return observers.get(root);
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const enough=entry.isIntersecting&&(entry.intersectionRatio>.07||entry.intersectionRect.height>60);entry.target.classList.toggle('reveal-visible',enough);}}, {root,threshold:[0,.07,.18,.4,1],rootMargin:'0px 0px -10px 0px'});observers.set(root,observer);return observer;
 }
 function refresh(){
  scheduled=false;
  for(const [el,observer]of reveals)if(!el.isConnected){observer.unobserve(el);reveals.delete(el);}
  for(const state of heads){const isActive=active(state);if(isActive&&!state.wasActive){state.last=position(state.root);state.down=state.up=0;animate(state,0,true);if(!reduce.matches&&supportsMask){const warm=()=>{if(active(state))masks(state);};if(window.requestIdleCallback)requestIdleCallback(warm,{timeout:400});else setTimeout(warm,80);}}state.wasActive=isActive;}
  if(!window.IntersectionObserver)return;
  const selector='main > .intro, main > .summary, main > .section-title, main > .search, main > .empty, .doc-row, #doc-form > label, .form-grid, .form-group-title, .side-upload, .appearance-option, .field-row, .page-card, .card-hero, .record-status, .attachment-status, .record-heading, .capture-tabs';
  document.querySelectorAll(selector).forEach(el=>{
   if(reveals.has(el))return;const root=rootFor(el),observer=observerFor(root),r=el.getBoundingClientRect(),bounds=root?root.getBoundingClientRect():{top:0,bottom:innerHeight};
   el.classList.add('scroll-reveal');el.classList.toggle('reveal-visible',r.height>0&&r.bottom>bounds.top&&r.top<bounds.bottom);reveals.set(el,observer);observer.observe(el);
  });
 }
 let fadeFrame=0;
 function fadeEdges(){
  fadeFrame=0;
  for(const [el] of reveals){if(!el.getClientRects().length)continue;const root=rootFor(el),r=el.getBoundingClientRect(),b=root?root.getBoundingClientRect():{top:0,bottom:innerHeight-77};const overlap=Math.max(0,Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top));const ramp=Math.min(72,Math.max(24,r.height*.55));el.style.setProperty('--scroll-alpha',String(reduce.matches?1:Math.min(1,overlap/ramp)));}
 }
 const scheduleFade=()=>{if(!fadeFrame)fadeFrame=requestAnimationFrame(fadeEdges);};
 document.addEventListener('scroll',scheduleFade,{capture:true,passive:true});new MutationObserver(scheduleFade).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});window.addEventListener('resize',scheduleFade,{passive:true});
 registerHead(document.querySelector('#app > header'),window);
 registerHead(document.querySelector('.lock-brand'),window);

 document.querySelectorAll('.sheet').forEach(sheet=>registerHead(sheet.querySelector('.sheet-heading'),sheet));
 document.addEventListener('keydown',e=>{if(e.key==='Tab')keyboard=true;});document.addEventListener('pointerdown',()=>keyboard=false,{passive:true});
 new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',()=>{for(const state of heads){state.geometry='';animate(state,0,true);state.last=position(state.root);}} ,{passive:true});
 const preference=()=>{for(const state of heads){clearTimeout(state.timer);animate(state,0,true);}};if(reduce.addEventListener)reduce.addEventListener('change',preference);else reduce.addListener(preference);
 refresh();
})();
