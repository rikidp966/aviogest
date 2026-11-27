'use strict';
// AvioGest — Gestori di eventi e avvio

/* ---------- Eventi ---------- */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-az]');
  if (el && AZ[el.dataset.az] && el.type !== 'checkbox' && el.tagName !== 'SELECT') {
    if (el.disabled) return;
    if (el.tagName === 'A') ev.preventDefault();
    AZ[el.dataset.az](el, ev); return;
  }
  if (ev.target === $('#modale')) chiudiModale();
  if (ev.target.closest('#menu a')) $('#app').classList.remove('menu-aperto');
  const t = ev.target.closest('[data-tip]');
  if (t && TOCCO) mostraTip(t.dataset.tip, ev.clientX, ev.clientY, 3500);
});
const TOCCO = matchMedia('(hover: none)').matches;
let tipTimer;
function mostraTip(testo, x, y, durata) {
  const tip = $('#tip'); tip.textContent = testo; tip.hidden = false;
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(8, y - tip.offsetHeight - 14) + 'px';
  clearTimeout(tipTimer); if (durata) tipTimer = setTimeout(() => tip.hidden = true, durata);
}
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.az === 'autocheck') return AZ.autocheck(el);
  if (el.dataset.fed) { esito(SIM.A.fedelta(G, { [el.dataset.fed]: el.value })); render(); return; }
  if (el.dataset.imp) { esito(SIM.A.impostazione(G, el.dataset.imp, el.dataset.imp === 'quotaRiserve' ? +el.value : el.value)); render(); return; }
  if (el.dataset.impChk) { esito(SIM.A.impostazione(G, el.dataset.impChk, el.checked)); render(); return; }
  if (el.dataset.handling) { esito(SIM.A.handling(G, el.dataset.handling, el.checked)); render(); return; }
  if (el.id === 'neContratto') { costoNuovo(); return; }
  if (el.id === 'pianoUrgente') { UI.pianoUrgente = el.checked; disegnaPianificatore(); return; }
  if (el.dataset.rt) { esito(SIM.A.tariffeRotta(G, el.dataset.k, { [el.dataset.rt]: el.value === '' ? null : +el.value })); render(); return; }
  if (el.dataset.canale) { esito(SIM.A.canale(G, el.dataset.canale, el.checked)); render(); return; }
  if (el.dataset.irops) { esito(SIM.A.irops(G, el.dataset.irops, el.checked)); render(); return; }
  if (el.dataset.esperto) { esito(SIM.A.esperto(G, el.checked)); render(); return; }
  if (el.id === 'edizione') { UI.edizione = +el.value; render(); return; }
  if (el.id === 'safQuota') { esito(SIM.A.saf(G, +el.value)); render(); return; }
  if (el.id === 'importaFile' && el.files[0]) { importaPartita(el.files[0]); return; }
  if (el.dataset.bordo) { esito(SIM.A.bordo(G, el.dataset.c, el.dataset.bordo, +el.value)); render(); return; }
  if (el.dataset.tar) { esito(SIM.A.tariffe(G, { [el.dataset.tar]: +el.value })); render(); return; }
  if (el.dataset.tarSel) { esito(SIM.A.tariffe(G, { [el.dataset.tarSel]: el.dataset.tarSel === 'overbooking' ? +el.value : el.value })); render(); return; }
  if (el.dataset.tarChk) { esito(SIM.A.tariffe(G, { [el.dataset.tarChk]: el.checked })); render(); return; }
  if (el.id === 'rcTipo') { UI.rcTipo = el.value; render(); return; }
  if (el.id === 'rottaBiglietto') { UI.rottaBiglietto = el.value; render(); return; }
  if (el.dataset.azChange === 'auto-equipaggi' || el.dataset.azChange === 'auto-ispezioni') { esito(SIM.A.impostaAuto(G, el.dataset.azChange.slice(5), el.checked)); return; }
  if (el.dataset.azChange === 'opz-pausa') { UI.pausaAuto = el.checked; salvaOpz(); return; }
  if (el.dataset.azChange === 'opz-suoni') { UI.suoni = el.checked; salvaOpz(); const b = $('#cSuoni'); if (b) b.textContent = UI.suoni ? '🔊' : '🔈'; return; }
  if (el.id === 'gBase') { UI.guida.base = el.value; UI.guida.dest = []; disegnaGuida(); return; }
  if (el.id === 'gX') { UI.guida.dest[0] = el.value; if (UI.guida.dest[1] === el.value) UI.guida.dest[1] = ''; if ($('#gY')) disegnaGuida(); else calcolaGuida(); return; }
  if (el.id === 'gY') { UI.guida.dest[1] = el.value; calcolaGuida(); return; }
  if (el.id === 'gGiri') { UI.guida.giri = +el.value; calcolaGuida(); return; }
  if (el.dataset.prezzo) { esito(SIM.A.prezzi(G, el.dataset.prezzo, { ['p' + el.dataset.cl]: +el.value })); return; }
  if (el.dataset.azChange === 'stipendio') { G.stipendio = +el.value; toast('Livello stipendi aggiornato'); render(); return; }
  if (el.dataset.azChange === 'servizio') { G.servizio = el.value; toast('Servizio di bordo aggiornato'); return; }
  if (el.id === 'cmAmbito') { aggiornaObiettivi(); stimaCampagna(); return; }
  if (el.id === 'cmOb' || el.id === 'cmGiorni' || el.id === 'cmBudget') { stimaCampagna(); return; }
  if (el.classList.contains('sel-eq')) { esito(SIM.A.fissaEquipaggio(G, el.dataset.turno, el.value || null)); aggiornaEditor(); const bp = $('#bannerProg'); if (bp) bp.innerHTML = bannerMancanti(); return; }
  if (el.id === 'nePiloti' || el.id === 'neBase') { costoNuovo(); return; }
  if (el.classList.contains('ora-volo')) {
    const g = bozza.giorni[bozza.sel], k = +el.dataset.leg, ae = G.aerei.find(a => a.id === bozza.aeId);
    const att = (g.attese || []).slice(); att[k] = 0;
    const minimo = SIM.legsGiorno(ae, { ...g, attese: att }, bozza.turn)[k].dep;
    let voluto = SIM.minDaOra(el.value || '00:00') + 1440 * Math.floor(minimo / 1440);
    if (voluto < minimo && voluto + 1440 - minimo <= 720) voluto += 1440;
    const extra = voluto - minimo;
    if (extra < 0) { toast(`Questo volo può partire al più presto alle ${SIM.oraDaMin(minimo)} (arrivo del volo prima + turnaround)`, 'err'); att[k] = 0; }
    else if (extra > 720) { toast('Al massimo 12 ore a terra tra un volo e l’altro', 'err'); att[k] = g.attese?.[k] || 0; }
    else att[k] = extra;
    g.attese = att; allinea(bozza.sel); aggiornaEditor(); return;
  }
  if (el.id === 'pInizio') { bozza.giorni[bozza.sel].inizio = el.value || bozza.giorni[bozza.sel].inizio; aggiornaEditor(); return; }
  if (el.id === 'pTurn') { bozza.turn = +el.value; aggiornaEditor(); return; }
  if (el.id === 'pPartenza') {
    const g = bozza.giorni[bozza.sel];
    if (g.scali.length > 1) { conferma('Cambiare l’aeroporto di partenza?', 'I voli di questo giorno verranno tolti.', 'Cambia', () => { g.scali = [el.value]; g.attese = []; aggiornaEditor(); }); return; }
    g.scali = [el.value]; g.attese = []; aggiornaEditor(); return;
  }
  if (el.id === 'rDa' || el.id === 'rA') { if (el.id === 'rDa') { const a = el.value; $('#rA').innerHTML = '<option value="">— scegli —</option>' + opzioniAeroporti(perContinente().filter(x => x.iata !== a), ''); } infoRotta(); return; }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'aeroQ') { UI.aeroQ = ev.target.value; const pos = ev.target.selectionStart; render(); const i = $('#aeroQ'); i.focus(); i.setSelectionRange(pos, pos); }
  if (/^cab[JWY]$/.test(ev.target.id)) aggiornaConfig();
  if (ev.target.id === 'neCabina') costoNuovo();
  if (ev.target.id === 'cmBudget') stimaCampagna();
});
document.addEventListener('keydown', ev => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList?.contains('sett-riga')) { ev.preventDefault(); ev.target.click(); return; }
  if (ev.key === 'Escape' && !$('#modale').hidden) return chiudiModale();
  if (!G || inputAttivo() || !$('#modale').hidden) return;
  if (ev.code === 'Space') { ev.preventDefault(); vel = vel ? 0 : 1; aggiornaVel(); }
  if (['1', '2', '3'].includes(ev.key)) { vel = +ev.key; aggiornaVel(); }
  if (ev.key === '0') { vel = 0; aggiornaVel(); }
});
document.addEventListener('mouseover', ev => {
  if (TOCCO) return;
  const t = ev.target.closest('[data-tip]'), tip = $('#tip');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip; tip.hidden = false;
});
document.addEventListener('mousemove', ev => {
  const tip = $('#tip'); if (tip.hidden) return;
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 16) + 'px';
});
window.addEventListener('hashchange', () => { if (G) { render(); scrollTo(0, 0); } });
// su telefono la pagina può essere chiusa in qualsiasi momento: salva quando passa in secondo piano
document.addEventListener('visibilitychange', () => { if (document.hidden && G) salva(); });
window.addEventListener('beforeunload', () => { if (G && Archivio.server) navigator.sendBeacon?.('/api/salvataggi/' + G.id + '/beacon', new Blob([JSON.stringify(G, (k, v) => k.startsWith('_') ? undefined : v)], { type: 'application/json' })); });

menuIniziale();
requestAnimationFrame(loop);
// app installabile e giocabile anche offline
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
