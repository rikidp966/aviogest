'use strict';
// AvioGest — Render, ciclo di gioco, salvataggi, menu iniziale

/* ---------- Render ---------- */
function render() {
  if (!G) return;
  const [v, ...arg] = (location.hash.slice(2) || 'panoramica').split('/');
  pagina = VISTE[v] ? v : 'panoramica'; UI.arg = decodeURIComponent(arg.join('/'));
  $('#app').classList.remove('menu-aperto');
  conFuoco(() => { $('#vista').innerHTML = schedeArea() + VISTE[pagina](); });
  aggiornaNav();
  if (pagina === 'panoramica') Mappa.monta($('#mappaPosto'));
  if (pagina === 'obiettivi') caricaClassifica($('#classifica'));
  $('#tip').hidden = true;
}
function aggiornaLive() {
  aggiornaNav();
  if (!$('#modale').hidden) return;
  if (pagina === 'panoramica') { const l = $('#live'); if (l) l.innerHTML = live(); const n = $('#notizie'); if (n) n.innerHTML = notizieHTML(40); }
  if (pagina === 'voli' && UI.voliTab === 'oggi') { const r = $('#risultati'); if (r) r.innerHTML = tabellaOggi(); }
  if (pagina === 'programmazione') { const c = document.querySelector('.crono .ora-ora'); if (c) c.style.left = `calc(100px + (100% - 100px) * ${(G.ora - SIM.mezzanotte(G.ora)) / GIORNO})`; }
}
function dopoAzione() { render(); Mappa.disegnaRete(); }

