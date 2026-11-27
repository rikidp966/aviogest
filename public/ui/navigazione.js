'use strict';
// AvioGest — Navigazione per aree, schede di dettaglio (rotta, aereo, aeroporto), centro notifiche,
// salti di tempo, decisioni a scelta, guida e glossario, esporta/importa partita

/* ---------- Aree e schede ---------- */
const ICONE = {
  oggi: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  rete: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/><path d="M7.5 18.5H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7.5"/></svg>',
  commerciale: '<svg viewBox="0 0 24 24"><path d="M20.5 12.5l-8 8-9-9V3.5h8z"/><circle cx="7.5" cy="7.5" r="1.6"/></svg>',
  flotta: '<svg viewBox="0 0 24 24"><path d="M2 20h20M3 13.5l3.5 1 9.2-4.3a1.7 1.7 0 0 1 1.5 3l-9.7 4.4L3 16z"/><path d="M9 10.8 6 7.5l1.6-.7 5 2.4"/></svg>',
  azienda: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>'
};
const AREE = [
  { id: 'oggi', nome: 'Oggi', pagine: [['panoramica', 'Panoramica'], ['voli', 'Voli'], ['giornale', 'Giornale'], ['guida', 'Guida']] },
  { id: 'rete', nome: 'Rete', pagine: [['programmazione', 'Programmazione'], ['rotte', 'Rotte e prezzi'], ['hub', 'Hub'], ['aeroporti', 'Aeroporti e slot'], ['operazioni', 'Centro operativo']], extra: ['rotta', 'aeroporto'] },
  { id: 'commerciale', nome: 'Commerciale', pagine: [['prodotto', 'Bordo e tariffe'], ['fedelta', 'Fedeltà'], ['mercati', 'Mercati e ricerche'], ['accordi', 'Accordi'], ['marketing', 'Marketing'], ['ricavi', 'Ricavi'], ['concorrenza', 'Concorrenza']] },
  { id: 'flotta', nome: 'Flotta', pagine: [['flotta', 'Aerei'], ['mercato', 'Mercato aerei'], ['personale', 'Equipaggi']], extra: ['aereo'] },
  { id: 'azienda', nome: 'Azienda', pagine: [['direzione', 'Direzione'], ['finanze', 'Finanze e borsa'], ['sostenibilita', 'Sostenibilità'], ['obiettivi', 'Obiettivi'], ['impostazioni', 'Impostazioni']] }
];
const areaDi = v => AREE.find(a => a.pagine.some(p => p[0] === v) || (a.extra || []).includes(v)) || AREE[0];
function badgeArea(id) {
  if (!G) return 0;
  if (id === 'azienda') return riunioneAperta();
  if (id === 'oggi') return (G.dilemma ? 1 : 0) + (G.emergenza ? 1 : 0);
  if (id === 'flotta') return (SIM.copertura(G).scoperte ? 1 : 0) + (G.trattativa ? 1 : 0);
  return 0;
}
function schedeArea() {
  const a = areaDi(pagina);
  return `<div class="schede-area" role="navigation" aria-label="${a.nome}">${a.pagine.map(([v, t]) => { const n = v === 'direzione' ? riunioneAperta() : 0;
    return `<a href="#/${v}" class="${v === pagina ? 'on' : ''}" ${v === pagina ? 'aria-current="page"' : ''}>${t}${n ? `<i class="badge-n">${n}</i>` : ''}</a>`; }).join('')}</div>`;
}
function aggiornaNav() {
  const a = areaDi(pagina); UI.ultima ||= {};
  if (a.pagine.some(p => p[0] === pagina)) UI.ultima[a.id] = pagina;
  document.querySelectorAll('[data-area]').forEach(el => {
    const ar = AREE.find(x => x.id === el.dataset.area), n = badgeArea(ar.id);
    el.classList.toggle('attivo', ar === a);
    el.setAttribute('href', '#/' + (ar === a ? ar.pagine[0][0] : UI.ultima[ar.id] || ar.pagine[0][0]));
    if (ar === a) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    let b = el.querySelector('.badge-n'); if (n && !b) { b = document.createElement('i'); b.className = 'badge-n'; el.appendChild(b); }
    if (b) { if (n) b.textContent = n; else b.remove(); }
  });
}

