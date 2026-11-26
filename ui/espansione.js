'use strict';
// AvioGest — Giornale e bilanci, accordi con aeroporti e regioni, sostenibilità (CO₂ e carburante sostenibile),
// ordini di aerei con anticipo, orario estivo e invernale

/* ---------- Giornale ---------- */
VISTE.giornale = () => {
  const L = G.giornali || [], i = Math.min(UI.edizione || 0, Math.max(0, L.length - 1)), g = L[i];
  const voci = ['ricavi', 'utile', 'pax', 'voli', 'lf', 'punt', 'co2'];
  return `<div class="testata"><h1>Giornale</h1><span class="sotto">Ogni mese la stampa racconta la tua compagnia · a gennaio il bilancio dell’anno</span>${L.length > 1 ? `<span class="spazio"></span><label class="campo">Edizione<select id="edizione">${opzioni(L.map((x, j) => [j, x.mese]), i)}</select></label>` : ''}</div>
  ${g ? `<article class="giornale">
    <header><b>Il Corriere dei Cieli</b><span>Edizione di ${h(g.mese)} · voto della stampa a ${h(G.nome)}: <b>${g.voto}/10</b></span></header>
    <h2 class="g-titolo ${g.titoli[0].tono}">${h(g.titoli[0].t)}</h2><p class="g-occhiello">${h(g.titoli[0].testo)}</p>
    <div class="g-colonne">${g.titoli.slice(1).map(t => `<section class="${t.tono}"><h3>${h(t.t)}</h3><p>${h(t.testo)}</p></section>`).join('')}</div>
    <h3 class="g-sez">Classifica del mese per passeggeri</h3>
    <ol class="g-classifica">${g.classifica.map(x => `<li class="${x.tu ? 'tu' : ''}">${x.colore ? `<span class="pallino" style="background:${x.colore}"></span>` : '✈ '}${h(x.nome)}<span>${num(x.pax)}</span></li>`).join('')}</ol>
    <p class="nota">I passeggeri dei concorrenti sono stime della stampa.</p></article>`
    : '<p class="vuoto">Il primo numero esce il primo giorno del prossimo mese.</p>'}
  <div class="pannello mt"><h2>Bilanci annuali</h2>${(G.bilanci || []).length ? `<div class="tab-wrap"><table><thead><tr><th>Anno</th><th class="num">Ricavi</th><th class="num">Costi</th><th class="num">Utile</th><th class="num">Passeggeri</th><th class="num">Riempimento</th><th class="num">Puntualità</th><th class="num">CO₂ (t)</th><th class="num">Flotta</th><th class="num">Valore</th></tr></thead><tbody>
    ${G.bilanci.map(b => `<tr><td><b>${b.anno}</b>${b.giorni < 360 ? ` <span class="muto piccolo">(${b.giorni} gg)</span>` : ''}</td><td class="num">${mln(b.ricavi)}</td><td class="num">${mln(b.costi)}</td><td class="num">${segno(b.utile)}</td><td class="num">${num(b.pax)}</td><td class="num">${pct(b.lf)}</td><td class="num">${pct(b.punt)}</td><td class="num">${num(b.co2)}</td><td class="num">${b.flotta}</td><td class="num">${mln(b.valore)}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="muto">Il primo bilancio arriva il 1° gennaio.</p>'}</div>`;
};

/* ---------- Accordi con aeroporti e regioni ---------- */
function cartaAccordo(a, offerta) {
  const st = offerta ? null : SIM.statoAccordo(G, a);
  return `<div class="pannello carta accordo ${a.tipo}">
    <div class="riga" style="margin:0"><span class="titolo">${h(a.nome)}</span><span class="badge ${a.tipo === 'regione' ? 'b-info' : ''}">${a.tipo === 'regione' ? 'Contributo per volo' : 'Sconto sulle tasse'}</span></div>
    <p>${h(a.testo)}</p>
    ${offerta ? `<p class="piccolo muto">Penale se non rispetti gli impegni: ${eur(a.penale)} · offerta valida fino al ${fmtGiorno(a.scade)}</p>
      <div class="azioni"><button class="primario" data-az="accetta-offerta" data-id="${a.id}">Firma</button><button data-az="rifiuta-offerta" data-id="${a.id}">Rifiuta</button></div>`
    : `<div class="riga"><span>Voli a settimana</span><span class="${st.voli >= a.minVoli ? 'pos' : 'neg'}"><b>${st.voli}</b> / ${a.minVoli}</span></div>
      ${a.tipo === 'regione' ? `<div class="riga"><span>Prezzo Economy</span><span class="${st.prezzoOk ? 'pos' : 'neg'}">${G.rotte[a.k] ? eur(G.rotte[a.k].pY) : 'rotta non aperta'} (max ${eur(a.prezzoMax)})</span></div>
        <div class="riga"><span>Contributi incassati</span><span>${eur(a.incassato)}</span></div>` : `<div class="riga"><span>Tasse risparmiate</span><span>${eur(a.risparmiato)}</span></div>`}
      <div class="riga"><span>Scadenza</span><span>${fmtGiorno(a.fine)}</span></div>
      ${st.ok ? '<p class="piccolo pos">✓ Impegni rispettati</p>' : st.grazia ? `<p class="piccolo">Periodo di avvio: hai tempo fino al ${fmtGiorno(a.inizio + 30 * GIORNO)} per rispettare gli impegni.</p>` : `<p class="piccolo neg">Impegni non rispettati${a.avvisi ? ': al prossimo controllo scatta la penale' : ''}.</p>`}
      <div class="azioni">${a.tipo === 'regione' ? linkRotta(a.k, 'Vedi la rotta') : `<button class="piccolo" data-az="apri-aeroporto" data-i="${a.iata}">Scheda aeroporto</button>`}<button class="piccolo pericolo" data-az="recedi" data-id="${a.id}">Recedi (${mln(a.penale)})</button></div>`}
  </div>`;
}
VISTE.accordi = () => {
  const off = G.offerte || [], acc = G.accordi || [], vicini = Object.values(AP).filter(x => G.basi.some(b => SIM.km(b, x.iata) < 4000)).sort((x, y) => x.citta.localeCompare(y.citta));
  return `<div class="testata"><h1>Accordi con aeroporti e regioni</h1><span class="sotto">Gli aeroporti scontano le tasse se porti abbastanza voli; regioni ed enti del turismo pagano un contributo per ogni volo sulle rotte che interessano a loro</span></div>
  <div class="pannello"><h2>Chiedi un’offerta</h2><div class="filtri"><select id="offAeroporto" aria-label="Aeroporto">${vicini.map(x => `<option value="${x.iata}">${h(x.citta)} · ${x.iata}${x.isola ? ' (isola)' : ''}</option>`).join('')}</select><button data-az="chiedi-offerta">Chiedi</button></div>
    <p class="nota">Gli aeroporti piccoli e turistici offrono di più; i grandi aeroporti chiedono molti voli per sconti modesti. Ogni due mesi arrivano anche proposte spontanee.</p></div>
  <h2 class="mt">Proposte (${off.length})</h2>${off.length ? `<div class="carte">${off.map(o => cartaAccordo(o, true)).join('')}</div>` : '<p class="muto">Nessuna proposta in attesa.</p>'}
  <h2 class="mt">Accordi in corso (${acc.length})</h2>${acc.length ? `<div class="carte">${acc.map(a => cartaAccordo(a, false)).join('')}</div>` : '<p class="muto">Nessun accordo firmato.</p>'}`;
};

/* ---------- Sostenibilità ---------- */
VISTE.sostenibilita = () => {
  const u = G.storico.slice(-30), t = u.reduce((s, x) => s + (x.co2 || 0), 0), cost = u.reduce((s, x) => s + (x.dettaglio.co2 || 0), 0), carb = u.reduce((s, x) => s + (x.dettaglio.carburante || 0), 0), pax = u.reduce((s, x) => s + x.pax, 0);
  const saf = G.saf || 0, carbBase = carb / (1 + 1.5 * saf), ser = G.serie.filter(x => x.co2 != null);
  const co2Base = cost / Math.max(0.2, 1 - 0.8 * saf), stima = q => q * (carbBase * 1.5 - co2Base * 0.8);
  return `<div class="testata"><h1>Sostenibilità</h1><span class="sotto">Emissioni di CO₂, il loro costo e il carburante sostenibile</span></div>
  <div class="kpi">
    <div><small>Prezzo della CO₂</small><b>${eur(G.co2)}/t</b><span>sale ogni anno</span></div>
    <div><small>Emissioni 30 giorni</small><b>${num(t)} t</b><span>${pax ? num(t * 1000 / pax, 0) + ' kg a passeggero' : '—'}</span></div>
    <div><small>Costo CO₂ 30 giorni</small><b>${mln(cost)}</b><span>${carb ? pct(cost / carb) + ' del carburante' : '—'}</span></div>
    <div><small>Carburante sostenibile</small><b>${pct(saf)}</b><span>reputazione +${Math.min(5, saf * 12).toFixed(1)}</span></div>
  </div>
  <div class="griglia g2">
    <div class="pannello"><h2>Carburante sostenibile (SAF)</h2>
      <p class="piccolo">Costa 2,5 volte il cherosene, ma taglia dell’80% le emissioni della quota che usi. Migliora la reputazione e attira i clienti Business e Premium più attenti all’ambiente.</p>
      <label class="campo">Quota di carburante sostenibile<select id="safQuota">${opzioni([0, 0.05, 0.1, 0.2, 0.3, 0.5].map(q => [q, q ? `${Math.round(q * 100)}% · circa ${mln((stima(q) - stima(saf)) / 30)} al giorno ${stima(q) >= stima(saf) ? 'in più' : 'in meno'}` : 'Niente']), saf)}</select></label>
      <p class="nota">La stima confronta con la quota attuale sui voli degli ultimi 30 giorni.</p></div>
    <div class="pannello"><h2>Prezzo della CO₂</h2>${ser.length > 1 ? graficoLinea(ser.map(x => ({ t: x.t, v: x.co2 })), v => Math.round(v) + ' €/t') : '<p class="muto">Il grafico compare dopo qualche settimana.</p>'}
      <p class="nota">Sui voli da e per l’Europa paghi oggi il 40% delle emissioni (il resto è coperto da quote gratuite, che calano ogni anno); altrove un quarto di quella quota. Gli aerei di nuova generazione consumano e quindi emettono meno.</p></div>
  </div>`;
};

/* ---------- Ordini di aerei ---------- */
function infoModello(k) {
  const m = MOD[k];
  if (!m.dal) return SIM.superato(G, k) ? '<span class="badge b-warn">Superato: perde valore</span>' : '';
  return SIM.disponibile(G, k) ? '<span class="badge b-ok">Nuovo modello</span>' : `<span class="badge b-info">In servizio dal ${fmtGiorno(SIM.disponibileDal(G, k))}</span>`;
}
function opzioniConsegna(k) {
  const dal = SIM.disponibileDal(G, k), m = MOD[k];
  return [1, 12, 24].map(a => { const t = Math.max(G.ora + (a === 1 ? 30 : Math.round(a * 30.4)) * GIORNO, dal || 0), sc = SIM.SCONTO_ATTESA[a];
    return [a, `${a === 1 ? 'Il prima possibile' : `Tra ${a} mesi`} · ${fmtGiorno(t)}${sc ? ` · −${Math.round(sc * 100)}% (${mln(m.prezzo * (1 - sc))})` : ` · ${mln(m.prezzo)}`}`]; });
}
