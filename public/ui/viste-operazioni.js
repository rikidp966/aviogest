'use strict';
// AvioGest — Barra superiore, Panoramica, Voli, Flotta, Programmazione

/* ---------- Barra superiore ---------- */
function costruisciCima() {
  $('#cima').innerHTML = `
    <div class="orario"><b id="cOra"></b><small id="cData"></small></div>
    <div class="velocita" role="group" aria-label="Velocità del tempo">${['⏸', '▶', '▶▶', '▶▶▶'].map((s, i) => `<button data-az="vel" data-v="${i}" title="${['Pausa (spazio)', '10 minuti al secondo (1)', '1 ora al secondo (2)', '4 ore al secondo (3)'][i]}">${s}</button>`).join('')}</div>
    <div class="salti" role="group" aria-label="Salti di tempo"><button data-az="salta" data-s="domani" title="Vai a domani mattina">⏭<span> Domani</span></button><button data-az="salta" data-s="lunedi" title="Vai alla riunione di lunedì">⏭<span> Lunedì</span></button><button data-az="salta" data-s="evento" title="Avanza fino alla prossima notizia importante (massimo 10 giorni)">⏭<span> Evento</span></button></div>
    <div class="valori">
      <div><small>Cassa</small><b id="cCassa"></b></div>
      <div><small>Utile di ieri</small><b id="cUtile"></b></div>
      <div><small>Reputazione</small><b id="cRep"></b></div>
      <div><small>Cherosene</small><b id="cCarb"></b></div>

    </div>
    <div class="cima-azioni">
      <button id="cSalti" class="solo-mobile" data-az="salti-menu" title="Salta avanti" aria-label="Salta avanti nel tempo">⏭</button>
      <button id="cNotifiche" data-az="notifiche" title="Notizie" aria-label="Notizie">🔔<i hidden></i></button>
      <button id="cSuoni" data-az="suoni" title="Suoni">${UI.suoni ? '🔊' : '🔈'}</button>
    </div>`;
  aggiornaVel();
}
function aggiornaVel() { document.querySelectorAll('.velocita button').forEach(b => b.classList.toggle('on', +b.dataset.v === vel)); }
function aggiornaCima() {
  $('#cOra').textContent = fmtOra(G.ora); $('#cData').textContent = `${fmtData(G.ora)} · ora di ${citta(G.basi[0])}`;
  const c = $('#cCassa'); c.textContent = eur(G.cassa); c.className = G.cassa < 0 ? 'neg' : '';
  const ieri = G.storico.at(-1), u = $('#cUtile'); u.textContent = ieri ? eur(ieri.utile) : '—'; u.className = ieri && ieri.utile < 0 ? 'neg' : '';
  $('#cRep').textContent = Math.round(G.reputazione) + '/100';
  $('#cCarb').textContent = G.carburante.toFixed(2) + ' €/kg';
  aggiornaCampanella();
}

/* ---------- Viste ---------- */
const VISTE = {};
const SCEN = () => D.SCENARI[G.scenario];

VISTE.panoramica = () => `
  <div class="testata"><h1>${h(G.nome)}</h1><span class="sotto">${SCEN().nome} · giorno ${Math.floor((G.ora - G.inizio) / GIORNO) + 1} · basi ${G.basi.join(', ')}${G.hub.length ? ' · hub ' + G.hub.join(', ') : ''}</span></div>
  ${bannerDilemma()}${bannerTrattativa()}${bannerRiunione()}${primiPassi()}
  <div class="griglia g2 sopra"><div class="pannello" id="consigli">${consigliHTML()}</div><div class="pannello" id="missioni">${missioniHTML()}</div></div>
  <div class="griglia g-21 mt">
    <div class="pannello"><div id="mappaPosto"></div><p class="nota">Aerei in volo in blu, a terra in grigio, in manutenzione in giallo, guasti in rosso. Basi in blu, hub con l’anello giallo. Le rotte tratteggiate sono aperte ma senza voli.</p></div>
    <div><div class="pannello" id="live">${live()}</div><div class="pannello"><h2>Obiettivi</h2>${obiettiviHTML()}</div></div>
  </div>
  <div class="pannello mt"><h2>Notiziario</h2><ul class="notizie" id="notizie">${notizieHTML(40)}</ul></div>`;