/* ---------- Scheda rotta ---------- */
const linkRotta = (k, testo) => `<a class="link-rotta" href="#/rotta/${k}">${testo || k.replace('-', '–')}</a>`;
const linkAereo = ae => `<a class="link-rotta mono" href="#/aereo/${ae.id}">${h(ae.marche)}</a>`;
VISTE.rotta = () => {
  const k = UI.arg, r = G.rotte[k];
  if (!r) return '<div class="testata"><h1>Rotta non trovata</h1></div><p><a href="#/rotte">Torna alle rotte</a></p>';
  const [a, b] = k.split('-'), d = SIM.km(a, b), ref = SIM.prezzoRif(d), s = statsRotta(k), s30 = statsRotta(k, 30), sal = salute().rotte[k];
  const aerei = flotta().filter(ae => SIM.mediaCiclo(ae).tratte.some(l => SIM.chiave(l.da, l.a) === k));
  const riv = [...new Map(SIM.rivaliSu(G, a, b).map(x => [x.riv.id, x])).values()], studiato = SIM.studiato(G, a, b);
  const giorni = G.storico.slice(-30).filter(x => x.rotte && x.rotte[k]).map(x => ({ t: x.t, v: x.rotte[k].ricavi - x.rotte[k].costi }));
  const camp = (G.campagne || []).filter(c => c.obiettivo === k || c.ambito === 'rete');
  const mosse = SIM.intel(G) ? G.mosseRivali.filter(m => !m.fatta && m.k === k) : [];
  return `<div class="testata"><a class="indietro" href="#/rotte" aria-label="Torna alle rotte">←</a><h1>${a}–${b}</h1><span class="sotto">${h(citta(a))} – ${h(citta(b))} · ${num(d)} km · aperta il ${fmtGiorno(r.aperta)}</span></div>
  ${sal ? `<div class="salute ${sal.c} grande">${semaforo(sal)}${h(sal.t)}</div>` : ''}
  <div class="kpi mt">
    <div><small>Voli a settimana</small><b>${num(freqRotta(k) * 7)}</b><span>${aerei.length} ${aerei.length === 1 ? 'aereo' : 'aerei'}</span></div>
    <div><small>Riempimento 7 gg</small><b>${pct(s.posti ? s.pax / s.posti : null)}</b><span>30 gg ${pct(s30.posti ? s30.pax / s30.posti : null)}</span></div>
    <div><small>Utile voli 7 gg</small><b class="${s.ricavi - s.costi < 0 ? 'neg' : ''}">${mln(s.ricavi - s.costi)}</b><span>30 gg ${mln(s30.ricavi - s30.costi)}</span></div>
    <div><small>Quota di mercato</small><b>${pct(r.quota)}</b><span>${riv.length} concorrenti</span></div>
  </div>
  <div class="griglia g2">
    <div class="pannello"><h2>Prezzi</h2><div class="form">${CL.map(c => `<label>${CLS[c].nome}<span class="input-euro"><input class="prezzo" type="number" min="10" step="1" value="${r['p' + c]}" data-prezzo="${k}" data-cl="${c}"> €</span><small class="muto">riferimento ${eur(ref * SIM.multClasse(c, d))}</small></label>`).join('')}</div>
      <div class="filtri mt"><button data-az="analisi" data-k="${k}">Analisi prezzi</button><button data-az="ritocca" data-k="${k}" data-f="1.05">+5%</button><button data-az="ritocca" data-k="${k}" data-f="0.95">−5%</button></div>
      <p class="nota">Il prezzo migliore di solito tiene gli aerei pieni all’80–90%: se sono sempre pieni, alza.</p></div>
    <div class="pannello"><h2>Utile dei voli · ultimi 30 giorni</h2>${giorni.length > 1 ? graficoLinea(giorni) : '<p class="muto">Servono almeno due giorni di voli.</p>'}</div>
  </div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Aerei su questa rotta</h2>${aerei.length ? `<ul class="elenco">${aerei.map(ae => { const n = SIM.mediaCiclo(ae).tratte.filter(l => SIM.chiave(l.da, l.a) === k).reduce((x, l) => x + l.peso, 0); return `<li>${semaforo(salute().aerei[ae.id])}${linkAereo(ae)} <span class="muto">${MOD[ae.modello].nome}</span><span class="spazio"></span><span class="piccolo">${num(n * 7)} voli a settimana</span></li>`; }).join('')}</ul>` : '<p class="muto">Nessun aereo la vola.</p>'}
      <div class="filtri mt">${flotta().filter(ae => MOD[ae.modello].autonomia >= d)[0] ? `<button class="primario" data-az="apri-prop" data-da="${G.basi.includes(a) ? a : b}" data-a="${G.basi.includes(a) ? b : a}" data-mod="">Aggiungi con la rotazione guidata</button>` : ''}</div></div>
    <div class="pannello"><h2>Mercato</h2>
      <p class="piccolo">${studiato ? '<span class="badge b-ok">Studiata</span> domanda nota con precisione' : `<span class="badge">Stima ±30%</span> <button class="piccolo" data-az="studio" data-da="${a}" data-a="${b}">Studio di domanda · 15k</button>`}</p>
      ${riv.length ? `<ul class="elenco">${riv.map(x => `<li><span class="pallino" style="background:${x.riv.colore}"></span>${h(x.riv.nome)} <span class="spazio"></span><span class="piccolo">${x.freq} voli/g · ${eur(x.prezzo * ref)}${x.guerra ? ' <span class="badge b-err">sconti</span>' : ''}</span></li>`).join('')}</ul>` : '<p class="muto piccolo">Nessun concorrente diretto.</p>'}
      ${mosse.map(m => `<p class="piccolo neg">In arrivo: ${h(G.rivali.find(x => x.id === m.riv).nome)} aprirà questa rotta verso il ${fmtGiorno(m.t)}.</p>`).join('')}
      <p class="piccolo">${camp.length ? 'Pubblicità attiva: ' + camp.map(c => h(D.MARKETING[c.canale].nome + ' ' + c.etichetta)).join(', ') : 'Nessuna pubblicità su questa rotta.'} <a href="#/marketing">Marketing</a></p></div>
  </div>
  ${pannelloClientiRotta(k)}
  <div class="filtri mt"><button class="pericolo" data-az="chiudi-rotta" data-k="${k}">Chiudi la rotta</button></div>`;
};

