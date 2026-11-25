// AvioGest — motore di simulazione (versione 2). Funzioni pure sullo stato di partita G, serializzabile in JSON.
// Novità v2: cabine a tre classi, cicli di rotazione su più giorni con pernottamento nelle basi,
// turni degli equipaggi legati alle basi (max 13 h, cambio solo in base), hub con passeggeri in coincidenza.
const SIM = (() => {
  const D = typeof DATI !== 'undefined' ? DATI : require('./data.js');
  const AP = D.AEROPORTI, MOD = D.MODELLI, CLS = D.CLASSI;
  const CL = ['J', 'W', 'Y'];
  const MIN = 6e4, ORA = 36e5, GIORNO = 864e5, VERSIONE = 5;
  const GIORNI_SETT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const FDP = 13 * 60, PERSONE_PER_TURNO = 2.4;
  const rnd = Math.random;
  const pad = n => String(n).padStart(2, '0');
  // Orologio di gioco: ora della base principale (fuso G.fuso, senza ora legale). Gli orari locali degli aeroporti usano il loro fuso.
  let FUSO = 1;
  const impostaFuso = G => { FUSO = G.fuso ?? AP[G.basi?.[0]]?.fuso ?? 1; };
  const loc = (t, f = FUSO) => new Date(t + f * ORA); // leggere con i getter UTC
  const dataDi = t => { const d = loc(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const mezzanotte = t => Math.floor((t + FUSO * ORA) / GIORNO) * GIORNO - FUSO * ORA;
  const tsDi = (giorno, minuti) => giorno + minuti * MIN;
  const giornoDopo = (giorno, n = 1) => giorno + n * GIORNO;
  const oraIn = (t, f = FUSO) => { const d = loc(t, f); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  // minuto del giorno, nell'ora locale di un aeroporto, di un orario espresso in minuti dell'ora della base
  const oraLocaleMin = (minBase, iata) => (((minBase + (AP[iata].fuso - FUSO) * 60) % 1440) + 1440) % 1440;
  const oraLocaleT = (t, iata) => oraIn(t, AP[iata].fuso);
  const giornoSett = t => (loc(t).getUTCDay() + 6) % 7;
  const giorniTra = (a, b) => Math.round((mezzanotte(b) - mezzanotte(a)) / GIORNO);
  const chiave = (a, b) => a < b ? a + '-' + b : b + '-' + a;
  const chiaveCitta = (a, b) => { const x = AP[a].citta, y = AP[b].citta; return x < y ? x + '|' + y : y + '|' + x; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const minDaOra = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const oraDaMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60))}`;
  const zero = () => ({ J: 0, W: 0, Y: 0 });
  const somma = o => (o.J || 0) + (o.W || 0) + (o.Y || 0);
  const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const distCache = {};
  function km(a, b) {
    const k = chiave(a, b); if (distCache[k]) return distCache[k];
    const A = AP[a], B = AP[b], R = 6371, rad = x => x * Math.PI / 180;
    const s = Math.sin(rad(B.lat - A.lat) / 2) ** 2 + Math.cos(rad(A.lat)) * Math.cos(rad(B.lat)) * Math.sin(rad(B.lon - A.lon) / 2) ** 2;
    return distCache[k] = Math.round(2 * R * Math.asin(Math.sqrt(s)));
  }
  const durata = (k, mod) => Math.round((20 + k / MOD[mod].vel * 60) / 5) * 5;
  const prezzoRif = k => Math.round(k <= 2000 ? 25 + 0.085 * k : 195 + 0.035 * (k - 2000));
  const lungoRaggio = k => k > 4000;
  // moltiplicatore della tariffa per classe: sul lungo raggio la Business (con letto) costa molto di più
  const multClasse = (c, k = 0) => c === 'Y' ? 1 : lungoRaggio(k) ? (c === 'J' ? 3.4 : 1.6) : CLS[c].mult;
  const repF = r => 0.4 + r / 80;
  function altriMezzi(a, b, k) {
    if (AP[a].isola || AP[b].isola) return 0.15;
    if (k < 350) return 1.6; if (k < 700) return 0.9; if (k < 1200) return 0.35; if (k < 3000) return 0.2;
    return 1.2; // sul lungo raggio: le altre compagnie che non simuliamo una per una
  }
  function pesoOra(min) {
    const h = min / 60;
    if (h < 6.5) return 0.6; if (h < 9.5) return 1.3; if (h < 12) return 1.0; if (h < 16) return 0.8; if (h < 20.5) return 1.25; if (h < 22.5) return 0.85; return 0.6;
  }

  /* ---------- Cabine ---------- */
  const posti = ae => somma(ae.cab);
  const cabMin = ae => Math.max(1, Math.ceil(posti(ae) / 50));
  // spazio occupato da un posto: sui widebody la Business ha il letto e la Premium è più larga
  const spazioPosto = (mod, c) => MOD[mod]?.lungo ? { J: 3.6, W: 1.5, Y: 1 }[c] : CLS[c].spazio;
  const spazioUsato = (cab, mod) => CL.reduce((x, c) => x + (cab[c] || 0) * spazioPosto(mod, c), 0);
  function cabinaStandard(mod, stile = 'mista') {
    const s = MOD[mod].spazio, turbo = MOD[mod].tipo === 'ATR';
    if (stile === 'economy' || (turbo && stile === 'mista')) return { J: 0, W: 0, Y: s };
    const resto = (J, W) => ({ J, W, Y: Math.floor(s - J * spazioPosto(mod, 'J') - W * spazioPosto(mod, 'W') + 1e-9) });
    if (MOD[mod].lungo) return stile === 'mista' ? resto(Math.round(s / 12.5), 0) : resto(Math.round(s / 13.5), Math.round(s / 16));
    if (stile === 'mista') return resto(s >= 170 ? 12 : 8, 0);
    return resto(turbo ? 0 : s >= 170 ? 16 : 12, turbo ? 12 : s >= 170 ? 24 : 18);
  }
  function validaCabina(mod, cab) {
    for (const c of CL) if (!Number.isInteger(cab[c]) || cab[c] < 0) return 'I posti devono essere numeri interi non negativi';
    if (somma(cab) < 1) return 'Serve almeno un posto';
    if (spazioUsato(cab, mod) > MOD[mod].spazio + 1e-6) return `Spazio insufficiente: ${spazioUsato(cab, mod).toFixed(1)} su ${MOD[mod].spazio} unità`;
    return null;
  }
  // Ripartizione della domanda tra le classi: più business tra grandi città, più premium verso mete turistiche ed estere
  function quoteClassi(da, a) {
    const A = AP[da], B = AP[a], tur = (A.tur + B.tur) / 2, grande = Math.min(1, Math.min(A.pop, B.pop) / 3000), estero = A.paese !== B.paese ? 1 : 0;
    const lr = lungoRaggio(km(da, a)) ? 1 : 0;
    const J = 0.03 + 0.07 * grande * (1 - tur * 0.6) + 0.02 * estero + 0.03 * lr, W = 0.07 + 0.05 * tur + 0.03 * estero + 0.04 * lr;
    return { J, W, Y: 1 - J - W };
  }
  const prezziRotta = (G, da, a) => { const r = G.rotte[chiave(da, a)]; if (r) return r; const k = km(da, a), ref = prezzoRif(k); return { pY: ref, pW: Math.round(ref * multClasse('W', k)), pJ: Math.round(ref * multClasse('J', k)) }; };

  /* ---------- Notizie, flotta ---------- */
  function nuovoGiorno() { return { voli: 0, canc: 0, pax: 0, posti: 0, puntuali: 0, ricavi: 0, paxC: zero(), ricaviC: zero(), transito: 0, ricaviTransito: 0, costi: { carburante: 0, tasse: 0, handling: 0, navigazione: 0, manutenzione: 0, servizio: 0, rimborsi: 0, equipaggi: 0, soste: 0, marketing: 0, leasing: 0, personale: 0, basi: 0, hub: 0, sede: 0, interessi: 0, assicurazione: 0, altro: 0 }, rotte: {}, aerei: {}, hub: {} }; }
  function notizia(G, testo, tipo = 'info', imp = false) {
    const n = { t: G.ora, testo, tipo, imp };
    G.notizie.unshift(n); if (G.notizie.length > 150) G.notizie.length = 150;
    (G._nuove ||= []).push(n);
  }
  function nuovaMarche(G) {
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', n = G.seqMarche++;
    return `I-${(G.codice[0] || 'A').toUpperCase()}${L[Math.floor(n / 26) % 26]}${L[n % 26]}`;
  }
  function aggiungiAereo(G, modello, modo, base, opz = {}) {
    const m = MOD[modello];
    const ae = {
      id: 'a' + (G.seq++), marche: nuovaMarche(G), modello, modo, eta: opz.eta || 0, cab: opz.cab || cabinaStandard(modello),
      leasing: modo === 'leasing' ? (opz.leasing || m.leasing) : 0, valore: modo === 'proprieta' ? (opz.prezzo || m.prezzo) : 0,
      ore: opz.ore || 0, cicli: Math.round((opz.ore || 0) * 0.8), oreDaCheck: opz.oreDaCheck ?? Math.round(rnd() * 150),
      stato: opz.consegna ? 'consegna' : 'attivo', fino: opz.consegna || 0, base, pos: base,
      prog: settimanaVuota(base, MOD[modello].lungo ? 90 : MOD[modello].tipo === 'ATR' ? 30 : 40), lavori: null, autoCheck: true
    };
    G.aerei.push(ae); return ae;
  }
  const flottaAttiva = G => G.aerei.filter(a => a.stato !== 'venduto');
  const settimanaVuota = (base, turn = 40) => ({ turn, giorni: GIORNI_SETT.map(() => ({ inizio: '06:30', scali: [base], attese: [] })) });
  // accetta anche un solo giorno (lo ripete per tutta la settimana)
  function normalizza(prog) {
    const giorni = prog.giorni.length === 1 ? GIORNI_SETT.map(() => prog.giorni[0]) : prog.giorni;
    return { turn: prog.turn, giorni: giorni.map(g => ({ inizio: g.inizio, scali: g.scali.slice(), attese: (g.attese || []).slice(0, Math.max(0, g.scali.length - 1)), cambi: (g.cambi || []).slice(0, Math.max(0, g.scali.length - 1)) })) };
  }


  /* ---------- Rotazioni su più giorni (i voli possono passare la mezzanotte) ---------- */
  const LUNGO = 360, RIPOSO = 600, SOSTA = 360, FDP_LUNGO = 17 * 60;
  function legsGiorno(ae, g, turn) {
    const legs = []; let t = minDaOra(g.inizio);
    for (let i = 0; i < g.scali.length - 1; i++) {
      if (i > 0) t += Math.max(0, g.attese?.[i] || 0);
      const da = g.scali[i], a = g.scali[i + 1], dur = durata(km(da, a), ae.modello);
      legs.push({ da, a, dep: t, arr: t + dur, dur }); t += dur + turn;
    }
    return legs;
  }
  // Turni di servizio su tutto il ciclo.
  // Limiti: 13 h con 2 piloti, 15 h con un terzo pilota (rinforzo), 17 h se nel turno c'è un volo di lungo raggio (3 piloti).
  // Un nuovo equipaggio sale in una base, oppure dove il giocatore mette "cambio equipaggio" (arriva da passeggero dalla sua base),
  // oppure dopo un volo di lungo raggio. Dopo un riposo lungo fuori base lo stesso equipaggio riparte (notte in albergo).
  const FDP_RINFORZO = 15 * 60;
  function pianoCiclo(G, ae, prog = ae.prog) {
    if (prog !== ae.prog && prog.giorni.length === 1) prog = normalizza(prog);
    const memo = JSON.stringify(prog) + '|' + G.basi.join(',');
    if (prog === ae.prog && ae._piano && ae._piano.k === memo) return ae._piano.p;
    const n = prog.giorni.length, legs = [], E = [], W = [], turni = [], mappa = {}, sforati = [], flag = {};
    prog.giorni.forEach((g, i) => legsGiorno(ae, g, prog.turn).forEach((l, k) => legs.push({ ...l, giorno: i, k, abs: i * 1440 + l.dep, absArr: i * 1440 + l.arr, cambio: k > 0 && !!g.cambi?.[k] })));
    const L = legs.length, ciclo = n * 1440;
    const gap = j => j === 0 ? legs[0].abs + ciclo - legs[L - 1].absArr : legs[j].abs - legs[j - 1].absArr;
    let sostaBase = 0;
    if (L) {
      let start = 0; for (let j = 1; j < L; j++) if (gap(j) > gap(start)) start = j;
      let cur = null;
      const chiudi = () => { if (cur && cur.legs.length) { cur.idx = turni.length; cur.termina = cur.legs.at(-1).a; cur.blocco = cur.legs.reduce((x, l) => x + l.dur, 0); cur.piloti = (cur.lungo || cur.rinforzo) ? 3 : 2; turni.push(cur); } cur = null; };
      const nuovo = (dep, extra = {}) => ({ inizio: dep - 60, legs: [], lungo: false, rinforzo: false, ...extra });
      // voli nell'ordine del turno, con orari continui (senza salti di settimana)
      const ord = Array.from({ length: L }, (_, q) => { const j = (start + q) % L, off = j < start ? ciclo : 0; return { j, arr: legs[j].absArr + off }; });
      // arrivo del volo con cui l'aereo rientra in una base (o prima di un riposo lungo), partendo dal volo q
      const rientro = q => { for (let r = q; r < L; r++) { const l = legs[ord[r].j]; if (G.basi.includes(l.a) || (r + 1 < L && gap(ord[r + 1].j) >= RIPOSO)) return ord[r].arr; } return ord[L - 1].arr; };
      for (let q = 0; q < L; q++) {
        const j = (start + q) % L, l = legs[j], off = j < start ? ciclo : 0, dep = l.abs + off, arr = l.absArr + off, g = gap(j), lungo = l.dur >= LUNGO;
        if (cur) {
          const prec = legs[(j - 1 + L) % L], limite = (cur.lungo || lungo) ? FDP_LUNGO : FDP_RINFORZO, sfora = arr + 30 - cur.inizio > limite;
          // in una base si cambia equipaggio se, continuando, il prossimo rientro in base cadrebbe oltre le 13 ore:
          // il terzo pilota serve solo quando lungo il percorso una base non c'è
          const cambioInBase = !cur.lungo && !lungo && G.basi.includes(l.da) && rientro(q) + 30 - cur.inizio > FDP;
          if (l.cambio || g >= RIPOSO || sfora || cambioInBase) {
            const b = cur.base;
            if (G.basi.includes(l.da)) { chiudi(); cur = nuovo(dep, { base: l.da }); }
            else if (g >= RIPOSO && !l.cambio) { chiudi(); cur = nuovo(dep, { base: b, continua: true, albergo: true }); }
            else if (l.cambio || prec.dur >= LUNGO) { chiudi(); cur = nuovo(dep, { base: b, posizionato: true, albergo: true }); }
            else { E.push(`il turno partito da ${cur.legs[0].da} supera le ${limite / 60} ore prima di ${l.da}–${l.a}: metti un cambio equipaggio su un volo (anche fuori base) o usa “Sistema i turni”`); sforati.push({ giorno: l.giorno, k: l.k }); }
          }
        }
        if (!cur) { cur = nuovo(dep, { base: G.basi.includes(l.da) ? l.da : null }); if (!cur.base) E.push(`un turno parte da ${l.da}, dove non hai equipaggi: deve iniziare in una base`); }
        cur.legs.push(l); cur.lungo ||= lungo; cur.fine = arr + 30;
        if (!cur.lungo && cur.fine - cur.inizio > FDP) cur.rinforzo = true;
        mappa[`${l.giorno}-${l.k}`] = cur;
      }
      chiudi();
      for (let j = 0; j < L; j++) {
        const g = gap(j), dove = legs[j].da;
        if (G.basi.includes(dove)) sostaBase = Math.max(sostaBase, g);
        else if (g >= SOSTA) { const p = legs[(j - 1 + L) % L]; flag[`${p.giorno}-${p.k}`] = { sostaFuori: true }; W.push(`l’aereo resta fermo ${Math.floor(g / 60)} ore a ${dove}, fuori base: si pagano parcheggio e albergo dell’equipaggio`); }
      }
      const rinf = turni.filter(t => t.rinforzo && !t.lungo).length;
      if (rinf) W.push(`${rinf} turni superano le 13 ore: volano con un terzo pilota (equipaggio rinforzato)`);
    }
    let sostaMax = 0; for (let j = 0; j < L; j++) sostaMax = Math.max(sostaMax, gap(j));
    const p = { legs, turni, mappa, flag, sforati, E: [...new Set(E)], W: [...new Set(W)], sostaMax: L ? sostaMax : 1440, sostaBase: L ? sostaBase : 1440 };
    if (prog === ae.prog) ae._piano = { k: memo, p };
    return p;
  }
  // Inserisce i cambi equipaggio dove un turno sfora, finché il piano è valido
  function sistemaTurni(G, ae, prog) {
    prog = normalizza(prog);
    for (let it = 0; it < 30; it++) {
      const p = pianoCiclo(G, ae, prog); if (!p.sforati.length) break;
      // dove possibile il cambio si fa in una base, qualche volo prima: nessun equipaggio da far arrivare da passeggero
      let { giorno, k } = p.sforati[0];
      const turno = p.mappa[`${giorno}-${k}`];
      if (turno) for (let q = turno.legs.length - 1; q > 0; q--) { const l = turno.legs[q]; if (l.giorno === giorno && l.k <= k && G.basi.includes(l.da)) { k = l.k; break; } }
      const g = prog.giorni[giorno];
      g.cambi = Array.from({ length: g.scali.length - 1 }, (_, i) => !!g.cambi?.[i]); g.cambi[k] = true;
    }
    return prog;
  }
  const indiceCiclo = (prog, giorno) => { const n = prog.giorni.length; if (prog.ancora == null && n === 7) return giornoSett(giorno); return ((Math.round((giorno - (prog.ancora ?? 0)) / GIORNO) % n) + n) % n; };
  const giornoDelCiclo = (ae, giorno) => ae.prog.giorni[indiceCiclo(ae.prog, giorno)];
  const tratteDi = (ae, giorno) => legsGiorno(ae, giornoDelCiclo(ae, giorno), ae.prog.turn);
  // Media giornaliera sul ciclo (per fabbisogni e statistiche)
  function mediaCiclo(ae, prog = ae.prog) {
    const n = prog.giorni.length, out = { ore: 0, tratte: [] };
    prog.giorni.forEach(g => {
      const legs = legsGiorno(ae, g, prog.turn);
      out.ore += legs.reduce((x, l) => x + l.dur, 0) / 60 / n;
      legs.forEach(l => out.tratte.push({ ...l, peso: 1 / n }));
    });
    return out;
  }
  function partenzePerScalo(G, sostituisci) {
    const out = {};
    for (const ae of flottaAttiva(G)) {
      const prog = sostituisci && sostituisci.id === ae.id ? normalizza(sostituisci.prog) : ae.prog, max = {};
      for (const g of prog.giorni) { const c = {}; for (const l of legsGiorno(ae, g, prog.turn)) c[l.da] = (c[l.da] || 0) + 1; for (const i in c) max[i] = Math.max(max[i] || 0, c[i]); }
      for (const i in max) out[i] = (out[i] || 0) + max[i];
    }
    return out;
  }
  const fineTxt = m => oraDaMin(m) + (m >= 1440 ? ' del giorno dopo' : '');
  function validaProgramma(G, ae, prog) {
    prog = normalizza(prog);
    const E = [], W = [], m = MOD[ae.modello], n = prog.giorni.length;
    if (n !== 7) E.push('La programmazione è settimanale: servono 7 giorni');
    if (m.lungo && prog.turn < 75) E.push('Un aereo di lungo raggio ha bisogno di almeno 75 minuti di turnaround');
    else if (prog.turn < 35) W.push('Turnaround sotto i 35 minuti: i ritardi saranno più frequenti e si propagheranno');
    prog.giorni.forEach((g, i) => {
      const legs = legsGiorno(ae, g, prog.turn), prec = prog.giorni[(i - 1 + n) % n];
      const tag = `${GIORNI_SETT[i]}: `;
      if ((g.attese || []).some(x => !(x >= 0 && x <= 720))) E.push(`${tag}le attese a terra devono essere tra 0 e 12 ore`);
      if (g.scali[0] !== prec.scali.at(-1)) E.push(`${tag}deve partire da ${prec.scali.at(-1)}, dove si trova l’aereo`);
      for (const l of legs) {
        if (!G.rotte[chiave(l.da, l.a)]) E.push(`${tag}la rotta ${l.da}–${l.a} non è aperta`);
        if (km(l.da, l.a) > m.autonomia) E.push(`${tag}${l.da}–${l.a} supera l’autonomia (${m.autonomia} km)`);
        const ol = oraLocaleMin(l.dep, l.da);
        if (ol >= 30 && ol < 330) E.push(`${tag}${l.da}–${l.a} decollerebbe alle ${oraDaMin(ol)} ora locale di ${l.da}: tra le 00:30 e le 05:30 non si decolla`);
      }
      if (legs.length) {
        if (legs.at(-1).arr > 2160) E.push(`${tag}la giornata finisce troppo tardi (${fineTxt(legs.at(-1).arr)})`);
        const succ = prog.giorni[(i + 1) % n], ls = legsGiorno(ae, succ, prog.turn);
        if (ls.length && 1440 + ls[0].dep < legs.at(-1).arr + prog.turn)
          E.push(`${tag}l’ultimo volo arriva alle ${fineTxt(legs.at(-1).arr)}: ${GIORNI_SETT[(i + 1) % n].toLowerCase()} non può iniziare alle ${succ.inizio}`);
      }
    });
    const piano = pianoCiclo(G, ae, prog);
    piano.E.forEach(e => E.push(e));
    piano.W.forEach(w => W.push(w));
    if (!piano.legs.length && !G.basi.includes(prog.giorni[0].scali[0])) E.push(`L’aereo è fermo a ${prog.giorni[0].scali[0]}, che non è una base`);
    if (piano.legs.length && piano.sostaBase < 8 * 60) W.push(`L’aereo non sosta mai 8 ore in una base: le ispezioni lo fermeranno cancellando qualche volo`);
    const fuori = piano.turni.filter(t => t.termina !== t.base);
    if (fuori.length) W.push(`${fuori.length} turni finiscono lontano dalla base dell’equipaggio: rientro o albergo a pagamento (circa 150 € a persona)`);
    const pos = piano.turni.filter(t => t.posizionato).length;
    if (pos) W.push(`${pos} turni iniziano fuori base: l’equipaggio arriva da passeggero (circa 250 € a persona)`);
    const dep = partenzePerScalo(G, { id: ae.id, prog });
    for (const [i, c] of Object.entries(dep)) if (AP[i].slot && c > (G.slot[i] || 0)) E.push(`${i} è un aeroporto a slot: servono ${c} slot giornalieri, ne hai ${G.slot[i] || 0}`);
    const giorni = prog.giorni.map((g, i) => ({ legs: legsGiorno(ae, g, prog.turn), turni: piano.turni.filter(t => t.legs[0].giorno === i) }));
    return { E: [...new Set(E)], W, giorni, piano, voliSett: piano.legs.length, oreSett: piano.legs.reduce((x, l) => x + l.dur, 0) / 60 };
  }
  function salvaProgramma(G, aeId, prog) {
    const ae = G.aerei.find(a => a.id === aeId), v = validaProgramma(G, ae, prog);
    if (v.E.length) return v;
    ae.prog = normalizza(prog);
    ae.base = prog.giorni[0].scali[0]; delete ae._piano;
    for (const k in (G.fissi || {})) if (k.startsWith(ae.id + '#')) delete G.fissi[k];
    G._roster = null; rigeneraAereo(G, ae);
    return v;
  }

  /* ---------- Voli ---------- */
  const numeroVolo = (G, da, a, dep) => G.numeri[`${da}${a}${dep}`] ||= G.codice + (G.seqVolo++);
  function generaGiorno(G, giorno) {
    for (const ae of G.aerei) generaVoliAereo(G, ae, giorno);
    G.voli.sort((a, b) => a.dep - b.dep);
    G.genFino = Math.max(G.genFino, giorno);
  }
  function generaVoliAereo(G, ae, giorno, vecchi) {
    if (ae.stato === 'venduto') return;
    const i = indiceCiclo(ae.prog, giorno), piano = pianoCiclo(G, ae);
    legsGiorno(ae, ae.prog.giorni[i], ae.prog.turn).forEach((l, k) => {
      const dep = tsDi(giorno, l.dep); if (dep <= G.ora) return;
      const t = piano.mappa[`${i}-${k}`] || { base: null, legs: [] }, ultimo = t.legs.at(-1), fine = ultimo && ultimo.giorno === i && ultimo.k === k, primo = t.legs[0] && t.legs[0].giorno === i && t.legs[0].k === k;
      const v = { id: G.seq++, ae: ae.id, num: numeroVolo(G, l.da, l.a, l.dep % 1440), da: l.da, a: l.a, dep, arr: tsDi(giorno, l.arr), v: zero(), t: zero(), inc: zero(), incT: 0, att: zero(), conn: {}, stato: 'prog', rit: 0, base: t.base, turno: `${ae.id}#${t.idx}`, piloti: t.piloti || 2, fineTurno: !!fine && t.termina !== t.base, posizionato: !!primo && !!t.posizionato, sostaFuori: !!piano.flag[`${i}-${k}`]?.sostaFuori };
      const old = vecchi && vecchi.get(`${l.da}${l.a}${dep}`);
      if (old) Object.assign(v, { v: old.v, t: old.t, inc: old.inc, incT: old.incT, conn: old.conn });
      G.voli.push(v);
    });
  }
  function rigeneraAereo(G, ae) {
    const vecchi = new Map();
    G.voli = G.voli.filter(v => { if (v.ae === ae.id && v.stato === 'prog' && v.dep > G.ora) { vecchi.set(`${v.da}${v.a}${v.dep}`, v); return false; } return true; });
    // anche ieri: i voli di ieri sera possono partire dopo mezzanotte
    for (let g = giornoDopo(mezzanotte(G.ora), -1); g <= G.genFino; g = giornoDopo(g)) generaVoliAereo(G, ae, g, vecchi);
    G.voli.sort((a, b) => a.dep - b.dep);
    vendite(G);
  }
  const venduti = v => somma(v.v) + somma(v.t);

  /* ---------- Equipaggi con nome e assegnazione settimanale dei turni ---------- */
  const COGNOMI = ['Rossi', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa', 'Giordano', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Vitale', 'Serra', 'Coppola', 'De Santis', 'Fabbri', 'Bellini', 'Ferri', 'Villa', 'Parisi', 'Cattaneo', 'Smith', 'Müller', 'García', 'Dubois', 'Novak', 'Kowalski', 'Silva', 'Jensen', 'Papadopoulos', 'Hansen', 'Okafor', 'Tanaka', 'Haddad'];
  const SETT = 7 * 1440, RIPOSO_MIN = 12 * 60, MAX_TURNI = 4, MAX_ORE = 28;
  const pagaEquipaggio = e => D.RUOLI.CMD.paga + D.RUOLI.FO.paga * (e.piloti - 1) + D.RUOLI.CC.paga + D.RUOLI.ADV.paga * (e.cabina - 1);
  const persone = e => e.piloti + e.cabina;
  const costoAssunzione = (e, urgente) => Math.round((12000 * e.piloti + 1500 * e.cabina) * (urgente ? 2.5 : 1));
  function nuovoEquipaggio(G, { base, tipo, piloti = 2, cabina = 4, stato = 'attivo', pronto = 0, motivo = '' }) {
    G.seqEq ||= {}; const n = G.seqEq[base] = (G.seqEq[base] || 0) + 1;
    const e = { id: 'e' + (G.seq++), nome: `${base}-${n}`, base, tipo, piloti, cabina, capo: COGNOMI[Math.floor(rnd() * COGNOMI.length)], stato, pronto, motivo };
    G.equipaggi.push(e); G._roster = null; return e;
  }
  // Turni della settimana raggruppati in catene: un turno che continua dopo una notte fuori base resta allo stesso equipaggio
  function catene(G, sost) {
    const out = [];
    for (const ae of flottaAttiva(G)) {
      const prog = sost && sost.id === ae.id ? sost.prog : ae.prog;
      if (ae.stato === 'consegna' && !(sost && sost.id === ae.id)) continue;
      const p = pianoCiclo(G, ae, prog), tipo = MOD[ae.modello].tipo, cab = cabMin(ae);
      let cur = null;
      for (const t of p.turni) {
        const k = `${ae.id}#${t.idx}`;
        if (t.continua && cur) { cur.chiavi.push(k); cur.fine = t.fine; cur.blocco += t.blocco; cur.piloti = Math.max(cur.piloti, t.piloti); cur.a = t.termina; cur.voli += t.legs.length; cur.percorso.push(...t.legs.map(l => l.a)); continue; }
        cur = { chiave: k, chiavi: [k], ae: ae.id, marche: ae.marche, tipo, base: t.base, piloti: t.piloti, cabina: cab, inizio: t.inizio, fine: t.fine, blocco: t.blocco, da: t.legs[0].da, a: t.termina, percorso: [t.legs[0].da, ...t.legs.map(l => l.a)], voli: t.legs.length, giorno: t.legs[0].giorno, posizionato: !!t.posizionato };
        out.push(cur);
      }
    }
    return out;
  }
  function compatibile(int, a, b) {
    for (const [x, y] of int) { const d1 = ((a - y) % SETT + SETT) % SETT, d2 = ((x - b) % SETT + SETT) % SETT; if (d1 < RIPOSO_MIN || d2 < RIPOSO_MIN) return false; }
    return true;
  }
  const adatto = (e, c) => e.base === c.base && e.tipo === c.tipo && e.piloti >= c.piloti && e.cabina >= c.cabina;
  // Assegna gli equipaggi alle catene di turni: stessa base e abilitazione, riposo minimo 12 h, al massimo 4 turni e 28 ore di volo a settimana
  function roster(G, opz = {}) {
    const semplice = !opz.sost && !opz.extra && !opz.futuri;
    if (semplice && G._roster) return G._roster;
    const ch = catene(G, opz.sost).sort((x, y) => (x.inizio % SETT) - (y.inizio % SETT));
    const crews = G.equipaggi.filter(e => e.stato === 'attivo' || (opz.futuri && e.stato === 'formazione')).concat(opz.extra || []);
    const carico = new Map(crews.map(e => [e.id, { int: [], turni: 0, min: 0, catene: [] }]));
    const libero = (e, c) => { const x = carico.get(e.id); return x.turni < MAX_TURNI && x.min + c.blocco <= MAX_ORE * 60 && compatibile(x.int, c.inizio, c.fine); };
    const assegna = {}, scoperte = [];
    // prima i turni bloccati a mano, poi gli altri in ordine di orario
    const fissi = G.fissi || {}, ordine = [...ch.filter(c => fissi[c.chiave]), ...ch.filter(c => !fissi[c.chiave])];
    for (const c of ordine) {
      let scelto = null; const f = fissi[c.chiave] && crews.find(e => e.id === fissi[c.chiave]);
      if (f && adatto(f, c) && libero(f, c)) scelto = f;
      else for (const e of crews) if (adatto(e, c) && libero(e, c) && (!scelto || carico.get(e.id).min < carico.get(scelto.id).min || (carico.get(e.id).min === carico.get(scelto.id).min && persone(e) < persone(scelto)))) scelto = e;
      if (scelto) { const x = carico.get(scelto.id); x.int.push([c.inizio, c.fine]); x.turni++; x.min += c.blocco; x.catene.push(c); c.eq = scelto.id; for (const k of c.chiavi) assegna[k] = scelto.id; }
      else { c.eq = null; c.perche = !c.base ? 'il turno non parte da una base' : crews.some(e => adatto(e, c)) ? 'tutti gli equipaggi adatti sono già impegnati o a riposo' : `nessun equipaggio ${c.tipo} con ${c.piloti} piloti e ${c.cabina} in cabina a ${c.base}`; scoperte.push(c); }
    }
    const r = { catene: ch, assegna, scoperte, carico };
    if (semplice) G._roster = r;
    return r;
  }
  // Equipaggi che servirebbero per coprire tutti i turni (contando anche quelli già in arrivo)
  function pianoAssunzioni(G) {
    const extra = [];
    for (let it = 0; it < 120; it++) {
      const c = roster(G, { futuri: true, extra }).scoperte.find(x => x.base);
      if (!c) break;
      extra.push({ id: 'x' + it, base: c.base, tipo: c.tipo, piloti: c.piloti, cabina: c.cabina, stato: 'attivo' });
    }
    return extra;
  }
  function copertura(G) {
    const r = roster(G), basi = {};
    let t = 0, k = 0;
    for (const c of r.catene) { const x = (basi[c.base || '—'] ||= { turni: 0, coperti: 0 }); x.turni++; t++; if (c.eq) { x.coperti++; k++; } }
    for (const x of Object.values(basi)) x.min = x.turni ? x.coperti / x.turni : 1;
    let ore = 0, n = 0; for (const [id, x] of r.carico) { if (x.turni) { ore += x.min / 60; n++; } }
    return { basi, min: t ? k / t : 1, turni: t, scoperte: r.scoperte.length, oreMedie: n ? ore / n : 0 };
  }
  const totPersonale = G => G.equipaggi.reduce((x, e) => x + persone(e), 0);
  const equipaggioDi = (G, v) => G.equipaggi.find(e => e.id === (v.eqId || roster(G).assegna[v.turno]));
  // vecchio formato (personale contato per base): serve solo alle migrazioni
  const squadra = (G, b) => ((G.personale ||= {})[b] ||= { CMD: {}, FO: {}, CC: 0, ADV: 0 });

  /* ---------- Domanda e vendite ---------- */
  function domandaBase(G, da, a, giorno) {
    const A = AP[da], B = AP[a], d = loc(giorno), tur = (A.tur + B.tur) / 2;
    // stagioni invertite se la meta è nell'emisfero sud
    const mese = (d.getUTCMonth() + (B.lat < 0 ? 6 : 0)) % 12;
    const stag = mese >= 5 && mese <= 8 ? 1 + 0.6 * tur : (mese === 11 || mese <= 1) ? 1 - 0.3 * tur : (mese === 3 || mese === 4 || mese === 9) ? 1 + 0.15 * tur : 1;
    const dow = [1.12, 1.0, 0.92, 0.92, 1.0, 1.15, 0.88][d.getUTCDay()];
    // i viaggi lunghi sono meno frequenti; tra paesi diversi e lontani ancora meno
    const k = km(da, a); let dist = k <= 1500 ? 1 : (1500 / k) ** 0.5; if (A.paese !== B.paese && k > 2500) dist *= 0.85;
    let ev = 1;
    for (const e of G.eventi) if (e.tipo === 'domanda' && (e.citta === A.citta || e.citta === B.citta) && e.inizio < giorno + GIORNO && e.fine > giorno) ev *= e.fattore;
    return 0.25 * Math.sqrt(A.pop * B.pop) * stag * dow * ev * dist;
  }
  function rivaliSu(G, da, a) {
    const kc = chiaveCitta(da, a), out = [];
    for (const r of G.rivali) for (const [k, x] of Object.entries(r.rotte)) {
      const [p, q] = k.split('-'); if (chiaveCitta(p, q) === kc) out.push({ riv: r, k, freq: x.freq, prezzo: x.prezzo, guerra: !!x.guerraFino });
    }
    return out;
  }
  const maturitaRotta = (G, da, a, giorno) => { const r = G.rotte[chiave(da, a)]; return r ? clamp(0.6 + (giorno - r.aperta) / (150 * GIORNO), 0.6, 1) : 1; };
  // Quanti passeggeri sceglie il giocatore in una direzione in un giorno (penalita < 1 per i viaggi in coincidenza)
  function analisiMercato(G, da, a, giorno, freq, pY, penalita = 1, opz = {}) {
    const k = km(da, a), ref = prezzoRif(k), mercato = domandaBase(G, da, a, giorno);
    const sp = opz.senzaMarketing ? { tot: 0, bus: 0 } : spinta(G, da, a, opz.escludi, opz.extra);
    const riv = rivaliSu(G, da, a), altri = altriMezzi(da, a, k);
    const attrP = freq > 0 ? repF(G.reputazione) * (ref / pY) ** 1.6 * Math.sqrt(freq) * penalita * (1 + sp.tot) : 0;
    let tot = attrP + altri;
    const rivali = riv.map(x => { const at = repF(x.riv.rep) * (1 / x.prezzo) ** 1.6 * Math.sqrt(x.freq); tot += at; return { ...x, at }; });
    rivali.forEach(x => x.quota = x.at / tot);
    const quota = attrP / tot, maturita = maturitaRotta(G, da, a, giorno);
    const pax = mercato * quota * clamp((ref / pY) ** 0.8, 0.3, 1.8) * maturita * (1 + 0.3 * sp.tot);
    const quote = quoteClassi(da, a);
    if (sp.bus) { quote.J *= 1 + 1.5 * sp.bus; quote.W *= 1 + 1.5 * sp.bus; quote.Y = 1 - quote.J - quote.W; }
    return { mercato, quota, pax, ref, km: k, rivali, altri: altri / tot, maturita, quote, spinta: sp };
  }
  // Spinta pubblicitaria su una direzione: tot alza l'attrattività, bus alza la quota di Business e Premium
  function spinta(G, da, a, escludi, extra) {
    let tot = 0, bus = 0;
    const lista = extra ? [...(G.campagne || []), extra] : (G.campagne || []);
    for (const c of lista) {
      if (c.id === escludi || c.forza < 0.005) continue;
      const M = D.MARKETING[c.canale]; let peso = 0;
      if (c.ambito === 'rotta') peso = chiave(da, a) === c.obiettivo ? 1 : 0;
      else if (c.ambito === 'rete') peso = G.rotte[chiave(da, a)] ? 1 : 0;
      else if (c.ambito === 'citta') peso = AP[da].citta === c.obiettivo ? 1 : AP[a].citta === c.obiettivo ? 0.5 : 0;
      else if (c.ambito === 'nazionale') peso = AP[da].paese === 'IT' ? 1 : AP[a].paese === 'IT' ? 0.5 : 0;
      if (!peso) continue;
      const scala = M.scala * (c.ambito === 'rete' ? Math.max(1, Object.keys(G.rotte).length) : c.ambito === 'nazionale' && c.canale === 'giornali' ? 3 : 1);
      const e = M.effetto * (1 - Math.exp(-c.budget / scala)) * c.forza * peso;
      tot += e; if (M.business) bus += e;
    }
    return { tot: Math.min(tot, 0.9), bus };
  }
  // Domanda per classe, data la domanda totale e i prezzi di ciascuna classe
  function domandaClassi(pax, quote, prezzi, ref, k = 0) {
    const out = {};
    for (const c of CL) out[c] = pax * quote[c] * (c === 'Y' ? 1 : clamp((ref * multClasse(c, k) / prezzi['p' + c]) ** CLS[c].el, 0.2, 2.5));
    return out;
  }
  // Bersaglio di posti venduti per classe; se una cabina manca o è piena, parte dei clienti scende di classe
  function vendiClassi(dom, cab, prog) {
    const target = zero(); let trabocco = 0;
    for (const c of CL) {
      const vuole = dom[c] * prog + trabocco;
      target[c] = Math.max(0, Math.min(cab[c], Math.round(vuole)));
      trabocco = Math.max(0, vuole - target[c]) * (c === 'J' ? 0.5 : 0.4);
    }
    return target;
  }
  const progressoVendite = ore => ore >= 72 ? 0 : 1 - (Math.max(0, ore) / 72) ** 0.6;

  function vendite(G) {
    const aeMap = new Map(G.aerei.map(a => [a.id, a]));
    const futuri = G.voli.filter(v => v.stato === 'prog' && v.dep > G.ora && aeMap.get(v.ae));
    const oggi = mezzanotte(G.ora);
    // 1) passeggeri locali, raggruppati per giorno, città e direzione
    const gruppi = new Map();
    for (const v of futuri) { const k = mezzanotte(v.dep) + '|' + AP[v.da].citta + '>' + AP[v.a].citta; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(v); }
    for (const lista of gruppi.values()) {
      const v0 = lista[0], g = mezzanotte(v0.dep), prezzi = lista.map(v => prezziRotta(G, v.da, v.a));
      const pm = { pJ: 0, pW: 0, pY: 0 }; for (const p of prezzi) for (const c of CL) pm['p' + c] += p['p' + c] / lista.length;
      const am = analisiMercato(G, v0.da, v0.a, g, lista.length, pm.pY);
      if (g === oggi || g === giornoDopo(oggi)) for (const v of lista) { const r = G.rotte[chiave(v.da, v.a)]; if (r) { r.quota = am.quota; r.rivali = am.rivali.length; } }
      const dom = domandaClassi(am.pax, am.quote, pm, am.ref, am.km);
      const pesi = lista.map(v => pesoOra(oraLocaleMin((v.dep - g) / MIN, v.da))), tot = pesi.reduce((s, x) => s + x, 0);
      lista.forEach((v, i) => {
        const ae = aeMap.get(v.ae), p = prezzi[i], w = pesi[i] / tot, d = {}, cab = {};
        for (const c of CL) { d[c] = dom[c] * w * (pm['p' + c] / p['p' + c]); cab[c] = ae.cab[c] - v.t[c]; }
        v.att = vendiClassi(d, ae.cab, 1);
        const tgt = vendiClassi(d, cab, progressoVendite((v.dep - G.ora) / ORA));
        for (const c of CL) if (tgt[c] > v.v[c]) { v.inc[c] += (tgt[c] - v.v[c]) * p['p' + c]; v.v[c] = tgt[c]; }
      });
    }
    // 2) passeggeri in coincidenza negli hub (attesa tra MCT e attesa massima, solo mercati senza un tuo volo diretto)
    for (const H of G.hub) {
      const perGiorno = new Map(), slot = g => perGiorno.get(g) || perGiorno.set(g, { arr: [], dep: [] }).get(g);
      for (const v of futuri) { if (v.a === H) slot(mezzanotte(v.arr)).arr.push(v); if (v.da === H) slot(mezzanotte(v.dep)).dep.push(v); }
      for (const [g, { arr, dep }] of perGiorno) {
        const od = new Map();
        for (const f1 of arr) for (const f2 of dep) {
          const gap = (f2.dep - f1.arr) / MIN;
          if (gap < D.HUB.mct || gap > D.HUB.attesaMax || AP[f1.da].citta === AP[f2.a].citta || G.rotte[chiave(f1.da, f2.a)] || !percorsoSensato(f1.da, H, f2.a)) continue;
          const k = f1.da + '>' + f2.a; if (!od.has(k)) od.set(k, []); od.get(k).push({ f1, f2, gap });
        }
        for (const coppie of od.values()) {
          const O = coppie[0].f1.da, Dd = coppie[0].f2.a, tariffe = { pJ: 0, pW: 0, pY: 0 };
          for (const x of coppie) { const p1 = prezziRotta(G, x.f1.da, x.f1.a), p2 = prezziRotta(G, x.f2.da, x.f2.a); for (const c of CL) tariffe['p' + c] += 0.8 * (p1['p' + c] + p2['p' + c]) / coppie.length; }
          const am = analisiMercato(G, O, Dd, g, coppie.length, tariffe.pY, 0.45);
          const mat = Math.min(maturitaRotta(G, O, H, g), maturitaRotta(G, H, Dd, g));
          const dom = domandaClassi(am.pax / am.maturita * mat, am.quote, tariffe, am.ref, am.km);
          const pesi = coppie.map(x => 1 / (1 + x.gap / 90)), tot = pesi.reduce((s, x) => s + x, 0);
          coppie.forEach((x, i) => {
            const { f1, f2 } = x, a1 = aeMap.get(f1.ae), a2 = aeMap.get(f2.ae);
            const gia = f1.conn[f2.id] ||= zero(), cab = {}, d = {};
            for (const c of CL) { cab[c] = Math.min(a1.cab[c] - f1.v[c] - f1.t[c], a2.cab[c] - f2.v[c] - f2.t[c]) + gia[c]; d[c] = dom[c] * pesi[i] / tot; }
            const tgt = vendiClassi(d, cab, progressoVendite((f1.dep - G.ora) / ORA));
            for (const c of CL) {
              const delta = tgt[c] - gia[c]; if (delta <= 0) continue;
              const p1 = prezziRotta(G, f1.da, f1.a)['p' + c], p2 = prezziRotta(G, f2.da, f2.a)['p' + c], tariffa = 0.8 * (p1 + p2), q1 = p1 / (p1 + p2);
              gia[c] += delta; f1.t[c] += delta; f2.t[c] += delta;
              f1.inc[c] += delta * tariffa * q1; f2.inc[c] += delta * tariffa * (1 - q1);
              f1.incT += delta * tariffa * q1; f2.incT += delta * tariffa * (1 - q1);
            }
          });
        }
      }
    }
  }
  // Passeggeri e ricavi in più dovuti alla pubblicità sui voli di domani: stessa logica delle vendite,
  // volo per volo, con i posti già occupati dai passeggeri in coincidenza
  function stimaMarketing(G, opz = {}) {
    const domani = giornoDopo(mezzanotte(G.ora)), dopo = giornoDopo(domani), aeMap = new Map(G.aerei.map(a => [a.id, a]));
    const gruppi = new Map();
    for (const v of G.voli) {
      if (v.dep < domani || v.dep >= dopo || v.stato === 'canc' || !aeMap.get(v.ae)) continue;
      const k = AP[v.da].citta + '>' + AP[v.a].citta; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(v);
    }
    let pax = 0, ricavi = 0; const perRotta = {};
    for (const lista of gruppi.values()) {
      const v0 = lista[0], prezzi = lista.map(v => prezziRotta(G, v.da, v.a));
      const pm = { pJ: 0, pW: 0, pY: 0 }; for (const p of prezzi) for (const c of CL) pm['p' + c] += p['p' + c] / lista.length;
      const pesi = lista.map(v => pesoOra(oraLocaleMin((v.dep - domani) / MIN, v.da))), tot = pesi.reduce((a, x) => a + x, 0);
      const venduti = o => {
        const am = analisiMercato(G, v0.da, v0.a, domani, lista.length, pm.pY, 1, o), dom = domandaClassi(am.pax, am.quote, pm, am.ref, am.km);
        return lista.map((v, i) => {
          const ae = aeMap.get(v.ae), p = prezzi[i], d = {}, cab = {};
          for (const c of CL) { d[c] = dom[c] * pesi[i] / tot * (pm['p' + c] / p['p' + c]); cab[c] = ae.cab[c] - v.t[c]; }
          const t = vendiClassi(d, cab, 1); let n = 0, r = 0; for (const c of CL) { n += t[c]; r += t[c] * p['p' + c]; }
          return { n, r };
        });
      };
      const base = venduti(opz.base || { senzaMarketing: true }), con = venduti(opz.con || {});
      lista.forEach((v, i) => {
        const dp = con[i].n - base[i].n; pax += dp; ricavi += con[i].r - base[i].r;
        const k = chiave(v.da, v.a); perRotta[k] = (perRotta[k] || 0) + dp;
      });
    }
    return { pax, ricavi, perRotta };
  }
  // Un viaggio via hub ha senso solo se non allunga troppo il percorso rispetto al volo diretto
  const percorsoSensato = (o, hb, d) => km(o, hb) + km(hb, d) <= D.HUB.deviazione * km(o, d);
  // Coincidenze possibili oggi e domani in un hub (per l'interfaccia)
  function coincidenze(G, H) {
    const out = [], lim = giornoDopo(mezzanotte(G.ora), 2);
    const voli = G.voli.filter(v => v.stato !== 'canc' && v.dep < lim);
    for (const f1 of voli) if (f1.a === H) for (const f2 of voli) if (f2.da === H) {
      const gap = (f2.dep - f1.arr) / MIN;
      if (gap >= D.HUB.mct && gap <= D.HUB.attesaMax && AP[f1.da].citta !== AP[f2.a].citta && percorsoSensato(f1.da, H, f2.a)) out.push({ f1, f2, gap, diretto: !!G.rotte[chiave(f1.da, f2.a)], pax: f1.conn[f2.id] ? somma(f1.conn[f2.id]) : 0 });
    }
    return out;
  }

  /* ---------- Svolgimento dei voli ---------- */
  const eventoAttivo = (G, tipo, t, iata) => G.eventi.find(e => e.tipo === tipo && e.inizio <= t && e.fine > t && (!iata || !e.iata || iata.includes(e.iata)));
  function partenza(G, v) {
    const ae = G.aerei.find(x => x.id === v.ae);
    let motivo = null, straord = false;
    if (!ae || ae.stato === 'venduto') motivo = 'Aereo non più in flotta';
    else if (ae.stato === 'manutenzione') motivo = ae.lavori?.tipo === 'cabina' ? 'Aereo in riconfigurazione cabina' : 'Aereo in manutenzione';
    else if (ae.stato === 'guasto') motivo = 'Aereo fermo per guasto';
    else if (ae.stato === 'consegna') motivo = 'Aereo non ancora consegnato';
    else if (ae.oreDaCheck > 700) motivo = 'Ispezione scaduta: aereo fermo per legge';
    else if (ae.pos !== v.da) motivo = `Aereo non presente a ${v.da}`;
    else {
      const usura = ae.oreDaCheck / 600, eq = equipaggioDi(G, v);
      const paese = AP[v.da].paese === 'IT' || AP[v.a].paese === 'IT', meteo = eventoAttivo(G, 'meteo', v.dep, [v.da, v.a]);
      if (paese && eventoAttivo(G, 'sciopero-atc', v.dep) && rnd() < 0.6) { motivo = 'Sciopero dei controllori di volo'; straord = true; }
      else if (eventoAttivo(G, 'sciopero', v.dep) && rnd() < 0.45) motivo = 'Sciopero del personale';
      else if (!eq) motivo = 'Nessun equipaggio assegnato al turno';
      else if (meteo && meteo.forza >= 2 && rnd() < 0.2) { motivo = meteo.testo; straord = true; }
      else if (rnd() < 0.0025 * (1 + ae.eta / 12) * (usura > 0.85 ? 1 + (usura - 0.85) * 25 : 1)) {
        const costo = Math.round((15000 + rnd() * 50000) * MOD[ae.modello].peso / 70), ore = Math.round(6 + rnd() * 40);
        ae.stato = 'guasto'; ae.fino = G.ora + ore * ORA; G.cassa -= costo; G.oggi.costi.manutenzione += costo;
        notizia(G, `Guasto tecnico su ${ae.marche} a ${v.da}: fermo per circa ${ore} ore, riparazione ${eur(costo)}.`, 'cattiva', true);
        motivo = 'Guasto tecnico';
      }
      if (!motivo) {
        const prop = ae.arrPrevista ? Math.max(0, (ae.arrPrevista + 25 * MIN - v.dep) / MIN) : 0;
        const p = 0.16 + (ae.prog.turn < 35 ? 0.12 : 0) + usura * 0.08 + (meteo ? 0.45 : 0);
        const own = rnd() < p ? -Math.log(rnd()) * (meteo ? 45 : 20) : 0;
        v.rit = Math.round(Math.max(prop, own));
        v.depEff = v.dep + v.rit * MIN; v.arrEff = v.arr + v.rit * MIN + Math.round((rnd() - 0.5) * 10) * MIN;
        v.stato = v.rit > 0 ? 'rit' : 'volo';
        ae.arrPrevista = v.arrEff; ae.pos = v.a; ae.inVolo = v.id; v.eqId = eq.id; v.equip = eq.nome;
        return;
      }
    }
    cancella(G, v, motivo, straord);
  }
  const statRotta = (o, k) => (o.rotte[k] ||= { voli: 0, pax: 0, posti: 0, ricavi: 0, costi: 0, canc: 0, paxC: zero(), ricaviC: zero(), postiC: zero(), transito: 0 });
  function cancella(G, v, motivo, straord) {
    v.stato = 'canc'; v.motivo = motivo;
    const pax = venduti(v), k = km(v.da, v.a);
    const rimborso = straord ? 0 : Math.round(pax * (k < 1500 ? 250 : 400) * 0.5);
    G.cassa -= rimborso; G.oggi.costi.rimborsi += rimborso; G.oggi.canc++;
    const r = statRotta(G.oggi, chiave(v.da, v.a)); r.canc++; r.costi += rimborso;
    registra(G, v, { pax, ricavi: 0, costi: rimborso, dettaglio: { rimborsi: rimborso }, ricaviC: zero() });
  }
  function arrivo(G, v) {
    const ae = G.aerei.find(x => x.id === v.ae), m = MOD[ae.modello], k = km(v.da, v.a);
    const pax = venduti(v), np = posti(ae), h = (v.arrEff - v.depEff) / ORA;
    const c = {
      carburante: Math.round(m.consumo * h * G.carburante),
      tasse: Math.round(pax * AP[v.da].tassa + Math.max(np * 2, m.peso * 8)),
      handling: 250 + pax * 5,
      navigazione: Math.round(k * 0.6 * Math.sqrt(m.peso / 70)),
      manutenzione: Math.round(m.manut * h * (1 + ae.eta * 0.03)),
      servizio: Math.round((pax * D.SERVIZIO[G.servizio].costo + (v.v.J + v.t.J) * 12 + (v.v.W + v.t.W) * 4) * Math.max(1, h / 2)),
      rimborsi: v.rit >= 180 ? Math.round(pax * (k < 1500 ? 250 : 400) * 0.5) : 0,
      equipaggi: (v.fineTurno ? (v.piloti + cabMin(ae)) * 150 : 0) + (v.posizionato ? (v.piloti + cabMin(ae)) * 250 : 0),
      soste: v.sostaFuori ? Math.round(m.peso * 15) : 0
    };
    const costi = Object.values(c).reduce((s, x) => s + x, 0), ricaviC = {}; let ricavi = 0;
    for (const x of CL) { ricaviC[x] = Math.round(v.inc[x]); ricavi += ricaviC[x]; }
    v.stato = 'arrivato'; ae.ore += h; ae.cicli++; ae.oreDaCheck += h; ae.inVolo = null;
    G.cassa += ricavi - costi;
    const o = G.oggi;
    o.voli++; o.pax += pax; o.posti += np; o.ricavi += ricavi; if (v.rit <= 15) o.puntuali++;
    for (const x of CL) { o.paxC[x] += v.v[x] + v.t[x]; o.ricaviC[x] += ricaviC[x]; }
    for (const x in c) o.costi[x] += c[x];
    // i passeggeri in transito si contano una volta sola, sul volo che arriva all'hub
    if (G.hub.includes(v.a)) { let n = 0; for (const x of Object.values(v.conn)) n += somma(x); o.transito += n; (o.hub[v.a] ||= { transito: 0, ricavi: 0 }).transito += n; }
    o.ricaviTransito += v.incT;
    const hubRic = [v.da, v.a].find(i => G.hub.includes(i)); if (hubRic && v.incT) (o.hub[hubRic] ||= { transito: 0, ricavi: 0 }).ricavi += v.incT;
    const r = statRotta(o, chiave(v.da, v.a));
    r.voli++; r.pax += pax; r.posti += np; r.ricavi += ricavi; r.costi += costi; r.transito += somma(v.t);
    for (const x of CL) { r.paxC[x] += v.v[x] + v.t[x]; r.ricaviC[x] += ricaviC[x]; r.postiC[x] += ae.cab[x]; }
    const ra = (o.aerei[ae.id] ||= { ore: 0, ricavi: 0, costi: 0 }); ra.ore += h; ra.ricavi += ricavi; ra.costi += costi;
    G.stat.pax += pax; G.stat.voli++;
    if (!G.traguardi['primo-volo']) traguardo(G, 'primo-volo');
    registra(G, v, { pax, ricavi, costi, dettaglio: c, ricaviC });
  }
  function registra(G, v, x) {
    const ae = G.aerei.find(a => a.id === v.ae);
    G.registro.unshift({ equip: v.equip, id: v.id, num: v.num, da: v.da, a: v.a, dep: v.dep, depEff: v.depEff, arrEff: v.arrEff, arr: v.arr, rit: v.rit, stato: v.stato, motivo: v.motivo, marche: ae?.marche, base: v.base, posti: ae ? posti(ae) : 0, cab: ae ? { ...ae.cab } : zero(), paxC: { J: v.v.J + v.t.J, W: v.v.W + v.t.W, Y: v.v.Y + v.t.Y }, transito: somma(v.t), ricaviTransito: Math.round(v.incT), ...x });
    if (G.registro.length > 600) G.registro.length = 600;
  }
  function processaVoli(G) {
    for (const v of G.voli) {
      if (v.dep > G.ora) break;
      if (v.stato === 'prog') partenza(G, v);
      if (v.stato === 'rit' && G.ora >= v.depEff) v.stato = 'volo';
      if (v.stato === 'volo' && G.ora >= v.arrEff) arrivo(G, v);
    }
    for (const v of G.voli) if ((v.stato === 'volo' || v.stato === 'rit') && G.ora >= v.arrEff) { v.stato = 'volo'; arrivo(G, v); }
  }
  function processaLavori(G) {
    for (const ae of G.aerei) {
      const L = ae.lavori;
      if (L) {
        if (ae.stato === 'attivo' && !ae.inVolo && G.ora >= L.inizio) { ae.stato = 'manutenzione'; ae.fino = L.fine; }
        if (ae.stato === 'manutenzione' && G.ora >= L.fine) {
          ae.stato = 'attivo'; G.cassa -= L.costo; G.oggi.costi.manutenzione += L.costo; ae.lavori = null;
          if (L.tipo === 'check') { ae.oreDaCheck = 0; notizia(G, `${ae.marche}: ispezione completata (${eur(L.costo)}).`, 'info'); }
          else { ae.cab = L.cab; G._roster = null; rigeneraAereo(G, ae); notizia(G, `${ae.marche}: nuova cabina pronta (${L.cab.J} Business · ${L.cab.W} Premium · ${L.cab.Y} Economy).`, 'buona'); }
        }
      }
      if (ae.stato === 'guasto' && G.ora >= ae.fino) { ae.stato = 'attivo'; notizia(G, `${ae.marche} è di nuovo operativo.`, 'buona'); }
      if (ae.stato === 'consegna' && G.ora >= ae.fino) {
        ae.stato = 'attivo'; ae.pos = ae.prog.giorni[indiceCiclo(ae.prog, mezzanotte(G.ora))].scali[0]; G._roster = null;
        notizia(G, `Consegnato ${MOD[ae.modello].nome} ${ae.marche} a ${ae.base} (${ae.cab.J}J · ${ae.cab.W}W · ${ae.cab.Y}Y). Assegnagli una rotazione!`, 'buona', true);
        rigeneraAereo(G, ae); controllaTraguardi(G);
      }
    }
  }
  // inizio della prossima sosta di almeno 8 ore dell'aereo (per ispezioni e lavori)
  function fineGiornataAereo(G, ae) {
    let t = G.ora; const inv = ae.inVolo && G.voli.find(v => v.id === ae.inVolo); if (inv) t = inv.arrEff;
    for (const v of G.voli) { if (v.ae !== ae.id || v.stato !== 'prog' || v.dep < t) continue; if (v.dep - t >= 8.5 * ORA) break; t = v.arr; }
    return t + 30 * MIN;
  }
  function pianificaCheck(G, aeId) {
    const ae = G.aerei.find(a => a.id === aeId); if (!ae || ae.lavori) return;
    const inizio = fineGiornataAereo(G, ae);
    ae.lavori = { tipo: 'check', inizio, fine: inizio + 8 * ORA, costo: Math.round(MOD[ae.modello].check * (1 + ae.eta * 0.02)) };
    notizia(G, `${ae.marche}: ispezione programmata alle ${oraIn(inizio)} per 8 ore.`, 'info');
  }

  /* ---------- Cicli orari e giornalieri ---------- */
  function aggiornaCampagne(G) {
    for (const c of G.campagne || []) {
      const M = D.MARKETING[c.canale];
      if (c.attiva && c.fine && G.ora >= c.fine) { c.attiva = false; notizia(G, `Campagna ${M.nome.toLowerCase()} ${c.etichetta} conclusa: l’effetto svanirà gradualmente.`, 'info'); }
      const target = c.attiva ? 1 : 0, rate = target > c.forza ? M.salita : M.discesa;
      c.forza += (target - c.forza) * (1 - Math.pow(1 - rate, 1 / 24));
    }
    G.campagne = (G.campagne || []).filter(c => c.attiva || c.forza > 0.02);
  }
  function orario(G) {
    aggiornaCampagne(G);
    vendite(G);
    G.eventi = G.eventi.filter(e => e.fine > G.ora);
    const ora = loc(G.ora).getUTCHours();
    for (const e of G.equipaggi) if (e.stato === 'formazione' && G.ora >= e.pronto) {
      e.stato = 'attivo'; G._roster = null;
      notizia(G, `Equipaggio ${e.nome} (cpt. ${e.capo}, ${e.tipo}) operativo a ${e.base}${e.motivo ? ': ' + e.motivo : ''}.`, 'buona');
    }
    if (ora === 18) for (const ae of G.aerei) if (ae.autoCheck && !ae.lavori && ae.stato === 'attivo' && ae.oreDaCheck > 500) pianificaCheck(G, ae.id);
    if (ora === 3) for (const ae of G.aerei) {
      if (ae.stato === 'venduto' || ae.stato === 'consegna' || ae.inVolo) continue;
      // se l'aereo non è dove parte il suo prossimo volo, lo si porta lì a vuoto
      const nf = G.voli.find(v => v.ae === ae.id && v.stato === 'prog' && v.dep > G.ora);
      if (!nf || nf.dep - G.ora > 20 * ORA || ae.pos === nf.da) continue;
      const dove = nf.da;
      const k = km(ae.pos, dove), costo = Math.round(MOD[ae.modello].consumo * (k / MOD[ae.modello].vel + 0.3) * G.carburante + 2500);
      G.cassa -= costo; G.oggi.costi.altro += costo;
      notizia(G, `${ae.marche} era a ${ae.pos}: volo di trasferimento a vuoto verso ${dove} per il programma di oggi (${eur(costo)}).`, 'cattiva');
      ae.pos = dove;
    }
  }
  function costiFissi(G) {
    const c = { leasing: 0, personale: 0, basi: 0, hub: 0, marketing: 0, sede: 0, interessi: 0, assicurazione: 0 };
    for (const x of G.campagne || []) if (x.attiva) c.marketing += x.budget;
    for (const ae of G.aerei) {
      if (ae.stato === 'venduto') continue;
      if (ae.modo === 'leasing' && ae.stato !== 'consegna') c.leasing += ae.leasing;
      if (ae.modo === 'proprieta') c.assicurazione += ae.valore * 0.00003;
    }
    c.personale = G.equipaggi.reduce((x, e) => x + pagaEquipaggio(e), 0) * G.stipendio;
    for (const b of G.basi) c.basi += AP[b].slot ? 2500 : 1200;
    c.hub = G.hub.length * D.HUB.giornaliero;
    c.sede = 1000 + 300 * flottaAttiva(G).length;
    for (const d of G.debiti) c.interessi += d.capitale * d.tasso / 365;
    for (const x in c) c[x] = Math.round(c[x]);
    return c;
  }
  function giornaliero(G, tPrec) {
    const o = G.oggi, fissi = costiFissi(G);
    for (const x in fissi) { o.costi[x] = (o.costi[x] || 0) + fissi[x]; G.cassa -= fissi[x]; }
    for (const x of G.campagne || []) if (x.attiva) x.speso += x.budget;
    for (const x of G.campagne || []) if (D.MARKETING[x.canale].reputazione) G.reputazione = Math.min(100, G.reputazione + 0.12 * x.forza);
    for (const d of G.debiti) { const r = Math.min(d.capitale, d.rata); d.capitale -= r; G.cassa -= r; }
    G.debiti = G.debiti.filter(d => d.capitale > 1);
    const costi = Object.values(o.costi).reduce((s, x) => s + x, 0);
    G.storico.push({ data: dataDi(tPrec), t: mezzanotte(tPrec), voli: o.voli, canc: o.canc, pax: o.pax, posti: o.posti, puntuali: o.puntuali, ricavi: o.ricavi, paxC: o.paxC, ricaviC: o.ricaviC, transito: o.transito, ricaviTransito: Math.round(o.ricaviTransito), costi, utile: o.ricavi - costi, dettaglio: o.costi, cassa: Math.round(G.cassa), rep: G.reputazione, rotte: o.rotte, aerei: o.aerei, hub: o.hub });
    const rec = G.storico.at(-1); G.stat.utile += rec.utile;
    const vecchio = G.storico[G.storico.length - 61]; if (vecchio) { delete vecchio.rotte; delete vecchio.aerei; }
    if (G.storico.length > 1200) G.storico.shift();
    G.giorniUtile = rec.utile > 0 ? G.giorniUtile + 1 : 0;
    for (const ae of G.aerei) if (ae.modo === 'proprieta') ae.valore *= 1 - 0.055 / 365;
    const ult = G.storico.slice(-7), voli = ult.reduce((s, x) => s + x.voli, 0), canc = ult.reduce((s, x) => s + x.canc, 0);
    if (voli + canc > 0) {
      const punt = ult.reduce((s, x) => s + x.puntuali, 0) / Math.max(1, voli);
      const target = clamp(50 + (punt - 0.8) * 160 - canc / (voli + canc) * 250 + D.SERVIZIO[G.servizio].rep + (G.morale - 50) * 0.1, 5, 95);
      G.reputazione = clamp(G.reputazione + (target - G.reputazione) * 0.06, 0, 100);
    }
    const cop = copertura(G);
    G._roster = null;
    const tm = clamp(60 + (G.stipendio - 1) * 160 - (cop.min < 1 ? 10 : 0) - (cop.oreMedie > 24 ? 12 : 0) - (cop.oreMedie > 27 ? 10 : 0), 0, 100);
    G.morale = clamp(G.morale + (tm - G.morale) * 0.05, 0, 100);
    G.carburante = clamp(G.carburante + (0.8 - G.carburante) * 0.03 + (rnd() - 0.5) * 0.025, 0.45, 1.6);
    eventiCasuali(G);
    if (loc(G.ora).getUTCDay() === 1) { settimanaRivali(G); aggiornaMercato(G); }
    controllaTraguardi(G); controllaObiettivi(G);
    if (G.cassa < -2e6) {
      G.fallimento++;
      notizia(G, `Cassa sotto il limite di fido (−2 M€)! Le banche ti danno ancora ${10 - G.fallimento} giorni.`, 'cattiva', true);
      if (G.fallimento >= 10) G.esito = { tipo: 'fallimento', t: G.ora };
    } else G.fallimento = 0;
    generaGiorno(G, giornoDopo(mezzanotte(G.ora), 2));
    G.voli = G.voli.filter(v => !((v.stato === 'arrivato' || v.stato === 'canc') && v.dep < G.ora - 30 * ORA));
    G.oggi = nuovoGiorno(); G._salva = true;
  }

  const NOMI_EVENTI = ['Salone internazionale', 'Concerto allo stadio', 'Finale di coppa', 'Congresso medico', 'Festival del cinema', 'Settimana della moda', 'Maratona cittadina', 'Fiera del turismo'];
  function eventiCasuali(G) {
    const domani = giornoDopo(mezzanotte(G.ora)), mese = loc(G.ora).getUTCMonth();
    const serviti = [...new Set(G.aerei.flatMap(a => a.prog.giorni.flatMap(g => g.scali)))];
    const pick = a => a[Math.floor(rnd() * a.length)];
    const nord = serviti.filter(i => ['LIN', 'MXP', 'BGY', 'TRN', 'VCE', 'BLQ', 'VRN', 'TRS', 'GOA'].includes(i));
    if ((mese >= 9 || mese <= 1) && nord.length && rnd() < 0.15) {
      const i = pick(nord); G.eventi.push({ tipo: 'meteo', iata: i, forza: 1, inizio: tsDi(domani, 300), fine: tsDi(domani, 660), testo: `Nebbia a ${AP[i].citta}` });
      notizia(G, `Meteo: prevista nebbia domattina a ${AP[i].citta}. Attesi ritardi fino alle 11.`, 'evento');
    }
    if (mese >= 5 && mese <= 8 && serviti.length && rnd() < 0.12) {
      const i = pick(serviti); G.eventi.push({ tipo: 'meteo', iata: i, forza: 2, inizio: tsDi(domani, 840), fine: tsDi(domani, 1140), testo: `Temporali a ${AP[i].citta}` });
      notizia(G, `Meteo: forti temporali domani pomeriggio a ${AP[i].citta}. Possibili ritardi e cancellazioni.`, 'evento');
    }
    if (rnd() < 0.012 && !G.eventi.some(e => e.tipo === 'sciopero-atc')) {
      const g = giornoDopo(domani, 2);
      G.eventi.push({ tipo: 'sciopero-atc', inizio: tsDi(g, 600), fine: tsDi(g, 1080) });
      notizia(G, `Annunciato sciopero dei controllori di volo italiani per ${loc(g).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}, dalle 10 alle 18.`, 'evento', true);
    }
    if (G.morale < 30 && G.aerei.length && rnd() < 0.08) {
      G.eventi.push({ tipo: 'sciopero', inizio: domani, fine: giornoDopo(domani) });
      notizia(G, 'I sindacati proclamano uno sciopero del personale di volo per domani: il morale è troppo basso.', 'cattiva', true);
    }
    if (rnd() < 0.08) {
      const citta = [...new Set((serviti.length ? serviti : Object.keys(AP)).map(i => AP[i].citta))], c = pick(citta);
      const inizio = giornoDopo(domani, 4), fattore = 1.5 + rnd() * 0.4;
      G.eventi.push({ tipo: 'domanda', citta: c, fattore, inizio, fine: giornoDopo(inizio, 4) });
      notizia(G, `${pick(NOMI_EVENTI)} a ${c} tra 5 giorni: domanda +${Math.round((fattore - 1) * 100)}% per 4 giorni. Aggiungi voli!`, 'evento', true);
    }
    if (rnd() < 0.008) { G.carburante *= 1.18; notizia(G, 'Tensioni sui mercati: il cherosene aumenta del 18%.', 'cattiva', true); }
    if (rnd() < 0.008) { G.carburante *= 0.88; notizia(G, 'Il prezzo del cherosene scende del 12%.', 'buona'); }
    if (G.aerei.length && rnd() < 0.012) {
      const cop = copertura(G), scaduti = G.aerei.some(a => a.oreDaCheck > 650);
      if (scaduti || cop.min < 0.9) { G.cassa -= 150000; G.oggi.costi.altro += 150000; G.reputazione = Math.max(0, G.reputazione - 3); notizia(G, `Ispezione dell’autorità aeronautica: ${scaduti ? 'aerei con ispezioni in scadenza' : 'turni senza equipaggio'}. Multa di 150.000 €.`, 'cattiva', true); }
      else { G.reputazione = Math.min(100, G.reputazione + 1); notizia(G, 'Ispezione dell’autorità aeronautica superata senza rilievi.', 'buona'); }
    }
  }
  function settimanaRivali(G) {
    const pick = a => a[Math.floor(rnd() * a.length)], ult = G.storico.slice(-7);
    for (const [k, r] of Object.entries(G.rotte)) {
      let pax = 0, pst = 0; for (const s of ult) if (s.rotte && s.rotte[k]) { pax += s.rotte[k].pax; pst += s.rotte[k].posti; }
      if (!pst) continue;
      const lf = pax / pst, [a, b] = k.split('-'), riv = rivaliSu(G, a, b), q = r.quota || 0;
      if (!riv.length && q > 0.4 && lf > 0.8 && G.ora - r.aperta > 30 * GIORNO && G.ora - G.inizio > 45 * GIORNO && rnd() < 0.2) {
        const R = pick(G.rivali); R.rotte[k] = { freq: 2 + Math.floor(rnd() * 2), prezzo: R.prezzo * 0.9 };
        notizia(G, `${R.nome} ha visto i tuoi aerei pieni e apre ${a}–${b}, con prezzi aggressivi.`, 'cattiva', true);
      } else for (const x of riv) {
        const am = analisiMercato(G, a, b, mezzanotte(G.ora), 1, r.pY), qr = am.rivali.find(y => y.riv.id === x.riv.id)?.quota || 0;
        if (qr < 0.12 && q > 0.3 && rnd() < 0.35) { delete x.riv.rotte[x.k]; notizia(G, `${x.riv.nome} abbandona ${x.k.replace('-', '–')}: la rotta è tua.`, 'buona', true); }
        else if (q > 0.45 && !x.guerra && rnd() < 0.12) { const rr = x.riv.rotte[x.k]; rr.prezzo *= 0.8; rr.guerraFino = G.ora + 21 * GIORNO; notizia(G, `Guerra dei prezzi: ${x.riv.nome} taglia del 20% le tariffe su ${x.k.replace('-', '–')} per tre settimane.`, 'cattiva', true); }
      }
    }
    for (const R of G.rivali) for (const rr of Object.values(R.rotte)) if (rr.guerraFino && G.ora > rr.guerraFino) { rr.prezzo = R.prezzo; delete rr.guerraFino; }
    if (rnd() < 0.25) {
      const R = pick(G.rivali), dest = pick(Object.keys(AP).filter(i => i !== R.hub && km(R.hub, i) < (R.raggio || 2000)));
      const k = chiave(R.hub, dest); if (!R.rotte[k]) { R.rotte[k] = { freq: 2, prezzo: R.prezzo }; notizia(G, `${R.nome} inaugura un collegamento ${R.hub}–${dest}.`, 'info'); }
    }
  }
  function aggiornaMercato(G) {
    const pesi = ['ATR42', 'ATR72', 'ATR72', 'E195', 'A319', 'A319', 'A320', 'A320', 'A320', 'A321', 'A220', 'A21X', 'A339', 'B789', 'A359', 'B77W', 'B77W', 'A388'];
    G.mercato = Array.from({ length: 6 }, () => {
      const mod = pesi[Math.floor(rnd() * pesi.length)], eta = 3 + Math.floor(rnd() * 18);
      const prezzo = Math.round(MOD[mod].prezzo * Math.max(0.22, 1 - 0.045 * eta) * (0.9 + rnd() * 0.2) / 1e4) * 1e4;
      return { id: 'u' + (G.seq++), mod, eta, ore: Math.round(eta * (1800 + rnd() * 900)), prezzo, leasing: Math.round(prezzo * 0.00028 / 100) * 100, cab: cabinaStandard(mod, rnd() < 0.5 ? 'economy' : 'mista') };
    });
  }

  /* ---------- Traguardi e obiettivi ---------- */
  function traguardo(G, id) {
    if (G.traguardi[id]) return;
    const t = D.TRAGUARDI.find(x => x[0] === id); if (!t) return;
    G.traguardi[id] = G.ora;
    notizia(G, `🏆 Traguardo sbloccato: ${t[1]} — ${t[2]}`, 'buona', true);
  }
  function controllaTraguardi(G) {
    const fl = flottaAttiva(G);
    if (G.stat.pax >= 1000) traguardo(G, 'pax-1k');
    if (G.stat.pax >= 1e5) traguardo(G, 'pax-100k');
    if (G.stat.pax >= 1e6) traguardo(G, 'pax-1m');
    if (fl.some(a => MOD[a.modello].tipo !== 'ATR')) traguardo(G, 'jet');
    if (fl.length >= 10) traguardo(G, 'flotta-10');
    if (fl.length >= 25) traguardo(G, 'flotta-25');
    if (Object.keys(G.rotte).length >= 10) traguardo(G, 'rotte-10');
    if (Object.keys(G.rotte).some(k => k.split('-').some(i => AP[i].paese !== 'IT'))) traguardo(G, 'estero');
    if (G.giorniUtile >= 30) traguardo(G, 'mese-utile');
    const ult = G.storico.slice(-7), v = ult.reduce((s, x) => s + x.voli, 0);
    if (v >= 50 && ult.reduce((s, x) => s + x.puntuali, 0) / v >= 0.95) traguardo(G, 'puntuale');
    if (Object.values(G.rotte).some(r => (r.quota || 0) > 0.7)) traguardo(G, 'dominio');
    if (G.cassa >= 1e8) traguardo(G, 'cassa-100');
    if (G.reputazione >= 80) traguardo(G, 'reputazione-80');
    if (G.hub.length) traguardo(G, 'hub');
    const att = [...rotteInEsercizio(G)];
    if (att.some(k => { const [a, b] = k.split('-'); return km(a, b) > 5000; })) traguardo(G, 'intercontinentale');
    if (continentiServiti(G) >= 5) traguardo(G, 'continenti');
    if (ult.reduce((s, x) => s + (x.transito || 0), 0) >= 1000) traguardo(G, 'transito');
  }
  const debitoTot = G => G.debiti.reduce((s, d) => s + d.capitale, 0);
  function valoreCompagnia(G) {
    let v = G.cassa - debitoTot(G);
    for (const ae of G.aerei) if (ae.modo === 'proprieta' && ae.stato !== 'venduto') v += ae.valore;
    for (const [i, n] of Object.entries(G.slot)) v += n * AP[i].slotPrezzo * 0.7;
    return v;
  }
  const continentiServiti = G => new Set([...rotteInEsercizio(G)].flatMap(k => k.split('-')).map(i => AP[i].continente)).size;
  const rotteInEsercizio = G => new Set(G.aerei.flatMap(a => mediaCiclo(a).tratte.map(l => chiave(l.da, l.a))));
  function obiettivi(G) {
    const n = flottaAttiva(G).length;
    switch (G.scenario) {
      case 'primo': return [{ t: 'Flotta di 8 aerei', v: n / 8, s: `${n}/8` }, { t: '15 M€ di utile cumulato', v: G.stat.utile / 15e6, s: eur(G.stat.utile) }];
      case 'crisi': { const d = debitoTot(G); return [{ t: 'Debiti sotto 5 M€', v: d <= 5e6 ? 1 : clamp((30e6 - d) / 25e6, 0, 0.99), s: eur(d) }, { t: 'Reputazione oltre 60', v: G.reputazione / 60, s: Math.round(G.reputazione) + '/60' }]; }
      case 'milano': {
        const att = rotteInEsercizio(G), r = Object.entries(G.rotte).filter(([k]) => att.has(k) && k.split('-').some(i => AP[i].citta === 'Milano'));
        const q = r.length ? r.reduce((s, [, x]) => s + (x.quota || 0), 0) / r.length : 0;
        return [{ t: '5 rotte da Milano in esercizio', v: r.length / 5, s: `${r.length}/5` }, { t: 'Quota media del 35%', v: q / 0.35, s: Math.round(q * 100) + '%' }];
      }
      case 'globale': { const n = continentiServiti(G), v = valoreCompagnia(G); return [{ t: '5 continenti collegati', v: n / 5, s: `${n}/5` }, { t: 'Valore della compagnia 400 M€', v: v / 400e6, s: eur(v) }]; }
      default: return [];
    }
  }
  function controllaObiettivi(G) {
    if (G.esito) return;
    const S = D.SCENARI[G.scenario], ob = obiettivi(G);
    if (ob.length && ob.every(o => o.v >= 1)) {
      const giorni = Math.round((G.ora - G.inizio) / GIORNO);
      G.esito = { tipo: 'vittoria', t: G.ora, giorni, punteggio: Math.round(valoreCompagnia(G) / 1e5 + Math.max(0, S.durata - giorni) * 10) };
      notizia(G, `Scenario completato in ${giorni} giorni!`, 'buona', true);
    } else if (S.durata && G.ora - G.inizio > S.durata * GIORNO) {
      G.esito = { tipo: 'scaduto', t: G.ora };
      notizia(G, 'Tempo scaduto: gli obiettivi dello scenario non sono stati raggiunti.', 'cattiva', true);
    }
  }

  /* ---------- Creazione e migrazione ---------- */
  function nuovaPartita(scenId, { nome, codice, base }) {
    const S = D.SCENARI[scenId];
    const b0 = S.preset === 'crisi' ? 'FCO' : (S.base || base || 'BRI');
    FUSO = AP[b0].fuso; const [ya, ma, da] = S.inizio, inizio = Date.UTC(ya, ma - 1, da, 5) - FUSO * ORA;
    const G = {
      v: VERSIONE, id: 'p' + Date.now().toString(36), scenario: scenId, nome: nome || 'Nuova Compagnia', codice: (codice || 'NC').toUpperCase().slice(0, 2),
      fuso: FUSO, inizio, ora: inizio, cassa: S.cassa || 0, debiti: [], reputazione: 50, morale: 65, stipendio: 1, servizio: 'standard', carburante: 0.8,
      basi: [], hub: [], slot: {}, aerei: [], rotte: {}, equipaggi: [], fissi: {}, seqEq: {}, voli: [], registro: [], storico: [], oggi: nuovoGiorno(),
      notizie: [], eventi: [], rivali: D.RIVALI.map(r => ({ id: r.id, nome: r.nome, colore: r.colore, hub: r.hub, rep: r.rep, prezzo: r.prezzo, rotte: Object.fromEntries(Object.entries(r.rotte).map(([k, f]) => [k, { freq: f, prezzo: r.prezzo }])) })),
      traguardi: {}, stat: { pax: 0, voli: 0, utile: 0 }, mercato: [], numeri: {}, campagne: [], seq: 1, seqMarche: 0, seqVolo: 101, fallimento: 0, esito: null, genFino: 0, giorniUtile: 0
    };
    if (S.preset === 'crisi') presetCrisi(G);
    else {
      const b = b0;
      G.basi.push(b); if (AP[b].slot) G.slot[b] = (S.slot && S.slot[b]) || 8;
      for (const [mod, modo] of S.flotta) aggiungiAereo(G, mod, modo, b);
      for (const [tipo, n, piloti, cabina] of S.equipaggi) for (let q = 0; q < n; q++) nuovoEquipaggio(G, { base: b, tipo, piloti, cabina });
      if (S.slot) Object.assign(G.slot, S.slot);
    }
    aggiornaMercato(G);
    for (let i = 0; i <= 2; i++) generaGiorno(G, giornoDopo(mezzanotte(G.ora), i));
    vendite(G);
    notizia(G, `Benvenuto in ${G.nome}! ${S.descr}`, 'buona');
    if (S.preset !== 'crisi') notizia(G, 'Primi passi: apri una rotta (Rotte e prezzi), crea la rotazione dell’aereo (Programmazione) e avvia il tempo.', 'info');
    return G;
  }
  function presetCrisi(G) {
    G.nome = G.nome || 'Aliseo Airlines'; G.cassa = 0.8e6; G.reputazione = 36; G.morale = 42; G.stipendio = 0.95; G.carburante = 0.92;
    G.basi = ['FCO', 'MXP']; G.hub = ['FCO'];
    const apri = (a, b) => { const k = chiave(a, b); if (!G.rotte[k]) { const d = km(a, b), ref = prezzoRif(d); G.rotte[k] = { aperta: G.ora - 400 * GIORNO, pY: Math.round(ref * 0.85), pW: Math.round(ref * multClasse('W', d) * 0.85), pJ: Math.round(ref * multClasse('J', d) * 0.85) }; } };
    const piani = [
      ['A320', 'leasing', [['06:30', ['FCO', 'LIN', 'FCO', 'CDG', 'FCO']]]],
      ['A320', 'proprieta', [['07:10', ['FCO', 'CTA', 'FCO', 'BCN', 'FCO']]]],
      ['A320', 'leasing', [['06:50', ['MXP', 'NAP', 'MXP', 'FCO']], ['07:00', ['FCO', 'CTA', 'FCO', 'MXP']], ['06:50', ['MXP', 'NAP', 'MXP', 'FCO']], ['07:00', ['FCO', 'CTA', 'FCO', 'MXP']], ['06:50', ['MXP', 'NAP', 'MXP', 'FCO']], ['07:00', ['FCO', 'CTA', 'FCO', 'MXP']], ['08:00', ['MXP', 'NAP', 'MXP']]]],
      ['A321', 'leasing', [['07:45', ['FCO', 'LHR', 'FCO', 'PMO', 'FCO']]]],
      ['A319', 'proprieta', [['07:30', ['FCO', 'AMS', 'FCO', 'CAG', 'FCO']]]],
      ['ATR72', 'leasing', [['07:00', ['FCO', 'BRI', 'FCO', 'VCE', 'FCO']]]],
      ['A320', 'proprieta', [['08:00', ['FCO', 'TRN', 'FCO', 'PMO', 'FCO']]]]
    ];
    for (const [mod, modo, giorni] of piani) {
      const base = giorni[0][1][0];
      const ae = aggiungiAereo(G, mod, modo, base, { eta: 6 + Math.floor(rnd() * 10), ore: 15000 + rnd() * 15000, oreDaCheck: 200 + rnd() * 350, cab: cabinaStandard(mod, 'mista') });
      if (modo === 'proprieta') ae.valore = MOD[mod].prezzo * 0.55;
      ae.prog = normalizza({ turn: mod === 'ATR72' ? 30 : 40, giorni: giorni.map(([inizio, scali]) => ({ inizio, scali })) });
      for (const g of giorni) for (let i = 0; i < g[1].length - 1; i++) apri(g[1][i], g[1][i + 1]);
    }
    G.aerei[6].autoCheck = false; G.aerei[6].oreDaCheck = 640;
    for (const [i, n] of Object.entries(partenzePerScalo(G))) if (AP[i].slot) G.slot[i] = n + 1;
    G.equipaggi = []; G.fissi = {};
    for (const x of pianoAssunzioni(G)) nuovoEquipaggio(G, x);
    for (const b of G.basi) nuovoEquipaggio(G, { base: b, tipo: 'A320', piloti: 2, cabina: 4 }); // una riserva per base
    G.debiti.push({ id: 'd' + (G.seq++), capitale: 30e6, tasso: 0.085, rata: Math.round(30e6 / (8 * 365)) });
  }
  // Converte i salvataggi della versione 1 (una giornata per aereo, cabine a due classi, personale unico)
  function migra(G) {
    G.campagne ||= [];
    if (G.oggi && G.oggi.costi && G.oggi.costi.marketing == null) G.oggi.costi.marketing = 0;
    G.fuso ??= AP[G.basi[0]].fuso; impostaFuso(G);
    if (G.v >= VERSIONE) return G;
    if (!G.v || G.v < 2) migraV2(G);
    if (G.v < 3) migraV3(G);
    if (G.v < 4) migraV4(G);
    return migraV5(G);
  }
  function migraV2(G) {
    const oggi = mezzanotte(G.ora), b0 = G.basi[0], vecchio = G.personale || {};
    G.hub ||= []; G.numeri ||= {}; G.seqVolo = Math.max(G.seqVolo || 0, 101);
    G.personale = { [b0]: { CMD: vecchio.CMD || {}, FO: vecchio.FO || {}, CC: vecchio.CC || 0, ADV: vecchio.ADV || 0 } };
    for (const b of G.basi) squadra(G, b);
    for (const f of G.formazione || []) f.base ||= b0;
    for (const r of Object.values(G.rotte)) r.pW ||= Math.round(r.pY * CLS.W.mult);
    for (const ae of G.aerei) {
      ae.cab = cabinaStandard(ae.modello, 'mista');
      const p = ae.prog || {}; ae.prog = { turn: p.turn || 40, ancora: oggi, giorni: [{ inizio: p.inizio || '06:30', scali: p.scali || [ae.base] }] };
      ae.lavori = ae.check ? { tipo: 'check', ...ae.check } : null; delete ae.check;
      ae.inVolo = null; ae.pos = ae.prog.giorni[0].scali[0];
      if (ae.stato === 'manutenzione' && !ae.lavori) ae.stato = 'attivo';
    }
    for (const m of G.mercato || []) m.cab ||= cabinaStandard(m.mod, 'economy');
    const og = G.oggi || {};
    G.oggi = { ...nuovoGiorno(), voli: og.voli || 0, canc: og.canc || 0, pax: og.pax || 0, posti: og.posti || 0, puntuali: og.puntuali || 0, ricavi: og.ricavi || 0, costi: { ...nuovoGiorno().costi, ...(og.costi || {}) } };
    G.voli = []; G.genFino = 0; G.v = 2;
  }
  // Versione 3: orologio sul fuso della base, voli oltre la mezzanotte, mondo intero
  function migraV3(G) {
    for (const ae of G.aerei) { ae.prog.ancora = mezzanotte(ae.prog.ancora + 12 * ORA); delete ae._piano; }
    G.v = 3;
  }
  // Versione 4: programmazione settimanale (lunedì-domenica) con orari scelti volo per volo
  function migraV4(G) {
    const lun = mezzanotte(G.ora) - giornoSett(G.ora) * GIORNO;
    for (const ae of G.aerei) {
      const p = ae.prog;
      ae.prog = normalizza({ turn: p.turn, giorni: GIORNI_SETT.map((_, d) => p.giorni[indiceCiclo(p, lun + d * GIORNO)]) });
      delete ae._piano;
    }
    G.voli = G.voli.filter(v => v.stato !== 'prog'); G.genFino = 0;
    for (let i = -1; i <= 2; i++) generaGiorno(G, giornoDopo(mezzanotte(G.ora), i));
    G.v = 4;
  }
  // Versione 5: equipaggi con nome al posto del personale contato per base
  function migraV5(G) {
    G.equipaggi = []; G.fissi = {}; G.seqEq = {};
    for (const [b, P] of Object.entries(G.personale || {})) {
      let cabinaLibera = (P.CC || 0) + (P.ADV || 0);
      const tipi = [...new Set([...Object.keys(P.CMD || {}), ...Object.keys(P.FO || {})])].map(tipo => {
        const aerei = G.aerei.filter(a => a.stato !== 'venduto' && MOD[a.modello].tipo === tipo);
        return { tipo, lungo: aerei.some(a => MOD[a.modello].lungo), cab: Math.max(1, ...aerei.map(a => cabMin(a)), tipo === 'ATR' ? 2 : 4) };
      }).sort((x, y) => x.cab - y.cab); // prima i tipi con cabine piccole, così nessun tipo resta senza equipaggi
      for (const { tipo, lungo, cab } of tipi) {
        const piloti = lungo ? 3 : 2;
        const n = Math.min(P.CMD?.[tipo] || 0, Math.floor((P.FO?.[tipo] || 0) / (piloti - 1)));
        for (let q = 0; q < n && cabinaLibera > 0; q++) { const c = Math.min(cab, cabinaLibera); cabinaLibera -= c; nuovoEquipaggio(G, { base: b, tipo, piloti, cabina: c }); }
      }
    }
    delete G.personale; delete G.formazione;
    if (G.oggi?.costi) G.oggi.costi.soste ??= 0;
    for (const ae of G.aerei) delete ae._piano;
    G.voli = G.voli.filter(v => v.stato !== 'prog'); G.genFino = 0;
    for (let i = -1; i <= 2; i++) generaGiorno(G, giornoDopo(mezzanotte(G.ora), i));
    G.v = VERSIONE; G._roster = null; vendite(G);
    const sc = roster(G).scoperte.length;
    notizia(G, `Novità: programmi settimanali, equipaggi con nome assegnati turno per turno e rotte da qualsiasi scalo. ${sc ? `Ci sono ${sc} turni senza equipaggio: vai in Personale o in Programmazione per assumere con un tocco.` : 'Tutti i turni hanno un equipaggio.'}`, 'info', true);
    return G;
  }

  /* ---------- Avanzamento del tempo ---------- */
  function avanza(G, dt) {
    impostaFuso(G);
    const fine = G.ora + dt;
    while (G.ora < fine && !(G.esito && G.esito.tipo === 'fallimento')) {
      const prima = G.ora; G.ora = Math.min(fine, G.ora + 5 * MIN);
      processaLavori(G); processaVoli(G);
      if (Math.floor(G.ora / ORA) !== Math.floor(prima / ORA)) orario(G);
      if (mezzanotte(G.ora) !== mezzanotte(prima)) giornaliero(G, prima);
    }
  }

  /* ---------- Azioni del giocatore ---------- */
  const err = m => ({ errore: m }), ok = m => ({ ok: true, msg: m });
  const paga = (G, costo, voce = 'altro') => { G.cassa -= costo; G.oggi.costi[voce] += costo; };
  const A = {
    apriRotta(G, a, b) {
      if (a === b) return err('Scegli due aeroporti diversi');
      const k = chiave(a, b); if (G.rotte[k]) return err('Rotta già aperta');
      if (G.cassa < 30000) return err('Cassa insufficiente');
      const d = km(a, b), ref = prezzoRif(d); paga(G, 30000);
      G.rotte[k] = { aperta: G.ora, pY: ref, pW: Math.round(ref * multClasse('W', d)), pJ: Math.round(ref * multClasse('J', d)) };
      notizia(G, `Aperta la rotta ${a}–${b} (${d} km). Campagna di lancio: ${eur(30000)}.`, 'buona'); controllaTraguardi(G);
      return ok('Rotta aperta');
    },
    chiudiRotta(G, k) {
      if (rotteInEsercizio(G).has(k)) return err('La rotta è ancora nelle rotazioni di qualche aereo');
      delete G.rotte[k]; return ok('Rotta chiusa');
    },
    prezzi(G, k, p) { const r = G.rotte[k]; for (const c of CL) if (p['p' + c] != null && !isNaN(p['p' + c])) r['p' + c] = clamp(Math.round(p['p' + c]), 10, 5000); vendite(G); return ok('Prezzi aggiornati'); },
    compraNuovo(G, mod, modo, base, cab) {
      const m = MOD[mod], e = validaCabina(mod, cab); if (e) return err(e);
      const costo = modo === 'proprieta' ? m.prezzo : m.leasing * 30; if (G.cassa < costo) return err(`Servono ${eur(costo)} in cassa`);
      G.cassa -= costo; if (modo === 'leasing') G.oggi.costi.altro += costo;
      const ae = aggiungiAereo(G, mod, modo, base, { consegna: G.ora + 30 * GIORNO, oreDaCheck: 0, cab });
      notizia(G, `Ordinato ${m.nome} ${modo === 'leasing' ? 'in leasing' : 'in proprietà'} (${ae.marche}, ${cab.J}J · ${cab.W}W · ${cab.Y}Y): consegna tra 30 giorni a ${base}.`, 'info');
      return ok('Ordine confermato');
    },
    compraUsato(G, id, modo, base, cab) {
      const o = G.mercato.find(x => x.id === id); if (!o) return err('Offerta non più disponibile');
      cab ||= o.cab; const e = validaCabina(o.mod, cab); if (e) return err(e);
      const cambia = CL.some(c => cab[c] !== o.cab[c]), extra = cambia ? 60000 + 800 * somma(cab) : 0;
      const costo = (modo === 'proprieta' ? o.prezzo : o.leasing * 30) + extra; if (G.cassa < costo) return err(`Servono ${eur(costo)} in cassa`);
      G.cassa -= costo; G.oggi.costi.altro += costo - (modo === 'proprieta' ? o.prezzo : 0);
      const ae = aggiungiAereo(G, o.mod, modo, base, { eta: o.eta, ore: o.ore, prezzo: o.prezzo, leasing: o.leasing, consegna: G.ora + (cambia ? 9 : 5) * GIORNO, oreDaCheck: Math.round(rnd() * 300), cab });
      G.mercato = G.mercato.filter(x => x !== o);
      notizia(G, `Acquisito ${MOD[o.mod].nome} usato di ${o.eta} anni (${ae.marche})${cambia ? ', cabina rifatta' : ''}: consegna tra ${cambia ? 9 : 5} giorni.`, 'info');
      return ok('Affare fatto');
    },
    riconfigura(G, id, cab) {
      const ae = G.aerei.find(a => a.id === id), e = validaCabina(ae.modello, cab); if (e) return err(e);
      if (ae.lavori) return err('L’aereo ha già lavori programmati');
      const cambiati = CL.reduce((s, c) => s + Math.abs(cab[c] - ae.cab[c]), 0); if (!cambiati) return err('La configurazione è identica');
      const costo = 60000 + 1500 * cambiati;
      if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      if (ae.stato === 'consegna') { ae.cab = cab; paga(G, Math.round(costo / 2)); return ok(`Cabina modificata prima della consegna (${eur(costo / 2)})`); }
      const inizio = fineGiornataAereo(G, ae);
      ae.lavori = { tipo: 'cabina', inizio, fine: inizio + 72 * ORA, costo, cab };
      notizia(G, `${ae.marche}: riconfigurazione cabina dalle ${oraIn(inizio)}, 3 giorni di fermo, ${eur(costo)}.`, 'info');
      return ok('Lavori programmati: l’aereo resta a terra 3 giorni');
    },
    vendi(G, id) {
      const ae = G.aerei.find(a => a.id === id); if (!ae) return err('Aereo inesistente');
      if (ae.inVolo) return err('L’aereo è in volo: riprova quando è a terra');
      const incasso = ae.modo === 'proprieta' ? Math.round(ae.valore * 0.92) : -ae.leasing * 60;
      G.cassa += incasso; if (incasso < 0) G.oggi.costi.altro -= incasso;
      G.voli = G.voli.filter(v => !(v.ae === id && v.stato === 'prog'));
      G.aerei = G.aerei.filter(a => a !== ae); G._roster = null;
      notizia(G, ae.modo === 'proprieta' ? `${ae.marche} venduto per ${eur(incasso)}.` : `${ae.marche} restituito al locatore (penale ${eur(-incasso)}).`, 'info');
      return ok('Fatto');
    },
    apriBase(G, i) {
      if (G.basi.includes(i)) return err('È già una base');
      const costo = AP[i].slot ? 500000 : 300000; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo); G.basi.push(i); if (AP[i].slot) G.slot[i] = (G.slot[i] || 0) + 4;
      notizia(G, `Aperta la base di ${AP[i].citta} (${eur(costo)}): gli aerei possono pernottarci e puoi assumerci equipaggi.`, 'buona'); return ok('Base aperta');
    },
    chiudiBase(G, i) {
      if (G.basi.length < 2) return err('Serve almeno una base');
      if (G.aerei.some(a => a.stato !== 'venduto' && a.prog.giorni.some(g => g.scali[0] === i || g.scali.at(-1) === i))) return err('Qualche aereo pernotta ancora in questa base');
      if (G.aerei.some(a => a.stato !== 'venduto' && pianoCiclo(G, a).turni.some(t => t.base === i))) return err('Qualche turno di equipaggio parte ancora da questa base');
      if (G.equipaggi.some(e => e.base === i)) return err('Trasferisci o licenzia prima gli equipaggi della base');
      G.basi = G.basi.filter(b => b !== i); G.hub = G.hub.filter(b => b !== i); G._roster = null; return ok('Base chiusa');
    },
    apriHub(G, i) {
      if (!G.basi.includes(i)) return err('Un hub deve essere prima una base');
      if (G.hub.includes(i)) return err('È già un hub');
      if (G.cassa < D.HUB.costo) return err(`Servono ${eur(D.HUB.costo)}`);
      paga(G, D.HUB.costo); G.hub.push(i); vendite(G);
      notizia(G, `${AP[i].citta} diventa il tuo hub: i passeggeri possono prendere coincidenze tra i tuoi voli (attesa tra ${D.HUB.mct} e ${D.HUB.attesaMax} minuti).`, 'buona', true);
      controllaTraguardi(G); return ok('Hub attivato');
    },
    chiudiHub(G, i) { G.hub = G.hub.filter(b => b !== i); return ok('Hub chiuso: niente più coincidenze vendute qui'); },
    compraSlot(G, i, n) { const costo = AP[i].slotPrezzo * n; if (G.cassa < costo) return err(`Servono ${eur(costo)}`); G.cassa -= costo; G.slot[i] = (G.slot[i] || 0) + n; return ok(`Acquistati ${n} slot a ${i}`); },
    assumiEquipaggio(G, { base, tipo, piloti = 2, cabina = 4, urgente = false }) {
      if (!G.basi.includes(base)) return err('Si assume solo nelle basi');
      piloti = clamp(Math.round(piloti), 2, 3); cabina = clamp(Math.round(cabina), 1, 16);
      const costo = costoAssunzione({ piloti, cabina }, urgente); if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo, 'personale');
      const e = nuovoEquipaggio(G, { base, tipo, piloti, cabina, stato: 'formazione', pronto: G.ora + (urgente ? 2 : 10) * GIORNO, motivo: urgente ? 'assunzione urgente tramite agenzia' : 'nuova assunzione' });
      return ok(`Assunto l’equipaggio ${e.nome} (${tipo}): operativo tra ${urgente ? 2 : 10} giorni`);
    },
    stimaMancanti(G, urgente) { const p = pianoAssunzioni(G); return { n: p.length, costo: p.reduce((x, e) => x + costoAssunzione(e, urgente), 0), equipaggi: p }; },
    assumiMancanti(G, urgente = false) {
      const p = pianoAssunzioni(G); if (!p.length) return err('Tutti i turni hanno già un equipaggio (anche contando quelli in arrivo)');
      const costo = p.reduce((x, e) => x + costoAssunzione(e, urgente), 0); if (G.cassa < costo) return err(`Servono ${eur(costo)} per assumere ${p.length} equipaggi`);
      paga(G, costo, 'personale');
      for (const x of p) nuovoEquipaggio(G, { base: x.base, tipo: x.tipo, piloti: x.piloti, cabina: x.cabina, stato: 'formazione', pronto: G.ora + (urgente ? 2 : 10) * GIORNO, motivo: urgente ? 'assunzione urgente tramite agenzia' : 'nuova assunzione' });
      return ok(`Assunti ${p.length} equipaggi (${eur(costo)}): operativi tra ${urgente ? 2 : 10} giorni`);
    },
    licenziaEquipaggio(G, id) {
      const e = G.equipaggi.find(x => x.id === id); if (!e) return err('Equipaggio inesistente');
      const costo = pagaEquipaggio(e) * 60; paga(G, costo, 'personale');
      G.equipaggi = G.equipaggi.filter(x => x !== e); for (const k in G.fissi) if (G.fissi[k] === id) delete G.fissi[k];
      G.morale = Math.max(0, G.morale - 3); G._roster = null; return ok(`Equipaggio ${e.nome} licenziato (buonuscita ${eur(costo)})`);
    },
    trasferisciEquipaggio(G, id, base) {
      const e = G.equipaggi.find(x => x.id === id); if (!e || !G.basi.includes(base) || base === e.base) return err('Scegli un’altra base');
      const costo = 3000 * persone(e); if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo, 'personale'); const da = e.base; e.base = base; e.stato = 'formazione'; e.pronto = G.ora + 5 * GIORNO; e.motivo = `trasferito da ${da}`;
      for (const k in G.fissi) if (G.fissi[k] === id) delete G.fissi[k]; G._roster = null;
      return ok(`${e.nome} si trasferisce a ${base}: operativo tra 5 giorni`);
    },
    riqualificaEquipaggio(G, id, tipo) {
      const e = G.equipaggi.find(x => x.id === id); if (!e || e.tipo === tipo) return err('Scegli un’altra abilitazione');
      const costo = 35000 * e.piloti; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo, 'personale'); e.tipo = tipo; e.stato = 'formazione'; e.pronto = G.ora + 30 * GIORNO; e.motivo = `riqualificato su ${tipo}`;
      for (const k in G.fissi) if (G.fissi[k] === id) delete G.fissi[k]; G._roster = null;
      return ok(`${e.nome} in riqualifica su ${tipo} per 30 giorni`);
    },
    // blocca un equipaggio su un turno (crewId null = torna all'assegnazione automatica)
    fissaEquipaggio(G, turno, crewId) { G.fissi ||= {}; if (crewId) G.fissi[turno] = crewId; else delete G.fissi[turno]; G._roster = null; const r = roster(G); return r.assegna[turno] === crewId || !crewId ? ok(crewId ? 'Equipaggio assegnato al turno' : 'Assegnazione automatica') : err('Quell’equipaggio non può fare il turno: riposo, ore o abilitazione non lo permettono'); },
    avviaCampagna(G, { canale, ambito, obiettivo, budget, giorni }) {
      const M = D.MARKETING[canale]; if (!M) return err('Canale sconosciuto');
      if (!M.ambiti.includes(ambito)) return err('Copertura non disponibile per questo canale');
      budget = Math.round(budget);
      if (!(budget >= M.min && budget <= M.max)) return err(`Budget giornaliero tra ${eur(M.min)} e ${eur(M.max)}`);
      if ((ambito === 'rotta' || ambito === 'citta') && !obiettivo) return err('Scegli dove fare la campagna');
      const serve = M.avvio + budget * 3; if (G.cassa < serve) return err(`Servono almeno ${eur(serve)} in cassa (produzione + 3 giorni)`);
      if (M.avvio) paga(G, M.avvio, 'marketing');
      const etichetta = ambito === 'rotta' ? obiettivo.replace('-', '–') : ambito === 'citta' ? obiettivo : ambito === 'rete' ? 'su tutta la rete' : 'nazionale';
      G.campagne.push({ id: 'c' + (G.seq++), canale, ambito, obiettivo: obiettivo || null, etichetta, budget, inizio: G.ora, fine: giorni ? G.ora + giorni * GIORNO : null, forza: 0, attiva: true, speso: M.avvio });
      vendite(G); traguardo(G, 'marketing');
      notizia(G, `Partita la campagna ${M.nome.toLowerCase()} ${etichetta}: ${eur(budget)} al giorno${giorni ? ' per ' + giorni + ' giorni' : ''}.`, 'buona');
      return ok('Campagna avviata');
    },
    fermaCampagna(G, id) { const c = (G.campagne || []).find(x => x.id === id); if (!c || !c.attiva) return err('Campagna non attiva'); c.attiva = false; c.fine = G.ora; return ok('Campagna fermata: l’effetto svanirà gradualmente'); },
    premio(G) { const costo = totPersonale(G) * 1500; if (G.cassa < costo) return err(`Servono ${eur(costo)}`); paga(G, costo, 'personale'); G.morale = Math.min(100, G.morale + 12); return ok(`Premio distribuito (${eur(costo)}): morale +12`); },
    limitePrestito(G) { let f = 0; for (const ae of G.aerei) if (ae.modo === 'proprieta') f += ae.valore; return Math.max(0, Math.round((0.6 * f + 3e6 + Math.max(0, G.stat.utile) * 0.3 - debitoTot(G)) / 1e5) * 1e5); },
    tassoPrestito(G) { let f = 0; for (const ae of G.aerei) if (ae.modo === 'proprieta') f += ae.valore; return 0.05 + 0.04 * debitoTot(G) / (0.6 * f + 3e6) + (G.reputazione < 40 ? 0.02 : 0); },
    prestito(G, importo) {
      if (importo <= 0 || importo > A.limitePrestito(G)) return err('Importo oltre il limite concesso dalla banca');
      const tasso = A.tassoPrestito(G); G.debiti.push({ id: 'd' + (G.seq++), capitale: importo, tasso, rata: Math.round(importo / (5 * 365)) }); G.cassa += importo;
      return ok(`Prestito di ${eur(importo)} al ${(tasso * 100).toFixed(1)}% in 5 anni`);
    },
    rimborsa(G, id, importo) {
      const d = G.debiti.find(x => x.id === id); importo = Math.min(importo, d.capitale, Math.max(0, G.cassa)); if (importo <= 0) return err('Cassa insufficiente');
      d.capitale -= importo; G.cassa -= importo; G.debiti = G.debiti.filter(x => x.capitale > 1); return ok(`Rimborsati ${eur(importo)}`);
    }
  };

  return { roster, copertura, pianoAssunzioni, sistemaTurni, equipaggioDi, pagaEquipaggio, costoAssunzione, persone, MAX_TURNI, MAX_ORE, GIORNI_SETT, giornoSett, normalizza, settimanaVuota, impostaFuso, oraIn, oraLocaleMin, oraLocaleT, loc, multClasse, lungoRaggio, spazioPosto, pianoCiclo, continentiServiti, VERSIONE, MIN, ORA, GIORNO, CL, AP, MOD, CLS, km, durata, prezzoRif, chiave, chiaveCitta, dataDi, mezzanotte, tsDi, giornoDopo, minDaOra, oraDaMin, zero, somma, posti, cabMin, spazioUsato, cabinaStandard, validaCabina, quoteClassi, prezziRotta, legsGiorno, tratteDi, indiceCiclo, mediaCiclo, validaProgramma, salvaProgramma, partenzePerScalo, nuovaPartita, migra, avanza, analisiMercato, domandaClassi, spinta, stimaMarketing, rivaliSu, coincidenze,  costiFissi, valoreCompagnia, debitoTot, obiettivi, pianificaCheck, totPersonale, vendite, venduti, rotteInEsercizio, A, eur };
})();
if (typeof module !== 'undefined') module.exports = SIM;
