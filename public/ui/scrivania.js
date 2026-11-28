'use strict';
// AvioGest — Riorganizzazione: meno pagine (con sottoschede), Scrivania con le decisioni da prendere,
// notizie per categoria e pausa scelta categoria per categoria, spiegazione dei numeri,
// pagina dei prezzi di rotta con simulatore, vendita degli aerei

/* ---------- Aree e pagine: le pagine simili diventano sottoschede ---------- */
const SOTTO = {
  notizie: [['notizie', 'Notizie'], ['giornale', 'Giornale']],
  aeroporti: [['aeroporti', 'Aeroporti e slot'], ['hub', 'Hub']],
  prodotto: [['prodotto', 'Bordo e tariffe'], ['fedelta', 'Fedeltà e passeggeri'], ['marketing', 'Marketing']],
  mercati: [['mercati', 'Ricerche'], ['accordi', 'Accordi'], ['ricavi', 'Ricavi']],
  direzione: [['direzione', 'Direzione'], ['proprieta', 'Soci e CdA'], ['gruppo', 'Gruppo']],
  finanze: [['finanze', 'Finanze e borsa'], ['obiettivi', 'Obiettivi'], ['sostenibilita', 'Sostenibilità']],
  impostazioni: [['impostazioni', 'Impostazioni'], ['guida', 'Guida']]
};
const PADRE = {}; for (const [p, l] of Object.entries(SOTTO)) for (const [s] of l) PADRE[s] = p;
AREE.splice(0, AREE.length,
  { id: 'oggi', nome: 'Oggi', pagine: [['panoramica', 'Scrivania'], ['voli', 'Voli'], ['notizie', 'Notizie']] },
  { id: 'rete', nome: 'Rete', pagine: [['programmazione', 'Programmazione'], ['rotte', 'Rotte e prezzi'], ['aeroporti', 'Aeroporti'], ['operazioni', 'Operazioni']], extra: ['rotta', 'aeroporto', 'tariffe'] },
  { id: 'commerciale', nome: 'Commerciale', pagine: [['prodotto', 'Prodotto'], ['mercati', 'Mercati'], ['concorrenza', 'Concorrenza']] },
  { id: 'flotta', nome: 'Flotta', pagine: [['flotta', 'Aerei'], ['mercato', 'Mercato aerei'], ['personale', 'Equipaggi']], extra: ['aereo'] },
  { id: 'azienda', nome: 'Azienda', pagine: [['direzione', 'Direzione'], ['finanze', 'Finanze'], ['istituzioni', 'Governo e tribunali'], ['impostazioni', 'Impostazioni']] }
);
for (const a of AREE) { a.extra ||= []; for (const [p] of a.pagine) for (const [s] of SOTTO[p] || []) if (s !== p) a.extra.push(s); }
schedeArea = function () {
  const a = areaDi(pagina), attiva = PADRE[pagina] || pagina;
  return `<div class="schede-area" role="navigation" aria-label="${a.nome}">${a.pagine.map(([v, t]) => { const n = badgePagina(v);
    return `<a href="#/${v}" class="${v === attiva ? 'on' : ''}" ${v === attiva ? 'aria-current="page"' : ''}>${t}${n ? `<i class="badge-n">${n}</i>` : ''}</a>`; }).join('')}</div>`;
};
function badgePagina(v) {
  if (!G) return 0;
  const dd = SIM.daDecidere(G);
  if (v === 'panoramica') return dd.length;
  const dove = { direzione: ['direzione', 'proprieta', 'gruppo'], istituzioni: ['istituzioni'], flotta: ['flotta'], personale: ['personale'] }[v];
  return dove ? dd.filter(x => dove.includes((x.vai || '').split('/')[0]) || (v === 'flotta' && (x.vai || '').startsWith('aereo'))).length : 0;
}
badgeArea = id => { if (!G) return 0; const a = AREE.find(x => x.id === id), dd = SIM.daDecidere(G); return dd.filter(x => { const p = (x.vai || '').split('/')[0]; return p && (a.pagine.some(q => q[0] === p || PADRE[p] === q[0]) || a.extra.includes(p)); }).length; };
function barraSotto(v) {
  const p = PADRE[v]; if (!p) return '';
  return `<div class="sottoschede segmenti">${SOTTO[p].map(([s, t]) => `<a href="#/${s}" class="${s === v ? 'on' : ''}">${t}</a>`).join('')}</div>`;
}