/* ---------- Scheda aereo ---------- */
VISTE.aereo = () => {
  const ae = G.aerei.find(x => x.id === UI.arg && x.stato !== 'venduto');
  if (!ae) return '<div class="testata"><h1>Aereo non trovato</h1></div><p><a href="#/flotta">Torna alla flotta</a></p>';
  const giorni = SIM.normalizza(ae.prog).giorni, gruppi = [];
  giorni.forEach((x, i) => { const t = x.scali.length > 1 ? `${x.inizio} · ${x.scali.join(' → ')}` : `a terra a ${x.scali[0]}`; const u = gruppi.at(-1); if (u && u.t === t) u.a = i; else gruppi.push({ da: i, a: i, t }); });
  const voli = G.registro.map((r, i) => ({ r, i })).filter(x => x.r.marche === ae.marche).slice(0, 12);
  const tratte = [...new Set(SIM.mediaCiclo(ae).tratte.map(l => SIM.chiave(l.da, l.a)))];
  return `<div class="testata"><a class="indietro" href="#/flotta" aria-label="Torna alla flotta">←</a><h1 class="mono">${h(ae.marche)}</h1><span class="sotto">${MOD[ae.modello].nome} · base ${ae.base}</span><span class="spazio"></span><button data-az="guida" data-id="${ae.id}">✨ Rotazione guidata</button><button class="primario" data-az="vai-prog" data-id="${ae.id}">Modifica la settimana</button></div>
  <div class="griglia g2">
    ${cartaAereo(ae)}
    <div class="pannello"><h2>La sua settimana</h2>${SIM.mediaCiclo(ae).ore ? `<ul class="guida-giorni">${gruppi.map(x => `<li><b>${x.da === x.a ? GS3[x.da] : GS3[x.da] + '–' + GS3[x.a]}</b><span class="mono">${h(x.t)}</span></li>`).join('')}</ul>` : '<p class="muto">Nessuna rotazione: l’aereo resta a terra.</p>'}
      ${tratte.length ? `<p class="piccolo">Rotte: ${tratte.map(k => linkRotta(k)).join(' · ')}</p>` : ''}</div>
  </div>
  <div class="pannello mt"><h2>Ultimi voli</h2>${voli.length ? `<div class="tab-wrap"><table><thead><tr><th>Data</th><th>Volo</th><th>Tratta</th><th>Passeggeri</th><th class="num">Ricavi</th><th class="num">Costi</th><th>Esito</th></tr></thead><tbody>${voli.map(({ r, i }) => `<tr class="clic" data-az="dettaglio-volo" data-i="${i}"><td>${fmtGiorno(r.dep)} ${fmtOra(r.dep)}</td><td>${h(r.num)}</td><td>${r.da} → ${r.a}</td><td>${barretta(r.posti ? r.pax / r.posti : 0, `${r.pax}/${r.posti}`, [2, 2])}</td><td class="num">${eur(r.ricavi)}</td><td class="num">${eur(r.costi)}</td><td>${r.stato === 'canc' ? `<span class="badge b-err">Cancellato</span>` : r.rit > 15 ? `<span class="badge b-warn">+${r.rit} min</span>` : '<span class="badge b-ok">Puntuale</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muto">Ancora nessun volo.</p>'}</div>`;
};

/* ---------- Scheda aeroporto (dalla mappa o dalle liste) ---------- */
function apriAeroporto(i) {
  const A = AP[i], base = G.basi.includes(i), hub = G.hub.includes(i), mie = Object.keys(G.rotte).filter(k => k.split('-').includes(i));
  const riv = G.rivali.filter(r => r.hub === i || Object.keys(r.rotte).some(k => k.split('-').includes(i)));
  const costoBase = A.slot ? 500000 : 300000;
  const dalleBasi = base ? [] : G.basi.map(b => ({ b, k: SIM.km(b, i), aperta: !!G.rotte[SIM.chiave(b, i)], studiato: SIM.studiato(G, b, i) })).filter(x => flotta().some(ae => MOD[ae.modello].autonomia >= x.k));
  const cand = base ? SIM.candidati(G, i, 5) : [];
  modale({
    titolo: `${i} · ${A.citta}`, larga: true,
    corpo: `<p class="piccolo muto" style="margin-top:0">${h(A.nome)} · ${h(A.nomePaese)} · ${fusoTxt(A.fuso)}${base ? ' · <b>tua base</b>' : ''}${hub ? ' · <b>tuo hub</b>' : ''}</p>
      <div class="kpi"><div><small>Bacino</small><b>${num(A.pop * 1000)}</b><span>abitanti</span></div><div><small>Turismo</small><b>${pct(A.tur)}</b><span>della clientela</span></div>
        <div><small>Tasse</small><b>${eur(A.tassa)}</b><span>a passeggero</span></div><div><small>Slot</small><b>${A.slot ? `${G.slot[i] || 0} tuoi` : 'liberi'}</b><span>${A.slot ? `${eur(A.slotPrezzo)} l’uno` : 'nessun limite'}</span></div></div>
      ${mie.length ? `<p class="piccolo">Le tue rotte: ${mie.map(k => linkRotta(k)).join(' · ')}</p>` : ''}
      ${riv.length ? `<p class="piccolo">Concorrenti: ${riv.map(r => `<span class="pallino" style="background:${r.colore}"></span>${h(r.nome)}${r.hub === i ? ' (hub)' : ''}`).join(' · ')}</p>` : ''}
      ${dalleBasi.length ? `<h3>Collegala a una tua base</h3><ul class="elenco">${dalleBasi.map(x => `<li><b>${x.b}–${i}</b> <span class="muto piccolo">${num(x.k)} km</span><span class="spazio"></span>${x.studiato ? '' : `<button class="piccolo" data-az="studio" data-da="${x.b}" data-a="${i}">Studio · 15k</button>`}${x.aperta ? linkRotta(SIM.chiave(x.b, i), 'Vedi rotta') : `<button class="piccolo primario" data-az="apri-prop" data-da="${x.b}" data-a="${i}" data-mod="">Apri e programma</button>`}</li>`).join('')}</ul>` : ''}
      ${cand.length ? `<h3>Destinazioni promettenti da qui</h3><ul class="elenco">${cand.map(x => `<li><b>${x.da}–${x.a}</b> <span class="muto piccolo">${h(citta(x.a))} · ${num(x.km)} km · ${x.studiato ? mln(x.utile) : `${mln(x.utile * 0.7)}–${mln(x.utile * 1.3)}`} al giorno</span><span class="spazio"></span><button class="piccolo primario" data-az="apri-prop" data-da="${x.da}" data-a="${x.a}" data-mod="${x.mod}">Apri e programma</button></li>`).join('')}</ul>` : ''}`,
    piede: `<button data-az="chiudi">Chiudi</button><button data-az="chiedi-offerta" data-i="${i}">Chiedi un’offerta di accordo</button>${base ? (hub ? '' : `<button data-az="hub-qui" data-i="${i}">Trasforma in hub · ${mln(D.HUB.costo)}</button>`) : `<button data-az="base-qui" data-i="${i}">Apri una base · ${mln(costoBase)}</button>`}`
  });
}

/* ---------- Centro notifiche ---------- */
const nonLette = () => G ? G.notizie.filter(n => n.t > (G.lette || 0)).length : 0;
function apriNotifiche(filtro = UI.filtroNotizie || 'tutte') {
  UI.filtroNotizie = filtro;
  const F = { tutte: () => true, importanti: n => n.imp || n.festa, buone: n => n.tipo === 'buona', cattive: n => n.tipo === 'cattiva' };
  const l = G.notizie.filter(F[filtro]).slice(0, 80), lette = G.lette || 0;
  modale({ titolo: 'Notizie', larga: true,
    corpo: `<div class="segmenti" style="margin-bottom:10px">${[['tutte', 'Tutte'], ['importanti', 'Importanti'], ['buone', 'Buone'], ['cattive', 'Problemi']].map(([k, t]) => `<button data-az="filtro-notizie" data-f="${k}" class="${k === filtro ? 'on' : ''}">${t}</button>`).join('')}</div>
      <ul class="notizie">${l.length ? l.map(x => `<li class="${x.tipo}${x.t > lette ? ' nuova' : ''}">${h(x.testo)}<small>${fmtGiorno(x.t)} ${fmtOra(x.t)}</small></li>`).join('') : '<li class="muto">Nessuna notizia</li>'}</ul>` });
  G.lette = G.ora; aggiornaCampanella();
}
function aggiornaCampanella() { const b = $('#cNotifiche'); if (!b || !G) return; const n = nonLette(), t = n > 99 ? '99+' : String(n); const s = b.querySelector('i'); if (s.textContent !== (n ? t : '')) { s.textContent = n ? t : ''; s.hidden = !n; } }

/* ---------- Salti di tempo ---------- */
function salta(tipo) {
  if (!G) return;
  vel = 0; aggiornaVel();
  const mez = SIM.mezzanotte(G.ora), t0 = G.ora;
  let fine;
  if (tipo === 'domani') fine = SIM.giornoDopo(mez) + 6 * ORA;
  else if (tipo === 'lunedi') { let g = mez; if (!(SIM.giornoSett(g) === 0 && G.ora < g + 8 * ORA)) { g = SIM.giornoDopo(g); while (SIM.giornoSett(g) !== 0) g = SIM.giornoDopo(g); } fine = g + 8 * ORA + 5 * MIN; }
  else fine = G.ora + 10 * GIORNO;
  let fermo = null;
  while (G.ora < fine && !(G.esito && !G.esito.visto)) {
    SIM.avanza(G, Math.min(ORA, fine - G.ora));
    if (tipo === 'evento') { const n = (G._nuove || []).find(x => x.imp || x.festa); if (n) { fermo = n; break; } }
  }
  gestisciNovita();
  const giorni = Math.round((G.ora - t0) / GIORNO * 10) / 10;
  toast(fermo ? `Fermato dopo ${giorni} giorni: ${fermo.testo}` : `Avanzato di ${giorni} giorni`, fermo ? fermo.tipo : '');
  Mappa.disegnaRete(); render();
}

/* ---------- Decisioni a scelta ---------- */
function bannerDilemma() {
  const d = G.dilemma; if (!d) return '';
  return `<div class="banner-riunione dilemma"><span class="br-icona" aria-hidden="true">⚖️</span><div><b>Decisione da prendere</b><span class="piccolo">${h(d.titolo)} · scade tra ${giorniA(d.scade)} giorni</span></div><button class="btn primario" data-az="apri-dilemma">Decidi</button></div>`;
}
function apriDilemma() {
  const d = G.dilemma; if (!d) return;
  modale({ titolo: d.titolo, corpo: `<p>${h(d.testo)}</p><div class="opzioni-dilemma">${d.opzioni.map((o, i) => `<button data-az="dilemma" data-i="${i}" class="${i === 0 ? 'primario' : ''}"><b>${h(o.t)}</b><small>${h(o.d)}</small></button>`).join('')}</div>
    <p class="nota">Se non decidi entro ${giorniA(d.scade)} giorni vale l’ultima opzione.</p>` });
}

/* ---------- Guida e glossario ---------- */
const GLOSSARIO = [
  ['Riempimento (load factor)', 'Posti venduti diviso posti offerti. Sopra il 90% di solito i prezzi sono troppo bassi, sotto il 60% troppo alti o i voli troppi.'],
  ['Prezzo di riferimento', 'La tariffa “normale” per quella distanza. Il prezzo migliore spesso è un po’ più alto, finché gli aerei restano pieni all’80–90%.'],
  ['Base', 'Aeroporto dove gli aerei dormono e dove assumi gli equipaggi. Ogni rotazione inizia e finisce in una base.'],
  ['Hub', 'Una base dove vendi voli in coincidenza: chi va da A a C passa da te in B.'],
  ['Rotazione', 'Il programma settimanale di un aereo: i voli di ogni giorno, dal lunedì alla domenica.'],
  ['Turnaround', 'Minuti a terra tra un arrivo e la ripartenza. Più è corto, più voli fai, ma i ritardi si propagano.'],
  ['Turno ed equipaggio', 'Un turno è una serie di voli fatti dallo stesso equipaggio (al massimo 13 ore, 15 o 17 con tre piloti). Senza equipaggio il volo è cancellato.'],
  ['Slot', 'Negli aeroporti congestionati serve uno slot per ogni partenza giornaliera: si comprano una volta.'],
  ['Gradimento e NPS', 'Quanto i passeggeri apprezzano il prodotto di bordo rispetto a ciò che si aspettano. Più gradimento = accettano prezzi più alti.'],
  ['Stima ±30%', 'Senza uno studio di mercato la domanda vera di una rotta può essere il 30% più alta o più bassa di quella mostrata.'],
  ['Overbooking', 'Vendere qualche biglietto in più dei posti: circa il 6% non si presenta. Se si presentano tutti, chi resta a terra va risarcito.'],
  ['Fiducia del CdA', 'Il consiglio di amministrazione giudica ogni 6 mesi i tuoi risultati. Con poca fiducia le banche alzano i tassi e il titolo vale meno.']
];
VISTE.guida = () => `<div class="testata"><h1>Guida</h1><span class="sotto">Come si gioca, in breve</span></div>
  <div class="griglia g2">
    <div class="pannello"><h2>I primi passi</h2><ol class="passi">
      <li><b>Dai una rotazione a ogni aereo.</b> Usa <i>✨ Rotazione guidata</i>: scegli una meta (o due), il gioco calcola orari, turni, rotte e slot.</li>
      <li><b>Avvia il tempo</b> con ▶ in alto, oppure salta a domani o alla prossima riunione.</li>
      <li><b>Segui i consigli del giorno</b> in Panoramica: un tocco alza o abbassa i prezzi, assume equipaggi, programma le ispezioni.</li>
      <li><b>Guarda i semafori</b> su rotte e aerei: rosso = problema, giallo = da guardare.</li>
      <li><b>Ogni lunedì decidi in riunione</b> le proposte dei dirigenti (Azienda › Direzione).</li>
      <li><b>Cresci</b>: nuove destinazioni da Mercati e ricerche, nuovi aerei dal Mercato aerei, poi basi e hub.</li></ol></div>
    <div class="pannello"><h2>Dove trovo cosa</h2><ul class="elenco">${AREE.map(a => `<li><span class="icona-area" aria-hidden="true">${ICONE[a.id]}</span><b>${a.nome}</b><span class="piccolo muto">${a.pagine.map(p => p[1]).join(' · ')}</span></li>`).join('')}</ul>
      <h3 class="mt">Comandi</h3><p class="piccolo">Barra spaziatrice: pausa · tasti 1, 2, 3: velocità · ⏭ in alto: salti di tempo · 🔔: notizie. Tocca un aeroporto sulla mappa per aprire la sua scheda.</p></div>
  </div>
  <div class="pannello mt"><h2>Glossario</h2><dl class="glossario">${GLOSSARIO.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl></div>`;

/* ---------- Esporta e importa ---------- */
function esportaPartita() {
  const blob = new Blob([JSON.stringify(G, (k, v) => k.startsWith('_') ? undefined : v)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `aviogest-${G.nome.replace(/[^\w]+/g, '-').toLowerCase()}-${SIM.dataDi ? SIM.dataDi(G.ora) : 'partita'}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Partita esportata: aprila da un altro dispositivo con “Importa partita”', 'buona');
}
async function importaPartita(file) {
  try {
    const g = JSON.parse(await file.text());
    if (!g || !g.aerei || !g.scenario) throw new Error('formato');
    SIM.migra(g);
    await Archivio.salva(g, JSON.stringify(g, (k, v) => k.startsWith('_') ? undefined : v));
    chiudiModale(); avviaPartita(g); toast(`Partita “${g.nome}” importata`, 'buona');
  } catch { toast('File non valido: serve un file esportato da AvioGest', 'err'); }
}
function pannelloPartita() {
  return `<div class="pannello mt"><h2>Partita</h2><p class="piccolo">${Archivio.server ? 'Le partite si salvano sul server di casa.' : 'Online le partite restano su questo dispositivo: per continuarle altrove esportale e importale.'}</p>
    <div class="filtri"><button data-az="salva">Salva ora</button><button data-az="esporta">Esporta partita</button><label class="btn">Importa partita<input type="file" accept=".json,application/json" id="importaFile" hidden></label><button data-az="esci">Torna al menu</button></div></div>`;
}

/* ---------- Ripristino del punto in cui stavi scrivendo dopo un nuovo render ---------- */
function selettoreDi(el) {
  if (!el || el === document.body || !$('#vista').contains(el)) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const d = Object.entries(el.dataset); if (!d.length) return null;
  return el.tagName.toLowerCase() + d.map(([k, v]) => `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(v)}"]`).join('');
}
function conFuoco(fn) {
  const a = document.activeElement, sel = selettoreDi(a), pos = a && 'selectionStart' in a ? (() => { try { return [a.selectionStart, a.selectionEnd]; } catch { return null; } })() : null;
  fn();
  if (!sel) return;
  const b = document.querySelector(sel); if (!b) return;
  b.focus({ preventScroll: true }); if (pos && pos[0] != null) try { b.setSelectionRange(pos[0], pos[1]); } catch { }
}