function live() {
  const oggi = G.oggi, u7 = ultimi(7), cop = SIM.copertura(G);
  const prog = G.voli.filter(v => SIM.mezzanotte(v.dep) === SIM.mezzanotte(G.ora)).length;
  return `<h2>Oggi</h2>
    <div class="carta">
      <div class="riga"><span>Voli completati</span><b>${oggi.voli} di ${prog}${oggi.canc ? ` · <span class="neg">${oggi.canc} cancellati</span>` : ''}</b></div>
      <div class="riga"><span>In volo adesso</span><b>${G.voli.filter(v => v.stato === 'volo').length}</b></div>
      <div class="riga"><span>Passeggeri</span><b>${num(oggi.pax)}${oggi.transito ? ` · ${num(oggi.transito)} in transito` : ''}</b></div>
      <div class="riga"><span>Ricavi biglietti</span><b>${eur(oggi.ricavi)}</b></div>
      <div class="riga"><span>Load factor 7 giorni</span><b>${pct(u7.posti ? u7.pax / u7.posti : null)}</b></div>
      <div class="riga"><span>Puntualità 7 giorni</span><b>${pct(u7.voli ? u7.puntuali / u7.voli : null)}</b></div>
      <div class="riga"><span>Utile 7 giorni</span><b>${segno(u7.utile)}</b></div>
      <div class="riga"><span>Valore compagnia</span><b>${mln(SIM.valoreCompagnia(G))}</b></div>
    </div>
    <div class="mt piccolo">Reputazione</div>${barretta(G.reputazione / 100, Math.round(G.reputazione), [2, 2])}
    <div class="piccolo">Morale del personale</div>${barretta(G.morale / 100, Math.round(G.morale), [2, 2])}
    <div class="piccolo">Turni con equipaggio</div>${barretta(cop.min, `${cop.turni - cop.scoperte}/${cop.turni}`, [2, 2])}
    ${cop.scoperte ? `<p class="piccolo neg">${cop.scoperte} turni della settimana senza equipaggio: quei voli verranno cancellati. <a href="#/personale">Assumi</a></p>` : ''}
    ${G.cassa < 0 ? '<p class="piccolo neg">Cassa negativa! Sotto −2 M€ per 10 giorni la compagnia fallisce.</p>' : ''}`;
}
function notizieHTML(n) {
  if (!G.notizie.length) return '<li class="muto">Nessuna notizia</li>';
  return G.notizie.slice(0, n).map(x => `<li class="${x.tipo}">${h(x.testo)}<small>${fmtGiorno(x.t)} ${fmtOra(x.t)}</small></li>`).join('');
}
function obiettiviHTML() {
  const S = SCEN(), ob = SIM.obiettivi(G);
  let s = `<p class="piccolo muto" style="margin-top:0">${h(S.obiettivi)}</p>`;
  if (S.durata) s += `<p class="piccolo">Giorni rimasti: <b>${Math.max(0, Math.ceil(S.durata - (G.ora - G.inizio) / GIORNO))}</b></p>`;
  s += ob.map(o => `<div class="piccolo">${h(o.t)} · ${h(o.s)}</div>${barretta(Math.min(1, o.v), pct(Math.min(1, o.v)), [2, 2])}`).join('');
  if (G.esito) s += `<p class="piccolo"><span class="badge ${G.esito.tipo === 'vittoria' ? 'b-ok' : 'b-err'}">${{ vittoria: 'Scenario completato', scaduto: 'Tempo scaduto', fallimento: 'Fallimento' }[G.esito.tipo]}</span></p>`;
  return s;
}
function primiPassi() {
  if (G.stat.voli > 0 || G.scenario === 'crisi') return '';
  const passi = [
    [G.aerei.some(a => a.prog.giorni.some(g => g.scali.length > 1)), 'Dai una rotazione al primo aereo con la ✨ Rotazione guidata: sceglie orari e apre le rotte per te', 'guida'],
    [vel > 0, 'Avvia il tempo con ▶ in alto', null]
  ];
  return `<div class="pannello" style="margin-bottom:16px"><h2>Primi passi</h2><ul class="problemi">${passi.map(([fatto, t, l]) => `<li class="${fatto ? 'ok' : 'avviso'}">${fatto ? '✓' : '○'} ${l === 'guida' && !fatto && flotta()[0] ? `<a href="#" data-az="guida" data-id="${flotta()[0].id}">${t}</a>` : l && !fatto ? `<a href="${l}">${t}</a>` : t}</li>`).join('')}</ul>
    <p class="nota">Gli ATR rendono sulle tratte brevi. Più avanti: apri una seconda base per far dormire gli aerei fuori casa, e trasforma una base in hub per vendere voli in coincidenza.</p></div>`;
}

/* Voli */
const STATI_VOLO = { prog: ['Programmato', ''], rit: ['In ritardo', 'b-warn'], volo: ['In volo', 'b-info'], arrivato: ['Atterrato', 'b-ok'], canc: ['Cancellato', 'b-err'] };
function badgeVolo(v) {
  if (v.stato === 'canc') return `<span class="badge b-err">Cancellato</span> <span class="muto piccolo">${h(v.motivo)}</span>`;
  const [t, c] = STATI_VOLO[v.stato], rit = v.rit > 0 && v.stato !== 'prog' ? ` +${v.rit}′` : '';
  return `<span class="badge ${v.stato === 'arrivato' && v.rit > 15 ? 'b-warn' : c}">${t}${rit}</span>`;
}
VISTE.voli = () => `
  <div class="testata"><h1>Voli</h1><span class="spazio"></span>
    <div class="segmenti"><button data-az="tab-voli" data-t="oggi" class="${UI.voliTab === 'oggi' ? 'on' : ''}">Oggi e domani</button><button data-az="tab-voli" data-t="registro" class="${UI.voliTab === 'registro' ? 'on' : ''}">Registro voli effettuati</button></div></div>
  <div class="pannello"><div class="tab-wrap" id="risultati">${UI.voliTab === 'oggi' ? tabellaOggi() : tabellaRegistro()}</div></div>`;
