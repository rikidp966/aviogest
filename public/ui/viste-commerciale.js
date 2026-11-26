'use strict';
// AvioGest — Rotte e prezzi, Ricavi, Hub, Marketing

/* Rotte e prezzi */
VISTE.rotte = () => {
  const righe = Object.entries(G.rotte).sort((a, b) => a[0].localeCompare(b[0]));
  return `<div class="testata"><h1>Rotte e prezzi</h1><span class="sotto">${righe.length} rotte aperte</span><span class="spazio"></span><button class="primario" data-az="apri-rotta">+ Apri nuova rotta</button></div>
  <div class="pannello"><div class="tab-wrap">${righe.length ? `<table><thead><tr><th>Rotta</th><th class="num">Km</th><th class="num">Voli/sett.</th><th>Business</th><th>Premium</th><th>Economy</th><th>Quota</th><th>Concorrenti</th><th>Load factor 7 gg</th><th class="num">Ricavi 7 gg</th><th class="num">Utile voli 7 gg</th><th></th></tr></thead><tbody>
    ${righe.map(([k, r]) => { const [a, b] = k.split('-'), d = SIM.km(a, b), ref = SIM.prezzoRif(d), s = statsRotta(k), riv = SIM.rivaliSu(G, a, b), f = freqRotta(k);
      const sal = salute().rotte[k];
      return `<tr><td>${semaforo(sal)}<a class="link-rotta" href="#/rotta/${k}"><b>${a}–${b}</b></a> <span class="muto piccolo">${h(citta(a))}–${h(citta(b))}</span>${sal && sal.c !== 'verde' && sal.c !== 'grigio' ? `<br><span class="piccolo sal-txt ${sal.c}">${h(sal.t)}</span>` : ''}</td><td class="num">${num(d)}</td><td class="num">${num(f * 7)}</td>
      ${CL.map(c => `<td><input class="prezzo" type="number" min="10" step="1" value="${r['p' + c]}" data-prezzo="${k}" data-cl="${c}" title="Riferimento ${eur(ref * SIM.multClasse(c, d))}"></td>`).join('')}
      <td>${f ? barretta(r.quota || 0, null, [2, 2]) : '<span class="muto piccolo">nessun volo</span>'}${(() => { const sp = Math.max(SIM.spinta(G, a, b).tot, SIM.spinta(G, b, a).tot); return sp > 0.01 ? `<span class="badge b-info" title="Effetto della pubblicità sull’attrattività">📣 +${Math.round(sp * 100)}%</span>` : ''; })()}</td>
      <td>${riv.length ? [...new Map(riv.map(x => [x.riv.id, x])).values()].map(x => `<span class="pallino" style="background:${x.riv.colore}" title="${h(x.riv.nome)}"></span>${h(x.riv.nome)}${x.guerra ? ' <span class="badge b-err">sconti</span>' : ''}`).join('<br>') : '<span class="muto">nessuno</span>'}</td>
      <td>${s.posti ? barretta(s.pax / s.posti, null, [0.95, 1.01]) : '<span class="muto">—</span>'}</td><td class="num">${s.voli ? eur(s.ricavi) : '—'}</td><td class="num">${s.voli ? segno(s.ricavi - s.costi) : '—'}</td>
      <td><button class="piccolo" data-az="analisi" data-k="${k}">Analisi prezzi</button> <button class="piccolo pericolo" data-az="chiudi-rotta" data-k="${k}">Chiudi</button></td></tr>`; }).join('')}
  </tbody></table>` : '<p class="vuoto">Nessuna rotta aperta. Apri la prima dalla tua base!</p>'}</div>
  <p class="nota">Ogni classe ha la sua tariffa (passa sopra la casella per il riferimento). Prezzi alti riducono domanda e quota; se una classe è piena o manca sull’aereo, parte dei clienti scende di classe. Una rotta nuova raggiunge la piena domanda in circa 2 mesi. Dettaglio per classe nella pagina Ricavi.</p></div>`;
};
function formApriRotta() {
  const base = G.basi[0], ordina = perContinente();
  modale({
    titolo: 'Apri una nuova rotta', larga: true,
    corpo: `<div class="form"><label>Da<select id="rDa">${opzioniAeroporti(ordina, base, a => G.hub.includes(a.iata) ? ' (hub)' : G.basi.includes(a.iata) ? ' (base)' : '')}</select></label>
      <label>A<select id="rA">${'<option value="">— scegli —</option>' + opzioniAeroporti(ordina.filter(a => a.iata !== base), '')}</select></label></div>
      <div id="infoRotta" class="mt"></div>`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma-rotta">Apri rotta (30.000 €)</button>`
  });
  infoRotta();
}
function infoRotta() {
  const a = $('#rDa')?.value, b = $('#rA')?.value, box = $('#infoRotta'); if (!box) return;
  if (!a || !b || a === b) { box.innerHTML = '<p class="muto">Scegli origine e destinazione per vedere l’analisi di mercato.</p>'; return; }
  const d = SIM.km(a, b), domani = SIM.giornoDopo(SIM.mezzanotte(G.ora)), am = SIM.analisiMercato(G, a, b, domani, 3, SIM.prezzoRif(d), 1, { stima: true }), forb = am.studiato ? 0.08 : 0.3, rng = v => am.studiato ? num(v) : `${num(v * (1 - forb))}–${num(v * (1 + forb))}`;
  const modelli = [...new Set(flotta().map(x => x.modello))], ok = modelli.filter(x => MOD[x].autonomia >= d), slot = [a, b].filter(i => AP[i].slot), q = am.quote;
  box.innerHTML = `<table><tbody>
    <tr><td>Distanza</td><td><b>${num(d)} km</b> · ${d > 5000 ? `${fmtDur(SIM.durata(d, 'A359'))} con un A350` : `${fmtDur(SIM.durata(d, 'A320'))} con un A320, ${fmtDur(SIM.durata(d, 'ATR72'))} con un ATR`}${AP[a].fuso !== AP[b].fuso ? ` · fuso orario ${fusoTxt(AP[a].fuso)} → ${fusoTxt(AP[b].fuso)}` : ''}</td></tr>
    <tr><td>Domanda totale stimata</td><td><b>${rng(am.mercato)}</b> viaggiatori al giorno per direzione (tutti i mezzi) ${am.studiato ? '<span class="badge b-ok">studiata</span>' : `<span class="badge">stima ±30%</span> <button class="piccolo" data-az="studio" data-da="${a}" data-a="${b}">Studio di domanda · 15k</button>`}</td></tr>
    <tr><td>Clientela</td><td>${CL.map(c => `<span class="chip"><i style="background:var(--cl-${c})"></i>${CLS[c].nome} ${pct(q[c])}</span>`).join('')}</td></tr>
    <tr><td>Con 3 voli al giorno ai prezzi di riferimento</td><td>circa <b>${rng(am.pax / am.maturita)}</b> passeggeri al giorno per direzione a regime (${pct(am.quota)} di quota)</td></tr>
    <tr><td>Concorrenti</td><td>${am.rivali.length ? am.rivali.map(x => `<span class="pallino" style="background:${x.riv.colore}"></span>${h(x.riv.nome)} (${x.freq} voli/g, ${pct(x.quota)})`).join(' · ') : 'nessuno'} · ${d > 3000 ? 'altre compagnie' : 'treno, auto e traghetti'} ${pct(am.altri)}</td></tr>
    <tr><td>Aerei che possono volarci</td><td>${modelli.length ? (ok.length ? ok.map(x => MOD[x].nome).join(', ') : '<span class="neg">nessuno della tua flotta</span>') : '—'}</td></tr>
    <tr><td>Slot</td><td>${slot.length ? slot.map(i => `${i} è regolato: hai ${G.slot[i] || 0} slot`).join('<br>') : 'nessun aeroporto a slot'}</td></tr>
    ${G.hub.some(H => H === a || H === b) ? `<tr><td>Hub</td><td>La rotta tocca un tuo hub: oltre ai passeggeri locali porterà passeggeri in coincidenza.</td></tr>` : ''}
  </tbody></table>`;
}
function analisiPrezzi(k, cl = UI.classeAnalisi) {
  const [a, b] = k.split('-'), r = G.rotte[k], d = SIM.km(a, b), ref = SIM.prezzoRif(d), domani = SIM.giornoDopo(SIM.mezzanotte(G.ora));
  const { p: cap, voli } = postiDirezione(a, b), f = Math.max(1, Math.round(voli));
  if (!cap[cl] && voli) cl = CL.find(c => cap[c]) || 'Y';
  const capC = cap[cl] || (cl === 'Y' ? 150 * f : 12 * f);
  const righe = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.7].map(m => {
    const p = Math.round(ref * SIM.multClasse(cl, d) * m), prezzi = { pJ: r.pJ, pW: r.pW, pY: r.pY, ['p' + cl]: p };
    const am = SIM.analisiMercato(G, a, b, domani, f, prezzi.pY, 1, { stima: true }), dom = SIM.domandaClassi(am.pax, am.quote, prezzi, am.ref, am.km, am.val);
    const pax = Math.min(capC, dom[cl]);
    return { p, pax, lf: pax / capC, ric: pax * p, quota: am.quota };
  });
  const best = righe.reduce((x, y) => y.ric > x.ric ? y : x);
  modale({
    titolo: `Analisi prezzi ${a}→${b}${SIM.studiato(G, a, b) ? '' : ' · stima generica ±30%'}`, larga: true,
    corpo: `<div class="segmenti" style="margin-bottom:10px">${CL.map(c => `<button data-az="analisi-cl" data-k="${k}" data-c="${c}" class="${c === cl ? 'on' : ''}">${CLS[c].nome}</button>`).join('')}</div>
      <p class="piccolo">Stima per domani con ${f} voli al giorno in questa direzione e ${num(capC)} posti ${CLS[cl].nome} offerti${cap[cl] ? '' : ' (ipotetici: nessun tuo aereo ha questa classe)'}. Prezzo attuale: <b>${eur(r['p' + cl])}</b>. ${cl === 'Y' ? 'Il prezzo Economy cambia anche la quota di mercato complessiva.' : 'Le altre classi restano ai prezzi attuali.'}</p>
      <table><thead><tr><th class="num">Prezzo ${CLS[cl].nome}</th><th class="num">Passeggeri/g</th><th>Riempimento</th><th class="num">Ricavi ${CLS[cl].breve}/g</th><th></th></tr></thead><tbody>
      ${righe.map(x => `<tr ${x === best ? 'style="font-weight:700"' : ''}><td class="num">${eur(x.p)}</td><td class="num">${num(x.pax)}</td><td>${barretta(x.lf, null, [0.97, 2])}</td><td class="num">${eur(x.ric)}</td><td><button class="piccolo" data-az="applica-prezzo" data-k="${k}" data-c="${cl}" data-p="${x.p}">Applica</button>${x === best ? ' <span class="badge b-ok">massimo ricavo</span>' : ''}</td></tr>`).join('')}</tbody></table>
      <p class="nota">Il ricavo massimo non è sempre il profitto massimo: tasse, handling e servizio si pagano per passeggero. Con le classi piene, una parte dei clienti scende di classe.</p>`
  });
}