/* ---------- Scrivania: decisioni da prendere, perché guadagni o perdi, settimana scorsa ---------- */
const CAT = () => SIM.CATEGORIE;
function bottoneDecisione(x) { return x.az ? `<button class="piccolo primario" data-az="${x.az}">Decidi</button>` : `<a class="btn piccolo primario" href="#/${x.vai}">Apri</a>`; }
function pannelloDecisioni() {
  const L = SIM.daDecidere(G);
  if (!L.length) return `<div class="pannello scrivania ok"><h2>Da decidere</h2><p class="muto piccolo">Niente in sospeso: puoi far correre il tempo.</p></div>`;
  return `<div class="pannello scrivania"><h2>Da decidere <span class="badge b-warn">${L.length}</span></h2><ul class="decisioni">${L.map(x => `<li><span class="dec-icona" aria-hidden="true">${CAT()[x.cat]?.icona || '📌'}</span><div><b>${h(x.titolo)}</b><small>${h(x.testo)}${x.scade ? ` · <span class="${x.scade - G.ora < 2 * GIORNO ? 'neg' : ''}">scade tra ${giorniA(x.scade)} gg</span>` : ''}</small></div>${bottoneDecisione(x)}</li>`).join('')}</ul></div>`;
}
function pannelloPerche() {
  const S = SIM.spiegaUtile(G, 7); if (!S.frasi.length) return '';
  const max = Math.max(1, ...S.voci.map(v => v.c));
  return `<div class="pannello"><h2>Perché guadagni o perdi</h2><ul class="perche">${S.frasi.map(f => `<li>${h(f)}</li>`).join('')}</ul>
    <details><summary class="piccolo">Dove vanno i soldi ogni giorno (media 7 giorni)</summary><div class="voci">${S.voci.slice(0, 10).map(v => `<div class="voce"><span>${h(v.nome)}</span><div class="traccia"><div class="riemp" style="width:${v.c / max * 100}%"></div></div><b>${eur(v.c)}</b></div>`).join('')}</div></details></div>`;
}
function cartaResoconto(R, compatta) {
  return `<div class="pannello resoconto"><div class="riga" style="margin:0"><h2 style="margin:0">Settimana fino al ${fmtGiorno(R.t - GIORNO)}</h2><b class="${R.utile < 0 ? 'neg' : 'pos'}">${eur(R.utile)}</b></div>
    <div class="kpi mini"><div><small>Passeggeri</small><b>${num(R.pax)}</b></div><div><small>Riempimento</small><b>${pct(R.lf)}</b></div><div><small>Puntualità</small><b>${pct(R.puntualita)}</b></div><div><small>Cancellati</small><b>${R.canc}</b></div></div>
    ${R.utilePrima != null ? `<p class="piccolo">Rispetto alla settimana prima: <b class="${R.utile >= R.utilePrima ? 'pos' : 'neg'}">${R.utile >= R.utilePrima ? '+' : ''}${eur(R.utile - R.utilePrima)}</b></p>` : ''}
    ${compatta ? '' : `${R.migliori.length ? `<p class="piccolo">Rotte migliori: ${R.migliori.map(x => `${linkRotta(x.k)} ${eur(x.utile)}`).join(' · ')}</p>` : ''}${R.peggiori.length ? `<p class="piccolo">In perdita: ${R.peggiori.map(x => `${linkRotta(x.k)} <span class="neg">${eur(x.utile)}</span>`).join(' · ')}</p>` : ''}${R.spiega?.length ? `<ul class="perche piccolo">${R.spiega.map(f => `<li>${h(f)}</li>`).join('')}</ul>` : ''}`}</div>`;
}
const _panoramica = VISTE.panoramica;
VISTE.panoramica = (...a) => {
  // i banner delle singole decisioni diventano la lista "Da decidere"
  const salvati = [bannerEmergenza, bannerDilemma, bannerTrattativa, bannerRiunione];
  bannerEmergenza = bannerDilemma = bannerTrattativa = bannerRiunione = () => '';
  let corpo; try { corpo = _panoramica(...a); } finally { [bannerEmergenza, bannerDilemma, bannerTrattativa, bannerRiunione] = salvati; }
  const i = corpo.indexOf('</div>') + 6, R = (G.resoconti || [])[0];
  return corpo.slice(0, i) + pannelloDecisioni() + `<div class="griglia g2">${pannelloPerche()}${R ? cartaResoconto(R, true) : ''}</div>` + corpo.slice(i);
};

