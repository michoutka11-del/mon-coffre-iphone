'use strict';
const $=id=>document.getElementById(id);
const paths={appearance:'M12 3a9 9 0 1 0 0 18V3z M12 3a9 9 0 0 1 0 18 M12 3v18',lock:'M6 10V7a6 6 0 0 1 12 0v3 M5 10h14v11H5z M12 14v3',shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 12l3 3 5-6',cards:'M3 5h18v14H3z M7 9h3v4H7z M14 9h4 M14 13h4 M7 16h11',search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',star:'m12 2 3 6.2 7 .9-5 4.9 1.2 7-6.2-3.3L5.8 21 7 14 2 9.1l7-.9z',close:'M6 6l12 12 M6 18 18 6',arrow:'M19 12H5 M11 6l-6 6 6 6',image:'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.01',check:'M5 12l4 4L19 6'};
function icon(name){
 if(name==='lock')return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10"/><rect x="4.5" y="9.5" width="15" height="11.5" rx="3.5" fill="currentColor" fill-opacity=".09"/><circle cx="12" cy="14.5" r="1.1" fill="currentColor" stroke="none"/><path d="M12 15.6v1.9"/></svg>';
 if(name==='appearance')return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5.5" fill="currentColor" fill-opacity=".07"/><path d="M12 3.5v17M12 3.5H9A5.5 5.5 0 0 0 3.5 9v6A5.5 5.5 0 0 0 9 20.5h3Z" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M15.5 8.5h1M15.5 12h1M15.5 15.5h1" opacity=".65"/></svg>';
 return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.cards}"/></svg>`;}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const fields=[['surname','Nom'],['givenNames','Prénom'],['sex','Sexe'],['nationality','Nationalité'],['birthDate','Date de naissance'],['birthPlace','Lieu de naissance'],['documentNumber','N° du document'],['expiryDate','Date d’expiration'],['can','CAN']];
