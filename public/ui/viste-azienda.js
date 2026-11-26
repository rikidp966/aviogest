'use strict';
// AvioGest — Mercato aerei, Personale, Aeroporti, Finanze, Concorrenza, Obiettivi

VISTE.mercato = () => `
  <div class="testata"><h1>Mercato aerei</h1><span class="sotto">Cassa ${eur(G.cassa)}</span><span class="spazio"></span>
    <div class="segmenti"><button data-az="tab-mercato" data-t="nuovi" class="${UI.mercatoTab === 'nuovi' ? 'on' : ''}">Nuovi dal costruttore</button><button data-az="tab-mercato" data-t="usati" class="${UI.mercatoTab === 'usati' ? 'on' : ''}">Usati (${G.mercato.length})</button></div></div>
  <div class="carte">${UI.mercatoTab === 'nuovi' ? Object.entries(MOD).map(([k, m]) => cartaModello(k, m)).join('') : G.mercato.length ? G.mercato.map(cartaUsato).join('') : '<p class="vuoto">Nessuna offerta questa settimana. Il mercato si aggiorna ogni lunedì.</p>'}</div>
  <p class="nota">Al momento dell’ordine scegli la base di consegna e la configurazione della cabina (Business, Premium Economy, Economy). Nuovi: consegna in 30 giorni. Usati: 5 giorni, 9 se rifai la cabina. Il leasing richiede un deposito di 30 giorni di canone.</p>`;
