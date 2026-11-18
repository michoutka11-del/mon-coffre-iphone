/* Format public du coffre. Aucune clé ni donnée personnelle n'est livrée avec le site. */
(function (scope) {
  'use strict';
  const ITERATIONS = 600000;
  const MAX_BYTES = 32 * 1024 * 1024;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
  function bytes64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 16384) s += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(s);
  }
  function from64(s) {
    if (typeof s !== 'string' || s.length > 46000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Format du coffre invalide.');
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  }
  function envelope(value) {
    if (!value || value.format !== 'fr-identite-personnel' || value.version !== 1 || value.kdf !== 'PBKDF2-SHA256' || value.iterations !== ITERATIONS || value.cipher !== 'AES-256-GCM') throw new Error('Sauvegarde incompatible avec cette version.');
    if (from64(value.salt).length !== 16 || from64(value.iv).length !== 12 || from64(value.data).length < 16) throw new Error('Sauvegarde incomplète.');
    return {format: value.format, version: 1, kdf: value.kdf, iterations: ITERATIONS, cipher: value.cipher, salt: value.salt, iv: value.iv, data: value.data};
  }
  function payload(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.cards) || value.cards.length > 100) throw new Error('Contenu du coffre invalide.');
    const ids = new Set(), keys = ['surname','givenNames','sex','nationality','birthDate','birthPlace','documentNumber','expiryDate','can'];
    for (const card of value.cards) {
      if (!card || typeof card.id !== 'string' || !/^[a-f0-9-]{16,64}$/.test(card.id) || ids.has(card.id) || card.type !== 'Carte d’identité' || !Number.isFinite(card.created) || typeof card.favorite !== 'boolean' || card.imageLayout !== 'recto-verso') throw new Error('Carte invalide dans la sauvegarde.');
      ids.add(card.id);
      if (!card.identity || keys.some(k => typeof card.identity[k] !== 'string' || card.identity[k].length > 200) || !Array.isArray(card.images) || card.images.length !== 2 || card.images.some(s => typeof s !== 'string' || s.length > 6000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(s))) throw new Error('Images ou informations invalides dans la sauvegarde.');
    }
    return value;
  }
  async function derive(password, salt) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt: from64(salt), iterations: ITERATIONS}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt','decrypt']);
  }
  async function seal(value, key, salt) {
    payload(value);
    const bytes = encoder.encode(JSON.stringify(value));
    if (bytes.length > MAX_BYTES) throw new Error('Le coffre dépasse 32 Mo. Supprimez des cartes après sauvegarde pour libérer de la place.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData: encoder.encode('fr-identite-personnel:v1')}, key, bytes);
    return {format:'fr-identite-personnel', version:1, kdf:'PBKDF2-SHA256', iterations:ITERATIONS, cipher:'AES-256-GCM', salt, iv:bytes64(iv), data:bytes64(new Uint8Array(encrypted))};
  }
  async function open(value, password) {
    value = envelope(value);
    const key = await derive(password, value.salt);
    let plain;
    try { plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:from64(value.iv), additionalData:encoder.encode('fr-identite-personnel:v1')}, key, from64(value.data)); }
    catch { throw new Error('Mot de passe incorrect ou sauvegarde endommagée.'); }
    const data = payload(JSON.parse(decoder.decode(plain)));
    return {key, data, salt:value.salt};
  }
  async function create(password) {
    if (typeof password !== 'string' || password.length < 12) throw new Error('Choisissez un mot de passe d’au moins 12 caractères.');
    const salt = bytes64(crypto.getRandomValues(new Uint8Array(16))), key = await derive(password, salt);
    const data = {version:1, cards:[]};
    return {key, salt, data, encrypted:await seal(data, key, salt)};
  }
  const api = {envelope, payload, derive, seal, open, create, bytes64};
  scope.VaultCrypto = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
