'use strict';
// AvioGest — Consigli, missioni, semafori, rotazione guidata, impostazioni

/* ---------- Uso semplice: consigli, missioni, semafori, rotazione guidata, impostazioni ---------- */
const AVANZATE = ['ricavi', 'hub', 'marketing', 'aeroporti', 'finanze', 'concorrenza'];
function salute() { if (!UI._sal || UI._salT !== G.ora || UI._salG !== G) { UI._sal = SIM.salute(G); UI._salT = G.ora; UI._salG = G; } return UI._sal; }
const semaforo = s => s ? `<span class="semaforo ${s.c}" data-tip="${h(s.t)}" role="img" aria-label="${h(s.t)}"></span>` : '';
const COLORE_TXT = { verde: 'va bene', giallo: 'da guardare', rosso: 'problema', grigio: 'nessun dato', info: '' };
function consigliHTML() {
  const L = UI.consigli = SIM.consigli(G), a = G.auto || {};
  const auto = `<p class="piccolo muto pilota">Pilota automatico: ${a.equipaggi ? 'assume gli equipaggi' : '<b>equipaggi a mano</b>'} · ${a.ispezioni ? 'programma le ispezioni' : '<b>ispezioni a mano</b>'} · <a href="#/impostazioni">cambia</a></p>`;
  if (!L.length) return `<h2>Consigli del giorno</h2><p class="tutto-ok">✓ Tutto in ordine: nessuna rotta in perdita, aerei e turni coperti.</p>${auto}`;
  return `<h2>Consigli del giorno</h2><ul class="consigli">${L.map((c, i) => `<li class="${c.c}"><span class="semaforo ${c.c === 'info' ? 'grigio' : c.c}" aria-hidden="true"></span><span class="cons-testo">${h(c.testo)}</span>
    <span class="cons-az">${c.azioni.map((x, j) => `<button class="piccolo ${j === 0 ? 'primario' : ''}" data-az="consiglio" data-i="${i}" data-j="${j}">${h(x.et)}</button>`).join('')}</span></li>`).join('')}</ul>${auto}`;
}
function missioniHTML() {
  const M = G.missioni || { attive: [], fatte: 0 };
  return `<h2>Missioni</h2>${M.attive.length ? `<div class="missioni">${M.attive.map(x => {
    const gg = Math.max(0, Math.ceil((x.scade - G.ora) / GIORNO));
    return `<div class="missione"><div class="riga" style="margin:0"><b>${h(x.testo)}</b><span class="premio">${mln(x.cassa)}${x.rep ? ` · +${x.rep} rep` : ''}</span></div>
      <div class="piccolo muto">${h(x.dett)} · ${gg === 1 ? 'scade domani' : `scade tra ${gg} giorni`}</div>${barretta(Math.min(1, x.v), x.serie != null && x.obiettivo && x.tipo !== 'pax' && x.tipo !== 'reputazione' && x.tipo !== 'rotta' ? `${x.serie}/${x.obiettivo} giorni` : pct(Math.min(1, x.v)), [2, 2])}</div>`; }).join('')}</div>` : '<p class="muto">Nuove missioni da domani.</p>'}
    <p class="piccolo muto">Missioni completate: <b>${M.fatte}</b>. Ogni missione dà denaro e reputazione; se scade ne arriva un’altra.</p>`;
}
VISTE.impostazioni = () => {
  const a = G.auto || {};
  const riga = (k, t, d, on) => `<label class="interruttore"><input type="checkbox" data-az-change="${k}" ${on ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>${t}</b><small>${d}</small></span></label>`;
  return `<div class="testata"><h1>Impostazioni</h1><span class="sotto">Decidi cosa fa il gioco da solo e cosa resta a te</span></div>
  <div class="griglia g2">
    <div class="pannello"><h2>Pilota automatico</h2>
      ${riga('auto-equipaggi', 'Assume gli equipaggi', 'Ogni notte, se qualche turno della settimana non ha equipaggio, assume quelli che mancano (assunzione normale, operativi in 10 giorni). Se la cassa non basta ti avvisa.', a.equipaggi)}
      ${riga('auto-ispezioni', 'Programma le ispezioni', 'Ogni aereo va in ispezione di notte quando si avvicina alle 600 ore. Puoi ancora cambiarlo aereo per aereo dalla Flotta.', a.ispezioni)}
      <p class="nota">Prezzi, rotte e acquisti restano sempre a te: il consigliere in Panoramica ti suggerisce cosa cambiare, con un tocco.</p></div>
    <div class="pannello"><h2>Gioco</h2>
      ${riga('opz-pausa', 'Pausa sugli eventi importanti', 'Il tempo si ferma quando arriva una notizia importante (guasti, eventi, guerre dei prezzi).', UI.pausaAuto)}
      ${riga('opz-suoni', 'Suoni', 'Effetti sonori per voli, eventi e missioni.', UI.suoni)}</div>
  </div>
  ${pannelloRealismo()}
  ${pannelloPartita()}`;
};

