'use strict';
// AvioGest — Direzione, Bordo e tariffe, Mercati, Borsa

/* ---------- Gestione aziendale: Direzione, Bordo e tariffe, Mercati, Borsa ---------- */
const iniziali = n => n.split(' ').map(x => x[0]).join('').slice(0, 2);
const giorniA = t => Math.max(0, Math.ceil((t - G.ora) / GIORNO));
function riunioneAperta() { const r = G.direzione?.riunione; return r && !r.chiusa ? r.proposte.filter(p => !p.esito).length : 0; }
function bannerRiunione() {
  const n = riunioneAperta(); if (!n) return '';
  return `<div class="banner-riunione"><span class="br-icona" aria-hidden="true">☕</span><div><b>Riunione di direzione in corso</b><span class="piccolo">${n === 1 ? 'Una proposta aspetta' : `${n} proposte aspettano`} la tua decisione</span></div><a class="btn primario" href="#/direzione">Vai alla riunione</a></div>`;
}
function cartaProposta(p, i) {
  const dir = G.direzione.dirigenti[p.ruolo], DD = D.DIRIGENTI[p.ruolo];
  const contro = p.contro && G.direzione.dirigenti[p.contro.ruolo];
  return `<div class="proposta ${p.esito || ''}">
    <div class="prop-testa"><span class="avatar r-${p.ruolo}" aria-hidden="true">${h(iniziali(dir.nome))}</span><div><b>${h(dir.nome)}</b><small>${DD.ruolo} · ${DD.area}</small></div>${p.costo ? `<span class="prop-costo">${eur(p.costo)}</span>` : '<span class="prop-costo zero">nessun costo</span>'}</div>
    <p>${h(p.testo)}</p>
    ${p.progetto ? `<p class="piccolo muto">Effetto: ${h(D.PROGETTI[p.progetto].effetto)} · pronto in ${D.PROGETTI[p.progetto].giorni} giorni</p>` : ''}
    ${contro ? `<div class="contro"><span class="avatar piccola r-${p.contro.ruolo}" aria-hidden="true">${h(iniziali(contro.nome))}</span><span><b>${h(contro.nome)}</b> (${D.DIRIGENTI[p.contro.ruolo].ruolo}): ${h(p.contro.testo)}</span></div>` : ''}
    ${p.esito ? `<div class="esito-prop">${p.esito === 'approvata' ? '✓ Approvata' : p.esito === 'bocciata' ? '✕ Bocciata' : 'Scaduta'}</div>` : `<div class="azioni"><button class="primario" data-az="decidi" data-i="${i}" data-si="1">Approva</button><button data-az="decidi" data-i="${i}">Boccia</button></div>`}
  </div>`;
}
VISTE.direzione = () => {
  const R = G.direzione, riu = R.riunione, S = D.STRATEGIE[G.strategia], cda = SIM.statoCda(G), sem = G.cda.semestre;
  const lun = SIM.giornoSett(G.ora), prossima = `${lun === 0 && SIM.loc(G.ora).getUTCHours() < 8 ? 'oggi' : 'lunedì'} alle 08:00`;
  const attivi = R.progetti.filter(p => !p.fatto), fatti = R.progetti.filter(p => p.fatto);
  const disponibili = Object.entries(D.PROGETTI).filter(([k]) => !(G.mod[k] === true) && !attivi.some(p => p.tipo === k));
  return `<div class="testata"><h1>Direzione</h1><span class="sotto">Posizionamento <b>${S.nome}</b> · fiducia del CdA <b>${Math.round(G.cda.fiducia)}/100</b></span></div>
  <div class="pannello"><div class="riga" style="margin:0 0 10px"><h2 style="margin:0">Riunione ${riu ? `di ${fmtGiorno(riu.t)}` : ''}</h2><span class="piccolo muto">Prossima riunione ${prossima}</span></div>
    ${riu && riu.proposte.length ? `<div class="proposte">${riu.proposte.map(cartaProposta).join('')}</div>` : '<p class="muto">Nessuna proposta sul tavolo.</p>'}
    ${!riunioneAperta() ? `<div class="filtri mt"><button data-az="convoca" ${R.ultimaStraordinaria && G.ora - R.ultimaStraordinaria < 7 * GIORNO ? 'disabled' : ''}>Convoca una riunione straordinaria</button><span class="piccolo muto">Al massimo una a settimana</span></div>` : ''}
  </div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Il tuo team</h2><ul class="team">${Object.entries(R.dirigenti).map(([k, d]) => `<li><span class="avatar r-${k}" aria-hidden="true">${h(iniziali(d.nome))}</span><div><b>${h(d.nome)}</b><small>${D.DIRIGENTI[k].ruolo} · ${D.DIRIGENTI[k].motto}</small>${barretta(d.umore / 100, `umore ${Math.round(d.umore)}`, [2, 2])}</div></li>`).join('')}</ul>
      <p class="nota">Bocciare spesso le proposte di un dirigente lo demotiva: sotto 15 di umore si dimette.</p></div>
    <div class="pannello"><h2>Consiglio di amministrazione</h2>
      <div class="piccolo">Fiducia nella tua gestione</div>${barretta(G.cda.fiducia / 100, Math.round(G.cda.fiducia) + '/100', [2, 2])}
      <p class="piccolo">Obiettivi del semestre · mancano <b>${giorniA(sem.fine)} giorni</b></p>
      ${cda.map(o => `<div class="piccolo">${h(o.t)} · ${h(o.s)}</div>${barretta(clamp01(o.v), o.v >= 1 ? '✓' : pct(clamp01(o.v)), [2, 2])}`).join('')}
      <p class="nota">A fine semestre: 3 obiettivi = fiducia +15, 2 = +8, 1 = −6, nessuno = −20. Con fiducia sotto 25 le banche alzano i tassi e il titolo in borsa vale meno.</p>
      ${G.cda.storico.length ? `<details><summary class="piccolo">Semestri passati</summary><ul class="piccolo">${G.cda.storico.map(x => `<li>${fmtGiorno(x.t)}: ${x.fatti}/3 obiettivi, fiducia ${x.delta > 0 ? '+' : ''}${x.delta}</li>`).join('')}</ul></details>` : ''}
    </div>
  </div>
  <div class="pannello mt"><h2>Posizionamento</h2><div class="strategie">${Object.entries(D.STRATEGIE).map(([k, x]) => `<div class="strategia ${k === G.strategia ? 'on' : ''}"><b>${x.nome}</b><p class="piccolo">${h(x.descr)}</p>
      <p class="piccolo muto">Clienti Business ×${x.quote.J} · Premium ×${x.quote.W}${x.tolleranza !== 1 ? ` · supplementi ${x.tolleranza < 1 ? 'tollerati' : 'mal visti'}` : ''}${x.sede !== 1 ? ` · costi di sede ×${x.sede}` : ''}</p>
      ${k === G.strategia ? '<span class="badge b-ok">Attuale</span>' : `<button class="piccolo" data-az="strategia" data-s="${k}">Passa a ${x.nome} · 300.000 €</button>`}</div>`).join('')}</div>
    <p class="nota">Il posizionamento cambia la clientela e ciò che si aspetta dal prodotto: regola anche il servizio in Bordo e tariffe. Si cambia al massimo ogni 6 mesi.</p></div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Progetti</h2>
      ${attivi.length ? `<ul class="progetti">${attivi.map(p => `<li><b>${h(p.nome)}</b> <span class="piccolo muto">pronto il ${fmtGiorno(p.fine)}</span>${barretta(clamp01((G.ora - p.inizio) / (p.fine - p.inizio)), giorniA(p.fine) + ' giorni', [2, 2])}</li>`).join('')}</ul>` : '<p class="muto piccolo">Nessun progetto in corso.</p>'}
      ${fatti.length ? `<p class="piccolo">Completati: ${fatti.map(p => h(p.nome)).join(' · ')}</p>` : ''}
      <details class="mt"><summary>Avvia un progetto senza aspettare la riunione</summary><ul class="progetti">${disponibili.map(([k, P]) => { const costo = P.costo + (P.perAereo || 0) * flotta().length; return `<li><div><b>${h(P.nome)}</b> <span class="piccolo muto">(${D.DIRIGENTI[P.ruolo].ruolo})</span><br><span class="piccolo">${h(P.effetto)} · ${P.giorni} giorni</span></div><button class="piccolo" data-az="progetto" data-t="${k}" ${G.cassa < costo ? 'disabled' : ''}>${costo ? eur(costo) : 'Avvia'}</button></li>`; }).join('')}</ul></details></div>
    <div class="pannello"><h2>Verbale</h2>${R.verbale.length ? `<ul class="verbale">${R.verbale.slice(0, 15).map(v => `<li><span class="badge ${v.esito === 'Approvata' ? 'b-ok' : v.esito === 'Bocciata' ? 'b-err' : ''}">${v.esito}</span> <span class="piccolo muto">${fmtGiorno(v.t)} · ${D.DIRIGENTI[v.ruolo].ruolo}</span><br><span class="piccolo">${h(v.titolo)}</span></li>`).join('')}</ul>` : '<p class="muto piccolo">Ancora nessuna decisione.</p>'}</div>
  </div>`;
};
const clamp01 = x => Math.max(0, Math.min(1, x || 0));