let documents=[],tab='docs',current=null,currentImages=[],draftSides={recto:false,verso:false},toastTimer;
const bridge=window.Vault;
function native(method,...args){if(bridge)bridge[method](...args);else notify('Le coffre n’a pas pu être chargé. Rechargez l’application.');}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function parseDate(value){
 let m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value||'');
 if(!m){const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');if(iso)m=[iso[0],iso[3],iso[2],iso[1]];}
 if(!m)return null;const day=+m[1],month=+m[2],year=+m[3];if(year<1900||year>2200)return null;
 const date=new Date(year,month-1,day,12);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
}
function inputDate(value){const d=parseDate(value);return d?`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`:'';}
function remaining(value){const d=parseDate(value);if(!d)return Infinity;d.setHours(23,59,59,999);return Math.ceil((d-Date.now())/86400000);}
function validateIdentity(data){
 const errors={};fields.forEach(([key,label])=>{if(!String(data[key]||'').trim())errors[key]=label+' : ce champ est obligatoire.';});
 if(data.sex&&!/^[MF]$/.test(data.sex))errors.sex='Sexe : saisissez M ou F.';
 if(data.nationality&&!/^[A-Z]{3}$/.test(data.nationality))errors.nationality='Nationalité : saisissez un code de trois lettres, par exemple FRA.';
 if(data.can&&!/^\d{6}$/.test(data.can))errors.can='CAN : saisissez exactement 6 chiffres.';
 const birth=parseDate(data.birthDate),expiry=parseDate(data.expiryDate),today=new Date();today.setHours(23,59,59,999);
 if(data.birthDate&&!birth)errors.birthDate='Date de naissance : utilisez une date réelle au format JJ/MM/AAAA.';
 else if(birth&&birth>today)errors.birthDate='La date de naissance ne peut pas être dans le futur.';
 if(data.expiryDate&&!expiry)errors.expiryDate='Expiration : utilisez une date réelle au format JJ/MM/AAAA.';
 else if(birth&&expiry&&expiry<=birth)errors.expiryDate='L’expiration doit être postérieure à la naissance.';
 return errors;
}
function complete(doc){return !!doc.identity&&Object.keys(validateIdentity(doc.identity)).length===0;}
function cardTitle(doc){const info=doc.identity;return info&&info.surname&&info.givenNames?info.givenNames+' '+info.surname:doc.title||'Carte d’identité';}
function receive(data){documents=data.filter(d=>d.type==='Carte d’identité');$('legacy-note').hidden=documents.length===data.length;$('locked').hidden=true;$('app').hidden=false;render();}
function render(){
 $('total').textContent=documents.length+' carte'+(documents.length>1?'s enregistrées':' enregistrée');
 const q=$('search').value.toLocaleLowerCase('fr').trim();
 const list=documents.filter(d=>(tab!=='favs'||d.favorite)&&(!q||(cardTitle(d)+' '+(d.identity?d.identity.documentNumber:'')).toLocaleLowerCase('fr').includes(q))).sort((a,b)=>b.created-a.created);
 $('list-title').textContent=tab==='favs'?'Mes favoris':'Mes cartes';$('count').textContent=list.length;
 $('documents').innerHTML=list.map(d=>{const expiry=d.identity?d.identity.expiryDate:d.expiry,days=remaining(expiry),isComplete=complete(d);return `<button class="doc-row" data-id="${escapeHTML(d.id)}"><span class="doc-icon">${icon('cards')}</span><span class="doc-text"><strong>${escapeHTML(cardTitle(d))}</strong><small class="${days<0?'expired':''}">${expiry?(days<0?'Expirée le ':'Expire le ')+escapeHTML(inputDate(expiry)):d.pages.length+' capture'+(d.pages.length>1?'s':'')}</small><span class="doc-tag ${isComplete?'':'incomplete'}">${d.attachmentChecked?'Pièce jointe vérifiée · Test local':isComplete?'Saisie complète':'Ancienne carte'}</span></span>${d.favorite?'<span class="favorite-mark">★</span>':''}<span class="row-arrow">›</span></button>`;}).join('');
 document.querySelectorAll('.doc-row').forEach(b=>b.onclick=()=>{busy(true);native('open',b.dataset.id);if(!bridge)busy(false);});
 $('empty').hidden=documents.length!==0||tab==='favs';$('no-results').hidden=list.length!==0||!$('empty').hidden;
 const soon=documents.filter(d=>remaining(d.identity?d.identity.expiryDate:d.expiry)<=30);$('expiry-alert').hidden=!soon.length;$('expiry-alert').textContent=soon.length+' carte'+(soon.length>1?'s ont expiré ou expirent':' a expiré ou expire')+' dans les 30 prochains jours. Consultez les dates enregistrées.';
}
function resetSides(){draftSides={recto:false,verso:false};['recto','verso'].forEach(side=>{$('preview-'+side).removeAttribute('src');$('preview-'+side).hidden=true;$('status-'+side).textContent='Choisir une image';$('select-'+side).classList.remove('has-image');});}
function openForm(){
 native('cancelDraft');$('doc-form').reset();resetSides();fields.forEach(([key])=>$(key).removeAttribute('aria-invalid'));$('form-error').hidden=true;$('submit').disabled=false;
 $('form-title').textContent='Ajouter une carte';$('form-description').textContent='Recopiez les informations de votre carte. Tous les champs sont obligatoires.';
 $('submit').innerHTML='Enregistrer ma carte <span>→</span>';$('form-sheet').hidden=false;document.querySelector('.sheet').scrollTop=0;
}
function closeForm(){
 $('form-sheet').hidden=true;$('doc-form').reset();resetSides();$('form-error').textContent='';$('form-error').hidden=true;$('submit').disabled=false;native('cancelDraft');
 if($('detail').hidden){current=null;currentImages=[];}
}
function sideSelected(side,src){busy(false);if($('form-sheet').hidden){native('cancelDraft');return;}if(side!=='recto'&&side!=='verso')return;draftSides[side]=true;$('preview-'+side).src=src;$('preview-'+side).hidden=false;$('status-'+side).textContent='Image ajoutée · Remplacer';$('select-'+side).classList.add('has-image');$('form-error').hidden=true;}
['recto','verso'].forEach(side=>$('select-'+side).onclick=()=>native('selectSide',side));
function imported(data){closeForm();receive(data);notify('Votre carte recto et verso a été enregistrée.');}
function attachmentChecked(doc,data){receive(data);if(current&&current.id===doc.id){current=doc;updateAttachmentStatus();}notify('Statut de test enregistré.');}
function updateAttachmentStatus(){const checked=!!(current&&current.attachmentChecked);$('record-status').hidden=checked;$('attachment-status').hidden=!checked;$('check-attachment').hidden=checked;$('detail-menu').hidden=true;$('detail-menu-button').setAttribute('aria-expanded','false');}
function busy(value){$('loading').hidden=!value;}
function notify(message){busy(false);$('submit').disabled=false;$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function showDocument(doc,images){
 busy(false);current=doc;currentImages=images;
 const info=doc.identity||{},expiry=info.expiryDate||doc.expiry,expired=remaining(expiry)<0,isComplete=complete(doc);
 $('detail-title').textContent=cardTitle(doc);$('detail-expiry').textContent=expiry?(expired?'Carte expirée le ':'Expiration : ')+inputDate(expiry):'Date d’expiration non renseignée';
 $('detail-reference').textContent=info.documentNumber?'N° '+info.documentNumber:'Informations de la version précédente';$('detail-expiry').classList.toggle('expired',expired);
 $('detail-fav').innerHTML=doc.favorite?'★':icon('star');$('detail-fav').setAttribute('aria-label',doc.favorite?'Retirer des favoris':'Ajouter aux favoris');
 $('record-status').classList.toggle('is-expired',expired);$('record-status').innerHTML=icon('check')+'<div><strong>'+(isComplete?'Saisie complète'+(expired?' · Carte expirée':''):'Ancienne carte')+'</strong><p>'+(isComplete?'Formats contrôlés sur cet appareil.':'Informations d’origine conservées en lecture seule.')+'</p></div>';
 $('identity-fields').innerHTML=fields.map(([key,label])=>`<div class="field-row"><dt>${escapeHTML(label)}</dt><dd><span>${escapeHTML(info[key]||'Non renseigné')}</span>${info[key]?icon('check'):''}</dd></div>`).join('');
 $('pages').innerHTML='';$('capture-tabs').innerHTML='';const paired=doc.imageLayout==='recto-verso';$('legacy-images-note').hidden=paired;images.forEach((src,i)=>{
  const sideName=paired?(i===0?'Recto':'Verso'):'Capture '+String(i+1).padStart(2,'0');
  const card=document.createElement('div');card.className='page-card';card.id='capture-'+i;card.setAttribute('role','tabpanel');card.setAttribute('aria-labelledby','capture-tab-'+i);card.hidden=i!==0;
  const open=document.createElement('button');open.className='capture-open';open.setAttribute('aria-label','Agrandir : '+sideName);open.onclick=()=>openViewer(src);
  const image=document.createElement('img');image.src=src;image.alt=sideName+' de la carte';open.append(image);
  const label=document.createElement('div');label.className='page-label';label.innerHTML='<span>'+sideName.toUpperCase()+'</span><span>Agrandir ↗</span>';card.append(open,label);$('pages').append(card);
  const tab=document.createElement('button');tab.id='capture-tab-'+i;tab.textContent=sideName;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',card.id);tab.setAttribute('aria-selected',String(i===0));tab.tabIndex=i===0?0:-1;tab.onclick=()=>selectCapture(i);$('capture-tabs').append(tab);
 });$('capture-tabs').hidden=images.length<2;
 updateAttachmentStatus();$('detail').hidden=false;$('detail').scrollTop=0;
}
function selectCapture(index){document.querySelectorAll('.page-card').forEach((page,i)=>page.hidden=i!==index);$('capture-tabs').querySelectorAll('button').forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});}
$('capture-tabs').addEventListener('keydown',e=>{const tabs=Array.from($('capture-tabs').querySelectorAll('button'));const at=tabs.indexOf(e.target);if(at<0)return;let next=at;if(e.key==='ArrowRight')next=(at+1)%tabs.length;else if(e.key==='ArrowLeft')next=(at+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();selectCapture(next);tabs[next].focus();});
function closeDetail(){$('detail').hidden=true;$('detail-menu').hidden=true;$('attachment-status').hidden=true;$('pages').innerHTML='';$('capture-tabs').innerHTML='';$('identity-fields').innerHTML='';$('detail-title').textContent='';$('detail-expiry').textContent='';$('detail-reference').textContent='';closeViewer();current=null;currentImages=[];}
function lock(){closeAppearance();closeDetail();closeForm();busy(false);documents=[];$('documents').innerHTML='';$('search').value='';$('app').hidden=true;$('locked').hidden=false;clearTimeout(toastTimer);$('toast').hidden=true;$('toast').textContent='';}
function back(){if(!$('appearance-panel').hidden){closeAppearance();return;}if(!$('viewer').hidden)closeViewer();else if(!$('form-sheet').hidden)closeForm();else if(!$('detail-menu').hidden){$('detail-menu').hidden=true;$('detail-menu-button').setAttribute('aria-expanded','false');}else if(!$('detail').hidden)closeDetail();else native('lockNow');}
['add-top','add-empty','nav-add'].forEach(id=>$(id).onclick=()=>openForm());document.querySelectorAll('.close-form').forEach(b=>b.onclick=closeForm);
$('form-sheet').onclick=e=>{if(e.target===$('form-sheet'))closeForm();};$('unlock').onclick=()=>native('unlock');$('lock').onclick=()=>native('lockNow');$('search').oninput=render;
function changeTab(value){tab=value;$('nav-docs').classList.toggle('active',value==='docs');$('nav-favs').classList.toggle('active',value==='favs');render();}
$('nav-docs').onclick=()=>changeTab('docs');$('nav-favs').onclick=()=>changeTab('favs');
['sex','nationality'].forEach(key=>$(key).addEventListener('input',()=>{$(key).value=$(key).value.toUpperCase();}));
['birthDate','expiryDate'].forEach(key=>$(key).addEventListener('input',e=>{if(e.inputType&&e.inputType.indexOf('delete')===0)return;const digits=$(key).value.replace(/\D/g,'');if(digits.length<=8)$(key).value=digits.slice(0,2)+(digits.length>2?'/'+digits.slice(2,4):'')+(digits.length>4?'/'+digits.slice(4,8):'');}));
$('doc-form').onsubmit=e=>{
 e.preventDefault();const data={};fields.forEach(([key])=>data[key]=$(key).value.trim());data.sex=data.sex.toUpperCase();data.nationality=data.nationality.toUpperCase();const errors=validateIdentity(data);fields.forEach(([key])=>$(key).setAttribute('aria-invalid',errors[key]?'true':'false'));
 if(Object.keys(errors).length){$('form-error').textContent=Object.values(errors)[0];$('form-error').hidden=false;$(Object.keys(errors)[0]).focus();return;}
 data.birthDate=inputDate(data.birthDate);data.expiryDate=inputDate(data.expiryDate);$('form-error').hidden=true;$('submit').disabled=!!bridge;
 if(!draftSides.recto||!draftSides.verso){$('submit').disabled=false;$('form-error').textContent='Ajoutez obligatoirement une image du recto et une image du verso.';$('form-error').hidden=false;$(!draftSides.recto?'select-recto':'select-verso').focus();return;}
 native('addCard',JSON.stringify(data));
};
$('detail-back').onclick=closeDetail;$('delete').onclick=()=>{if(current)native('remove',current.id);};
$('detail-fav').onclick=()=>{if(current)native('setFavorite',current.id,!current.favorite);};
function favoriteUpdated(doc){if(current&&current.id===doc.id){current=doc;$('detail-fav').innerHTML=doc.favorite?'★':icon('star');$('detail-fav').setAttribute('aria-label',doc.favorite?'Retirer des favoris':'Ajouter aux favoris');}}
$('detail-menu-button').onclick=()=>{$('detail-menu').hidden=!$('detail-menu').hidden;$('detail-menu-button').setAttribute('aria-expanded',String(!$('detail-menu').hidden));};
$('check-attachment').onclick=()=>{$('detail-menu').hidden=true;$('detail-menu-button').setAttribute('aria-expanded','false');if(current&&!current.attachmentChecked)native('requestAttachmentCheck',current.id);};
$('menu-delete').onclick=()=>{$('detail-menu').hidden=true;if(current)native('remove',current.id);};
document.addEventListener('click',e=>{if(!e.target.closest('.detail-tools')&&!e.target.closest('.detail-menu')){$('detail-menu').hidden=true;$('detail-menu-button').setAttribute('aria-expanded','false');}});
let scale=1,dx=0,dy=0,startDist=0,startScale=1,lastX=0,lastY=0,lastTap=0;
function transform(){$('full-image').style.transform=`translate(${dx}px,${dy}px) scale(${scale})`;}
function openViewer(src){scale=1;dx=dy=0;$('full-image').src=src;transform();$('viewer').hidden=false;}
function closeViewer(){$('viewer').hidden=true;$('full-image').removeAttribute('src');}
$('close-viewer').onclick=closeViewer;const zoom=$('zoom-area');
zoom.addEventListener('touchstart',e=>{if(e.touches.length===2){startDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);startScale=scale;}else{lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;const now=Date.now();if(now-lastTap<280){scale=scale>1?1:2.5;dx=dy=0;transform();}lastTap=now;}},{passive:true});
zoom.addEventListener('touchmove',e=>{e.preventDefault();if(e.touches.length===2&&startDist){scale=Math.max(1,Math.min(6,startScale*Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/startDist));}else if(e.touches.length===1&&scale>1){dx+=e.touches[0].clientX-lastX;dy+=e.touches[0].clientY-lastY;lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;}if(scale===1)dx=dy=0;transform();},{passive:false});
zoom.addEventListener('touchend',e=>{if(e.touches.length===1){lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;}else startDist=0;});

