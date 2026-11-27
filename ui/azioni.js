'use strict';
// AvioGest — Azioni dei pulsanti (data-az)

/* ---------- Azioni ---------- */
const AZ = {
  chiudi: () => chiudiModale(),
  'tab-fin': el => { UI.tabFin = el.dataset.t; render(); },
  'periodo-ce': el => { UI.periodoCE = +el.dataset.n; render(); },
  obbligazione: () => { if (esito(SIM.A.obbligazione(G, +$('#impObbl').value, +$('#anniObbl').value))) render(); },
  'cop-carb': el => conferma('Bloccare il prezzo del cherosene?', 'Paghi un premio adesso e il prezzo resta quello di oggi per il periodo scelto.', 'Blocca', () => { if (esito(SIM.A.coperturaCarburante(G, +el.dataset.m))) render(); }),
  'cop-cambio': el => conferma('Bloccare il cambio euro/dollaro?', 'Paghi un premio adesso; leasing e carburante si pagheranno al cambio di oggi per il periodo scelto.', 'Blocca', () => { if (esito(SIM.A.coperturaCambio(G, +el.dataset.m))) render(); }),
  promozione: el => { if (esito(SIM.A.promozione(G, el.dataset.k, +el.dataset.s, +el.dataset.g))) render(); },
  revisione: el => { if (esito(SIM.A.revisione(G, el.dataset.id, el.dataset.t, el.dataset.q || 'subito'))) render(); },
  ammoderna: el => { const X = SIM.AMMODERNAMENTI[el.dataset.c]; conferma(`${X.nome}?`, `Consumi −${Math.round((1 - X.fattore) * 100)}% per sempre. L’aereo resta a terra ${X.giorni} giorni.`, 'Procedi', () => { if (esito(SIM.A.ammoderna(G, el.dataset.id, el.dataset.c))) render(); }); },
  'leasing-scelta': el => { esito(SIM.A.leasing(G, el.dataset.id, el.dataset.s)); render(); },
  diritti: el => { const [p1, p2] = el.dataset.k.split('-'), a = Object.values(AP).find(x => x.paese === p1)?.iata, b = Object.values(AP).find(x => x.paese === p2)?.iata; if (a && b && esito(SIM.A.diritti(G, a, b))) render(); },
  aderisci: el => { const X = SIM.ALLEANZE_G[el.dataset.id]; conferma(`Entrare in ${X.nome}?`, `Quota d’ingresso ${eur(SIM.QUOTA_GLOBALE)} e ${eur(SIM.CANONE_GLOBALE)} al giorno. Più passeggeri in coincidenza e pace con tutti i membri.`, 'Aderisci', () => { if (esito(SIM.A.aderisci(G, el.dataset.id))) render(); }); },
  'lascia-alleanza': () => conferma('Uscire dall’alleanza?', 'Penale di 1 M€; i membri tornano concorrenti a tutti gli effetti.', 'Esci', () => { esito(SIM.A.lasciaAlleanza(G)); render(); }),
  'apri-emergenza': () => apriEmergenza(),
  emergenza: el => { if (esito(SIM.A.emergenza(G, +el.dataset.i))) { chiudiModale(); dopoAzione(); } },
  marchio: el => { const M = G.marchio || {}; esito(SIM.A.impostazione(G, 'marchio', { colore: el.dataset.colore || M.colore, simbolo: el.dataset.simbolo || M.simbolo })); applicaMarchio(); Mappa.disegnaRete(); render(); },
  'assumi-riserve': () => { if (esito(SIM.A.assumiRiserve(G))) render(); },
  'sondaggio-clima': () => { if (esito(SIM.A.sondaggioClima(G))) render(); },
  'corso-cabina': () => conferma('Corso di servizio per la cabina?', `Costa ${eur(150000 + 1000 * G.equipaggi.length)}: per un anno i passeggeri apprezzano di più il servizio di bordo, e il morale sale un po’.`, 'Fai il corso', () => { if (esito(SIM.A.corsoCabina(G))) render(); }),
  'eq-riserva': el => { esito(SIM.A.riserva(G, el.dataset.id, !!el.dataset.si)); render(); },
  'eq-stabilizza': el => { if (esito(SIM.A.stabilizza(G, el.dataset.id))) render(); },
  pianifica: () => apriPianificatore(),
  'applica-piano': () => { const r = SIM.A.applicaPianoFlotta(G, UI.pianoFlotta, { urgente: !!UI.pianoUrgente }); if (esito(r) || r.errore) { chiudiModale(); bozza = null; UI.pianoFlotta = null; if (pagina !== 'programmazione') location.hash = '#/programmazione'; dopoAzione(); } },
  'firma-carta': el => { if (esito(SIM.A.firmaCarta(G, el.dataset.id))) render(); },
  scuola: () => conferma('Aprire la scuola piloti?', 'Costa 2,5 M€ subito e 4.000 € al giorno. Il primo corso finisce tra 4 mesi, poi 6 nuovi piloti ogni 2 mesi: assunzioni in 3 giorni e molto più economiche.', 'Apri la scuola', () => { if (esito(SIM.A.scuolaPiloti(G))) render(); }),
  'apri-trattativa': () => apriTrattativa(),
  sind: el => {
    const t = el.dataset.t, aumento = (+$('#sindAumento')?.value || 0) / 100, premio = !!$('#sindPremio')?.checked;
    if (t === 'rompi') return conferma('Rompere la trattativa?', 'Il sindacato proclama tre giorni di sciopero e il morale crolla. Si riparte tra un mese.', 'Rompi', () => { esito(SIM.A.trattativa(G, { tipo: 'rompi' })); chiudiModale(); dopoAzione(); });
    UI.propostaSind = aumento * 100;
    const r = SIM.A.trattativa(G, { tipo: t, aumento, premio });
    if (r.ok) { toast(r.msg, 'buona'); suono('buona'); chiudiModale(); UI.propostaSind = null; dopoAzione(); }
    else { toast(r.errore, 'cattiva'); if (G.trattativa) apriTrattativa(); else chiudiModale(); render(); }
  },
  'accetta-offerta': el => { if (esito(SIM.A.accettaOfferta(G, el.dataset.id))) render(); },
  'rifiuta-offerta': el => { esito(SIM.A.rifiutaOfferta(G, el.dataset.id)); render(); },
  recedi: el => { const a = G.accordi.find(x => x.id === el.dataset.id); conferma(`Recedere dall’accordo con ${a.nome}?`, `Paghi una penale di ${eur(a.penale)} e perdi gli sconti o i contributi.`, 'Recedi', () => { esito(SIM.A.recediAccordo(G, el.dataset.id)); render(); }); },
  'chiedi-offerta': el => { const i = el.dataset.i || $('#offAeroporto')?.value; if (esito(SIM.A.chiediOfferta(G, i))) { chiudiModale(); location.hash = '#/accordi'; render(); } },
  'apri-aeroporto': el => apriAeroporto(el.dataset.i),
  'annulla-ordine': el => { const ae = G.aerei.find(a => a.id === el.dataset.id); conferma(`Annullare l’ordine di ${ae.marche}?`, ae.acconto ? `Perdi l’acconto di ${eur(ae.acconto)}.` : 'L’aereo non verrà consegnato.', 'Annulla ordine', () => { esito(SIM.A.annullaOrdine(G, el.dataset.id)); dopoAzione(); }); },
  'stagione-ed': el => { UI.stagioneAlt = el.dataset.alt === '1'; bozza = null; render(); },
  'copia-stagione': el => { esito(SIM.A.copiaStagione(G, el.dataset.id)); bozza = null; render(); },
  'togli-stagione': el => conferma('Un solo programma tutto l’anno?', 'Il programma dell’altra stagione viene cancellato.', 'Conferma', () => { esito(SIM.A.togliStagione(G, el.dataset.id)); UI.stagioneAlt = false; bozza = null; render(); }),
  alleanza: el => { if (esito(SIM.A.alleanza(G, el.dataset.r, el.dataset.l))) { suono('buona'); } render(); },
  'chiudi-alleanza': el => { const R = G.rivali.find(x => x.id === el.dataset.r); conferma(`Chiudere l’accordo con ${R.nome}?`, 'Tornerete concorrenti a tutti gli effetti, le joint venture finiscono e per 60 giorni non accetteranno nuove proposte. Reputazione −1.', 'Chiudi accordo', () => { esito(SIM.A.chiudiAlleanza(G, el.dataset.r)); render(); }); },
  jv: el => { const k = $('#jv-' + el.dataset.r)?.value; if (esito(SIM.A.jointVenture(G, el.dataset.r, k))) render(); },
  acquisisci: el => {
    const R = G.rivali.find(x => x.id === el.dataset.r), fl = SIM.flottaRivale(R), prezzo = SIM.prezzoAcquisto(G, R);
    conferma(`Comprare ${R.nome} per ${eur(prezzo)}?`, `Ottieni ${fl.map(x => x.n + ' ' + MOD[x.mod].nome).join(', ')}, ${Object.keys(R.rotte).length} rotte, i suoi slot, i suoi equipaggi e la base di ${citta(R.hub)}. Gli aerei arrivano con una settimana provvisoria sulle sue rotte: controllala in Programmazione. Il concorrente sparisce dal mercato.`, 'Compra la compagnia', () => { if (esito(SIM.A.acquisisci(G, el.dataset.r))) { suono('buona'); dopoAzione(); } });
  },
  notifiche: () => apriNotifiche(),
  'filtro-notizie': el => apriNotifiche(el.dataset.f),
  salta: el => { chiudiModale(); salta(el.dataset.s); },
  'salti-menu': () => modale({ titolo: 'Salta avanti', corpo: `<div class="opzioni-dilemma"><button data-az="salta" data-s="domani"><b>A domani mattina</b><small>Alle 06:00 del giorno dopo</small></button><button data-az="salta" data-s="lunedi"><b>Alla riunione di lunedì</b><small>Lunedì alle 08:00, con le proposte dei dirigenti</small></button><button data-az="salta" data-s="evento"><b>Fino alla prossima notizia importante</b><small>Al massimo 10 giorni</small></button></div>` }),
  'apri-dilemma': () => apriDilemma(),
  dilemma: el => { if (esito(SIM.A.dilemma(G, +el.dataset.i))) { chiudiModale(); dopoAzione(); } },
  esporta: () => esportaPartita(),
  ritocca: el => { if (esito(SIM.A.ritocca(G, el.dataset.k, +el.dataset.f))) render(); },
  'base-qui': el => { if (esito(SIM.A.apriBase(G, el.dataset.i))) { chiudiModale(); dopoAzione(); } },
  'hub-qui': el => { if (esito(SIM.A.apriHub(G, el.dataset.i))) { chiudiModale(); dopoAzione(); } },
  decidi: el => { const r = SIM.A.decidi(G, +el.dataset.i, !!el.dataset.si); if (esito(r)) { suono(el.dataset.si ? 'buona' : 'click'); dopoAzione(); } },
  convoca: () => { G.direzione.ultimaStraordinaria = G.ora; SIM.convocaRiunione(G); gestisciNovita(); if (!riunioneAperta()) toast('Nessun dirigente ha proposte da fare in questo momento'); render(); },
  progetto: el => { const P = D.PROGETTI[el.dataset.t]; conferma(`Avviare «${P.nome}»?`, `${P.effetto}. Pronto in ${P.giorni} giorni.`, 'Avvia', () => { if (esito(SIM.A.progetto(G, el.dataset.t))) render(); }); },
  strategia: el => { const x = D.STRATEGIE[el.dataset.s]; conferma(`Passare a ${x.nome}?`, `${x.descr} Costo del cambio di immagine 300.000 €, reputazione −3. Potrai cambiare di nuovo tra 6 mesi.`, 'Cambia posizionamento', () => { if (esito(SIM.A.strategia(G, el.dataset.s))) render(); }); },
  ricerca: () => { const tipo = $('#rcTipo').value, x = { tipo }; if (tipo === 'domanda') { x.da = $('#rcDa').value; x.a = $('#rcA').value; } if (tipo === 'area') x.base = $('#rcBase').value; if (esito(SIM.A.ricerca(G, x))) render(); },
  'ricerca-rapida': el => { if (esito(SIM.A.ricerca(G, { tipo: el.dataset.t }))) render(); },
  studio: el => { if (esito(SIM.A.ricerca(G, { tipo: 'domanda', da: el.dataset.da, a: el.dataset.a }))) { if (!$('#modale').hidden && $('#infoRotta')) infoRotta(); else render(); } },
  'apri-prop': el => {
    const { da, a, mod } = el.dataset;
    if (!G.rotte[SIM.chiave(da, a)] && !esito(SIM.A.apriRotta(G, da, a))) return;
    const k = SIM.km(da, a), adatti = flotta().filter(x => MOD[x.modello].autonomia >= k).sort((x, y) => (x.modello === mod ? 0 : 1) - (y.modello === mod ? 0 : 1) || SIM.mediaCiclo(x).ore - SIM.mediaCiclo(y).ore);
    dopoAzione();
    if (!adatti.length) return toast('Rotta aperta: nessun aereo della flotta arriva fin lì, comprane uno nel Mercato aerei', 'err');
    apriGuida(adatti[0].id); UI.guida.base = da; UI.guida.tipo = k > 3500 && MOD[adatti[0].modello].lungo ? 'lungo' : 'navetta'; UI.guida.dest = [a]; disegnaGuida();
  },
  ipo: () => { const q = +$('#quotaIpo').value; conferma('Quotarsi in borsa?', `Vendi il ${Math.round(q * 100)}% della compagnia al mercato. Incassi subito, ma da ora il prezzo del titolo e il CdA giudicheranno ogni tua mossa.`, 'Quotati', () => { if (esito(SIM.A.quotazione(G, q))) render(); }); },
  aumento: () => { if (esito(SIM.A.aumentoCapitale(G, 0.1))) render(); },
  dividendo: () => { if (esito(SIM.A.dividendo(G, +$('#importoBorsa').value))) render(); },
  riacquisto: () => { if (esito(SIM.A.riacquisto(G, +$('#importoBorsa').value))) render(); },
  consiglio: el => {
    const c = UI.consigli?.[+el.dataset.i], a = c?.azioni[+el.dataset.j]; if (!a) return;
    if (a.vai) { location.hash = '#/' + a.vai; return; }
    if (a.guida) { apriGuida(a.guida); return; }
    if (esito(SIM.A[a.az](G, ...a.args))) { suono('click'); dopoAzione(); }
  },
  guida: el => apriGuida(el.dataset.id),
  'g-tipo': el => { UI.guida.tipo = el.dataset.t; if (UI.guida.tipo === 'lungo' || UI.guida.tipo === 'navetta') UI.guida.dest.length = 1; UI.guida.giri = 0; disegnaGuida(); },
  'g-giri': el => { UI.guida.giri = +el.dataset.n; const s = $('#gGiri'); if (s) s.value = el.dataset.n; calcolaGuida(); },
  'g-applica': () => {
    const g = UI.guida, r = g.ris; if (!r || !r.ok) return;
    const ae = G.aerei.find(a => a.id === g.aeId);
    const esA = SIM.A.applicaRotazione(G, g.aeId, r); if (esA.errore) return toast(esA.errore, 'err');
    { chiudiModale(); suono('buona'); bozza = null; UI.aereoSel = g.aeId; if (pagina === 'programmazione') dopoAzione(); else { location.hash = '#/programmazione'; Mappa.disegnaRete(); } toast(`${ae.marche}: ${r.descr}`, 'buona'); }
  },
  'g-editor': () => {
    const g = UI.guida, r = g.ris; if (!r || !r.ok) return;
    const extra = r.costo; if (G.cassa < extra) return toast(`Servono ${eur(extra)} per aprire rotte e slot`, 'err');
    for (const k of r.nuove) { const [a, b] = k.split('-'); SIM.A.apriRotta(G, a, b); }
    for (const x of r.slot) SIM.A.compraSlot(G, x.i, x.n);
    const ae = G.aerei.find(a => a.id === g.aeId), giorni = SIM.normalizza(ae.prog).giorni;
    bozza = { aeId: ae.id, turn: r.prog.turn, giorni: r.prog.giorni.map(copiaGiorno), sel: SIM.giornoSett(G.ora), orig: JSON.stringify({ turn: ae.prog.turn, giorni }) };
    UI.aereoSel = ae.id; chiudiModale();
    if (pagina === 'programmazione') dopoAzione(); else { location.hash = '#/programmazione'; Mappa.disegnaRete(); }
    toast('Rotazione caricata nell’editor: controlla e salva', 'buona');
  },
  'menu-apri': () => $('#app').classList.add('menu-aperto'),
  'menu-chiudi': () => $('#app').classList.remove('menu-aperto'),
  conferma: () => { const f = CONFERMA; CONFERMA = null; chiudiModale(); if (f) f(); },
  vel: el => { vel = +el.dataset.v; aggiornaVel(); suono('click'); if (G && G.stat.voli === 0 && pagina === 'panoramica') render(); },
  suoni: () => { UI.suoni = !UI.suoni; salvaOpz(); $('#cSuoni').textContent = UI.suoni ? '🔊' : '🔈'; },
  salva: () => salva(true),
  esci: async () => { chiudiModale(); $('#app').classList.remove('menu-aperto'); if (G) await salva(); location.hash = ''; menuIniziale(); },
  'scegli-scenario': el => { UI.scenarioSel = el.dataset.s; menuIniziale(); },
  'nuova-partita': () => {
    const nome = $('#nNome').value.trim() || 'Volaria', codice = ($('#nCodice').value.trim() || 'VL').toUpperCase();
    avviaPartita(SIM.nuovaPartita(UI.scenarioSel, { nome, codice, base: $('#nBase')?.value })); salva();
  },
  carica: async el => { try { avviaPartita(await Archivio.carica(el.dataset.id)); } catch (e) { console.error(e); toast('Impossibile caricare la partita', 'err'); } },
  'elimina-salvataggio': el => conferma('Eliminare la partita?', 'Il salvataggio verrà cancellato definitivamente.', 'Elimina', async () => { await Archivio.elimina(el.dataset.id); menuIniziale(); }),
  'tab-voli': el => { UI.voliTab = el.dataset.t; render(); },
  'tab-mercato': el => { UI.mercatoTab = el.dataset.t; render(); },
  'ricavi-per': el => { UI.ricaviPer = +el.dataset.n; render(); },
  'dettaglio-volo': el => dettaglioVolo(G.registro[+el.dataset.i]),
  autocheck: el => { G.aerei.find(a => a.id === el.dataset.id).autoCheck = el.checked; },
  'vai-prog': el => { UI.aereoSel = el.dataset.id; bozza = null; location.hash = '#/programmazione'; },
  check: el => { SIM.pianificaCheck(G, el.dataset.id); render(); },
  vendi: el => { const ae = G.aerei.find(a => a.id === el.dataset.id); conferma(ae.modo === 'leasing' ? `Restituire ${ae.marche}?` : `Vendere ${ae.marche}?`, ae.modo === 'leasing' ? `La restituzione anticipata costa una penale di ${eur(ae.leasing * 60)}. I voli futuri dell’aereo saranno cancellati.` : `Incasserai circa ${eur(ae.valore * 0.92)}. I voli futuri dell’aereo saranno cancellati.`, 'Conferma', () => { esito(SIM.A.vendi(G, ae.id)); dopoAzione(); }); },
  riconfigura: el => {
    const ae = G.aerei.find(a => a.id === el.dataset.id);
    configuratore({ titolo: `Cabina di ${ae.marche} · ${MOD[ae.modello].nome}`, mod: ae.modello, cab: { ...ae.cab },
      info: `<p class="piccolo">Cabina attuale: ${chipCab(ae.cab)}. Rifare la cabina costa ${eur(60000)} + ${eur(1500)} per ogni posto cambiato e tiene l’aereo a terra 3 giorni (dalla fine dei voli di oggi): i voli di quei giorni saranno cancellati.${ae.stato === 'consegna' ? ' L’aereo non è ancora consegnato: il costo è dimezzato e non c’è fermo.' : ''}</p>`,
      piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-conferma-cab data-az="conferma-cabina" data-id="${ae.id}">Programma i lavori</button>` });
  },
  'conferma-cabina': el => { if (esito(SIM.A.riconfigura(G, el.dataset.id, leggiCab()))) { chiudiModale(); render(); } },
  'cab-preset': el => { const c = SIM.cabinaStandard($('#modale').dataset.mod, el.dataset.p); for (const x of CL) $('#cab' + x).value = c[x]; aggiornaConfig(); },
  'cab-riempi': () => { const mod = $('#modale').dataset.mod, c = leggiCab(); $('#cabY').value = Math.max(0, Math.floor(MOD[mod].spazio - c.J * SIM.spazioPosto(mod, 'J') - c.W * SIM.spazioPosto(mod, 'W') + 1e-9)); aggiornaConfig(); },
  compra: el => formAcquisto({ mod: el.dataset.mod }),
  'compra-usato': el => { const o = G.mercato.find(x => x.id === el.dataset.id); formAcquisto({ mod: o.mod, usato: o.id }); },
  'conferma-acquisto': el => {
    const modo = $('#acqModo').value, base = $('#acqBase').value, cab = leggiCab();
    const r = el.dataset.usato ? SIM.A.compraUsato(G, el.dataset.usato, modo, base, cab) : SIM.A.compraNuovo(G, el.dataset.mod, modo, base, cab, +($('#acqAttesa')?.value || 1), +($('#acqAnni')?.value || 8));
    if (esito(r)) { chiudiModale(); render(); }
  },
  'sel-aereo': el => { UI.aereoSel = el.dataset.id; bozza = null; if (pagina !== 'programmazione') location.hash = '#/programmazione'; else render(); },
  'p-giorno': el => { bozza.sel = +el.dataset.i; aggiornaEditor(); },
  'p-copia': el => {
    const da = bozza.sel, dove = { succ: [(da + 1) % 7], feriali: [0, 1, 2, 3, 4], weekend: [5, 6], tutti: [0, 1, 2, 3, 4, 5, 6] }[el.dataset.dove].filter(i => i !== da);
    for (const i of dove) bozza.giorni[i] = copiaGiorno(bozza.giorni[da]);
    const g = bozza.giorni[da], aperto = g.scali[0] !== g.scali.at(-1);
    toast(aperto && dove.length > 1 ? `${GS[da]} parte da ${g.scali[0]} e finisce a ${g.scali.at(-1)}: copiato su più giorni di fila la settimana non torna, sistema i giorni successivi` : `${GS[da]} copiato su ${dove.map(i => GS3[i].toLowerCase()).join(', ')}`, aperto && dove.length > 1 ? 'evento' : 'buona'); aggiornaEditor();
  },
  'p-aggiungi': () => aggiungiScalo($('#pDest').value),
  'p-rientra': el => aggiungiScalo(el.dataset.b),
  'p-togli': () => { const g = bozza.giorni[bozza.sel]; if (g.scali.length > 1) g.scali.pop(); g.attese = (g.attese || []).slice(0, g.scali.length - 1); allinea(bozza.sel); aggiornaEditor(); },
  'p-svuota': () => { const g = bozza.giorni[bozza.sel]; g.scali = g.scali.slice(0, 1); g.attese = []; allinea(bozza.sel); aggiornaEditor(); },
  'p-ripeti': () => {
    const g = bozza.giorni[bozza.sel], sc = g.scali; if (sc.at(-1) !== sc[0]) return;
    const n = sc.length - 1, att = Array.from({ length: n }, (_, i) => g.attese?.[i] || 0);
    sc.push(...sc.slice(1)); g.attese = [...att, 0, ...att.slice(1)]; aggiornaEditor();
  },
  'p-annulla': () => { bozza = null; render(); },
  'p-salva': () => {
    const pr = { turn: bozza.turn, giorni: bozza.giorni.map(copiaGiorno) }, r = bozza.altra ? SIM.A.salvaStagione(G, bozza.aeId, pr) : SIM.salvaProgramma(G, bozza.aeId, pr);
    if (r.E.length) return toast(r.E[0], 'err');
    toast(`Programma salvato: ${r.voliSett} voli a settimana in vendita${SIM.copertura(G).scoperte ? ' · alcuni turni non hanno ancora un equipaggio' : ''}`, 'buona'); suono('click'); bozza = null; dopoAzione();
  },
  'apri-rotta': () => formApriRotta(),
  'conferma-rotta': () => { const a = $('#rDa').value, b = $('#rA').value; if (!b) return toast('Scegli la destinazione', 'err'); if (esito(SIM.A.apriRotta(G, a, b))) { chiudiModale(); dopoAzione(); } },
  'chiudi-rotta': el => conferma('Chiudere la rotta?', 'La rotta verrà chiusa. Per riaprirla dovrai pagare di nuovo la campagna di lancio.', 'Chiudi rotta', () => { esito(SIM.A.chiudiRotta(G, el.dataset.k)); dopoAzione(); }),
  analisi: el => analisiPrezzi(el.dataset.k),
  'analisi-cl': el => { UI.classeAnalisi = el.dataset.c; analisiPrezzi(el.dataset.k, el.dataset.c); },
  'applica-prezzo': el => { esito(SIM.A.prezzi(G, el.dataset.k, { ['p' + el.dataset.c]: +el.dataset.p })); chiudiModale(); render(); },
  'assumi-eq': el => { if (esito(SIM.A.assumiEquipaggio(G, { base: el.dataset.b, tipo: el.dataset.t, piloti: +el.dataset.p, cabina: +el.dataset.c, urgente: !!el.dataset.urg }))) render(); },
  'assumi-mancanti': el => { const urg = !!el.dataset.urg, st = SIM.A.stimaMancanti(G, urg); conferma(`Assumere ${st.n} equipaggi?`, `Costo ${eur(st.costo)}. Saranno operativi tra ${urg ? '2 giorni (agenzia, costo ×2,5)' : '10 giorni'}; fino ad allora i turni scoperti restano senza equipaggio.`, 'Assumi', () => { esito(SIM.A.assumiMancanti(G, urg)); render(); }); },
  'nuovo-equipaggio': () => formNuovoEquipaggio(),
  'conferma-ne': el => { if (esito(SIM.A.assumiEquipaggio(G, { base: $('#neBase').value, tipo: $('#neTipo').value, piloti: +$('#nePiloti').value, cabina: +$('#neCabina').value, urgente: !!el.dataset.urg, contratto: el.dataset.urg ? 'agenzia' : ($('#neContratto')?.value || 'fisso') }))) { chiudiModale(); render(); } },
  'eq-licenzia': el => { const e = G.equipaggi.find(x => x.id === el.dataset.id); conferma(`Licenziare l’equipaggio ${e.nome}?`, `Buonuscita di ${eur(SIM.pagaEquipaggio(e) * 60)} e morale in calo. I suoi turni passeranno ad altri equipaggi, se ce ne sono di liberi.`, 'Licenzia', () => { esito(SIM.A.licenziaEquipaggio(G, e.id)); render(); }); },
  'eq-trasferisci': el => { const e = G.equipaggi.find(x => x.id === el.dataset.id); modale({ titolo: `Trasferire ${e.nome}`, corpo: `<div class="form"><label>Nuova base<select id="trBase">${opzioni(G.basi.filter(b => b !== e.base).map(b => [b, `${b} · ${citta(b)}`]), '')}</select></label></div><p class="nota">${eur(3000 * SIM.persone(e))}, operativo nella nuova base dopo 5 giorni.</p>`, piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma-trasf-eq" data-id="${e.id}">Trasferisci</button>` }); },
  'conferma-trasf-eq': el => { if (esito(SIM.A.trasferisciEquipaggio(G, el.dataset.id, $('#trBase').value))) { chiudiModale(); render(); } },
  'eq-riqualifica': el => { const e = G.equipaggi.find(x => x.id === el.dataset.id); modale({ titolo: `Riqualificare ${e.nome}`, corpo: `<div class="form"><label>Nuova abilitazione<select id="rqTipo">${opzioni(TIPI().filter(t => t !== e.tipo).map(t => [t, t]), '')}</select></label></div><p class="nota">${eur(35000 * e.piloti)}, 30 giorni di corso durante i quali l’equipaggio non vola.</p>`, piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma-riq-eq" data-id="${e.id}">Avvia corso</button>` }); },
  'conferma-riq-eq': el => { if (esito(SIM.A.riqualificaEquipaggio(G, el.dataset.id, $('#rqTipo').value))) { chiudiModale(); render(); } },
  'p-cambio': el => { const g = bozza.giorni[bozza.sel], i = +el.dataset.i; g.cambi = Array.from({ length: g.scali.length - 1 }, (_, q) => !!g.cambi?.[q]); g.cambi[i] = !g.cambi[i]; aggiornaEditor(); },
  'p-sistema': () => { const ae = G.aerei.find(a => a.id === bozza.aeId), p = SIM.sistemaTurni(G, ae, { turn: bozza.turn, giorni: bozza.giorni }); bozza.giorni = p.giorni; toast('Cambi equipaggio inseriti dove servivano', 'buona'); aggiornaEditor(); },
  premio: () => { esito(SIM.A.premio(G)); render(); },
  'nuova-campagna': el => { if (!Object.keys(G.rotte).length) return toast('Apri prima almeno una rotta', 'err'); formCampagna(el.dataset.c); },
  'conferma-campagna': () => { if (esito(SIM.A.avviaCampagna(G, leggiCampagna()))) { chiudiModale(); render(); } },
  'ferma-campagna': el => conferma('Fermare la campagna?', 'Smetti di pagarla da domani; l’effetto svanirà gradualmente.', 'Ferma', () => { esito(SIM.A.fermaCampagna(G, el.dataset.id)); render(); }),
  slot: el => { esito(SIM.A.compraSlot(G, el.dataset.i, +el.dataset.n)); render(); },
  'apri-base': el => conferma(`Aprire una base a ${citta(el.dataset.i)}?`, `Costo iniziale ${eur(AP[el.dataset.i].slot ? 500000 : 300000)}${AP[el.dataset.i].slot ? ' (include 4 slot)' : ''}, poi ${eur(AP[el.dataset.i].slot ? 2500 : 1200)} al giorno. Gli aerei potranno pernottarci e potrai assumerci equipaggi.`, 'Apri base', () => { esito(SIM.A.apriBase(G, el.dataset.i)); dopoAzione(); }),
  'chiudi-base': el => conferma(`Chiudere la base di ${citta(el.dataset.i)}?`, 'Possibile solo se nessun aereo vi pernotta, nessun turno parte da lì e non c’è più personale.', 'Chiudi base', () => { esito(SIM.A.chiudiBase(G, el.dataset.i)); dopoAzione(); }),
  'apri-hub': el => conferma(`Fare di ${citta(el.dataset.i)} un hub?`, `Costo ${eur(D.HUB.costo)} una tantum e ${eur(D.HUB.giornaliero)} al giorno. Da subito i tuoi voli che arrivano e ripartono da ${el.dataset.i} con un’attesa tra ${D.HUB.mct} e ${D.HUB.attesaMax} minuti venderanno anche viaggi in coincidenza.`, 'Attiva hub', () => { esito(SIM.A.apriHub(G, el.dataset.i)); dopoAzione(); }),
  'chiudi-hub': el => conferma('Chiudere l’hub?', 'Non verranno più venduti viaggi in coincidenza in questo aeroporto (i biglietti già venduti restano validi). La base resta aperta.', 'Chiudi hub', () => { esito(SIM.A.chiudiHub(G, el.dataset.i)); dopoAzione(); }),
  prestito: () => { esito(SIM.A.prestito(G, +$('#importoPrestito').value)); render(); },
  rimborsa: el => { esito(SIM.A.rimborsa(G, el.dataset.id, +$('#rimb-' + el.dataset.id).value)); render(); }
};