// Rotazione guidata
const MODELLI_ROT = [
  ['navetta', 'Navetta', 'Base ⇄ una meta, più volte al giorno', '⇄'],
  ['alterna', 'Due mete', 'Base ⇄ A, poi base ⇄ B, a turno', '⇆'],
  ['triangolo', 'Triangolo', 'Base → A → B → base', '△'],
  ['lungo', 'Lungo raggio', 'Base ⇄ una meta lontana, ogni giorno o a giorni alterni', '✈'],
  ['weekend', 'Weekend diverso', 'Lun–Ven su una meta, sab–dom su un’altra', '7']
];
function apriGuida(aeId) {
  const ae = G.aerei.find(a => a.id === aeId); if (!ae) return;
  const m = MOD[ae.modello];
  UI.guida = { aeId, tipo: m.lungo ? 'lungo' : 'navetta', base: G.basi.includes(ae.base) ? ae.base : G.basi[0], dest: [], giri: 0 };
  modale({ titolo: `Rotazione guidata · ${ae.marche} (${m.nome})`, larga: true, corpo: '<div id="guida"></div>', piede: '<div id="guidaPiede" class="filtri" style="margin:0;justify-content:flex-end"></div>' });
  disegnaGuida();
}
function destGuida(base, mod, tipo, escludi) {
  const m = MOD[mod];
  const l = Object.values(AP).filter(a => a.iata !== base && a.iata !== escludi).map(a => ({ d: a.iata, k: SIM.km(base, a.iata), aperta: !!G.rotte[SIM.chiave(base, a.iata)] }))
    .filter(x => x.k <= m.autonomia && (tipo === 'lungo' ? x.k >= 2500 : x.k >= 150)).sort((a, b) => a.k - b.k);
  return [['Rotte già aperte', l.filter(x => x.aperta)], ['Da aprire · 30.000 €', l.filter(x => !x.aperta)]].map(([t, q]) => q.length ? `<optgroup label="${t}">${q.map(x => `<option value="${x.d}">${x.d} · ${h(citta(x.d))} · ${num(x.k)} km</option>`).join('')}</optgroup>` : '').join('');
}
function disegnaGuida() {
  const g = UI.guida, ae = G.aerei.find(a => a.id === g.aeId), m = MOD[ae.modello], box = $('#guida'); if (!box) return;
  const due = ['alterna', 'triangolo', 'weekend'].includes(g.tipo);
  const etX = g.tipo === 'weekend' ? 'Lun–Ven verso' : due ? 'Prima meta' : 'Meta', etY = g.tipo === 'weekend' ? 'Sab–Dom verso' : 'Seconda meta';
  box.innerHTML = `<div class="modelli-rot">${MODELLI_ROT.filter(([t]) => !(m.lungo && t !== 'lungo' && t !== 'navetta')).map(([t, n, d, s]) => `<button type="button" data-az="g-tipo" data-t="${t}" class="${g.tipo === t ? 'on' : ''}" aria-pressed="${g.tipo === t}"><i aria-hidden="true">${s}</i><b>${n}</b><small>${d}</small></button>`).join('')}</div>
    <div class="form mt">
      ${G.basi.length > 1 ? `<label>Base di partenza<select id="gBase">${opzioni(G.basi.map(b => [b, `${b} · ${citta(b)}`]), g.base)}</select></label>` : ''}
      <label>${etX}<select id="gX"><option value="">— scegli —</option>${destGuida(g.base, ae.modello, g.tipo, null)}</select></label>
      ${due ? `<label>${etY}<select id="gY"><option value="">— scegli —</option>${destGuida(g.base, ae.modello, g.tipo, g.dest[0])}</select></label>` : ''}
      ${g.tipo === 'lungo' || g.tipo === 'weekend' ? '' : `<label>Voli al giorno<select id="gGiri">${opzioni([[0, 'Automatico (secondo la domanda)'], [-1, 'Il massimo possibile'], ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, `${n} ${g.tipo === 'triangolo' ? (n === 1 ? 'giro' : 'giri') : n === 1 ? 'andata e ritorno' : 'andate e ritorno'}`])], g.giri)}</select></label>`}
    </div>
    <div id="gRis" class="mt"></div>`;
  if ($('#gX')) $('#gX').value = g.dest[0] || '';
  if ($('#gY')) $('#gY').value = g.dest[1] || '';
  calcolaGuida();
}
function calcolaGuida() {
  const g = UI.guida, box = $('#gRis'), piede = $('#guidaPiede'); if (!box) return;
  const due = ['alterna', 'triangolo', 'weekend'].includes(g.tipo);
  piede.innerHTML = '<button data-az="chiudi">Annulla</button>';
  if (!g.dest[0] || (due && !g.dest[1])) { box.innerHTML = `<p class="muto">Scegli ${due ? 'le due mete' : 'la meta'}: il gioco calcola orari, turni degli equipaggi, rotte da aprire e slot.</p>`; g.ris = null; return; }
  const r = g.ris = SIM.rotazioneGuidata(G, g.aeId, { tipo: g.tipo, dest: g.dest, giri: +g.giri, base: g.base });
  if (r.errore) { box.innerHTML = `<ul class="problemi"><li class="errore">✖ ${h(r.errore)}</li></ul>`; return; }
  const ae = G.aerei.find(a => a.id === g.aeId), giorni = r.prog.giorni, gruppi = [];
  giorni.forEach((x, i) => { const t = x.scali.length > 1 ? `${x.inizio} · ${x.scali.join(' → ')}` : `a terra a ${x.scali[0]}`; const u = gruppi.at(-1); if (u && u.t === t) u.a = i; else gruppi.push({ da: i, a: i, t }); });
  const nomeG = x => x.da === x.a ? GS3[x.da] : `${GS3[x.da]}–${GS3[x.a]}`;
  box.innerHTML = `<div class="guida-ris">
      <p class="guida-descr">${h(r.descr)}</p>
      <ul class="guida-giorni">${gruppi.map(x => `<li><b>${nomeG(x)}</b><span class="mono">${h(x.t)}</span></li>`).join('')}</ul>
      <div class="sett-sintesi"><div><small>Voli a settimana</small><b>${r.voliSett}</b></div><div><small>Ore di volo al giorno</small><b>${num(r.oreSett / 7, 1)}</b></div><div><small>Da spendere ora</small><b>${eur(r.costo)}</b></div></div>
      ${r.stime.length ? `<p class="piccolo"><b>Riempimento stimato a rotta avviata</b> (ai prezzi di riferimento):</p><div class="stime">${r.stime.map(s => `<button type="button" data-az="g-giri" data-n="${s.n}" class="${s.n === r.giri ? 'on' : ''} ${s.lf >= 0.72 ? 'buono' : s.lf >= 0.55 ? 'medio' : 'basso'}">${s.n}× <b>${pct(s.lf)}</b></button>`).join('')}</div><p class="nota">Sopra il 70% la rotta di solito guadagna; sotto il 55% voli mezzi vuoti. Tocca un numero per provarlo.</p>` : ''}
      <ul class="problemi">
        ${r.nuove.length ? `<li class="avviso">Apre ${r.nuove.length === 1 ? 'la rotta' : 'le rotte'} ${r.nuove.map(k => k.replace('-', '–')).join(', ')} · ${eur(r.nuove.length * 30000)}</li>` : ''}
        ${r.slot.map(s => `<li class="avviso">Compra ${s.n} slot a ${s.i} · ${eur(s.costo)}</li>`).join('')}
        ${r.W.map(w => `<li class="avviso">▲ ${h(w)}</li>`).join('')}
        ${!r.nuove.length && !r.slot.length && !r.W.length ? '<li class="ok">✓ Rotte già aperte, slot sufficienti, turni nei limiti</li>' : ''}
      </ul>
      ${G.auto?.equipaggi ? '<p class="nota">Se mancano equipaggi il pilota automatico li assume stanotte.</p>' : ''}
    </div>`;
  const prog = ae.prog.giorni.some(x => x.scali.length > 1);
  piede.innerHTML = `<button data-az="chiudi">Annulla</button><button data-az="g-editor">Modifica prima di salvare</button><button class="primario" data-az="g-applica" ${G.cassa < r.costo ? 'disabled' : ''}>${r.costo ? `Apri e salva · ${eur(r.costo)}` : 'Salva rotazione'}</button>${prog ? '<span class="piccolo muto" style="flex-basis:100%;text-align:right">Sostituisce il programma attuale dell’aereo</span>' : ''}`;
}