function tabellaOggi() {
  const g0 = SIM.mezzanotte(G.ora), lim = SIM.giornoDopo(g0, 2), lista = G.voli.filter(v => v.dep < lim && v.dep >= g0);
  if (!lista.length) return '<p class="vuoto">Nessun volo programmato. Crea una rotazione in Programmazione.</p>';
  const schede = `<div class="schede solo-mobile">${lista.map(v => { const ae = G.aerei.find(a => a.id === v.ae), cab = ae ? ae.cab : SIM.zero(), vend = { J: v.v.J + v.t.J, W: v.v.W + v.t.W, Y: v.v.Y + v.t.Y };
    return `<div class="scheda"><div class="riga"><b>${h(v.num)} · ${v.da} → ${v.a}</b>${badgeVolo(v)}</div><div class="riga muto"><span>${SIM.mezzanotte(v.dep) !== g0 ? 'domani ' : ''}${fmtOra(v.dep)}${v.rit && v.stato !== 'canc' ? ` → ${fmtOra(v.depEff)}` : ''} – ${fmtOra(v.arrEff || v.arr)}</span><span>${h(ae?.marche || '')}</span></div><div>${chipCab(cab, vend)}${somma(v.t) ? `<span class="chip">${somma(v.t)} in transito</span>` : ''}</div><div class="riga"><span class="muto">Incassato</span><b>${eur(somma(v.inc))}</b></div></div>`; }).join('')}</div>`;
  return `<div class="tabellone">` + schede + `<table class="solo-desktop"><thead><tr><th>Volo</th><th>Tratta</th><th>Aereo · equipaggio</th><th>Partenza</th><th>Arrivo</th><th>Venduti per classe</th><th class="num">In transito</th><th class="num">Incassato</th><th>Stato</th></tr></thead><tbody>
    ${lista.map(v => { const ae = G.aerei.find(a => a.id === v.ae), cab = ae ? ae.cab : SIM.zero(), vend = { J: v.v.J + v.t.J, W: v.v.W + v.t.W, Y: v.v.Y + v.t.Y };
      return `<tr><td><b>${h(v.num)}</b></td><td>${v.da} → ${v.a} <span class="muto piccolo">${h(citta(v.da))}–${h(citta(v.a))}</span></td><td>${h(ae?.marche || '—')} <span class="muto piccolo">${h(SIM.equipaggioDi(G, v)?.nome || 'senza equipaggio')}</span></td>
      <td class="ora-tab">${SIM.mezzanotte(v.dep) !== g0 ? '<span class="muto piccolo">domani</span> ' : ''}${fmtOra(v.dep)}${v.rit && v.stato !== 'canc' ? ` <span class="muto piccolo">→ ${fmtOra(v.depEff)}</span>` : ''}${locale(v.dep, v.da)}</td><td class="ora-tab">${fmtOra(v.arrEff || v.arr)}${locale(v.arrEff || v.arr, v.a)}</td>
      <td>${chipCab(cab, vend)}</td><td class="num">${somma(v.t) || ''}</td><td class="num">${eur(somma(v.inc))}</td><td>${badgeVolo(v)}</td></tr>`; }).join('')}</tbody></table>
    <p class="nota">I biglietti si vendono nei tre giorni prima della partenza. “In transito” sono i passeggeri che proseguono con una tua coincidenza in un hub.</p></div>`;
}
function tabellaRegistro() {
  if (!G.registro.length) return '<p class="vuoto">Ancora nessun volo effettuato.</p>';
  const schede = `<div class="schede solo-mobile">${G.registro.slice(0, 120).map((r, i) => `<div class="scheda" data-az="dettaglio-volo" data-i="${i}"><div class="riga"><b>${h(r.num)} · ${r.da} → ${r.a}</b>${r.stato === 'canc' ? '<span class="badge b-err">Cancellato</span>' : r.rit > 15 ? `<span class="badge b-warn">+${r.rit}′</span>` : '<span class="badge b-ok">Puntuale</span>'}</div><div class="riga muto"><span>${fmtGiorno(r.dep)} ${fmtOra(r.dep)} · ${h(r.marche)}</span><span>${r.pax}/${r.posti} pax</span></div><div class="riga"><span>Ricavi ${eur(r.ricavi)}</span><b>${segno(r.ricavi - r.costi)}</b></div>${r.stato === 'canc' ? `<div class="piccolo muto">${h(r.motivo)}</div>` : ''}</div>`).join('')}</div>`;
  return schede + `<table class="solo-desktop"><thead><tr><th>Data</th><th>Volo</th><th>Tratta</th><th>Aereo</th><th class="num">Ritardo</th><th>Passeggeri</th><th class="num">Business</th><th class="num">Premium</th><th class="num">Economy</th><th class="num">Ricavi</th><th class="num">Costi</th><th class="num">Utile</th><th>Esito</th></tr></thead><tbody>
    ${G.registro.slice(0, 250).map((r, i) => { const rc = r.ricaviC || SIM.zero();
      return `<tr class="clic" data-az="dettaglio-volo" data-i="${i}"><td>${fmtGiorno(r.dep)} ${fmtOra(r.dep)}</td><td><b>${h(r.num)}</b></td><td>${r.da} → ${r.a}</td><td>${h(r.marche)}</td><td class="num">${r.stato === 'canc' ? '—' : r.rit + '′'}</td>
      <td>${barretta(r.posti ? r.pax / r.posti : 0, `${r.pax}/${r.posti}`, [2, 2])}</td><td class="num">${rc.J ? eur(rc.J) : ''}</td><td class="num">${rc.W ? eur(rc.W) : ''}</td><td class="num">${eur(rc.Y)}</td><td class="num">${eur(r.ricavi)}</td><td class="num">${eur(r.costi)}</td><td class="num">${segno(r.ricavi - r.costi)}</td>
      <td>${r.stato === 'canc' ? `<span class="badge b-err">Cancellato</span> <span class="muto piccolo">${h(r.motivo)}</span>` : r.rit > 15 ? '<span class="badge b-warn">In ritardo</span>' : '<span class="badge b-ok">Puntuale</span>'}</td></tr>`; }).join('')}</tbody></table>`;
}
const VOCI = { fedelta: 'Programma fedeltà (premi e vantaggi)', co2: 'Emissioni di CO₂', alleanze: 'Alleanze e joint venture', negati: 'Passeggeri lasciati a terra', prodotto: 'Prodotto e fedeltà (fissi)', carburante: 'Carburante', tasse: 'Tasse aeroportuali', handling: 'Assistenza a terra', navigazione: 'Navigazione aerea', manutenzione: 'Manutenzione', servizio: 'Servizio di bordo', rimborsi: 'Rimborsi ai passeggeri', equipaggi: 'Equipaggi fuori base (albergo e trasferimenti)', soste: 'Soste fuori base (parcheggio)', marketing: 'Marketing e pubblicità', leasing: 'Leasing aerei', personale: 'Stipendi', basi: 'Basi operative', hub: 'Gestione hub', sede: 'Sede e amministrazione', interessi: 'Interessi sui prestiti', assicurazione: 'Assicurazioni', altro: 'Altre spese e investimenti' };
function dettaglioVolo(r) {
  const pc = r.paxC || SIM.zero(), rc = r.ricaviC || SIM.zero(), cab = r.cab || SIM.zero();
  modale({ titolo: `Volo ${h(r.num)} · ${r.da} → ${r.a}`, corpo: `<p>${fmtData(r.dep)} · ${h(r.marche)} · equipaggio ${h(r.equip || '—')} (base ${h(r.base || '—')}) · ${r.stato === 'canc' ? 'cancellato: ' + h(r.motivo) : `partito ${fmtOra(r.depEff)} (ritardo ${r.rit}′), atterrato ${fmtOra(r.arrEff)}`}</p>
    <h3>Biglietti</h3><table><thead><tr><th>Classe</th><th class="num">Posti</th><th class="num">Venduti</th><th>Riempimento</th><th class="num">Tariffa media</th><th class="num">Ricavo</th></tr></thead><tbody>
    ${CL.filter(c => cab[c]).map(c => `<tr><td><span class="chip"><i style="background:var(--cl-${c})"></i>${CLS[c].nome}</span></td><td class="num">${cab[c]}</td><td class="num">${pc[c]}</td><td>${barretta(pc[c] / cab[c], null, [2, 2])}</td><td class="num">${pc[c] ? eur(rc[c] / pc[c]) : '—'}</td><td class="num">${eur(rc[c])}</td></tr>`).join('')}
    <tr><td><b>Totale</b></td><td class="num">${r.posti}</td><td class="num"><b>${r.pax}</b></td><td></td><td class="num">${r.pax ? eur(r.ricavi / r.pax) : '—'}</td><td class="num"><b>${eur(r.ricavi)}</b></td></tr></tbody></table>
    ${r.transito ? `<p class="piccolo">Di cui <b>${r.transito}</b> passeggeri in coincidenza, che hanno portato ${eur(r.ricaviTransito)} su questa tratta.</p>` : ''}
    <h3 class="mt">Costi del volo</h3><table><tbody>${Object.entries(r.dettaglio || {}).filter(([, v]) => v).map(([k, v]) => `<tr><td>${VOCI[k]}</td><td class="num">−${eur(v)}</td></tr>`).join('')}
    <tr><td><b>Utile del volo</b></td><td class="num"><b>${segno(r.ricavi - r.costi)}</b></td></tr></tbody></table>
    <p class="nota">Leasing, stipendi e spese fisse si pagano a fine giornata e non sono inclusi qui.</p>` });
}

