(function(){
 'use strict';
 const valid=['day','dark','navy','system'];let lastFocus=null;
 function systemTheme(){return window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'day';}
 function previewState(mode){return {mode:mode,resolved:mode==='system'?systemTheme():mode};}
 window.applyAppearanceState=function(state){
  if(!state||!valid.includes(state.mode)||!['day','dark','navy'].includes(state.resolved))return;
  window.appearanceState={mode:state.mode,resolved:state.resolved};document.documentElement.dataset.theme=state.resolved;document.documentElement.dataset.appearanceMode=state.mode;
  document.querySelectorAll('[data-appearance]').forEach(button=>{const selected=button.dataset.appearance===state.mode;button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;});
 };
 let state=previewState('day');
 try{if(window.Vault&&typeof Vault.getAppearance==='function')state=JSON.parse(Vault.getAppearance());else{const mode=localStorage.getItem('appearance-mode');if(valid.includes(mode))state=previewState(mode);}}catch(e){}
 applyAppearanceState(state);
 window.openAppearance=function(){const panel=document.getElementById('appearance-panel');if(!panel)return;lastFocus=document.activeElement;panel.hidden=false;const menu=document.getElementById('detail-menu');if(menu)menu.hidden=true;document.getElementById('detail-menu-button').setAttribute('aria-expanded','false');panel.querySelector('[aria-checked="true"]').focus();};
 window.closeAppearance=function(){const panel=document.getElementById('appearance-panel');if(!panel||panel.hidden)return;panel.hidden=true;if(lastFocus&&lastFocus.isConnected)lastFocus.focus();lastFocus=null;};
 function choose(mode){if(!valid.includes(mode))return;if(window.Vault&&typeof Vault.setAppearance==='function'){Vault.setAppearance(mode);}else{try{localStorage.setItem('appearance-mode',mode);}catch(e){}applyAppearanceState(previewState(mode));}}
 document.addEventListener('DOMContentLoaded',function(){
  applyAppearanceState(window.appearanceState);document.querySelectorAll('[data-open-appearance]').forEach(button=>button.addEventListener('click',openAppearance));document.getElementById('close-appearance').onclick=closeAppearance;
  const panel=document.getElementById('appearance-panel');panel.addEventListener('click',e=>{if(e.target===panel)closeAppearance();});
  panel.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.appearance)));
  panel.addEventListener('keydown',e=>{
   const buttons=Array.from(panel.querySelectorAll('[data-appearance]'));const at=buttons.indexOf(e.target);
   if(e.key==='Escape'){e.preventDefault();closeAppearance();return;}
   if(e.key==='Tab'){const focusable=[document.getElementById('close-appearance'),...buttons.filter(b=>b.tabIndex===0)];const index=focusable.indexOf(document.activeElement);e.preventDefault();focusable[(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus();return;}
   if(at<0)return;let next=at;if(e.key==='ArrowRight'||e.key==='ArrowDown')next=(at+1)%buttons.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=(at+buttons.length-1)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();choose(buttons[next].dataset.appearance);buttons[next].focus();
  });
 });
 if(window.matchMedia){const media=matchMedia('(prefers-color-scheme: dark)');const change=()=>{if(window.appearanceState.mode==='system'&&!(window.Vault&&typeof Vault.getAppearance==='function'))applyAppearanceState(previewState('system'));};if(media.addEventListener)media.addEventListener('change',change);else media.addListener(change);}
})();