// Bordo e tariffe
VISTE.prodotto = () => {
  const A = SIM.analisiProdotto(G), T = G.tariffe, u7 = G.storico.slice(-7), extra7 = u7.reduce((s, x) => s + (x.extra || 0), 0), pax7 = u7.reduce((s, x) => s + x.pax, 0), neg7 = u7.reduce((s, x) => s + (x.negati || 0), 0);
  const sel = (c, el) => { const E = D.BORDO[el]; if (E.classi && !E.classi.includes(c)) return '<span class="muto">—</span>'; const bloc = E.richiede && !G.mod[E.richiede];
    return `<select data-bordo="${el}" data-c="${c}" ${bloc ? 'disabled title="Serve il Wi‑Fi satellitare (progetto del CTO)"' : ''} aria-label="${E.nome} ${CLS[c].nome}">${opzioni(E.livelli.map((L, i) => [i, L.nome]), bloc ? 0 : G.bordo[c][el])}</select>`; };
  const npsC = n => n >= 40 ? 'ok' : n >= 15 ? 'medio' : 'neg';
  const rotte = Object.keys(G.rotte), rk = UI.rottaBiglietto && G.rotte[UI.rottaBiglietto] ? UI.rottaBiglietto : rotte[0];
  return `<div class="testata"><h1>Bordo e tariffe</h1><span class="sotto">Il prodotto che vendi: cosa offri a bordo in ogni classe e come componi il prezzo</span></div>
  <div class="pannello"><h2>Esperienza a bordo</h2><div class="tab-wrap"><table class="bordo"><thead><tr><th></th>${CL.map(c => `<th><span class="chip"><i style="background:var(--cl-${c})"></i>${CLS[c].nome}</span></th>`).join('')}</tr></thead><tbody>
    ${Object.entries(D.BORDO).map(([el, E]) => `<tr><td><b>${E.nome}</b>${E.richiede && !G.mod[E.richiede] ? '<br><span class="piccolo muto">serve il Wi‑Fi satellitare</span>' : ''}</td>${CL.map(c => `<td>${sel(c, el)}</td>`).join('')}</tr>`).join('')}
    <tr class="sintesi"><td>Gradimento</td>${CL.map(c => `<td><b class="${A[c].valore >= 1 ? 'pos' : 'neg'}">${A[c].valore >= 1 ? '+' : ''}${Math.round((A[c].valore - 1) * 100)}%</b> <span class="piccolo muto">rispetto a ciò che si aspettano</span></td>`).join('')}</tr>
    <tr class="sintesi"><td>Soddisfazione (NPS)</td>${CL.map(c => `<td><b class="nps ${npsC(A[c].nps)}">${A[c].nps > 0 ? '+' : ''}${A[c].nps}</b></td>`).join('')}</tr>
    <tr class="sintesi"><td>Costo a passeggero <span class="piccolo muto">(volo di 2 h)</span></td>${CL.map(c => `<td>${eur(A[c].costo)}${A[c].extra ? ` · <span class="pos">+${eur(A[c].extra)} venduti</span>` : ''}</td>`).join('')}</tr>
  </tbody></table></div>
  <p class="piccolo">Effetto sulla reputazione: <b>${A.rep >= 0 ? '+' : ''}${A.rep.toFixed(1)}</b> punti (con il posizionamento ${D.STRATEGIE[G.strategia].nome})${A.fisso ? ` · costi fissi del prodotto ${eur(A.fisso)} al giorno` : ''}.</p>
  <p class="nota">Il gradimento cambia quanto i clienti sono disposti a pagare: +10% di gradimento vale circa +10% sul prezzo che accettano. Pasti, sedili e intrattenimento contano di più sui voli lunghi. Con il posizionamento premium i clienti si aspettano di più, con il low cost di meno.</p></div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Composizione del prezzo</h2><div class="form">
      <label>Bagaglio in stiva (Economy)<span class="input-euro"><input type="number" min="0" max="200" step="1" value="${T.bagaglio}" data-tar="bagaglio"> €</span><small class="muto">0 = incluso nel biglietto</small></label>
      <label>Scelta del posto<span class="input-euro"><input type="number" min="0" max="200" step="1" value="${T.posto}" data-tar="posto"> €</span><small class="muto">0 = gratis</small></label>
      <label>Imbarco prioritario<span class="input-euro"><input type="number" min="0" max="200" step="1" value="${T.priorita}" data-tar="priorita"> €</span><small class="muto">0 = non in vendita</small></label>
      <label>Prezzi dinamici<select data-tar-sel="dinamico">${Object.entries(D.DINAMICO).map(([k, x]) => `<option value="${k}" ${T.dinamico === k ? 'selected' : ''} ${x.richiede && !G.mod[x.richiede] ? 'disabled' : ''}>${x.nome}${x.rialzo ? ` · fino a +${Math.round(x.rialzo * 100)}% sui voli pieni` : ''}${x.richiede && !G.mod[x.richiede] ? ' (serve revenue management)' : ''}</option>`).join('')}</select></label>
      <label>Overbooking<select data-tar-sel="overbooking">${opzioni([[0, 'Nessuno'], [0.03, '+3% di biglietti'], [0.06, '+6% di biglietti'], [0.1, '+10% di biglietti']], T.overbooking)}</select><small class="muto">Circa il 6% non si presenta; chi resta a terra va risarcito</small></label>
      <label class="interruttore pieno" style="border:0"><input type="checkbox" data-tar-chk="famiglie" ${T.famiglie ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Tariffe Light, Standard e Flex</b><small>Chi vuole flessibilità paga di più: circa +5% per biglietto, con qualche cliente in meno</small></span></label>
    </div>
    <div class="sett-sintesi"><div><small>Servizi extra 7 giorni</small><b>${eur(extra7)}</b></div><div><small>Extra per passeggero</small><b>${eur(pax7 ? extra7 / pax7 : 0)}</b></div><div><small>Lasciati a terra 7 giorni</small><b class="${neg7 ? 'neg' : ''}">${num(neg7)}</b></div></div></div>
    <div class="pannello"><h2>Quanto guadagni per passeggero</h2>${rk ? (() => {
      const s = statsRotta(rk), [a, b] = rk.split('-'), r = G.rotte[rk];
      const p = s.pax ? { ric: s.ricavi / s.pax, cost: s.costi / s.pax } : null;
      return `<label class="campo">Rotta<select id="rottaBiglietto">${opzioni(rotte.map(k => [k, k.replace('-', '–')]), rk)}</select></label>
        <table class="mt biglietto"><tbody>
        <tr><td>Tariffe in vendita</td><td class="num">${CL.map(c => `${CLS[c].breve} ${eur(r['p' + c])}`).join(' · ')}</td></tr>
        ${p ? `<tr><td>Incasso medio a passeggero <span class="piccolo muto">(biglietto + extra, ultimi 7 giorni)</span></td><td class="num"><b>${eur(p.ric)}</b></td></tr>
        <tr><td>Costi del volo a passeggero</td><td class="num">−${eur(p.cost)}</td></tr>
        <tr><td><b>Margine a passeggero</b></td><td class="num"><b>${segno(p.ric - p.cost)}</b></td></tr>` : '<tr><td colspan="2" class="muto">Nessun volo negli ultimi 7 giorni</td></tr>'}
        <tr><td>Tasse aeroportuali a passeggero</td><td class="num">${eur(AP[a].tassa)} a ${a} · ${eur(AP[b].tassa)} a ${b}</td></tr>
        </tbody></table><p class="nota">Il margine non conta i costi fissi (leasing, stipendi, sede).</p>`;
    })() : '<p class="muto">Nessuna rotta aperta.</p>'}</div>
  </div>
  <div class="pannello mt"><h2>Sondaggio passeggeri</h2>${G.sondaggio ? `<p class="piccolo muto">Del ${fmtGiorno(G.sondaggio.t)}</p><div class="griglia g3">${CL.map(c => { const x = G.sondaggio.classi[c]; return `<div><b>${CLS[c].nome}</b> · NPS ${x.nps}<ul class="piccolo">${x.idee.length ? x.idee.map(i => `<li>${h(i.nome)}: vorrebbero «${h(i.verso)}» (+${Math.round(i.guadagno * 100)}% di gradimento, ${i.costo > 0 ? '+' + eur(i.costo) + ' a passeggero' : 'senza costi in più'})${i.bloccato ? ' · serve il Wi‑Fi' : ''}</li>`).join('') : '<li>Nessuna richiesta importante</li>'}</ul></div>`; }).join('')}</div>` : `<p class="muto">Nessun sondaggio recente.</p>`}
    <div class="filtri"><button data-az="ricerca-rapida" data-t="sondaggio">Commissiona un sondaggio · ${eur(D.RICERCHE.sondaggio.costo)}</button></div></div>
  ${pannelloCanali()}`;
};