/* Flotta */
VISTE.flotta = () => {
  const f = flotta(), posti = f.reduce((s, a) => s + SIM.posti(a), 0);
  return `<div class="testata"><h1>Flotta</h1><span class="sotto">${f.length} aerei · ${num(posti)} posti</span><span class="spazio"></span><a class="btn" href="#/mercato">Compra o noleggia aerei</a></div>
  ${f.length ? `<div class="carte">${f.map(cartaAereo).join('')}</div>` : '<p class="vuoto">Nessun aereo in flotta.</p>'}`;
};
function cartaAereo(ae) {
  const m = MOD[ae.modello], st = statoAereo(ae), s7 = statsAereo(ae.id), n = ae.prog.giorni.length;
  const notti = [...new Set(ae.prog.giorni.map(g => g.scali.at(-1)))];
  return `<div class="pannello carta">
    <div class="riga" style="margin:0"><a class="titolo link-rotta" href="#/aereo/${ae.id}">${h(ae.marche)}</a><span class="badge ${st.c}">${h(st.t)}</span></div>
    <div class="muto">${m.nome} · ${SIM.posti(ae)} posti</div>
    ${(() => { const s = salute().aerei[ae.id]; return s ? `<div class="salute ${s.c}">${semaforo(s)}${h(s.t)}</div>` : ''; })()}
    <div style="margin-top:6px">${chipCab(ae.cab)}</div>
    ${barraCabina(ae.modello, ae.cab)}
    <div class="riga"><span>Contratto</span><span>${ae.modo === 'leasing' ? `Leasing ${eur(ae.leasing)}/g` : `Proprietà · valore ${mln(ae.valore)}`}</span></div>
    <div class="riga"><span>Età · ore totali</span><span>${ae.eta} anni · ${num(ae.ore)} h</span></div>
    <div class="riga"><span>Settimana</span><span>${SIM.mediaCiclo(ae).tratte.length} voli · ${Math.round(oreGiorno(ae) * 7)} h · notti a ${notti.join(', ')}</span></div>
    <div class="riga"><span>Utile voli 7 giorni</span><span>${segno(s7.ricavi - s7.costi)}</span></div>
    <div class="riga"><span>Ore dall’ultima ispezione</span><span>${ae.lavori ? `${ae.lavori.tipo === 'cabina' ? 'cabina' : 'ispezione'} dalle ${fmtOra(ae.lavori.inizio)} del ${fmtGiorno(ae.lavori.inizio)}` : ''}</span></div>
    ${barretta(ae.oreDaCheck / 600, `${Math.round(ae.oreDaCheck)}/600 h`, [0.85, 1.0])}
    <label class="piccolo"><input type="checkbox" data-az="autocheck" data-id="${ae.id}" ${ae.autoCheck ? 'checked' : ''}> Ispezione automatica notturna quando serve</label>
    <div class="azioni">
      ${SIM.mediaCiclo(ae).ore ? '' : `<button class="piccolo primario" data-az="guida" data-id="${ae.id}">✨ Rotazione guidata</button>`}<button class="piccolo ${SIM.mediaCiclo(ae).ore ? 'primario' : ''}" data-az="vai-prog" data-id="${ae.id}">Rotazione</button>
      <button class="piccolo" data-az="riconfigura" data-id="${ae.id}" ${ae.lavori ? 'disabled' : ''}>Cabina</button>
      ${ae.stato === 'consegna' ? `<button class="piccolo pericolo" data-az="annulla-ordine" data-id="${ae.id}">Annulla ordine</button>` : `<button class="piccolo" data-az="check" data-id="${ae.id}" ${ae.lavori ? 'disabled' : ''}>Ispezione stanotte</button>`}
      <button class="piccolo pericolo" data-az="vendi" data-id="${ae.id}">${ae.modo === 'leasing' ? 'Restituisci' : 'Vendi'}</button>
    </div></div>`;
}
function barraCabina(mod, cab) {
  const sp = MOD[mod].spazio;
  return `<div class="cabina-barra" style="margin-top:6px" title="Spazio occupato">${CL.filter(c => cab[c]).map(c => `<div style="width:${cab[c] * SIM.spazioPosto(mod, c) / sp * 100}%;background:var(--cl-${c})"></div>`).join('')}</div>`;
}