function avvisoPiloti(mod) {
  const t = MOD[mod].tipo, ha = G.equipaggi.some(e => e.tipo === t);
  return ha ? '' : `<p class="piccolo" style="color:var(--warn)">▲ Nessun equipaggio abilitato ${t}: assumilo o riqualificane uno in Personale.</p>`;
}
function cartaModello(k, m) {
  const costoOra = m.consumo * G.carburante + m.manut;
  return `<div class="pannello carta"><div class="titolo">${m.nome}</div><div class="muto">${m.spazio} unità di cabina · abilitazione ${m.tipo}</div>
    <div class="riga"><span>Esempio</span><span>${chipCab(SIM.cabinaStandard(k, 'mista'))}</span></div>
    <div class="riga"><span>Autonomia · velocità</span><span>${num(m.autonomia)} km · ${m.vel} km/h</span></div>
    <div class="riga"><span>Carburante + manutenzione</span><span>${eur(costoOra)}/h</span></div>
    <div class="riga"><span>Prezzo</span><span><b>${mln(m.prezzo)}</b></span></div>
    <div class="riga"><span>Leasing</span><span><b>${eur(m.leasing)}/giorno</b></span></div>
    ${avvisoPiloti(k)}
    <div class="azioni"><button class="piccolo primario" data-az="compra" data-mod="${k}">Configura e ordina…</button></div></div>`;
}
function cartaUsato(o) {
  const m = MOD[o.mod];
  return `<div class="pannello carta"><div class="titolo">${m.nome}</div><div class="muto">${o.eta} anni · ${num(o.ore)} ore di volo</div>
    <div class="riga"><span>Cabina attuale</span><span>${chipCab(o.cab)}</span></div>
    <div class="riga"><span>Prezzo</span><span><b>${mln(o.prezzo)}</b> <span class="muto piccolo">(nuovo ${mln(m.prezzo)})</span></span></div>
    <div class="riga"><span>Leasing</span><span><b>${eur(o.leasing)}/giorno</b></span></div>
    <div class="riga"><span>Manutenzione</span><span>+${Math.round(o.eta * 3)}% rispetto al nuovo</span></div>
    ${avvisoPiloti(o.mod)}
    <div class="azioni"><button class="piccolo primario" data-az="compra-usato" data-id="${o.id}">Configura e acquista…</button></div></div>`;
}
function formAcquisto({ mod, usato }) {
  const m = MOD[mod], o = usato && G.mercato.find(x => x.id === usato), cab = o ? o.cab : SIM.cabinaStandard(mod, 'mista');
  const prezzo = o ? o.prezzo : m.prezzo, leasing = o ? o.leasing : m.leasing;
  configuratore({
    titolo: `${o ? 'Acquista' : 'Ordina'} ${m.nome}${o ? ` usato di ${o.eta} anni` : ''}`, mod, cab,
    info: `<div class="form" style="margin-bottom:14px"><label>Contratto<select id="acqModo">${opzioni([['leasing', `Leasing · ${eur(leasing)}/giorno, deposito ${eur(leasing * 30)}`], ['proprieta', `Acquisto · ${eur(prezzo)}`]], 'leasing')}</select></label>
      <label>Base di consegna<select id="acqBase">${opzioni(G.basi.map(b => [b, `${b} · ${citta(b)}`]), G.basi[0])}</select></label></div>
      ${o ? `<p class="piccolo">Cabina attuale: ${chipCab(o.cab)} — se la cambi: ${eur(60000)} + ${eur(800)} a posto e 4 giorni in più.</p>` : ''}`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-conferma-cab data-az="conferma-acquisto" data-mod="${mod}" ${o ? `data-usato="${o.id}"` : ''}>Conferma</button>`
  });
}

/* Personale: equipaggi con nome */
const TIPI = () => [...new Set(Object.values(MOD).map(m => m.tipo))];
VISTE.personale = () => {
  const cop = SIM.copertura(G), r = SIM.roster(G), costo = SIM.costiFissi(G).personale;
  const attivi = G.equipaggi.filter(e => e.stato === 'attivo'), arrivo = G.equipaggi.filter(e => e.stato !== 'attivo');
  let s = `<div class="testata"><h1>Personale</h1><span class="sotto">${G.equipaggi.length} equipaggi, ${SIM.totPersonale(G)} persone · ${eur(costo)} al giorno. Ogni equipaggio fa al massimo ${SIM.MAX_TURNI} turni e ${SIM.MAX_ORE} ore di volo a settimana, con almeno 12 ore di riposo tra un turno e l’altro.</span><span class="spazio"></span><button class="primario" data-az="nuovo-equipaggio">+ Nuovo equipaggio</button></div>
  <div class="kpi">
    <div><small>Equipaggi operativi</small><b>${attivi.length}</b><span>${arrivo.length ? arrivo.length + ' in arrivo o in formazione' : 'nessuno in arrivo'}</span></div>
    <div><small>Turni coperti</small><b>${cop.turni - cop.scoperte}/${cop.turni}</b><span>questa settimana</span></div>
    <div><small>Ore di volo medie</small><b>${num(cop.oreMedie, 1)} h</b><span>per equipaggio a settimana (max ${SIM.MAX_ORE})</span></div>
    <div><small>Morale</small><b>${Math.round(G.morale)}/100</b><span>${G.morale < 30 ? 'rischio sciopero!' : G.morale < 50 ? 'basso' : 'buono'}</span></div>
  </div>
  ${bannerMancanti()}`;
  for (const b of G.basi) {
    const eqB = G.equipaggi.filter(e => e.base === b), scop = r.scoperte.filter(c => c.base === b);
    s += `<div class="pannello"><div class="testata" style="margin-bottom:8px"><h2 style="margin:0">Base di ${h(citta(b))} (${b})${G.hub.includes(b) ? ' · hub' : ''}</h2><span class="sotto">${eqB.length} equipaggi${scop.length ? ` · <span class="neg">${scop.length} turni scoperti</span>` : ''}</span></div>
      ${eqB.length ? `<div class="tab-wrap"><table><thead><tr><th>Equipaggio</th><th>Abilitazione</th><th>Composizione</th><th class="num">Turni</th><th>Ore di volo</th><th class="num">Paga/giorno</th><th>Stato</th><th></th></tr></thead><tbody>
      ${eqB.map(e => { const x = r.carico.get(e.id) || { turni: 0, min: 0 };
        return `<tr><td><b class="mono">${h(e.nome)}</b> <span class="muto">cpt. ${h(e.capo)}</span></td><td>${e.tipo}</td><td>${e.piloti} piloti + ${e.cabina} cabina</td><td class="num">${x.turni}/${SIM.MAX_TURNI}</td>
        <td>${barretta(x.min / 60 / SIM.MAX_ORE, num(x.min / 60, 1) + ' h', [0.9, 1])}</td><td class="num">${eur(SIM.pagaEquipaggio(e) * G.stipendio)}</td>
        <td>${e.stato === 'attivo' ? (x.turni ? '<span class="badge b-ok">In servizio</span>' : '<span class="badge">Riserva</span>') : `<span class="badge b-info">Dal ${fmtGiorno(e.pronto)}</span> <span class="muto piccolo">${h(e.motivo)}</span>`}</td>
        <td>${G.basi.length > 1 ? `<button class="piccolo" data-az="eq-trasferisci" data-id="${e.id}">Trasferisci</button> ` : ''}<button class="piccolo" data-az="eq-riqualifica" data-id="${e.id}">Riqualifica</button> <button class="piccolo pericolo" data-az="eq-licenzia" data-id="${e.id}">Licenzia</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muto">Nessun equipaggio in questa base.</p>'}
      ${settimanaEquipaggi(b, eqB, r, scop)}</div>`;
  }
  s += `<div class="griglia g2 mt">
    <div class="pannello"><h2>Politiche</h2><div class="form">
      <label>Livello stipendi<select data-az-change="stipendio">${opzioni([[0.9, '90% (risparmio, morale giù)'], [1, '100% (di mercato)'], [1.1, '110% (morale su)'], [1.2, '120% (morale alto)']], G.stipendio)}</select></label>
      <p class="piccolo pieno" style="margin:0">Il servizio di bordo si sceglie classe per classe in <a href="#/prodotto">Bordo e tariffe</a>.</p></div>
      <div class="filtri mt"><button data-az="premio">Distribuisci un premio (${eur(SIM.totPersonale(G) * 1500)})</button></div></div>
    <div class="pannello"><h2>Come funziona</h2><p class="piccolo" style="margin:0">Ogni settimana i turni vengono assegnati agli equipaggi della stessa base e con la stessa abilitazione. Un turno di lungo raggio, o un turno oltre le 13 ore, vuole 3 piloti. Puoi scegliere tu l’equipaggio di un turno dalla Programmazione. I voli di un turno senza equipaggio vengono cancellati. Assunzione normale: 10 giorni; urgente tramite agenzia: 2 giorni, costa 2,5 volte. Licenziare costa 60 giorni di paga e abbassa il morale.</p></div>
  </div>`;
  return s;
};
// Settimana degli equipaggi di una base: una riga per equipaggio, una colonna per giorno
function settimanaEquipaggi(b, eqB, r, scop) {
  const giorno = c => Math.floor((c.inizio % (7 * 1440)) / 1440), ora = c => SIM.oraDaMin((c.inizio + 60) % 1440);
  const cella = c => `<span class="turno-chip" data-tip="${h(`${c.marche} · ${c.percorso.join(' → ')} · ${c.voli} voli · ${num(c.blocco / 60, 1)} h di volo`)}"><b>${ora(c)}</b> ${c.marche.slice(-3)} ${c.percorso.join('-')}</span>`;
  const righe = eqB.filter(e => e.stato === 'attivo').map(e => [e.nome, (r.carico.get(e.id)?.catene || [])]);
  if (scop.length) righe.push(['Scoperti', scop]);
  if (!righe.some(([, l]) => l.length)) return '';
  return `<h3 class="mt" style="font-size:15px">Turni della settimana</h3><div class="tab-wrap"><table class="roster"><thead><tr><th></th>${GS3.map(g => `<th>${g}</th>`).join('')}</tr></thead><tbody>
    ${righe.map(([n, l]) => `<tr class="${n === 'Scoperti' ? 'scoperto' : ''}"><td class="mono"><b>${h(n)}</b></td>${GS3.map((_, d) => `<td>${l.filter(c => giorno(c) === d).map(cella).join('') || '<span class="muto">riposo</span>'}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function formNuovoEquipaggio(pre = {}) {
  const tipiFlotta = [...new Set(flotta().map(a => MOD[a.modello].tipo))], tipo = pre.tipo || tipiFlotta[0] || 'A320';
  modale({ titolo: 'Nuovo equipaggio', corpo: `<div class="form">
      <label>Base<select id="neBase">${opzioni(G.basi.map(b => [b, `${b} · ${citta(b)}`]), pre.base || G.basi[0])}</select></label>
      <label>Abilitazione<select id="neTipo">${opzioni(TIPI().map(t => [t, t + (tipiFlotta.includes(t) ? ' · in flotta' : '')]), tipo)}</select></label>
      <label>Piloti<select id="nePiloti">${opzioni([[2, '2 (comandante e primo ufficiale)'], [3, '3 (lungo raggio e turni oltre 13 ore)']], pre.piloti || 2)}</select></label>
      <label>Persone in cabina<input type="number" id="neCabina" min="1" max="16" value="${pre.cabina || 4}"><span class="aiuto">1 ogni 50 posti dell’aereo più grande che dovrà servire</span></label>
    </div><p class="piccolo mt" id="neCosto"></p>`,
    piede: `<button data-az="chiudi">Annulla</button><button data-az="conferma-ne" data-urg="1">Urgente · 2 giorni</button><button class="primario" data-az="conferma-ne">Assumi · 10 giorni</button>` });
  costoNuovo();
}
function costoNuovo() { const e = { piloti: +$('#nePiloti').value, cabina: +$('#neCabina').value || 1 }; const p = $('#neCosto'); if (p) p.innerHTML = `Costo: <b>${eur(SIM.costoAssunzione(e, false))}</b> (operativo in 10 giorni) oppure <b>${eur(SIM.costoAssunzione(e, true))}</b> urgente (2 giorni). Paga: ${eur(SIM.pagaEquipaggio(e) * G.stipendio)} al giorno.`; }

/* Aeroporti */
VISTE.aeroporti = () => {
  const dep = SIM.partenzePerScalo(G), q = UI.aeroQ.toLowerCase();
  const lista = Object.values(AP).filter(a => !q || `${a.iata} ${a.nome} ${a.citta} ${a.paese}`.toLowerCase().includes(q)).sort((a, b) => (G.basi.includes(b.iata) - G.basi.includes(a.iata)) || ((dep[b.iata] || 0) - (dep[a.iata] || 0)) || a.citta.localeCompare(b.citta));
  return `<div class="testata"><h1>Aeroporti e slot</h1><span class="sotto">Basi: ${G.basi.join(', ')}${G.hub.length ? ' · hub: ' + G.hub.join(', ') : ''}</span></div>
  <div class="filtri"><input type="search" placeholder="Cerca aeroporto…" value="${h(UI.aeroQ)}" id="aeroQ"></div>
  <div class="pannello"><div class="tab-wrap"><table><thead><tr><th>Aeroporto</th><th>Paese</th><th class="num">Bacino</th><th>Turismo</th><th class="num">Tassa/pax</th><th class="num">Tue partenze/g</th><th>Slot</th><th></th></tr></thead><tbody>
    ${lista.map(a => { const base = G.basi.includes(a.iata), hub = G.hub.includes(a.iata), d = dep[a.iata] || 0, s = G.slot[a.iata] || 0;
      return `<tr><td><b>${a.iata}</b> ${h(a.nome)} ${hub ? '<span class="badge b-warn">Hub</span>' : base ? '<span class="badge b-info">Base</span>' : ''}</td><td>${h(a.nomePaese)} <span class="muto piccolo">${fusoTxt(a.fuso)}</span></td><td class="num">${num(a.pop / 1000, 1)} M</td><td>${barretta(a.tur, null, [2, 2])}</td><td class="num">${eur(a.tassa)}</td><td class="num">${d || ''}</td>
      <td>${a.slot ? `<span class="${d > s ? 'neg' : ''}">${s} posseduti</span> <span class="muto piccolo">${eur(a.slotPrezzo)} l’uno</span>` : '<span class="muto">libero</span>'}</td>
      <td>${a.slot ? `<button class="piccolo" data-az="slot" data-i="${a.iata}" data-n="1">+1 slot</button> <button class="piccolo" data-az="slot" data-i="${a.iata}" data-n="4">+4</button> ` : ''}${base ? (hub ? '' : `<button class="piccolo" data-az="apri-hub" data-i="${a.iata}">Rendi hub</button> <button class="piccolo pericolo" data-az="chiudi-base" data-i="${a.iata}">Chiudi base</button>`) : `<button class="piccolo" data-az="apri-base" data-i="${a.iata}">Apri base (${mln(a.slot ? 500000 : 300000)})</button>`}</td></tr>`; }).join('')}
  </tbody></table></div><p class="nota">Nelle basi gli aerei possono passare la notte e lavorano gli equipaggi (costo ${eur(1200)}–${eur(2500)} al giorno). Un hub è una base dove vendi coincidenze tra i tuoi voli (${mln(D.HUB.costo)} + ${eur(D.HUB.giornaliero)} al giorno). Negli aeroporti regolati ogni partenza giornaliera richiede uno slot.</p></div>`;
};

/* Finanze */
VISTE.finanze = () => {
  const ieri = G.storico.at(-1), u7 = ultimi(7), u30 = ultimi(30), deb = SIM.debitoTot(G), lim = SIM.A.limitePrestito(G), tasso = SIM.A.tassoPrestito(G);
  const voce = (k, n) => G.storico.slice(-n).reduce((a, x) => a + (x.dettaglio[k] || 0), 0);
  const ric = (c, n) => G.storico.slice(-n).reduce((a, x) => a + (x.ricaviC ? x.ricaviC[c] : c === 'Y' ? x.ricavi : 0), 0);
  return `<div class="testata"><h1>Finanze</h1></div>
  <div class="kpi">
    <div><small>Cassa</small><b class="${G.cassa < 0 ? 'neg' : ''}">${mln(G.cassa)}</b><span>fido fino a −2 M€</span></div>
    <div><small>Debiti</small><b>${mln(deb)}</b><span>${G.debiti.length} prestiti</span></div>
    <div><small>Valore compagnia</small><b>${mln(SIM.valoreCompagnia(G))}</b><span>cassa + aerei + slot − debiti</span></div>
    <div><small>Utile ultimi 30 giorni</small><b class="${u30.utile < 0 ? 'neg' : ''}">${mln(u30.utile)}</b><span>${u30.n} giorni</span></div>
    <div><small>Utile cumulato</small><b class="${G.stat.utile < 0 ? 'neg' : ''}">${mln(G.stat.utile)}</b><span>dall’inizio</span></div>
  </div>
  <div class="griglia g2">
    <div class="pannello"><h2>Utile giornaliero · ultimi 60 giorni</h2>${G.storico.length ? graficoUtile(G.storico.slice(-60).map(x => ({ t: x.t, v: x.utile, r: x.ricavi, c: x.costi }))) : '<p class="vuoto">Dati disponibili dopo il primo giorno</p>'}</div>
    <div class="pannello"><h2>Cassa · ultimi 120 giorni</h2>${G.storico.length ? graficoLinea(G.storico.slice(-120).map(x => ({ t: x.t, v: x.cassa }))) : '<p class="vuoto">Dati disponibili dopo il primo giorno</p>'}</div>
  </div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Conto economico</h2><div class="tab-wrap"><table><thead><tr><th>Voce</th><th class="num">Ieri</th><th class="num">7 giorni</th><th class="num">30 giorni</th></tr></thead><tbody>
      ${CL.map(c => `<tr><td>Biglietti ${CLS[c].nome}</td><td class="num">${eur(ric(c, 1))}</td><td class="num">${eur(ric(c, 7))}</td><td class="num">${eur(ric(c, 30))}</td></tr>`).join('')}
      <tr><td>Servizi extra <span class="muto piccolo">bagagli, posti, pasti</span></td><td class="num">${eur(ieri?.extra || 0)}</td><td class="num">${eur(G.storico.slice(-7).reduce((a, x) => a + (x.extra || 0), 0))}</td><td class="num">${eur(G.storico.slice(-30).reduce((a, x) => a + (x.extra || 0), 0))}</td></tr>
      <tr><td><b>Totale ricavi</b> <span class="muto piccolo">di cui coincidenze</span></td><td class="num"><b>${eur(ieri?.ricavi || 0)}</b> <span class="muto piccolo">${mln(ieri?.ricaviTransito || 0)}</span></td><td class="num"><b>${eur(u7.ricavi)}</b> <span class="muto piccolo">${mln(u7.ricaviTransito)}</span></td><td class="num"><b>${eur(u30.ricavi)}</b> <span class="muto piccolo">${mln(u30.ricaviTransito)}</span></td></tr>
      ${Object.keys(VOCI).map(k => `<tr><td>${VOCI[k]}</td><td class="num">${eur(-(ieri?.dettaglio[k] || 0))}</td><td class="num">${eur(-voce(k, 7))}</td><td class="num">${eur(-voce(k, 30))}</td></tr>`).join('')}
      <tr><td><b>Utile</b></td><td class="num"><b>${segno(ieri?.utile || 0)}</b></td><td class="num"><b>${segno(u7.utile)}</b></td><td class="num"><b>${segno(u30.utile)}</b></td></tr>
    </tbody></table></div></div>
    <div class="pannello"><h2>Prestiti</h2>
      ${G.debiti.length ? `<table><thead><tr><th class="num">Capitale</th><th class="num">Tasso</th><th class="num">Rata/g</th><th></th></tr></thead><tbody>${G.debiti.map(d => `<tr><td class="num">${eur(d.capitale)}</td><td class="num">${(d.tasso * 100).toFixed(1)}%</td><td class="num">${eur(d.rata)}</td><td><input type="number" class="prezzo" id="rimb-${d.id}" min="0" step="100000" value="${Math.min(d.capitale, Math.max(0, Math.floor(G.cassa / 1e5) * 1e5))}"> <button class="piccolo" data-az="rimborsa" data-id="${d.id}">Rimborsa</button></td></tr>`).join('')}</tbody></table>` : '<p class="muto">Nessun prestito in corso.</p>'}
      <h3 class="mt">Nuovo prestito</h3>
      <p class="piccolo">La banca ti concede fino a <b>${eur(lim)}</b> al <b>${(tasso * 100).toFixed(1)}%</b> annuo, da restituire in 5 anni con rate giornaliere.</p>
      <div class="filtri"><input type="number" id="importoPrestito" min="0" step="500000" value="${Math.min(lim, 5e6)}" style="width:140px"><button data-az="prestito" ${lim <= 0 ? 'disabled' : ''}>Chiedi prestito</button></div></div>
  </div>
  ${pannelloBorsa()}`;
};

/* Concorrenza: vedi ui/concorrenza.js */

/* Obiettivi */
VISTE.obiettivi = () => {
  const S = SCEN();
  return `<div class="testata"><h1>Obiettivi e traguardi</h1></div>
  <div class="griglia g2">
    <div class="pannello"><h2>${S.nome}</h2><p>${h(S.descr)}</p>${obiettiviHTML()}
      <p class="piccolo">Valore della compagnia: <b>${mln(SIM.valoreCompagnia(G))}</b> · passeggeri trasportati: <b>${num(G.stat.pax)}</b> · voli: <b>${num(G.stat.voli)}</b></p></div>
    <div class="pannello"><h2>Classifica</h2><div id="classifica"><p class="muto">Caricamento…</p></div></div>
  </div>
  <div class="pannello mt"><h2>Traguardi (${Object.keys(G.traguardi).length}/${D.TRAGUARDI.length})</h2><div class="traguardi">${D.TRAGUARDI.map(([id, t, d]) => `<div class="${G.traguardi[id] ? '' : 'no'}"><b>${G.traguardi[id] ? '🏆' : '🔒'} ${t}</b><small>${d}${G.traguardi[id] ? ` · ${fmtGiorno(G.traguardi[id])}` : ''}</small></div>`).join('')}</div></div>`;
};
async function caricaClassifica(el) {
  try {
    const c = await Archivio.classifica();
    el.innerHTML = c.length ? `<table><thead><tr><th>#</th><th>Compagnia</th><th>Scenario</th><th class="num">Giorni</th><th class="num">Punteggio</th></tr></thead><tbody>${c.slice(0, 15).map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.nome)}</td><td>${h(D.SCENARI[x.scenario]?.nome || x.scenario)}</td><td class="num">${x.giorni}</td><td class="num"><b>${num(x.punteggio)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muto">Nessuno scenario completato finora. Il punteggio dipende dal valore della compagnia e dai giorni risparmiati.</p>';
  } catch { el.innerHTML = '<p class="muto">Classifica non disponibile.</p>'; }
}