/* ---------- Notizie per categoria e resoconti ---------- */
VISTE.notizie = () => {
  for (const n of G.notizie) n.cat ||= SIM.categoria(G, n.testo);
  const f = UI.catNotizie || 'tutte', lette = G.lette || 0;
  const conta = {}; for (const n of G.notizie) conta[n.cat || 'altro'] = (conta[n.cat || 'altro'] || 0) + 1;
  const l = G.notizie.filter(n => f === 'tutte' || (f === 'importanti' ? n.imp : (n.cat || 'altro') === f)).slice(0, 120);
  const out = `<div class="testata"><h1>Notizie</h1><span class="sotto">${G.notizie.length} notizie · ${(G.resoconti || []).length} resoconti settimanali</span></div>
  <div class="filtri-cat">${[['tutte', 'Tutte', '📰'], ['importanti', 'Importanti', '⭐'], ...Object.entries(CAT()).filter(([k]) => conta[k]).map(([k, c]) => [k, c.nome, c.icona])].map(([k, t, i]) => `<button class="piccolo ${k === f ? 'on' : ''}" data-az="cat-notizie" data-c="${k}">${i} ${t}${conta[k] ? ` <small>${conta[k]}</small>` : ''}</button>`).join('')}</div>
  <div class="pannello"><ul class="notizie">${l.length ? l.map(x => `<li class="${x.tipo}${x.t > lette ? ' nuova' : ''}"><span aria-hidden="true">${CAT()[x.cat || 'altro']?.icona || '📰'}</span> ${h(x.testo)}<small>${fmtGiorno(x.t)} ${fmtOra(x.t)}</small></li>`).join('') : '<li class="muto">Nessuna notizia in questa categoria</li>'}</ul></div>
  ${(G.resoconti || []).length ? `<h2 class="mt">Resoconti settimanali</h2><div class="carte">${G.resoconti.map(R => cartaResoconto(R)).join('')}</div>` : ''}`;
  G.lette = G.ora; setTimeout(aggiornaCampanella, 0);
  return out;
};
apriNotifiche = () => { location.hash = '#/notizie'; };

/* ---------- Pausa automatica categoria per categoria ---------- */
const PAUSA_DEF = { decisioni: true, emergenze: true };
const pausaCat = c => { const P = G.pausa || PAUSA_DEF; return !!P[c]; };
const _novita = gestisciNovita;
gestisciNovita = function () {
  if (!G) return _novita();
  const nuove = (G._nuove || []).slice(), pa = UI.pausaAuto; UI.pausaAuto = false;
  try { _novita(); } finally { UI.pausaAuto = pa; }
  if (!G) return;
  let ferma = nuove.some(n => n.imp && n.cat && n.cat !== 'emergenze' && pausaCat(n.cat));
  // nuove decisioni da prendere
  const dd = SIM.daDecidere(G), visti = UI.ddVisti ||= new Set(), nuoveD = dd.filter(x => !visti.has(x.id));
  for (const x of dd) visti.add(x.id);
  if (UI.ddPronto && nuoveD.length) { toast(`📋 Da decidere: ${nuoveD[0].titolo}${nuoveD.length > 1 ? ` (e altre ${nuoveD.length - 1})` : ''}`, 'evento'); if (pausaCat('decisioni')) ferma = true; }
  UI.ddPronto = true;
  if (ferma && vel) { vel = 0; aggiornaVel(); }
  aggiornaNav();
};
function pannelloPausa() {
  const P = G.pausa || PAUSA_DEF, voce = (k, t, d) => `<label class="interruttore"><input type="checkbox" data-pausa="${k}" ${P[k] ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>${t}</b><small>${d}</small></span></label>`;
  return `<div class="pannello"><h2>Quando fermare il tempo</h2>
    ${voce('decisioni', '📋 Decisioni da prendere', 'Riunioni, cause, bandi, offerte, assemblee, trattative: tutto ciò che ha una scadenza.')}
    ${voce('emergenze', '🚨 Emergenze', 'Nubi di cenere, spazi aerei chiusi, epidemie.')}
    ${Object.entries(SIM.CATEGORIE).filter(([k]) => !['emergenze', 'altro'].includes(k)).map(([k, c]) => voce(k, `${c.icona} Notizie importanti: ${c.nome.toLowerCase()}`, 'Il tempo si ferma anche per gli avvisi importanti di questa categoria.')).join('')}
    <p class="nota">Tutte le notizie restano comunque in Oggi → Notizie, divise per categoria.</p></div>`;
}
const _impostazioni = VISTE.impostazioni;
VISTE.impostazioni = (...a) => { const html = _impostazioni(...a), i = html.indexOf('<div class="pannello">'); return i < 0 ? html + pannelloPausa() : html.slice(0, i) + pannelloPausa() + html.slice(i); };