/* Ricavi */
VISTE.ricavi = () => {
  const n = UI.ricaviPer, u = ultimi(n), giorni = G.storico.slice(-Math.max(n, 30));
  const righe = Object.keys(G.rotte).map(k => [k, statsRotta(k, n)]).filter(([, s]) => s.voli).sort((a, b) => b[1].ricavi - a[1].ricavi);
  const aerei = flotta().map(ae => [ae, statsAereo(ae.id, n)]);
  return `<div class="testata"><h1>Ricavi</h1><span class="spazio"></span>
    <div class="segmenti">${[[1, 'Ieri'], [7, '7 giorni'], [30, '30 giorni']].map(([k, t]) => `<button data-az="ricavi-per" data-n="${k}" class="${n === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
  <div class="kpi">
    <div><small>Ricavi biglietti</small><b>${mln(u.ricavi)}</b><span>${num(u.pax)} passeggeri · ${eur(u.pax ? u.ricavi / u.pax : 0)} a testa</span></div>
    ${CL.map(c => `<div><small><span class="chip"><i style="background:var(--cl-${c})"></i>${CLS[c].nome}</span></small><b>${mln(u.ricaviC[c])}</b><span>${num(u.paxC[c])} pax · tariffa media ${eur(u.paxC[c] ? u.ricaviC[c] / u.paxC[c] : 0)} · ${pct(u.ricavi ? u.ricaviC[c] / u.ricavi : null)} dei ricavi</span></div>`).join('')}
    <div><small>Passeggeri in coincidenza</small><b>${num(u.transito)}</b><span>${mln(u.ricaviTransito)} di ricavi dagli hub</span></div>
  </div>
  <div class="pannello"><h2>Ricavi per classe · ultimi ${giorni.length} giorni</h2>${giorni.length ? graficoClassi(giorni.map(x => ({ t: x.t, c: x.ricaviC || { J: 0, W: 0, Y: x.ricavi } }))) : '<p class="vuoto">Dati disponibili dopo il primo giorno</p>'}</div>
  <div class="pannello"><h2>Per rotta</h2><div class="tab-wrap">${righe.length ? `<table><thead><tr><th>Rotta</th><th class="num">Voli</th>${CL.map(c => `<th class="num">${CLS[c].breve}: pax</th><th>Riemp.</th><th class="num">Tariffa media</th><th class="num">Ricavi</th>`).join('')}<th class="num">In transito</th><th class="num">Totale</th><th class="num">Utile voli</th></tr></thead><tbody>
    ${righe.map(([k, s]) => `<tr><td><b>${k.replace('-', '–')}</b></td><td class="num">${s.voli}</td>${CL.map(c => s.postiC[c] ? `<td class="num">${num(s.paxC[c])}</td><td>${barretta(s.paxC[c] / s.postiC[c], null, [2, 2])}</td><td class="num">${s.paxC[c] ? eur(s.ricaviC[c] / s.paxC[c]) : '—'}</td><td class="num">${eur(s.ricaviC[c])}</td>` : '<td class="muto num">—</td><td></td><td></td><td></td>').join('')}<td class="num">${num(s.transito)}</td><td class="num"><b>${eur(s.ricavi)}</b></td><td class="num">${segno(s.ricavi - s.costi)}</td></tr>`).join('')}
  </tbody></table>` : '<p class="vuoto">Nessun volo nel periodo.</p>'}</div></div>
  <div class="pannello"><h2>Per aereo</h2><div class="tab-wrap"><table><thead><tr><th>Aereo</th><th>Cabina</th><th class="num">Ore di volo</th><th class="num">Ricavi</th><th class="num">Costi dei voli</th><th class="num">Leasing nel periodo</th><th class="num">Utile netto</th></tr></thead><tbody>
    ${aerei.map(([ae, s]) => { const lea = ae.modo === 'leasing' ? ae.leasing * Math.min(n, u.n) : 0; return `<tr><td><b>${h(ae.marche)}</b> <span class="muto piccolo">${ae.modello}</span></td><td>${chipCab(ae.cab)}</td><td class="num">${num(s.ore, 1)}</td><td class="num">${eur(s.ricavi)}</td><td class="num">${eur(s.costi)}</td><td class="num">${lea ? eur(lea) : '—'}</td><td class="num">${segno(s.ricavi - s.costi - lea)}</td></tr>`; }).join('')}
  </tbody></table></div><p class="nota">Utile netto per aereo = ricavi − costi dei voli − leasing (stipendi e sede esclusi).</p></div>`;
};

/* Hub e coincidenze */
VISTE.hub = () => {
  const u7 = ultimi(7);
  let s = `<div class="testata"><h1>Hub e coincidenze</h1><span class="sotto">Un hub vende viaggi A→hub→B tra i tuoi voli, se l’attesa è tra ${D.HUB.mct} e ${D.HUB.attesaMax} minuti e non voli già A–B diretto.</span></div>`;
  if (!G.hub.length) return s + `<div class="pannello"><h2>Nessun hub</h2><p>Trasforma una base in hub (${eur(D.HUB.costo)} una tantum, ${eur(D.HUB.giornaliero)} al giorno). Poi organizza i voli “a ondate”: arrivi da molte città in una fascia oraria, e partenze verso altre città 45–120 minuti dopo.</p>
    <div class="filtri">${G.basi.map(b => `<button class="primario" data-az="apri-hub" data-i="${b}">Rendi hub ${b} · ${h(citta(b))}</button>`).join('')}</div></div>`;
  s += `<div class="kpi"><div><small>Passeggeri in transito 7 giorni</small><b>${num(u7.transito)}</b><span>${num(u7.transito / Math.max(1, u7.n))} al giorno</span></div><div><small>Ricavi da coincidenze 7 giorni</small><b>${mln(u7.ricaviTransito)}</b><span>${pct(u7.ricavi ? u7.ricaviTransito / u7.ricavi : null)} dei ricavi</span></div></div>`;
  for (const H of G.hub) {
    const conn = SIM.coincidenze(G, H), oggi = SIM.mezzanotte(G.ora), dom = SIM.giornoDopo(oggi);
    const valide = conn.filter(c => !c.diretto), mercati = new Map();
    for (const c of valide) { const k = c.f1.da + '>' + c.f2.a; const m = mercati.get(k) || { o: c.f1.da, d: c.f2.a, n: 0, best: 1e9, pax: 0 }; m.n++; m.best = Math.min(m.best, c.gap); m.pax += c.pax; mercati.set(k, m); }
    const voliOggi = G.voli.filter(v => v.dep >= oggi && v.dep < dom && v.stato !== 'canc');
    const arr = voliOggi.filter(v => v.a === H), par = voliOggi.filter(v => v.da === H);
    const s7 = G.storico.slice(-7).reduce((a, x) => { const y = x.hub?.[H]; if (y) { a.t += y.transito; a.r += y.ricavi; } return a; }, { t: 0, r: 0 });
    s += `<div class="pannello"><div class="testata" style="margin-bottom:8px"><h2 style="margin:0">Hub di ${h(citta(H))} (${H})</h2><span class="sotto">7 giorni: ${num(s7.t)} passeggeri in transito · ${mln(s7.r)}</span><span class="spazio"></span><button class="piccolo pericolo" data-az="chiudi-hub" data-i="${H}">Chiudi hub</button></div>
      <p class="piccolo">Ondate di oggi: <span class="chip"><i style="background:var(--cl-Y)"></i>arrivi (${arr.length})</span><span class="chip"><i style="background:var(--cl-J)"></i>partenze (${par.length})</span></p>
      <div class="banco">${arr.map(v => `<span class="arr" style="left:${(v.arr - oggi) / GIORNO * 100}%" data-tip="${h(`Arrivo ${v.num} da ${v.da} alle ${fmtOra(v.arr)}`)}"></span>`).join('')}</div>
      <div class="banco">${par.map(v => `<span class="par" style="left:${(v.dep - oggi) / GIORNO * 100}%" data-tip="${h(`Partenza ${v.num} per ${v.a} alle ${fmtOra(v.dep)}`)}"></span>`).join('')}</div>
      <div class="crono" style="min-width:0"><div class="scala" style="position:relative;height:18px;font-size:11px;color:var(--testo-3)">${Array.from({ length: 9 }, (_, i) => `<span style="position:absolute;left:${i * 12.5}%;transform:translateX(-50%)">${pad(i * 3)}:00</span>`).join('')}</div></div>
      <h3 class="mt">Mercati in coincidenza (oggi e domani)</h3>
      ${mercati.size ? `<div class="tab-wrap"><table><thead><tr><th>Viaggio</th><th class="num">Km diretti</th><th class="num">Coincidenze</th><th class="num">Attesa migliore</th><th class="num">Biglietti venduti</th></tr></thead><tbody>
        ${[...mercati.values()].sort((a, b) => b.pax - a.pax).slice(0, 40).map(m => `<tr><td><b>${m.o} → ${H} → ${m.d}</b> <span class="muto piccolo">${h(citta(m.o))}–${h(citta(m.d))}</span></td><td class="num">${num(SIM.km(m.o, m.d))}</td><td class="num">${m.n}</td><td class="num">${m.best} min</td><td class="num">${num(m.pax)}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="muto">Nessuna coincidenza valida: servono arrivi a ${H} seguiti da partenze verso altre città tra ${D.HUB.mct} e ${D.HUB.attesaMax} minuti dopo.</p>`}
      ${conn.some(c => c.diretto) ? `<p class="nota">${conn.filter(c => c.diretto).length} coincidenze escluse perché voli già quel collegamento diretto.</p>` : ''}</div>`;
  }
  const altre = G.basi.filter(b => !G.hub.includes(b));
  if (altre.length) s += `<div class="filtri mt">${altre.map(b => `<button data-az="apri-hub" data-i="${b}">Rendi hub ${b} (${mln(D.HUB.costo)})</button>`).join('')}</div>`;
  return s;
};