/* ---------- Ciclo di gioco ---------- */
let tPrec = performance.now(), accLive = 0, accMappa = 0;
function loop(t) {
  const dt = Math.min(250, t - tPrec); tPrec = t;
  if (G) {
    if (vel && !(G.esito && !G.esito.visto)) {
      const g0 = SIM.mezzanotte(G.ora);
      SIM.avanza(G, VEL[vel] * dt / 1000);
      gestisciNovita();
      if (SIM.mezzanotte(G.ora) !== g0 && $('#modale').hidden && !inputAttivo() && pagina !== 'programmazione') render();
      accLive += dt; if (accLive > 700) { accLive = 0; aggiornaLive(); }
    }
    aggiornaCima();
    accMappa += dt; if (accMappa > 150) { accMappa = 0; Mappa.aggiorna(); }
  }
  requestAnimationFrame(loop);
}
const inputAttivo = () => { const a = document.activeElement; return a && /INPUT|SELECT/.test(a.tagName); };
function gestisciNovita() {
  const nuove = G._nuove || []; G._nuove = [];
  let pausa = false;
  // a schermo al massimo due avvisi per volta: il resto è nel centro notifiche (campanella in alto)
  const forti = nuove.filter(n => n.imp || n.festa);
  if (forti.length > 2) { toast(`${forti.length} notizie importanti: apri la campanella in alto per leggerle`, forti.some(n => n.tipo === 'cattiva') ? 'cattiva' : 'buona'); suono('evento'); }
  else for (const n of forti) { toast(n.testo, n.festa ? 'buona' : n.tipo); suono(n.tipo === 'buona' || n.festa ? 'buona' : n.tipo === 'cattiva' ? 'cattiva' : 'evento'); }
  if (UI.pausaAuto && nuove.some(n => n.imp)) pausa = true;
  if (nuove.length) aggiornaCampanella();
  if (nuove.some(n => n.emergenza) && G.emergenza) { vel = 0; aggiornaVel(); setTimeout(apriEmergenza, 50); }
  if (pausa && vel) { vel = 0; aggiornaVel(); }
  if (G._salva) { G._salva = false; salva(); }
  if (G.esito && !G.esito.visto) mostraEsito();
}
const Archivio = {
  server: true,
  locale() { try { return JSON.parse(localStorage.getItem('aviogest-indice') || '[]'); } catch { return []; } },
  async lista() {
    try { const r = await fetch('/api/salvataggi'); if (!r.ok) throw 0; this.server = true; return await r.json(); }
    catch { this.server = false; return this.locale(); }
  },
  async carica(id) {
    if (this.server) { try { const r = await fetch('/api/salvataggi/' + id); if (r.ok) return await r.json(); } catch { } }
    return JSON.parse(localStorage.getItem('aviogest-p-' + id));
  },
  async salva(g, corpo) {
    if (this.server) { try { const r = await fetch('/api/salvataggi/' + g.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: corpo }); if (r.ok) return true; } catch { } this.server = false; }
    try {
      localStorage.setItem('aviogest-p-' + g.id, corpo);
      const ind = this.locale().filter(x => x.id !== g.id);
      ind.unshift({ id: g.id, nome: g.nome, scenario: g.scenario, ora: g.ora, cassa: Math.round(g.cassa), salvato: Date.now() });
      localStorage.setItem('aviogest-indice', JSON.stringify(ind)); return true;
    } catch { return false; }
  },
  async elimina(id) {
    if (this.server) { try { await fetch('/api/salvataggi/' + id, { method: 'DELETE' }); } catch { } }
    try { localStorage.removeItem('aviogest-p-' + id); localStorage.setItem('aviogest-indice', JSON.stringify(this.locale().filter(x => x.id !== id))); } catch { }
  },
  async classifica() {
    if (this.server) { try { const r = await fetch('/api/classifica'); if (r.ok) return await r.json(); } catch { } }
    try { return JSON.parse(localStorage.getItem('aviogest-classifica') || '[]'); } catch { return []; }
  },
  async registra(x) {
    if (this.server) { try { const r = await fetch('/api/classifica', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(x) }); if (r.ok) return; } catch { } }
    try { const c = await this.classifica(); c.push({ ...x, data: Date.now() }); c.sort((a, b) => b.punteggio - a.punteggio); localStorage.setItem('aviogest-classifica', JSON.stringify(c.slice(0, 100))); } catch { }
  }
};
async function salva(manuale) {
  const ok = await Archivio.salva(G, JSON.stringify(G, (k, v) => k.startsWith('_') ? undefined : v));
  if (manuale) toast(ok ? (Archivio.server ? 'Partita salvata' : 'Partita salvata su questo dispositivo') : 'Salvataggio non riuscito: memoria piena?', ok ? 'buona' : 'err');
}
function mostraEsito() {
  const e = G.esito; e.visto = true; vel = 0; aggiornaVel();
  if (e.tipo === 'vittoria') {
    suono('buona');
    Archivio.registra({ nome: G.nome, scenario: G.scenario, punteggio: e.punteggio, giorni: e.giorni });
    modale({ titolo: '🏆 Scenario completato!', corpo: `<p>${h(G.nome)} ha raggiunto gli obiettivi di <b>${SCEN().nome}</b> in <b>${e.giorni}</b> giorni.</p><p style="font-size:28px;margin:8px 0"><b>${num(e.punteggio)}</b> punti</p><p class="muto">Il punteggio è stato registrato in classifica. Puoi continuare a far crescere la compagnia.</p>`, piede: `<button data-az="esci">Torna al menu</button><button class="primario" data-az="chiudi">Continua a giocare</button>` });
  } else if (e.tipo === 'scaduto') {
    modale({ titolo: 'Tempo scaduto', corpo: `<p>Gli obiettivi di <b>${SCEN().nome}</b> non sono stati raggiunti in tempo.</p><p class="muto">Puoi continuare a giocare liberamente, senza punteggio.</p>`, piede: `<button data-az="esci">Torna al menu</button><button class="primario" data-az="chiudi">Continua</button>` });
  } else {
    suono('cattiva');
    modale({ titolo: 'Fallimento', corpo: `<p>Dopo 10 giorni oltre il limite di fido, le banche hanno chiuso i conti di ${h(G.nome)}.</p><p class="muto">Giorni di attività: ${Math.round((G.ora - G.inizio) / GIORNO)} · passeggeri trasportati: ${num(G.stat.pax)}</p>`, piede: `<button class="primario" data-az="esci">Torna al menu</button>` });
  }
  salva();
}

