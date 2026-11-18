(function(){
 'use strict';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),pending=new Map();let immediate=false;
 function cancel(id){const job=pending.get(id);if(job){clearTimeout(job.timer);pending.delete(id);}const el=document.getElementById(id);if(el)el.classList.remove('surface-exit');}
 function wrapClose(name,id){const original=window[name];window[name]=function(){const args=arguments,el=document.getElementById(id);if(immediate||reduced.matches||!el||el.hidden){cancel(id);return original.apply(this,args);}if(pending.has(id))return;el.classList.add('surface-exit');const timer=setTimeout(()=>{pending.delete(id);el.classList.remove('surface-exit');original.apply(window,args);},180);pending.set(id,{timer});};}
 [['closeForm','form-sheet'],['closeDetail','detail'],['closeViewer','viewer'],['closeAppearance','appearance-panel']].forEach(pair=>wrapClose(...pair));
 [['openForm','form-sheet'],['showDocument','detail'],['openViewer','viewer'],['openAppearance','appearance-panel']].forEach(([name,id])=>{const original=window[name];window[name]=function(){cancel(id);return original.apply(this,arguments);};});
 const lock=window.lock;window.lock=function(){immediate=true;try{for(const id of Array.from(pending.keys()))cancel(id);return lock.apply(this,arguments);}finally{immediate=false;}};
 document.querySelectorAll('.close-form').forEach(button=>button.onclick=()=>window.closeForm());
 document.getElementById('detail-back').onclick=()=>window.closeDetail();
 document.getElementById('close-viewer').onclick=()=>window.closeViewer();
})();