/* ---------- Utile di ieri: da dove viene ---------- */
function apriUtileIeri() {
  const x = G.storico.at(-1); if (!x) return toast('Nessun giorno concluso ancora', '');
  const voci = Object.entries(x.dettaglio || {}).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  modale({ titolo: `Il conto di ieri (${x.data})`, corpo: `<table class="bilancio"><tbody>
    <tr class="tot"><td>Ricavi</td><td class="num">${eur(x.ricavi)}</td></tr>
    ${voci.map(([v, c]) => `<tr><td class="rientro">${h(SIM.NOMI_VOCI[v] || v)}</td><td class="num neg">−${eur(c)}</td></tr>`).join('')}
    <tr class="tot"><td>Utile</td><td class="num ${x.utile < 0 ? 'neg' : 'pos'}">${eur(x.utile)}</td></tr></tbody></table>
    <p class="piccolo">${num(x.pax)} passeggeri su ${x.voli} voli · riempimento ${pct(x.posti ? x.pax / x.posti : 0)}${x.canc ? ` · ${x.canc} cancellati` : ''}</p>
    <ul class="perche piccolo">${SIM.spiegaUtile(G, 7).frasi.slice(0, 4).map(f => `<li>${h(f)}</li>`).join('')}</ul>` });
}
document.addEventListener('click', e => { if (G && e.target.closest('#cUtile')) apriUtileIeri(); });