/* ---------- Menu iniziale ---------- */
async function menuIniziale() {
  G = null; vel = 0; Mappa.reset();
  $('#app').hidden = true; const m = $('#menu-iniziale'); m.hidden = false;
  let salvati = [], classifica = [];
  salvati = await Archivio.lista(); classifica = await Archivio.classifica();
  const S = D.SCENARI[UI.scenarioSel];
  const basi = perContinente();
  m.innerHTML = `<div class="menu-box">
    <h1><span class="logo-segno" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 15.5v-1.6l-6.7-4.2V5.2a1.3 1.3 0 0 0-2.6 0v4.5L4 13.9v1.6l6.7-2.1v4.1L9 18.8v1.2l3-.8 3 .8v-1.2l-1.7-1.3v-4.1z"/></svg></span>AvioGest</h1>
    <p class="motto">Costruisci la tua compagnia aerea in tutto il mondo: flotta e cabine, programmi settimanali, prezzi per classe, basi e hub, equipaggi, marketing e concorrenti.</p>
    <div class="striscia" aria-label="Partenze">${'PARTENZE'.split('').map(c => `<span>${c}</span>`).join('')}</div>
    <div class="filtri" style="justify-content:flex-end"><label class="btn scuro">Importa partita<input type="file" accept=".json,application/json" id="importaFile" hidden></label></div>
    ${salvati.length ? `<h2>Continua</h2><div class="pannello"><table><thead><tr><th>Compagnia</th><th>Scenario</th><th>Data di gioco</th><th class="num">Cassa</th><th>Salvata</th><th></th></tr></thead><tbody>
      ${salvati.map(s => `<tr class="clic" data-az="carica" data-id="${s.id}"><td><b>${h(s.nome)}</b></td><td>${h(D.SCENARI[s.scenario]?.nome || '')}</td><td>${fmtData(s.ora)}</td><td class="num">${eur(s.cassa)}</td><td>${new Date(s.salvato).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</td><td><button class="piccolo" data-az="elimina-salvataggio" data-id="${s.id}">Elimina</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <h2>Nuova partita</h2>
    <div class="scenari">${Object.entries(D.SCENARI).map(([k, s], i) => `<button class="scenario ${k === UI.scenarioSel ? 'on' : ''}" data-az="scegli-scenario" data-s="${k}" aria-pressed="${k === UI.scenarioSel}">
      <span class="pass-main"><span class="pass-testa">Carta d’imbarco <i>${h(s.difficolta)}</i></span>
        <b class="pass-nome">${h(s.nome)}</b><p>${h(s.descr)}</p>
        <span class="pass-lab">Obiettivo</span><p class="pass-ob">${h(s.obiettivi)}</p></span>
      <span class="pass-stub"><span class="pass-lab">Posto</span><span class="codice">${['1A', '2C', '3F', '4D', '5K'][i] || '6B'}</span>
        <span class="pass-lab">Durata</span><b>${s.durata ? Math.round(s.durata / 365 * 10) / 10 + ' anni' : 'libera'}</b>
        <span class="pass-lab">Capitale</span><b>${s.cassa ? mln(s.cassa) : '2,5 M€'}</b><i class="barcode"></i></span></button>`).join('')}</div>
    <div class="pannello mt"><div class="form">
      <label class="campo">Nome della compagnia<input id="nNome" value="${UI.scenarioSel === 'crisi' ? 'Aliseo Airlines' : 'Volaria'}" maxlength="30"></label>
      <label class="campo">Codice volo (2 lettere)<input id="nCodice" value="${UI.scenarioSel === 'crisi' ? 'AL' : 'VL'}" maxlength="2"></label>
      ${S.sceltaBase ? `<label class="campo">Base di partenza<select id="nBase">${opzioniAeroporti(basi, S.mondo ? 'FCO' : 'BRI', a => a.slot ? ' (slot regolati)' : '')}</select><span class="aiuto">Una base in un aeroporto a slot dà 8 slot gratuiti.</span></label>` : `<p class="piccolo">Basi: ${S.base || 'Roma Fiumicino (hub) e Milano Malpensa'}</p>`}
      <div class="pieno"><button class="primario" data-az="nuova-partita">Decolla!</button></div></div></div>
    ${classifica.length ? `<h2>Classifica</h2><div class="pannello"><table><tbody>${classifica.slice(0, 10).map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.nome)}</td><td>${h(D.SCENARI[x.scenario]?.nome || '')}</td><td class="num">${x.giorni} giorni</td><td class="num"><b>${num(x.punteggio)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="nota" style="color:#8ea0bb">Comandi: barra spaziatrice = pausa, tasti 1-2-3 = velocità. La partita si salva da sola ogni giorno di gioco.</p>
  </div>`;
  avviaCielo(m);
}
// Cielo del menu: aeroporti come punti e voli che disegnano rotte ad arco sul planisfero
let cieloAnim = 0;
function avviaCielo(contenitore) {
  cancelAnimationFrame(cieloAnim);
  const cv = document.createElement('canvas'); cv.className = 'cielo'; cv.setAttribute('aria-hidden', 'true');
  contenitore.prepend(cv);
  const ctx = cv.getContext('2d'), aero = Object.values(AP), fermo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0;
  const dim = () => { const r = window.devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight; cv.width = W * r; cv.height = H * r; ctx.setTransform(r, 0, 0, r, 0, 0); };
  const xy = ([la, lo]) => [(lo + 180) / 360 * W, (75 - la) / 135 * H];
  const nuovo = () => { let a, b; do { a = aero[Math.floor(Math.random() * aero.length)]; b = aero[Math.floor(Math.random() * aero.length)]; } while (a === b || SIM.km(a.iata, b.iata) < 1500); return { a, b, p: 0, v: 0.0025 + Math.random() * 0.003 }; };
  const voli = Array.from({ length: 14 }, () => { const v = nuovo(); v.p = Math.random(); return v; });
  const disegna = () => {
    if (!cv.isConnected) return;
    if (cv.clientWidth !== W || cv.clientHeight !== H) dim();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(160,185,220,.35)';
    for (const a of aero) { const [x, y] = xy([a.lat, a.lon]); ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const v of voli) {
      const n = 40, fino = Math.min(1, v.p), coda = Math.max(0, v.p - 0.45);
      let prec = null;
      for (let i = 0; i <= n; i++) {
        const f = coda + (fino - coda) * i / n, pt = xy(puntoArco(v.a, v.b, f));
        if (prec && Math.abs(pt[0] - prec[0]) < W / 2) { ctx.strokeStyle = `rgba(255,201,41,${0.05 + 0.55 * i / n})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(prec[0], prec[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); }
        prec = pt;
      }
      if (v.p <= 1) { const [x, y] = xy(puntoArco(v.a, v.b, fino)); ctx.fillStyle = '#ffc929'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); }
      if (!fermo) { v.p += v.v; if (v.p > 1.45) Object.assign(v, nuovo()); }
    }
    if (!fermo) cieloAnim = requestAnimationFrame(disegna);
  };
  dim(); disegna();
}
function avviaPartita(g) {
  cancelAnimationFrame(cieloAnim);
  G = SIM.migra(g); G._nuove = []; vel = 0; bozza = null; UI.aereoSel = null;
  $('#menu-iniziale').hidden = true; $('#app').hidden = false;
  $('#nomeCompagnia').textContent = G.nome; $('#scenarioNome').textContent = SCEN().nome;
  costruisciCima(); Mappa.reset(); applicaMarchio();
  if (location.hash !== '#/panoramica') location.hash = '#/panoramica'; else render();
}