/* Marketing */
const AMBITI = { rotta: 'Una rotta', rete: 'Tutta la rete', citta: 'Una città', nazionale: 'Tutta Italia' };
function cittaServite() { return [...new Set([...G.basi, ...Object.keys(G.rotte).flatMap(k => k.split('-'))].map(i => AP[i].citta))].sort(); }
VISTE.marketing = () => {
  const u7 = ultimi(7), spesa7 = G.storico.slice(-7).reduce((a, x) => a + (x.dettaglio.marketing || 0), 0), spesa30 = G.storico.slice(-30).reduce((a, x) => a + (x.dettaglio.marketing || 0), 0);
  const attive = G.campagne.filter(c => c.attiva), budget = attive.reduce((a, c) => a + c.budget, 0);
  const st = G.campagne.length ? SIM.stimaMarketing(G) : { pax: 0, ricavi: 0 };
  const lfOggi = u7.posti ? u7.pax / u7.posti : null;
  return `<div class="testata"><h1>Marketing</h1><span class="sotto">La pubblicità rende i tuoi voli più attraenti rispetto a concorrenti, treno e auto, e convince più persone a viaggiare: alza il riempimento degli aerei.</span></div>
  <div class="kpi">
    <div><small>Campagne attive</small><b>${attive.length}</b><span>${eur(budget)} al giorno</span></div>
    <div><small>Effetto stimato oggi</small><b>+${num(st.pax)} pax</b><span>al giorno, con i posti che hai</span></div>
    <div><small>Ricavi in più stimati</small><b>${mln(st.ricavi)}</b><span>al giorno · ${budget ? 'rendono ' + num(st.ricavi / budget, 1) + ' € per € speso' : 'nessuna spesa'}</span></div>
    <div><small>Spesa ultimi 7 / 30 giorni</small><b>${mln(spesa7)}</b><span>${mln(spesa30)} in 30 giorni</span></div>
    <div><small>Load factor 7 giorni</small><b>${pct(lfOggi)}</b><span>posti venduti / offerti</span></div>
  </div>
  <h2>Canali</h2>
  <div class="carte">${Object.entries(D.MARKETING).map(([k, M]) => `<div class="pannello carta"><div class="titolo">${M.icona} ${M.nome}</div><p class="piccolo" style="margin:6px 0">${M.descr}</p>
    <div class="riga"><span>Copertura</span><span>${M.ambiti.map(a => AMBITI[a]).join(' o ')}</span></div>
    <div class="riga"><span>Budget</span><span>${eur(M.min)}–${eur(M.max)} al giorno</span></div>
    <div class="riga"><span>Produzione</span><span>${M.avvio ? eur(M.avvio) : 'nessun costo'}</span></div>
    <div class="riga"><span>Tempi</span><span>a regime in ~${Math.round(3 / M.salita)} giorni, svanisce in ~${Math.round(3 / M.discesa)}</span></div>
    <div class="riga"><span>Punto di forza</span><span>${M.forte}</span></div>
    <div class="azioni"><button class="piccolo primario" data-az="nuova-campagna" data-c="${k}">Nuova campagna</button></div></div>`).join('')}</div>
  <div class="pannello mt"><h2>Campagne</h2>${G.campagne.length ? `<div class="schede">${G.campagne.map(c => {
      const M = D.MARKETING[c.canale], e = SIM.stimaMarketing(G, { base: { escludi: c.id } }), rest = c.fine ? Math.max(0, Math.ceil((c.fine - G.ora) / GIORNO)) : null;
      return `<div class="scheda"><div class="riga"><b>${M.icona} ${M.nome} · ${h(c.etichetta)}</b>${c.attiva ? '<span class="badge b-ok">In corso</span>' : '<span class="badge">Conclusa, effetto in calo</span>'}</div>
        <div class="riga muto"><span>${eur(c.budget)} al giorno · dal ${fmtGiorno(c.inizio)}${c.attiva ? (rest != null ? ` · ancora ${rest} giorni` : ' · senza scadenza') : ''}</span><span>speso ${eur(c.speso)}</span></div>
        <div class="piccolo">Forza dell’effetto</div>${barretta(c.forza, pct(c.forza), [2, 2])}
        <div class="riga"><span>Effetto stimato</span><b>+${num(e.pax)} pax · +${eur(e.ricavi)} al giorno</b></div>
        ${c.attiva ? `<div class="azioni"><button class="piccolo pericolo" data-az="ferma-campagna" data-id="${c.id}">Ferma</button></div>` : ''}</div>`; }).join('')}</div>` : '<p class="muto">Nessuna campagna. Scegli un canale qui sopra.</p>'}
    <p class="nota">L’effetto cresce col budget ma sempre meno (rendimenti decrescenti) e serve solo se hai posti liberi: su voli già pieni conviene alzare i prezzi. Le stime confrontano le vendite di domani con e senza la campagna, a parità di prezzi e posti. Sui voli da e per un hub, parte dei passeggeri in più prende il posto di chi viaggia in coincidenza: lì l’effetto reale sui ricavi può essere minore.</p></div>`;
};
function formCampagna(canale) {
  const M = D.MARKETING[canale];
  modale({
    titolo: `${M.icona} Nuova campagna · ${M.nome}`, larga: true,
    corpo: `<p class="piccolo">${M.descr}</p><div class="form">
      <label>Copertura<select id="cmAmbito">${opzioni(M.ambiti.map(a => [a, AMBITI[a]]), M.ambiti[0])}</select></label>
      <label id="cmObLab">Dove<select id="cmOb"></select></label>
      <label>Budget giornaliero (${eur(M.min)}–${eur(M.max)})<input type="number" id="cmBudget" min="${M.min}" max="${M.max}" step="${M.min >= 1000 ? 500 : 100}" value="${Math.round(M.scala * (canale === 'online' ? 1 : 1) / 100) * 100}"></label>
      <label>Durata<select id="cmGiorni">${opzioni([[7, '7 giorni'], [14, '14 giorni'], [30, '30 giorni'], [60, '60 giorni'], [0, 'Fino a quando la fermo']], 14)}</select></label>
    </div><div id="cmStima" class="mt"></div>`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma-campagna" data-c="${canale}">Avvia campagna</button>`
  });
  $('#modale').dataset.canale = canale; aggiornaObiettivi(); stimaCampagna();
}
function aggiornaObiettivi() {
  const amb = $('#cmAmbito').value, sel = $('#cmOb'), lab = $('#cmObLab');
  if (amb === 'rotta') { lab.hidden = false; sel.innerHTML = opzioni(Object.keys(G.rotte).sort().map(k => [k, `${k.replace('-', '–')} · ${citta(k.split('-')[0])}–${citta(k.split('-')[1])}`]), ''); }
  else if (amb === 'citta') { lab.hidden = false; sel.innerHTML = opzioni(cittaServite().map(c => [c, c]), ''); }
  else { lab.hidden = true; sel.innerHTML = ''; }
}
function leggiCampagna() {
  const canale = $('#modale').dataset.canale, ambito = $('#cmAmbito').value;
  return { canale, ambito, obiettivo: $('#cmOb').value || null, budget: +$('#cmBudget').value, giorni: +$('#cmGiorni').value };
}
function stimaCampagna() {
  const box = $('#cmStima'); if (!box) return;
  const c = leggiCampagna(), M = D.MARKETING[c.canale];
  if ((c.ambito === 'rotta' || c.ambito === 'citta') && !c.obiettivo) { box.innerHTML = '<p class="muto">Apri prima qualche rotta.</p>'; return; }
  const finta = { id: '__prova', ...c, forza: 1 }, e = SIM.stimaMarketing(G, { base: {}, con: { extra: finta } });
  const coperte = Object.keys(e.perRotta).filter(k => e.perRotta[k] > 0.5).length;
  const netto = e.ricavi - c.budget;
  box.innerHTML = `<table><tbody>
    <tr><td>A regime (dopo ~${Math.round(3 / M.salita)} giorni)</td><td><b>+${num(e.pax)}</b> passeggeri al giorno su ${coperte} rotte</td></tr>
    <tr><td>Ricavi in più stimati</td><td><b>${eur(e.ricavi)}</b> al giorno</td></tr>
    <tr><td>Costo</td><td>${eur(c.budget)} al giorno${M.avvio ? ` + ${eur(M.avvio)} di produzione` : ''}${c.giorni ? ` · totale ${eur(M.avvio + c.budget * c.giorni)}` : ''}</td></tr>
    <tr><td>Bilancio giornaliero a regime</td><td><b class="${netto < 0 ? 'neg' : 'pos'}">${netto >= 0 ? '+' : ''}${eur(netto)}</b> ${netto < 0 ? '(i ricavi in più non coprono la spesa: hai pochi posti liberi o il budget è troppo alto)' : ''}</td></tr>
    ${M.business ? '<tr><td>Extra</td><td>Più domanda in Business e Premium: rende di più sugli aerei con queste classi</td></tr>' : ''}
    ${M.reputazione ? '<tr><td>Extra</td><td>Fa salire la reputazione mentre è in onda</td></tr>' : ''}
  </tbody></table><p class="nota">Stima sui voli di domani con prezzi e posti attuali. I ricavi in più si fermano quando gli aerei sono pieni. Sugli hub l’effetto reale può essere minore, perché i nuovi clienti tolgono posti ai passeggeri in coincidenza.</p>`;
  const b = $('#modale [data-az="conferma-campagna"]'); if (b) b.disabled = !(c.budget >= M.min && c.budget <= M.max);
}

/* Mercato */
