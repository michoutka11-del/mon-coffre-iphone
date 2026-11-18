(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const DB_NAME = 'fr-identite-apple-' + new URL('./', location.href).pathname;
  let db, saved = null, session = null, generation = 0, idleTimer, pickerTimer;
  let picking = false, activePicker = null, queue = Promise.resolve(), channel;
  let draft = {}, mode = 'unlock', restoreValue = null, authPending = false, available = false, checkTarget = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  function report(error) {
    if (error && error.code === 'LOCKED') return;
    let message = error && error.message || 'Cette opération n’a pas pu être effectuée.';
    if (error && error.name === 'QuotaExceededError') message = 'Stockage insuffisant. La modification n’a pas été enregistrée. Exportez une sauvegarde et libérez de la place.';
    window.notify(message);
  }
  function guard(stamp) {
    if (!session || stamp !== generation) { const e = new Error('Coffre verrouillé.'); e.code = 'LOCKED'; throw e; }
  }
  function metadata(card) {
    const copy = {...card, pages:['recto','verso']}; delete copy.images; return copy;
  }
  function allMetadata() { return session.data.cards.map(metadata); }
  function refresh() { window.receive(allMetadata()); }
  function touch() {
    clearTimeout(idleTimer);
    if (session) idleTimer = setTimeout(lockNow, 5 * 60 * 1000);
  }
  function beginPicker(input) {
    picking = true; activePicker = input || null;
    clearTimeout(pickerTimer);
    pickerTimer = setTimeout(() => { picking = false; activePicker = null; lockNow(); }, 2 * 60 * 1000);
  }
  function endPicker() { picking = false; activePicker = null; clearTimeout(pickerTimer); }
  function lockNow() {
    generation++; session = null; draft = {}; endPicker(); clearTimeout(idleTimer);
    if (typeof window.lock === 'function') window.lock();
    if (el('vault-panel')) { el('vault-panel').hidden = true; el('vault-form').reset(); }
    if (el('check-panel')) { el('check-panel').hidden = true; el('check-form').reset(); checkTarget = null; }
    if (el('image-input')) el('image-input').value = '';
    if (el('backup-input')) el('backup-input').value = '';
    restoreValue = null;
  }
  function database() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('vault');
      req.onerror = () => reject(new Error('Le stockage local est indisponible. Utilisez Safari hors navigation privée.'));
      req.onblocked = () => reject(new Error('Fermez les autres fenêtres de cette application puis réessayez.'));
      req.onsuccess = () => { db = req.result; db.onversionchange = () => { lockNow(); db.close(); }; resolve(db); };
    });
  }
  function read() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readonly'), req = tx.objectStore('vault').get('main');
      tx.oncomplete = () => resolve(req.result || null);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Lecture interrompue.'));
    });
  }
  function write(value, previous) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readwrite'), store = tx.objectStore('vault'), req = store.get('main');
      let conflict = false;
      req.onsuccess = () => {
        if ((req.result && req.result.iv || null) !== (previous && previous.iv || null)) { conflict = true; tx.abort(); return; }
        store.put(value, 'main');
      };
      tx.oncomplete = () => { saved = value; if (channel) channel.postMessage('changed'); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(conflict ? new Error('Le coffre a changé dans une autre fenêtre. Verrouillez puis rouvrez-le avant de réessayer.') : tx.error || new Error('Enregistrement interrompu.'));
    });
  }
  async function save(cards, stamp) {
    guard(stamp);
    const data = {version:1, cards}, old = saved;
    const encrypted = await VaultCrypto.seal(data, session.key, session.salt);
    guard(stamp);
    await write(encrypted, old);
    guard(stamp); session.data = data; touch();
  }
  function run(operation) {
    const stamp = generation;
    const task = queue.then(async () => { guard(stamp); return operation(stamp); });
    queue = task.catch(() => {});
    return task.catch(report).finally(() => { if (stamp === generation) { window.busy(false); el('submit').disabled = false; } });
  }
  function openPassword(nextMode, backup) {
    if (!available) { window.notify('Le coffre est indisponible : consultez le message sur l’écran d’accueil.'); return; }
    mode = nextMode; restoreValue = backup || null;
    el('vault-form').reset(); el('vault-error').hidden = true;
    el('vault-title').textContent = mode === 'create' ? 'Créer mon coffre' : mode === 'restore' ? 'Restaurer une sauvegarde' : 'Ouvrir mon coffre';
    el('vault-message').textContent = mode === 'create' ? 'Choisissez un mot de passe d’au moins 12 caractères. Il chiffre vos cartes sur cet appareil. Conservez-le : aucune récupération n’est possible si vous l’oubliez.' : mode === 'restore' ? 'Saisissez le mot de passe utilisé lors de l’export de cette sauvegarde. La restauration remplace le coffre de cette installation après confirmation.' : 'Saisissez le mot de passe de votre coffre personnel.';
    el('confirm-password-label').hidden = mode !== 'create';
    el('vault-password').autocomplete = mode === 'create' ? 'new-password' : 'current-password';
    el('vault-password').minLength = mode === 'create' ? 12 : 1;
    el('vault-submit').textContent = mode === 'create' ? 'Créer le coffre' : mode === 'restore' ? 'Déchiffrer et restaurer' : 'Déverrouiller';
    el('vault-panel').hidden = false; el('vault-password').focus();
  }
  function closePassword() {
    if (authPending) return;
    el('vault-panel').hidden = true; el('vault-form').reset(); restoreValue = null; el('unlock').focus();
  }
  async function authenticate(event) {
    event.preventDefault(); if (authPending) return;
    const stamp = generation, authMode = mode, backup = restoreValue;
    let password = el('vault-password').value;
    if (!password) return;
    if (authMode === 'create' && password !== el('vault-confirm').value) { el('vault-error').textContent = 'Les deux mots de passe ne correspondent pas.'; el('vault-error').hidden = false; return; }
    authPending = true; el('vault-submit').disabled = true; el('vault-cancel').disabled = true; el('vault-error').hidden = true;
    try {
      const previous = await read();
      let result;
      if (authMode === 'create') {
        if (previous) throw new Error('Un coffre existe déjà. Fermez puis rechargez l’application pour l’ouvrir.');
        result = await VaultCrypto.create(password);
      } else {
        const encrypted = authMode === 'restore' ? backup : previous;
        if (!encrypted) throw new Error('Aucun coffre trouvé. Rechargez l’application.');
        result = await VaultCrypto.open(encrypted, password); result.encrypted = VaultCrypto.envelope(encrypted);
        for (const card of result.data.cards) if (Object.keys(validateIdentity(card.identity)).length) throw new Error('Une carte de cette sauvegarde contient des informations invalides.');
      }
      password = ''; el('vault-form').reset();
      if (stamp !== generation || document.hidden) return;
      if (authMode === 'restore' && previous && !window.confirm('Remplacer le coffre actuel par cette sauvegarde ? Les cartes actuelles non sauvegardées seront perdues.')) return;
      if (authMode === 'restore' || authMode === 'create') await write(result.encrypted, previous); else saved = result.encrypted;
      if (stamp !== generation || document.hidden) return;
      generation++; session = {key:result.key, salt:result.salt, data:result.data}; draft = {}; restoreValue = null;
      el('vault-panel').hidden = true; el('unlock').textContent = 'Déverrouiller mon espace →';
      refresh(); touch();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      if (authMode === 'restore') window.notify('Sauvegarde restaurée sur cet appareil.');
    } catch (error) { el('vault-error').textContent = error.message || 'Impossible d’ouvrir le coffre.'; el('vault-error').hidden = false; }
    finally { password = ''; el('vault-form').reset(); authPending = false; el('vault-submit').disabled = false; el('vault-cancel').disabled = false; }
  }
  function imageData(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 25 * 1024 * 1024) { reject(new Error('Choisissez un JPG, PNG ou WebP de moins de 25 Mo. Convertissez les photos HEIC en JPEG si nécessaire.')); return; }
      const image = new Image(), url = URL.createObjectURL(file);
      image.onload = () => {
        try {
          if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('Image trop grande. Réduisez-la avant l’import.');
          const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .86)); canvas.width = canvas.height = 1;
        } catch (error) { reject(error); }
        finally { URL.revokeObjectURL(url); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cette image ne peut pas être lue. Essayez une copie JPEG.')); }; image.src = url;
    });
  }
  async function exportBackup() {
    if (!session || !saved) return;
    const blob = new Blob([JSON.stringify(saved)], {type:'application/json'});
    const name = 'france-identite-coffre-' + new Date().toISOString().slice(0,10) + '.json';
    const file = new File([blob], name, {type:'application/json'});
    try {
      if (navigator.canShare && navigator.canShare({files:[file]})) {
        beginPicker();
        await navigator.share({files:[file], title:'Sauvegarde chiffrée du coffre'});
      } else {
        const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),60000);
      }
      window.notify('Export proposé. Vérifiez que le fichier est bien enregistré dans Fichiers. Il conserve le mot de passe de ce coffre.');
    } catch (error) { if (error.name !== 'AbortError') report(error); }
    finally { endPicker(); touch(); }
  }
  function chooseBackup() { beginPicker(el('backup-input')); el('backup-input').click(); }
  window.Vault = {
    unlock: () => openPassword(saved ? 'unlock' : 'create'),
    lockNow,
    cancelDraft: () => { draft = {}; },
    selectSide: side => {
      if (!session || !['recto','verso'].includes(side)) return;
      const input = el('image-input'); input.dataset.side = side; input.value = ''; beginPicker(input); input.click();
    },
    addCard: json => run(async stamp => {
      const identity = JSON.parse(json);
      if (Object.keys(validateIdentity(identity)).length) throw new Error('Vérifiez les informations de la carte.');
      if (!draft.recto || !draft.verso) throw new Error('Ajoutez une image du recto et une image du verso.');
      if (draft.recto === draft.verso) throw new Error('Le recto et le verso doivent être deux images distinctes.');
      window.busy(true);
      const card = {id:crypto.randomUUID(), type:'Carte d’identité', identity, created:Date.now(), favorite:false, imageLayout:'recto-verso', images:[draft.recto,draft.verso]};
      const cards = clone(session.data.cards); cards.push(card); await save(cards, stamp); window.imported(allMetadata());
    }),
    open: id => run(async () => {
      const card = session.data.cards.find(c => c.id === id); if (!card) throw new Error('Carte introuvable.');
      window.showDocument(metadata(card), card.images.slice()); touch();
    }),
    setFavorite: (id, value) => run(async stamp => {
      const cards = clone(session.data.cards), card = cards.find(c => c.id === id); if (!card) throw new Error('Carte introuvable.');
      card.favorite = !!value; await save(cards, stamp); refresh(); window.favoriteUpdated(metadata(card));
    }),
    remove: id => {
      if (!session || !window.confirm('Supprimer cette carte et ses deux images de ce coffre ?')) return;
      return run(async stamp => { const cards = session.data.cards.filter(c => c.id !== id); await save(clone(cards), stamp); window.closeDetail(); refresh(); window.notify('Carte supprimée.'); });
    },
    requestAttachmentCheck: id => {
      if (!session || !session.data.cards.some(c => c.id === id && !c.attachmentChecked)) return;
      checkTarget = id; el('check-form').reset(); el('check-error').hidden = true; el('check-panel').hidden = false; el('check-code').focus();
    }
  };
  async function prepareOffline() {
    const status = el('offline-status');
    if (!('serviceWorker' in navigator)) { status.textContent = 'Le mode hors ligne nécessite une version compatible de Safari.'; return; }
    async function check() {
      const controller = navigator.serviceWorker.controller; if (!controller) return;
      const pipe = new MessageChannel();
      pipe.port1.onmessage = event => {
        if (event.data && event.data.ready) { status.textContent = '✓ Application prête hors ligne · version ' + event.data.version; status.dataset.ready = 'true'; }
        else { status.textContent = 'Cache incomplet : reconnectez-vous puis rechargez l’application.'; status.dataset.ready = 'false'; }
        pipe.port1.close();
      };
      controller.postMessage({type:'CHECK_OFFLINE'}, [pipe.port2]);
    }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      navigator.serviceWorker.addEventListener('controllerchange', check); await check();
      const update = () => { if (registration.waiting) { el('update-app').hidden = false; el('update-app').onclick = async () => {
        if (!window.confirm('Recharger la nouvelle version ? Fermez les formulaires et vérifiez vos sauvegardes avant de continuer.')) return;
        lockNow(); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once:true}); registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
      }; } };
      update(); registration.addEventListener('updatefound', () => { const worker = registration.installing; if (worker) worker.addEventListener('statechange', update); });
    } catch { status.textContent = 'Mode hors ligne non installé. Vérifiez la connexion et l’adresse HTTPS, puis rechargez.'; }
  }
  document.addEventListener('DOMContentLoaded', async () => {
    el('vault-form').onsubmit = authenticate; el('vault-cancel').onclick = closePassword;
    el('check-cancel').onclick = () => { el('check-panel').hidden = true; el('check-form').reset(); checkTarget = null; el('detail-menu-button').focus(); };
    el('check-panel').addEventListener('keydown', event => {
      if (event.key === 'Escape') el('check-cancel').click();
      if (event.key !== 'Tab') return;
      const items = [el('check-cancel'),el('check-code'),el('check-submit')].filter(item => !item.disabled);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length-1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length-1]) { event.preventDefault(); items[0].focus(); }
    });
    el('check-form').onsubmit = event => {
      event.preventDefault(); if (!session || !checkTarget) return;
      // Même indicateur de TEST LOCAL que sur Android, jamais une preuve d'authenticité.
      if (el('check-code').value !== 'Kotionok11') { el('check-error').textContent = 'Code incorrect'; el('check-error').hidden = false; return; }
      const id = checkTarget; el('check-code').value = ''; el('check-submit').disabled = true;
      run(async stamp => {
        const cards = clone(session.data.cards), card = cards.find(c => c.id === id); if (!card) throw new Error('Carte introuvable.');
        card.attachmentChecked = true; card.attachmentCheckedAt = Date.now(); await save(cards, stamp);
        el('check-panel').hidden = true; checkTarget = null; window.attachmentChecked(metadata(card),allMetadata());
      }).finally(() => { el('check-submit').disabled = false; });
    };
    el('vault-panel').addEventListener('keydown', event => {
      if (event.key === 'Escape') closePassword();
      if (event.key !== 'Tab') return;
      const items = Array.from(el('vault-panel').querySelectorAll('button,input')).filter(item => !item.disabled && item.getClientRects().length);
      const first = items[0], last = items[items.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    el('export-backup').onclick = exportBackup; el('restore-backup').onclick = chooseBackup; el('restore-locked').onclick = chooseBackup;
    el('image-input').addEventListener('change', async event => {
      endPicker(); const stamp = generation, file = event.target.files[0], side = event.target.dataset.side; event.target.value = '';
      if (!file || !session) return;
      window.busy(true);
      try { const data = await imageData(file); guard(stamp); draft[side] = data; window.sideSelected(side, data); touch(); }
      catch (error) { report(error); }
      finally { if (stamp === generation) window.busy(false); }
    });
    el('backup-input').addEventListener('change', async event => {
      endPicker(); const file = event.target.files[0]; event.target.value = ''; if (!file) return;
      try {
        if (file.size > 46000000) throw new Error('Cette sauvegarde est trop volumineuse.');
        const value = VaultCrypto.envelope(JSON.parse(await file.text())); openPassword('restore', value);
      } catch (error) { report(error); }
    });
    ['image-input','backup-input'].forEach(id => el(id).addEventListener('cancel', () => { endPicker(); touch(); }));
    // Les Safari anciens n'émettent pas toujours « cancel » après le sélecteur.
    window.addEventListener('focus', () => { if (picking && activePicker) setTimeout(() => { if (picking && activePicker && !activePicker.files.length && !document.hidden) { endPicker(); touch(); } }, 800); });
    document.addEventListener('visibilitychange', () => {
      document.body.classList.toggle('privacy-hidden', document.hidden);
      if (document.hidden && !picking) lockNow();
    });
    window.addEventListener('pagehide', lockNow);
    window.addEventListener('pageshow', () => { if (!document.hidden) document.body.classList.remove('privacy-hidden'); });
    ['pointerdown','keydown','touchstart'].forEach(name => document.addEventListener(name, touch, {passive:true}));
    if ('BroadcastChannel' in window) { channel = new BroadcastChannel(DB_NAME); channel.onmessage = async () => { lockNow(); try { saved = await read(); el('unlock').textContent = saved ? 'Déverrouiller mon espace →' : 'Créer mon coffre →'; } catch (error) { report(error); } }; }
    if (!window.isSecureContext || !crypto.subtle) { el('offline-status').textContent = 'Ouvrez l’adresse HTTPS publiée pour utiliser le coffre. Un fichier HTML ouvert directement ne suffit pas.'; el('unlock').disabled = true; return; }
    try {
      await database(); saved = await read(); if (saved) saved = VaultCrypto.envelope(saved); available = true;
      el('unlock').textContent = saved ? 'Déverrouiller mon espace →' : 'Créer mon coffre →';
    } catch (error) { el('offline-status').textContent = error.message; el('unlock').disabled = true; return; }
    prepareOffline();
  });
})();