/* ---------- Programmazione: modifiche alla bozza ---------- */
function aggiornaEditor() { const ae = G.aerei.find(a => a.id === bozza.aeId); $('#editor').innerHTML = editor(ae); }
// dopo una modifica al giorno i, se il giorno seguente non ha ancora tratte lo fa partire da dove finisce il giorno i
function allinea(i) {
  const n = bozza.giorni.length, succ = bozza.giorni[(i + 1) % n];
  if (n > 1 && succ !== bozza.giorni[i] && succ.scali.length === 1) succ.scali[0] = bozza.giorni[i].scali.at(-1);
}
const copiaGiorno = g => ({ inizio: g.inizio, scali: g.scali.slice(), attese: (g.attese || []).slice(), cambi: (g.cambi || []).slice() });
// Aggiunge uno scalo al giorno scelto; se la rotta non è aperta la apre (30.000 €) dopo conferma
function aggiungiScalo(d) {
  if (!d) return;
  const g = bozza.giorni[bozza.sel], da = g.scali.at(-1), k = SIM.chiave(da, d);
  const metti = () => { g.scali.push(d); allinea(bozza.sel); aggiornaEditor(); };
  if (G.rotte[k]) return metti();
  conferma(`Aprire la rotta ${da}–${d}?`, `${h(citta(da))}–${h(citta(d))}, ${num(SIM.km(da, d))} km. La campagna di lancio costa 30.000 €; i prezzi partono da quelli di riferimento e li cambi in Rotte e prezzi. La domanda cresce nei primi 2 mesi.`, 'Apri e aggiungi il volo', () => { if (esito(SIM.A.apriRotta(G, da, d))) { metti(); Mappa.disegnaRete(); } });
}