/* Configuratore di cabina (acquisto e riconfigurazione) */
function configuratore({ titolo, mod, cab, info = '', piede, extra = '' }) {
  modale({
    titolo, larga: true,
    corpo: `${info}<div class="form config">
      ${CL.map(c => `<label>${CLS[c].nome} <span class="aiuto">${String(SIM.spazioPosto(mod, c)).replace('.', ',')} unità a posto${MOD[mod].lungo && c === 'J' ? ' (poltrona letto)' : ''}</span><input type="number" min="0" step="1" id="cab${c}" value="${cab[c]}"></label>`).join('')}
      <label>Preimpostazioni<span class="filtri" style="margin:0">
        <button type="button" class="piccolo" data-az="cab-preset" data-p="economy">Tutta Economy</button>
        <button type="button" class="piccolo" data-az="cab-preset" data-p="mista">Mista</button>
        <button type="button" class="piccolo" data-az="cab-preset" data-p="premium">Tre classi</button>
        <button type="button" class="piccolo" data-az="cab-riempi">Riempi con Economy</button></span></label>
    </div><div id="cabInfo" class="mt"></div>${extra}`,
    piede
  });
  $('#modale').dataset.mod = mod;
  aggiornaConfig();
}
function leggiCab() { const c = {}; for (const x of CL) c[x] = Math.max(0, Math.floor(+$('#cab' + x).value || 0)); return c; }
function aggiornaConfig() {
  const mod = $('#modale').dataset.mod, cab = leggiCab(), sp = MOD[mod].spazio, usato = SIM.spazioUsato(cab, mod), e = SIM.validaCabina(mod, cab);
  const fittizio = { cab }, cm = SIM.cabMin(fittizio);
  $('#cabInfo').innerHTML = `${barraCabina(mod, cab)}
    <p class="piccolo">Spazio usato <b>${num(usato, 1)}</b> su <b>${sp}</b> unità · <b>${somma(cab)}</b> posti · personale di cabina minimo <b>${cm}</b> (1 ogni 50 posti)</p>
    ${e ? `<ul class="problemi"><li class="errore">✖ ${h(e)}</li></ul>` : '<ul class="problemi"><li class="ok">✓ Configurazione valida</li></ul>'}
    <p class="nota">Più Business e Premium significano meno posti ma tariffe più alte: rendono tra grandi città e sulle rotte d’affari ed estere. Su mete turistiche e tratte brevi conviene l’Economy. Business e Premium hanno anche un costo di servizio a bordo più alto.</p>`;
  const b = $('#modale [data-conferma-cab]'); if (b) b.disabled = !!e;
}

