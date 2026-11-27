'use strict';
// AvioGest — Finanza completa, clienti e tariffe per rotta, canali di vendita, marchio e recensioni,
// revisioni e leasing della flotta, centro operativo e diritti di traffico, alleanze globali, modalità esperto

/* ---------- Finanza ---------- */
const VOCI_CE = { carburante: 'Carburante', co2: 'Emissioni di CO₂', tasse: 'Tasse aeroportuali', handling: 'Assistenza a terra', navigazione: 'Navigazione', manutenzione: 'Manutenzione', servizio: 'Servizio di bordo', distribuzione: 'Distribuzione e commissioni', rimborsi: 'Rimborsi e assistenza', negati: 'Passeggeri lasciati a terra', equipaggi: 'Alberghi e trasferte equipaggi', soste: 'Soste fuori base', leasing: 'Leasing', personale: 'Personale', basi: 'Basi', hub: 'Hub', sede: 'Sede', marketing: 'Marketing', prodotto: 'Prodotto e fedeltà', fedelta: 'Premi fedeltà', alleanze: 'Alleanze', assicurazione: 'Assicurazione', altro: 'Altro' };
function pannelliFinanza() {
  const tab = UI.tabFin || 'indicatori', I = SIM.indicatori(G, 30), Rr = SIM.rating(G);
  const tabs = [['indicatori', 'Indicatori'], ['ce', 'Conto economico'], ['sp', 'Stato patrimoniale'], ['flussi', 'Flussi di cassa'], ['credito', 'Rating e finanziamenti']];
  let corpo = '';
  if (tab === 'indicatori') corpo = `<div class="kpi">
      <div><small>Ricavo per posto-km</small><b>${num(I.rask, 2)} cent</b><span>RASK · costo ${num(I.cask, 2)} cent</span></div>
      <div><small>Yield</small><b>${num(I.yield, 2)} cent</b><span>ricavo biglietti per passeggero-km</span></div>
      <div><small>Riempimento</small><b>${pct(I.lf)}</b><span>pareggio al ${pct(I.pareggio)}</span></div>
      <div><small>Ricavo per passeggero</small><b>${eur(I.ricavoPax)}</b><span>costo ${eur(I.costoPax)}</span></div>
      <div><small>Ore di volo per aereo</small><b>${num(I.oreAereo, 1)} h</b><span>al giorno</span></div>
      <div><small>Margine</small><b class="${I.margine < 0 ? 'neg' : ''}">${pct(I.margine)}</b><span>ultimi ${I.giorni} giorni</span></div></div>
    <p class="nota">Se il riempimento sta sotto quello di pareggio, ogni volo perde soldi: alza i prezzi, riduci i voli o usa aerei più piccoli. Le compagnie vere stanno tra 8 e 12 cent per posto-km.</p>`;
  if (tab === 'ce') {
    const per = UI.periodoCE || 30, ce = SIM.contoEconomico(G.storico.slice(-per));
    const voci = Object.entries(ce.dettaglio).filter(([k, v]) => v && k !== 'interessi').sort((a, b) => b[1] - a[1]);
    corpo = `<div class="segmenti" style="margin-bottom:10px">${[[30, 'Ultimi 30 giorni'], [90, 'Ultimi 90'], [365, 'Ultimo anno']].map(([n, t]) => `<button data-az="periodo-ce" data-n="${n}" class="${per === n ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="tab-wrap"><table class="bilancio"><tbody>
      <tr><td><b>Ricavi</b> <span class="piccolo muto">di cui servizi extra ${eur(ce.extra)}</span></td><td class="num"><b>${eur(ce.ricavi)}</b></td></tr>
      ${voci.map(([k, v]) => `<tr><td class="rientro">${VOCI_CE[k] || k}</td><td class="num">−${eur(v)}</td></tr>`).join('')}
      <tr class="tot"><td>Margine operativo lordo (EBITDA)</td><td class="num">${segno(ce.ebitda)}</td></tr>
      <tr><td class="rientro">Ammortamenti degli aerei</td><td class="num">−${eur(ce.amm)}</td></tr>
      <tr class="tot"><td>Risultato operativo (EBIT)</td><td class="num">${segno(ce.ebit)}</td></tr>
      <tr><td class="rientro">Interessi</td><td class="num">−${eur(ce.interessi)}</td></tr>
      <tr class="tot"><td>Utile prima delle imposte</td><td class="num">${segno(ce.anteImposte)}</td></tr>
      <tr><td class="rientro">Imposte stimate (24%)</td><td class="num">−${eur(ce.imposte)}</td></tr>
      <tr class="tot"><td><b>Utile netto</b></td><td class="num"><b>${segno(ce.netto)}</b></td></tr></tbody></table></div>
      <p class="nota">Le imposte si pagano davvero il 1° gennaio sull’utile dell’anno prima; le perdite si scalano dagli anni successivi.${(G.tasse || []).length ? ` Ultime pagate: ${eur(G.tasse[0].tasse)} sul ${G.tasse[0].anno}.` : ''}</p>`;
  }
  if (tab === 'sp') {
    const S = SIM.statoPatrimoniale(G);
    corpo = `<div class="griglia g2"><div><h3>Attivo</h3><table class="bilancio"><tbody>
      <tr><td>Cassa</td><td class="num">${eur(S.attivo.cassa)}</td></tr><tr><td>Aerei di proprietà</td><td class="num">${eur(S.attivo.aerei)}</td></tr>
      <tr><td>Acconti su aerei ordinati</td><td class="num">${eur(S.attivo.acconti)}</td></tr><tr><td>Slot aeroportuali</td><td class="num">${eur(S.attivo.slot)}</td></tr>
      <tr class="tot"><td>Totale</td><td class="num">${eur(S.totaleAttivo)}</td></tr></tbody></table></div>
      <div><h3>Passivo</h3><table class="bilancio"><tbody>
      <tr><td>Scoperto di cassa</td><td class="num">${eur(S.passivo.scoperto)}</td></tr><tr><td>Prestiti bancari</td><td class="num">${eur(S.passivo.banche)}</td></tr>
      <tr><td>Obbligazioni</td><td class="num">${eur(S.passivo.obbligazioni)}</td></tr><tr><td>Miglia dei soci da riscattare</td><td class="num">${eur(S.passivo.miglia)}</td></tr>
      <tr class="tot"><td>Totale</td><td class="num">${eur(S.totalePassivo)}</td></tr>
      <tr class="tot"><td><b>Patrimonio netto</b></td><td class="num"><b>${segno(S.patrimonio)}</b></td></tr></tbody></table></div></div>
      ${S.impegniFuturi ? `<p class="nota">Impegni futuri: ${eur(S.impegniFuturi)} da pagare alla consegna degli aerei ordinati.</p>` : ''}`;
  }
  if (tab === 'flussi') {
    const ce = SIM.contoEconomico(G.storico.slice(-90));
    corpo = `<table class="bilancio"><tbody><tr><td>Dalla gestione (voli e costi fissi)</td><td class="num">${segno(ce.operativo)}</td></tr>
      <tr><td>Investimenti (aerei, slot, acquisizioni, ammodernamenti)</td><td class="num">${segno(ce.investimenti)}</td></tr>
      <tr><td>Finanziamenti (prestiti, rate, obbligazioni, borsa, dividendi)</td><td class="num">${segno(ce.finanziamenti)}</td></tr>
      <tr class="tot"><td><b>Variazione della cassa · ultimi 90 giorni</b></td><td class="num"><b>${segno(ce.operativo + ce.investimenti + ce.finanziamenti)}</b></td></tr></tbody></table>`;
  }
  if (tab === 'credito') corpo = `<div class="kpi"><div><small>Rating</small><b class="${Rr.i >= 4 ? 'neg' : Rr.i <= 1 ? 'pos' : ''}">${Rr.sigla}</b><span>tasso base ${(Rr.tasso * 100).toFixed(1)}%</span></div>
      <div><small>Debito / margine annuo</small><b>${Rr.leva > 50 ? '—' : num(Rr.leva, 1) + '×'}</b><span>sotto 4× è sano</span></div><div><small>Cassa</small><b>${Math.max(0, Math.round(Rr.giorni))} giorni</b><span>di costi fissi</span></div></div>
    <div class="griglia g2"><div class="pannello carta"><h3>Obbligazioni</h3><p class="piccolo">Prendi denaro dal mercato e restituisci tutto il capitale alla scadenza. Serve un rating almeno BB.</p>
      <div class="filtri"><input type="number" id="impObbl" min="5000000" step="1000000" value="20000000" style="width:130px" aria-label="Importo"><select id="anniObbl">${opzioni([[3, '3 anni'], [5, '5 anni'], [7, '7 anni']], 5)}</select><button data-az="obbligazione" ${Rr.i > 3 ? 'disabled' : ''}>Emetti</button></div></div>
    <div class="pannello carta"><h3>Coperture</h3>
      <div class="riga"><span>Cherosene</span><span>${G.copertura ? `bloccato a ${G.copertura.prezzo.toFixed(2)} €/kg fino al ${fmtGiorno(G.copertura.fine)}` : 'a prezzo di mercato'}</span></div>
      <div class="filtri"><button class="piccolo" data-az="cop-carb" data-m="3">3 mesi</button><button class="piccolo" data-az="cop-carb" data-m="6">6 mesi</button><button class="piccolo" data-az="cop-carb" data-m="12">12 mesi</button></div>
      <div class="riga"><span>Euro/dollaro</span><span>${G.coperturaCambio ? `bloccato a ${G.coperturaCambio.cambio.toFixed(3)} fino al ${fmtGiorno(G.coperturaCambio.fine)}` : `di mercato (${(G.cambio || 1.1).toFixed(3)})`}</span></div>
      <div class="filtri"><button class="piccolo" data-az="cop-cambio" data-m="6">6 mesi</button><button class="piccolo" data-az="cop-cambio" data-m="12">12 mesi</button></div>
      <p class="nota">Una copertura blocca il prezzo di oggi: ti protegge dai rialzi, ma se il prezzo scende paghi di più.</p></div></div>`;
  return `<div class="pannello"><div class="segmenti schede-fin">${tabs.map(([k, t]) => `<button data-az="tab-fin" data-t="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div><div class="mt">${corpo}</div></div>`;
}

/* ---------- Rotta: clienti, previsioni, tariffe ---------- */
function pannelloClientiRotta(k) {
  const [a, b] = k.split('-'), r = G.rotte[k], mix = SIM.mixTariffe(G, k, a, b), s = mix.seg, d = SIM.km(a, b);
  // previsione dei prossimi 14 giorni con l'offerta attuale
  const g0 = SIM.giornoDopo(SIM.mezzanotte(G.ora)), f = Math.max(1, freqRotta(k) / 2), postiG = postiDirezione(a, b).p, posti = CL.reduce((x, c) => x + (postiG[c] || 0), 0) || f * 170;
  const prev = Array.from({ length: 14 }, (_, i) => { const t = SIM.giornoDopo(g0, i), am = SIM.analisiMercato(G, a, b, t, f, r.pY, 1, { stima: true }); return { t, lf: Math.min(1.2, am.pax * mix.domanda / posti) }; });
  const prom = (G.promozioni || []).filter(p => p.k === k);
  return `<div class="pannello mt carta"><h2>Clienti e tariffe</h2>
    <div class="griglia g2"><div>
      <p class="piccolo"><b>Chi vola qui:</b> ${pct(s.affari)} affari · ${pct(s.vacanza)} vacanza · ${pct(s.parenti)} visite a parenti e amici</p>
      <p class="piccolo muto">Chi viaggia per lavoro vuole voli la mattina presto e la sera e prenota tardi pagando di più; chi va in vacanza prenota presto e cerca le promozioni, soprattutto per il weekend.</p>
      <div class="riga"><span>Posti in promozione (−20%)</span><b>${pct(SIM.quotaPromo(G, k))}${G.esperto && r.promo != null ? '' : ' · automatico'}</b></div>
      <div class="riga"><span>Incasso medio rispetto alla tariffa</span><b>${pct(mix.resa)}</b></div>
      ${G.esperto ? `<div class="form mt"><label>Posti in promozione<select data-rt="promo" data-k="${k}">${opzioni([['', 'Automatico'], [0, 'Nessuno'], [0.1, '10%'], [0.2, '20%'], [0.3, '30%'], [0.45, '45%'], [0.6, '60%']], r.promo ?? '')}</select></label>
        <label>Alta stagione<select data-rt="alta" data-k="${k}">${opzioni([[1, 'Stesso prezzo'], [1.1, '+10%'], [1.2, '+20%'], [1.3, '+30%']], r.alta || 1)}</select></label>
        <label>Weekend<select data-rt="weekend" data-k="${k}">${opzioni([[0.9, '−10%'], [1, 'Stesso prezzo'], [1.1, '+10%'], [1.2, '+20%']], r.weekend || 1)}</select></label></div>` : '<p class="nota">In modalità esperto scegli tu posti in promozione, prezzi di alta stagione e del weekend.</p>'}
      <div class="filtri mt"><button data-az="promozione" data-k="${k}" data-s="0.2" data-g="14">Promozione −20% per 14 giorni · 3.000 €</button></div>
      ${prom.length ? `<p class="piccolo pos">Promozione attiva: −${Math.round(prom[0].sconto * 100)}% fino al ${fmtGiorno(prom[0].fine)}</p>` : ''}</div>
    <div><p class="piccolo"><b>Riempimento previsto nei prossimi 14 giorni</b> (${a}→${b}, con i voli e i prezzi di oggi)</p>
      <div class="previsione">${prev.map(x => `<span style="height:${Math.round(Math.min(1, x.lf) * 100)}%" class="${x.lf > 0.95 ? 'pieno' : x.lf < 0.6 ? 'vuoto' : ''}" data-tip="${h(fmtGiorno(x.t))}: ${pct(x.lf)}"><i>${GS3[SIM.giornoSett(x.t)].slice(0, 1)}</i></span>`).join('')}</div>
      <p class="nota">Barre rosse: voli quasi pieni (alza i prezzi o aggiungi voli); grigie: troppi posti vuoti (promozioni o meno voli).${SIM.studiato(G, a, b) ? '' : ' Stima senza studio di mercato: ±30%.'}</p></div></div></div>`;
}

/* ---------- Canali di vendita, marchio, recensioni ---------- */
function pannelloCanali() {
  const C = SIM.canali(G), K = G.canali || {};
  return `<div class="pannello mt carta"><h2>Canali di vendita</h2>
    <div class="riga"><span>Sito e app</span><b>${pct(C.sito)}</b></div><div class="riga"><span>Agenzie online</span><b>${pct(C.ota)}</b></div><div class="riga"><span>Agenzie per le aziende</span><b>${pct(C.aziende)}</b></div>
    <div class="riga"><span>Costo medio di distribuzione</span><b>${pct(C.costo)} dei biglietti</b></div>
    <label class="interruttore" style="border:0"><input type="checkbox" data-canale="ota" ${K.ota !== false ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Vendi sulle agenzie online</b><small>Commissione 4%, ma senza di loro perdi circa il 10% dei clienti</small></span></label>
    <label class="interruttore" style="border:0"><input type="checkbox" data-canale="aziende" ${K.aziende ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Contratti con le aziende</b><small>+12% di clienti d’affari, con uno sconto dell’8% sulle loro tariffe</small></span></label>
    <p class="nota">Il nuovo sito e l’app (progetti del CTO) spostano vendite sul canale che costa meno.</p></div>`;
}
function pannelloMarchio() {
  const N = Object.entries(G.notorieta || {}).sort((x, y) => y[1] - x[1]), st = G.stelle ?? 3.2;
  return `<div class="pannello mt"><h2>Marchio e recensioni</h2><div class="griglia g2"><div>
    <p class="stelle" aria-label="${st.toFixed(1)} stelle su 5">${'★'.repeat(Math.round(st))}${'☆'.repeat(5 - Math.round(st))} <b>${st.toFixed(1)}</b></p>
    <p class="piccolo muto">Voto medio dei passeggeri: puntualità, cancellazioni, servizio di bordo, coincidenze perse. Ogni mezza stella vale circa il 3% di clienti in più o in meno.</p></div>
    <div><p class="piccolo"><b>Notorietà per città</b>: cresce dove voli spesso e fai pubblicità, cala dove sparisci.</p>
    <ul class="elenco">${N.slice(0, 10).map(([c, n]) => `<li><span>${h(c)}</span><span class="spazio"></span>${barretta(n, pct(n), [2, 2])}</li>`).join('')}</ul></div></div></div>`;
}

/* ---------- Flotta: revisioni, leasing, consumi, ammodernamenti ---------- */
function righeFlottaAvanzata(ae) {
  const m = MOD[ae.modello], dC = Math.ceil((ae.prossimaC - G.ora) / GIORNO), dD = Math.ceil((ae.prossimaD - G.ora) / GIORNO);
  const lav = ae.lavori && ['C', 'D', 'ammodernamento'].includes(ae.lavori.tipo);
  return `<div class="riga"><span>Revisioni</span><span class="${dC < 30 || dD < 30 ? 'neg' : ''}">C ${dC > 0 ? `tra ${dC} gg` : 'scaduta'} · D ${dD > 0 ? `tra ${Math.round(dD / 30)} mesi` : 'scaduta'}</span></div>
    ${lav ? `<div class="riga"><span>Lavori</span><span>${ae.lavori.tipo === 'ammodernamento' ? SIM.AMMODERNAMENTI[ae.lavori.cosa].nome : SIM.REVISIONI[ae.lavori.tipo].nome} fino al ${fmtGiorno(ae.lavori.fine)}</span></div>` : ''}
    <div class="riga"><span>Consumi</span><span>${pct((1 + 0.006 * ae.eta) * (ae.consumoF || 1))} del modello nuovo${ae.ammodernamenti?.length ? ' · ' + ae.ammodernamenti.map(x => SIM.AMMODERNAMENTI[x].nome.toLowerCase()).join(', ') : ''}</span></div>
    ${ae.modo === 'leasing' && ae.leasingFine ? `<div class="riga"><span>Leasing fino al</span><span>${fmtGiorno(ae.leasingFine)}${ae.restituire ? ' · <b>da restituire</b>' : ''}</span></div>` : ''}
    <div class="azioni">${G.esperto && !ae.lavori && ae.stato !== 'consegna' ? `<button class="piccolo" data-az="revisione" data-id="${ae.id}" data-t="C">Revisione C ora</button><button class="piccolo" data-az="revisione" data-id="${ae.id}" data-t="C" data-q="inverno">C in inverno</button>` : ''}
      ${!ae.lavori && ae.stato !== 'consegna' ? Object.entries(SIM.AMMODERNAMENTI).filter(([k, X]) => !(ae.ammodernamenti || []).includes(k)).map(([k, X]) => `<button class="piccolo" data-az="ammoderna" data-id="${ae.id}" data-c="${k}">${k === 'winglet' ? 'Alette' : 'Motori nuovi'} · ${mln(X.costo(m))}</button>`).join('') : ''}
      ${G.esperto && ae.modo === 'leasing' ? `<button class="piccolo" data-az="leasing-scelta" data-id="${ae.id}" data-s="${ae.restituire ? 'tieni' : 'restituisci'}">${ae.restituire ? 'Rinnova alla scadenza' : 'Restituisci alla scadenza'}</button>` : ''}</div>`;
}

/* ---------- Centro operativo e diritti di traffico ---------- */
VISTE.operazioni = () => {
  const I = G.irops || {}, D0 = Object.entries(G.diritti || {}), log = G.iropsLog || [];
  return `<div class="testata"><h1>Centro operativo</h1><span class="sotto">Come reagisce la compagnia a guasti e cancellazioni, e i permessi per volare fuori continente</span></div>
  <div class="griglia g2"><div class="pannello"><h2>Gestione delle irregolarità</h2>
    <label class="interruttore" style="border:0"><input type="checkbox" data-irops="riserva" ${I.riserva !== false ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Aerei di riserva</b><small>Se un aereo si guasta, un aereo dello stesso tipo fermo nello stesso aeroporto prende il suo volo</small></span></label>
    <label class="interruttore" style="border:0"><input type="checkbox" data-irops="riprotezione" ${I.riprotezione !== false ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Riprotezione dei passeggeri</b><small>I passeggeri di un volo cancellato passano sul prossimo volo della stessa rotta: tieni l’incasso e paghi solo l’assistenza</small></span></label>
    <p class="nota">Se un guasto si risolve entro 3 ore il volo parte in ritardo invece di essere cancellato.</p>
    <h3 class="mt">Ultimi interventi</h3>${log.length ? `<ul class="elenco">${log.slice(0, 15).map(x => `<li><span class="piccolo muto">${fmtGiorno(x.t)}</span><span class="piccolo">${h(x.testo)}</span></li>`).join('')}</ul>` : '<p class="muto piccolo">Nessun intervento finora.</p>'}</div>
  <div class="pannello"><h2>Diritti di traffico</h2><p class="piccolo">Per volare tra continenti diversi servono i permessi dei due paesi: si chiedono da soli quando apri la rotta (50.000 €, risposta in 1–2 mesi).</p>
    ${D0.length ? `<ul class="elenco">${D0.map(([k, x]) => `<li><b>${k.replace('-', ' – ')}</b><span class="spazio"></span>${x.stato === 'concessi' ? '<span class="badge b-ok">Concessi</span>' : x.stato === 'attesa' ? `<span class="badge b-info">Risposta entro il ${fmtGiorno(x.pronto)}</span>` : `<span class="badge b-err">Negati</span>${G.ora >= x.riprova ? ` <button class="piccolo" data-az="diritti" data-k="${k}">Richiedi di nuovo</button>` : ` <span class="piccolo muto">riprova dal ${fmtGiorno(x.riprova)}</span>`}`}</li>`).join('')}</ul>` : '<p class="muto piccolo">Nessuna rotta fuori continente.</p>'}</div></div>`;
};

/* ---------- Alleanze globali ---------- */
function pannelloAlleanzeGlobali() {
  const A0 = SIM.ALLEANZE_G, mia = G.globale;
  return `<div class="pannello mt"><h2>Alleanze globali</h2><p class="piccolo">Tre grandi alleanze di compagnie: entrarci porta passeggeri in coincidenza (+4% di domanda, +8% sulle rotte tra continenti) e pace con tutti i membri. Servono reputazione 55 e 8 aerei; quota d’ingresso ${mln(SIM.QUOTA_GLOBALE)} e ${eur(SIM.CANONE_GLOBALE)} al giorno.</p>
    <div class="strategie">${Object.entries(A0).map(([id, X]) => { const membri = G.rivali.filter(r => r.globale === id);
      return `<div class="strategia ${mia === id ? 'on' : ''}"><b>${h(X.nome)}</b><p class="piccolo">${membri.length ? membri.map(r => `<span class="pallino" style="background:${r.colore}"></span>${h(r.nome)}`).join(' · ') : 'nessun membro rimasto'}</p>
        ${mia === id ? `<span class="badge b-ok">Ne fai parte</span><button class="piccolo pericolo" data-az="lascia-alleanza">Esci · penale 1 M€</button>` : mia ? '' : `<button class="piccolo" data-az="aderisci" data-id="${id}">Aderisci</button>`}</div>`; }).join('')}</div></div>`;
}