/* ---------- Pagina prezzi e tariffe di una rotta ---------- */
const PERC = (da, a, passo = 5) => { const l = []; for (let v = da; v <= a + 1e-9; v += passo) l.push([String(+(v / 100).toFixed(2)), `${v}%`]); return l; };
const selTar = (campo, valore, lista, extra = '') => `<select data-tar="${campo}" ${extra}>${opzioni(lista, String(+(+valore).toFixed(2)))}</select>`;
VISTE.tariffe = () => {
  const k = UI.arg || ''; const r = G.rotte[k]; if (!r) return '<p class="vuoto">Rotta non trovata.</p>';
  const T = SIM.tar(G, k), [a, b] = k.split('-'), d = SIM.km(a, b), ref = SIM.prezzoRif(d), cl = UI.clTar || 'Y';
  const sim = SIM.simulaRotta(G, k), sp = SIM.spiegaRotta(G, k), cf = sp.cf, curva = sim && !sim.vuota ? SIM.curvaPrezzo(G, k, cl) : [];
  const best = curva.length ? curva.reduce((x, y) => y.utile > x.utile ? y : x) : null, maxU = Math.max(1, ...curva.map(x => Math.max(0, x.utile)));
  const pY = r.pY, giorni = SIM.GIORNI_N;
  return `<div class="testata"><h1>Prezzi ${a}–${b}</h1><span class="sotto">${h(citta(a))}–${h(citta(b))} · ${num(d)} km · <a href="#/rotta/${k}">scheda della rotta</a></span></div>
  <div class="pannello"><h2>Come va questa rotta</h2><ul class="perche">${sp.frasi.map(f => `<li>${h(f)}</li>`).join('')}</ul></div>

  <div class="pannello mt"><h2>1 · Prezzo base per classe</h2>
    <div class="griglia g3">${CL.map(c => `<label>${CLS[c].nome}<input class="prezzo" type="number" min="10" step="1" value="${r['p' + c]}" data-prezzo="${k}" data-cl="${c}"><small class="muto">riferimento ${eur(ref * SIM.multClasse(c, d))}</small></label>`).join('')}</div>
    <p class="nota">È il prezzo della fascia Base. Tutto il resto (fasce, anticipo, giorni, orari, stagioni) lo moltiplica.</p></div>

  <div class="pannello mt"><h2>2 · Simulatore · prossimi 7 giorni</h2>
    ${sim && !sim.vuota ? `<div class="kpi mini"><div><small>Passeggeri</small><b>${num(sim.tot.pax)}</b></div><div><small>Riempimento</small><b>${pct(sim.tot.lf)}</b></div><div><small>Ricavi</small><b>${mln(sim.tot.ricavi)}</b></div><div><small>Utile stimato</small><b class="${sim.tot.utile < 0 ? 'neg' : 'pos'}">${mln(sim.tot.utile)}</b></div></div>
      <div class="segmenti" style="margin:10px 0">${CL.map(c => `<button data-az="cl-tar" data-c="${c}" class="${c === cl ? 'on' : ''}">${CLS[c].nome}</button>`).join('')}</div>
      <div class="curva">${curva.map(x => `<button class="${Math.abs(x.m - 1) < 1e-6 ? 'attuale' : ''} ${x === best ? 'migliore' : ''}" data-az="applica-tar" data-k="${k}" data-c="${cl}" data-p="${x.p}" title="Applica ${eur(x.p)}"><span style="height:${Math.max(3, Math.max(0, x.utile) / maxU * 100)}%"></span><i>${eur(x.p)}</i><em>${pct(x.lf)}</em></button>`).join('')}</div>
      <p class="piccolo">Barre = utile stimato della settimana a ogni prezzo ${CLS[cl].nome} (sotto: prezzo e riempimento). ${best ? `Il migliore è <b>${eur(best.p)}</b> (${mln(best.utile)} di utile, aerei pieni al ${pct(best.lf)}).` : ''} Tocca una barra per applicare quel prezzo.</p>
      <p class="nota">Stima con i tuoi programmi, i prezzi dei concorrenti e la domanda della stagione (±10%). Esclusi i passeggeri in coincidenza negli hub.</p>`
    : '<p class="muto">Nessun aereo vola su questa rotta: programmalo per vedere le stime.</p>'}</div>

  <div class="pannello mt"><h2>3 · Fasce tariffarie</h2>
    <div class="griglia g3">
      <label>Promo (bagaglio a pagamento, niente cambi)${selTar('promo', T.promo, PERC(50, 95), `data-k="${k}"`)}<small class="muto">${CL.map(c => `${CLS[c].breve} ${eur(r['p' + c] * T.promo)}`).join(' · ')}</small></label>
      <label>Flex (cambi gratis, rimborsabile)${selTar('flex', T.flex, PERC(100, 200, 10), `data-k="${k}"`)}<small class="muto">${CL.map(c => `${CLS[c].breve} ${eur(r['p' + c] * T.flex)}`).join(' · ')}</small></label>
      <label>Posti in promozione${selTar('quotaPromo', T.promoAuto ? 'auto' : T.quotaPromo, [['auto', 'Automatico (revenue management)'], ...PERC(0, 60)], `data-k="${k}"`)}<small class="muto">oggi ${pct(SIM.quotaPromoRotta(G, k))} dei posti Economy</small></label>
    </div>
    <p class="nota">Le promo portano clienti attenti al prezzo che altrimenti non volerebbero; il Flex lo compra chi viaggia per lavoro. Con l’automatico i posti in promo calano quando gli aerei si riempiono.</p></div>

  <div class="pannello mt"><h2>4 · Anticipo di prenotazione</h2>
    <div class="filtri">${Object.entries(SIM.CURVE).map(([c, x]) => `<button class="piccolo ${T.anticipo.join() === x.v.join() ? 'on primario' : ''}" data-az="curva-tar" data-k="${k}" data-c="${c}">${x.nome}</button>`).join('')}</div>
    <div class="griglia g5">${SIM.FINESTRE.map((f, i) => `<label>${f}${selTar('anticipo', T.anticipo[i], PERC(50, 200), `data-k="${k}" data-i="${i}"`)}<small class="muto">Y ${eur(pY * T.anticipo[i])}</small></label>`).join('')}</div>
    <p class="nota">Chi va in vacanza prenota presto e cerca il prezzo basso; chi viaggia per lavoro prenota tardi e paga. Una curva che sale verso la partenza incassa di più dagli ultimi arrivati.</p></div>

  <div class="pannello mt"><h2>5 · Calendario</h2>
    <h3>Giorno della settimana</h3><div class="griglia g7">${giorni.map((g, i) => `<label>${g}${selTar('giorno', T.giorni[i], PERC(60, 160), `data-k="${k}" data-i="${i}"`)}</label>`).join('')}</div>
    <h3>Fascia oraria di partenza</h3><div class="griglia g4">${Object.entries(SIM.FASCE_ORA).map(([f, t]) => `<label>${t}${selTar('orario', T.orari[f], PERC(60, 160), `data-k="${k}" data-f="${f}"`)}</label>`).join('')}</div>
    <h3>Stagione</h3><div class="griglia g2"><label>Alta stagione (giugno–agosto, mete turistiche)${selTar('alta', T.alta, PERC(60, 180), `data-k="${k}"`)}</label><label>Bassa stagione (novembre, gennaio, febbraio)${selTar('bassa', T.bassa, PERC(60, 180), `data-k="${k}"`)}</label></div>
    <p class="nota">Esempio: venerdì e domenica sera sono i voli più richiesti, il martedì a mezzogiorno il meno. Alzare dove c’è domanda e scontare dove manca riempie gli aerei in modo uniforme.</p></div>

  <div class="pannello mt"><h2>6 · Concorrenza su questa rotta</h2>
    <div class="tab-wrap"><table><thead><tr><th>Compagnia</th><th class="num">Economy</th><th class="num">Voli/giorno</th><th>Quota</th></tr></thead><tbody>
      <tr><td><b>${h(G.nome)}</b></td><td class="num">${eur(cf.tu.prezzoY)}</td><td class="num">${(+cf.tu.freq).toFixed(1).replace('.', ',')}</td><td>${barretta(cf.tu.quota, null, [2, 2])}</td></tr>
      ${cf.rivali.map(x => `<tr><td><span class="pallino" style="background:${x.colore}"></span>${h(x.nome)}${x.guerra ? ' <span class="badge b-err">sconti</span>' : ''}</td><td class="num ${x.prezzoY < cf.tu.prezzoY ? 'pos' : ''}">${eur(x.prezzoY)}</td><td class="num">${x.freq}</td><td>${barretta(x.quota, null, [2, 2])}</td></tr>`).join('')}
      <tr><td class="muto">Treni, auto e altre compagnie</td><td></td><td></td><td>${barretta(cf.altri, null, [2, 2])}</td></tr></tbody></table></div>
    <p class="nota">Prezzo di riferimento del mercato in Economy: ${eur(cf.ref)}. Contano anche reputazione e frequenza: più voli al giorno attirano più clienti.</p></div>

  <div class="pannello mt"><h2>7 · Regole automatiche</h2>
    ${[0, 1].map(i => { const R0 = T.regole[i] || { cond: i ? 'lf<' : 'lf>', soglia: i ? 0.55 : 0.85, delta: 0 };
      return `<div class="regola"><span>Ogni lunedì, se il riempimento della settimana è</span>${selTar('rcond', R0.cond, [['lf>', 'sopra'], ['lf<', 'sotto']], `data-k="${k}" data-i="${i}"`)}${selTar('rsoglia', R0.soglia, PERC(30, 95), `data-k="${k}" data-i="${i}"`)}<span>cambia tutti i prezzi del</span>${selTar('rdelta', R0.delta, [['0', 'regola spenta'], ['-0.1', '−10%'], ['-0.05', '−5%'], ['-0.03', '−3%'], ['0.03', '+3%'], ['0.05', '+5%'], ['0.1', '+10%']], `data-k="${k}" data-i="${i}"`)}</div>`; }).join('')}
    <div class="griglia g2"><label>Mai sotto il${selTar('min', T.min, PERC(30, 100, 10), `data-k="${k}"`)}<small class="muto">del prezzo di riferimento</small></label><label>Mai sopra il${selTar('max', T.max, PERC(100, 400, 25), `data-k="${k}"`)}<small class="muto">del prezzo di riferimento</small></label></div>
    ${(r.storia || []).length ? `<h3>Ultime settimane</h3><div class="tab-wrap"><table><thead><tr><th>Settimana</th><th class="num">Economy</th><th class="num">Riempimento</th><th class="num">Utile</th></tr></thead><tbody>${r.storia.slice(-8).reverse().map(x => `<tr><td>${fmtGiorno(x.t)}</td><td class="num">${eur(x.pY)}</td><td class="num">${x.lf == null ? '—' : pct(x.lf)}</td><td class="num ${x.utile < 0 ? 'neg' : ''}">${x.utile == null ? '—' : eur(x.utile)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="nota">Le regole ritoccano i prezzi base una volta a settimana e ricevi una notizia ogni volta. Con la prima regola su "+5%" e la seconda su "−5%" la rotta si regola da sola.</p></div>`;
};
// la scheda rotta: perché guadagna o perde e collegamento ai prezzi
const _rottaScheda = VISTE.rotta;
VISTE.rotta = (...a) => {
  const html = _rottaScheda(...a), k = UI.arg || ''; if (!G.rotte[k]) return html;
  const sp = SIM.spiegaRotta(G, k), i = html.indexOf('</div>') + 6;
  return html.slice(0, i) + `<div class="pannello"><div class="riga" style="margin:0 0 6px"><h2 style="margin:0">Come va questa rotta</h2><a class="btn primario piccolo" href="#/tariffe/${k}">Prezzi e tariffe</a></div><ul class="perche">${sp.frasi.map(f => `<li>${h(f)}</li>`).join('')}</ul></div>` + html.slice(i);
};

/* ---------- Vendere gli aerei ---------- */
function pannelloVendita(ae) {
  const V = ae.inVendita, C = ae.cessione, prop = ae.modo === 'proprieta';
  if (C) return `<div class="pannello mt evidenza"><h2>Venduto</h2><p>Passa a <b>${h(C.chi)}</b> il ${fmtGiorno(C.t)}: ${C.prezzo >= 0 ? `incasserai ${eur(C.prezzo)}` : `pagherai ${eur(-C.prezzo)}`}. Fino ad allora continua a volare.</p></div>`;
  return `<div class="pannello mt"><h2>${prop ? 'Vendere l’aereo' : 'Liberarsi del leasing'}</h2>
    ${V ? `<p class="piccolo">Sul mercato dal ${fmtGiorno(V.dal)}. ${V.offerte.length ? 'Offerte ricevute:' : 'Aspetta: le offerte arrivano nei prossimi giorni (riceverai una notizia).'}</p>
      ${V.offerte.length ? `<ul class="decisioni">${V.offerte.map(o => `<li><span class="dec-icona" aria-hidden="true">🤝</span><div><b>${h(o.chi)}</b><small>${prop ? `offre ${eur(o.prezzo)} (${pct(o.prezzo / ae.valore)} del valore)` : o.prezzo >= 0 ? `subentra e ti paga ${eur(o.prezzo)}` : `subentra se gli dai ${eur(-o.prezzo)}`} · consegna in ${o.consegna} gg · scade tra ${giorniA(o.scade)} gg</small></div><button class="piccolo primario" data-az="accetta-off-aereo" data-id="${ae.id}" data-o="${o.id}">Accetta</button></li>`).join('')}</ul>` : ''}
      <div class="filtri"><button class="piccolo" data-az="ritira-vendita" data-id="${ae.id}">Ritira dal mercato</button></div>`
    : `<div class="opzioni-dilemma">
      <button data-az="metti-vendita" data-id="${ae.id}"><b>${prop ? 'Metti in vendita' : 'Cedi il leasing a un’altra compagnia'}</b><small>${prop ? 'Arrivano offerte da broker e compagnie: prezzi diversi e consegna in qualche giorno, intanto l’aereo vola.' : 'Un’altra compagnia subentra nel contratto: a volte ti paga, a volte chiede un incentivo. Spesso costa meno della restituzione.'}</small></button>
      ${prop ? `<button data-az="leaseback" data-id="${ae.id}"><b>Vendi e riprendi in leasing</b><small>Incassi subito ${eur(ae.valore * 0.97)} e continui a usarlo per 8 anni pagando un canone di circa ${eur(Math.round(MOD[ae.modello].leasing * (ae.valore / MOD[ae.modello].prezzo) * 1.1 / 10) * 10)} al giorno.</small></button>` : ''}
      <button data-az="vendi" data-id="${ae.id}"><b>${prop ? `Vendita immediata · ${eur(ae.valore * 0.92)}` : `Restituisci subito · penale ${eur(SIM.costoRestituzione(G, ae))}`}</b><small>${prop ? 'A un broker, oggi stesso, al 92% del valore.' : 'Il contratto si chiude oggi.'}</small></button></div>`}</div>`;
}
const _vistaAereo = VISTE.aereo;
VISTE.aereo = (...a) => { const html = _vistaAereo(...a), ae = G.aerei.find(x => x.id === UI.arg); return ae ? html + pannelloVendita(ae) : html; };
const _righeFlotta = righeFlottaAvanzata;
righeFlottaAvanzata = ae => (ae.cessione ? `<p class="piccolo"><span class="badge b-warn">venduto</span> passa a ${h(ae.cessione.chi)} il ${fmtGiorno(ae.cessione.t)}</p>` : ae.inVendita ? `<p class="piccolo"><span class="badge b-info">sul mercato</span> ${ae.inVendita.offerte.length} offerte · <a href="#/aereo/${ae.id}">vedi</a></p>` : '') + _righeFlotta(ae);

/* ---------- Azioni ---------- */
Object.assign(AZ, {
  'cat-notizie': el => { UI.catNotizie = el.dataset.c; render(); },
  'cl-tar': el => { UI.clTar = el.dataset.c; render(); },
  'applica-tar': el => { if (esito(SIM.A.prezzi(G, el.dataset.k, { ['p' + el.dataset.c]: +el.dataset.p }))) render(); },
  'curva-tar': el => { if (esito(SIM.A.tariffa(G, el.dataset.k, { curva: el.dataset.c }))) render(); },
  'metti-vendita': el => { if (esito(SIM.A.mettiInVendita(G, el.dataset.id))) render(); },
  'ritira-vendita': el => { if (esito(SIM.A.ritiraVendita(G, el.dataset.id))) render(); },
  'accetta-off-aereo': el => { const ae = G.aerei.find(a => a.id === el.dataset.id), o = ae.inVendita.offerte.find(x => x.id === el.dataset.o);
    conferma(`Accettare l’offerta di ${o.chi}?`, `${ae.marche} vola fino alla consegna, tra ${o.consegna} giorni; poi ${o.prezzo >= 0 ? `incassi ${eur(o.prezzo)}` : `paghi ${eur(-o.prezzo)}`} e l’aereo esce dalla flotta. Ricordati di sostituirlo nei programmi.`, 'Accetta', () => { if (esito(SIM.A.accettaOffertaAereo(G, ae.id, o.id))) dopoAzione(); }); },
  leaseback: el => { const ae = G.aerei.find(a => a.id === el.dataset.id); conferma('Vendere e riprendere in leasing?', `Incassi ${eur(ae.valore * 0.97)} oggi; ${ae.marche} resta nella flotta ma diventa in leasing per 8 anni, con un canone giornaliero.`, 'Procedi', () => { if (esito(SIM.A.leaseback(G, ae.id))) render(); }); }
});
// fasce, anticipo, calendario e regole: ogni menu salva subito e ridisegna la pagina
document.addEventListener('change', e => {
  const el = e.target; if (!G || !el.dataset || !el.dataset.tar) return;
  const k = el.dataset.k, v = el.value, f = el.dataset.tar, i = +el.dataset.i, x = {};
  if (f === 'quotaPromo') { if (v === 'auto') x.promoAuto = true; else x.quotaPromo = +v; }
  else if (f === 'anticipo') x.anticipo = [i, +v];
  else if (f === 'giorno') x.giorno = [i, +v];
  else if (f === 'orario') x.orario = [el.dataset.f, +v];
  else if (f === 'rcond' || f === 'rsoglia' || f === 'rdelta') {
    const T = SIM.tar(G, k), regole = [0, 1].map(j => ({ ...(T.regole[j] || { cond: j ? 'lf<' : 'lf>', soglia: j ? 0.55 : 0.85, delta: 0 }) }));
    regole[i][{ rcond: 'cond', rsoglia: 'soglia', rdelta: 'delta' }[f]] = f === 'rcond' ? v : +v; x.regole = regole;
  } else x[f] = +v;
  if (esito(SIM.A.tariffa(G, k, x))) render();
});
document.addEventListener('change', e => { const el = e.target; if (G && el.dataset && el.dataset.pausa) { G.pausa = { ...(G.pausa || PAUSA_DEF), [el.dataset.pausa]: el.checked }; } });

// in fondo: le sottoschede valgono anche per le viste ridefinite qui sopra
for (const l of Object.values(SOTTO)) for (const [s] of l) { const orig = VISTE[s]; if (orig) VISTE[s] = (...a) => barraSotto(s) + orig(...a); }