// Mercati e ricerche
VISTE.mercati = () => {
  const prop = SIM.proposteDestinazioni(G, 8), ser = G.serie, intel = SIM.intel(G);
  const tipo = UI.rcTipo || 'domanda', Rr = D.RICERCHE[tipo], ordina = perContinente();
  const mosse = G.mosseRivali.filter(m => !m.fatta);
  return `<div class="testata"><h1>Mercati e ricerche</h1><span class="sotto">Dove volare, quanto vale un mercato, cosa fanno i concorrenti</span></div>
  <div class="griglia g2">
    <div class="pannello"><h2>Economia</h2><div class="economia">${Object.entries(G.economia).map(([c, v]) => { const prec = ser.length > 4 ? ser.at(-5).econ[c] : 1, d = v - prec; return `<div><small>${c}</small><b class="${v >= 1 ? 'pos' : 'neg'}">${v >= 1 ? '+' : ''}${((v - 1) * 100).toFixed(1)}%</b><span class="piccolo ${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(1)} in un mese</span></div>`; }).join('')}</div>
      <p class="piccolo">Euro/dollaro <b>${(G.cambio || 1.1).toFixed(3)}</b> · leasing e carburante costano il ${Math.round((1.1 / (G.cambio || 1.1) - 1) * 100) >= 0 ? '+' : ''}${Math.round((1.1 / (G.cambio || 1.1) - 1) * 100)}% rispetto al normale${(G.treni || []).length ? ` · treni veloci tra: ${G.treni.map(t => t.replace('|', ' e ')).join('; ')}` : ''}${(G.crisiDomanda || []).length ? ` · <span class="neg">crisi della domanda: ${G.crisiDomanda.map(x => `${x.continente} −${Math.round((1 - x.fattore) * 100)}% fino al ${fmtGiorno(x.fine)}`).join(', ')}</span>` : ''}</p>
      <p class="nota">Domanda di viaggi rispetto alla norma per continente: un’economia forte porta più passeggeri su tutte le rotte che la toccano.</p></div>
    <div class="pannello"><h2>Cherosene</h2>${ser.length > 1 ? graficoLinea(ser.map(x => ({ t: x.t, v: x.carb })), v => v.toFixed(2) + ' €/kg') : `<p class="muto">Prezzo attuale <b>${G.carburante.toFixed(2)} €/kg</b>. Il grafico compare dopo qualche settimana.</p>`}
      ${G.copertura ? `<p class="piccolo"><span class="badge b-ok">Copertura attiva</span> prezzo bloccato a ${G.copertura.prezzo.toFixed(2)} €/kg fino al ${fmtGiorno(G.copertura.fine)}</p>` : ''}</div>
  </div>
  <div class="pannello mt"><h2>Destinazioni consigliate</h2><div class="tab-wrap"><table><thead><tr><th>Rotta</th><th class="num">Km</th><th>Aereo e voli</th><th>Riempimento stimato</th><th class="num">Margine voli al giorno</th><th>Affidabilità</th><th></th></tr></thead><tbody>
    ${prop.map(x => `<tr><td><b>${x.da}–${x.a}</b> <span class="muto piccolo">${h(citta(x.a))}, ${h(AP[x.a].nomePaese)}</span>${x.rivali ? `<br><span class="piccolo muto">${x.rivali} concorrenti</span>` : ''}</td><td class="num">${num(x.km)}</td><td class="piccolo">${MOD[x.mod].nome}<br>${x.giri >= 1 ? `${x.giri} A/R al giorno` : '3 A/R a settimana'}</td><td>${barretta(x.lf, null, [0.55, 0.72])}</td>
      <td class="num">${x.studiato ? segno(x.utile) : `${mln(x.utile * 0.7)} – ${mln(x.utile * 1.3)}`}</td><td>${x.studiato ? '<span class="badge b-ok">Studiata</span>' : '<span class="badge">Stima ±30%</span>'}</td>
      <td class="azioni-riga">${x.studiato ? '' : `<button class="piccolo" data-az="studio" data-da="${x.da}" data-a="${x.a}">Studio · 15k</button>`}<button class="piccolo primario" data-az="apri-prop" data-da="${x.da}" data-a="${x.a}" data-mod="${x.mod}">Apri e programma</button></td></tr>`).join('')}
  </tbody></table></div>
  <p class="nota">Stima con un aereo della tua flotta ai prezzi di riferimento, a rotta avviata (servono circa 2 mesi). Il margine è sui soli voli: leasing, stipendi e sede sono a parte. Senza uno studio la domanda vera può essere il 30% più alta o più bassa.</p></div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Commissiona una ricerca</h2>
      <div class="form"><label class="pieno">Tipo<select id="rcTipo">${opzioni(Object.entries(D.RICERCHE).map(([k, x]) => [k, `${x.nome} · ${eur(x.costo)} · ${x.giorni} giorni`]), tipo)}</select></label>
      ${tipo === 'domanda' ? `<label>Da<select id="rcDa">${opzioniAeroporti(ordina, G.basi[0])}</select></label><label>A<select id="rcA"><option value="">— scegli —</option>${opzioniAeroporti(ordina, '')}</select></label>` : ''}
      ${tipo === 'area' ? `<label>Base<select id="rcBase">${opzioni(G.basi.map(b => [b, `${b} · ${citta(b)}`]), G.basi[0])}</select></label>` : ''}</div>
      <p class="piccolo">${h(Rr.descr)}</p>
      <div class="filtri"><button class="primario" data-az="ricerca" ${G.cassa < Rr.costo ? 'disabled' : ''}>Commissiona · ${eur(Rr.costo)}</button></div>
      ${G.ricerche.length ? `<h3 class="mt">Ricerche</h3><ul class="ricerche">${G.ricerche.slice().reverse().map(r => `<li><b>${D.RICERCHE[r.tipo].nome}</b> ${r.tipo === 'domanda' ? `${r.da}–${r.a}` : r.tipo === 'area' ? r.base : ''} · ${r.fatta ? `<span class="badge b-ok">pronta</span>` : `<span class="badge b-info">pronta tra ${giorniA(r.fine)} giorni</span>`}
        ${r.fatta && r.esito && r.esito.mesi ? `<div class="piccolo">${h(r.esito.testo)}</div>${miniMesi(r.esito.mesi)}<div class="piccolo muto">Clientela: Business ${pct(r.esito.quote.J)} · Premium ${pct(r.esito.quote.W)} · Economy ${pct(r.esito.quote.Y)} · turismo ${pct(r.esito.turismo)}</div>` : ''}
        ${r.fatta && r.esito && r.esito.lista ? `<div class="piccolo">Studiate: ${r.esito.lista.join(', ')}</div>` : ''}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="pannello"><h2>Mosse dei concorrenti</h2>${intel ? (mosse.length ? `<ul class="ricerche">${mosse.sort((x, y) => x.t - y.t).map(m => { const R = G.rivali.find(r => r.id === m.riv), [a, b] = m.k.split('-'), mia = !!G.rotte[m.k]; return `<li><span class="pallino" style="background:${R.colore}"></span><b>${h(R.nome)}</b> aprirà <b>${a}–${b}</b> verso il ${fmtGiorno(m.t)}${mia ? ' <span class="badge b-err">rotta tua</span>' : ''}${m.attacco ? '<br><span class="piccolo">Vuole attaccare una tua rotta piena: valuta prezzi o più voli prima che arrivi.</span>' : ''}</li>`; }).join('')}</ul>` : '<p class="muto">Nessuna mossa in vista.</p>') + `<p class="nota">Informazioni valide fino al ${fmtGiorno(G.intel)}.</p>`
      : `<p class="muto">Non sai cosa stanno preparando. Con un’analisi della concorrenza vedi le loro nuove rotte 2–4 settimane prima che partano.</p><div class="filtri"><button data-az="ricerca-rapida" data-t="concorrenza">Analisi della concorrenza · ${eur(D.RICERCHE.concorrenza.costo)}</button></div>`}</div>
  </div>`;
};
function miniMesi(m) {
  const mx = Math.max(...m), nomi = 'GFMAMGLASOND';
  return `<div class="mini-mesi" role="img" aria-label="Domanda mese per mese">${m.map((v, i) => `<span style="height:${Math.round(v / mx * 100)}%" data-tip="${nomi[i]}: ${num(v)} al giorno"><i>${nomi[i]}</i></span>`).join('')}</div>`;
}
// Borsa (pagina Finanze)
function pannelloBorsa() {
  const B = G.borsa, equo = SIM.valoreEquo(G);
  if (!B.quotata) {
    const v = SIM.valoreCompagnia(G), ok = v >= 25e6 && G.ora - G.inizio >= 60 * GIORNO;
    return `<div class="pannello mt"><h2>Borsa</h2><p>Quotarti in borsa ti fa incassare denaro vendendo una parte della compagnia. Il prezzo del titolo seguirà utili, reputazione e fiducia del CdA.</p>
      <p class="piccolo">Valutazione attuale stimata: <b>${mln(equo)}</b>. Requisiti: valore della compagnia di almeno 25 M€ (ora ${mln(v)}) e 60 giorni di storia.</p>
      <div class="filtri"><select id="quotaIpo">${opzioni([[0.2, 'Vendi il 20%'], [0.3, 'Vendi il 30%'], [0.4, 'Vendi il 40%']], 0.3)}</select><button class="primario" data-az="ipo" ${ok ? '' : 'disabled'}>Quotati in borsa</button></div></div>`;
  }
  const cap = B.prezzo * B.azioni, quota = B.mie / B.azioni, s30 = B.storico.length > 30 ? B.storico.at(-31).p : B.storico[0].p, var30 = B.prezzo / s30 - 1;
  return `<div class="pannello mt"><h2>Borsa</h2>
    <div class="kpi"><div><small>Prezzo azione</small><b>${B.prezzo.toFixed(2)} €</b><span class="${var30 >= 0 ? 'pos' : 'neg'}">${var30 >= 0 ? '+' : ''}${(var30 * 100).toFixed(1)}% in 30 giorni</span></div>
      <div><small>Capitalizzazione</small><b>${mln(cap)}</b><span>valore “equo” ${mln(equo)}</span></div>
      <div><small>Tua quota</small><b>${pct(quota)}</b><span>${quota >= 0.51 ? 'controllo saldo' : 'attenzione al controllo'}</span></div>
      <div><small>Dividendi pagati</small><b>${mln(B.dividendi)}</b><span>dalla quotazione</span></div></div>
    ${graficoLinea(B.storico.slice(-180).map(x => ({ t: x.t, v: x.p })), v => v.toFixed(2) + ' €')}
    <div class="filtri mt"><button data-az="aumento">Aumento di capitale del 10% (~${mln(B.azioni * 0.1 * B.prezzo * 0.95)})</button>
      <input type="number" id="importoBorsa" min="0" step="100000" value="${Math.round(Math.max(1e5, cap * 0.01) / 1e5) * 1e5}" style="width:140px" aria-label="Importo">
      <button data-az="dividendo">Paga dividendo</button><button data-az="riacquisto">Riacquista azioni</button></div>
    <p class="nota">L’aumento di capitale porta cassa ma diluisce la tua quota (non puoi scendere sotto il 51%). Dividendi e riacquisti fanno salire il titolo e la fiducia del CdA.</p></div>`;
}