/* Programmazione su più giorni */
const GS = SIM.GIORNI_SETT, GS3 = GS.map(x => x.slice(0, 3));
VISTE.programmazione = () => {
  const f = flotta();
  if (!f.length) return '<div class="testata"><h1>Programmazione</h1></div><p class="vuoto">Nessun aereo.</p>';
  if (!UI.aereoSel || !f.find(a => a.id === UI.aereoSel)) UI.aereoSel = f[0].id;
  const ae = f.find(a => a.id === UI.aereoSel);
  if (!bozza || bozza.aeId !== ae.id || !!bozza.altra !== !!UI.stagioneAlt) {
    const src = UI.stagioneAlt ? (ae.progAlt || ae.prog) : ae.prog, giorni = SIM.normalizza(src).giorni;
    bozza = { aeId: ae.id, turn: src.turn, giorni, sel: SIM.giornoSett(G.ora), orig: UI.stagioneAlt && !ae.progAlt ? '' : JSON.stringify({ turn: src.turn, giorni }), altra: !!UI.stagioneAlt };
  }
  const stOra = G.stagione === 'estate' ? 'estivo' : 'invernale', stAltra = G.stagione === 'estate' ? 'invernale' : 'estivo', dalAltra = G.stagione === 'estate' ? 'novembre' : 'aprile';
  return `<div class="testata"><h1>Programmazione</h1><span class="sotto">Ogni aereo ha un programma settimanale, da lunedì a domenica. Notti e soste lunghe solo nelle basi; nessun decollo tra le 00:30 e le 05:30 ora locale. Orari nell’ora di ${h(citta(G.basi[0]))}, tra parentesi l’ora locale.</span></div>
  <div class="stagioni"><div class="segmenti"><button data-az="stagione-ed" data-alt="0" class="${UI.stagioneAlt ? '' : 'on'}">Orario ${stOra} · in corso</button><button data-az="stagione-ed" data-alt="1" class="${UI.stagioneAlt ? 'on' : ''}">Orario ${stAltra} · da ${dalAltra}</button></div>
    <span class="piccolo muto">${ae.progAlt ? `${h(ae.marche)} ha un programma diverso per l’orario ${stAltra}.` : `${h(ae.marche)} vola lo stesso programma tutto l’anno.`}</span>${ae.progAlt ? `<button class="piccolo" data-az="togli-stagione" data-id="${ae.id}">Un solo programma</button>` : `<button class="piccolo" data-az="copia-stagione" data-id="${ae.id}">Prepara l’orario ${stAltra}</button>`}</div>
  ${UI.stagioneAlt ? `<p class="nota">Stai modificando l’orario ${stAltra}: entra in vigore da ${dalAltra}. Le rotte devono essere aperte e gli slot sufficienti già ora.</p>` : ''}
  <div class="prog">
    <div class="lista-aerei">${f.map(a => { const mc = SIM.mediaCiclo(a); return `<button data-az="sel-aereo" data-id="${a.id}" class="${a.id === ae.id ? 'on' : ''}"><span>${semaforo(salute().aerei[a.id])}<b class="mono">${h(a.marche)}</b> <span class="muto piccolo">${a.modello}</span></span><span class="piccolo">${mc.tratte.length} voli · ${Math.round(mc.ore * 7)} h</span></button>`; }).join('')}</div>
    <div class="pannello" id="editor">${editor(ae)}</div>
  </div>
  <div id="bannerProg">${bannerMancanti()}</div>
  <div class="pannello mt"><h2>Oggi · tutta la flotta</h2><div class="tab-wrap">${cronoprogramma()}</div></div>`;
};
// Griglia della settimana: una riga per giorno, 24 ore; i voli dopo mezzanotte continuano sulla riga del giorno dopo
function settimanaGriglia(v, errDi) {
  const oggi = SIM.giornoSett(G.ora), righe = GS.map(() => []);
  v.giorni.forEach((gg, i) => gg.legs.forEach(l => {
    // un volo che passa la mezzanotte si spezza: la seconda parte va sulla riga del giorno dopo
    const r0 = (i + Math.floor(l.dep / 1440)) % 7, r1 = (i + Math.floor((l.arr - 1) / 1440)) % 7, a = l.dep % 1440;
    if (r0 === r1) righe[r0].push({ l, a, b: a + l.dur, cont: l.dep >= 1440 });
    else { righe[r0].push({ l, a, b: 1440, cont: false }); righe[r1].push({ l, a: 0, b: l.arr % 1440 || 1440, cont: true }); }
  }));
  return `<div class="sett"><div class="sett-scala"><span></span><div>${[0, 6, 12, 18, 24].map(o => `<i style="left:${o / 24 * 100}%">${pad(o % 24)}</i>`).join('')}</div></div>
    ${GS.map((nome, i) => `<div class="sett-riga ${i === bozza.sel ? 'on' : ''}" data-az="p-giorno" data-i="${i}" role="button" tabindex="0" aria-label="${nome}">
      <span class="sett-g">${GS3[i]}${i === oggi ? '<em>oggi</em>' : ''}${errDi(i) ? '<b class="sett-err" title="Ci sono errori in questo giorno">!</b>' : ''}</span>
      <div class="sett-pista">${righe[i].map(x => `<div class="sett-volo${x.cont ? ' cont' : ''}" style="left:${x.a / 14.4}%;width:${Math.max(0.6, (x.b - x.a) / 14.4)}%" data-tip="${h(`${x.l.da}→${x.l.a} ${SIM.oraDaMin(x.l.dep)}–${SIM.oraDaMin(x.l.arr)}`)}">${(x.b - x.a) > 70 ? x.l.da + '–' + x.l.a : ''}</div>`).join('')}</div></div>`).join('')}</div>`;
}
function editor(ae) {
  const m = MOD[ae.modello], prog = { turn: bozza.turn, giorni: bozza.giorni }, v = SIM.validaProgramma(G, ae, prog);
  const g = bozza.giorni[bozza.sel], ultimo = g.scali.at(-1), gv = v.giorni[bozza.sel] || { legs: [], turni: [] }, nome = GS[bozza.sel];
  const dest = Object.values(AP).filter(a => a.iata !== ultimo).map(a => ({ d: a.iata, k: SIM.km(ultimo, a.iata), aperta: !!G.rotte[SIM.chiave(ultimo, a.iata)] })).filter(x => x.k <= m.autonomia).sort((a, b) => a.k - b.k);
  const modificato = JSON.stringify({ turn: bozza.turn, giorni: bozza.giorni }) !== bozza.orig;
  const basiRientro = g.scali.length > 1 ? G.basi.filter(b => b !== ultimo && SIM.km(ultimo, b) <= m.autonomia) : [];
  const errDi = i => v.E.some(e => e.startsWith(GS[i] + ':'));
  const minimi = SIM.legsGiorno(ae, { ...g, attese: [] }, bozza.turn);
  return `<div class="testata" style="margin-bottom:10px"><h2 style="margin:0"><span class="mono">${h(ae.marche)}</span> · ${m.nome}</h2><span class="sotto">${cabTesto(ae.cab)} · autonomia ${num(m.autonomia)} km</span><span class="spazio"></span><button class="primario" data-az="guida" data-id="${ae.id}">✨ Rotazione guidata</button></div>
    ${ae.stato === 'consegna' ? `<p class="piccolo"><span class="badge b-info">In consegna a ${ae.base}</span> Puoi già preparare il programma: partirà alla consegna.</p>` : ''}
    ${settimanaGriglia(v, errDi)}
    <div class="giorno-testa"><h3>${nome}</h3>
      <div class="filtri" style="margin:0">
        <label class="campo">Parte da<select id="pPartenza">${opzioni(G.basi.map(b => [b, `${b} · ${citta(b)}`]), g.scali[0])}</select></label>
        <label class="campo">Primo decollo<input type="time" id="pInizio" value="${g.inizio}" step="300"></label>
        <label class="campo">Turnaround minimo<select id="pTurn">${opzioni((m.lungo ? [75, 90, 120, 150] : [25, 30, 35, 40, 45, 50, 60, 75, 90]).map(x => [x, x + ' min']), bozza.turn)}</select></label>
      </div></div>
    <div class="tratte">${gv.legs.length ? gv.legs.map((l, i) => { const r = G.rotte[SIM.chiave(l.da, l.a)], extra = g.attese?.[i] || 0;
      return `<div class="tratta-riga"><span class="n">${i + 1}</span>
        <span class="orario-volo">${i === 0 ? `<b class="mono">${oraMin(l.dep)}</b>` : `<input type="time" class="ora-volo" data-leg="${i}" value="${SIM.oraDaMin(l.dep)}" step="300" aria-label="Partenza del volo ${i + 1}">`}<small>${i > 0 ? (extra ? `+${extra} min a terra` : 'al più presto') : 'primo volo'}</small>${i > 0 ? `<button type="button" class="cambio ${g.cambi?.[i] ? 'on' : ''}" data-az="p-cambio" data-i="${i}" aria-pressed="${!!g.cambi?.[i]}" title="Qui sale un nuovo equipaggio">⇄ cambio equipaggio</button>` : ''}</span>
        <span><b>${l.da} → ${l.a}</b> <span class="muto">${h(citta(l.da))}–${h(citta(l.a))}</span><br><span class="piccolo">${oraMin(l.dep)}${localeMin(l.dep, l.da)} – ${oraMin(l.arr)}${localeMin(l.arr, l.a)} · ${fmtDur(l.dur)} · ${num(SIM.km(l.da, l.a))} km${r ? ` · ${CL.filter(c => ae.cab[c]).map(c => `${CLS[c].breve} ${eur(r['p' + c])}`).join(' · ')}` : ''}${G.hub.includes(l.a) ? ' · <b>arrivo in hub</b>' : ''}</span></span>
        <span>${i === gv.legs.length - 1 ? `<button class="piccolo" data-az="p-togli">Togli</button>` : ''}</span></div>`; }).join('')
      : `<p class="muto">Nessun volo: l’aereo resta a terra a ${g.scali[0]} tutto il giorno.</p>`}</div>
    <div class="filtri mt">
      <select id="pDest" aria-label="Prossimo scalo">${[['Rotte già aperte', dest.filter(x => x.aperta)], ['Da aprire · 30.000 € di lancio', dest.filter(x => !x.aperta)]].map(([t, l]) => l.length ? `<optgroup label="${t}">${l.map(x => `<option value="${x.d}">${x.d} · ${h(citta(x.d))} · ${num(x.k)} km${G.basi.includes(x.d) ? ' · base' : ''}</option>`).join('')}</optgroup>` : '').join('')}</select>
      <button data-az="p-aggiungi" ${dest.length ? '' : 'disabled'}>Aggiungi volo</button>
      ${basiRientro.map(b => `<button data-az="p-rientra" data-b="${b}">Torna a ${b}${G.rotte[SIM.chiave(ultimo, b)] ? '' : ' (apre la rotta)'}</button>`).join('')}
      ${g.scali.length > 2 && ultimo === g.scali[0] ? `<button data-az="p-ripeti">Ripeti il giro</button>` : ''}
      ${g.scali.length > 1 ? `<button class="pericolo" data-az="p-svuota">Svuota ${nome.toLowerCase()}</button>` : ''}
    </div>
    <div class="copia"><span>Copia ${nome.toLowerCase()} su</span>
      <button class="piccolo" data-az="p-copia" data-dove="succ">${GS[(bozza.sel + 1) % 7].toLowerCase()}</button>
      <button class="piccolo" data-az="p-copia" data-dove="feriali">lun–ven</button>
      <button class="piccolo" data-az="p-copia" data-dove="weekend">sab–dom</button>
      <button class="piccolo" data-az="p-copia" data-dove="tutti">tutta la settimana</button></div>
    ${turniGiornoHTML(ae, v, modificato, nome.toLowerCase())}
    ${v.piano.sforati.length ? `<div class="filtri mt"><button class="primario" data-az="p-sistema">Sistema i turni</button><span class="piccolo muto">Inserisce i cambi equipaggio dove un turno supera i limiti (anche fuori base, con l’equipaggio che arriva da passeggero)</span></div>` : ''}
    <div class="sett-sintesi"><div><small>Voli a settimana</small><b>${v.voliSett}</b></div><div><small>Ore di volo a settimana</small><b>${num(v.oreSett, 1)}</b></div><div><small>Notti</small><b class="mono piccolo">${bozza.giorni.map((x, i) => GS3[i] + ' ' + x.scali.at(-1)).join(' · ')}</b></div></div>
    ${v.E.length || v.W.length ? `<ul class="problemi">${v.E.map(e => `<li class="errore">✖ ${h(e)}</li>`).join('')}${v.W.map(e => `<li class="avviso">▲ ${h(e)}</li>`).join('')}</ul>` : v.voliSett ? '<ul class="problemi"><li class="ok">✓ Programma coerente: notti in base, turni nei limiti, settimana che si chiude su se stessa</li></ul>' : ''}
    <div class="filtri mt"><button class="primario" data-az="p-salva" ${v.E.length || !modificato ? 'disabled' : ''}>Salva programma</button>${modificato ? '<button data-az="p-annulla">Annulla modifiche</button><span class="piccolo muto">Modifiche non salvate</span>' : ''}</div>`;
}
// Turni del giorno scelto, ognuno con il suo equipaggio (anteprima se il programma non è ancora salvato)
function turniGiornoHTML(ae, v, modificato, nome) {
  const gv = v.giorni[bozza.sel]; if (!gv.turni.length) return '';
  const r = modificato ? SIM.roster(G, { sost: { id: ae.id, prog: { turn: bozza.turn, giorni: bozza.giorni } } }) : SIM.roster(G);
  const rf = SIM.roster(G, modificato ? { futuri: true, sost: { id: ae.id, prog: { turn: bozza.turn, giorni: bozza.giorni } } } : { futuri: true });
  return `<b class="piccolo">Equipaggi di ${nome}</b><ul class="turni">${gv.turni.map((t, i) => {
    const k = `${ae.id}#${t.idx}`, c = r.catene.find(x => x.chiavi.includes(k)), eq = c?.eq && G.equipaggi.find(e => e.id === c.eq);
    const cf = rf.catene.find(x => x.chiavi.includes(k)), futuro = !eq && cf?.eq && G.equipaggi.find(e => e.id === cf.eq);
    const desc = `<b>Turno ${i + 1}</b> · base ${t.base || '—'} · dalle ${oraMin(t.legs[0].dep - 60)}, ${fmtDur(t.fine - t.inizio)} di servizio (${fmtDur(t.blocco)} di volo) · ${t.piloti} piloti${t.lungo ? ' (lungo raggio)' : t.rinforzo ? ' (rinforzo)' : ''}${t.posizionato ? ' · arriva da passeggero' : ''}${t.continua ? ' · lo stesso equipaggio della sera prima' : ''} · ${t.legs.map(l => l.da).join('–')}–${t.termina}${t.termina === t.base ? '' : ` <span style="color:var(--warn)">(finisce fuori base)</span>`}`;
    let q;
    if (eq) q = `<span class="eq ok">${h(eq.nome)} · cpt. ${h(eq.capo)}</span>${modificato ? '<span class="muto piccolo">anteprima: salva per confermare</span>' : selettoreEquipaggio(k, c)}`;
    else if (futuro) q = `<span class="eq attesa">${h(futuro.nome)} · operativo dal ${fmtGiorno(futuro.pronto)}</span><span class="muto piccolo">fino ad allora il turno è scoperto</span>`;
    else q = `<span class="eq no">Nessun equipaggio</span><span class="muto piccolo">${h(c?.perche || '')}</span>${c?.base ? `<button class="piccolo primario" data-az="assumi-eq" data-b="${c.base}" data-t="${c.tipo}" data-p="${c.piloti}" data-c="${c.cabina}">Assumi · 10 gg · ${mln(SIM.costoAssunzione(c, false))}</button><button class="piccolo" data-az="assumi-eq" data-urg="1" data-b="${c.base}" data-t="${c.tipo}" data-p="${c.piloti}" data-c="${c.cabina}">Urgente · 2 gg · ${mln(SIM.costoAssunzione(c, true))}</button>` : ''}`;
    return `<li class="${eq ? '' : 'scoperto'}"><div>${desc}</div><div class="turno-eq">${q}</div></li>`;
  }).join('')}</ul>`;
}
function selettoreEquipaggio(k, c) {
  const adatti = G.equipaggi.filter(e => e.stato === 'attivo' && e.base === c.base && e.tipo === c.tipo && e.piloti >= c.piloti && e.cabina >= c.cabina);
  if (adatti.length < 2) return '';
  return `<select class="sel-eq" data-turno="${k}" aria-label="Scegli l’equipaggio del turno">${opzioni([['', 'Assegnazione automatica'], ...adatti.map(e => [e.id, `${e.nome} · cpt. ${e.capo}`])], G.fissi?.[k] || '')}</select>`;
}
// Riquadro "mancano equipaggi" con assunzione a un tocco
function bannerMancanti() {
  const n = SIM.A.stimaMancanti(G, false), u = SIM.A.stimaMancanti(G, true);
  if (!n.n) return '';
  const gruppi = {}; for (const e of n.equipaggi) { const k = `${e.base} · ${e.tipo} · ${e.piloti} piloti + ${e.cabina} cabina`; gruppi[k] = (gruppi[k] || 0) + 1; }
  return `<div class="mancano"><div><b>${n.n === 1 ? 'Manca 1 equipaggio' : `Mancano ${n.n} equipaggi`} per coprire tutti i turni della settimana</b><span class="piccolo">${Object.entries(gruppi).map(([k, q]) => `${q}× ${k}`).join(' · ')}${G.auto?.equipaggi ? ' · il pilota automatico li assume stanotte' : ''}</span></div>
    <div class="filtri" style="margin:0"><button class="primario" data-az="assumi-mancanti">Assumi tutti · 10 giorni · ${mln(n.costo)}</button><button data-az="assumi-mancanti" data-urg="1">Urgente · 2 giorni · ${mln(u.costo)}</button></div></div>`;
}
function cronoprogramma() {
  const oggi = SIM.mezzanotte(G.ora), pos = t => Math.max(0, Math.min(100, (t - oggi) / GIORNO * 100));
  let s = `<div class="crono"><div class="ore"><div></div><div class="scala">${Array.from({ length: 9 }, (_, i) => `<span style="left:${i * 12.5}%">${pad(i * 3)}:00</span>`).join('')}</div></div>`;
  for (const ae of flotta()) {
    s += `<div class="riga"><div class="chi" data-az="sel-aereo" data-id="${ae.id}"><span class="mono">${h(ae.marche)}</span><small>${ae.modello} · ${SIM.GIORNI_SETT[SIM.giornoSett(oggi)].toLowerCase()}</small></div><div class="pista">`;
    if (ae.lavori && ae.lavori.inizio < oggi + GIORNO) s += `<div class="blocco manut" style="left:${pos(ae.lavori.inizio)}%;width:${pos(ae.lavori.fine) - pos(ae.lavori.inizio)}%">${ae.lavori.tipo === 'cabina' ? 'Cabina' : 'Ispezione'}</div>`;
    for (const v of G.voli) if (v.ae === ae.id && v.dep < oggi + GIORNO && (v.arrEff || v.arr) > oggi) {
      const a = v.depEff || v.dep, b = v.arrEff || v.arr;
      s += `<div class="blocco ${v.stato === 'canc' ? 'canc' : ''}" style="left:${pos(a)}%;width:${Math.max(0.5, pos(b) - pos(a))}%" data-tip="${h(`${v.num} ${v.da}→${v.a} ${fmtOra(a)}–${fmtOra(b)}${v.stato === 'canc' ? ' · cancellato' : ''}`)}">${v.da}-${v.a}</div>`;
    }
    s += '</div></div>';
  }
  return s + `<div class="ora-ora" style="left:calc(100px + (100% - 100px) * ${(G.ora - oggi) / GIORNO})"></div></div>`;
}
