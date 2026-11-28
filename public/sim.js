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
  let rnd = Math.random;
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
      prog: settimanaVuota(base, MOD[modello].lungo ? 90 : MOD[modello].tipo === 'ATR' ? 30 : 40), lavori: null, autoCheck: !G.auto || G.auto.ispezioni !== false
    };
    G.aerei.push(ae); completaAereo(G, ae, !opz.eta); return ae;
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
    G._roster = null; rigeneraAereo(G, ae); autoAssumi(G);
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
      if (ae.lavori && ['C', 'D', 'ammodernamento'].includes(ae.lavori.tipo) && dep >= ae.lavori.inizio - 2 * ORA && dep < ae.lavori.fine) return;
      if (!dirittiOk(G, l.da, l.a)) return; // senza diritti di traffico il volo non si opera
      if (eventoAttivo(G, 'chiusura', dep, [l.da, l.a])) return;
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
  const pagaEquipaggio = e => (D.RUOLI.CMD.paga + D.RUOLI.FO.paga * (e.piloti - 1) + D.RUOLI.CC.paga + D.RUOLI.ADV.paga * (e.cabina - 1)) * fattorePaga(e);
  const persone = e => e.piloti + e.cabina;
  const costoAssunzione = (e, urgente) => Math.round((12000 * e.piloti * INDICE_PILOTI + 1500 * e.cabina) * (urgente ? 2.5 : 1));
  function nuovoEquipaggio(G, { base, tipo, piloti = 2, cabina = 4, stato = 'attivo', pronto = 0, motivo = '' }) {
    G.seqEq ||= {}; const n = G.seqEq[base] = (G.seqEq[base] || 0) + 1;
    const e = { id: 'e' + (G.seq++), nome: `${base}-${n}`, base, tipo, piloti, cabina, capo: COGNOMI[Math.floor(rnd() * COGNOMI.length)], stato, pronto, motivo };
    completaEquipaggio(G, e, false); G.equipaggi.push(e); G._roster = null; return e;
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
    const crews = G.equipaggi.filter(e => !e.riserva && (e.stato === 'attivo' || (opz.futuri && e.stato === 'formazione'))).concat(opz.extra || []);
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
    const dow = dowSegmenti(da, a, giorno);
    // i viaggi lunghi sono meno frequenti; tra paesi diversi e lontani ancora meno
    const k = km(da, a); let dist = k <= 1500 ? 1 : (1500 / k) ** 0.5; if (A.paese !== B.paese && k > 2500) dist *= 0.85;
    // tratte medie (400–4000 km): meno viaggiatori, altrimenti ai prezzi di riferimento gli aerei sarebbero sempre pieni
    dist *= k <= 400 ? 1 : k <= 1500 ? (400 / k) ** 0.6 : k < 4000 ? 0.452 + 0.548 * (k - 1500) / 2500 : 1;
    let ev = 1;
    for (const e of G.eventi) if (e.tipo === 'domanda' && (e.citta === A.citta || e.citta === B.citta) && e.inizio < giorno + GIORNO && e.fine > giorno) ev *= e.fattore;
    return 0.25 * Math.sqrt(A.pop * B.pop) * stag * dow * ev * dist * economiaDi(G, da, a) * fattoreRotta(G, da, a) * domandaCrisi(G, da, a);
  }
  function rivaliSu(G, da, a) {
    const kc = chiaveCitta(da, a), out = [];
    for (const r of G.rivali) for (const [k, x] of Object.entries(r.rotte)) {
      const [p, q] = k.split('-'); if (chiaveCitta(p, q) === kc && !(G.jv && G.jv.some(j => j.riv === r.id && j.k === k))) out.push({ riv: r, k, freq: x.freq, prezzo: x.prezzo, guerra: !!x.guerraFino });
    }
    return out;
  }
  const maturitaRotta = (G, da, a, giorno) => { const r = G.rotte[chiave(da, a)]; return r ? clamp(0.6 + (giorno - r.aperta) / (150 * GIORNO), 0.6, 1) : 1; };
  // Quanti passeggeri sceglie il giocatore in una direzione in un giorno (penalita < 1 per i viaggi in coincidenza)
  function analisiMercato(G, da, a, giorno, freq, pY, penalita = 1, opz = {}) {
    const k = km(da, a), ref = prezzoRif(k), Sg = G.strategia ? strategiaRotta(G, da, a) : null, M = G.mod || {};
    let mercato = domandaBase(G, da, a, giorno);
    // senza studio di mercato le stime mostrate al giocatore usano la domanda "generica" della coppia di città
    if (opz.stima && !studiato(G, da, a)) mercato /= fattoreRotta(G, da, a);
    if (Sg) mercato *= Sg.domanda * (Sg.corto && k < 900 ? Sg.corto : Sg.lungo && k > 2500 ? Sg.lungo : 1);
    if (M.sito) mercato *= 1.03;
    { const rr = G.rotte[chiave(da, a)]; if (rr && rr.passaparola > G.ora) mercato *= 1.03; }
    mercato *= 1 + 0.015 * abil(G, 'comm');
    if (G.globale) mercato *= 1.04 + (AP[da].continente !== AP[a].continente ? 0.04 : 0);
    if (G.alleanze) for (const [rid, al] of Object.entries(G.alleanze)) if (al.livello === 'codeshare') {
      const P = G.rivali.find(x => x.id === rid), cA = AP[da].citta, cB = AP[a].citta;
      if (P && Object.keys(P.rotte).some(k => k.split('-').some(i => AP[i].citta === cA || AP[i].citta === cB))) { mercato *= 1.06; break; }
    }
    const val = G.bordo ? valoreProdotto(G, k) : null, pYe = val ? pY / val.Y : pY;
    const sp = opz.senzaMarketing ? { tot: 0, bus: 0 } : spinta(G, da, a, opz.escludi, opz.extra);
    const riv = rivaliSu(G, da, a), altri = altriMezzi(da, a, k) * (G.treni && G.treni.includes(chiaveCitta(da, a)) ? 2.5 : 1);
    const attrP = freq > 0 ? repF(repRotta(G, da, a)) * (ref / pYe) ** 1.6 * Math.sqrt(freq) * penalita * (1 + sp.tot) * fattoreMarchio(G, da, a) * notoMarchio(G, da, a) : 0;
    let tot = attrP + altri;
    const rivali = riv.map(x => { const at = repF(x.riv.rep) * (1 / x.prezzo) ** 1.6 * Math.sqrt(x.freq) * (x.riv.alleato ? 1.05 : 1) * (x.riv.globale ? 1.03 : 1); tot += at; return { ...x, at }; });
    rivali.forEach(x => x.quota = x.at / tot);
    const quota = attrP / tot, maturita = maturitaRotta(G, da, a, giorno);
    const pax = mercato * quota * clamp((ref / pYe) ** (1.5 * (Sg ? Sg.elasticita || 1 : 1)), 0.15, 1.8) * maturita * (1 + 0.3 * sp.tot);
    const quote = quoteClassi(da, a);
    if (M.fedelta) mercato *= 1 + 0.03 * Math.max(0.4, generosita(G));
    if (Sg || M.fedelta) { const f = M.fedelta ? 1 + 0.12 * Math.max(0.4, generosita(G)) : 1; quote.J *= (Sg ? Sg.quote.J : 1) * f; quote.W *= (Sg ? Sg.quote.W : 1) * f; quote.Y = Math.max(0.05, 1 - quote.J - quote.W); }
    if (G.saf) { quote.J *= 1 + G.saf * 0.3; quote.W *= 1 + G.saf * 0.2; quote.Y = Math.max(0.05, 1 - quote.J - quote.W); }
    if (sp.bus) { quote.J *= 1 + 1.5 * sp.bus; quote.W *= 1 + 1.5 * sp.bus; quote.Y = 1 - quote.J - quote.W; }
    return { mercato, quota, pax, ref, km: k, rivali, altri: altri / tot, maturita, quote, spinta: sp, val, studiato: G.studi ? studiato(G, da, a) : true };
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
  function domandaClassi(pax, quote, prezzi, ref, k = 0, val = null) {
    const out = {};
    for (const c of CL) out[c] = pax * quote[c] * (c === 'Y' ? 1 : clamp((ref * multClasse(c, k) * (val ? val[c] / val.Y : 1) / prezzi['p' + c]) ** CLS[c].el, 0.2, 2.5));
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
    const futuri = G.voli.filter(v => v.stato === 'prog' && v.dep > G.ora && aeMap.get(v.ae) && dirittiOk(G, v.da, v.a));
    const oggi = mezzanotte(G.ora);
    // 1) passeggeri locali, raggruppati per giorno, città e direzione
    const gruppi = new Map();
    for (const v of futuri) { const k = mezzanotte(v.dep) + '|' + AP[v.da].citta + '>' + AP[v.a].citta; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(v); }
    for (const lista of gruppi.values()) {
      const v0 = lista[0], g = mezzanotte(v0.dep), prezzi = lista.map(v => prezziGiorno(G, v.da, v.a, v.dep));
      const pm = { pJ: 0, pW: 0, pY: 0 }; for (const p of prezzi) for (const c of CL) pm['p' + c] += p['p' + c] / lista.length;
      const am = analisiMercato(G, v0.da, v0.a, g, lista.length, pm.pY);
      if (g === oggi || g === giornoDopo(oggi)) for (const v of lista) { const r = G.rotte[chiave(v.da, v.a)]; if (r) { r.quota = am.quota; r.rivali = am.rivali.length; } }
      const dom = domandaClassi(am.pax, am.quote, pm, am.ref, am.km, am.val);
      const mix = mixTariffe(G, chiave(v0.da, v0.a), v0.da, v0.a), aff = mix.seg.affari;
      const pesi = lista.map(v => { const m = oraLocaleMin((v.dep - g) / MIN, v.da); return (1 - aff) * pesoOra(m) + aff * 1.3 * pesoAffari(m); }), tot = pesi.reduce((s, x) => s + x, 0);
      // senza un volo comodo la mattina o la sera parte dei clienti d'affari sceglie altro
      const copertura = Math.max(...lista.map(v => pesoAffari(oraLocaleMin((v.dep - g) / MIN, v.da)))), fDom = mix.domanda * (1 - aff * 0.25 * (1 - copertura));
      const T = G.tariffe || {}, DIN = D.DINAMICO[T.dinamico || 'fisso'], ob = 1 + (T.overbooking || 0);
      const resa = (T.famiglie ? 1.05 : 1) * ((G.mod || {}).rm ? 1.03 : 1), perdita = 1 - DIN.perdita - (T.famiglie ? 0.01 : 0);
      lista.forEach((v, i) => {
        const ae = aeMap.get(v.ae), p = prezzi[i], w = pesi[i] / tot, d = {}, cab = {}, capOB = {};
        for (const c of CL) { d[c] = dom[c] * w * (pm['p' + c] / p['p' + c]) * perdita * fDom; capOB[c] = Math.floor(ae.cab[c] * ob); cab[c] = capOB[c] - v.t[c]; }
        v.att = vendiClassi(d, capOB, 1);
        const tgt = vendiClassi(d, cab, progressoVendite((v.dep - G.ora) / ORA));
        for (const c of CL) if (tgt[c] > v.v[c]) { v.inc[c] += (tgt[c] - v.v[c]) * p['p' + c] * resa * mix.resa * rialzoDinamico(G, (v.v[c] + v.t[c]) / Math.max(1, ae.cab[c])); v.v[c] = tgt[c]; }
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
          const dom = domandaClassi(am.pax / am.maturita * mat, am.quote, tariffe, am.ref, am.km, am.val);
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
        const am = analisiMercato(G, v0.da, v0.a, domani, lista.length, pm.pY, 1, o), dom = domandaClassi(am.pax, am.quote, pm, am.ref, am.km, am.val);
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
    let ae = G.aerei.find(x => x.id === v.ae);
    let motivo = null, straord = false, attesaRip = 0;
    const chiusa = eventoAttivo(G, 'chiusura', v.dep, [v.da, v.a]);
    const revScaduta = x => G.ora > (x.prossimaC ?? Infinity) + 60 * GIORNO || G.ora > (x.prossimaD ?? Infinity) + 60 * GIORNO;
    if (ae && !chiusa && ae.stato === 'guasto' && ae.fino - v.dep <= 3 * ORA && ae.pos === v.da) { attesaRip = Math.round((ae.fino - v.dep) / MIN) + 30; ae.stato = 'attivo'; registraIrops(G, `${v.num}: si aspetta la riparazione di ${ae.marche}, partenza ritardata di ${attesaRip} minuti invece di cancellare.`); }
    if (ae && !chiusa && (ae.stato === 'guasto' || ae.stato === 'manutenzione' || revScaduta(ae))) { const x = aereoDiRiserva(G, v, ae); if (x) { registraIrops(G, `${x.marche} sostituisce ${ae.marche} sul ${v.num} ${v.da}→${v.a}.`); v.ae = x.id; ae = x; } }
    if (!ae || ae.stato === 'venduto') motivo = 'Aereo non più in flotta';
    else if (chiusa) { motivo = chiusa.testo; straord = true; }
    else if (!dirittiOk(G, v.da, v.a)) { motivo = 'In attesa dei diritti di traffico'; straord = true; }
    else if (ae.stato === 'manutenzione') motivo = ae.lavori?.tipo === 'cabina' ? 'Aereo in riconfigurazione cabina' : 'Aereo in manutenzione';
    else if (ae.stato === 'guasto') motivo = 'Aereo fermo per guasto';
    else if (ae.stato === 'consegna') motivo = 'Aereo non ancora consegnato';
    else if (ae.oreDaCheck > 700) motivo = 'Ispezione scaduta: aereo fermo per legge';
    else if (revScaduta(ae)) motivo = 'Revisione obbligatoria scaduta: aereo fermo per legge';
    else if (ae.pos !== v.da) motivo = `Aereo non presente a ${v.da}`;
    else {
      const usura = ae.oreDaCheck / 600, titolare = equipaggioDi(G, v);
      let eq = titolare, motivoEq = 'Nessun equipaggio assegnato al turno';
      if (titolare && assente(titolare, v.dep)) { eq = riservaPer(G, titolare, v); motivoEq = `Equipaggio ${titolare.nome} assente (${titolare.assenza || 'malattia'}) e nessuna riserva libera`; }
      const paese = AP[v.da].paese === 'IT' || AP[v.a].paese === 'IT', meteo = eventoAttivo(G, 'meteo', v.dep, [v.da, v.a]), chiusura = eventoAttivo(G, 'chiusura', v.dep, [v.da, v.a]);
      if (chiusura) { motivo = chiusura.testo; straord = true; }
      else if (paese && eventoAttivo(G, 'sciopero-atc', v.dep) && rnd() < 0.6) { motivo = 'Sciopero dei controllori di volo'; straord = true; }
      else if (eventoAttivo(G, 'sciopero', v.dep) && rnd() < 0.45) motivo = 'Sciopero del personale';
      else if (!eq) motivo = motivoEq;
      else if (meteo && meteo.forza >= 2 && rnd() < 0.2) { motivo = meteo.testo; straord = true; }
      else if (rnd() < 0.0025 * (1 + ae.eta / 12) * (usura > 0.85 ? 1 + (usura - 0.85) * 25 : 1) * ((G.mod || {}).predittiva ? 0.6 : 1) * (G.manutenzioneInterna ? 0.85 : 1)) {
        const lontano = !G.basi.includes(v.da), costo = Math.round(((15000 + rnd() * 50000) * MOD[ae.modello].peso / 70 + (lontano ? 20000 : 0)) * franchigia(G)), ore = Math.round((6 + rnd() * 40) * (lontano ? 1.5 : 1));
        ae.stato = 'guasto'; ae.fino = G.ora + ore * ORA; G.cassa -= costo; G.oggi.costi.manutenzione += costo;
        notizia(G, `Guasto tecnico su ${ae.marche} a ${v.da}${lontano ? ', lontano dalle tue basi: il pezzo di ricambio va spedito' : ''}: fermo per circa ${ore} ore, ${eur(costo)} a tuo carico.`, 'cattiva', true);
        motivo = 'Guasto tecnico';
      }
      if (!motivo) {
        const prop = ae.arrPrevista ? Math.max(0, (ae.arrPrevista + 25 * MIN - v.dep) / MIN) : 0;
        const fatica = Math.max(0, ((roster(G).carico.get(eq.id)?.min || 0) / 60 / MAX_ORE) - 0.8), proprio = (G.handlingProprio || []).includes(v.da), dev = eventoAttivo(G, 'deviazione', v.dep, [v.da, v.a]);
        const hDep = oraLocaleMin((v.dep - mezzanotte(v.dep)) / MIN, v.da) / 60, punta = AP[v.da].slot && ((hDep >= 7 && hDep < 9) || (hDep >= 17 && hDep < 20)) ? 0.06 : 0;
        const p = (0.16 + punta + (ae.prog.turn < 35 ? 0.12 : 0) + usura * 0.08 + (meteo ? 0.45 : 0)) * ((G.mod || {}).puntualita ? 0.75 : 1) * (1 + 2 * fatica) * (proprio ? 0.85 : 1) * (1 - 0.07 * abil(G, 'coo'));
        const own = rnd() < p ? -Math.log(rnd()) * (meteo ? 45 : 20) : 0;
        v.rit = Math.round(Math.max(prop, own, attesaRip) + (dev ? 40 : 0) + (meteo && meteo.neve ? 15 : 0));
        if (meteo && meteo.neve) v.ghiaccio = true; if (dev) v.deviato = true;
        // uccelli: rientro e controllo dell'aereo
        if (rnd() < 0.0008 * fImprevisti(G)) { v.rit += 90; const c0 = Math.round(15000 * franchigia(G)); G.cassa -= c0; G.oggi.costi.manutenzione += c0; notizia(G, `Impatto con uno stormo di uccelli in decollo da ${v.da}: controlli al motore, ${v.rit} minuti di ritardo.`, 'evento'); }
        // coprifuoco notturno negli aeroporti congestionati
        const locDep = oraLocaleMin(((v.dep + v.rit * MIN) - mezzanotte(v.dep)) / MIN, v.da);
        if (AP[v.da].slot && v.rit > 0 && locDep >= 0 && locDep < 330 && !(oraLocaleMin((v.dep - mezzanotte(v.dep)) / MIN, v.da) < 330)) { cancella(G, v, `Coprifuoco notturno a ${v.da}: ritardo troppo grande per partire`, false); return; }
        v.depEff = v.dep + v.rit * MIN; v.arrEff = v.arr + v.rit * MIN + Math.round((rnd() - 0.5) * 10) * MIN;
        v.stato = v.rit > 0 ? 'rit' : 'volo';
        ae.arrPrevista = v.arrEff; ae.pos = v.a; ae.inVolo = v.id; v.eqId = eq.id; v.equip = eq.nome + (eq !== titolare ? ' (riserva)' : '');
        return;
      }
    }
    cancella(G, v, motivo, straord);
  }
  const statRotta = (o, k) => (o.rotte[k] ||= { voli: 0, pax: 0, posti: 0, ricavi: 0, costi: 0, canc: 0, paxC: zero(), ricaviC: zero(), postiC: zero(), transito: 0 });
  function cancella(G, v, motivo, straord) {
    v.stato = 'canc'; v.motivo = motivo;
    const pax = venduti(v), k = km(v.da, v.a);
    const spostati = riproteggi(G, v), restanti = pax - spostati;
    const rimborso = Math.round(restanti * ((straord ? 0 : (k <= 1500 ? 250 : k <= 3500 ? 400 : 600) * 0.45) + 15) + spostati * 40);
    G.cassa -= rimborso; G.oggi.costi.rimborsi += rimborso; G.oggi.canc++; if (straord) G.oggi.cancEsterne = (G.oggi.cancEsterne || 0) + 1;
    const r = statRotta(G.oggi, chiave(v.da, v.a)); r.canc++; r.costi += rimborso;
    registra(G, v, { pax, ricavi: 0, costi: rimborso, dettaglio: { rimborsi: rimborso }, ricaviC: zero() });
  }
  function arrivo(G, v) {
    const ae = G.aerei.find(x => x.id === v.ae), m = MOD[ae.modello], k = km(v.da, v.a);
    let pax = venduti(v); const np = posti(ae), h = (v.arrEff - v.depEff) / ORA, Sg = STR(G), M = G.mod || {};
    // overbooking: qualcuno non si presenta (il biglietto resta pagato); se si presentano in troppi, si risarcisce
    let negati = 0;
    if ((G.tariffe || {}).overbooking > 0) {
      const ns = Math.round(pax * 0.06 * (0.6 + 0.8 * rnd())); pax = Math.max(0, pax - ns); negati = Math.max(0, pax - np); pax -= negati;
      if (negati) { G.oggi.negati = (G.oggi.negati || 0) + negati; G.reputazione = Math.max(0, G.reputazione - Math.min(1.5, negati * 0.08)); }
    }
    const paxC = { J: Math.min(ae.cab.J, v.v.J + v.t.J), W: Math.min(ae.cab.W, v.v.W + v.t.W), Y: 0 }; paxC.Y = Math.max(0, pax - paxC.J - paxC.W);
    const bordo = contoBordo(G, paxC, h);
    const c = {
      carburante: Math.round(m.consumo * h * (1 + 0.006 * ae.eta) * (ae.consumoF || 1) * (G.copertura ? G.copertura.prezzo : G.carburante) * (1 + 1.5 * (G.saf || 0)) * cambioF(G) * (v.deviato ? 1.35 : 1)),
      co2: Math.round(m.consumo * h * 3.16 / 1000 * (G.co2 || 0) * QUOTA_CO2(v.da, v.a) * (1 - 0.8 * (G.saf || 0))),
      tasse: Math.round(pax * AP[v.da].tassa * (1 - scontoAeroporto(G, v.da)) + Math.max(np * 2, m.peso * 8) * (AP[v.da].slot && (() => { const h0 = oraLocaleMin((v.depEff - mezzanotte(v.depEff)) / MIN, v.da) / 60; return h0 >= 23 || h0 < 6; })() ? 1.25 : 1)),
      handling: Math.round((250 + pax * 5) * Sg.handling * (M.app ? 0.85 : 1) * ((G.handlingProprio || []).includes(v.da) ? 0.4 : 1) + (v.ghiaccio ? 1500 * MOD[ae.modello].peso / 70 : 0)),
      navigazione: Math.round(k * 0.6 * Math.sqrt(m.peso / 70)),
      manutenzione: Math.round(m.manut * h * (1 + ae.eta * 0.03)),
      servizio: bordo.costo,
      negati: negati * (k < 1500 ? 250 : 400),
      distribuzione: Math.round(CL.reduce((x, c) => x + v.inc[c], 0) * canali(G).costo),
      rimborsi: (v.rit >= 180 ? Math.round(pax * (k <= 1500 ? 250 : k <= 3500 ? 400 : 600) * 0.45) : 0) + (v.rit >= 120 ? pax * 15 : 0),
      equipaggi: Math.round((v.fineTurno ? (v.piloti + cabMin(ae)) * 150 * (BENESSERE[G.benessere || 'nessuno'].alloggi ? 0.7 : 1) : 0) + (v.posizionato ? (v.piloti + cabMin(ae)) * 250 : 0)),
      soste: v.sostaFuori ? Math.round(m.peso * 15) : 0
    };
    { const Mb = marchioDi(G, chiave(v.da, v.a)); if (Mb) { const T = TIPI_MARCHIO[Mb.tipo]; c.handling = Math.round(c.handling * T.handling); c.servizio = Math.round(c.servizio * T.servizio); c.distribuzione = Math.round(c.distribuzione * T.distribuzione); bordo.extra = Math.round(bordo.extra * T.extra); } }
    c.manutenzione = Math.round(c.manutenzione * fattoreSocieta(G, 'manutenzione')); c.handling = Math.round(c.handling * fattoreSocieta(G, 'handling')); c.servizio = Math.round(c.servizio * fattoreSocieta(G, 'servizio'));
    c.tasse += Math.round(pax * ((G.tassePax || {})[AP[v.da].paese] || 0));
    let costi = Object.values(c).reduce((s, x) => s + x, 0); const ricaviC = {}; let ricavi = 0;
    for (const x of CL) { ricaviC[x] = Math.round(v.inc[x]); ricavi += ricaviC[x]; }
    ricavi += bordo.extra; G.oggi.ricaviExtra = (G.oggi.ricaviExtra || 0) + bordo.extra;
    G.oggi.co2 = (G.oggi.co2 || 0) + m.consumo * h * 3.16 / 1000 * (1 - 0.8 * (G.saf || 0));
    const contr = contributoRotta(G, chiave(v.da, v.a)); if (contr) { ricavi += contr; G.oggi.contributi = (G.oggi.contributi || 0) + contr; const acc = G.accordi.find(x => x.tipo === 'regione' && x.k === chiave(v.da, v.a)); if (acc) acc.incassato += contr; }
    { const sc = scontoAeroporto(G, v.da); if (sc) { const acc = G.accordi.find(x => x.tipo === 'aeroporto' && x.iata === v.da); if (acc) acc.risparmiato += Math.round(pax * AP[v.da].tassa * sc); } }
    // passeggeri in coincidenza che perdono il volo successivo: riprotezione e assistenza
    for (const [id2, cnt] of Object.entries(v.conn || {})) { const f2 = G.voli.find(x => String(x.id) === id2), n = somma(cnt); if (!f2 || !n || f2.stato !== 'prog' || f2.dep >= v.arrEff + 25 * MIN) continue; const cst = n * 120; c.rimborsi = (c.rimborsi || 0) + cst; costi += cst; G.oggi.persi = (G.oggi.persi || 0) + n; if (n >= 10) notizia(G, `${n} passeggeri del ${v.num} hanno perso la coincidenza a ${v.a}: riprotetti sul volo successivo.`, 'cattiva'); }
    if (jvSu(G, chiave(v.da, v.a))) { c.alleanze = Math.round(ricavi * QUOTA_JV); costi += c.alleanze; }
    v.stato = 'arrivato'; ae.ore += h; ae.cicli++; ae.oreDaCheck += h; ae.inVolo = null;
    { const e = G.equipaggi.find(x => x.id === v.eqId); if (e) { e.ore = (e.ore || 0) + h; e.oreAnno = (e.oreAnno || 0) + h; if (e.oreAnno > 900 && !assente(e, G.ora)) { e.assenteFino = Date.UTC(loc(G.ora).getUTCFullYear() + 1, 0, 1) - FUSO * ORA; e.assenza = 'limite di 900 ore annue'; notizia(G, `L’equipaggio ${e.nome} ha raggiunto il limite di 900 ore di volo dell’anno: a terra fino a gennaio.`, 'cattiva', true); } } }
    // imprevisti con i passeggeri
    if (pax && rnd() < 0.002 * fImprevisti(G)) { const x = rnd(); let cst = 0, t = '';
      if (x < 0.35) { cst = 25000; t = `Emergenza medica a bordo del ${v.num}: il comandante ha fatto scalo tecnico, il passeggero sta bene.`; }
      else if (x < 0.55) { cst = 8000; t = `Passeggero violento sul ${v.num}: è intervenuta la polizia all’arrivo a ${v.a}.`; }
      else { cst = 20 * 150; t = `Bagagli smarriti sul ${v.num}: una ventina di valigie rimaste a ${v.da}.`; G.reputazione = Math.max(0, G.reputazione - 0.2); }
      G.cassa -= cst; G.oggi.costi.altro = (G.oggi.costi.altro || 0) + cst; notizia(G, t, 'evento'); }
    G.cassa += ricavi - costi;
    const o = G.oggi;
    o.ask = (o.ask || 0) + np * k; o.rpk = (o.rpk || 0) + pax * k;
    o.voli++; o.pax += pax; o.posti += np; o.ricavi += ricavi; if (v.rit <= 15) o.puntuali++;
    for (const x of CL) { o.paxC[x] += v.v[x] + v.t[x]; o.ricaviC[x] += ricaviC[x]; }
    for (const x in c) o.costi[x] = (o.costi[x] || 0) + c[x];
    // i passeggeri in transito si contano una volta sola, sul volo che arriva all'hub
    if (G.hub.includes(v.a)) { let n = 0; for (const x of Object.values(v.conn)) n += somma(x); o.transito += n; (o.hub[v.a] ||= { transito: 0, ricavi: 0 }).transito += n; }
    o.ricaviTransito += v.incT;
    const hubRic = [v.da, v.a].find(i => G.hub.includes(i)); if (hubRic && v.incT) (o.hub[hubRic] ||= { transito: 0, ricavi: 0 }).ricavi += v.incT;
    const r = statRotta(o, chiave(v.da, v.a));
    r.voli++; r.pax += pax; r.posti += np; r.ricavi += ricavi; r.costi += costi; r.transito += somma(v.t); r.extra = (r.extra || 0) + bordo.extra;
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
          else if (L.tipo === 'C' || L.tipo === 'D') { ae['prossima' + L.tipo] = G.ora + REVISIONI[L.tipo].ogni * GIORNO; if (L.tipo === 'D') ae.prossimaC = Math.max(ae.prossimaC, G.ora + 730 * GIORNO); ae['avviso' + L.tipo] = false; ae.oreDaCheck = 0; rigeneraAereo(G, ae); notizia(G, `${ae.marche}: ${REVISIONI[L.tipo].nome.replace('Revisione', 'revisione')} completata (${eur(L.costo)}). Torna in servizio.`, 'buona'); }
          else if (L.tipo === 'ammodernamento') { ae.consumoF = (ae.consumoF || 1) * L.fattore; ae.ammodernamenti.push(L.cosa); if (ae.modo === 'proprieta') ae.valore += L.costo * 0.6; rigeneraAereo(G, ae); notizia(G, `${ae.marche}: ${AMMODERNAMENTI[L.cosa].nome.toLowerCase()} montati. Consumi −${Math.round((1 - L.fattore) * 100)}%.`, 'buona'); }
          else { ae.cab = L.cab; G._roster = null; rigeneraAereo(G, ae); notizia(G, `${ae.marche}: nuova cabina pronta (${L.cab.J} Business · ${L.cab.W} Premium · ${L.cab.Y} Economy).`, 'buona'); }
        }
      }
      if (ae.stato === 'guasto' && G.ora >= ae.fino) { ae.stato = 'attivo'; notizia(G, `${ae.marche} è di nuovo operativo.`, 'buona'); }
      if (ae.stato === 'consegna' && G.ora >= ae.fino) {
        ae.stato = 'attivo'; ae.pos = ae.prog.giorni[indiceCiclo(ae.prog, mezzanotte(G.ora))].scali[0]; G._roster = null;
        if (ae.saldo) { G.cassa -= ae.saldo; flusso(G, 'investimenti', -ae.saldo); notizia(G, `Pagato il saldo di ${eur(ae.saldo)} per ${ae.marche}.`, 'info'); delete ae.saldo; }
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
    ae.lavori = { tipo: 'check', inizio, fine: inizio + (G.manutenzioneInterna ? 6 : 8) * ORA, costo: Math.round(MOD[ae.modello].check * (1 + ae.eta * 0.02) * ((G.mod || {}).hangar ? 0.7 : 1) * (G.manutenzioneInterna ? 0.65 : 1)) };
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
    if (ora === 8 && giornoSett(G.ora) === 0 && G.direzione) convocaRiunione(G);
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
      if (ae.modo === 'leasing' && ae.stato !== 'consegna') c.leasing += ae.leasing * cambioF(G);
      if (ae.stato !== 'consegna') c.assicurazione += (ae.modo === 'proprieta' ? ae.valore * 0.00003 : MOD[ae.modello].prezzo * 0.00001) * ASSICURAZIONI[G.assicurazione || 'standard'].premio;
    }
    c.personale = G.equipaggi.reduce((x, e) => x + pagaEquipaggio(e), 0) * G.stipendio * (G.lavoro ? G.lavoro.contratto : 1) + (G.lavoro && G.lavoro.scuola ? 4000 : 0);
    if (G.cassaIntegrazione) c.personale *= 0.75;
    c.personale *= 1 - quotaPersonaleMarchi(G);
    c.personale += totPersonale(G) * BENESSERE[G.benessere || 'nessuno'].costo;
    if (G.manutenzioneInterna) c.manutenzione = 3000 + 700 * flottaAttiva(G).length;
    for (const b of G.handlingProprio || []) c.basi += 2500 * fattoreLavoro(b);
    for (const b of G.basi) c.basi += AP[b].slot ? 2500 : 1200;
    c.hub = G.hub.length * D.HUB.giornaliero;
    c.sede = (1000 + 300 * flottaAttiva(G).length) * (G.strategia ? STR(G).sede : 1) * ((G.mod || {}).tagli ? 0.85 : 1);
    if (G.bordo) c.prodotto = analisiProdotto(G).fisso;
    if (G.alleanze) c.alleanze = costoAlleanze(G);
    if ((G.mod || {}).fedelta) c.prodotto = (c.prodotto || 0) + D.PROGETTI.fedelta.quotidiano;
    if (!G.straordinaria) for (const d of G.debiti) c.interessi += d.capitale * d.tasso / 365;
    for (const x in c) c[x] = Math.round(c[x]);
    return c;
  }
  function giornaliero(G, tPrec) {
    giornoFedelta(G);
    const o = G.oggi, fissi = costiFissi(G);
    for (const x in fissi) { o.costi[x] = (o.costi[x] || 0) + fissi[x]; G.cassa -= fissi[x]; }
    for (const x of G.campagne || []) if (x.attiva) x.speso += x.budget;
    for (const x of G.campagne || []) if (D.MARKETING[x.canale].reputazione) G.reputazione = Math.min(100, G.reputazione + 0.12 * x.forza * (1 + 0.12 * abil(G, 'cmo')));
    if (!G.straordinaria) for (const d of G.debiti) { const r = Math.min(d.capitale, d.rata || 0); d.capitale -= r; G.cassa -= r; if (r) flusso(G, 'finanziamenti', -r); }
    G.debiti = G.debiti.filter(d => d.capitale > 1);
    const costi = Object.values(o.costi).reduce((s, x) => s + x, 0);
    G.storico.push({ data: dataDi(tPrec), t: mezzanotte(tPrec), voli: o.voli, canc: o.canc, pax: o.pax, posti: o.posti, puntuali: o.puntuali, ricavi: o.ricavi, paxC: o.paxC, ricaviC: o.ricaviC, transito: o.transito, ricaviTransito: Math.round(o.ricaviTransito), costi, utile: o.ricavi - costi, dettaglio: o.costi, cassa: Math.round(G.cassa), rep: G.reputazione, cancEsterne: o.cancEsterne || 0, persi: o.persi || 0, ask: Math.round(o.ask || 0), rpk: Math.round(o.rpk || 0), flussi: o.flussi || null, extra: Math.round(o.ricaviExtra || 0), co2: Math.round(o.co2 || 0), contributi: Math.round(o.contributi || 0), negati: o.negati || 0, rotte: o.rotte, aerei: o.aerei, hub: o.hub });
    const rec = G.storico.at(-1); G.stat.utile += rec.utile;
    const vecchio = G.storico[G.storico.length - 61]; if (vecchio) { delete vecchio.rotte; delete vecchio.aerei; }
    if (G.storico.length > 1200) G.storico.shift();
    G.giorniUtile = rec.utile > 0 ? G.giorniUtile + 1 : 0;
    { let amm = 0; for (const ae of G.aerei) if (ae.modo === 'proprieta' && ae.stato !== 'venduto') { const dv = ae.valore * (0.055 + (superato(G, ae.modello) ? 0.04 : 0)) / 365; ae.valore -= dv; amm += dv; } rec.amm = Math.round(amm); }
    const ult = G.storico.slice(-7), voli = ult.reduce((s, x) => s + x.voli, 0), canc = ult.reduce((s, x) => s + x.canc - (x.cancEsterne || 0), 0);
    if (voli + canc > 0) {
      const punt = ult.reduce((s, x) => s + x.puntuali, 0) / Math.max(1, voli);
      const target = clamp(50 + (punt - 0.8) * 160 - canc / (voli + canc) * 250 + (G.bordo ? analisiProdotto(G).rep : D.SERVIZIO[G.servizio].rep) + Math.min(5, (G.saf || 0) * 12) + (G.fedelta && G.fedelta.attivo ? SCADENZE[G.fedelta.scadenza].rep || 0 : 0) + (G.morale - 50) * 0.1, 5, 95);
      G.reputazione = clamp(G.reputazione + (target - G.reputazione) * 0.06, 0, 100);
    }
    const cop = copertura(G);
    G._roster = null;
    const tm = clamp(60 + BENESSERE[G.benessere || 'nessuno'].morale + (G.stipendio * (G.lavoro ? G.lavoro.contratto / G.lavoro.mercato : 1) - 1) * 160 - (cop.min < 1 ? 10 : 0) - (cop.oreMedie > 24 ? 12 : 0) - (cop.oreMedie > 27 ? 10 : 0), 0, 100);
    G.morale = clamp(G.morale + (tm - G.morale) * 0.05, 0, 100);
    G.carburante = clamp(G.carburante + (0.8 - G.carburante) * 0.03 + (rnd() - 0.5) * 0.025, 0.45, 1.6);
    eventiCasuali(G);
    if (loc(G.ora).getUTCDay() === 1) { settimanaRivali(G); aggiornaMercato(G); }
    autoAssumi(G); controllaMissioni(G); giornoGestione(G); controllaDilemma(G); giornoEspansione(G); giornoLavoro(G); giornoRealismo(G); giornoFinanza(G); giornoCommerciale(G); giornoFlotta(G); giornoOperazioni(G); giornoProprieta(G); giornoPasseggeri(G); giornoGruppoIstituzioni(G);
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
    if ((mese >= 9 || mese <= 1) && nord.length && rnd() < 0.15 * fImprevisti(G)) {
      const i = pick(nord); G.eventi.push({ tipo: 'meteo', iata: i, forza: 1, inizio: tsDi(domani, 300), fine: tsDi(domani, 660), testo: `Nebbia a ${AP[i].citta}` });
      notizia(G, `Meteo: prevista nebbia domattina a ${AP[i].citta}. Attesi ritardi fino alle 11.`, 'evento');
    }
    if (mese >= 5 && mese <= 8 && serviti.length && rnd() < 0.12 * fImprevisti(G)) {
      const i = pick(serviti); G.eventi.push({ tipo: 'meteo', iata: i, forza: 2, inizio: tsDi(domani, 840), fine: tsDi(domani, 1140), testo: `Temporali a ${AP[i].citta}` });
      notizia(G, `Meteo: forti temporali domani pomeriggio a ${AP[i].citta}. Possibili ritardi e cancellazioni.`, 'evento');
    }
    if (rnd() < 0.012 * fImprevisti(G) && !G.eventi.some(e => e.tipo === 'sciopero-atc')) {
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
        if (!G.mosseRivali.some(m => m.k === k && !m.fatta)) if (G.rivali.some(X => !alleato(G, X.id))) G.mosseRivali.push({ riv: scegliAttaccante(G).id, k, freq: 2 + Math.floor(rnd() * 2), t: G.ora + (14 + Math.floor(rnd() * 14)) * GIORNO, attacco: true });
      } else for (const x of riv) {
        if (alleato(G, x.riv.id)) continue;
        const am = analisiMercato(G, a, b, mezzanotte(G.ora), 1, r.pY), qr = am.rivali.find(y => y.riv.id === x.riv.id)?.quota || 0;
        if (qr < 0.12 && q > 0.3 && rnd() < 0.35) { delete x.riv.rotte[x.k]; notizia(G, `${x.riv.nome} abbandona ${x.k.replace('-', '–')}: la rotta è tua.`, 'buona', true); }
        else if (q > 0.45 && !x.guerra && rnd() < 0.12 * fStile(x.riv)) { const rr = x.riv.rotte[x.k]; rr.prezzo *= 0.8; rr.guerraFino = G.ora + 21 * GIORNO; notizia(G, `Guerra dei prezzi: ${x.riv.nome} taglia del 20% le tariffe su ${x.k.replace('-', '–')} per tre settimane.`, 'cattiva', true); }
      }
    }
    for (const R of G.rivali) for (const rr of Object.values(R.rotte)) if (rr.guerraFino && G.ora > rr.guerraFino) { rr.prezzo = R.prezzo; delete rr.guerraFino; }
    settimanaSaluteRivali(G);
    if (rnd() < 0.25 && G.rivali.length) {
      const R = pick(G.rivali), dest = pick(Object.keys(AP).filter(i => i !== R.hub && km(R.hub, i) < (R.raggio || 2000)));
      const k = chiave(R.hub, dest); if (!R.rotte[k] && !G.mosseRivali.some(m => m.k === k && !m.fatta)) G.mosseRivali.push({ riv: R.id, k, freq: 2, t: G.ora + (10 + Math.floor(rnd() * 20)) * GIORNO });
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
    let v = G.cassa - debitoTot(G) - (G.fedelta ? G.fedelta.miglia * VALORE_MIGLIO : 0);
    for (const ae of G.aerei) if (ae.modo === 'proprieta' && ae.stato !== 'venduto') v += ae.valore - (ae.saldo || 0);
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
      case 'lowcost': return [{ t: '1,5 milioni di passeggeri', v: G.stat.pax / 1.5e6, s: num(G.stat.pax) }, { t: '20 M€ di utile cumulato', v: G.stat.utile / 20e6, s: eur(G.stat.utile) }];
      case 'golfo': { const u = G.storico.slice(-7), tr = u.length ? u.reduce((s, x) => s + (x.transito || 0), 0) / u.length : 0, n = continentiServiti(G); return [{ t: '5.000 passeggeri in transito al giorno', v: tr / 5000, s: num(tr) }, { t: '5 continenti collegati', v: n / 5, s: `${n}/5` }]; }
      case 'tempesta': { const g = (G.ora - G.inizio) / GIORNO; return [{ t: 'Arriva a fine anno', v: g / 365, s: `giorno ${Math.floor(g)}` }, { t: 'Cassa positiva', v: G.cassa > 0 ? 1 : 0, s: eur(G.cassa) }, { t: 'Reputazione sopra 40', v: G.reputazione / 40, s: Math.round(G.reputazione) + '/40' }]; }
      case 'scalata': { const a = (G.acquisizioni || []).length, v = valoreCompagnia(G); return [{ t: 'Compra 2 concorrenti', v: a / 2, s: `${a}/2` }, { t: 'Valore della compagnia 600 M€', v: v / 600e6, s: eur(v) }]; }
      case 'sfida': { const g = (G.ora - G.inizio) / GIORNO; return [{ t: 'Arriva al 90° giorno', v: g / 90, s: `giorno ${Math.floor(g)} · valore ${eur(valoreCompagnia(G))}` }]; }
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


  /* ---------- Uso semplice: pilota automatico, rotazione guidata, consigli, semafori, missioni ---------- */
  function autoAssumi(G) {
    if (!G.auto || !G.auto.equipaggi) return;
    const p = pianoAssunzioni(G), ris = G.equipaggi.length ? pianoRiserve(G) : [];
    if (!p.length && ris.length) { A.assumiRiserve(G); return; }
    if (!p.length) return;
    const costo = p.reduce((x, e) => x + costoAssunzione(e, false), 0);
    if (G.cassa < costo) {
      if (!G.auto.avvisato || G.ora - G.auto.avvisato > 3 * GIORNO) { G.auto.avvisato = G.ora; notizia(G, `Pilota automatico: servirebbero ${p.length} equipaggi (${eur(costo)}), ma la cassa non basta.`, 'cattiva'); }
      return;
    }
    A.assumiMancanti(G, false);
    notizia(G, `Pilota automatico: assunti ${p.length} equipaggi (${eur(costo)}), operativi tra 10 giorni.`, 'info');
  }

  // Somme degli ultimi giorni per rotta e per aereo
  function statRecenti(G, giorni = 7) {
    const ult = G.storico.slice(-giorni).filter(s => s.rotte), rotte = {}, aerei = {};
    for (const s of ult) {
      for (const [k, r] of Object.entries(s.rotte)) { const x = (rotte[k] ||= { voli: 0, pax: 0, posti: 0, ricavi: 0, costi: 0, canc: 0, giorni: 0 }); x.voli += r.voli; x.pax += r.pax; x.posti += r.posti; x.ricavi += r.ricavi; x.costi += r.costi; x.canc += r.canc || 0; x.giorni++; }
      for (const [id, a] of Object.entries(s.aerei || {})) { const x = (aerei[id] ||= { ore: 0, ricavi: 0, costi: 0, giorni: 0 }); x.ore += a.ore; x.ricavi += a.ricavi; x.costi += a.costi; x.giorni++; }
    }
    return { rotte, aerei, n: ult.length };
  }

  // Semafori: verde (va bene), giallo (da guardare), rosso (problema), grigio (nessun dato)
  function salute(G) {
    const S = statRecenti(G), att = rotteInEsercizio(G), rotte = {}, aerei = {}, n = Math.max(1, S.n);
    for (const k of Object.keys(G.rotte)) {
      const x = S.rotte[k];
      if (!att.has(k)) { rotte[k] = { c: 'grigio', t: 'Nessun aereo la vola' }; continue; }
      if (!x || !x.voli) { rotte[k] = { c: 'grigio', t: 'Ancora nessun volo' }; continue; }
      const lf = x.pax / Math.max(1, x.posti), utile = (x.ricavi - x.costi) / n, marg = (x.ricavi - x.costi) / Math.max(1, x.ricavi);
      const [a, b] = k.split('-'), guerra = rivaliSu(G, a, b).some(z => z.guerra), pct = Math.round(lf * 100) + '%';
      let s;
      if (utile < 0) s = { c: 'rosso', t: `In perdita (${eur(utile)} al giorno), pieno al ${pct}` };
      else if (guerra) s = { c: 'giallo', t: `Guerra dei prezzi in corso, pieno al ${pct}` };
      else if (lf > 0.92) s = { c: 'giallo', t: `Sempre piena (${pct}): puoi alzare i prezzi` };
      else if (lf < 0.6) s = { c: 'giallo', t: `Riempimento basso (${pct})` };
      else if (marg < 0.08) s = { c: 'giallo', t: `Margine sottile (${Math.round(marg * 100)}%)` };
      else s = { c: 'verde', t: `Utile ${eur(utile)} al giorno, pieno al ${pct}` };
      rotte[k] = { ...s, lf, utile };
    }
    const scoperte = roster(G).scoperte;
    for (const ae of flottaAttiva(G)) {
      const x = S.aerei[ae.id], ore = mediaCiclo(ae).ore, scop = scoperte.filter(c => c.ae === ae.id).length;
      let s;
      if (ae.stato === 'consegna') s = { c: 'grigio', t: `In consegna il ${dataBreve(ae.fino)}` };
      else if (!ore) s = { c: 'rosso', t: 'Fermo: nessuna rotazione' };
      else if (scop) s = { c: 'rosso', t: `${scop} turni senza equipaggio: voli cancellati` };
      else if (ae.lavori && ae.lavori.tipo !== 'check') s = { c: 'giallo', t: 'Lavori in corso' };
      else if (x && x.giorni >= 2 && x.ricavi - x.costi < 0) s = { c: 'rosso', t: `In perdita (${eur((x.ricavi - x.costi) / x.giorni)} al giorno)` };
      else if (!ae.autoCheck && ae.oreDaCheck > 450 && !ae.lavori) s = { c: 'giallo', t: 'Ispezione da programmare' };
      else if (ore < 5) s = { c: 'giallo', t: `Poco usato (${ore.toFixed(1)} h al giorno)` };
      else s = { c: 'verde', t: x && x.giorni ? `Utile ${eur((x.ricavi - x.costi) / x.giorni)} al giorno, ${ore.toFixed(1)} h di volo` : `${ore.toFixed(1)} h di volo al giorno` };
      aerei[ae.id] = s;
    }
    return { rotte, aerei };
  }
  const dataBreve = t => { const d = loc(t); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };

  // Consigliere: pochi suggerimenti, ognuno con un'azione da un tocco
  function consigli(G) {
    const out = [], S = statRecenti(G), att = rotteInEsercizio(G);
    const cop = copertura(G);
    if (cop.scoperte) {
      const st = A.stimaMancanti(G, true);
      out.push({ p: 100, c: 'rosso', testo: `${cop.scoperte} turni senza equipaggio: quei voli verranno cancellati.` + (st.n ? '' : ' Gli equipaggi che servono sono già in formazione: puoi farli arrivare prima.'),
        azioni: st.n ? [{ et: `Assumi urgente (${eur(st.costo)})`, az: 'assumiMancanti', args: [true] }] : A.stimaAnticipo(G).n ? [{ et: `Anticipa a 2 giorni (${eur(A.stimaAnticipo(G).costo)})`, az: 'anticipaFormazione', args: [] }] : [{ et: 'Vedi equipaggi', vai: 'personale' }] });
    }
    for (const ae of flottaAttiva(G)) if (ae.stato === 'attivo' && !mediaCiclo(ae).ore)
      out.push({ p: 90, c: 'rosso', testo: `${ae.marche} (${MOD[ae.modello].nome}) è fermo a terra: dagli una rotazione.`, azioni: [{ et: 'Rotazione guidata', guida: ae.id }] });
    const fissi = Object.values(costiFissi(G)).reduce((x, y) => x + y, 0), gg = G.cassa / Math.max(1, fissi);
    if (gg < 7) out.push({ p: 85, c: gg < 3 ? 'rosso' : 'giallo', testo: G.cassa < 0 ? `Cassa in rosso (${eur(G.cassa)}): sotto i −2 M€ le banche iniziano il conto alla rovescia.` : `Cassa bassa: copre ${Math.max(0, Math.floor(gg))} giorni di costi fissi.`, azioni: [{ et: 'Finanze', vai: 'finanze' }] });
    for (const ae of flottaAttiva(G)) if (!ae.autoCheck && !ae.lavori && ae.stato === 'attivo' && ae.oreDaCheck > 450)
      out.push({ p: 80, c: ae.oreDaCheck > 550 ? 'rosso' : 'giallo', testo: `${ae.marche}: ${Math.round(ae.oreDaCheck)} ore dall’ultima ispezione (limite 600).`, azioni: [{ et: 'Programma ispezione', az: 'ispezione', args: [ae.id] }] });
    const prezzi = [];
    for (const [k, x] of Object.entries(S.rotte)) {
      const r = G.rotte[k]; if (!r || !att.has(k) || x.voli < 4 || (r.ritocco && G.ora - r.ritocco < 7 * GIORNO)) continue;
      const lf = x.pax / Math.max(1, x.posti), utile = (x.ricavi - x.costi) / Math.max(1, x.giorni), [a, b] = k.split('-'), nome = `${a}–${b}`;
      const guerra = rivaliSu(G, a, b).find(z => z.guerra), caro = r.pY > prezzoRif(km(a, b)) * 1.15;
      if (guerra && lf < 0.8) prezzi.push({ p: 70, c: 'giallo', testo: `${guerra.riv.nome} ha tagliato i prezzi su ${nome}: sei pieno al ${Math.round(lf * 100)}%.`, azioni: [{ et: 'Rispondi −10%', az: 'ritocca', args: [k, 0.9] }] });
      else if (lf > 0.9) prezzi.push({ p: 55 + lf * 10, c: 'giallo', testo: `${nome} vola quasi sempre piena (${Math.round(lf * 100)}%): stai lasciando soldi sul tavolo.`, azioni: [{ et: 'Alza del 10%', az: 'ritocca', args: [k, 1.1] }] });
      else if ((lf < 0.55 && utile < 0) || (lf < 0.65 && caro)) prezzi.push({ p: 60 + (0.55 - lf) * 20, c: 'rosso', testo: `${nome} ${utile < 0 ? 'è in perdita e' : 'ha prezzi alti ed è'} piena solo al ${Math.round(lf * 100)}%: prezzi più bassi riempiono gli aerei.`, azioni: [{ et: 'Abbassa del 10%', az: 'ritocca', args: [k, 0.9] }, { et: 'Rotte', vai: 'rotte' }] });
      else if (utile < 0) prezzi.push({ p: 50, c: 'giallo', testo: `${nome} perde ${eur(-utile)} al giorno pur essendo piena al ${Math.round(lf * 100)}%: aereo troppo grande o costi alti.`, azioni: [{ et: 'Alza del 10%', az: 'ritocca', args: [k, 1.1] }, { et: 'Rotte', vai: 'rotte' }] });
    }
    out.push(...prezzi.sort((x, y) => y.p - x.p).slice(0, 3));
    if (!out.length && !att.size) out.push({ p: 10, c: 'info', testo: 'Nessun aereo vola ancora: crea la prima rotazione con la procedura guidata.', azioni: flottaAttiva(G)[0] ? [{ et: 'Rotazione guidata', guida: flottaAttiva(G)[0].id }] : [] });
    return out.sort((x, y) => y.p - x.p).slice(0, 5);
  }

  // Rotazione guidata: da un modello (navetta, due mete alternate, triangolo, lungo raggio, weekend diverso)
  // trova orari validi, inserisce i cambi equipaggio e dice quali rotte e slot servono.
  // orari di partenza da 05:30 a 14:30, provati a partire da quelli più comodi (attorno alle 7)
  const CANDIDATI_ORA = Array.from({ length: 19 }, (_, i) => 330 + i * 30).sort((x, y) => Math.abs(x - 420) - Math.abs(y - 420) || x - y).map(oraDaMin);
  function rotazioneGuidata(G, aeId, { tipo = 'navetta', dest = [], giri = 0, base } = {}) {
    const ae = G.aerei.find(a => a.id === aeId); if (!ae) return err('Aereo inesistente');
    const m = MOD[ae.modello], b = G.basi.includes(base) ? base : G.basi.includes(ae.base) ? ae.base : G.basi[0], [X, Y] = dest;
    if (!X || X === b) return err('Scegli la destinazione');
    if (['alterna', 'triangolo', 'weekend'].includes(tipo) && (!Y || Y === b || Y === X)) return err('Scegli la seconda destinazione (diversa dalla prima)');
    const tratte = tipo === 'multi' ? [...new Set(dest)].map(d => [b, d]) : tipo === 'triangolo' ? [[b, X], [X, Y], [Y, b]] : [[b, X], ...(Y && tipo !== 'navetta' && tipo !== 'lungo' ? [[b, Y]] : [])];
    for (const [p, q] of tratte) if (km(p, q) > m.autonomia) return err(`${p}–${q} è lunga ${km(p, q)} km: oltre l’autonomia del ${m.nome} (${m.autonomia} km)`);
    const nuove = [...new Set(tratte.map(([p, q]) => chiave(p, q)))].filter(k => !G.rotte[k]);
    const T = { ...G, rotte: { ...G.rotte } };
    for (const k of nuove) { const [p, q] = k.split('-'), d = km(p, q), ref = prezzoRif(d); T.rotte[k] = { aperta: G.ora, pY: ref, pW: Math.round(ref * multClasse('W', d)), pJ: Math.round(ref * multClasse('J', d)) }; }
    // turnaround comodo (meno ritardi a catena) e una notte di almeno 8 ore in base per le ispezioni
    const turn = Math.max(ae.prog.turn || 0, m.lungo ? 90 : m.tipo === 'ATR' ? 35 : 40);
    const giorno = (dests, n) => { const s = [b]; for (let i = 0; i < n; i++) { const d = dests[i % dests.length]; if (Array.isArray(d)) s.push(...d, b); else s.push(d, b); } return s; };
    const fatale = e => !/non è aperta|aeroporto a slot/.test(e);
    const prova = giorni => {
      let prog = { turn, giorni: giorni.map(([inizio, scali]) => ({ inizio, scali, attese: [], cambi: [] })) };
      prog = sistemaTurni(T, ae, prog);
      const v = validaProgramma(T, ae, prog);
      return v.E.some(fatale) || (v.piano.legs.length && v.piano.sostaBase < 480) ? null : { prog, v };
    };
    const durGiro = dests => dests.reduce((x, d) => x + (Array.isArray(d) ? durata(km(b, d[0]), ae.modello) + durata(km(d[0], d[1]), ae.modello) + durata(km(d[1], b), ae.modello) + 3 * turn : 2 * (durata(km(b, d), ae.modello) + turn)), 0) / dests.length;
    const maxGiri = dests => clamp(Math.floor(1100 / durGiro(dests)) + 1, 1, 10);
    // giri "automatici": i più numerosi con un riempimento stimato di almeno il 72% (a rotta avviata)
    const posti = CL.reduce((x, c) => x + (ae.cab[c] || 0), 0);
    const mieFreq = (p, q) => { let f = 0; for (const x of flottaAttiva(G)) if (x.id !== ae.id) for (const l of mediaCiclo(x).tratte) if (l.da === p && l.a === q) f += l.peso; return f; };
    const riemp = (tr, n) => { let s = 0; for (const [p, q, f] of tr) { const fq = f * n, tot = mieFreq(p, q) + fq, r = T.rotte[chiave(p, q)]; const am = analisiMercato(T, p, q, G.ora + GIORNO, tot, r.pY || prezzoRif(km(p, q)), 1, { stima: true }); s += Math.min(1, am.pax / Math.max(0.3, am.maturita) * (fq / tot) / (fq * posti)); } return s / tr.length; };
    const trDi = dests => dests.flatMap(d => Array.isArray(d) ? [[b, d[0], 1], [d[0], d[1], 1], [d[1], b, 1]] : [[b, d, 1 / dests.length], [d, b, 1 / dests.length]]);
    const giriAuto = dests => { const tr = trDi(dests); for (let n = maxGiri(dests); n > 1; n--) if (riemp(tr, n) >= 0.72) return n; return 1; };
    // la migliore settimana uniforme per una lista di mete (nFisso: >0 giri esatti, 0 automatico, -1 massimo)
    const uniforme = (dests, nFisso) => {
      for (let n = nFisso > 0 ? nFisso : nFisso < 0 ? maxGiri(dests) : giriAuto(dests); n >= 1; n--) {
        for (const ora of CANDIDATI_ORA) { const r = prova(GIORNI_SETT.map(() => [ora, giorno(dests, n)])); if (r) return { ...r, n, ora }; }
        if (nFisso > 0) break;
      }
      return null;
    };
    const ar = n => `${n} ${n === 1 ? 'volo' : 'voli'} di andata e ritorno`;
    let best = null, descr = '';
    if (tipo === 'navetta') { best = uniforme([X], giri); descr = best && `${ar(best.n)} ${b}–${X} al giorno, partenza alle ${best.ora}`; }
    else if (tipo === 'alterna') { best = uniforme([X, Y], giri); descr = best && `${ar(best.n)} al giorno alternando ${X} e ${Y}, partenza alle ${best.ora}`; }
    else if (tipo === 'triangolo') { best = uniforme([[X, Y]], giri); descr = best && `${best.n} ${best.n === 1 ? 'giro' : 'giri'} ${b}→${X}→${Y}→${b} al giorno, partenza alle ${best.ora}`; }
    else if (tipo === 'multi') { best = uniforme(dest, giri); descr = best && `${ar(best.n)} al giorno da ${b} verso ${[...new Set(dest)].join(', ')}, partenza alle ${best.ora}`; }
    else if (tipo === 'weekend') {
      const fer = uniforme([X], giri), fest = uniforme([Y], giri);
      if (fer && fest) for (let a = fer.n; a >= 1 && !best; a--) for (let c = fest.n; c >= 1 && !best; c--) for (const o1 of CANDIDATI_ORA) {
        const r = prova(GIORNI_SETT.map((_, i) => i < 5 ? [o1, giorno([X], a)] : [fest.ora, giorno([Y], c)]));
        if (r) { best = r; descr = `Lun–Ven ${ar(a)} ${b}–${X}; Sab–Dom ${ar(c)} ${b}–${Y}`; break; }
      }
    } else if (tipo === 'lungo') {
      best = uniforme([X], 1); if (best) descr = `Un andata e ritorno ${b}–${X} ogni giorno, partenza alle ${best.ora}`;
      else {
        for (const o1 of CANDIDATI_ORA) { for (const o2 of CANDIDATI_ORA.concat(Array.from({ length: 16 }, (_, i) => oraDaMin(900 + i * 30)))) {
          const r = prova(GIORNI_SETT.map((_, i) => i === 6 ? [o1, [b]] : i % 2 === 0 ? [o1, [b, X]] : [o2, [X, b]]));
          if (r) { best = r; descr = `Tre andata e ritorno a settimana ${b}–${X} (andata Lun, Mer, Ven alle ${o1}; ritorno il giorno dopo alle ${o2}), la domenica a riposo`; break; }
        } if (best) break; }
      }
    } else return err('Modello di rotazione sconosciuto');
    if (!best) return err('Non trovo orari validi per questa combinazione: prova un’altra destinazione o meno giri al giorno');
    const slot = [], dep = partenzePerScalo(T, { id: ae.id, prog: best.prog });
    for (const [i, c] of Object.entries(dep)) if (AP[i].slot && c > (G.slot[i] || 0)) slot.push({ i, n: c - (G.slot[i] || 0), costo: (c - (G.slot[i] || 0)) * AP[i].slotPrezzo });
    const costo = nuove.length * 30000 + slot.reduce((x, s) => x + s.costo, 0);
    const dd = tipo === 'navetta' ? [X] : tipo === 'alterna' ? [X, Y] : tipo === 'triangolo' ? [[X, Y]] : null;
    const nMax = dd ? Math.max(best.n || 1, (uniforme(dd, -1) || {}).n || 1) : 0; // solo i giri che stanno davvero nella giornata
    const stime = dd ? Array.from({ length: nMax }, (_, i) => ({ n: i + 1, lf: riemp(trDi(dd), i + 1) })) : [];
    return { ok: true, prog: best.prog, descr, giri: best.n || 0, stime, nuove, slot, costo, W: best.v.W, voliSett: best.v.voliSett, oreSett: best.v.oreSett };
  }

  // Missioni brevi: tre alla volta, premio in denaro e reputazione
  const TIPI_MISSIONE = ['rotta', 'pax', 'puntuale', 'riempimento', 'utile', 'reputazione'];
  function nuovaMissione(G) {
    const M = G.missioni, ult = G.storico.slice(-7), nd = Math.max(1, ult.length);
    const paxG = ult.reduce((s, x) => s + x.pax, 0) / nd, ricG = ult.reduce((s, x) => s + x.ricavi, 0) / nd, utG = ult.reduce((s, x) => s + x.utile, 0) / nd;
    const premio = clamp(Math.round(ricG * 0.5 / 5000) * 5000, 25000, 1.5e6);
    const usati = M.attive.map(x => x.tipo);
    let tipi = TIPI_MISSIONE.filter(t => !usati.includes(t) && t !== M.ultimo);
    if (!paxG) tipi = tipi.filter(t => t === 'rotta' || t === 'reputazione');
    if (G.reputazione >= 90) tipi = tipi.filter(t => t !== 'reputazione');
    if (!tipi.length) return;
    const tipo = !rotteInEsercizio(G).size && tipi.includes('rotta') ? 'rotta' : tipi[Math.floor(rnd() * tipi.length)];
    const x = { id: 'm' + (G.seq++), tipo, inizio: G.ora, v: 0, serie: 0 };
    switch (tipo) {
      case 'rotta': Object.assign(x, { testo: 'Fai volare una rotta nuova', dett: 'Una rotta che oggi non voli, entro 14 giorni', scade: G.ora + 14 * GIORNO, cassa: premio, rep: 2, prima: [...rotteInEsercizio(G)] }); break;
      case 'pax': { const n = Math.max(300, Math.round(paxG * 7 * 1.08 / 50) * 50); Object.assign(x, { testo: `Trasporta ${n.toLocaleString('it-IT')} passeggeri`, dett: 'In 7 giorni', scade: G.ora + 7 * GIORNO, cassa: premio, rep: 2, da: G.stat.pax, obiettivo: n }); break; }
      case 'puntuale': Object.assign(x, { testo: 'Cinque giorni impeccabili', dett: 'Nessuna cancellazione e almeno 90% di voli puntuali, 5 giorni di fila', scade: G.ora + 10 * GIORNO, cassa: premio, rep: 4, obiettivo: 5 }); break;
      case 'riempimento': Object.assign(x, { testo: 'Aerei pieni', dett: 'Riempimento medio oltre l’80% per 3 giorni di fila', scade: G.ora + 10 * GIORNO, cassa: premio, rep: 2, obiettivo: 3 }); break;
      case 'utile': { const s = utG > 0 ? Math.max(5000, Math.round(utG * 1.15 / 1000) * 1000) : 1000; Object.assign(x, { testo: `Utile sopra ${eur(s)}`, dett: 'Per 3 giorni di fila', scade: G.ora + 10 * GIORNO, cassa: premio, rep: 2, soglia: s, obiettivo: 3 }); break; }
      case 'reputazione': { const t = Math.min(95, Math.ceil(G.reputazione) + 4); Object.assign(x, { testo: `Reputazione a ${t}`, dett: 'Entro 21 giorni: puntualità, servizio e niente cancellazioni', scade: G.ora + 21 * GIORNO, cassa: premio, rep: 0, da: G.reputazione, obiettivo: t }); break; }
    }
    M.attive.push(x);
  }
  function controllaMissioni(G) {
    const M = (G.missioni ||= { attive: [], fatte: 0 }), s = G.storico.at(-1);
    for (const x of M.attive.slice()) {
      if (s) switch (x.tipo) {
        case 'rotta': x.v = [...rotteInEsercizio(G)].some(k => !x.prima.includes(k) && s.rotte && s.rotte[k] && s.rotte[k].voli) ? 1 : 0; break;
        case 'pax': x.v = (G.stat.pax - x.da) / x.obiettivo; break;
        case 'puntuale': x.serie = s.voli && !s.canc && s.puntuali / s.voli >= 0.9 ? x.serie + 1 : 0; x.v = x.serie / x.obiettivo; break;
        case 'riempimento': x.serie = s.posti && s.pax / s.posti >= 0.8 ? x.serie + 1 : 0; x.v = x.serie / x.obiettivo; break;
        case 'utile': x.serie = s.utile >= x.soglia ? x.serie + 1 : 0; x.v = x.serie / x.obiettivo; break;
        case 'reputazione': x.v = clamp((G.reputazione - x.da) / (x.obiettivo - x.da), 0, 1); break;
      }
      if (x.v >= 1) {
        G.cassa += x.cassa; G.reputazione = Math.min(100, G.reputazione + x.rep); M.fatte++; M.ultimo = x.tipo;
        M.attive = M.attive.filter(y => y !== x);
        const n = { t: G.ora, testo: `Missione compiuta: ${x.testo}! Premio ${eur(x.cassa)}${x.rep ? ` e +${x.rep} di reputazione` : ''}.`, tipo: 'buona', festa: true };
        G.notizie.unshift(n); (G._nuove ||= []).push(n);
      } else if (G.ora >= x.scade) { M.attive = M.attive.filter(y => y !== x); M.ultimo = x.tipo; notizia(G, `Missione scaduta: ${x.testo}.`, 'info'); }
    }
    while (M.attive.length < 3) { const n = M.attive.length; nuovaMissione(G); if (M.attive.length === n) break; }
  }

/* ---------- Gestione aziendale: strategia, prodotto, tariffe, mercati, ricerche, direzione, CdA, borsa ---------- */
  const num = n => Math.round(n).toLocaleString('it-IT');
  const CONTINENTI = ['Europa', 'Asia', 'Africa', 'Oceania', 'Nord America', 'Sud America'];
  function initGestione(G) {
    G.strategia ||= 'tradizionale';
    if (!G.bordo) G.bordo = JSON.parse(JSON.stringify(D.PRESET_BORDO[G.servizio] || D.PRESET_BORDO.standard));
    G.tariffe ||= { bagaglio: 0, posto: 0, priorita: 0, famiglie: false, dinamico: 'fisso', overbooking: 0 };
    G.economia ||= Object.fromEntries(CONTINENTI.map(c => [c, 1]));
    G.serie ||= [];
    G.studi ||= {}; G.ricerche ||= [];
    G.mod ||= {};
    G.mosseRivali ||= [];
    G.direzione ||= { dirigenti: Object.fromEntries(Object.entries(D.DIRIGENTI).map(([k, x]) => [k, { nome: x.nomi[0], umore: 60, n: 0 }])), riunione: null, verbale: [], progetti: [] };
    G.cda ||= { fiducia: 60, semestre: null, storico: [] };
    G.borsa ||= { quotata: false };
    initRivali(G); initFedelta(G); initLavoro(G); initRealismo(G); initProprieta(G);
    G.esperto ??= false; G.irops ||= { riserva: true, riprotezione: true };
    G.marchi ||= []; G.societa ||= {}; G.cause ||= []; G.bandi ||= []; G.pso ||= []; G.lobby ||= 0; completaDirigenti(G); initCeo(G);
    for (const ae of G.aerei) completaAereo(G, ae, false);
    if (!G.diritti) { G.diritti = {}; for (const k of Object.keys(G.rotte)) { const [a, b] = k.split('-'); if (servonoDiritti(a, b)) G.diritti[chiaveDiritti(a, b)] = { stato: 'concessi' }; } }
    G.canali ||= { ota: true, aziende: false }; G.promozioni ||= []; G.stelle ??= 3.2;
    if (!G.notorieta) { G.notorieta = {}; for (const b of G.basi) G.notorieta[AP[b].citta] = 0.7; for (const k of Object.keys(G.rotte)) for (const i of k.split('-')) G.notorieta[AP[i].citta] ??= 0.45; }
    G.co2 ??= 70; G.saf ??= 0; G.accordi ||= []; G.offerte ||= []; G.giornali ||= []; G.bilanci ||= []; G.stagione ||= stagioneDi(G.ora); G.modelliUsciti ||= Object.keys(MOD).filter(k => disponibile(G, k));
    if (!G.cda.semestre) nuovoSemestre(G);
  }
  const STR = G => D.STRATEGIE[G.strategia || 'tradizionale'];
  // fattore di domanda "nascosto" di ogni coppia di città (diverso per partita): lo rivela uno studio di domanda
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  const fattoreRotta = (G, da, a) => 0.72 + 0.6 * hash(chiaveCitta(da, a) + (G.seme ?? G.id ?? ''));
  const studiato = (G, da, a) => { const s = G.studi && G.studi[chiaveCitta(da, a)]; return !!s && G.ora - s < 365 * GIORNO; };
  const economiaDi = (G, da, a) => G.economia ? Math.sqrt((G.economia[AP[da].continente] || 1) * (G.economia[AP[a].continente] || 1)) : 1;

  // Gradimento del prodotto per classe su un volo lungo k km (1 = standard, già al netto di ciò che si aspettano i clienti)
  function valoreProdotto(G, k = 800) {
    const S = STR(G), h = k / 750 + 0.4, durF = clamp(h / 2, 0.5, 2), T = G.tariffe || {}, out = {};
    for (const c of CL) {
      let v = 1 - (S.attesa[c] || 0);
      for (const [el, E] of Object.entries(D.BORDO)) {
        if (E.classi && !E.classi.includes(c)) continue;
        const L = E.livelli[livello(G, c, el)]; v += (L.val[c] || 0) * (E.durata ? durF : 1);
      }
      if (c === 'Y') {
        if (T.bagaglio > 0) v -= 0.06 * (T.bagaglio / 30) ** 0.7 * S.tolleranza;
        if (T.posto > 0) v -= 0.012 * (T.posto / 10) ** 0.5 * S.tolleranza;
      }
      if (T.famiglie) v -= 0.01;
      if (G.mod && G.mod.corsoCabina && G.ora < G.mod.corsoCabina) v += 0.02;
      out[c] = clamp(v, 0.5, 1.5);
    }
    return out;
  }
  // livello scelto per un elemento (rispetta i requisiti: senza Wi‑Fi installato si torna a "niente")
  const livello = (G, c, el) => { const E = D.BORDO[el]; let l = (G.bordo && G.bordo[c] && G.bordo[c][el]) || 0; if (E.richiede && !(G.mod || {})[E.richiede]) l = 0; return clamp(l, 0, E.livelli.length - 1); };
  // costo del servizio di bordo e ricavi extra di un volo
  function contoBordo(G, paxC, h) {
    let costo = 0, extra = 0; const T = G.tariffe || {}, app = (G.mod || {}).app ? 1.2 : 1;
    for (const c of CL) {
      const n = paxC[c]; if (!n) continue;
      for (const [el, E] of Object.entries(D.BORDO)) {
        if (E.classi && !E.classi.includes(c)) continue;
        const L = E.livelli[livello(G, c, el)];
        costo += n * ((L.costo || 0) + (L.costoOra || 0) * h); extra += n * ((L.ricavo && L.ricavo[c]) || 0);
      }
      if (c === 'Y') {
        if (T.bagaglio > 0) extra += n * T.bagaglio * 0.55 * Math.exp(-T.bagaglio / 45) * app;
        if (T.posto > 0) extra += n * T.posto * 0.25 * Math.exp(-T.posto / 18) * app;
      }
      if (T.priorita > 0 && c !== 'J') extra += n * T.priorita * 0.12 * Math.exp(-T.priorita / 20) * app;
    }
    return { costo: Math.round(costo), extra: Math.round(extra) };
  }
  // costo e ricavi extra medi a passeggero per classe (volo di 2 ore), per l'interfaccia
  function analisiProdotto(G) {
    const V = valoreProdotto(G, 1200), out = {}, S = STR(G);
    for (const c of CL) {
      const p = { J: 0, W: 0, Y: 0 }; p[c] = 1; const x = contoBordo(G, p, 2);
      out[c] = { valore: V[c], costo: x.costo, extra: x.extra, nps: clamp(Math.round(30 + (V[c] - 1) * 300), -100, 100) };
    }
    out.rep = clamp(((V.J - 1) * 0.2 + (V.W - 1) * 0.1 + (V.Y - 1) * 0.7) * 60, -12, 12) + S.rep;
    let fisso = 0; for (const c of ['J', 'W']) if (livello(G, c, 'lounge') === 2) { fisso = D.BORDO.lounge.livelli[2].fisso * G.basi.length; break; }
    if ((G.mod || {}).wifi) fisso += 150 * flottaAttiva(G).length;
    out.fisso = fisso;
    return out;
  }
  // moltiplicatore del prezzo con la gestione dei ricavi (sale quando il volo si riempie)
  function rialzoDinamico(G, riemp) { const R = D.DINAMICO[(G.tariffe || {}).dinamico || 'fisso']; return 1 + R.rialzo * clamp((riemp - 0.4) / 0.6, 0, 1); }

  // ---------- Mercati ed economia ----------
  function aggiornaEconomia(G) {
    for (const c of CONTINENTI) {
      let v = G.economia[c] ?? 1;
      v += (1 - v) * 0.02 + (rnd() - 0.5) * 0.012;
      if (rnd() < 0.002) { const shock = rnd() < 0.5 ? -0.07 : 0.05; v += shock; notizia(G, shock < 0 ? `Rallentamento economico in ${c}: meno viaggiatori nei prossimi mesi.` : `Economia in forte crescita in ${c}: la domanda di voli aumenta.`, shock < 0 ? 'cattiva' : 'buona', true); }
      G.economia[c] = clamp(v, 0.8, 1.15);
    }
    if (giornoSett(G.ora) === 0) { G.serie.push({ t: G.ora, carb: G.carburante, co2: G.co2, econ: { ...G.economia } }); if (G.serie.length > 104) G.serie.shift(); }
  }

  // ---------- Ricerche di mercato ----------
  function concludiRicerche(G) {
    for (const r of G.ricerche) if (!r.fatta && G.ora >= r.fine) {
      r.fatta = true;
      if (r.tipo === 'domanda') { G.studi[chiaveCitta(r.da, r.a)] = G.ora; r.esito = esitoDomanda(G, r.da, r.a); notizia(G, `Studio di domanda ${r.da}–${r.a} pronto: ${r.esito.testo}`, 'buona', true); }
      else if (r.tipo === 'area') { const l = candidati(G, r.base, 12); for (const x of l) G.studi[chiaveCitta(r.base, x.a)] = G.ora; r.esito = { lista: l.map(x => x.a) }; notizia(G, `Indagine di mercato su ${r.base} pronta: 12 destinazioni studiate, le trovi in Mercati.`, 'buona', true); }
      else if (r.tipo === 'concorrenza') { G.intel = G.ora + 60 * GIORNO; notizia(G, 'Analisi della concorrenza pronta: per 60 giorni vedi in anticipo le loro mosse (pagina Mercati).', 'buona', true); }
      else if (r.tipo === 'sondaggio') { G.sondaggio = { t: G.ora, ...esitoSondaggio(G) }; notizia(G, 'Sondaggio passeggeri pronto: lo trovi in Bordo e tariffe.', 'buona', true); }
    }
    G.ricerche = G.ricerche.filter(r => !r.fatta || G.ora - r.fine < 120 * GIORNO);
  }
  function esitoDomanda(G, da, a) {
    const f = fattoreRotta(G, da, a), g = mezzanotte(G.ora), mesi = [];
    for (let m = 0; m < 12; m++) { const d = loc(g); const t = Date.UTC(d.getUTCFullYear(), m, 15) - FUSO * ORA; mesi.push(Math.round(domandaBase(G, da, a, t))); }
    const tur = (AP[da].tur + AP[a].tur) / 2, quote = quoteClassi(da, a);
    return { fattore: f, mesi, turismo: tur, quote, testo: `${f > 1.12 ? 'domanda molto più alta del previsto' : f > 1 ? 'domanda un po’ più alta del previsto' : f > 0.88 ? 'domanda un po’ più bassa del previsto' : 'domanda molto più bassa del previsto'} (${f > 1 ? '+' : ''}${Math.round((f - 1) * 100)}% rispetto alla stima generica).` };
  }
  function esitoSondaggio(G) {
    const V = valoreProdotto(G, 1200), out = {};
    for (const c of CL) {
      const idee = [];
      for (const [el, E] of Object.entries(D.BORDO)) {
        if (E.classi && !E.classi.includes(c)) continue;
        const l = livello(G, c, el); if (l >= E.livelli.length - 1) continue;
        const L0 = E.livelli[l], L1 = E.livelli[l + 1], dv = (L1.val[c] || 0) - (L0.val[c] || 0);
        if (dv > 0.005) idee.push({ el, nome: E.nome, verso: L1.nome, guadagno: dv, costo: ((L1.costo || 0) + (L1.costoOra || 0) * 2) - ((L0.costo || 0) + (L0.costoOra || 0) * 2), bloccato: E.richiede && !(G.mod || {})[E.richiede] });
      }
      idee.sort((x, y) => y.guadagno / Math.max(1, y.costo) - x.guadagno / Math.max(1, x.costo));
      out[c] = { nps: clamp(Math.round(30 + (V[c] - 1) * 300), -100, 100), idee: idee.slice(0, 3) };
    }
    return { classi: out };
  }

  // ---------- Proposte di destinazioni ----------
  // stima dei costi di un volo (come all'arrivo, senza ritardi)
  function costoVoloStimato(G, mod, k, pax) {
    const m = MOD[mod], h = durata(k, mod) / 60, np = somma(cabinaStandard(mod));
    return m.consumo * h * G.carburante + m.consumo * h * 3.16 / 1000 * (G.co2 || 0) * 0.4 + pax * 20 + Math.max(np * 2, m.peso * 8) + 250 + pax * 5 + k * 0.6 * Math.sqrt(m.peso / 70) + m.manut * h + pax * 4 * Math.max(1, h / 2);
  }
  function candidati(G, base, n = 5, escludiAperte = true) {
    const modelli = [...new Set(flottaAttiva(G).filter(a => a.stato !== 'consegna').map(a => a.modello))];
    if (!modelli.length) modelli.push('A320');
    const out = [], domani = giornoDopo(mezzanotte(G.ora));
    for (const a of Object.keys(AP)) {
      if (a === base || AP[a].citta === AP[base].citta) continue;
      const k = km(base, a); if (k < 180) continue;
      if (escludiAperte && G.rotte[chiave(base, a)]) continue;
      const adatti = modelli.filter(m => MOD[m].autonomia >= k); if (!adatti.length) continue;
      const ref = prezzoRif(k);
      let best = null, paxDir = 0, nRiv = 0;
      for (const m of adatti) {
        // voli di andata e ritorno al giorno che un aereo riesce a fare (sotto 1: a giorni alterni)
        const giro = 2 * (durata(k, m) + (MOD[m].lungo ? 90 : 45)), n = giro <= 1440 ? clamp(Math.floor(960 / giro), 1, 2) : 3 / 7;
        const am = analisiMercato(G, base, a, domani, n, ref, 1, { stima: true, senzaMarketing: true });
        const pd = am.pax / Math.max(0.3, am.maturita), posti = somma(cabinaStandard(m)), lf = Math.min(1, pd / (n * posti)), pax = lf * posti;
        const utile = 2 * n * (pax * ref * 1.12 - costoVoloStimato(G, m, k, pax));
        if (!best || utile > best.utile) { best = { mod: m, lf, utile, giri: n }; paxDir = pd; nRiv = am.rivali.length; }
      }
      out.push({ da: base, a, km: k, ...best, paxDir: Math.round(paxDir), studiato: studiato(G, base, a), rivali: nRiv, diritti: servonoDiritti(base, a) && !dirittiOk(G, base, a) });
    }
    return out.sort((x, y) => y.utile - x.utile).slice(0, n);
  }
  function proposteDestinazioni(G, n = 6) {
    const tutte = G.basi.flatMap(b => candidati(G, b, n));
    return tutte.sort((x, y) => y.utile - x.utile).slice(0, n);
  }

  // ---------- Concorrenti: mosse pianificate (visibili con l'analisi della concorrenza) ----------
  function eseguiMosseRivali(G) {
    for (const m of G.mosseRivali) if (!m.fatta && G.ora >= m.t) {
      m.fatta = true; const R = G.rivali.find(r => r.id === m.riv); if (!R || R.rotte[m.k]) continue;
      R.rotte[m.k] = { freq: m.freq, prezzo: R.prezzo * (m.attacco ? 0.9 : 1) };
      const [a, b] = m.k.split('-');
      notizia(G, m.attacco ? `${R.nome} ha visto i tuoi aerei pieni e apre ${a}–${b}, con prezzi aggressivi.` : `${R.nome} inaugura un collegamento ${a}–${b}.`, m.attacco ? 'cattiva' : 'info', !!m.attacco);
    }
    G.mosseRivali = G.mosseRivali.filter(m => !m.fatta || G.ora - m.t < 30 * GIORNO);
  }
  const intel = G => G.intel && G.ora < G.intel;

  // ---------- Progetti ----------
  function avviaProgetto(G, tipo, dati = {}) {
    const P = D.PROGETTI[tipo]; if (!P) return err('Progetto sconosciuto');
    if (G.mod[tipo] && tipo !== 'sponsor' && tipo !== 'tagli' && tipo !== 'rebranding') return err('Progetto già completato');
    if (G.direzione.progetti.some(p => p.tipo === tipo && !p.fatto)) return err('Progetto già in corso');
    const costo = P.costo + (P.perAereo || 0) * flottaAttiva(G).length;
    if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
    paga(G, costo, 'altro');
    G.direzione.progetti.push({ id: 'pr' + (G.seq++), tipo, nome: P.nome, inizio: G.ora, fine: G.ora + Math.round(P.giorni * (1 - 0.08 * abil(G, 'cto'))) * GIORNO, costo, fatto: false });
    if (tipo === 'tagli') G.morale = Math.max(0, G.morale - 8);
    return ok(`${P.nome}: avviato, pronto tra ${P.giorni} giorni`);
  }
  function concludiProgetti(G) {
    for (const p of G.direzione.progetti) if (!p.fatto && G.ora >= p.fine) {
      p.fatto = true; const P = D.PROGETTI[p.tipo];
      if (p.tipo === 'rebranding') G.reputazione = Math.min(100, G.reputazione + 8);
      else if (p.tipo === 'sponsor') G.reputazione = Math.min(100, G.reputazione + 4);
      else if (p.tipo === 'tagli') G.mod.tagli = G.ora + 180 * GIORNO;
      else { G.mod[p.tipo] = true; if (p.tipo === 'app' || p.tipo === 'fedelta') G.reputazione = Math.min(100, G.reputazione + 2); }
      notizia(G, `Progetto completato: ${P.nome}. ${P.effetto}.`, 'buona', true);
    }
  }

  // ---------- Riunione di direzione (ogni lunedì mattina) ----------
  const PROPOSTE = [
    { ruolo: 'cfo', id: 'copertura', se: G => !G.copertura && G.carburante < 0.86 && flottaAttiva(G).length >= 2, testo: G => `Il cherosene è a ${G.carburante.toFixed(2)} €/kg, sotto la media. Propongo di bloccare il prezzo per 6 mesi con una copertura (premio ${eur(costoCopertura(G))}).`, costo: G => costoCopertura(G), fai: G => { paga(G, costoCopertura(G), 'altro'); G.copertura = { prezzo: G.carburante * 1.02, fine: G.ora + 180 * GIORNO }; return ok('Prezzo del cherosene bloccato per 6 mesi'); } },
    { ruolo: 'cfo', id: 'prestito', se: G => G.cassa < 7 * fissiTot(G) && A.limitePrestito(G) >= 1e6, testo: G => `La cassa copre ${Math.max(0, Math.floor(G.cassa / Math.max(1, fissiTot(G))))} giorni di costi fissi. Chiediamo un prestito di ${eur(prestitoProposto(G))} al ${(A.tassoPrestito(G) * 100).toFixed(1)}%.`, costo: () => 0, fai: G => A.prestito(G, prestitoProposto(G)) },
    { ruolo: 'cfo', id: 'tagli', se: G => !G.mod.tagli && utileUltimi(G, 14) < 0 && !G.direzione.progetti.some(p => p.tipo === 'tagli' && !p.fatto), testo: () => 'Siamo in perdita da due settimane. Propongo un piano di riduzione dei costi di sede (−15% per 6 mesi). Il personale non la prenderà bene.', costo: () => 0, progetto: 'tagli' },
    { ruolo: 'cfo', id: 'dividendo', se: G => G.borsa.quotata && utileUltimi(G, 30) > 0 && G.cassa > 20 * fissiTot(G), testo: G => `Utile solido e cassa abbondante: distribuiamo un dividendo di ${eur(dividendoProposto(G))} agli azionisti? Il titolo e la fiducia del CdA salirebbero.`, costo: G => dividendoProposto(G), fai: G => A.dividendo(G, dividendoProposto(G)) },
    { ruolo: 'comm', id: 'rotta', se: G => { const p = proposteDestinazioni(G, 3).find(x => x.utile > 0 && !G.direzione.verbale.some(v => v.id === 'rotta' && v.dati === x.da + '-' + x.a && G.ora - v.t < 60 * GIORNO)); return p && { k: p.da + '-' + p.a, p }; }, testo: (G, d) => `Ho trovato una rotta interessante: ${d.p.da}–${d.p.a} (${num(d.p.km)} km). Con ${d.p.giri >= 1 ? `${d.p.giri} ${d.p.giri === 1 ? 'volo' : 'voli'} di andata e ritorno al giorno` : 'tre andata e ritorno a settimana'} di un ${MOD[d.p.mod].nome} stimo un riempimento del ${Math.round(d.p.lf * 100)}% e circa ${eur(d.p.utile)} al giorno di margine sui voli${d.p.studiato ? ' (dato da studio di mercato)' : ' (stima generica, ±30%)'}. Apriamola?`, costo: () => 30000, fai: (G, d) => { const [a, b] = d.k.split('-'); return A.apriRotta(G, a, b); } },
    { ruolo: 'comm', id: 'prezzi', se: G => { const S = statRecenti(G); const x = Object.entries(S.rotte).find(([k, r]) => G.rotte[k] && r.voli >= 4 && r.pax / r.posti > 0.94 && !(G.rotte[k].ritocco && G.ora - G.rotte[k].ritocco < 7 * GIORNO)); return x && { k: x[0], lf: x[1].pax / x[1].posti }; }, testo: (G, d) => `${d.k.replace('-', '–')} vola piena al ${Math.round(d.lf * 100)}%: alziamo le tariffe dell’8%.`, costo: () => 0, fai: (G, d) => A.ritocca(G, d.k, 1.08) },
    { ruolo: 'comm', id: 'studio', se: G => { const p = proposteDestinazioni(G, 6).find(x => !x.studiato && !G.ricerche.some(r => !r.fatta && r.da === x.da && r.a === x.a)); return p && { da: p.da, a: p.a }; }, testo: (G, d) => `Prima di decidere su ${d.da}–${d.a} vorrei uno studio di domanda: oggi la stima è generica (±30%).`, costo: () => D.RICERCHE.domanda.costo, fai: (G, d) => A.ricerca(G, { tipo: 'domanda', da: d.da, a: d.a }) },
    { ruolo: 'comm', id: 'famiglie', se: G => !G.tariffe.famiglie && G.stat.voli > 200, testo: () => 'Introduciamo tre tariffe (Light, Standard, Flex) per ogni classe: chi vuole flessibilità paga di più. Stimo +5% di ricavi per biglietto.', costo: () => 0, fai: G => { G.tariffe.famiglie = true; return ok('Tariffe Light, Standard e Flex introdotte'); } },
    { ruolo: 'coo', id: 'puntualita', se: G => !G.mod.puntualita && puntualitaUltimi(G, 14) < 0.85 && G.stat.voli > 50, testo: G => `La puntualità è al ${Math.round(puntualitaUltimi(G, 14) * 100)}%. Con un programma puntualità (squadre di rampa dedicate, procedure) tagliamo i ritardi di un quarto.`, costo: () => D.PROGETTI.puntualita.costo, progetto: 'puntualita' },
    { ruolo: 'coo', id: 'hangar', se: G => !G.mod.hangar && flottaAttiva(G).length >= 6 && G.cassa > 6e6, testo: () => 'Con questa flotta conviene un hangar nostro: le ispezioni costerebbero il 30% in meno.', costo: () => D.PROGETTI.hangar.costo, progetto: 'hangar' },
    { ruolo: 'coo', id: 'riserve', se: G => copertura(G).scoperte > 0 && A.stimaMancanti(G, true).n > 0, testo: G => `${copertura(G).scoperte} turni sono senza equipaggio. Assumiamo subito tramite agenzia (operativi in 2 giorni)?`, costo: G => A.stimaMancanti(G, true).costo, fai: G => A.assumiMancanti(G, true) },
    { ruolo: 'coo', id: 'aereo', se: G => { const S = statRecenti(G, 14); let p = 0, s = 0; for (const r of Object.values(S.rotte)) { p += r.pax; s += r.posti; } const m = modelloPiuUsato(G); return s && p / s > 0.86 && m && G.cassa > MOD[m].leasing * 60 && { m }; }, testo: (G, d) => `Gli aerei volano quasi pieni: prendiamo un altro ${MOD[d.m].nome} in leasing (${eur(MOD[d.m].leasing)} al giorno, consegna in 30 giorni)?`, costo: (G, d) => MOD[d.m].leasing * 30, fai: (G, d) => A.compraNuovo(G, d.m, 'leasing', G.basi[0], cabinaStandard(d.m)) },
    { ruolo: 'cmo', id: 'fedelta', se: G => !G.mod.fedelta && G.stat.voli > 300, testo: () => 'Un programma fedeltà terrebbe con noi i viaggiatori d’affari: +12% di clienti Business e Premium.', costo: () => D.PROGETTI.fedelta.costo, progetto: 'fedelta' },
    { ruolo: 'cmo', id: 'rebranding', se: G => G.reputazione < 42 && !G.direzione.progetti.some(p => p.tipo === 'rebranding' && G.ora - p.inizio < 180 * GIORNO), testo: G => `La reputazione è ${Math.round(G.reputazione)}/100. Una nuova immagine del marchio la farebbe risalire di 8 punti.`, costo: () => D.PROGETTI.rebranding.costo, progetto: 'rebranding' },
    { ruolo: 'cmo', id: 'sponsor', se: G => G.cassa > 3e6 && !G.direzione.progetti.some(p => p.tipo === 'sponsor' && G.ora - p.inizio < 90 * GIORNO), testo: () => 'La squadra di calcio della città cerca uno sponsor di maglia: visibilità e +4 di reputazione.', costo: () => D.PROGETTI.sponsor.costo, progetto: 'sponsor' },
    { ruolo: 'cmo', id: 'lancio', se: G => { const k = Object.keys(G.rotte).find(k => G.ora - G.rotte[k].aperta < 20 * GIORNO && !(G.campagne || []).some(c => c.obiettivo === k)); return k && { k }; }, testo: (G, d) => `La rotta ${d.k.replace('-', '–')} è nuova: una campagna online di 14 giorni (1.500 € al giorno) la farebbe conoscere prima.`, costo: () => 21000, fai: (G, d) => A.avviaCampagna(G, { canale: 'online', ambito: 'rotta', obiettivo: d.k, budget: 1500, giorni: 14 }) },
    { ruolo: 'cto', id: 'rm', se: G => !G.mod.rm && G.stat.voli > 150, testo: () => 'Un sistema di revenue management alza i prezzi quando i voli si riempiono: +3% subito e prezzi dinamici più spinti.', costo: () => D.PROGETTI.rm.costo, progetto: 'rm' },
    { ruolo: 'cto', id: 'app', se: G => !G.mod.app && G.stat.voli > 80, testo: () => 'App e check-in online: meno personale ai banchi (handling −15%) e più servizi extra venduti.', costo: () => D.PROGETTI.app.costo, progetto: 'app' },
    { ruolo: 'cto', id: 'wifi', se: G => !G.mod.wifi && flottaAttiva(G).length >= 2, testo: G => `Installiamo il Wi‑Fi satellitare: ${eur(80000 * flottaAttiva(G).length)} per la flotta, poi lo vendiamo o lo regaliamo ai passeggeri.`, costo: G => 80000 * flottaAttiva(G).length, progetto: 'wifi' },
    { ruolo: 'cto', id: 'predittiva', se: G => !G.mod.predittiva && flottaAttiva(G).length >= 4, testo: () => 'Sensori e analisi dei dati di volo: i guasti calano del 40%.', costo: () => D.PROGETTI.predittiva.costo, progetto: 'predittiva' },
    { ruolo: 'cto', id: 'sito', se: G => !G.mod.sito && G.stat.voli > 30, testo: () => 'Il sito di prenotazione è vecchio: con uno nuovo vendiamo di più direttamente (+3% di domanda su tutte le rotte).', costo: () => D.PROGETTI.sito.costo, progetto: 'sito' }
  ];
  const costoCopertura = G => Math.round(flottaAttiva(G).reduce((s, a) => s + MOD[a.modello].consumo * 9, 0) * 180 * 0.02 * G.carburante / 1000) * 1000 || 20000;
  const fissiTot = G => Object.values(costiFissi(G)).reduce((s, x) => s + x, 0);
  const prestitoProposto = G => Math.min(A.limitePrestito(G), Math.max(1e6, Math.round(fissiTot(G) * 30 / 1e5) * 1e5));
  const dividendoProposto = G => Math.round(Math.max(0, utileUltimi(G, 30)) * 0.3 / 1e4) * 1e4 || 100000;
  const utileUltimi = (G, n) => G.storico.slice(-n).reduce((s, x) => s + x.utile, 0);
  const puntualitaUltimi = (G, n) => { const u = G.storico.slice(-n), v = u.reduce((s, x) => s + x.voli, 0); return v ? u.reduce((s, x) => s + x.puntuali, 0) / v : 1; };
  function modelloPiuUsato(G) { const c = {}; for (const a of flottaAttiva(G)) c[a.modello] = (c[a.modello] || 0) + 1; return Object.entries(c).sort((x, y) => y[1] - x[1])[0]?.[0]; }
  // contrari: un altro dirigente si oppone se la proposta costa troppo rispetto alla cassa
  function obiezione(G, p) {
    if (p.ruolo !== 'cfo' && p.costo > 0 && G.cassa - p.costo < 10 * fissiTot(G)) return { ruolo: 'cfo', testo: `Contraria/o: dopo questa spesa la cassa coprirebbe solo ${Math.max(0, Math.floor((G.cassa - p.costo) / Math.max(1, fissiTot(G))))} giorni di costi fissi.` };
    if (p.id === 'tagli') return { ruolo: 'coo', testo: 'Contraria/o: con il morale basso aumentano ritardi e scioperi.' };
    if (p.id === 'rotta' && copertura(G).scoperte) return { ruolo: 'coo', testo: 'Attenzione: abbiamo già turni senza equipaggio, prima sistemiamo quelli.' };
    if (p.id === 'prezzi' && G.strategia === 'lowcost') return { ruolo: 'cmo', testo: 'Siamo una low cost: alzare troppo i prezzi rovina il nostro posizionamento.' };
    return null;
  }
  function convocaRiunione(G) {
    const R = G.direzione;
    if (R.riunione && !R.riunione.chiusa) for (const p of R.riunione.proposte) if (!p.esito) { p.esito = 'rimandata'; R.verbale.unshift({ t: G.ora, id: p.id, ruolo: p.ruolo, titolo: p.testo, esito: 'Scaduta senza decisione', dati: p.dati?.k }); }
    if (R.verbale.length > 80) R.verbale.length = 80;
    const proposte = [];
    for (const ruolo of Object.keys(D.DIRIGENTI)) {
      const cand = PROPOSTE.filter(x => x.ruolo === ruolo && !(x.progetto && (G.mod[x.progetto] && !['sponsor', 'rebranding', 'tagli'].includes(x.progetto))));
      const recenti = new Set(R.verbale.filter(v => G.ora - v.t < (v.esito === 'Bocciata' ? 42 : 14) * GIORNO).map(v => v.id));
      for (const x of cand.sort(() => rnd() - 0.5)) {
        if (recenti.has(x.id)) continue;
        let d; try { d = x.se(G); } catch { d = null; } if (!d) continue;
        const dati = d === true ? null : d, costo = x.costo(G, dati);
        const p = { id: x.id, ruolo, testo: x.testo(G, dati), costo, dati, progetto: x.progetto || null };
        p.contro = obiezione(G, p);
        proposte.push(p); break;
      }
    }
    R.riunione = { t: G.ora, proposte, chiusa: !proposte.length };
    if (proposte.length) notizia(G, `Riunione di direzione: ${proposte.length} ${proposte.length === 1 ? 'proposta' : 'proposte'} sul tavolo (pagina Direzione).`, 'info', true);
  }
  function decidi(G, i, si) {
    const R = G.direzione, p = R.riunione && R.riunione.proposte[i]; if (!p || p.esito) return err('Proposta non più valida');
    const dir = R.dirigenti[p.ruolo];
    let r = ok('Proposta bocciata');
    if (si) {
      const x = PROPOSTE.find(q => q.id === p.id);
      r = x.progetto ? avviaProgetto(G, x.progetto) : x.fai(G, p.dati);
      if (r.errore) return r;
      dir.umore = Math.min(100, dir.umore + 6); dir.n++;
      if (p.contro) { const c = R.dirigenti[p.contro.ruolo]; c.umore = Math.max(0, c.umore - 3); }
    } else {
      dir.umore = Math.max(0, dir.umore - 7);
      if (dir.umore < 15) dimissioni(G, p.ruolo);
    }
    p.esito = si ? 'approvata' : 'bocciata';
    R.verbale.unshift({ t: G.ora, id: p.id, ruolo: p.ruolo, titolo: p.testo, esito: si ? 'Approvata' : 'Bocciata', dati: p.dati?.k });
    if (R.verbale.length > 80) R.verbale.length = 80;
    if (R.riunione.proposte.every(q => q.esito)) R.riunione.chiusa = true;
    return si ? ok(r.msg || 'Approvata') : r;
  }
  function dimissioni(G, ruolo) {
    const d = G.direzione.dirigenti[ruolo], nomi = D.DIRIGENTI[ruolo].nomi, vecchio = d.nome;
    d.nome = nomi[(nomi.indexOf(vecchio) + 1) % nomi.length]; d.umore = 60; d.n = 0; d.abilita = 2 + Math.floor(rnd() * 2); d.stipendio = BASE_DIR; d.dal = G.ora;
    G.reputazione = Math.max(0, G.reputazione - 1);
    notizia(G, `${vecchio} (${D.DIRIGENTI[ruolo].ruolo}) si dimette: troppe proposte bocciate. Al suo posto arriva ${d.nome}.`, 'cattiva', true);
  }

  // ---------- Consiglio di amministrazione: obiettivi semestrali ----------
  function nuovoSemestre(G) {
    const u30 = utileUltimi(G, 30), base = u30 > 0 ? Math.max(5e5, Math.round(u30 * 6 * 1.1 / 1e5) * 1e5) : 0;
    G.cda.semestre = { inizio: G.ora, fine: G.ora + 180 * GIORNO, utileDa: G.stat.utile, obiettivi: [
      { tipo: 'utile', t: base ? `Utile del semestre oltre ${eur(base)}` : 'Chiudere il semestre in utile', target: base },
      { tipo: 'puntualita', t: 'Puntualità media dell’85%', target: 0.85 },
      { tipo: 'reputazione', t: `Reputazione a ${Math.min(90, Math.round(G.reputazione) + 5)}`, target: Math.min(90, Math.round(G.reputazione) + 5) }] };
  }
  function statoCda(G) {
    const S = G.cda.semestre; if (!S) return [];
    const st = G.storico.filter(x => x.t >= mezzanotte(S.inizio)), v = st.reduce((s, x) => s + x.voli, 0), punt = v ? st.reduce((s, x) => s + x.puntuali, 0) / v : 0;
    const utile = G.stat.utile - S.utileDa;
    return S.obiettivi.map(o => {
      if (o.tipo === 'utile') return { ...o, valore: utile, v: o.target ? utile / o.target : utile > 0 ? 1 : 0, s: eur(utile) };
      if (o.tipo === 'puntualita') return { ...o, valore: punt, v: punt / o.target, s: Math.round(punt * 100) + '%' };
      return { ...o, valore: G.reputazione, v: G.reputazione / o.target, s: Math.round(G.reputazione) + '' };
    });
  }
  function chiudiSemestre(G) {
    const st = statoCda(G), fatti = st.filter(o => o.v >= 1).length, delta = [-20, -6, 8, 15][fatti];
    G.cda.fiducia = clamp(G.cda.fiducia + delta, 0, 100);
    G.cda.storico.unshift({ t: G.ora, fatti, delta, obiettivi: st.map(o => ({ t: o.t, s: o.s, ok: o.v >= 1 })) });
    notizia(G, `Il CdA chiude il semestre: ${fatti} obiettivi su 3 raggiunti. Fiducia ${delta > 0 ? '+' : ''}${delta} (ora ${Math.round(G.cda.fiducia)}/100).${G.cda.fiducia < 25 ? ' Il CdA è molto scontento: le banche alzano i tassi.' : ''}`, fatti >= 2 ? 'buona' : 'cattiva', true);
    if (G.cda.fiducia < 20) mozioneSfiducia(G);
    nuovoSemestre(G);
  }

  // ---------- Borsa ----------
  const AZIONI = 100e6;
  function valoreEquo(G) {
    const u = utileUltimi(G, 90) / Math.max(1, Math.min(90, G.storico.length)) * 365;
    return Math.max(valoreCompagnia(G), u * 10 + Math.max(0, G.cassa) - debitoTot(G), 5e6) * (0.75 + G.cda.fiducia / 200) * (0.9 + G.reputazione / 500);
  }
  function aggiornaBorsa(G) {
    const B = G.borsa; if (!B.quotata) return;
    const equo = valoreEquo(G) / B.azioni;
    B.prezzo = Math.max(0.05, B.prezzo + (equo - B.prezzo) * 0.06 + B.prezzo * (rnd() - 0.5) * 0.035);
    B.storico.push({ t: G.ora, p: B.prezzo }); if (B.storico.length > 400) B.storico.shift();
  }

  // ---------- Ciclo: chiamate dal giornaliero e dall'orario ----------
  function giornoGestione(G) {
    aggiornaEconomia(G); concludiRicerche(G); concludiProgetti(G); eseguiMosseRivali(G); aggiornaBorsa(G);
    if (G.copertura && G.ora > G.copertura.fine) { delete G.copertura; notizia(G, 'Scaduta la copertura sul prezzo del cherosene.', 'info'); }
    if (G.mod.tagli && G.mod.tagli !== true && G.ora > G.mod.tagli) delete G.mod.tagli;
    if (G.cda.semestre && G.ora >= G.cda.semestre.fine) chiudiSemestre(G);
  }

  /* ---------- Eventi a scelta (dilemmi): ogni tanto una decisione con 2-3 opzioni ---------- */
  const DILEMMI = [
    { id: 'sindacato', se: G => !G.lavoro && G.equipaggi.length >= 4 && G.morale < 70, crea: G => ({ titolo: 'Il sindacato dei piloti chiede un aumento', testo: `I rappresentanti di piloti e assistenti di volo chiedono un aumento del 5%. Il morale è ${Math.round(G.morale)}/100.`, opzioni: [
      { t: 'Concedi l’aumento del 5%', d: 'Stipendi +5% per sempre, morale +10' },
      { t: `Offri un premio una tantum (${eur(totPersonale(G) * 800)})`, d: 'Morale +5, nessun costo fisso in più' },
      { t: 'Rifiuta', d: 'Morale −10 e rischio di sciopero nei prossimi giorni' }] }),
      fai: (G, i) => {
        if (i === 0) { G.stipendio = Math.round((G.stipendio + 0.05) * 100) / 100; G.morale = Math.min(100, G.morale + 10); return 'Aumento concesso: il sindacato ringrazia.'; }
        if (i === 1) { paga(G, totPersonale(G) * 800, 'personale'); G.morale = Math.min(100, G.morale + 5); return 'Premio distribuito: trattativa chiusa.'; }
        G.morale = Math.max(0, G.morale - 10);
        if (rnd() < 0.5) { const t = giornoDopo(mezzanotte(G.ora), 2 + Math.floor(rnd() * 4)); G.eventi.push({ tipo: 'sciopero', inizio: t, fine: t + GIORNO, testo: 'Sciopero del personale' }); return `Il sindacato proclama uno sciopero per il ${dataDi(t)}.`; }
        return 'Il sindacato protesta, ma per ora niente sciopero.';
      } },
    { id: 'touroperator', se: G => Object.keys(G.rotte).some(k => k.split('-').some(i => AP[i].tur > 0.5) && rotteInEsercizio(G).has(k)), crea: G => {
      const k = Object.keys(G.rotte).filter(k => k.split('-').some(i => AP[i].tur > 0.5) && rotteInEsercizio(G).has(k)).sort(() => rnd() - 0.5)[0], r = G.rotte[k], incasso = Math.round(30 * 45 * r.pY * 0.6 / 1000) * 1000;
      return { dati: { k, incasso }, titolo: 'Un tour operator vuole comprare posti in blocco', testo: `Propone di acquistare 30 posti al giorno su ${k.replace('-', '–')} per 45 giorni, pagando subito ${eur(incasso)} (il 40% in meno del tuo prezzo).`, opzioni: [
        { t: `Accetta (+${eur(incasso)} subito)`, d: 'Incasso immediato, ma per 45 giorni vendi meno biglietti a prezzo pieno su quella rotta' },
        { t: 'Rifiuta', d: 'Nessun effetto' }] };
    }, fai: (G, i, d) => {
      if (i === 1) return 'Offerta rifiutata.';
      G.cassa += d.incasso; G.oggi.ricavi += d.incasso;
      for (const x of d.k.split('-')) G.eventi.push({ tipo: 'domanda', citta: AP[x].citta, fattore: 0.85, inizio: G.ora, fine: G.ora + 45 * GIORNO, testo: 'Posti venduti al tour operator' });
      return `Contratto firmato: ${eur(d.incasso)} incassati.`;
    } },
    { id: 'social', se: G => G.stat.voli > 100, crea: G => ({ titolo: 'Polemica sui social', testo: 'Il video di un passeggero bloccato per ore al gate di uno dei tuoi voli sta facendo il giro dei social.', opzioni: [
      { t: 'Scuse pubbliche e rimborso (50.000 €)', d: 'Reputazione +1' },
      { t: 'Campagna di comunicazione (150.000 €)', d: 'Reputazione +3' },
      { t: 'Non commentare', d: 'Reputazione −4' }] }),
      fai: (G, i) => { if (i === 0) { paga(G, 50000, 'marketing'); G.reputazione = Math.min(100, G.reputazione + 1); return 'Le scuse sono state apprezzate.'; } if (i === 1) { paga(G, 150000, 'marketing'); G.reputazione = Math.min(100, G.reputazione + 3); return 'La campagna ha ribaltato la storia.'; } G.reputazione = Math.max(0, G.reputazione - 4); return 'Il silenzio è stato notato: reputazione in calo.'; } },
    { id: 'usato', se: G => G.cassa > 15e6, crea: G => { const mod = modelloPiuUsato(G) || 'A320', prezzo = Math.round(MOD[mod].prezzo * 0.45 / 1e5) * 1e5;
      return { dati: { mod, prezzo }, titolo: 'Occasione: un aereo da una compagnia fallita', testo: `Il curatore fallimentare vende un ${MOD[mod].nome} di 12 anni a ${eur(prezzo)}, meno della metà del prezzo di listino. Offerta valida 3 giorni.`, opzioni: [
        { t: `Compra (${eur(prezzo)})`, d: 'Consegna in 7 giorni alla tua base principale, cabina standard' }, { t: 'Lascia perdere', d: 'Nessun effetto' }] }; },
      fai: (G, i, d) => { if (i === 1) return 'Occasione lasciata ad altri.'; if (G.cassa < d.prezzo) return 'Cassa insufficiente: l’aereo è andato a un concorrente.'; G.cassa -= d.prezzo; const ae = aggiungiAereo(G, d.mod, 'proprieta', G.basi[0], { eta: 12, ore: 30000, prezzo: d.prezzo, consegna: G.ora + 7 * GIORNO, oreDaCheck: 300 }); return `${MOD[d.mod].nome} ${ae.marche} acquistato: arriva tra 7 giorni.`; } },
    { id: 'banca', se: G => debitoTot(G) > 5e6 && G.cda.fiducia > 40, crea: G => ({ titolo: 'La banca propone di rinegoziare i debiti', testo: `Su ${eur(debitoTot(G))} di debiti la banca offre un tasso più basso di 1,5 punti, con una commissione dell’1%.`, opzioni: [
      { t: `Accetta (commissione ${eur(debitoTot(G) * 0.01)})`, d: 'Interessi più bassi per tutta la durata dei prestiti' }, { t: 'Rifiuta', d: 'Nessun effetto' }] }),
      fai: (G, i) => { if (i === 1) return 'Nessuna rinegoziazione.'; paga(G, Math.round(debitoTot(G) * 0.01), 'interessi'); for (const d of G.debiti) d.tasso = Math.max(0.02, d.tasso - 0.015); return 'Debiti rinegoziati: tassi più bassi.'; } },
    { id: 'sciopero-aeroporto', se: G => G.basi.length > 0 && G.stat.voli > 50, crea: G => ({ dati: { b: G.basi[0] }, titolo: `Sciopero dei servizi a terra a ${G.basi[0]}`, testo: `Domani il personale di terra dell’aeroporto di ${AP[G.basi[0]].citta} sciopera. Puoi assumere personale esterno per garantire i voli.`, opzioni: [
      { t: 'Personale esterno (80.000 €)', d: 'I voli partono regolarmente' }, { t: 'Accetta i disagi', d: 'Molti voli di domani verranno cancellati' }] }),
      fai: (G, i, d) => { if (i === 0) { paga(G, 80000, 'altro'); return 'Personale esterno ingaggiato: domani si vola.'; } const t = giornoDopo(mezzanotte(G.ora)); G.eventi.push({ tipo: 'sciopero', inizio: t, fine: t + GIORNO, testo: `Sciopero a ${d.b}` }); return 'Domani ci saranno cancellazioni per lo sciopero.'; } },
    { id: 'regione', se: G => Object.keys(G.rotte).length >= 3, crea: G => ({ titolo: 'L’ente del turismo propone una campagna insieme', testo: 'La regione paga metà di una campagna online su tutta la tua rete per due settimane (3.000 € al giorno).', opzioni: [
      { t: 'Accetta (paghi 21.000 €)', d: 'Più passeggeri su tutte le rotte per qualche settimana' }, { t: 'Rifiuta', d: 'Nessun effetto' }] }),
      fai: (G, i) => { if (i === 1) return 'Proposta rifiutata.'; const r = A.avviaCampagna(G, { canale: 'online', ambito: 'rete', budget: 3000, giorni: 14 }); if (r.errore) return r.errore; G.cassa += 21000; return 'Campagna congiunta avviata: la regione paga metà.'; } },
    { id: 'fornitore', se: G => !G.copertura && flottaAttiva(G).length >= 3, crea: G => ({ titolo: 'Un fornitore offre il cherosene a prezzo fisso', testo: `Contratto di un anno a ${(G.carburante * 1.03).toFixed(2)} €/kg (oggi ${G.carburante.toFixed(2)}). Ti protegge dai rialzi, ma se il prezzo scende paghi di più.`, opzioni: [
      { t: 'Firma per un anno', d: 'Prezzo del cherosene bloccato per 365 giorni' }, { t: 'Rifiuta', d: 'Resti esposto al mercato' }] }),
      fai: (G, i) => { if (i === 1) return 'Contratto rifiutato.'; G.copertura = { prezzo: G.carburante * 1.03, fine: G.ora + 365 * GIORNO }; return 'Prezzo del cherosene bloccato per un anno.'; } }
  ];
  function nuovoDilemma(G) {
    if (G.dilemma || G.ora - G.inizio < 12 * GIORNO || (G.ultimoDilemma && G.ora - G.ultimoDilemma < 9 * GIORNO) || rnd() > 0.2) return;
    const cand = DILEMMI.filter(x => x.id !== G.dilemmaPrec && (() => { try { return x.se(G); } catch { return false; } })());
    if (!cand.length) return;
    const x = cand[Math.floor(rnd() * cand.length)], c = x.crea(G);
    G.dilemma = { id: x.id, ...c, t: G.ora, scade: G.ora + 3 * GIORNO };
    G.ultimoDilemma = G.ora; G.dilemmaPrec = x.id;
    notizia(G, `Decisione da prendere: ${c.titolo}.`, 'info', true);
  }
  function scegliDilemma(G, i) {
    const d = G.dilemma; if (!d) return err('Nessuna decisione in sospeso');
    const x = DILEMMI.find(y => y.id === d.id); i = clamp(Math.round(i), 0, d.opzioni.length - 1);
    const esito = x.fai(G, i, d.dati); G.dilemma = null;
    (G.decisioni ||= []).unshift({ t: G.ora, titolo: d.titolo, scelta: d.opzioni[i].t, esito }); if (G.decisioni.length > 40) G.decisioni.length = 40;
    notizia(G, `${d.titolo}: ${esito}`, 'info');
    return ok(esito);
  }
  function controllaDilemma(G) { if (G.dilemma && G.ora >= G.dilemma.scade) { const n = G.dilemma.opzioni.length - 1; scegliDilemma(G, n); notizia(G, 'Non hai deciso in tempo: è stata scelta l’ultima opzione.', 'cattiva'); } nuovoDilemma(G); }

  /* ---------- Concorrenti: salute, alleanze, acquisizioni, fusioni tra rivali ---------- */
  const LIVELLI_ALLEANZA = {
    pace: { nome: 'Non belligeranza', quotidiano: 300, avvio: 0, soglia: 45, descr: 'Niente guerre dei prezzi né attacchi alle rotte tra voi.' },
    codeshare: { nome: 'Codeshare', quotidiano: 1500, avvio: 50000, soglia: 55, descr: 'Come la non belligeranza, in più vi vendete a vicenda i voli: +6% di domanda sulle tue rotte che toccano le città del partner.' }
  };
  const QUOTA_JV = 0.15, AVVIO_JV = 100000;
  const NUOVI_RIVALI = [
    { nome: 'Zefiro Airways', colore: '#d9480f', prezzo: 0.85 }, { nome: 'Atlantica', colore: '#1864ab', prezzo: 1.05 },
    { nome: 'Boreal Wings', colore: '#5f3dc4', prezzo: 0.95 }, { nome: 'Sirocco Air', colore: '#e8590c', prezzo: 0.8 }, { nome: 'Aurora Sky', colore: '#0c8599', prezzo: 1.15 }
  ];
  const alleanza = (G, rid) => (G.alleanze || {})[rid];
  const alleato = (G, rid) => !!alleanza(G, rid) || (!!G.globale && (G.rivali.find(r => r.id === rid) || {}).globale === G.globale);
  const jvSu = (G, k) => (G.jv || []).find(j => j.k === k);
  function initRivali(G) {
    G.alleanze ||= {}; G.jv ||= []; G.acquisizioni ||= [];
    for (const R of G.rivali) { R.forza ??= clamp(55 + (R.rep - 55) * 0.6, 25, 80); if (R.globale === undefined) R.globale = Object.entries(ALLEANZE_G).find(([, x]) => x.membri.includes(R.id))?.[0] || null; }
  }
  // aerei che servono a un rivale per volare la sua rete (stima per l'acquisizione)
  function flottaRivale(R) {
    const ore = {};
    for (const [k, x] of Object.entries(R.rotte)) {
      const [a, b] = k.split('-'), d = km(a, b), mod = d > 6000 ? 'B789' : d > 4500 ? 'A21X' : d < 700 && x.freq >= 3 ? 'A319' : 'A320';
      ore[mod] = (ore[mod] || 0) + x.freq * 2 * (durata(d, mod) + (MOD[mod].lungo ? 90 : 45));
    }
    return Object.entries(ore).map(([mod, min]) => ({ mod, n: Math.max(1, Math.round(min / (MOD[mod].lungo ? 20 * 60 : 15 * 60))) }));
  }
  function valoreRivale(G, R) {
    const fl = flottaRivale(R), aerei = fl.reduce((s, x) => s + x.n * MOD[x.mod].prezzo * 0.5, 0), rotte = Object.keys(R.rotte).length;
    const base = aerei + rotte * 2.5e6 + (AP[R.hub].slot ? 8 * AP[R.hub].slotPrezzo : 0);
    return Math.round(base * (0.55 + R.forza / 110) * (0.8 + R.rep / 250) / 1e5) * 1e5;
  }
  const prezzoAcquisto = (G, R) => Math.round(valoreRivale(G, R) * (R.crisi ? 0.85 : R.forza > 60 ? 1.35 : 1.15) * (1 - (R.miaQuota || 0)) / 1e5) * 1e5;
  // la salute dei rivali cambia ogni settimana: economia, guerre dei prezzi, concorrenza con te
  function settimanaSaluteRivali(G) {
    initRivali(G);
    const pick = a => a[Math.floor(rnd() * a.length)];
    for (const R of G.rivali.slice()) {
      let f = R.forza;
      const C0 = contiRivale(G, R); R.cassa = (R.cassa ?? valoreRivale(G, R) * 0.15) + 7 * C0.utile; R.conti = { ricavi: Math.round(C0.ricavi), utile: Math.round(C0.utile), lf: C0.lf };
      const obiettivo = clamp(50 + (C0.ricavi ? C0.utile / C0.ricavi : -0.5) * 150 + clamp(R.cassa / Math.max(1, C0.ricavi * 30) * 10, -25, 20), 0, 95);
      f = f * 0.65 + obiettivo * 0.35 + ((G.economia?.[AP[R.hub].continente] || 1) - 1) * 20 + (rnd() - 0.5) * 3;
      if (!alleato(G, R.id)) for (const [k, x] of Object.entries(R.rotte)) {
        const mio = G.rotte[k], [a0, b0] = k.split('-');
        if (mio && mieFreqDir(G, a0, b0) > 0 && mio.pY < prezzoRif(km(a0, b0)) * x.prezzo * 0.88 && (x.margine ?? 0) > -0.3 && !x.guerraFino && rnd() < 0.3) { x.prezzo = Math.max(0.55, x.prezzo * 0.92); rancore(G, R, 4); notizia(G, `${R.nome} abbassa le tariffe su ${k.replace('-', '–')} per rispondere ai tuoi prezzi.`, 'cattiva'); }
        if ((x.lf ?? 0) > 0.88 && R.cassa > 0 && x.freq < 8 && rnd() < 0.4) x.freq++;
        else if ((x.margine ?? 0) < -0.15 && rnd() < 0.4) { x.freq--; if (x.freq <= 0) { delete R.rotte[k]; notizia(G, `${R.nome} chiude la rotta ${k.replace('-', '–')}: non le rendeva.`, 'buona'); } }
      }
      for (const [k, x] of Object.entries(R.rotte)) {
        if (x.guerraFino) f -= 1.5;
        const r = G.rotte[k]; if (r && (r.quota || 0) > 0.5) f -= 1.2;
      }
      if (Object.keys(R.rotte).length < 3) f -= 3;
      R.forza = clamp(f, 0, 95);
      if (R.forza < 18 && !R.crisi) { R.crisi = true; notizia(G, `${R.nome} è in difficoltà finanziarie: la compagnia è in vendita a prezzo scontato (pagina Concorrenza).`, 'info', true); }
      if (R.crisi && R.forza > 30) { R.crisi = false; notizia(G, `${R.nome} si è ripresa e non è più in vendita a sconto.`, 'info'); }
      if (R.forza < 6) {
        const altri = G.rivali.filter(x => x !== R && x.forza > 40);
        if (altri.length && rnd() < 0.6) { const B = altri.sort((x, y) => y.forza - x.forza)[0]; fondiRivali(G, B, R); notizia(G, `${B.nome} compra ${R.nome}: le sue rotte passano a ${B.nome}.`, 'cattiva', true); }
        else { rimuoviRivale(G, R); notizia(G, `${R.nome} fallisce: ${Object.keys(R.rotte).length} rotte restano senza il suo servizio. I suoi passeggeri cercano un’altra compagnia.`, 'buona', true); }
      }
    }
    // alleanze tra rivali
    const liberi = G.rivali.filter(R => !R.alleato);
    if (liberi.length >= 2 && rnd() < 0.04) {
      const A1 = pick(liberi), A2 = pick(liberi.filter(x => x !== A1)); A1.alleato = A2.id; A2.alleato = A1.id;
      notizia(G, `${A1.nome} e ${A2.nome} firmano un’alleanza: saranno più forti sulle loro reti.`, 'cattiva', true);
    }
    // nuovi concorrenti se il mercato si svuota
    if (G.rivali.length < 4 && rnd() < 0.12) {
      const nomi = NUOVI_RIVALI.filter(x => !G.rivali.some(R => R.nome === x.nome)); if (nomi.length) {
        const X = pick(nomi), hub = pick(Object.keys(AP).filter(i => AP[i].pop > 2000 && !G.basi.includes(i) && !G.rivali.some(R => R.hub === i)));
        if (hub) {
          const dest = Object.keys(AP).filter(i => i !== hub && km(hub, i) < 2500 && km(hub, i) > 300).sort(() => rnd() - 0.5).slice(0, 5);
          const R = { id: 'n' + (G.seq++), nome: X.nome, colore: X.colore, hub, rep: 50, prezzo: X.prezzo, forza: 50, rotte: Object.fromEntries(dest.map(d => [chiave(hub, d), { freq: 2, prezzo: X.prezzo }])) };
          G.rivali.push(R); notizia(G, `Nasce una nuova compagnia: ${R.nome}, con base a ${AP[hub].citta} e ${dest.length} rotte.`, 'info', true);
        }
      }
    }
  }
  function rimuoviRivale(G, R) {
    G.rivali = G.rivali.filter(x => x !== R);
    for (const x of G.rivali) if (x.alleato === R.id) delete x.alleato;
    G.mosseRivali = (G.mosseRivali || []).filter(m => m.riv !== R.id);
    if (G.alleanze && G.alleanze[R.id]) delete G.alleanze[R.id];
    G.jv = (G.jv || []).filter(j => j.riv !== R.id);
  }
  function fondiRivali(G, B, R) {
    for (const [k, x] of Object.entries(R.rotte)) { const y = B.rotte[k]; B.rotte[k] = { freq: Math.max(x.freq, y ? y.freq : 0), prezzo: B.prezzo }; }
    B.forza = clamp(B.forza + 8, 0, 95); rimuoviRivale(G, R);
  }

  // ---------- Alleanze con te ----------
  function disponibilita(G, R, livello) {
    const guerre = Object.values(R.rotte).filter(x => x.guerraFino).length;
    let s = 56 + (G.reputazione - R.rep) * 0.5 + (R.forza < 35 ? 20 : 0) - guerre * 15 + (G.cda?.fiducia ?? 60) * 0.1 - 6 - (R.ceo?.rancore || 0) * 0.3;
    if (livello === 'codeshare' && !alleato(G, R.id)) s -= 10;
    return Math.round(s);
  }
  function proponiAlleanza(G, rid, livello) {
    initRivali(G);
    const R = G.rivali.find(x => x.id === rid), L = LIVELLI_ALLEANZA[livello]; if (!R || !L) return err('Proposta non valida');
    const A0 = alleanza(G, rid); if (A0 && (A0.livello === livello || (A0.livello === 'codeshare' && livello === 'pace'))) return err('Avete già questo accordo');
    if (R.rifiutoFino && G.ora < R.rifiutoFino) return err(`${R.nome} ha rifiutato da poco: riprova dopo il ${dataDi(R.rifiutoFino)}`);
    if (G.cassa < L.avvio) return err(`Servono ${eur(L.avvio)}`);
    const s = disponibilita(G, R, livello) + (rnd() - 0.5) * 16;
    if (s < L.soglia) { R.rifiutoFino = G.ora + 30 * GIORNO; return err(`${R.nome} rifiuta: ${R.rep > G.reputazione + 10 ? 'vi considera meno affidabili di loro' : Object.values(R.rotte).some(x => x.guerraFino) ? 'c’è una guerra dei prezzi in corso tra voi' : 'non vede abbastanza vantaggi'}. Potrai riprovare tra 30 giorni.`); }
    if (L.avvio) paga(G, L.avvio, 'alleanze');
    G.alleanze[rid] = { livello, inizio: G.ora };
    for (const x of Object.values(R.rotte)) if (x.guerraFino) { x.prezzo = R.prezzo; delete x.guerraFino; }
    G.mosseRivali = (G.mosseRivali || []).filter(m => !(m.riv === rid && m.attacco));
    if (R.alleato) { const X = G.rivali.find(x => x.id === R.alleato); if (X) { delete X.alleato; } delete R.alleato; }
    vendite(G);
    notizia(G, `Accordo firmato con ${R.nome}: ${L.nome.toLowerCase()}. ${L.descr}`, 'buona', true);
    return ok(`${L.nome} con ${R.nome} firmato`);
  }
  function chiudiAlleanza(G, rid) {
    const R = G.rivali.find(x => x.id === rid); if (!alleato(G, rid)) return err('Nessun accordo da chiudere');
    delete G.alleanze[rid]; G.jv = G.jv.filter(j => j.riv !== rid); G.reputazione = Math.max(0, G.reputazione - 1); R.rifiutoFino = G.ora + 60 * GIORNO;
    vendite(G); return ok(`Accordo con ${R.nome} chiuso`);
  }
  function jointVenture(G, rid, k) {
    const R = G.rivali.find(x => x.id === rid); if (!R) return err('Concorrente inesistente');
    if (alleanza(G, rid)?.livello !== 'codeshare') return err('Prima serve un codeshare con questa compagnia');
    if (!G.rotte[k] || !R.rotte[k]) return err('Dovete volare entrambi su quella rotta');
    if (jvSu(G, k)) return err('Su questa rotta c’è già una joint venture');
    if (G.cassa < AVVIO_JV) return err(`Servono ${eur(AVVIO_JV)}`);
    paga(G, AVVIO_JV, 'alleanze'); G.jv.push({ riv: rid, k, inizio: G.ora }); vendite(G);
    notizia(G, `Joint venture con ${R.nome} su ${k.replace('-', '–')}: non vi fate più concorrenza, a ${R.nome} va il ${Math.round(QUOTA_JV * 100)}% dei ricavi della rotta.`, 'buona', true);
    return ok('Joint venture avviata');
  }

  // ---------- Acquisizione di un concorrente ----------
  function acquisisci(G, rid) {
    initRivali(G);
    const R = G.rivali.find(x => x.id === rid); if (!R) return err('Concorrente inesistente');
    const prezzo = R._prezzoForzato ?? prezzoAcquisto(G, R); if (G.cassa < prezzo) return err(`Servono ${eur(prezzo)} in cassa (puoi chiedere un prestito o un aumento di capitale)`);
    { const v = serveVoto(G, 'acquisizione', prezzo, `acquisto di ${R.nome} per ${eur(prezzo)}`); if (v) return v; }
    G.cassa -= prezzo; flusso(G, 'investimenti', -prezzo);
    const hub = R.hub, nuovaBase = !G.basi.includes(hub);
    if (nuovaBase) G.basi.push(hub);
    // rotte: già avviate, ai prezzi del rivale
    let nuoveRotte = 0;
    for (const k of Object.keys(R.rotte)) if (!G.rotte[k]) {
      const [a, b] = k.split('-'), d = km(a, b), ref = prezzoRif(d) * R.prezzo;
      G.rotte[k] = { aperta: G.ora - 365 * GIORNO, pY: Math.round(ref), pW: Math.round(ref * multClasse('W', d)), pJ: Math.round(ref * multClasse('J', d)) }; nuoveRotte++;
    }
    // aerei usati con una settimana provvisoria sulle rotte dal suo hub
    const autoPrima = G.auto && G.auto.equipaggi; if (G.auto) G.auto.equipaggi = false; // il personale arriva con la compagnia
    const fl = flottaRivale(R), nuovi = [];
    for (const x of fl) for (let i = 0; i < x.n; i++) nuovi.push(aggiungiAereo(G, x.mod, 'proprieta', hub, { eta: 6 + Math.floor(rnd() * 10), ore: 15000 + rnd() * 20000, prezzo: MOD[x.mod].prezzo * 0.5, oreDaCheck: Math.round(rnd() * 300), cab: cabinaStandard(x.mod) }));
    const dalHub = Object.entries(R.rotte).filter(([k]) => k.split('-').includes(hub)).sort((x, y) => y[1].freq - x[1].freq).map(([k]) => k.split('-').find(i => i !== hub));
    let programmati = 0;
    for (const ae of nuovi) {
      const adatte = dalHub.filter(d => km(hub, d) <= MOD[ae.modello].autonomia && (MOD[ae.modello].lungo ? km(hub, d) > 4000 : km(hub, d) <= 4500)); if (!adatte.length) continue;
      const d1 = adatte[programmati % adatte.length], d2 = adatte[(programmati + 1) % adatte.length];
      const tent = MOD[ae.modello].lungo ? [{ tipo: 'lungo', dest: [d1] }] : [d2 && d2 !== d1 ? { tipo: 'alterna', dest: [d1, d2] } : null, { tipo: 'navetta', dest: [d1] }].filter(Boolean);
      for (const t of tent) {
        const r = rotazioneGuidata(G, ae.id, { ...t, base: hub }); if (!r.ok) continue;
        for (const s of r.slot) G.slot[s.i] = (G.slot[s.i] || 0) + s.n; // gli slot del rivale passano a te
        const v = salvaProgramma(G, ae.id, r.prog); if (!v.E.length) { programmati++; break; }
      }
    }
    if (AP[hub].slot) G.slot[hub] = Math.max(G.slot[hub] || 0, 4);
    // il personale del rivale entra in compagnia: equipaggi già operativi nella sua base
    let eq = 0; for (const x of pianoAssunzioni(G)) if (x.base === hub) { nuovoEquipaggio(G, { base: x.base, tipo: x.tipo, piloti: x.piloti, cabina: x.cabina, motivo: `ex ${R.nome}` }); eq++; }
    G._roster = null; if (G.auto) G.auto.equipaggi = autoPrima;
    rimuoviRivale(G, R);
    G.acquisizioni.push({ t: G.ora, nome: R.nome, prezzo, aerei: nuovi.length, rotte: nuoveRotte, hub });
    G.morale = Math.max(0, G.morale - 4); G.reputazione = Math.min(100, G.reputazione + 2);
    vendite(G);
    notizia(G, `Acquisizione completata: ${R.nome} è tua per ${eur(prezzo)}. Arrivano ${nuovi.length} aerei (${programmati} già con una settimana provvisoria), ${nuoveRotte} rotte, ${eq} equipaggi${nuovaBase ? ` e la nuova base di ${AP[hub].citta}` : ''}.`, 'buona', true);
    return ok(`${R.nome} acquisita`);
  }
  const ALLEANZE_G = { polare: { nome: 'Stella Polare', membri: ['mer', 'nst'] }, orbis: { nome: 'Orbis', membri: ['pac', 'cex'] }, meridiana: { nome: 'Meridiana Alliance', membri: ['ven', 'aqj'] } };
  const QUOTA_GLOBALE = 3e6, CANONE_GLOBALE = 15000;
  const mieFreqDir = (G, a, b) => { let f = 0; for (const x of flottaAttiva(G)) for (const l of mediaCiclo(x).tratte) if (l.da === a && l.a === b) f += l.peso; return f; };
  function contiRivale(G, R) {
    const domani = giornoDopo(mezzanotte(G.ora)); let ricavi = 0, costi = 0, posti = 0, pax = 0;
    for (const [k, x] of Object.entries(R.rotte)) {
      const [a, b] = k.split('-'), d = km(a, b), mod = d > 6000 ? 'B789' : d > 4500 ? 'A21X' : 'A320', seats = somma(cabinaStandard(mod)), mio = G.rotte[k];
      const am = analisiMercato(G, a, b, domani, mieFreqDir(G, a, b), mio ? mio.pY : prezzoRif(d)), q = am.rivali.find(y => y.riv.id === R.id)?.quota || 0;
      const paxDir = Math.min(am.mercato * q * 0.8, x.freq * seats), ric = 2 * paxDir * prezzoRif(d) * x.prezzo * 1.1, cst = 2 * x.freq * costoVoloStimato(G, mod, d, paxDir / Math.max(1, x.freq));
      x.lf = paxDir / Math.max(1, x.freq * seats); x.margine = ric ? (ric - cst) / ric : -1;
      ricavi += ric; costi += cst; posti += 2 * x.freq * seats; pax += 2 * paxDir;
    }
    const fissi = 4000 + 1500 * Object.keys(R.rotte).length;
    return { ricavi, costi: costi + fissi, utile: ricavi - costi - fissi, lf: posti ? pax / posti : 0 };
  }
  function costoAlleanze(G) { let c = G.globale ? CANONE_GLOBALE : 0; for (const a of Object.values(G.alleanze || {})) c += LIVELLI_ALLEANZA[a.livello].quotidiano; return c; }

  /* ---------- Ordini di aerei e modelli nuovi nel tempo ---------- */
  const tsData = (G, d) => d ? Date.UTC(d[0], d[1] - 1, 1, 0) - (G.fuso ?? FUSO) * ORA : 0;
  const disponibileDal = (G, mod) => tsData(G, MOD[mod].dal);
  const annunciato = (G, mod) => !MOD[mod].dal || G.ora >= disponibileDal(G, mod) - 3 * 365 * GIORNO;
  const disponibile = (G, mod) => !MOD[mod].dal || G.ora >= disponibileDal(G, mod);
  // un modello è "superato" quando esce il suo successore: perde valore più in fretta
  const superato = (G, mod) => Object.entries(MOD).some(([k, m]) => m.sostituisce === mod && disponibile(G, k));
  const SCONTO_ATTESA = { 1: 0, 12: 0.08, 24: 0.15 };
  function controllaModelli(G) {
    G.modelliUsciti ||= Object.keys(MOD).filter(k => disponibile(G, k));
    for (const k of Object.keys(MOD)) if (!G.modelliUsciti.includes(k) && disponibile(G, k)) {
      G.modelliUsciti.push(k); const m = MOD[k], v = m.sostituisce && MOD[m.sostituisce];
      notizia(G, `Entra in servizio il nuovo ${m.nome}${v ? `: consuma il ${Math.round((1 - m.consumo / m.spazio / (v.consumo / v.spazio)) * 100)}% in meno a posto del ${v.nome}, che da oggi vale meno sul mercato` : ''}.`, 'info', true);
    }
  }
  function annullaOrdine(G, id) {
    const ae = G.aerei.find(a => a.id === id); if (!ae || ae.stato !== 'consegna') return err('Ordine non trovato');
    const perso = ae.acconto || 0;
    G.aerei = G.aerei.filter(a => a !== ae); G._roster = null;
    notizia(G, `Ordine del ${MOD[ae.modello].nome} ${ae.marche} annullato${perso ? `: l’acconto di ${eur(perso)} è perso` : ''}.`, 'info');
    return ok('Ordine annullato');
  }

  /* ---------- Accordi con aeroporti e regioni ---------- */
  const NOMI_REGIONI = ['Regione', 'Ente del turismo', 'Camera di commercio', 'Provincia'];
  const scontoAeroporto = (G, iata) => { let s = 0; for (const a of G.accordi || []) if (a.tipo === 'aeroporto' && a.iata === iata) s = Math.max(s, a.sconto); return s; };
  const contributoRotta = (G, k) => { const a = (G.accordi || []).find(x => x.tipo === 'regione' && x.k === k); return a ? a.contributo : 0; };
  const voliSettDa = (G, iata) => flottaAttiva(G).filter(a => a.stato !== 'consegna').reduce((s, ae) => s + SIM_tratte(ae).filter(l => l.da === iata).length, 0);
  const voliSettRotta = (G, k) => flottaAttiva(G).filter(a => a.stato !== 'consegna').reduce((s, ae) => s + SIM_tratte(ae).filter(l => chiave(l.da, l.a) === k).length, 0);
  const SIM_tratte = ae => normalizza(ae.prog).giorni.flatMap(g => legsGiorno(ae, g, ae.prog.turn));
  function offertaAeroporto(G, iata) {
    const A = AP[iata], grande = A.slot || A.pop > 4000, base = G.basi.includes(iata);
    const sconto = grande ? 0.1 + rnd() * 0.1 : 0.35 + rnd() * 0.3, minVoli = grande ? 21 + Math.floor(rnd() * 3) * 7 : 7 + Math.floor(rnd() * 2) * 7;
    const anni = 2 + Math.floor(rnd() * 2), penale = Math.round((grande ? 600000 : 250000) / 1e4) * 1e4;
    return { id: 'o' + (G.seq++), tipo: 'aeroporto', iata, nome: `Aeroporto di ${A.citta}`, sconto: Math.round(sconto * 100) / 100, minVoli, anni, penale, scade: G.ora + 30 * GIORNO,
      testo: `${Math.round(sconto * 100)}% di sconto sulle tasse per tutti i tuoi passeggeri in partenza da ${iata} per ${anni} anni, se garantisci almeno ${minVoli} partenze a settimana${base ? '' : ' (anche senza base lì)'}.` };
  }
  function offertaRegione(G, iata) {
    const A = AP[iata], b = G.basi.filter(x => x !== iata).sort((x, y) => km(x, iata) - km(y, iata))[0]; if (!b) return null;
    const d = km(b, iata); if (d < 150 || flottaAttiva(G).every(ae => MOD[ae.modello].autonomia < d)) return null;
    const k = chiave(b, iata), ref = prezzoRif(d), contributo = Math.round((1500 + rnd() * 3000) * (A.isola ? 1.4 : 1) / 100) * 100, minVoli = 7 + Math.floor(rnd() * 2) * 7;
    const prezzoMax = Math.round(ref * (1.05 + rnd() * 0.15)), anni = 2;
    const ente = `${NOMI_REGIONI[Math.floor(rnd() * NOMI_REGIONI.length)]} di ${A.citta}`;
    return { id: 'o' + (G.seq++), tipo: 'regione', iata, k, nome: ente, contributo, minVoli, prezzoMax, anni, penale: 300000, scade: G.ora + 30 * GIORNO,
      testo: `${A.isola ? 'Continuità territoriale' : 'Sviluppo turistico'}: ${eur(contributo)} per ogni volo ${b}–${iata} per ${anni} anni, con almeno ${minVoli} voli a settimana (andata e ritorno contano entrambi) e un prezzo Economy non oltre ${eur(prezzoMax)}.` };
  }
  function nuoveOfferte(G) {
    G.offerte = (G.offerte || []).filter(o => o.scade > G.ora);
    if (G.offerte.length >= 4) return;
    const vicini = Object.keys(AP).filter(i => !G.basi.includes(i) && G.basi.some(b => km(b, i) < 3000) && !(G.accordi || []).some(a => a.iata === i));
    if (!vicini.length) return;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const o1 = offertaAeroporto(G, pick(vicini)); G.offerte.push(o1);
    const tur = vicini.filter(i => AP[i].tur > 0.45 || AP[i].isola || AP[i].pop < 1500);
    const o2 = tur.length && offertaRegione(G, pick(tur)); if (o2) G.offerte.push(o2);
    notizia(G, `Nuove proposte di accordo: ${o1.nome}${o2 ? ` e ${o2.nome}` : ''} (Commerciale › Accordi).`, 'info');
  }
  function chiediOfferta(G, iata) {
    G.richieste ||= {};
    if (G.richieste[iata] && G.ora - G.richieste[iata] < 60 * GIORNO) return err('Hai già chiesto un’offerta a questo aeroporto da poco');
    G.richieste[iata] = G.ora; G.offerte ||= [];
    const l = [offertaAeroporto(G, iata)], r = (AP[iata].tur > 0.45 || AP[iata].isola || AP[iata].pop < 1500) && !G.basi.includes(iata) ? offertaRegione(G, iata) : null; if (r) l.push(r);
    G.offerte.push(...l); return ok(`${l.length === 1 ? 'Arrivata un’offerta' : 'Arrivate due offerte'}: le trovi in Commerciale › Accordi`);
  }
  function accettaOfferta(G, id) {
    const o = (G.offerte || []).find(x => x.id === id); if (!o) return err('Offerta scaduta');
    G.offerte = G.offerte.filter(x => x !== o); G.accordi ||= [];
    G.accordi.push({ ...o, inizio: G.ora, fine: G.ora + o.anni * 365 * GIORNO, avvisi: 0, incassato: 0, risparmiato: 0 });
    vendite(G); notizia(G, `Accordo firmato con ${o.nome}. Hai 30 giorni per raggiungere ${o.minVoli} voli a settimana.`, 'buona');
    return ok('Accordo firmato');
  }
  function rifiutaOfferta(G, id) { G.offerte = (G.offerte || []).filter(x => x.id !== id); return ok('Offerta rifiutata'); }
  function recediAccordo(G, id) {
    const a = (G.accordi || []).find(x => x.id === id); if (!a) return err('Accordo inesistente');
    paga(G, a.penale, 'altro'); G.accordi = G.accordi.filter(x => x !== a); G.reputazione = Math.max(0, G.reputazione - 1);
    return ok(`Accordo con ${a.nome} chiuso: penale di ${eur(a.penale)}`);
  }
  function statoAccordo(G, a) {
    const voli = a.tipo === 'aeroporto' ? voliSettDa(G, a.iata) : voliSettRotta(G, a.k), prezzoOk = a.tipo !== 'regione' || !G.rotte[a.k] || G.rotte[a.k].pY <= a.prezzoMax;
    return { voli, ok: voli >= a.minVoli && prezzoOk, prezzoOk, grazia: G.ora - a.inizio < 30 * GIORNO };
  }
  function settimanaAccordi(G) {
    for (const a of (G.accordi || []).slice()) {
      if (G.ora >= a.fine) { G.accordi = G.accordi.filter(x => x !== a); notizia(G, `Concluso l’accordo con ${a.nome}.`, 'info'); continue; }
      const s = statoAccordo(G, a); if (s.ok || s.grazia) { a.avvisi = 0; continue; }
      a.avvisi++;
      const motivo = s.prezzoOk ? `solo ${s.voli} voli a settimana invece di ${a.minVoli}` : `prezzo Economy oltre ${eur(a.prezzoMax)}`;
      if (a.avvisi >= 2) { paga(G, a.penale, 'altro'); G.accordi = G.accordi.filter(x => x !== a); notizia(G, `${a.nome} rescinde l’accordo (${motivo}): penale di ${eur(a.penale)}.`, 'cattiva', true); }
      else notizia(G, `${a.nome}: accordo non rispettato (${motivo}). Se non sistemi entro una settimana scatta la penale di ${eur(a.penale)}.`, 'cattiva', true);
    }
  }

  /* ---------- Emissioni e carburante sostenibile ---------- */
  // quota delle emissioni da pagare: in Europa all'inizio ci sono quote gratuite che si riducono ogni anno
  let ANNO_CO2 = 2027;
  const QUOTA_CO2 = (da, a) => (AP[da].continente === 'Europa' || AP[a].continente === 'Europa' ? 1 : 0.25) * clamp(0.4 + 0.06 * (ANNO_CO2 - 2027), 0.4, 1);
  function aggiornaCo2(G) { ANNO_CO2 = loc(G.ora).getUTCFullYear(); G.co2 = clamp((G.co2 || 70) + 9 / 365 + (rnd() - 0.5) * 0.8, 40, 250); }

  /* ---------- Orario estivo e invernale ---------- */
  const stagioneDi = t => { const m = loc(t).getUTCMonth(); return m >= 3 && m <= 9 ? 'estate' : 'inverno'; };
  function controllaStagione(G) {
    const s = stagioneDi(G.ora); G.stagione ||= s;
    if (s === G.stagione) return;
    G.stagione = s; let n = 0;
    for (const ae of flottaAttiva(G)) if (ae.progAlt) {
      const p = ae.prog; ae.prog = ae.progAlt; ae.progAlt = p; delete ae._piano; n++;
      for (const k in (G.fissi || {})) if (k.startsWith(ae.id + '#')) delete G.fissi[k];
      ae.base = ae.prog.giorni[0].scali[0]; rigeneraAereo(G, ae);
    }
    G._roster = null; autoAssumi(G);
    notizia(G, `Inizia l’orario ${s === 'estate' ? 'estivo' : 'invernale'}${n ? `: ${n} aerei passano al programma ${s === 'estate' ? 'estivo' : 'invernale'}` : ''}.`, 'info', true);
  }
  function salvaStagione(G, aeId, prog) {
    const ae = G.aerei.find(a => a.id === aeId); if (!ae) return { E: ['Aereo inesistente'], W: [] };
    const v = validaProgramma(G, ae, prog); if (v.E.length) return v;
    ae.progAlt = normalizza(prog); return v;
  }

  /* ---------- Giornale mensile e bilancio annuale ---------- */
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function sommario(l) {
    const s = { pax: 0, voli: 0, canc: 0, puntuali: 0, posti: 0, ricavi: 0, costi: 0, utile: 0, extra: 0, co2: 0, dettaglio: {} };
    for (const x of l) { for (const k of ['pax', 'voli', 'canc', 'puntuali', 'posti', 'ricavi', 'costi', 'utile', 'extra', 'co2']) s[k] += x[k] || 0; for (const [k, v] of Object.entries(x.dettaglio || {})) s.dettaglio[k] = (s.dettaglio[k] || 0) + v; }
    s.lf = s.posti ? s.pax / s.posti : 0; s.punt = s.voli ? s.puntuali / s.voli : 0; return s;
  }
  function paxRivale(R) { let p = 0; for (const [k, x] of Object.entries(R.rotte)) { const [a, b] = k.split('-'), d = km(a, b); p += x.freq * 2 * 30 * (d > 5000 ? 260 : 150) * 0.8; } return Math.round(p); }
  function pubblicaGiornale(G) {
    const d = loc(G.ora), m = (d.getUTCMonth() + 11) % 12, y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    const delMese = (mm, yy) => G.storico.filter(x => { const q = loc(x.t); return q.getUTCMonth() === mm && q.getUTCFullYear() === yy; });
    const ora = sommario(delMese(m, y)), prima = sommario(delMese((m + 11) % 12, m === 0 ? y - 1 : y));
    if (!ora.voli && !ora.canc) return;
    const var_ = (a, b) => b ? Math.round((a / b - 1) * 100) : null, vp = var_(ora.pax, prima.pax), titoli = [];
    titoli.push(ora.utile >= 0 ? { tono: 'buona', t: `${G.nome} chiude ${MESI[m]} in utile`, testo: `${eur(ora.utile)} di utile su ${eur(ora.ricavi)} di ricavi${prima.voli ? `, contro ${eur(prima.utile)} del mese prima` : ''}.` }
      : { tono: 'cattiva', t: `Mese in rosso per ${G.nome}`, testo: `Perdita di ${eur(-ora.utile)} a ${MESI[m]}. ${ora.lf < 0.6 ? 'Troppi posti vuoti, dicono gli analisti.' : 'I costi corrono più dei ricavi.'}` });
    titoli.push({ tono: vp == null || vp >= 0 ? 'buona' : 'cattiva', t: `${ora.pax.toLocaleString('it-IT')} passeggeri${vp != null ? ` (${vp >= 0 ? '+' : ''}${vp}%)` : ''}`, testo: `Aerei pieni in media al ${Math.round(ora.lf * 100)}%, ${ora.voli} voli operati.` });
    titoli.push(ora.punt >= 0.85 ? { tono: 'buona', t: `Puntualità al ${Math.round(ora.punt * 100)}%`, testo: ora.canc ? `${ora.canc} voli cancellati.` : 'Nessun volo cancellato.' } : { tono: 'cattiva', t: `Ritardi: puntuale solo il ${Math.round(ora.punt * 100)}% dei voli`, testo: `${ora.canc} cancellazioni. I passeggeri protestano.` });
    const da = Date.UTC(y, m, 1) - FUSO * ORA, imp = G.notizie.filter(n => n.t >= da && n.imp && !/Riunione|Decisione da prendere|giornale|orario|tra \d+ giorni|Missione|proposte di accordo|Traguardo/i.test(n.testo)).slice(0, 4);
    for (const n of imp) titoli.push({ tono: n.tipo, t: n.testo.split(/\.\s|: /)[0].replace(/\.$/, ''), testo: n.testo });
    const classifica = [{ nome: G.nome, pax: ora.pax, tu: true }, ...G.rivali.map(R => ({ nome: R.nome, pax: paxRivale(R), colore: R.colore }))].sort((a, b) => b.pax - a.pax);
    const voto = clamp(Math.round((G.reputazione / 20 + ora.punt * 3 + (ora.utile > 0 ? 2 : 0) + (vp > 0 ? 1 : 0)) * 10) / 10, 1, 10);
    (G.giornali ||= []).unshift({ t: G.ora, mese: `${MESI[m]} ${y}`, titoli, classifica, voto, posizione: classifica.findIndex(x => x.tu) + 1 });
    if (G.giornali.length > 24) G.giornali.length = 24;
    notizia(G, `È uscito il giornale di ${MESI[m]}: ${titoli[0].t} (voto della stampa ${voto}/10).`, 'info', true);
  }
  function bilancioAnnuale(G) {
    const y = loc(G.ora).getUTCFullYear() - 1, l = G.storico.filter(x => loc(x.t).getUTCFullYear() === y); if (l.length < 20) return;
    const s = sommario(l);
    (G.bilanci ||= []).unshift({ anno: y, giorni: l.length, ...s, flotta: flottaAttiva(G).length, rotte: Object.keys(G.rotte).length, valore: Math.round(valoreCompagnia(G)), fiducia: Math.round(G.cda.fiducia) });
    notizia(G, `Bilancio ${y}: utile ${eur(s.utile)}, ${s.pax.toLocaleString('it-IT')} passeggeri, ${Math.round(s.co2).toLocaleString('it-IT')} t di CO₂. Lo trovi in Oggi › Giornale.`, s.utile >= 0 ? 'buona' : 'cattiva', true);
  }
  function giornoEspansione(G) {
    aggiornaCo2(G); controllaModelli(G); controllaStagione(G);
    const d = loc(G.ora);
    if (d.getUTCDate() === 1) { pubblicaGiornale(G); if (d.getUTCMonth() === 0) bilancioAnnuale(G); if (d.getUTCMonth() % 2 === 0) nuoveOfferte(G); }
    if (giornoSett(G.ora) === 0) settimanaAccordi(G);
  }

  /* ---------- Programma fedeltà: livelli, miglia, carta di credito ---------- */
  const ACCUMULO = { 1: { nome: '1 miglio per euro', g: -0.25 }, 2: { nome: '2 miglia per euro', g: 0 }, 3: { nome: '3 miglia per euro', g: 0.2 }, 5: { nome: '5 miglia per euro', g: 0.45 } };
  const SCADENZE = { nessuna: { nome: 'Le miglia non scadono', g: 0.1, tasso: 0 }, 36: { nome: 'Scadono dopo 36 mesi', g: 0, tasso: 0.0008 }, 24: { nome: 'Scadono dopo 24 mesi', g: -0.1, tasso: 0.0015, rep: -1 } };
  const VANTAGGI = { base: { nome: 'Essenziali (solo miglia)', g: -0.1, costoPax: 0 }, plus: { nome: 'Lounge per Oro e Platino', g: 0.1, costoPax: 3 }, premium: { nome: 'Lounge e upgrade gratuiti per Platino', g: 0.3, costoPax: 9 } };
  const VALORE_MIGLIO = 0.012, BANCHE = ['Banca Aurora', 'Credito Alpino', 'Unione Bancaria', 'Banca dei Navigli', 'Finanza Mediterranea'];
  function initFedelta(G) {
    G.fedelta ||= { attivo: false, nome: `${G.nome} Club`, iscritti: 0, miglia: 0, accumulo: 2, scadenza: '36', vantaggi: 'plus', carta: null, offerteCarta: [] };
    if (G.mod && G.mod.fedelta && !G.fedelta.attivo) attivaFedelta(G, true);
  }
  function generosita(G) { const F = G.fedelta; if (!F || !F.attivo) return 0; return clamp(1 + ACCUMULO[F.accumulo].g + SCADENZE[F.scadenza].g + VANTAGGI[F.vantaggi].g, 0.4, 1.8); }
  function attivaFedelta(G, silenzioso) {
    G.fedelta.attivo = true; G.fedelta.inizio = G.ora; offerteCarta(G);
    if (!silenzioso) notizia(G, `Parte ${G.fedelta.nome}: scegli quante miglia dare, quando scadono e i vantaggi dei livelli (Commerciale › Fedeltà).`, 'buona', true);
  }
  function offerteCarta(G) {
    const pick = () => BANCHE[Math.floor(rnd() * BANCHE.length)];
    G.fedelta.offerteCarta = [0, 1].map(() => ({ id: 'b' + (G.seq++), banca: pick(), perTitolare: Math.round(60 + rnd() * 90), anni: 3, scade: G.ora + 60 * GIORNO }));
  }
  // flussi del giorno (prima che la giornata venga chiusa nello storico)
  function giornoFedelta(G) {
    const F = G.fedelta; if (!F) return; if (G.mod && G.mod.fedelta && !F.attivo) attivaFedelta(G); if (!F.attivo) return;
    const o = G.oggi, g = generosita(G), pax = o.pax || 0, ric = o.ricavi || 0;
    const tetto = Math.max(1000, G.storico.slice(-30).reduce((s, x) => s + x.pax, 0) * 3);
    F.iscritti = Math.min(tetto, F.iscritti * (1 - 0.002) + pax * 0.08 * g);
    const guadagnate = ric * 0.35 * F.accumulo, riscattate = F.miglia * 0.004, scadute = F.miglia * SCADENZE[F.scadenza].tasso;
    F.miglia = Math.max(0, F.miglia + guadagnate - riscattate - scadute);
    const costoRiscatti = riscattate * VALORE_MIGLIO, paxJW = (o.paxC?.J || 0) + (o.paxC?.W || 0), costoVantaggi = paxJW * 0.5 * VANTAGGI[F.vantaggi].costoPax;
    let ricaviCarta = 0;
    if (F.carta) {
      if (G.ora > F.carta.fine) { notizia(G, `Scaduto il contratto della carta di credito con ${F.carta.banca}.`, 'info'); F.carta = null; offerteCarta(G); }
      else { F.titolari = Math.round(F.iscritti * 0.08 * g); ricaviCarta = F.titolari * F.carta.perTitolare / 365; }
    }
    const costo = Math.round(costoRiscatti + costoVantaggi);
    o.costi.fedelta = (o.costi.fedelta || 0) + costo; G.cassa -= costo;
    if (ricaviCarta) { o.ricavi += Math.round(ricaviCarta); o.ricaviExtra = (o.ricaviExtra || 0) + Math.round(ricaviCarta); G.cassa += Math.round(ricaviCarta); }
    F.ultimo = { guadagnate: Math.round(guadagnate), riscattate: Math.round(riscattate), scadute: Math.round(scadute), costo, ricaviCarta: Math.round(ricaviCarta) };
    if (!F.carta && (!F.offerteCarta.length || F.offerteCarta[0].scade < G.ora) && loc(G.ora).getUTCDate() === 15) offerteCarta(G);
  }
  // quota dei soci nei tre livelli (più clienti d'affari = più soci Oro e Platino)
  function livelliFedelta(G) { const F = G.fedelta, u = G.storico.slice(-30), p = u.reduce((s, x) => s + x.pax, 0), jw = u.reduce((s, x) => s + (x.paxC ? x.paxC.J + x.paxC.W : 0), 0), q = p ? jw / p : 0.1;
    const plat = clamp(0.02 + q * 0.25, 0.02, 0.15), oro = clamp(0.08 + q * 0.6, 0.08, 0.35); return { platino: Math.round(F.iscritti * plat), oro: Math.round(F.iscritti * oro), argento: Math.round(F.iscritti * (1 - plat - oro)) }; }

  /* ---------- Personale: mercato del lavoro, scuola piloti, trattative sindacali ---------- */
  let INDICE_PILOTI = 1;
  function initLavoro(G) {
    G.lavoro ||= { piloti: 1, mercato: 1, contratto: 1, scadenzaContratto: G.ora + 240 * GIORNO, scuola: null, cadetti: 0, premio: false, storia: [] };
    INDICE_PILOTI = G.lavoro.piloti;
  }
  const giorniAssunzione = urgente => urgente ? 2 : Math.round(10 * INDICE_PILOTI);
  function giornoLavoro(G) {
    const L = G.lavoro;
    L.piloti = clamp(L.piloti + 0.04 / 365 + (rnd() - 0.5) * 0.006 + (1.1 - L.piloti) * 0.002, 0.85, 1.7); INDICE_PILOTI = L.piloti;
    L.mercato = clamp(L.mercato + 0.022 / 365 + (L.piloti - 1) * 0.02 / 365, 0.9, 2);
    if (L.premio) { const ieri = G.storico.at(-1); if (ieri && ieri.utile > 0) paga(G, Math.round(ieri.utile * 0.03), 'personale'); }
    const S = L.scuola;
    if (S && G.ora >= S.prossimo) { L.cadetti += 6; S.prossimo = G.ora + 60 * GIORNO; S.formati = (S.formati || 0) + 6; notizia(G, 'La scuola piloti ha formato 6 nuovi piloti: le prossime assunzioni saranno più rapide ed economiche.', 'buona'); }
    const T = G.trattativa;
    if (T && G.ora >= T.scade) { sciopero(G, 1); T.scade = G.ora + 10 * GIORNO; notizia(G, 'Il sindacato non ha ricevuto risposta: un giorno di sciopero, la trattativa resta aperta.', 'cattiva', true); }
    if (!T && (G.ora >= L.scadenzaContratto || (G.morale < 35 && (!L.ultimaTrattativa || G.ora - L.ultimaTrattativa > 60 * GIORNO))) && G.equipaggi.length >= 3) apriTrattativa(G);
  }
  function apriTrattativa(G) {
    const L = G.lavoro, gap = Math.max(0, L.mercato / (G.stipendio * L.contratto) - 1), u30 = G.storico.slice(-30).reduce((s, x) => s + x.utile, 0);
    const richiesta = Math.round(clamp(0.025 + gap + (u30 > 0 ? 0.015 : 0) + (G.morale < 40 ? 0.01 : 0), 0.02, 0.12) * 1000) / 1000;
    G.trattativa = { richiesta, iniziale: richiesta, minimo: Math.round(richiesta * (0.45 + rnd() * 0.3) * 1000) / 1000, round: 0, offerte: [], inizio: G.ora, scade: G.ora + 10 * GIORNO };
    L.ultimaTrattativa = G.ora;
    notizia(G, `Il sindacato apre la trattativa per il nuovo contratto: chiede un aumento del ${(richiesta * 100).toFixed(1)}% (Flotta › Equipaggi).`, 'info', true);
  }
  function sciopero(G, giorni) {
    const t = giornoDopo(mezzanotte(G.ora));
    G.eventi.push({ tipo: 'sciopero', inizio: t, fine: giornoDopo(t, giorni), testo: 'Sciopero del personale' });
    G.morale = Math.max(0, G.morale - 4 * giorni); G.reputazione = Math.max(0, G.reputazione - giorni);
  }
  function chiudiContratto(G, aumento, premio, testo) {
    const L = G.lavoro; L.contratto = Math.round(L.contratto * (1 + aumento) * 1000) / 1000; if (premio) L.premio = true;
    L.scadenzaContratto = G.ora + 730 * GIORNO;
    L.storia.unshift({ t: G.ora, aumento, premio: !!premio }); if (L.storia.length > 10) L.storia.length = 10;
    G.morale = clamp(G.morale + 4 + aumento * 120 + (premio ? 4 : 0), 0, 100); G.trattativa = null;
    notizia(G, testo, 'buona', true);
  }
  function trattativa(G, { tipo, aumento = 0, premio = false }) {
    const T = G.trattativa; if (!T) return err('Nessuna trattativa aperta');
    if (tipo === 'accetta') { chiudiContratto(G, T.richiesta, false, `Contratto firmato: aumento del ${(T.richiesta * 100).toFixed(1)}% per due anni.`); return ok('Contratto firmato'); }
    if (tipo === 'rompi') {
      sciopero(G, 3); G.morale = Math.max(0, G.morale - 10); G.trattativa = null; G.lavoro.scadenzaContratto = G.ora + 30 * GIORNO;
      notizia(G, 'Trattativa rotta: il sindacato proclama tre giorni di sciopero. Si riparte tra un mese.', 'cattiva', true); return ok('Trattativa rotta');
    }
    aumento = clamp(Math.round(+aumento * 1000) / 1000, 0, T.richiesta);
    T.offerte.push({ aumento, premio }); T.round++;
    const valore = aumento + (premio ? 0.015 : 0);
    if (valore >= T.minimo) { chiudiContratto(G, aumento, premio, `Accordo raggiunto con il sindacato: aumento del ${(aumento * 100).toFixed(1)}%${premio ? ' più un premio di risultato (3% dell’utile)' : ''}.`); return ok('Accordo raggiunto'); }
    G.morale = Math.max(0, G.morale - 2);
    if (T.round >= 4) {
      sciopero(G, 2); T.richiesta = Math.min(0.14, T.richiesta + 0.01); T.round = 0; T.scade = G.ora + 10 * GIORNO;
      notizia(G, `Nessun accordo dopo quattro incontri: due giorni di sciopero. Il sindacato ora chiede il ${(T.richiesta * 100).toFixed(1)}%.`, 'cattiva', true);
      return err('Il sindacato ha proclamato due giorni di sciopero');
    }
    T.richiesta = Math.round(Math.max(T.minimo + 0.004, T.richiesta - (T.richiesta - valore) * 0.35) * 1000) / 1000;
    return err(`Il sindacato rifiuta e scende al ${(T.richiesta * 100).toFixed(1)}%. Incontri rimasti prima dello sciopero: ${4 - T.round}.`);
  }
  function apriScuola(G) {
    const L = G.lavoro; if (L.scuola) return err('La scuola piloti è già aperta');
    const costo = 2500000; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
    paga(G, costo, 'altro'); L.scuola = { aperta: G.ora, prossimo: G.ora + 120 * GIORNO, formati: 0 };
    notizia(G, 'Aperta la scuola piloti: il primo corso finisce tra 4 mesi, poi 6 nuovi piloti ogni 2 mesi.', 'buona'); return ok('Scuola piloti aperta');
  }
  // costo e tempi di un'assunzione: con i piloti della scuola aziendale si fa prima e si spende meno
  function assunzione(G, e, urgente) {
    const base = costoAssunzione(e, urgente);
    if (!urgente && G.lavoro && G.lavoro.cadetti >= e.piloti) return { costo: Math.round(base - 12000 * e.piloti * INDICE_PILOTI * 0.6), giorni: 3, cadetti: e.piloti };
    return { costo: base, giorni: giorniAssunzione(urgente), cadetti: 0 };
  }

  /* ---------- Pianificatore automatico di tutta la flotta ---------- */
  // 1) ogni rotta aperta che tocca una base riceve almeno un andata e ritorno al giorno;
  // 2) gli aerei che hanno ancora tempo libero prendono altri voli dove la domanda li regge e il margine è più alto.
  // Usa solo le rotte già aperte; segnala quelle che non riesce a coprire e gli slot da comprare.
  const MINUTI_GIORNO = 1000;
  function partenzeProg(ae, prog) {
    const max = {};
    for (const g of prog.giorni) { const c = {}; for (const l of legsGiorno(ae, g, prog.turn)) c[l.da] = (c[l.da] || 0) + 1; for (const i in c) max[i] = Math.max(max[i] || 0, c[i]); }
    return max;
  }
  function pianificaFlotta(G, opz = {}) {
    const aerei = flottaAttiva(G), domani = giornoDopo(mezzanotte(G.ora)), unita = [], scoperte = [];
    if (!aerei.length) return err('Non hai aerei');
    const turnDi = ae => MOD[ae.modello].lungo ? 90 : MOD[ae.modello].tipo === 'ATR' ? 35 : 40;
    const blocco = (ae, d) => 2 * (durata(d, ae.modello) + turnDi(ae));
    // stima del margine di n andata e ritorno al giorno su una rotta, con aerei da "posti" posti
    const margine = (k, base, dest, n, posti, mod) => {
      if (n <= 0) return 0;
      const r = G.rotte[k], d = km(base, dest), am = analisiMercato(G, base, dest, domani, n, r.pY, 1, { stima: true });
      const paxVolo = Math.min(posti, am.pax / Math.max(0.3, am.maturita) / n);
      return 2 * n * (paxVolo * r.pY * 1.12 - costoVoloStimato(G, mod, d, paxVolo));
    };
    for (const k of Object.keys(G.rotte)) {
      const [a, c] = k.split('-'), basiK = [a, c].filter(i => G.basi.includes(i)), d = km(a, c);
      if (!basiK.length) { scoperte.push({ k, motivo: 'non tocca nessuna tua base: gli aerei partono e dormono nelle basi' }); continue; }
      if (!dirittiOk(G, a, c)) { const x = (G.diritti || {})[chiaveDiritti(a, c)]; scoperte.push({ k, motivo: x && x.stato === 'negati' ? 'diritti di traffico negati' : 'in attesa dei diritti di traffico' }); continue; }
      const adatti = aerei.filter(ae => MOD[ae.modello].autonomia >= d);
      if (!adatti.length) { scoperte.push({ k, motivo: `nessun aereo della flotta arriva a ${num(d)} km` }); continue; }
      const base = basiK.sort((x, y) => adatti.filter(ae => ae.base === y).length - adatti.filter(ae => ae.base === x).length)[0], dest = a === base ? c : a;
      const lungo = d > 4000, rif = adatti.slice().sort((x, y) => Math.abs(posti(x) - 180) - Math.abs(posti(y) - 180))[0], seats = posti(rif);
      // quanti andata e ritorno reggerebbe la domanda (riempimento almeno ~78%)
      let ideale = 1;
      if (!lungo) for (let n = 2; n <= 6; n++) { const am = analisiMercato(G, base, dest, domani, n, G.rotte[k].pY, 1, { stima: true }); if (am.pax / Math.max(0.3, am.maturita) / (n * seats) >= 0.78) ideale = n; else break; }
      unita.push({ k, base, dest, d, lungo, obbligatoria: true, valore: margine(k, base, dest, 1, seats, rif.modello) });
      for (let n = 2; n <= ideale; n++) unita.push({ k, base, dest, d, lungo, obbligatoria: false, valore: margine(k, base, dest, n, seats, rif.modello) - margine(k, base, dest, n - 1, seats, rif.modello) });
    }
    // assegnazione agli aerei
    const stati = aerei.map(ae => ({ ae, base: null, unita: [], min: 0, lungo: false }));
    const idoneita = (st, u) => {
      const ae = st.ae, m = MOD[ae.modello];
      if (m.autonomia < u.d || st.lungo || (st.base && st.base !== u.base)) return null;
      if (u.lungo) { if (st.unita.length) return null; }
      else if (st.min + blocco(ae, u.d) > MINUTI_GIORNO) return null;
      let p = 0;
      if (!u.lungo && m.lungo) p += 3;                                   // un widebody su una tratta breve spreca posti
      if (u.lungo && !m.lungo && aerei.some(x => MOD[x.modello].lungo && MOD[x.modello].autonomia >= u.d)) p += 2;
      if (m.tipo === 'ATR' && u.d > 900) p += 1;
      if (ae.base !== u.base) p += 1.5;                                   // spostare un aereo in un'altra base
      if (!st.unita.length) p += 0.5;                                     // meglio riempire un aereo già usato
      return p;
    };
    const assegna = u => {
      let best = null, bp = Infinity;
      for (const st of stati) { const p = idoneita(st, u); if (p != null && p < bp) { bp = p; best = st; } }
      if (!best) return false;
      best.base = u.base; best.unita.push(u); best.min += u.lungo ? MINUTI_GIORNO : blocco(best.ae, u.d); if (u.lungo) best.lungo = true;
      return true;
    };
    const obbl = unita.filter(u => u.obbligatoria).sort((x, y) => (y.lungo - x.lungo) || (y.d - x.d));
    for (const u of obbl) if (!assegna(u)) scoperte.push({ k: u.k, motivo: 'non c’è un aereo libero adatto: servono più aerei' });
    const extra = unita.filter(u => !u.obbligatoria && u.valore > 0).sort((x, y) => y.valore - x.valore);
    for (const u of extra) assegna(u);
    // costruzione delle settimane, togliendo voli finché gli orari non tornano
    const piani = [], ferme = [];
    for (const st of stati) {
      if (!st.unita.length) { ferme.push(st.ae.id); continue; }
      let lista = st.unita.slice(), r = null;
      // ordine alternato: A, B, A, C... così le mete si mescolano nella giornata
      const ordina = l => { const per = {}; for (const u of l) (per[u.dest] ||= []).push(u); const g = Object.values(per).sort((x, y) => y.length - x.length), out = []; while (g.some(x => x.length)) for (const x of g) if (x.length) out.push(x.shift()); return out; };
      while (lista.length) {
        const l = ordina(lista);
        r = st.lungo ? rotazioneGuidata(G, st.ae.id, { tipo: 'lungo', dest: [l[0].dest], base: st.base }) : rotazioneGuidata(G, st.ae.id, { tipo: 'multi', dest: l.map(u => u.dest), giri: l.length, base: st.base });
        if (r.ok) break;
        // via prima un volo facoltativo, poi uno obbligatorio
        const i = lista.map(u => u.obbligatoria).lastIndexOf(false), j = i >= 0 ? i : lista.length - 1;
        if (lista[j].obbligatoria) scoperte.push({ k: lista[j].k, motivo: 'gli orari non tornano con gli altri voli dell’aereo' });
        lista.splice(j, 1);
      }
      if (!r || !r.ok) { ferme.push(st.ae.id); continue; }
      piani.push({ aeId: st.ae.id, marche: st.ae.marche, modello: st.ae.modello, base: st.base, spostato: st.base !== st.ae.base, prog: r.prog, descr: r.descr, voliSett: r.voliSett, oreSett: r.oreSett, rotte: [...new Set(lista.map(u => u.k))] });
    }
    // slot: somma delle partenze di tutta la flotta con i nuovi programmi
    const dep = {};
    for (const p of piani) { const ae = G.aerei.find(a => a.id === p.aeId); for (const [i, n] of Object.entries(partenzeProg(ae, p.prog))) dep[i] = (dep[i] || 0) + n; }
    const slot = Object.entries(dep).filter(([i, n]) => AP[i].slot && n > (G.slot[i] || 0)).map(([i, n]) => ({ i, n: n - (G.slot[i] || 0), costo: (n - (G.slot[i] || 0)) * AP[i].slotPrezzo }));
    const coperte = new Set(piani.flatMap(p => p.rotte));
    const sc = [...new Map(scoperte.filter(s => !coperte.has(s.k)).map(s => [s.k, s])).values()];
    return { ok: true, piani, ferme, scoperte: sc, slot, costo: slot.reduce((x, s) => x + s.costo, 0), voliSett: piani.reduce((x, p) => x + p.voliSett, 0), rotteCoperte: coperte.size, rotteTotali: Object.keys(G.rotte).length };
  }
  // equipaggi che mancherebbero con il nuovo piano (prova su una copia della partita)
  function stimaPersonalePiano(G, P) {
    const C = JSON.parse(JSON.stringify(G, (k, v) => k.startsWith('_') ? undefined : v));
    C.cassa = Math.max(C.cassa, P.costo) + 1; if (C.auto) C.auto.equipaggi = false;
    const fuso = FUSO; applicaPianoFlotta(C, P); FUSO = fuso;
    const p = pianoAssunzioni(C);
    return { n: p.length, costo: p.reduce((x, e) => x + costoAssunzione(e, false), 0), costoUrgente: p.reduce((x, e) => x + costoAssunzione(e, true), 0) };
  }
  function applicaPianoFlotta(G, P, opz = {}) {
    if (!P || !P.ok) return err('Piano non valido');
    if (G.cassa < P.costo) return err(`Servono ${eur(P.costo)} per gli slot`);
    for (const s of P.slot) { G.cassa -= s.costo; G.slot[s.i] = (G.slot[s.i] || 0) + s.n; }
    const pianoDi = new Map(P.piani.map(p => [p.aeId, p]));
    const autoPrima = G.auto && G.auto.equipaggi; if (G.auto) G.auto.equipaggi = false;
    // prima si svuotano tutte le settimane (così gli slot non si sommano a quelli vecchi), poi si salvano le nuove
    for (const ae of flottaAttiva(G)) { const p = pianoDi.get(ae.id); ae.prog = settimanaVuota(p ? p.base : ae.base, ae.prog.turn); delete ae._piano; }
    G._roster = null; G.fissi = {};
    const errori = [];
    for (const ae of flottaAttiva(G)) {
      const p = pianoDi.get(ae.id);
      const v = salvaProgramma(G, ae.id, p ? p.prog : settimanaVuota(ae.base, ae.prog.turn));
      if (v.E.length) { errori.push(`${ae.marche}: ${v.E[0]}`); salvaProgramma(G, ae.id, settimanaVuota(ae.base, ae.prog.turn)); }
    }
    if (G.auto) G.auto.equipaggi = autoPrima;
    if (opz.urgente && pianoAssunzioni(G).length) A.assumiMancanti(G, true); else autoAssumi(G);
    notizia(G, `Nuovo piano della flotta: ${P.piani.length - errori.length} aerei programmati, ${P.voliSett} voli a settimana su ${P.rotteCoperte} rotte.${P.costo ? ` Slot comprati: ${eur(P.costo)}.` : ''}`, 'buona');
    return errori.length ? err(`Piano applicato, ma ${errori.length} aerei sono rimasti a terra: ${errori[0]}`) : ok(`Piano applicato: ${P.voliSett} voli a settimana`);
  }

  /* ---------- Realismo: imprevisti, economia, assicurazione, grandi crisi ---------- */
  const LIVELLI_IMPREVISTI = { pochi: { nome: 'Pochi', f: 0.5 }, normale: { nome: 'Normale', f: 1 }, tanti: { nome: 'Tanti', f: 1.7 } };
  const ASSICURAZIONI = { base: { nome: 'Base', premio: 0.6, franchigia: 1 }, standard: { nome: 'Standard', premio: 1, franchigia: 0.5 }, completa: { nome: 'Completa', premio: 1.6, franchigia: 0.15 } };
  const BENESSERE = { nessuno: { nome: 'Niente', costo: 0, morale: 0, assenze: 1, dimissioni: 1 }, base: { nome: 'Welfare e mensa', costo: 6, morale: 6, assenze: 0.8, dimissioni: 0.7 }, completo: { nome: 'Welfare, mensa e alloggi', costo: 14, morale: 12, assenze: 0.6, dimissioni: 0.4, alloggi: true } };
  const CONTRATTI = { fisso: { nome: 'A tempo indeterminato', paga: 1, assunzione: 1 }, stagionale: { nome: 'Stagionale', paga: 0.85, assunzione: 0.5 }, agenzia: { nome: 'Tramite agenzia', paga: 1.25, assunzione: 2.5 } };
  const fImprevisti = G => LIVELLI_IMPREVISTI[G.imprevisti || 'normale'].f;
  const franchigia = G => ASSICURAZIONI[G.assicurazione || 'standard'].franchigia;
  const cambioF = G => 1.1 / ((G.coperturaCambio && G.ora < G.coperturaCambio.fine ? G.coperturaCambio.cambio : G.cambio) || 1.1); // leasing e carburante si pagano in dollari
  // costo del lavoro per paese della base
  function fattoreLavoro(iata) {
    const A = AP[iata]; if (!A) return 1;
    const p = A.paese, c = A.continente;
    if (['GB', 'CH', 'NO', 'DK', 'IE', 'SE'].includes(p)) return 1.2;
    if (['PL', 'HU', 'RO', 'CZ', 'AL'].includes(p)) return 0.7;
    if (['AE', 'QA', 'SA'].includes(p)) return 1;
    if (['JP', 'SG', 'HK', 'KR'].includes(p)) return 1.1;
    return { Europa: 1, 'Nord America': 1.35, Asia: 0.8, Africa: 0.55, 'Sud America': 0.65, Oceania: 1.2 }[c] || 1;
  }
  const fattorePaga = e => fattoreLavoro(e.base) * (0.9 + 0.015 * Math.min(e.anni || 5, 20)) * (CONTRATTI[e.contratto || 'fisso'].paga);
  function initRealismo(G) {
    G.imprevisti ||= 'normale'; G.assicurazione ||= 'standard'; G.benessere ||= 'nessuno'; G.cambio ??= 1.1;
    G.quotaRiserve ??= 0.1; G.handlingProprio ||= []; G.treni ||= []; G.crisiDomanda ||= []; G.premi ||= [];
    G.marchio ||= { colore: '#2a78d6', simbolo: 'aereo' };
    for (const e of G.equipaggi) completaEquipaggio(G, e, true);
  }
  function completaEquipaggio(G, e, esistente) {
    e.anni ??= esistente ? 1 + Math.floor(rnd() * 18) : 1 + Math.floor(rnd() * 5);
    e.etaCpt ??= 34 + Math.floor(rnd() * (esistente ? 30 : 20));
    e.foOre ??= Math.round(500 + rnd() * 3500);
    e.contratto ||= 'fisso'; e.ore ??= 0; e.oreAnno ??= 0;
    e.prossimoSim ??= G.ora + Math.floor(rnd() * 180) * GIORNO;
  }
  const assente = (e, t) => e.assenteFino && t < e.assenteFino;
  // un equipaggio di riserva della stessa base e abilitazione, libero quel giorno
  function riservaPer(G, eq, v) {
    const r = roster(G), g = giornoSett(v.dep), chiaveSost = `${v.turno}|${mezzanotte(v.dep)}`;
    G._sostituti ||= {};
    const gia = G._sostituti[chiaveSost] && G.equipaggi.find(e => e.id === G._sostituti[chiaveSost]); if (gia && !assente(gia, v.dep)) return gia;
    const usati = new Set(Object.entries(G._sostituti).filter(([k]) => k.endsWith('|' + mezzanotte(v.dep))).map(([, id]) => id));
    const libero = e => e.id !== eq.id && e.stato === 'attivo' && !assente(e, v.dep) && !usati.has(e.id) && e.base === eq.base && e.tipo === eq.tipo && e.piloti >= eq.piloti && e.cabina >= eq.cabina && !(r.carico.get(e.id)?.catene || []).some(x => x.giorno === g);
    const c = G.equipaggi.find(e => e.riserva && libero(e)) || G.equipaggi.find(e => !e.riserva && libero(e));
    if (c) G._sostituti[chiaveSost] = c.id;
    return c || null;
  }
  // equipaggi di riserva che mancano per base e abilitazione (quota impostata dal giocatore)
  function pianoRiserve(G) {
    const out = [], gruppi = {};
    for (const e of G.equipaggi) { const k = e.base + '|' + e.tipo, x = (gruppi[k] ||= { base: e.base, tipo: e.tipo, titolari: 0, riserve: 0, cab: 1, pil: 2 }); x.cab = Math.max(x.cab, e.cabina); x.pil = Math.max(x.pil, e.piloti); if (e.riserva) x.riserve++; else x.titolari++; }
    for (const x of Object.values(gruppi)) { const n = Math.ceil(x.titolari * (G.quotaRiserve || 0)) - x.riserve; for (let i = 0; i < n; i++) out.push({ base: x.base, tipo: x.tipo, piloti: x.pil, cabina: x.cab }); }
    return out;
  }

  // ---- meteo legato a stagione e clima, eventi rari, economia
  function imprevistiDelGiorno(G) {
    const f = fImprevisti(G), domani = giornoDopo(mezzanotte(G.ora)), mese = loc(G.ora).getUTCMonth(), pick = a => a[Math.floor(rnd() * a.length)];
    const serviti = [...new Set(flottaAttiva(G).flatMap(a => a.prog.giorni.flatMap(g => g.scali)))];
    if (serviti.length) {
      const inverno = mese === 11 || mese <= 1, nord = i => AP[i].lat > 0;
      const neve = serviti.filter(i => (nord(i) ? inverno : mese >= 5 && mese <= 7) && Math.abs(AP[i].lat) > 40);
      if (neve.length && rnd() < 0.06 * f) { const i = pick(neve); G.eventi.push({ tipo: 'meteo', neve: true, iata: i, forza: 2, inizio: tsDi(domani, 300), fine: tsDi(domani, 900), testo: `Neve a ${AP[i].citta}` }); notizia(G, `Meteo: neve domattina a ${AP[i].citta}. Sghiacciamento degli aerei, ritardi e qualche cancellazione.`, 'evento'); }
      const tropici = serviti.filter(i => (AP[i].continente === 'Asia' && AP[i].lon > 100 && AP[i].lat > 5 && AP[i].lat < 35 && mese >= 6 && mese <= 9) || (AP[i].continente === 'Nord America' && AP[i].lat < 32 && AP[i].lon > -100 && mese >= 7 && mese <= 9));
      if (tropici.length && rnd() < 0.02 * f) { const i = pick(tropici), giorni = 1 + Math.floor(rnd() * 2); G.eventi.push({ tipo: 'chiusura', iata: i, inizio: domani, fine: giornoDopo(domani, giorni), testo: `${AP[i].continente === 'Asia' ? 'Tifone' : 'Uragano'}: aeroporto di ${AP[i].citta} chiuso` }); notizia(G, `${AP[i].continente === 'Asia' ? 'Tifone' : 'Uragano'} in arrivo: l’aeroporto di ${AP[i].citta} chiude per ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} da domani.`, 'cattiva', true); for (const ae of flottaAttiva(G)) rigeneraAereo(G, ae); }
    }
    // economia: cambio euro/dollaro, mete di moda, treni veloci, una nuova low cost
    G.cambio = clamp(G.cambio + (1.1 - G.cambio) * 0.01 + (rnd() - 0.5) * 0.008, 0.9, 1.35);
    if (rnd() < 0.003 * f) { const d = rnd() < 0.5 ? -0.06 : 0.06; G.cambio = clamp(G.cambio + d, 0.9, 1.35); notizia(G, d < 0 ? 'L’euro scende contro il dollaro: leasing e carburante costano di più.' : 'L’euro si rafforza sul dollaro: leasing e carburante costano meno.', d < 0 ? 'cattiva' : 'buona', true); }
    if (serviti.length && rnd() < 0.004 * f) { const c = AP[pick(serviti)].citta; G.eventi.push({ tipo: 'domanda', citta: c, fattore: 1.3, inizio: domani, fine: giornoDopo(domani, 180) }); notizia(G, `${c} è la meta di moda dell’anno: domanda +30% per sei mesi.`, 'buona', true); }
    if (rnd() < 0.0015 * f) {
      const cand = Object.keys(G.rotte).filter(k => { const [a, b] = k.split('-'), d = km(a, b); return AP[a].paese === AP[b].paese && d > 250 && d < 750 && !G.treni.includes(chiaveCitta(a, b)); });
      if (cand.length) { const k = pick(cand), [a, b] = k.split('-'); G.treni.push(chiaveCitta(a, b)); notizia(G, `Inaugurata l’alta velocità tra ${AP[a].citta} e ${AP[b].citta}: molti viaggiatori passeranno al treno.`, 'cattiva', true); }
    }
    if (rnd() < 0.0015 * f && G.rivali.length < 8) {
      const mie = Object.entries(statRecenti(G, 14).rotte).sort((x, y) => (y[1].ricavi - y[1].costi) - (x[1].ricavi - x[1].costi)).slice(0, 3).map(([k]) => k);
      if (mie.length) { const hub = G.basi[0], nomi = ['Volare Smart', 'Ryde Air', 'Easy Wings', 'Fly Cheap'], nome = nomi.find(n => !G.rivali.some(r => r.nome === n)) || 'Low Cost Express';
        G.rivali.push({ id: 'lc' + (G.seq++), nome, colore: '#e64980', hub, rep: 45, prezzo: 0.7, forza: 55, rotte: Object.fromEntries(mie.map(k => [k, { freq: 3, prezzo: 0.7 }])) });
        notizia(G, `Arriva ${nome}, una low cost aggressiva: apre una base a ${AP[hub].citta} e attacca le tue rotte migliori a prezzi stracciati.`, 'cattiva', true); }
    }
    // imprevisti tecnici e media
    if (G.storico.length > 20 && rnd() < 0.002 * f) { G.reputazione = Math.max(0, G.reputazione - 3); notizia(G, `Un’inchiesta televisiva sui ${pick(['bagagli smarriti', 'ritardi', 'rimborsi negati', 'prezzi nascosti'])} delle compagnie aeree cita anche ${G.nome}: reputazione −3.`, 'cattiva', true); }
    if (rnd() < 0.0035 * f && !G.emergenza) emergenzaCasuale(G);
    G.crisiDomanda = G.crisiDomanda.filter(x => x.fine > G.ora);
  }
  const domandaCrisi = (G, da, a) => { let f = 1; for (const x of G.crisiDomanda || []) if (AP[da].continente === x.continente || AP[a].continente === x.continente) f = Math.min(f, x.fattore); return f; };

  // ---- grandi crisi: il gioco si ferma e chiede una decisione
  const ETNA = { lat: 37.75, lon: 15 }, ISLANDA = { lat: 60, lon: -5 };
  const distGeo = (p, q) => { const r = Math.PI / 180, x = (q.lon - p.lon) * r * Math.cos((p.lat + q.lat) / 2 * r), y = (q.lat - p.lat) * r; return Math.sqrt(x * x + y * y) * 6371; };
  function emergenzaCasuale(G) {
    const serviti = [...new Set(flottaAttiva(G).flatMap(a => a.prog.giorni.flatMap(g => g.scali)))]; if (!serviti.length) return;
    const tipi = [];
    const etna = serviti.filter(i => distGeo(AP[i], ETNA) < 450), islanda = serviti.filter(i => distGeo(AP[i], ISLANDA) < 1600 && AP[i].lat > 48);
    if (etna.length || islanda.length) tipi.push('cenere');
    const medio = serviti.filter(i => ['IL', 'SA', 'AE', 'QA', 'TR', 'EG'].includes(AP[i].paese)); if (medio.length) tipi.push('spazio');
    tipi.push('epidemia');
    const modelli = [...new Set(flottaAttiva(G).filter(a => a.stato === 'attivo').map(a => a.modello))]; if (modelli.length) tipi.push('richiamo');
    const t = tipi[Math.floor(rnd() * tipi.length)], domani = giornoDopo(mezzanotte(G.ora));
    let E;
    if (t === 'cenere') { const area = etna.length && (rnd() < 0.6 || !islanda.length) ? { nome: 'l’Etna', l: etna } : { nome: 'un vulcano islandese', l: islanda }, giorni = 2 + Math.floor(rnd() * 4);
      E = { tipo: t, titolo: `Nube di cenere: ${area.nome} in eruzione`, dati: { aeroporti: area.l, giorni }, testo: `La nube di cenere chiude lo spazio aereo sopra ${area.l.join(', ')} per circa ${giorni} giorni. Come gestisci i passeggeri bloccati?`,
        opzioni: [{ t: 'Cancella subito e riproteggi i passeggeri', d: `Voli dell’area cancellati per ${giorni} giorni, 20.000 € di assistenza, reputazione +1` }, { t: 'Aspetta: forse riapre prima', d: 'A metà dei casi riapre in metà tempo; altrimenti dura di più e i passeggeri si arrabbiano (reputazione −3)' }, { t: 'Pullman e treni per chi è a terra', d: `Voli cancellati per ${giorni} giorni, 80.000 € di trasporti, reputazione +3` }] }; }
    else if (t === 'spazio') { const giorni = 30 + Math.floor(rnd() * 31);
      E = { tipo: t, titolo: 'Crisi in Medio Oriente: spazio aereo chiuso', dati: { aeroporti: medio, giorni }, testo: `Una crisi regionale chiude parte dello spazio aereo per circa ${giorni} giorni. Riguarda ${medio.join(', ')}.`,
        opzioni: [{ t: 'Sospendi i voli verso l’area', d: `Voli da e per ${medio.join(', ')} cancellati per ${giorni} giorni` }, { t: 'Vola con rotte più lunghe', d: 'Voli regolari ma +35% di carburante e circa 40 minuti di ritardo' }, { t: 'Rotte più lunghe e prezzi +10%', d: 'Come sopra, ma recuperi parte dei costi con i prezzi (meno passeggeri)' }] }; }
    else if (t === 'epidemia') { const cont = [...new Set(serviti.map(i => AP[i].continente))], c = cont[Math.floor(rnd() * cont.length)], giorni = 90 + Math.floor(rnd() * 60);
      E = { tipo: t, titolo: `Epidemia in ${c}`, dati: { continente: c, giorni }, testo: `Un’epidemia scoraggia i viaggi da e per ${c}: domanda −35% per circa ${Math.round(giorni / 30)} mesi.`,
        opzioni: [{ t: 'Prezzi −15% sulle rotte dell’area', d: 'Più passeggeri (domanda −25% invece di −35%), ma incassi più bassi a biglietto' }, { t: 'Cassa integrazione per una parte del personale', d: 'Costo del personale −25% per il periodo, morale −10' }, { t: 'Non fare niente', d: 'Domanda −35% per il periodo' }] }; }
    else { const mod = modelli[Math.floor(rnd() * modelli.length)], n = flottaAttiva(G).filter(a => a.modello === mod && a.stato === 'attivo').length;
      E = { tipo: t, titolo: `Il costruttore richiama gli ${MOD[mod].nome}`, dati: { mod, n }, testo: `Un difetto ai motori impone un controllo straordinario su tutti gli ${MOD[mod].nome}: ne hai ${n}.`,
        opzioni: [{ t: 'Tutti a terra per 2 giorni', d: 'Controlli in hangar: costano poco ma cancelli due giorni di voli di quegli aerei' }, { t: 'Controlli di notte con squadre extra', d: `${eur(30000 * n)}, gli aerei saltano solo qualche volo` }] }; }
    G.emergenza = { ...E, t: G.ora, scade: G.ora + 2 * GIORNO };
    const n = { t: G.ora, testo: `EMERGENZA — ${E.titolo}. Devi decidere.`, tipo: 'cattiva', imp: true, emergenza: true };
    G.notizie.unshift(n); (G._nuove ||= []).push(n);
  }
  function decidiEmergenza(G, i) {
    const E = G.emergenza; if (!E) return err('Nessuna emergenza'); i = clamp(Math.round(i), 0, E.opzioni.length - 1);
    const domani = giornoDopo(mezzanotte(G.ora)), oggi = mezzanotte(G.ora), D0 = E.dati; let esito = '';
    const chiudi = (l, giorni, testo) => { for (const x of l) G.eventi.push({ tipo: 'chiusura', iata: x, inizio: G.ora, fine: oggi + giorni * GIORNO, testo }); for (const ae of flottaAttiva(G)) rigeneraAereo(G, ae); };
    if (E.tipo === 'cenere') {
      if (i === 0) { chiudi(D0.aeroporti, D0.giorni, 'Nube di cenere: spazio aereo chiuso'); paga(G, 20000, 'altro'); G.reputazione = Math.min(100, G.reputazione + 1); esito = 'Voli cancellati e passeggeri riprotetti.'; }
      else if (i === 1) { const fort = rnd() < 0.5, g = fort ? Math.max(1, Math.round(D0.giorni / 2)) : D0.giorni + 1; chiudi(D0.aeroporti, g, 'Nube di cenere: spazio aereo chiuso'); if (!fort) G.reputazione = Math.max(0, G.reputazione - 3); esito = fort ? `Ti è andata bene: riapre dopo ${g} giorni.` : `La nube resta ${g} giorni e i passeggeri sono furiosi.`; }
      else { chiudi(D0.aeroporti, D0.giorni, 'Nube di cenere: spazio aereo chiuso'); paga(G, 80000, 'altro'); G.reputazione = Math.min(100, G.reputazione + 3); esito = 'Pullman e treni hanno salvato le vacanze di molti: ottima figura.'; }
    } else if (E.tipo === 'spazio') {
      if (i === 0) { chiudi(D0.aeroporti, D0.giorni, 'Spazio aereo chiuso per la crisi'); esito = 'Voli verso l’area sospesi.'; }
      else { for (const x of D0.aeroporti) G.eventi.push({ tipo: 'deviazione', iata: x, inizio: G.ora, fine: oggi + D0.giorni * GIORNO }); if (i === 2) for (const k of Object.keys(G.rotte)) if (k.split('-').some(x => D0.aeroporti.includes(x))) A.ritocca(G, k, 1.1); esito = 'Si vola con rotte più lunghe.'; }
    } else if (E.tipo === 'epidemia') {
      G.crisiDomanda.push({ continente: D0.continente, fattore: i === 0 ? 0.75 : 0.65, fine: G.ora + D0.giorni * GIORNO });
      if (i === 0) for (const k of Object.keys(G.rotte)) if (k.split('-').some(x => AP[x].continente === D0.continente)) A.ritocca(G, k, 0.85);
      if (i === 1) { G.cassaIntegrazione = G.ora + D0.giorni * GIORNO; G.morale = Math.max(0, G.morale - 10); }
      esito = ['Prezzi ridotti nell’area.', 'Cassa integrazione avviata.', 'Nessuna misura presa.'][i];
    } else {
      const l = flottaAttiva(G).filter(a => a.modello === D0.mod && a.stato === 'attivo');
      if (i === 0) for (const ae of l) { ae.stato = 'guasto'; ae.fino = domani + 2 * GIORNO; }
      else { paga(G, Math.round(30000 * l.length * franchigia(G)), 'manutenzione'); for (const ae of l) { ae.stato = 'guasto'; ae.fino = domani + 6 * ORA; } }
      esito = i === 0 ? `${l.length} aerei a terra per due giorni.` : 'Controlli fatti di notte.';
    }
    (G.decisioni ||= []).unshift({ t: G.ora, titolo: E.titolo, scelta: E.opzioni[i].t, esito });
    G.emergenza = null; vendite(G); notizia(G, `${E.titolo}: ${esito}`, 'info');
    return ok(esito);
  }

  // ---- personale: assenze, simulatore, carriere, dimissioni, contratti stagionali
  function personaleDelGiorno(G) {
    const inverno = [11, 0, 1].includes(loc(G.ora).getUTCMonth()), B = BENESSERE[G.benessere || 'nessuno'], r = roster(G);
    let malati = 0;
    for (const e of G.equipaggi) {
      completaEquipaggio(G, e, false);
      if (e.stato !== 'attivo' || assente(e, G.ora)) continue;
      if (G.ora >= e.prossimoSim) { e.assenteFino = G.ora + 2 * GIORNO; e.assenza = 'simulatore'; e.prossimoSim = G.ora + 180 * GIORNO; paga(G, 4000, 'personale'); continue; }
      const fatica = (r.carico.get(e.id)?.min || 0) / 60 / MAX_ORE;
      if (rnd() < 0.012 * (inverno ? 1.6 : 1) * (1 + 2 * Math.max(0, fatica - 0.75)) * B.assenze * Math.sqrt(fImprevisti(G))) { e.assenteFino = G.ora + (1 + Math.floor(rnd() * 3)) * GIORNO; e.assenza = 'malattia'; malati++; }
    }
    if (malati >= 3) notizia(G, `${malati} equipaggi in malattia da oggi: servono riserve per coprire i loro turni.`, 'cattiva');
    G.equipaggi = G.equipaggi.filter(e => { if (e.scadenza && G.ora >= e.scadenza) { notizia(G, `Finito il contratto stagionale dell’equipaggio ${e.nome}.`, 'info'); G._roster = null; return false; } return true; });
    const d = loc(G.ora);
    if (d.getUTCDate() === 1) dimissioniDelMese(G);
    if (d.getUTCDate() === 1 && d.getUTCMonth() === 0) annoNuovoPersonale(G);
    if (G.cassaIntegrazione && G.ora > G.cassaIntegrazione) { delete G.cassaIntegrazione; notizia(G, 'Finita la cassa integrazione: tutto il personale torna a pieno regime.', 'info'); }
  }
  function dimissioniDelMese(G) {
    const L = G.lavoro, gap = L ? G.stipendio * L.contratto / L.mercato - 1 : 0, B = BENESSERE[G.benessere || 'nessuno'];
    const p = 0.006 * (G.morale < 45 ? 3 : G.morale < 60 ? 1.5 : 0.7) * (gap < -0.05 ? 2 : 1) * B.dimissioni;
    const via = [];
    for (const e of G.equipaggi) if (e.stato === 'attivo' && e.contratto === 'fisso' && via.length < 3 && rnd() < p) via.push(e);
    for (const e of via) {
      const R = G.rivali[Math.floor(rnd() * G.rivali.length)];
      G.equipaggi = G.equipaggi.filter(x => x !== e); for (const k in G.fissi) if (G.fissi[k] === e.id) delete G.fissi[k];
      notizia(G, `L’equipaggio ${e.nome} (cpt. ${e.capo}) si dimette${R ? ` e passa a ${R.nome}` : ''}.`, 'cattiva', true);
    }
    if (via.length) G._roster = null;
  }
  function annoNuovoPersonale(G) {
    let pensioni = 0;
    for (const e of G.equipaggi) {
      e.anni = (e.anni || 0) + 1; e.etaCpt = (e.etaCpt || 45) + 1; e.foOre = (e.foOre || 0) + (e.oreAnno || 0); e.oreAnno = 0;
      if (e.etaCpt >= 65 && e.stato === 'attivo') {
        pensioni++; const vecchio = e.capo, interno = e.foOre >= 3000;
        e.capo = COGNOMI[Math.floor(rnd() * COGNOMI.length)]; e.etaCpt = interno ? 36 + Math.floor(rnd() * 8) : 40 + Math.floor(rnd() * 12); e.foOre = 400;
        e.stato = 'formazione'; e.pronto = G.ora + (interno ? 10 : 25) * GIORNO; e.motivo = interno ? `il primo ufficiale diventa comandante al posto di ${vecchio}` : `nuovo comandante dopo la pensione di ${vecchio}`;
        paga(G, Math.round((interno ? 30000 : 45000 * INDICE_PILOTI) * fattoreLavoro(e.base)), 'personale');
      }
    }
    if (pensioni) { G._roster = null; notizia(G, `Anno nuovo: ${pensioni} comandanti vanno in pensione. I loro equipaggi restano fermi finché il nuovo comandante non è pronto.`, 'info', true); }
  }
  // premi di fine anno
  function premiAnnuali(G) {
    const y = loc(G.ora).getUTCFullYear() - 1, l = G.storico.filter(x => loc(x.t).getUTCFullYear() === y); if (l.length < 120) return;
    const s = sommario(l), prima = sommario(G.storico.filter(x => loc(x.t).getUTCFullYear() === y - 1)), vinti = [];
    if (s.punt >= 0.9) vinti.push('Compagnia più puntuale');
    if (G.bordo && analisiProdotto(G).Y.nps >= 45) vinti.push('Miglior servizio a bordo');
    if (prima.pax > 1000 && s.pax / prima.pax >= 1.3) vinti.push('Crescita dell’anno');
    if ((G.saf || 0) >= 0.2) vinti.push('Compagnia più sostenibile');
    for (const p of vinti) { G.premi.unshift({ anno: y, nome: p }); G.reputazione = Math.min(100, G.reputazione + 3); }
    if (vinti.length) notizia(G, `Premi ${y}: ${G.nome} vince ${vinti.map(x => '«' + x + '»').join(', ')}. Reputazione +${3 * vinti.length}.`, 'buona', true);
  }
  function giornoRealismo(G) {
    imprevistiDelGiorno(G); personaleDelGiorno(G);
    const d = loc(G.ora); if (d.getUTCDate() === 1 && d.getUTCMonth() === 0) premiAnnuali(G);
    if (G.emergenza && G.ora >= G.emergenza.scade) { const n = G.emergenza.opzioni.length - 1; decidiEmergenza(G, n); notizia(G, 'Non hai deciso in tempo: è stata applicata l’ultima opzione.', 'cattiva'); }
  }
  // generatore casuale con seme (per la sfida della settimana)
  function generatoreSeme(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ---------- Finanza: indicatori di settore, bilancio, flussi di cassa, imposte, rating, obbligazioni, coperture ---------- */
  const ALIQUOTA = 0.24, RATING = ['AA', 'A', 'BBB', 'BB', 'B', 'CCC'], TASSI_RATING = [0.035, 0.045, 0.055, 0.07, 0.09, 0.13];
  function flusso(G, tipo, importo) { const o = G.oggi; o.flussi ||= { investimenti: 0, finanziamenti: 0 }; o.flussi[tipo] = (o.flussi[tipo] || 0) + Math.round(importo); }
  // indicatori usati da tutte le compagnie aeree (ricavi e costi per posto-km offerto, yield, pareggio)
  function indicatori(G, n = 30) {
    const u = G.storico.slice(-n), S = k => u.reduce((s, x) => s + (x[k] || 0), 0);
    const ask = S('ask'), rpk = S('rpk'), ricavi = S('ricavi'), costi = S('costi'), pax = S('pax'), biglietti = u.reduce((s, x) => s + (x.ricaviC ? x.ricaviC.J + x.ricaviC.W + x.ricaviC.Y : 0), 0);
    let ore = 0, ga = 0; for (const x of u) for (const a of Object.values(x.aerei || {})) { ore += a.ore; ga++; }
    const rask = ask ? ricavi / ask * 100 : 0, cask = ask ? costi / ask * 100 : 0, yieldK = rpk ? biglietti / rpk * 100 : 0;
    return { giorni: u.length, ask, rpk, lf: ask ? rpk / ask : 0, rask, cask, yield: yieldK, pareggio: yieldK ? cask / (rask / (ask ? rpk / ask : 1) || yieldK) : 0, ricavoPax: pax ? ricavi / pax : 0, costoPax: pax ? costi / pax : 0, oreAereo: ga ? ore / ga : 0, margine: ricavi ? (ricavi - costi) / ricavi : 0 };
  }
  // conto economico su un insieme di giorni dello storico
  function contoEconomico(l) {
    const S = k => l.reduce((s, x) => s + (x[k] || 0), 0), det = {};
    for (const x of l) for (const [k, v] of Object.entries(x.dettaglio || {})) det[k] = (det[k] || 0) + v;
    const ricavi = S('ricavi'), interessi = det.interessi || 0, costiOp = S('costi') - interessi, amm = S('amm');
    const ebitda = ricavi - costiOp, ebit = ebitda - amm, anteImposte = ebit - interessi, imposte = Math.max(0, anteImposte) * ALIQUOTA;
    return { giorni: l.length, ricavi, extra: S('extra'), costiOp, dettaglio: det, ebitda, amm, ebit, interessi, anteImposte, imposte, netto: anteImposte - imposte, investimenti: l.reduce((s, x) => s + (x.flussi?.investimenti || 0), 0), finanziamenti: l.reduce((s, x) => s + (x.flussi?.finanziamenti || 0), 0), operativo: S('utile') };
  }
  function statoPatrimoniale(G) {
    const aerei = G.aerei.filter(a => a.modo === 'proprieta' && a.stato !== 'venduto').reduce((s, a) => s + a.valore, 0);
    const acconti = G.aerei.filter(a => a.stato === 'consegna').reduce((s, a) => s + (a.acconto || 0), 0);
    const slot = Object.entries(G.slot || {}).reduce((s, [i, n]) => s + n * AP[i].slotPrezzo * 0.7, 0);
    const banche = G.debiti.filter(d => d.tipo !== 'obbligazione').reduce((s, d) => s + d.capitale, 0), obbl = G.debiti.filter(d => d.tipo === 'obbligazione').reduce((s, d) => s + d.capitale, 0);
    const miglia = G.fedelta ? G.fedelta.miglia * VALORE_MIGLIO : 0, saldi = G.aerei.filter(a => a.stato === 'consegna').reduce((s, a) => s + (a.saldo || 0), 0);
    const attivo = { cassa: Math.max(0, G.cassa), aerei, acconti, slot }, passivo = { scoperto: Math.max(0, -G.cassa), banche, obbligazioni: obbl, miglia, impegni: 0 };
    const tA = Object.values(attivo).reduce((s, x) => s + x, 0), tP = Object.values(passivo).reduce((s, x) => s + x, 0);
    return { attivo, passivo, totaleAttivo: tA, totalePassivo: tP, patrimonio: tA - tP, impegniFuturi: saldi };
  }
  // giudizio sul credito: decide i tassi di prestiti e obbligazioni
  function rating(G) {
    const u = G.storico.slice(-90), ebitda = u.length ? (u.reduce((s, x) => s + x.utile + (x.dettaglio?.interessi || 0), 0) / u.length) * 365 : 0;
    const debito = debitoTot(G), fissi = Object.values(costiFissi(G)).reduce((s, x) => s + x, 0), giorni = G.cassa / Math.max(1, fissi);
    let r = 2;
    const leva = ebitda > 0 ? debito / ebitda : (debito > 0 ? 99 : 0);
    if (leva < 1) r -= 1; else if (leva > 7) r += 2; else if (leva > 4) r += 1;
    if (giorni > 60) r -= 0.5; else if (giorni < 10) r += 1;
    if (G.cda && G.cda.fiducia < 30) r += 1;
    if (u.length >= 30 && u.reduce((s, x) => s + x.utile, 0) < 0) r += 1;
    const i = clamp(Math.round(r), 0, 5);
    return { i, sigla: RATING[i], tasso: TASSI_RATING[i], leva, giorni };
  }
  function giornoFinanza(G) {
    // obbligazioni in scadenza: si rimborsa tutto il capitale
    for (const d of G.debiti.slice()) if (d.scadenza && G.ora >= d.scadenza) { G.cassa -= d.capitale; flusso(G, 'finanziamenti', -d.capitale); notizia(G, `Rimborsata l’obbligazione di ${eur(d.capitale)}.`, 'info', true); d.capitale = 0; }
    G.debiti = G.debiti.filter(d => d.capitale > 1);
    if (G.coperturaCambio && G.ora > G.coperturaCambio.fine) { delete G.coperturaCambio; notizia(G, 'Scaduta la copertura sul cambio euro/dollaro.', 'info'); }
    const d = loc(G.ora);
    if (d.getUTCDate() === 1 && d.getUTCMonth() === 0) imposteAnnuali(G);
  }
  function imposteAnnuali(G) {
    const y = loc(G.ora).getUTCFullYear() - 1, l = G.storico.filter(x => loc(x.t).getUTCFullYear() === y); if (!l.length) return;
    const ce = contoEconomico(l); let imponibile = ce.anteImposte;
    G.perditeFiscali ||= 0;
    if (imponibile <= 0) { G.perditeFiscali += -imponibile; notizia(G, `Bilancio fiscale ${y} in perdita: ${eur(-imponibile)} da scalare negli anni prossimi.`, 'info'); return; }
    const scalo = Math.min(G.perditeFiscali, imponibile * 0.8); imponibile -= scalo; G.perditeFiscali -= scalo;
    const tasse = Math.round(imponibile * ALIQUOTA); G.cassa -= tasse; G.oggi.costi.imposte = (G.oggi.costi.imposte || 0) + tasse;
    (G.tasse ||= []).unshift({ anno: y, imponibile, tasse, scalo });
    notizia(G, `Pagate le imposte sull’utile ${y}: ${eur(tasse)} (24%${scalo ? `, scalate perdite passate per ${eur(scalo)}` : ''}).`, 'info', true);
  }
  const usdGiornalieri = G => { const u = G.storico.slice(-30), carb = u.reduce((s, x) => s + (x.dettaglio?.carburante || 0) + (x.dettaglio?.leasing || 0), 0); return u.length ? carb / u.length : 0; };

  /* ---------- Clienti per tipo, scaglioni tariffari, stagioni e promozioni, canali di vendita, notorietà e recensioni ---------- */
  // domanda per giorno della settimana (indice = getUTCDay, domenica = 0)
  const DOW = { affari: [0.75, 1.25, 1.1, 1.05, 1.1, 1.2, 0.45], vacanza: [1.2, 0.9, 0.8, 0.85, 0.95, 1.25, 1.15], parenti: [1.15, 0.95, 0.85, 0.9, 1, 1.2, 1] };
  const _seg = {};
  function segmenti(da, a) {
    const k = chiaveCitta(da, a); if (_seg[k]) return _seg[k];
    const q = quoteClassi(da, a), tur = (AP[da].tur + AP[a].tur) / 2;
    const aff = clamp(0.15 + (q.J + q.W) * 1.4 - tur * 0.25, 0.08, 0.6), vac = clamp(tur * 0.85, 0.1, 0.7), par = Math.max(0.1, 1 - aff - vac), t = aff + vac + par;
    return (_seg[k] = { affari: aff / t, vacanza: vac / t, parenti: par / t });
  }
  const dowSegmenti = (da, a, giorno) => { const s = segmenti(da, a), g = loc(giorno).getUTCDay(); return s.affari * DOW.affari[g] + s.vacanza * DOW.vacanza[g] + s.parenti * DOW.parenti[g]; };
  // chi viaggia per lavoro vuole partire presto la mattina o la sera
  const pesoAffari = min => { const h = min / 60; return (h >= 6 && h < 9.5) || (h >= 17 && h < 20.5) ? 1 : h >= 9.5 && h < 17 ? 0.55 : 0.3; };
  // scaglioni di prezzo rispetto alla tariffa della classe
  const SCAGLIONI = { promo: 0.8, base: 1, flex: 1.3 };
  function quotaPromo(G, k) {
    const r = G.rotte[k]; if (!r) return 0.2;
    if (G.esperto && r.promo != null) return r.promo;
    // revenue management automatico: meno posti in promozione quando i voli si riempiono
    return clamp(0.45 - 1.2 * ((r.lfRecente ?? 0.75) - 0.65), 0.05, 0.45);
  }
  function mixTariffe(G, k, da, a) {
    const s = segmenti(da, a), q = quotaPromo(G, k), qe = Math.min(q, 0.75), C = G.canali || {}, az = C.aziende ? 1 : 0;
    const presto = qe * 0.6;
    let resa = s.affari * (0.6 * SCAGLIONI.flex + 0.4 * SCAGLIONI.base) * (1 - 0.08 * az) + (1 - s.affari) * (presto * SCAGLIONI.promo + (1 - presto) * SCAGLIONI.base);
    let domanda = (1 + 0.25 * presto * (1 - s.affari)) * (1 + 0.12 * s.affari * az) * (C.ota === false ? 0.9 : 1);
    return { resa, domanda, q, seg: s };
  }
  const altaStagione = (da, a, t) => { const m = (loc(t).getUTCMonth() + (AP[a].lat < 0 ? 6 : 0)) % 12; return m >= 5 && m <= 7 && (AP[da].tur + AP[a].tur) / 2 > 0.25; };
  const scontoPromozione = (G, k, t) => { let s = 0; for (const p of G.promozioni || []) if (p.k === k && t >= p.inizio && t < p.fine) s = Math.max(s, p.sconto); return s; };
  function prezziGiorno(G, da, a, t) {
    const k = chiave(da, a), r = G.rotte[k]; if (!r) return prezziRotta(G, da, a);
    const wk = [5, 6, 0].includes(loc(t).getUTCDay());
    const f = (altaStagione(da, a, t) ? (r.alta || 1) : 1) * (wk ? (r.weekend || 1) : 1) * (1 - scontoPromozione(G, k, t));
    return f === 1 ? r : { pY: r.pY * f, pW: r.pW * f, pJ: r.pJ * f };
  }
  // quota delle vendite per canale e costo medio di distribuzione sui biglietti
  function canali(G) {
    const C = G.canali || {}, M = G.mod || {};
    let sito = 0.25 + (M.sito ? 0.1 : 0) + (M.app ? 0.1 : 0), aziende = C.aziende ? 0.25 : 0.12, ota = C.ota === false ? 0 : Math.max(0, 1 - sito - aziende);
    if (C.ota === false) sito = 1 - aziende;
    return { sito, aziende, ota, costo: sito * 0.008 + aziende * 0.03 + ota * 0.04 };
  }
  // notorietà del marchio città per città e voto medio dei passeggeri
  function fattoreMarchio(G, da, a) {
    const N = G.notorieta; if (!N) return 1;
    const n = ((N[AP[da].citta] ?? 0.3) + (N[AP[a].citta] ?? 0.3)) / 2;
    return (0.85 + 0.3 * n) * (1 + 0.06 * ((G.stelle ?? 3.2) - 3.2));
  }
  function giornoCommerciale(G) {
    const S = statRecenti(G, 7);
    for (const [k, r] of Object.entries(G.rotte)) { const x = S.rotte[k]; if (x && x.posti) r.lfRecente = x.pax / x.posti; }
    G.promozioni = (G.promozioni || []).filter(p => p.fine > G.ora);
    // notorietà: cresce dove voli spesso e fai pubblicità, cala dove sparisci
    G.notorieta ||= {};
    const dep = {}; for (const ae of flottaAttiva(G)) for (const l of mediaCiclo(ae).tratte) { const c = AP[l.da].citta; dep[c] = (dep[c] || 0) + l.peso * 7; }
    const pubbl = {}; for (const c0 of G.campagne || []) if (c0.forza > 0.05) { if (c0.ambito === 'citta') pubbl[c0.obiettivo] = (pubbl[c0.obiettivo] || 0) + 0.15 * c0.forza; else if (c0.ambito === 'rotta') for (const i of c0.obiettivo.split('-')) pubbl[AP[i].citta] = (pubbl[AP[i].citta] || 0) + 0.08 * c0.forza; else for (const c of Object.keys(dep)) pubbl[c] = (pubbl[c] || 0) + 0.08 * c0.forza; }
    for (const c of new Set([...Object.keys(G.notorieta), ...Object.keys(dep)])) {
      const target = clamp(0.2 + Math.min(0.55, (dep[c] || 0) / 60) + Math.min(0.25, pubbl[c] || 0), 0, 1), n = G.notorieta[c] ?? 0.3;
      G.notorieta[c] = n + (target - n) * 0.015;
    }
    // recensioni: puntualità, cancellazioni, servizio di bordo, coincidenze perse
    const ieri = G.storico.at(-1);
    if (ieri && ieri.voli) {
      const punt = ieri.puntuali / ieri.voli, canc = ieri.canc / (ieri.voli + ieri.canc), nps = G.bordo ? (analisiProdotto(G).Y.nps / 100) : 0.3;
      const voto = clamp(3.2 + (punt - 0.85) * 6 - canc * 8 + (nps - 0.3) * 2 - Math.min(0.5, (ieri.persi || 0) / 50) - Math.min(0.5, (ieri.negati || 0) / 30), 1, 5);
      G.stelle = (G.stelle ?? 3.5) * 0.97 + voto * 0.03;
    }
  }

  /* ---------- Flotta: invecchiamento, revisioni pesanti, contratti di leasing, ammodernamenti ---------- */
  const REVISIONI = { C: { nome: 'Revisione C', giorni: 7, costoF: 4, ogni: 730 }, D: { nome: 'Revisione D', giorni: 25, costoF: 20, ogni: 2190 } };
  const ANNI_LEASING = { 6: 1, 8: 0.95, 10: 0.92 };
  const AMMODERNAMENTI = {
    winglet: { nome: 'Alette alle estremità delle ali', fattore: 0.96, costo: m => 900000 * m.peso / 78, giorni: 4, ok: (ae, m) => m.tipo !== 'ATR' },
    motori: { nome: 'Motori di nuova generazione', fattore: 0.9, costo: m => 5e6 * m.peso / 78, giorni: 20, ok: ae => ae.eta >= 6 }
  };
  function completaAereo(G, ae, nuovo) {
    ae.consumoF ??= 1; ae.ammodernamenti ||= [];
    const base = ae.stato === 'consegna' ? ae.fino : G.ora;
    ae.prossimaC ??= base + (nuovo ? 730 : Math.floor(rnd() * 730)) * GIORNO;
    ae.prossimaD ??= base + (nuovo ? 2190 : Math.floor(rnd() * 2190)) * GIORNO;
    if (ae.modo === 'leasing' && !ae.leasingFine) ae.leasingFine = base + (nuovo ? 8 : 2 + Math.floor(rnd() * 5)) * 365 * GIORNO;
  }
  const costoRevisione = (G, ae, t) => Math.round(MOD[ae.modello].check * REVISIONI[t].costoF * (1 + ae.eta * 0.02) * ((G.mod || {}).hangar ? 0.7 : 1) * (G.manutenzioneInterna ? 0.65 : 1));
  function pianificaRevisione(G, id, tipo, quando = 'subito') {
    const ae = G.aerei.find(a => a.id === id), R0 = REVISIONI[tipo]; if (!ae || !R0) return err('Revisione non valida');
    if (ae.lavori) return err('L’aereo ha già lavori programmati');
    let inizio = fineGiornataAereo(G, ae);
    if (quando === 'inverno') { const d = loc(G.ora), m = d.getUTCMonth(); if (!(m >= 10 || m <= 1)) inizio = Math.max(inizio, Date.UTC(d.getUTCFullYear(), 10, 10) - FUSO * ORA); }
    ae.lavori = { tipo, inizio, fine: inizio + R0.giorni * GIORNO, costo: costoRevisione(G, ae, tipo) };
    rigeneraAereo(G, ae);
    notizia(G, `${ae.marche}: ${R0.nome.replace('Revisione', 'revisione')} dal ${dataDi(inizio)} per ${R0.giorni} giorni (${eur(ae.lavori.costo)}). In quei giorni l’aereo non vola: i suoi voli non vengono messi in vendita.`, 'info');
    return ok(`${R0.nome} programmata`);
  }
  function giornoFlotta(G) {
    const d = loc(G.ora), inverno = d.getUTCMonth() >= 10 || d.getUTCMonth() <= 1, auto = !G.esperto || (G.auto && G.auto.ispezioni);
    for (const ae of flottaAttiva(G)) {
      completaAereo(G, ae, false);
      if (d.getUTCDate() === 1 && d.getUTCMonth() === 0) ae.eta++;
      if (ae.stato === 'consegna' || ae.lavori) continue;
      for (const t of ['D', 'C']) {
        const manca = (ae['prossima' + t] - G.ora) / GIORNO;
        if (manca < 60 && !ae['avviso' + t]) { ae['avviso' + t] = true; notizia(G, `${ae.marche}: ${REVISIONI[t].nome.replace('Revisione', 'revisione')} da fare entro il ${dataDi(ae['prossima' + t])}.`, 'info'); }
        if (auto && manca < 120) { pianificaRevisione(G, ae.id, t, inverno || manca < 45 ? 'subito' : 'inverno'); break; }
      }
      // contratti di leasing in scadenza
      if (ae.modo === 'leasing' && ae.leasingFine) {
        const manca = (ae.leasingFine - G.ora) / GIORNO;
        if (manca < 60 && !ae.avvisoLeasing) { ae.avvisoLeasing = true; notizia(G, `Il leasing di ${ae.marche} scade il ${dataDi(ae.leasingFine)}${G.esperto ? ': decidi se rinnovarlo o restituire l’aereo (Flotta)' : ': verrà rinnovato in automatico con un canone più basso'}.`, 'info', true); }
        if (G.ora >= ae.leasingFine) { if (ae.restituire) restituisci(G, ae, false); else rinnovaLeasing(G, ae); }
      }
    }
  }
  function rinnovaLeasing(G, ae) {
    ae.leasing = Math.round(ae.leasing * 0.85 / 100) * 100; ae.leasingFine = Math.max(G.ora, ae.leasingFine || G.ora) + 4 * 365 * GIORNO; ae.avvisoLeasing = false; ae.restituire = false;
    notizia(G, `Leasing di ${ae.marche} rinnovato per 4 anni a ${eur(ae.leasing)} al giorno.`, 'info');
  }
  // costo per riconsegnare un aereo in leasing (ispezioni da fare, revisione vicina)
  const costoRiconsegna = (G, ae) => (ae.oreDaCheck > 300 ? MOD[ae.modello].check : 0) + (ae.prossimaC - G.ora < 180 * GIORNO ? costoRevisione(G, ae, 'C') * 0.5 : 0);
  function restituisci(G, ae, anticipata) {
    const resto = Math.max(0, (ae.leasingFine - G.ora) / GIORNO), penale = anticipata ? Math.round(Math.min(resto, 365) * ae.leasing * 0.5) : 0, ric = Math.round(costoRiconsegna(G, ae));
    G.cassa -= penale + ric; G.oggi.costi.altro = (G.oggi.costi.altro || 0) + penale + ric;
    G.voli = G.voli.filter(v => !(v.ae === ae.id && v.stato === 'prog')); G.aerei = G.aerei.filter(a => a !== ae); G._roster = null;
    notizia(G, `${ae.marche} restituito al locatore${penale ? `: penale ${eur(penale)}` : ''}${ric ? `, riconsegna ${eur(ric)}` : ''}.`, 'info');
    return penale + ric;
  }

  /* ---------- Operazioni: aerei di riserva, riprotezione, congestione, diritti di traffico ---------- */
  // un aereo dello stesso tipo, fermo nello stesso aeroporto e libero per il tempo del volo, può sostituirne uno guasto
  function aereoDiRiserva(G, v, orig) {
    if (G.irops && G.irops.riserva === false) return null;
    const tipo = MOD[orig.modello].tipo, pax = venduti(v);
    return flottaAttiva(G).find(x => x !== orig && x.stato === 'attivo' && !x.inVolo && !x.lavori && x.pos === v.da && MOD[x.modello].tipo === tipo && posti(x) >= pax &&
      !G.voli.some(w => w.ae === x.id && w.stato === 'prog' && w.dep > v.dep - 30 * MIN && w.dep < v.arr + 3 * ORA)) || null;
  }
  function registraIrops(G, testo) { (G.iropsLog ||= []).unshift({ t: G.ora, testo }); if (G.iropsLog.length > 60) G.iropsLog.length = 60; }
  // passeggeri di un volo cancellato spostati sul prossimo volo della stessa rotta (entro 24 ore)
  function riproteggi(G, v) {
    const pax = venduti(v); if (!pax || (G.irops && G.irops.riprotezione === false)) return 0;
    const v2 = G.voli.find(w => w !== v && w.stato === 'prog' && w.da === v.da && w.a === v.a && w.dep > v.dep && w.dep < v.dep + 24 * ORA); if (!v2) return 0;
    const ae2 = G.aerei.find(x => x.id === v2.ae); if (!ae2) return 0;
    let spostati = 0;
    for (const c of CL) { const tot = v.v[c] + v.t[c]; if (!tot) continue; const liberi = Math.max(0, ae2.cab[c] - v2.v[c] - v2.t[c]), n = Math.min(tot, liberi); if (!n) continue; v2.v[c] += n; v2.inc[c] += v.inc[c] * n / tot; spostati += n; }
    if (spostati) registraIrops(G, `${spostati} passeggeri del ${v.num} riprotetti sul ${v2.num} delle ${oraIn(v2.dep)}.`);
    return spostati;
  }
  // diritti di traffico tra paesi di continenti diversi
  const chiaveDiritti = (a, b) => [AP[a].paese, AP[b].paese].sort().join('-');
  const servonoDiritti = (a, b) => AP[a].continente !== AP[b].continente;
  const dirittiOk = (G, a, b) => !servonoDiritti(a, b) || (G.diritti && G.diritti[chiaveDiritti(a, b)]?.stato === 'concessi');
  function chiediDiritti(G, a, b) {
    G.diritti ||= {}; const k = chiaveDiritti(a, b), x = G.diritti[k];
    if (x && x.stato === 'concessi') return ok('Diritti già concessi');
    if (x && x.stato === 'attesa') return ok(`Diritti in arrivo il ${dataDi(x.pronto)}`);
    if (x && x.stato === 'negati' && G.ora < x.riprova) return err(`Diritti negati: puoi riprovare dal ${dataDi(x.riprova)}`);
    paga(G, 50000, 'altro'); G.diritti[k] = { stato: 'attesa', pronto: G.ora + Math.round((30 + Math.floor(rnd() * 45)) * (1 - 0.15 * liv(G))) * GIORNO };
    notizia(G, `Chiesti i diritti di traffico ${k.replace('-', '–')}: risposta entro il ${dataDi(G.diritti[k].pronto)}. Fino ad allora i voli su quelle rotte non si vendono.`, 'info');
    return ok('Richiesta dei diritti di traffico inviata');
  }
  function giornoOperazioni(G) {
    for (const [k, x] of Object.entries(G.diritti || {})) if (x.stato === 'attesa' && G.ora >= x.pronto) {
      if (rnd() < 0.88 + 0.03 * liv(G)) { x.stato = 'concessi'; notizia(G, `Concessi i diritti di traffico ${k.replace('-', '–')}: i voli su quelle rotte vanno in vendita.`, 'buona', true); for (const ae of flottaAttiva(G)) rigeneraAereo(G, ae); }
      else { x.stato = 'negati'; x.riprova = G.ora + 120 * GIORNO; notizia(G, `Negati i diritti di traffico ${k.replace('-', '–')}: potrai riprovare tra 4 mesi.`, 'cattiva', true); }
    }
  }

  /* ---------- Proprietà: soci, consiglio di amministrazione, assemblee, scalate, l'amministratore delegato ---------- */
  const TIPI_SOCIO = {
    tu: { nome: 'Tu', descr: 'La tua quota personale', nomi: ['Tu (amministratore delegato)'] },
    fondo: { nome: 'Fondo d’investimento', descr: 'Vuole utili e dividendi; dopo qualche anno vorrà rivendere', nomi: ['Aquila Capital', 'Vela Partners', 'Orizzonte Equity', 'Nord Capital'] },
    famiglia: { nome: 'Famiglia', descr: 'Vuole stabilità, posti di lavoro e un marchio rispettato', nomi: ['Famiglia Orsini', 'Famiglia Ferraris', 'Soci fondatori'] },
    dipendenti: { nome: 'Dipendenti', descr: 'Azionariato dei dipendenti: guarda a morale e stipendi', nomi: ['Dipendenti (azionariato)'] },
    banca: { nome: 'Banca', descr: 'Vuole il debito sotto controllo', nomi: ['Banca Tirrenica', 'Credito Padano'] },
    golfo: { nome: 'Fondo sovrano', descr: 'Vuole crescita e voli intercontinentali', nomi: ['Al Noor Investment', 'Doha Sky Holding'] },
    mercato: { nome: 'Borsa', descr: 'Piccoli azionisti: seguono il prezzo del titolo', nomi: ['Piccoli azionisti (borsa)'] },
    amico: { nome: 'Investitore amico', descr: 'Ti sostiene: vota con te e non vende', nomi: ['Fondazione Volare', 'Cassa Previdenza Piloti'] },
    rivale: { nome: 'Concorrente', descr: 'Un concorrente: vuole prenderti la compagnia' }
  };
  const NOMI_CONSIGLIERI = ['Giulia Martini', 'Paolo Ferretti', 'Elena Russo', 'Marco Bellini', 'Sara Conti', 'Luca Barbieri', 'Anna Galli', 'Davide Moretti', 'Chiara Fontana', 'Stefano Greco', 'Laura Rinaldi', 'Andrea Costa', 'Valeria Lombardi', 'Franco Marini', 'Hassan Al Rashid', 'Claire Dubois', 'James Whitaker', 'Ingrid Larsen', 'Kenji Mori', 'Sofia Esposito', 'Pietro Sala', 'Marta Ferri'];
  const CARATTERI = { prudente: 'prudente', ambizioso: 'ambizioso', finanziario: 'attento ai conti', indipendente: 'indipendente' };
  const SOCI_SCENARIO = {
    crisi: [['tu', 0.02], ['famiglia', 0.43], ['banca', 0.25], ['fondo', 0.2], ['dipendenti', 0.1]],
    tempesta: [['tu', 0.3], ['banca', 0.3], ['fondo', 0.25], ['dipendenti', 0.15]],
    golfo: [['tu', 0.4], ['golfo', 0.45], ['dipendenti', 0.15]],
    globale: [['tu', 0.4], ['fondo', 0.35], ['famiglia', 0.15], ['dipendenti', 0.1]],
    scalata: [['tu', 0.45], ['fondo', 0.3], ['golfo', 0.15], ['dipendenti', 0.1]],
    carriera: [['tu', 0.01], ['famiglia', 0.44], ['fondo', 0.35], ['banca', 0.1], ['dipendenti', 0.1]],
    _: [['tu', 0.6], ['fondo', 0.25], ['famiglia', 0.1], ['dipendenti', 0.05]]
  };
  const COMPENSI = [{ nome: 'Contenuto', annuo: 300000 }, { nome: 'In linea col mercato', annuo: 600000 }, { nome: 'Generoso con stock option', annuo: 1200000, opzioni: 0.01 }];
  const pick = a => a[Math.floor(rnd() * a.length)];
  const PR = G => G.proprieta;
  const socio = (G, id) => PR(G).soci.find(s => s.id === id);
  const mia = G => socio(G, 'tu')?.quota || 0;
  function nuovoSocio(G, tipo, quota, extra = {}) {
    const P = PR(G), usati = new Set(P.soci.map(s => s.nome)), T = TIPI_SOCIO[tipo];
    const liberi = (T.nomi || ['Socio']).filter(n => !usati.has(n)), nome = extra.nome || (liberi.length ? liberi[Math.floor(rnd() * liberi.length)] : T.nomi?.[0] || 'Socio');
    const s = { id: tipo === 'tu' || tipo === 'mercato' ? tipo : 's' + (P.seq++), tipo, nome, quota, umore: tipo === 'amico' ? 85 : 60, dal: G.ora, ...extra, nome };
    P.soci.push(s); return s;
  }
  function syncBorsa(G) { const B = G.borsa; if (B && B.quotata) B.mie = mia(G) * B.azioni; }
  function riordina(G) {
    const P = PR(G); P.soci = P.soci.filter(s => s.id === 'tu' || s.quota > 0.0005);
    const t = P.soci.reduce((x, s) => x + s.quota, 0); if (t > 0) for (const s of P.soci) s.quota /= t;
    P.soci.sort((a, b) => (b.id === 'tu') - (a.id === 'tu') || b.quota - a.quota);
    syncBorsa(G); rinnovaConsiglio(G);
  }
  // nuove azioni: tutti diluiti, il destinatario prende la frazione f del nuovo capitale
  function emetti(G, f, dest) {
    for (const s of PR(G).soci) s.quota *= 1 - f;
    dest.quota += f; if (G.borsa.quotata) G.borsa.azioni /= 1 - f; riordina(G);
  }
  function trasferisci(G, da, a, q) { q = Math.min(q, da.quota); da.quota -= q; a.quota += q; riordina(G); return q; }
  function annulla(G, s, q) { q = Math.min(q, s.quota); s.quota -= q; if (G.borsa.quotata) G.borsa.azioni *= 1 - q; riordina(G); return q; }
  // 7 posti: l'amministratore delegato più 6 divisi con il metodo D'Hondt tra i soci sopra il 5%
  function seggi(G) {
    const el = PR(G).soci.filter(s => s.quota >= 0.05), n = {}; for (const s of el) n[s.id] = 0;
    for (let i = 0; i < 6; i++) { let best = null, bv = -1; for (const s of el) { const v = s.quota / (n[s.id] + 1); if (v > bv) { bv = v; best = s; } } if (best) n[best.id]++; }
    return n;
  }
  function rinnovaConsiglio(G, tutti = false) {
    const P = PR(G); if (!P) return; const n = seggi(G), vecchi = tutti ? [] : (P.consiglio || []).filter(c => c.socio !== 'ad'), nuovo = [{ nome: 'Tu', socio: 'ad', carattere: 'indipendente' }];
    const usati = new Set(), conta = {};
    for (const c of vecchi) if ((conta[c.socio] || 0) < (n[c.socio] || 0)) { nuovo.push(c); usati.add(c.nome); conta[c.socio] = (conta[c.socio] || 0) + 1; }
    for (const [id, k] of Object.entries(n)) for (let i = conta[id] || 0; i < k; i++) {
      const s = socio(G, id), liberi = NOMI_CONSIGLIERI.filter(x => !usati.has(x) && !(P.consiglio || []).some(c => c.nome === x));
      const nome = id === 'tu' ? pick(liberi) : s.tipo === 'rivale' ? `${pick(liberi)} (${s.nome})` : pick(liberi); usati.add(nome);
      nuovo.push({ nome, socio: id, carattere: id === 'tu' ? 'fedele' : pick(Object.keys(CARATTERI)) });
    }
    P.consiglio = nuovo;
  }
  const seggiTuoi = G => PR(G).consiglio.filter(c => c.socio === 'ad' || c.socio === 'tu' || socio(G, c.socio)?.tipo === 'amico').length;
  const controllo = G => !PR(G) || !!G.straordinaria || mia(G) > 0.5 || seggiTuoi(G) >= 4;
  const sogliaVoto = G => Math.max(4e6, Math.round(valoreCompagnia(G) * 0.12 / 1e5) * 1e5);
  const TIPI_VOTO = { flotta: 'spesa', acquisizione: 'spesa', opa: 'spesa', quota: 'spesa', prestito: 'debito', obbligazione: 'debito', dividendo: 'dividendo', aumento: 'capitale', quotazione: 'capitale', ingresso: 'capitale', difesa: 'difesa' };
  // controllo delle decisioni grosse: se non hai la maggioranza decide il CdA
  function serveVoto(G, tipo, importo, titolo) {
    if (!PR(G) || G._senzaVoto) return null;
    if (G.straordinaria && ['acquisizione', 'opa', 'quota', 'dividendo', 'quotazione'].includes(tipo)) return err('In amministrazione straordinaria non è permesso');
    if (controllo(G)) return null;
    const A0 = G._approvato; if (A0 && A0.tipo === tipo && G.ora - A0.t < GIORNO) { G._approvato = null; return null; }
    if (importo != null && importo < sogliaVoto(G)) return null;
    return { errore: `Serve l’approvazione del CdA: ${titolo}`, voto: { tipo, titolo, importo: importo || 0 } };
  }
  function probabilitaSi(G, c, tipo, importo) {
    const s = socio(G, c.socio); if (c.socio === 'ad' || c.socio === 'tu' || s?.tipo === 'amico') return 1;
    if (s?.tipo === 'rivale') return tipo === 'difesa' ? 0 : 0.15;
    const cat = TIPI_VOTO[tipo] || 'spesa', fiss = Object.values(costiFissi(G)).reduce((x, y) => x + y, 0), cassaDopo = G.cassa - (cat === 'spesa' ? importo : 0);
    let p = 0.3 + G.cda.fiducia / 200 + ((s?.umore ?? 60) - 55) / 200 + (G.ad.rep - 50) / 300;
    const t = s?.tipo;
    if (cat === 'spesa') { p += (t === 'golfo' ? 0.15 : t === 'fondo' ? -0.03 : t === 'banca' ? -0.08 : 0) + (c.carattere === 'ambizioso' ? 0.1 : c.carattere === 'prudente' ? -0.1 : 0); if (cassaDopo < 20 * fiss) p -= 0.2; }
    if (cat === 'debito') { const lev = debitoTot(G) / Math.max(1, valoreCompagnia(G)); p += (t === 'banca' ? 0.1 : t === 'fondo' ? -0.05 : 0) - Math.max(0, lev - 0.4) * 0.6 + (c.carattere === 'prudente' ? -0.1 : 0); }
    if (cat === 'dividendo') p += (t === 'fondo' ? 0.25 : t === 'mercato' ? 0.2 : t === 'dipendenti' ? -0.1 : 0.05) + (c.carattere === 'finanziario' ? 0.1 : 0);
    if (cat === 'capitale') p += (t === 'fondo' || t === 'famiglia' ? -0.12 : 0) + (G.cassa < 30 * fiss ? 0.2 : 0);
    if (cat === 'difesa') p += 0.2;
    return clamp(p, 0.05, 0.95);
  }
  function votazione(G, voto, aiuto = 0) {
    const P = PR(G), voti = P.consiglio.map(c => ({ nome: c.nome, socio: c.socio, si: rnd() < probabilitaSi(G, c, voto.tipo, voto.importo) + (c.socio !== 'ad' ? aiuto : 0) }));
    // diritto di veto concesso a un socio
    const veto = P.soci.find(s => s.cond === 'veto' && ['acquisizione', 'opa', 'quota'].includes(voto.tipo) && voti.some(v => v.socio === s.id && !v.si));
    const si = voti.filter(v => v.si).length, approvata = si > voti.length / 2 && !veto;
    const rec = { t: G.ora, ...voto, voti, si, no: voti.length - si, approvata, veto: veto ? veto.nome : null };
    P.votazioni.unshift(rec); if (P.votazioni.length > 30) P.votazioni.length = 30;
    if (!approvata) G.cda.fiducia = Math.max(0, G.cda.fiducia - 2);
    return rec;
  }
  // a fine semestre, con la fiducia molto bassa, il CdA può sfiduciarti (non se hai la maggioranza)
  function mozioneSfiducia(G, motivo) {
    if (controllo(G) || G.esito) return;
    const P = PR(G), voti = P.consiglio.map(c => ({ nome: c.nome, si: c.socio === 'ad' || c.socio === 'tu' || socio(G, c.socio)?.tipo === 'amico' ? false : rnd() < clamp(0.45 + (20 - G.cda.fiducia) / 40 + (50 - G.ad.rep) / 200, 0.05, 0.95) }));
    const si = voti.filter(v => v.si).length;
    P.votazioni.unshift({ t: G.ora, tipo: 'sfiducia', titolo: 'Mozione di sfiducia contro l’amministratore delegato', voti, si, no: voti.length - si, approvata: si > voti.length / 2 });
    if (si > voti.length / 2) licenzia(G, motivo || `Il CdA ti ha sfiduciato con ${si} voti su ${voti.length}`);
    else { G.cda.fiducia = Math.min(100, G.cda.fiducia + 6); notizia(G, `Mozione di sfiducia respinta: ${voti.length - si} consiglieri su ${voti.length} ti hanno difeso. Hai un’ultima occasione.`, 'cattiva', true); }
  }
  function offerteLavoro(G) {
    const cand = G.rivali.filter(R => !R.crisi || G.ad.rep > 60).sort((a, b) => (b.forza - a.forza)), n = G.ad.rep >= 60 ? 3 : G.ad.rep >= 35 ? 2 : 1;
    // con una reputazione bassa ti chiamano solo le compagnie in difficoltà
    const lista = G.ad.rep >= 45 ? cand : G.rivali.slice().sort((a, b) => a.forza - b.forza);
    return lista.slice(0, n).map(R => R.id);
  }
  function licenzia(G, motivo) {
    G.licenziamento = { t: G.ora, motivo, offerte: offerteLavoro(G) };
    G.esito = { tipo: 'licenziato', t: G.ora, motivo };
    G.ad.rep = Math.max(0, G.ad.rep - 8);
    notizia(G, `Sei stato licenziato: ${motivo}.`, 'cattiva', true);
  }
  // ---------- l'amministratore delegato (tu) ----------
  function initProprieta(G) {
    G.ad ||= { rep: 50, stipendio: 600000, patrimonio: 0, opzioni: [], carriera: [], compenso: 1 };
    if (G.proprieta) return;
    const P = G.proprieta = { seq: 1, soci: [], consiglio: [], votazioni: [], assemblee: [], offerte: [], ultimaAssemblea: null, prossimaOfferta: G.ora + 40 * GIORNO };
    const B = G.borsa;
    if (B && B.quotata) { nuovoSocio(G, 'tu', B.mie / B.azioni); nuovoSocio(G, 'mercato', 1 - B.mie / B.azioni); }
    else for (const [tipo, q] of SOCI_SCENARIO[G.scenario] || SOCI_SCENARIO._) nuovoSocio(G, tipo, q);
    G.ad.patrimonio ||= Math.round(Math.max(0, G.cassa) * mia(G) * 0.05 / 1e4) * 1e4;
    riordina(G);
  }
  // umore dei soci, una volta a settimana
  function obiettivoSocio(G, s) {
    const u30 = utileUltimi(G, 30), B = G.borsa, var30 = B.quotata && B.storico.length > 30 ? B.prezzo / B.storico.at(-31).p - 1 : 0, lev = debitoTot(G) / Math.max(1, valoreCompagnia(G));
    switch (s.tipo) {
      case 'fondo': return 50 + clamp(u30 / Math.max(1, Math.abs(u30) + 3e5), -1, 1) * 30 + (G.ad.ultimoDividendo && G.ora - G.ad.ultimoDividendo < 400 * GIORNO ? 10 : -5);
      case 'famiglia': return 30 + G.reputazione * 0.4 + G.morale * 0.3;
      case 'dipendenti': return G.morale;
      case 'banca': return 85 - lev * 70 + (u30 > 0 ? 5 : -10);
      case 'golfo': return 45 + (u30 > 0 ? 10 : -10) + Math.min(25, continentiServiti(G) * 5) + Math.min(10, flottaAttiva(G).length / 3);
      case 'mercato': return 55 + var30 * 200 + (u30 > 0 ? 5 : -10);
      case 'amico': return 85;
      default: return 50;
    }
  }
  function settimanaSoci(G) {
    const P = PR(G); let num = 0, den = 0;
    for (const s of P.soci) if (s.id !== 'tu') { s.umore = clamp(s.umore + (clamp(obiettivoSocio(G, s), 0, 100) - s.umore) * 0.15, 0, 100); if (s.tipo !== 'rivale') { num += s.umore * s.quota; den += s.quota; } }
    if (den) G.cda.fiducia = clamp(G.cda.fiducia + (num / den - G.cda.fiducia) * 0.03 + (G.ad.rep - 50) * 0.01, 0, 100);
    // l'uscita del fondo, dopo qualche anno
    for (const s of P.soci) if (!P.uscita && (s.tipo === 'fondo' && G.ora - s.dal > 4 * 365 * GIORNO || s.cond === 'uscita' && G.ora - s.dal > 4 * 365 * GIORNO) && s.quota >= 0.03 && !s.uscitaFatta) {
      const prezzo = Math.round(valoreEquo(G) * s.quota * (s.cond === 'uscita' ? 1.2 : 1.05) / 1e5) * 1e5;
      P.uscita = { socio: s.id, prezzo, scade: G.ora + 30 * GIORNO, obbligo: s.cond === 'uscita' };
      notizia(G, `${s.nome} vuole uscire dalla compagnia e vendere il suo ${pct1(s.quota)}: ${s.cond === 'uscita' ? 'il patto ti obbliga a ricomprarlo' : 'puoi ricomprarlo o lasciarlo a un nuovo investitore'} (${eur(prezzo)}).`, 'info', true);
    }
  }
  const pct1 = x => (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';
  function chiudiUscita(G, compra) {
    const P = PR(G), U = P.uscita; if (!U) return err('Nessuna uscita in corso'); const s = socio(G, U.socio); P.uscita = null;
    if (!s) return ok('Socio già uscito');
    s.uscitaFatta = true;
    if (compra || U.obbligo) {
      if (G.cassa >= U.prezzo) { G.cassa -= U.prezzo; flusso(G, 'finanziamenti', -U.prezzo); }
      else { G.debiti.push({ id: 'd' + (G.seq++), capitale: U.prezzo, tasso: rating(G).tasso + 0.01, rata: Math.round(U.prezzo / (3 * 365)) }); notizia(G, `Cassa insufficiente: il riacquisto delle quote di ${s.nome} diventa un debito a 3 anni.`, 'cattiva'); }
      const q = annulla(G, s, s.quota); notizia(G, `Hai ricomprato il ${pct1(q)} di ${s.nome} per ${eur(U.prezzo)}: le altre quote crescono in proporzione.`, 'buona', true);
      return ok('Quote ricomprate');
    }
    // il pacchetto va a un nuovo investitore, a volte a un concorrente
    const R = !G.borsa.quotata && rnd() < 0.3 ? G.rivali.filter(x => !alleato(G, x.id) && x.forza > 45).sort(() => rnd() - 0.5)[0] : null;
    const dest = G.borsa.quotata && rnd() < 0.5 ? (socio(G, 'mercato') || nuovoSocio(G, 'mercato', 0)) : R ? nuovoSocio(G, 'rivale', 0, { nome: R.nome, rid: R.id, umore: 30 }) : nuovoSocio(G, pick(['fondo', 'golfo', 'banca']), 0);
    trasferisci(G, s, dest, s.quota);
    notizia(G, `${s.nome} ha venduto la sua quota a ${dest.nome}.${R ? ' Attenzione: è un concorrente.' : ''}`, R ? 'cattiva' : 'info', true);
    return ok('Quote passate al nuovo socio');
  }
  // offerte di investitori che vogliono entrare nel capitale
  function nuovaOfferta(G) {
    const P = PR(G); if (P.offerte.length >= 2 || G.straordinaria || valoreCompagnia(G) < 8e6) return;
    const tipo = pickPax(['fondo', 'golfo', 'banca', 'amico', 'fondo']), q = pickPax([0.1, 0.15, 0.2, 0.25]), premio = Math.round((Math.random() * 0.35 - 0.1) * 100) / 100;
    const cond = tipo === 'amico' ? null : pickPax(['seggio', 'dividendo', 'uscita', 'veto']);
    const T = TIPI_SOCIO[tipo], usati = new Set(P.soci.map(s => s.nome)), nome = T.nomi.find(n => !usati.has(n)) || T.nomi[0];
    const incasso = Math.round(valoreEquo(G) * q / (1 - q) * (1 + premio) / 1e5) * 1e5;
    P.offerte.push({ id: 'o' + (P.seq++), tipo, nome, quota: q, premio, cond, incasso, scade: G.ora + 20 * GIORNO });
    notizia(G, `${nome} vuole entrare nel capitale: offre ${eur(incasso)} per il ${pct1(q)} (pagina Soci e CdA).`, 'info', true);
  }
  const CONDIZIONI = { seggio: 'Nessuna condizione oltre al posto in CdA', dividendo: 'Vuole un dividendo ogni anno: senza, il suo umore crolla', uscita: 'Tra 4 anni dovrai ricomprare le sue quote al 20% in più', veto: 'Diritto di veto su acquisizioni e scalate' };
  // ---------- assemblea dei soci, ogni primavera ----------
  const DOMANDE = [
    { id: 'compenso', se: G => G.ad.compenso >= 1, t: 'Un piccolo azionista: «Perché il suo compenso è così alto mentre i conti faticano?»', o: [
      ['Rinuncio al bonus di quest’anno', G => { G.ad.rep += 4; G.ad.patrimonio = Math.max(0, G.ad.patrimonio - 100000); umoreTutti(G, 3); }],
      ['Lo legherò ai risultati', G => { G.ad.rep += 1; G.cda.fiducia += 1; }],
      ['Il mercato dei manager è questo', G => { G.ad.rep -= 3; umoreTutti(G, -3); }]] },
    { id: 'clima', se: () => true, t: 'Un’associazione ambientalista con poche azioni: «Quando volerete con aerei meno inquinanti?»', o: [
      ['Piano di rinnovo della flotta in 3 anni', G => { G.reputazione = Math.min(100, G.reputazione + 2); umoreTipo(G, 'fondo', -3); }],
      ['Più carburante sostenibile da subito', G => { G.saf = Math.min(0.3, (G.saf || 0) + 0.02); G.reputazione = Math.min(100, G.reputazione + 1); }],
      ['Prima vengono i conti', G => { umoreTipo(G, 'fondo', 3); G.reputazione = Math.max(0, G.reputazione - 1); G.ad.rep -= 1; }]] },
    { id: 'tagli', se: () => true, t: 'Il rappresentante dei dipendenti azionisti: «Ci saranno tagli al personale?»', o: [
      ['Nessun taglio, ve lo garantisco', G => { G.morale = Math.min(100, G.morale + 4); umoreTipo(G, 'fondo', -3); umoreTipo(G, 'dipendenti', 8); }],
      ['Solo uscite volontarie', G => { G.morale = Math.min(100, G.morale + 1); }],
      ['Dobbiamo diventare più efficienti', G => { G.morale = Math.max(0, G.morale - 5); umoreTipo(G, 'fondo', 4); umoreTipo(G, 'dipendenti', -10); }]] },
    { id: 'debito', se: G => debitoTot(G) > 5e6, t: G => `La banca chiede: «Il debito di ${eur(debitoTot(G))} è sostenibile?»`, o: [
      ['Piano di rientro in 3 anni', G => { umoreTipo(G, 'banca', 6); G.cda.fiducia += 2; }],
      ['Il debito serve a crescere', G => { umoreTipo(G, 'golfo', 4); umoreTipo(G, 'banca', -5); }],
      ['Valuteremo un aumento di capitale', G => { umoreTipo(G, 'banca', 3); umoreTipo(G, 'mercato', -6); if (G.borsa.quotata) G.borsa.prezzo *= 0.97; }]] },
    { id: 'rivale', se: G => PR(G).soci.some(s => s.tipo === 'rivale'), t: G => `Un azionista: «${PR(G).soci.find(s => s.tipo === 'rivale').nome} sta comprando le nostre azioni: che cosa farete?»`, o: [
      ['Difenderemo l’indipendenza', G => { G.ad.rep += 2; umoreTipo(G, 'famiglia', 5); }],
      ['Valuteremo ogni offerta nell’interesse dei soci', G => { umoreTipo(G, 'fondo', 5); umoreTipo(G, 'mercato', 5); umoreTipo(G, 'famiglia', -5); }],
      ['Nessun commento', G => { G.ad.rep -= 2; }]] },
    { id: 'espansione', se: G => G.stat.voli > 500, t: 'Il fondo chiede: «Qual è il piano per i prossimi anni?»', o: [
      ['Crescita forte, anche fuori dall’Europa', G => { umoreTipo(G, 'golfo', 6); umoreTipo(G, 'banca', -3); if (G.borsa.quotata) G.borsa.prezzo *= 1.03; }],
      ['Consolidare e fare utili', G => { umoreTipo(G, 'fondo', 4); umoreTipo(G, 'banca', 3); }],
      ['Puntare sulla qualità del servizio', G => { umoreTipo(G, 'famiglia', 5); G.reputazione = Math.min(100, G.reputazione + 1); }]] }
  ];
  const umoreTipo = (G, tipo, d) => { for (const s of PR(G).soci) if (s.tipo === tipo) s.umore = clamp(s.umore + d, 0, 100); };
  const umoreTutti = (G, d) => { for (const s of PR(G).soci) if (s.id !== 'tu' && s.tipo !== 'rivale') s.umore = clamp(s.umore + d, 0, 100); };
  function convocaAssemblea(G) {
    const P = PR(G), anno = loc(G.ora).getUTCFullYear(), b = (G.bilanci || []).find(x => x.anno === anno - 1);
    const utile = b ? b.utile : utileUltimi(G, 365), domande = DOMANDE.filter(d => { try { return d.se(G); } catch { return false; } }).sort(() => rnd() - 0.5).slice(0, 2).map(d => d.id);
    P.assemblea = { anno, t: G.ora, scade: G.ora + 7 * GIORNO, utile: Math.round(utile || 0), domande };
    P.ultimaAssemblea = anno;
    notizia(G, `Assemblea dei soci convocata: bilancio ${anno - 1}, dividendo, compenso dell’amministratore delegato e domande dei soci (pagina Soci e CdA).`, 'info', true);
  }
  function chiudiAssemblea(G, { dividendo = 0, compenso = 1, risposte = [] } = {}) {
    const P = PR(G), AS = P.assemblea; if (!AS) return err('Nessuna assemblea aperta');
    const righe = [];
    // risposte alle domande
    AS.domande.forEach((id, i) => { const d = DOMANDE.find(x => x.id === id), j = clamp(risposte[i] ?? d.o.length - 1, 0, d.o.length - 1); d.o[j][1](G); righe.push(`«${d.o[j][0]}»`); });
    G.ad.rep = clamp(G.ad.rep, 0, 100); G.cda.fiducia = clamp(G.cda.fiducia, 0, 100);
    // dividendo
    const quota = [0, 0.25, 0.5][dividendo] || 0, fiss = Object.values(costiFissi(G)).reduce((x, y) => x + y, 0);
    let div = G.straordinaria ? 0 : Math.round(Math.max(0, Math.min(AS.utile * quota, G.cassa - 15 * fiss)) / 1e4) * 1e4;
    if (div > 0) { G.cassa -= div; flusso(G, 'finanziamenti', -div); G.ad.ultimoDividendo = G.ora; G.ad.patrimonio += Math.round(div * mia(G)); umoreTipo(G, 'fondo', 12); umoreTipo(G, 'mercato', 10); umoreTipo(G, 'golfo', 5); umoreTipo(G, 'dipendenti', -3); if (G.borsa.quotata) { G.borsa.dividendi += div; G.borsa.prezzo *= 1.02; } righe.push(`dividendo di ${eur(div)}`); }
    else if (AS.utile > 0) { for (const s of P.soci) if (s.cond === 'dividendo') { s.umore = Math.max(0, s.umore - 25); G.cda.fiducia = Math.max(0, G.cda.fiducia - 5); } umoreTipo(G, 'fondo', -6); righe.push('nessun dividendo'); }
    // voto pesato per quote: bilancio e compenso
    const pesoSi = f => P.soci.reduce((x, s) => x + (s.id === 'tu' || s.tipo === 'amico' ? s.quota : f(s) ? s.quota : 0), 0);
    const bil = pesoSi(s => s.tipo !== 'rivale' && s.umore + rnd() * 20 - 10 >= 40);
    if (bil < 0.5) { G.cda.fiducia = Math.max(0, G.cda.fiducia - 15); G.ad.rep = Math.max(0, G.ad.rep - 6); righe.push(`bilancio RESPINTO (${pct1(bil)} a favore)`); }
    else { G.cda.fiducia = Math.min(100, G.cda.fiducia + 3); righe.push(`bilancio approvato con il ${pct1(bil)}`); }
    const pen = compenso === 2 ? (AS.utile > 0 ? 8 : 25) : compenso === 1 ? 0 : -8, comp = pesoSi(s => s.tipo !== 'rivale' && s.umore - pen + rnd() * 20 - 10 >= 45);
    const scelto = comp >= 0.5 ? compenso : 0, C = COMPENSI[scelto];
    G.ad.compenso = scelto; G.ad.stipendio = C.annuo;
    if (C.opzioni) { const n = C.opzioni; G.ad.opzioni.push({ quota: n, strike: valoreEquo(G) * n, dal: G.ora, scade: G.ora + 3 * 365 * GIORNO }); }
    righe.push(scelto === compenso ? `compenso «${C.nome}» approvato` : `compenso richiesto bocciato: resta «${C.nome}»`);
    if (scelto !== compenso) G.ad.rep = Math.max(0, G.ad.rep - 3);
    rinnovaConsiglio(G);
    P.assemblee.unshift({ anno: AS.anno, t: G.ora, righe, bilancio: bil }); if (P.assemblee.length > 10) P.assemblee.length = 10;
    P.assemblea = null;
    notizia(G, `Assemblea ${AS.anno}: ${righe.join(' · ')}.`, bil >= 0.5 ? 'buona' : 'cattiva', true);
    return ok('Assemblea chiusa');
  }
  // ---------- scalate ----------
  function settimanaScalate(G) {
    const P = PR(G), B = G.borsa;
    // un concorrente rastrella le tue azioni in borsa
    const merc = socio(G, 'mercato');
    let r = P.soci.find(s => s.tipo === 'rivale' && !P.opa);
    if (!r && B.quotata && merc && merc.quota > 0.1 && mia(G) < 0.5 && !P.opa && rnd() < 0.04) {
      const R = G.rivali.filter(x => !alleato(G, x.id) && x.forza > 55 && (x.cassa || 0) > 0).sort((a, b) => b.forza - a.forza)[0];
      if (R) r = nuovoSocio(G, 'rivale', 0, { nome: R.nome, rid: R.id, umore: 20, segreto: true });
    }
    for (const x of P.soci) if (x.tipo === 'rivale' && !G.rivali.some(y => y.id === x.rid)) { x.tipo = 'fondo'; x.nome += ' (liquidatori)'; delete x.rid; r = r === x ? null : r; }
    if (r && r.rid && merc && !P.opa) {
      const R = G.rivali.find(x => x.id === r.rid); if (!R) { trasferisci(G, r, merc, r.quota); return; }
      const prima = r.quota; trasferisci(G, merc, r, Math.min(merc.quota * 0.5, 0.01 + rnd() * 0.015));
      if (prima < 0.05 && r.quota >= 0.05) { r.segreto = false; notizia(G, `${r.nome} ha superato il 5% delle tue azioni: per legge deve comunicarlo. Sta salendo nel capitale.`, 'cattiva', true); }
      if (r.quota >= 0.15 && mia(G) + P.soci.filter(s => s.tipo === 'amico').reduce((x, s) => x + s.quota, 0) < 0.5 && rnd() < 0.35) lanciaOpaContro(G, r, R);
    }
    if (P.opa && G.ora >= P.opa.scade) chiudiOpa(G);
  }
  function lanciaOpaContro(G, r, R) {
    const P = PR(G), prezzo = valoreEquo(G) / G.borsa.azioni * (1.2 + rnd() * 0.2);
    P.opa = { socio: r.id, rid: R.id, nome: R.nome, prezzo, premio: prezzo / G.borsa.prezzo - 1, inizio: G.ora, scade: G.ora + 21 * GIORNO, difese: [] };
    notizia(G, `OPA ostile! ${R.nome} offre ${prezzo.toFixed(2)} € per azione (+${Math.round(P.opa.premio * 100)}% sul prezzo di borsa) per prendersi la compagnia. Hai 21 giorni per difenderti.`, 'cattiva', true);
  }
  function accetta(G, s, O) {
    const eq = valoreEquo(G) / G.borsa.azioni, prem = O.prezzo / Math.max(0.01, eq) - 1, dif = O.difese.length * 0.08;
    switch (s.tipo) {
      case 'fondo': return clamp(0.4 + prem * 2 - (s.umore - 50) / 100 - dif, 0, 1);
      case 'mercato': return clamp(0.3 + prem * 1.8 - dif, 0, 0.9);
      case 'famiglia': return clamp(0.15 + prem - (s.umore - 40) / 80 - dif, 0, 0.8);
      case 'golfo': case 'banca': return clamp(0.3 + prem * 1.5 - (s.umore - 50) / 100 - dif, 0, 1);
      case 'dipendenti': return clamp(0.1 + prem - dif, 0, 0.5);
      default: return 0;
    }
  }
  function chiudiOpa(G) {
    const P = PR(G), O = P.opa; if (!O) return; P.opa = null;
    const r = socio(G, O.socio), R = G.rivali.find(x => x.id === O.rid);
    if (!r || !R) return;
    if (O.bloccata) { notizia(G, `L’OPA di ${O.nome} è stata bloccata.`, 'buona', true); return; }
    let tot = r.quota; const adesioni = [];
    for (const s of P.soci) if (s !== r && s.id !== 'tu') { const a = s.quota * (s.tipo === 'mercato' ? accetta(G, s, O) : rnd() < accetta(G, s, O) ? 1 : 0); if (a > 0.001) { adesioni.push([s, a]); tot += a; } }
    if (tot > 0.5) {
      for (const [s, a] of adesioni) trasferisci(G, s, r, a);
      notizia(G, `${O.nome} ha vinto l’OPA: ora controlla il ${pct1(r.quota)} della compagnia.`, 'cattiva', true);
      licenzia(G, `${O.nome} ha preso il controllo della compagnia con un’OPA ostile e ha scelto un nuovo amministratore delegato`);
    } else {
      G.cda.fiducia = Math.min(100, G.cda.fiducia + 6); G.ad.rep = Math.min(100, G.ad.rep + 5);
      notizia(G, `OPA fallita: ${O.nome} ha raccolto solo il ${pct1(tot)}. La compagnia resta indipendente.`, 'buona', true);
      if (rnd() < 0.5) { const m = socio(G, 'mercato') || nuovoSocio(G, 'mercato', 0); trasferisci(G, r, m, r.quota); notizia(G, `${O.nome} rivende in borsa le tue azioni.`, 'info'); }
    }
  }
  // le tue partecipazioni nei concorrenti
  const valoreQuotaRiv = (G, R, q) => Math.round(valoreRivale(G, R) * q * (1 + 0.6 * (R.miaQuota || 0)) / 1e4) * 1e4;
  const probOpa = (G, R, premio) => clamp(0.2 + premio * 1.2 + (R.miaQuota || 0) * 0.9 - (R.forza - 50) / 120 - (R.globale ? 0.05 : 0), 0.05, 0.95);
  const costoOpa = (G, R, premio) => Math.round(valoreRivale(G, R) * (1 + premio) * (1 - (R.miaQuota || 0)) / 1e5) * 1e5;
  // ---------- giornaliero ----------
  function giornoProprieta(G) {
    initProprieta(G);
    const P = PR(G), d = loc(G.ora), anno = d.getUTCFullYear();
    // compenso dell'AD
    const stip = (G.straordinaria ? 250000 : G.ad.stipendio) / 365; G.ad.patrimonio += stip * 0.6; paga(G, stip, 'sede');
    for (const o of G.ad.opzioni) if (!o.fatta && G.ora >= o.scade) { o.fatta = true; const v = Math.max(0, valoreEquo(G) * o.quota - o.strike); G.ad.patrimonio += v; if (v) notizia(G, `Le tue stock option sono maturate: guadagni ${eur(v)}.`, 'buona'); }
    if (giornoSett(G.ora) === 0) { settimanaSoci(G); settimanaScalate(G); }
    if (d.getUTCMonth() === 3 && d.getUTCDate() >= 20 && P.ultimaAssemblea !== anno && G.ora - G.inizio > 60 * GIORNO && !P.assemblea) convocaAssemblea(G);
    if (P.assemblea && G.ora >= P.assemblea.scade) { chiudiAssemblea(G, { dividendo: 0, compenso: G.ad.compenso, risposte: [] }); notizia(G, 'Non hai preparato l’assemblea: i soci hanno votato senza le tue proposte.', 'cattiva'); }
    P.offerte = P.offerte.filter(o => G.ora < o.scade);
    if (G.ora >= P.prossimaOfferta) { P.prossimaOfferta = G.ora + (35 + Math.random() * 40) * GIORNO; if (Math.random() < 0.5) nuovaOfferta(G); }
    if (P.uscita && G.ora >= P.uscita.scade) chiudiUscita(G, false);
    // fiducia a terra: mozione straordinaria
    if (d.getUTCDate() === 1 && G.cda.fiducia < 10) mozioneSfiducia(G);
    // amministrazione straordinaria
    const S = G.straordinaria;
    if (S && G.ora >= S.fine) {
      const ok90 = utileUltimi(G, 90) > 0 && G.cassa > 0;
      if (ok90) {
        G.straordinaria = null;
        const taglio = 0.4; for (const x of G.debiti) { x.capitale *= 1 - taglio; x.rata = Math.round(x.rata * (1 - taglio)); }
        const banca = P.soci.find(s => s.tipo === 'banca') || nuovoSocio(G, 'banca', 0); emetti(G, 0.3, banca);
        const tu = socio(G, 'tu'); emetti(G, 0.05, tu);
        G.cda.fiducia = 55; G.ad.rep = Math.min(100, G.ad.rep + 15);
        notizia(G, 'Amministrazione straordinaria conclusa con successo: i creditori tagliano il 40% dei debiti e la banca entra nel capitale. Torni amministratore delegato a pieno titolo.', 'buona', true);
      } else { G.esito = { tipo: 'liquidazione', t: G.ora }; notizia(G, 'Amministrazione straordinaria fallita: la compagnia va in liquidazione.', 'cattiva', true); }
    }
  }
  // dalla nuova partita di carriera: guidi un concorrente
  function carriera(Gv, rid) {
    const R = Gv.rivali.find(r => r.id === rid); if (!R) return null;
    const N = nuovaPartita('carriera', { nome: R.nome, codice: R.nome.replace(/[^A-Z]/g, '').slice(0, 2) || 'CR', base: R.hub, t0: Gv.ora });
    const Rn = N.rivali.find(r => r.id === rid);
    if (Rn) { Object.assign(Rn, { rotte: JSON.parse(JSON.stringify(R.rotte)), forza: R.forza, rep: R.rep }); N._senzaVoto = true; N.cassa += 1e12; acquisisci(N, rid); N.cassa -= 1e12; N._senzaVoto = false; }
    N.acquisizioni = []; N.notizie = []; N.cassa = Math.round(Math.max(5e6, valoreRivale(Gv, R) * 0.03) / 1e5) * 1e5;
    N.reputazione = Math.round(R.rep); N.stat.utile = 0; N.oggi = nuovoGiorno(); N._nuove = [];
    N.ad = { ...JSON.parse(JSON.stringify(Gv.ad)), opzioni: [], stipendio: 600000, compenso: 1 };
    N.ad.carriera.push({ nome: Gv.nome, dal: Gv.inizio, al: Gv.ora, motivo: Gv.licenziamento?.motivo || 'licenziato' });
    N.ad.rep = Math.max(25, N.ad.rep);
    { const ex = { id: 'ex' + (N.seq++), nome: Gv.nome, colore: (Gv.marchio && Gv.marchio.colore) || '#6b7280', hub: Gv.basi[0], rep: Math.round(Gv.reputazione), prezzo: 1, rotte: {}, forza: 45, globale: null, ceo: { nome: NOMI_AD[Math.floor(rnd() * NOMI_AD.length)], stile: 'aggressivo', rancore: 55, ex: true } };
      for (const k of Object.keys(Gv.rotte).slice(0, 12)) ex.rotte[k] = { freq: 2, prezzo: 1 };
      if (AP[ex.hub] && Object.keys(ex.rotte).length) N.rivali.push(ex); }
    notizia(N, `Benvenuto in ${R.nome}! Il consiglio ti ha scelto come nuovo amministratore delegato dopo l’esperienza in ${Gv.nome}.`, 'buona', true);
    return N;
  }
  // racconto (passeggeri, offerte): numeri casuali a parte, per non cambiare la sequenza degli eventi di gioco
  const rndPax = () => Math.random(), pickPax = a => a[Math.floor(rndPax() * a.length)];
  // ---------- i passeggeri: recensioni, lettere, viaggiatori abituali ----------
  const NOMI_PAX = ['Marta', 'Luca', 'Giorgia', 'Ahmed', 'Francesca', 'Tommaso', 'Elena', 'Riccardo', 'Chiara', 'Omar', 'Beatrice', 'Matteo', 'Lucía', 'Pierre', 'Hannah', 'Kofi', 'Yuki', 'Ilaria', 'Nicola', 'Aisha', 'Fabio', 'Greta'];
  const COGNOMI_PAX = ['R.', 'B.', 'F.', 'M.', 'C.', 'D.', 'L.', 'S.', 'T.', 'V.'];
  const MESTIERI = { affari: ['consulente', 'avvocata', 'ingegnere', 'commerciale', 'medica', 'manager'], vacanza: ['studente', 'pensionata', 'fotografo', 'insegnante', 'coppia in viaggio di nozze'], parenti: ['nonna in visita ai nipoti', 'fuorisede che torna a casa', 'papà in trasferta'] };
  function frase(rec, G) {
    const p = [], k = chiave(rec.da, rec.a), r = G.rotte[k], ref = prezzoRif(km(rec.da, rec.a)), prezzo = r ? r.pY / ref : 1;
    if (rec.stato === 'canc') p.push(pickPax([`Volo ${rec.num} cancellato all’ultimo momento.`, `Ci hanno cancellato il volo e abbiamo perso una giornata.`]));
    else if (rec.rit > 120) p.push(pickPax([`${Math.round(rec.rit / 60)} ore di ritardo a ${rec.da} senza spiegazioni chiare.`, `Ritardo infinito: siamo partiti con ${Math.round(rec.rit / 60)} ore di ritardo.`]));
    else if (rec.rit > 30) p.push(pickPax([`Mezz’ora abbondante di ritardo, ma ci hanno informati.`, `Partiti in ritardo di ${rec.rit} minuti.`]));
    else p.push(pickPax(['Puntualissimi, atterrati persino in anticipo.', 'Volo puntuale e imbarco ordinato.', 'Tutto in orario, nessuna sorpresa.']));
    const nps = rec.nps;
    p.push(nps > 0.5 ? pickPax(['Equipaggio gentile e cibo buono.', 'Servizio a bordo curato, si vede la differenza.', 'Poltrona comoda e personale attento.']) : nps > 0.2 ? pickPax(['Servizio a bordo nella media.', 'Niente di speciale a bordo, ma ok.']) : pickPax(['A bordo il minimo indispensabile, perfino l’acqua si paga.', 'Sedili stretti e servizio frettoloso.']));
    p.push(prezzo > 1.3 ? pickPax(['Caro per quello che offre.', 'Il prezzo era decisamente alto.']) : prezzo < 0.85 ? pickPax(['A questo prezzo non mi lamento.', 'Biglietto davvero conveniente.']) : pickPax(['Prezzo onesto.', '']));
    return p.filter(Boolean).join(' ');
  }
  function giornoPasseggeri(G) {
    const PX = G.passeggeri ||= { recensioni: [], lettere: [], abituali: [], seq: 1 };
    const ieri = mezzanotte(G.ora) - GIORNO, voli = G.registro.filter(r => r.dep >= ieri && r.dep < ieri + GIORNO).slice(0, 200);
    if (voli.length) {
      const nps = G.bordo ? analisiProdotto(G).Y.nps / 100 : 0.3;
      for (let i = 0; i < Math.min(2, voli.length); i++) {
        // i passeggeri arrabbiati scrivono più spesso
        const brutti = voli.filter(v => v.stato === 'canc' || v.rit > 60), v = brutti.length && rndPax() < 0.5 ? pickPax(brutti) : pickPax(voli);
        const seg = pickPax(['affari', 'vacanza', 'vacanza', 'parenti']), rec = { ...v, nps };
        const stelle = clamp(Math.round(3.4 + (v.stato === 'canc' ? -2.2 : v.rit > 120 ? -1.6 : v.rit > 30 ? -0.6 : 0.4) + (nps - 0.3) * 2.5 + (rndPax() - 0.5) * 1.2), 1, 5);
        PX.recensioni.unshift({ t: G.ora, nome: `${pickPax(NOMI_PAX)} ${pickPax(COGNOMI_PAX)}`, chi: pickPax(MESTIERI[seg]), volo: v.num, da: v.da, a: v.a, stelle, testo: frase(rec, G) });
      }
      PX.recensioni.length = Math.min(PX.recensioni.length, 30);
      // lettere di reclamo dopo i disservizi gravi
      const gravi = voli.filter(v => v.stato === 'canc' || v.rit > 180);
      if (gravi.length && PX.lettere.filter(l => !l.risposta).length < 4 && rndPax() < 0.45) {
        const v = pickPax(gravi), ab = PX.abituali.find(a => a.k === chiave(v.da, v.a));
        PX.lettere.unshift({ id: 'l' + (PX.seq++), t: G.ora, nome: ab ? ab.nome : `${pickPax(NOMI_PAX)} ${pickPax(COGNOMI_PAX)}`, abituale: ab?.id || null, volo: v.num, da: v.da, a: v.a,
          testo: v.stato === 'canc' ? `Il volo ${v.num} ${v.da}–${v.a} è stato cancellato e ho perso un impegno importante. Mi aspetto un rimborso e delle scuse.` : `Sul volo ${v.num} ${v.da}–${v.a} ho aspettato ${Math.round(v.rit / 60)} ore senza assistenza. È inaccettabile.`, scade: G.ora + 10 * GIORNO });
      } else if (rndPax() < 0.06 && voli.some(v => v.stato !== 'canc' && v.rit < 10)) {
        const v = pickPax(voli.filter(x => x.stato !== 'canc' && x.rit < 10));
        PX.lettere.unshift({ id: 'l' + (PX.seq++), t: G.ora, nome: `${pickPax(NOMI_PAX)} ${pickPax(COGNOMI_PAX)}`, volo: v.num, da: v.da, a: v.a, grazie: true, risposta: 'letta', testo: `Volevo ringraziare l’equipaggio del volo ${v.num} ${v.da}–${v.a}: ${pickPax(['hanno aiutato mia madre anziana con grande pazienza.', 'hanno festeggiato il mio compleanno a bordo!', 'mi hanno ritrovato il passaporto dimenticato in poltrona.'])}` });
        G.reputazione = Math.min(100, G.reputazione + 0.1);
      }
      PX.lettere.length = Math.min(PX.lettere.length, 25);
    }
    for (const l of PX.lettere) if (!l.risposta && G.ora >= l.scade) { l.risposta = 'ignorata'; G.reputazione = Math.max(0, G.reputazione - 0.4); const ab = PX.abituali.find(a => a.id === l.abituale); if (ab) ab.soddisfazione -= 8; }
    if (giornoSett(G.ora) === 0) settimanaAbituali(G);
  }
  function settimanaAbituali(G) {
    const PX = G.passeggeri, S = statRecenti(G, 7), rotte = Object.entries(S.rotte).filter(([k]) => G.rotte[k]).sort((a, b) => b[1].pax - a[1].pax);
    while (PX.abituali.length < 6 && rotte.length) {
      const libere = rotte.filter(([k]) => !PX.abituali.some(a => a.k === k)), [k] = libere.length ? pickPax(libere.slice(0, 6)) : pickPax(rotte), seg = pickPax(['affari', 'affari', 'vacanza', 'parenti']);
      PX.abituali.push({ id: 'a' + (PX.seq++), nome: `${pickPax(NOMI_PAX)} ${pickPax(COGNOMI_PAX)}`, chi: pickPax(MESTIERI[seg]), seg, k, soddisfazione: 65, voli: 0, dal: G.ora });
      if (PX.abituali.length > 1) notizia(G, `Nuovo viaggiatore abituale sulla ${k.replace('-', '–')}: ${PX.abituali.at(-1).nome}, ${PX.abituali.at(-1).chi}.`, 'info');
    }
    const nps = G.bordo ? analisiProdotto(G).Y.nps / 100 : 0.3;
    for (const a of PX.abituali.slice()) {
      const r = S.rotte[a.k], rr = G.rotte[a.k];
      if (!rr) { PX.abituali = PX.abituali.filter(x => x !== a); continue; }
      if (!r || !r.voli) continue;
      const punt = puntualitaUltimi(G, 7) * (1 - r.canc / Math.max(1, r.voli + r.canc)), prezzo = rr.pY / prezzoRif(km(...a.k.split('-')));
      a.voli += a.seg === 'affari' ? 2 : 1;
      a.soddisfazione = clamp(a.soddisfazione + (punt - 0.82) * 25 + (nps - 0.3) * 10 - Math.max(0, prezzo - (a.seg === 'affari' ? 1.4 : 1.1)) * 15 + (rndPax() - 0.5) * 4, 0, 100);
      if (a.soddisfazione < 25) {
        const R = G.rivali.find(x => x.rotte[a.k]);
        notizia(G, `${a.nome} (${a.chi}) ha smesso di volare con te sulla ${a.k.replace('-', '–')}${R ? `: ora vola con ${R.nome}` : ''}. Troppi disservizi.`, 'cattiva');
        G.reputazione = Math.max(0, G.reputazione - 0.5); PX.abituali = PX.abituali.filter(x => x !== a);
      } else if (a.soddisfazione > 85 && !(rr.passaparola > G.ora) && rndPax() < 0.3) {
        rr.passaparola = G.ora + 30 * GIORNO;
        notizia(G, `${a.nome} è così soddisfatto/a che ha convinto i colleghi a volare con te sulla ${a.k.replace('-', '–')}: +3% di domanda per un mese.`, 'buona');
      }
    }
  }
  const AZIONI_PROPRIETA = {
    votaCda(G, voto, tratta = false) {
      if (!voto) return err('Nessuna proposta');
      const P = PR(G);
      if (tratta) { const u = P.votazioni[0]; if (!u || u.approvata || u.trattata) return err('Non c’è niente da trattare'); G.cda.fiducia = Math.max(0, G.cda.fiducia - 3); }
      const rec = votazione(G, voto, tratta ? 0.15 : 0); if (tratta) rec.trattata = true;
      if (rec.approvata) { G._approvato = { tipo: voto.tipo, t: G.ora }; return { ok: true, msg: `Il CdA approva (${rec.si} sì, ${rec.no} no)`, votazione: rec }; }
      return { errore: rec.veto ? `Bocciata: ${rec.veto} usa il suo diritto di veto` : `Il CdA boccia la proposta (${rec.si} sì, ${rec.no} no)`, votazione: rec };
    },
    assemblea(G, scelte) { return chiudiAssemblea(G, scelte); },
    rispondiLettera(G, id, tipo) {
      const PX = G.passeggeri, l = PX && PX.lettere.find(x => x.id === id); if (!l || l.risposta) return err('Lettera già gestita');
      const E = { rimborso: [250, 0.15, 12], voucher: [80, 0.08, 7], scuse: [0, 0.02, 2] }[tipo]; if (!E) return err('Risposta non valida');
      if (E[0]) paga(G, E[0], 'rimborsi'); G.reputazione = Math.min(100, G.reputazione + E[1]); l.risposta = tipo;
      const ab = PX.abituali.find(a => a.id === l.abituale); if (ab) ab.soddisfazione = Math.min(100, ab.soddisfazione + E[2]);
      return ok(tipo === 'rimborso' ? 'Rimborso inviato' : tipo === 'voucher' ? 'Buono inviato' : 'Lettera di scuse inviata');
    },
    accettaOfferta(G, id) {
      const P = PR(G), o = P.offerte.find(x => x.id === id); if (!o) return err('Offerta scaduta');
      const v = serveVoto(G, 'ingresso', null, `ingresso di ${o.nome} con il ${pct1(o.quota)}`); if (v) return v;
      P.offerte = P.offerte.filter(x => x !== o);
      const s = nuovoSocio(G, o.tipo, 0, { nome: o.nome, cond: o.cond === 'seggio' ? null : o.cond, umore: 70 }); emetti(G, o.quota, s);
      G.cassa += o.incasso; flusso(G, 'finanziamenti', o.incasso);
      notizia(G, `${o.nome} entra nel capitale con il ${pct1(o.quota)}: incassati ${eur(o.incasso)}.`, 'buona', true);
      return ok(`Incassati ${eur(o.incasso)}`);
    },
    rifiutaOfferta(G, id) { const P = PR(G); P.offerte = P.offerte.filter(x => x.id !== id); return ok('Offerta rifiutata'); },
    uscitaSocio(G, compra) { return chiudiUscita(G, !!compra); },
    // azioni personali: compri o vendi con il tuo patrimonio
    azioniPersonali(G, frazione) {
      const B = G.borsa; if (!B.quotata) return err('Puoi comprare e vendere azioni solo dopo la quotazione');
      const merc = socio(G, 'mercato'), tu = socio(G, 'tu'), prezzoQuota = B.prezzo * B.azioni;
      if (frazione > 0) {
        const q = Math.min(frazione, merc?.quota || 0), costo = q * prezzoQuota * 1.02; if (q <= 0) return err('Non ci sono azioni in vendita');
        if (G.ad.patrimonio < costo) return err(`Il tuo patrimonio personale (${eur(G.ad.patrimonio)}) non basta: servono ${eur(costo)}`);
        G.ad.patrimonio -= costo; trasferisci(G, merc, tu, q); B.prezzo *= 1 + q * 0.5; return ok(`Comprato il ${pct1(q)} per ${eur(costo)}`);
      }
      const q = Math.min(-frazione, tu.quota); if (q <= 0) return err('Non hai azioni da vendere');
      const incasso = q * prezzoQuota * 0.98; G.ad.patrimonio += incasso; trasferisci(G, tu, merc || nuovoSocio(G, 'mercato', 0), q); B.prezzo *= 1 - q * 0.5;
      if (q >= 0.02) { G.cda.fiducia = Math.max(0, G.cda.fiducia - 3); umoreTipo(G, 'mercato', -5); }
      return ok(`Venduto il ${pct1(q)}: incassi ${eur(incasso)} nel tuo patrimonio`);
    },
    // difese contro l'OPA
    cavaliereBianco(G) {
      const P = PR(G), O = P.opa; if (!O) return err('Nessuna OPA in corso');
      const v = serveVoto(G, 'difesa', null, 'aumento di capitale riservato a un investitore amico'); if (v) return v;
      const s = nuovoSocio(G, 'amico', 0); emetti(G, 0.15, s); const inc = Math.round(G.borsa.prezzo * G.borsa.azioni * 0.15 * 0.95); G.cassa += inc; flusso(G, 'finanziamenti', inc);
      O.difese.push('cavaliere'); notizia(G, `${s.nome} entra con il 15%: un socio amico che non venderà mai a ${O.nome}.`, 'buona', true);
      return ok(`Cavaliere bianco: incassati ${eur(inc)}`);
    },
    ricorsoOpa(G) {
      const P = PR(G), O = P.opa; if (!O) return err('Nessuna OPA in corso'); if (O.difese.includes('ricorso')) return err('Ricorso già presentato');
      if (G.cassa < 500000) return err('Servono 500.000 € di spese legali'); paga(G, 500000, 'altro'); O.difese.push('ricorso');
      if (rnd() < 0.3) { O.bloccata = true; O.scade = G.ora; notizia(G, `L’autorità antitrust blocca l’OPA di ${O.nome}: concentrazione eccessiva.`, 'buona', true); return ok('Ricorso accolto!'); }
      return ok('Ricorso respinto, ma l’operazione è rallentata e i soci esitano');
    },
    appelloSoci(G) {
      const P = PR(G), O = P.opa; if (!O) return err('Nessuna OPA in corso'); if (O.difese.includes('appello')) return err('Hai già fatto il roadshow');
      paga(G, 150000, 'marketing'); O.difese.push('appello'); umoreTutti(G, 6); return ok('Roadshow con i soci: più fiducia nel piano indipendente');
    },
    // quote dei concorrenti
    compraQuotaRivale(G, rid, q = 0.05) {
      const R = G.rivali.find(x => x.id === rid); if (!R) return err('Concorrente inesistente');
      if ((R.miaQuota || 0) + q > 0.3001) return err('Oltre il 30% la legge ti obbliga a lanciare un’OPA');
      const costo = valoreQuotaRiv(G, R, q); if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      const v = serveVoto(G, 'quota', costo, `acquisto del ${pct1(q)} di ${R.nome}`); if (v) return v;
      G.cassa -= costo; flusso(G, 'investimenti', -costo); const prima = R.miaQuota || 0; R.miaQuota = prima + q; R.costoQuota = (R.costoQuota || 0) + costo; rancore(G, R, 12, 'stai comprando le sue azioni');
      if (prima < 0.05 && R.miaQuota >= 0.05) notizia(G, `Hai superato il 5% di ${R.nome}: ora lo sanno tutti.`, 'info');
      return ok(`Ora hai il ${pct1(R.miaQuota)} di ${R.nome}`);
    },
    vendiQuotaRivale(G, rid) {
      const R = G.rivali.find(x => x.id === rid); if (!R || !R.miaQuota) return err('Non hai quote');
      const inc = Math.round(valoreRivale(G, R) * R.miaQuota * 0.97 / 1e4) * 1e4; G.cassa += inc; flusso(G, 'investimenti', inc);
      const q = R.miaQuota; R.miaQuota = 0; R.costoQuota = 0; return ok(`Venduto il ${pct1(q)} di ${R.nome} per ${eur(inc)}`);
    },
    opaRivale(G, rid, premio = 0.3) {
      const R = G.rivali.find(x => x.id === rid); if (!R) return err('Concorrente inesistente');
      if ((R.miaQuota || 0) < 0.1) return err('Per un’OPA credibile devi avere almeno il 10%');
      const costo = costoOpa(G, R, premio); if (G.cassa < costo) return err(`Servono ${eur(costo)} in cassa`);
      const v = serveVoto(G, 'opa', costo, `OPA su ${R.nome} (${eur(costo)})`); if (v) return v;
      const p = probOpa(G, R, premio);
      if (rnd() < p) { G._senzaVoto = true; R._prezzoForzato = costo; const r = acquisisci(G, rid); G._senzaVoto = false; delete R._prezzoForzato; G.ad.rep = Math.min(100, G.ad.rep + 5); return r.errore ? r : ok(`OPA riuscita: ${R.nome} è tua`); }
      const spese = Math.round(costo * 0.02); paga(G, spese, 'altro'); rancore(G, R, 30, 'hai tentato di scalarla'); G.cda.fiducia = Math.max(0, G.cda.fiducia - 4); G.ad.rep = Math.max(0, G.ad.rep - 3);
      notizia(G, `OPA su ${R.nome} fallita: i soci non hanno aderito. Spese di consulenza ${eur(spese)}.`, 'cattiva', true);
      return err(`OPA fallita (spese ${eur(spese)})`);
    },
    straordinaria(G) {
      if (!G.esito || G.esito.tipo !== 'licenziato') return err('Non è possibile adesso');
      G.esito = null; G.licenziamento = null;
      G.straordinaria = { inizio: G.ora, fine: G.ora + 365 * GIORNO };
      G.cda.fiducia = 50; G.ad.stipendio = 250000;
      notizia(G, 'Amministrazione straordinaria: resti come commissario per un anno. Debiti congelati (niente rate né interessi), soci senza potere, ma niente acquisizioni né dividendi. Per uscirne servono utili negli ultimi 90 giorni e cassa positiva.', 'info', true);
      return ok('Sei il commissario straordinario');
    }
  };
  const DILEMMI_AD = [
    { id: 'int_prezzi', se: G => G.stat.voli > 100, crea: G => ({ titolo: 'Intervista al Corriere', testo: 'Un giornalista ti chiede perché i biglietti aerei costano sempre di più.', opzioni: [
      { t: 'Spiega i costi con onestà', d: 'La tua reputazione personale sale, quella della compagnia scende un poco' },
      { t: 'Prometti prezzi bloccati per l’estate', d: 'Piace ai clienti, meno ai soci' },
      { t: 'No comment', d: 'Sembri sfuggente' }] }),
      fai: (G, i) => { if (i === 0) { G.ad.rep = Math.min(100, G.ad.rep + 3); G.reputazione = Math.max(0, G.reputazione - 1); return 'Intervista apprezzata per la franchezza.'; } if (i === 1) { G.reputazione = Math.min(100, G.reputazione + 2); G.cda.fiducia = Math.max(0, G.cda.fiducia - 3); return 'I clienti apprezzano, il CdA un po’ meno.'; } G.ad.rep = Math.max(0, G.ad.rep - 2); return 'Il titolo dell’articolo: «L’AD non risponde».'; } },
    { id: 'int_sciopero', se: G => G.morale < 52, crea: G => ({ titolo: 'Telegiornale: il clima in azienda', testo: `Il morale del personale è ${Math.round(G.morale)}/100 e i sindacati parlano ai giornali. Il TG ti chiede un commento.`, opzioni: [
      { t: 'Difendi i dipendenti e annuncia un tavolo', d: 'Morale +5, fiducia del CdA −3' },
      { t: 'Linea dura: i conti vengono prima', d: 'Morale −6, fiducia del CdA +4' },
      { t: 'Parla di futuro e di nuove assunzioni', d: 'Morale +2, reputazione personale +1' }] }),
      fai: (G, i) => { if (i === 0) { G.morale = Math.min(100, G.morale + 5); G.cda.fiducia = Math.max(0, G.cda.fiducia - 3); G.ad.rep = Math.min(100, G.ad.rep + 2); return 'I sindacati accolgono l’apertura.'; } if (i === 1) { G.morale = Math.max(0, G.morale - 6); G.cda.fiducia = Math.min(100, G.cda.fiducia + 4); G.ad.rep = Math.max(0, G.ad.rep - 1); return 'I soci approvano, il personale no.'; } G.morale = Math.min(100, G.morale + 2); G.ad.rep = Math.min(100, G.ad.rep + 1); return 'Messaggio neutro, accolto senza clamore.'; } },
    { id: 'scandalo', se: G => G.ora - G.inizio > 120 * GIORNO, crea: () => ({ titolo: 'Scandalo: i voli privati dell’AD', testo: 'Un quotidiano scrive che hai usato aerei della compagnia per viaggi personali. È un’esagerazione, ma la notizia gira.', opzioni: [
      { t: 'Rimborsa di tasca tua e chiedi scusa', d: '−100.000 € dal tuo patrimonio, reputazione personale +1' },
      { t: 'Smentisci con decisione', d: 'Se reggono le prove ne esci pulito, altrimenti è un disastro' },
      { t: 'Dimezza il tuo stipendio per un anno', d: 'Gesto apprezzato da soci e personale' }] }),
      fai: (G, i) => { if (i === 0) { G.ad.patrimonio = Math.max(0, G.ad.patrimonio - 100000); G.ad.rep = Math.min(100, G.ad.rep + 1); return 'Caso chiuso con le scuse.'; } if (i === 1) { if (rnd() < 0.55) { G.ad.rep = Math.min(100, G.ad.rep + 2); return 'Il giornale rettifica: ne esci rafforzato.'; } G.ad.rep = Math.max(0, G.ad.rep - 10); G.cda.fiducia = Math.max(0, G.cda.fiducia - 8); return 'Spuntano le ricevute: figuraccia.'; } G.ad.stipendio = Math.round(G.ad.stipendio / 2); G.ad.rep = Math.min(100, G.ad.rep + 4); G.cda.fiducia = Math.min(100, G.cda.fiducia + 2); G.morale = Math.min(100, G.morale + 2); return 'Gesto apprezzato.'; } },
    { id: 'int_crescita', se: G => G.stat.voli > 300 && utileUltimi(G, 30) > 0, crea: () => ({ titolo: 'Intervista a una rivista economica', testo: 'Le cose vanno bene. Ti chiedono cosa farà la compagnia nei prossimi anni.', opzioni: [
      { t: 'Annuncia una crescita aggressiva', d: 'Titolo e notorietà salgono, i soci prudenti si preoccupano' },
      { t: 'Parla di sostenibilità e servizio', d: 'Reputazione +2' },
      { t: 'Resta vago', d: 'Nessun effetto' }] }),
      fai: (G, i) => { if (i === 0) { if (G.borsa.quotata) G.borsa.prezzo *= 1.04; for (const c in G.notorieta) G.notorieta[c] = Math.min(1, G.notorieta[c] + 0.02); umoreTipo(G, 'banca', -4); umoreTipo(G, 'golfo', 5); G.ad.rep = Math.min(100, G.ad.rep + 2); return 'L’intervista fa rumore.'; } if (i === 1) { G.reputazione = Math.min(100, G.reputazione + 2); return 'Bella immagine per la compagnia.'; } return 'Intervista dimenticata in fretta.'; } },
    { id: 'int_disservizi', se: G => { const s = G.storico.slice(-7); const v = s.reduce((x, y) => x + y.voli + y.canc, 0); return v > 20 && s.reduce((x, y) => x + y.canc, 0) / v > 0.04; }, crea: () => ({ titolo: 'Polemica sui voli cancellati', testo: 'Dopo una settimana di cancellazioni, un talk show ti invita a rispondere ai passeggeri arrabbiati.', opzioni: [
      { t: 'Scuse pubbliche e rimborsi extra', d: 'Costa 60.000 €, reputazione +3' },
      { t: 'Dai la colpa ad aeroporti e controllori', d: 'Rischioso: se non regge, peggiora' },
      { t: 'Non vai in trasmissione', d: 'Reputazione personale −3' }] }),
      fai: (G, i) => { if (i === 0) { paga(G, 60000, 'rimborsi'); G.reputazione = Math.min(100, G.reputazione + 3); G.ad.rep = Math.min(100, G.ad.rep + 3); return 'Le scuse vengono apprezzate.'; } if (i === 1) { if (rnd() < 0.5) return 'Il pubblico ti crede.'; G.reputazione = Math.max(0, G.reputazione - 3); G.ad.rep = Math.max(0, G.ad.rep - 5); return 'I dati ti smentiscono in diretta.'; } G.ad.rep = Math.max(0, G.ad.rep - 3); return 'La sedia vuota fa più rumore di te.'; } }
  ];

  DILEMMI.push(...DILEMMI_AD);

  /* ---------- Gruppo: compagnie controllate e società di servizi ---------- */
  const TIPI_MARCHIO = {
    lowcost: { nome: 'Low cost', strategia: 'lowcost', costo: 2e6, handling: 0.8, servizio: 0.5, distribuzione: 0.5, extra: 1.3, personale: 0.12, descr: 'Prezzi bassi e servizi a pagamento: costi di terra e di bordo molto più bassi, clienti attenti al prezzo.' },
    regionale: { nome: 'Regionale', strategia: 'regionale', costo: 1.5e6, handling: 0.9, servizio: 0.8, distribuzione: 0.8, extra: 1.05, personale: 0.08, descr: 'Tratte brevi e aeroporti minori: più passeggeri sotto i 900 km, costi un po’ più bassi.' }
  };
  const COLORI_MARCHIO = ['#ff7a00', '#14a37f', '#7048e8', '#e8590c', '#1c7ed6'];
  const marchioDi = (G, k) => { const id = G.rotte[k]?.marchio; return id ? (G.marchi || []).find(m => m.id === id) : null; };
  const strategiaRotta = (G, da, a) => { const M0 = marchioDi(G, chiave(da, a)); return M0 ? D.STRATEGIE[TIPI_MARCHIO[M0.tipo].strategia] : STR(G); };
  const repRotta = (G, da, a) => marchioDi(G, chiave(da, a))?.rep ?? G.reputazione;
  const notoMarchio = (G, da, a) => marchioDi(G, chiave(da, a))?.notorieta ?? 1;
  function quotaPersonaleMarchi(G) {
    const n = Object.keys(G.rotte).length; if (!n || !(G.marchi || []).length) return 0;
    let s = 0; for (const r of Object.values(G.rotte)) { const M0 = r.marchio && G.marchi.find(m => m.id === r.marchio); if (M0) s += TIPI_MARCHIO[M0.tipo].personale; }
    return s / n;
  }
  function contiGruppo(G, giorni = 30) {
    const S = statRecenti(G, giorni), out = { principale: { nome: G.nome, rotte: 0, ricavi: 0, costi: 0, pax: 0, posti: 0 } };
    for (const m of G.marchi || []) out[m.id] = { nome: m.nome, rotte: 0, ricavi: 0, costi: 0, pax: 0, posti: 0 };
    for (const k of Object.keys(G.rotte)) { const id = marchioDi(G, k)?.id || 'principale', x = out[id], r = S.rotte[k]; x.rotte++; if (r) { x.ricavi += r.ricavi; x.costi += r.costi; x.pax += r.pax; x.posti += r.posti; } }
    for (const x of Object.values(out)) { x.utile = x.ricavi - x.costi; x.lf = x.posti ? x.pax / x.posti : 0; x.giorno = x.utile / Math.max(1, S.n); }
    return out;
  }
  const SOCIETA = {
    mro: { nome: 'Manutenzione (MRO)', costo: 8e6, voce: 'manutenzione', risparmio: 0.12, mercato: 26000, margine: 0.2, descr: 'Hangar e tecnici tuoi: manutenzione −12% e lavori per altre compagnie.' },
    handling: { nome: 'Handling', costo: 3e6, voce: 'handling', risparmio: 0.1, mercato: 14000, margine: 0.13, descr: 'Servizi a terra (bagagli, imbarchi, rampa): handling −10% e contratti con altre compagnie.' },
    catering: { nome: 'Catering', costo: 2e6, voce: 'servizio', risparmio: 0.12, mercato: 9000, margine: 0.16, descr: 'Cucine tue: servizio di bordo −12% e pasti venduti ad altri.' }
  };
  const statoSocieta = (G, k) => (G.societa || {})[k] || { stato: 'no' };
  function fattoreSocieta(G, voce) {
    for (const [k, S] of Object.entries(SOCIETA)) if (S.voce === voce) { const x = statoSocieta(G, k); if (x.stato === 'attiva') return 1 - S.risparmio; if (x.stato === 'venduta' && G.ora < x.contrattoFino) return 1.03; }
    return 1;
  }
  function valoreSocieta(G, k) {
    const S = SOCIETA[k], x = statoSocieta(G, k), terzi = S.mercato * (0.3 + (x.clienti || 0)) * S.margine * 365;
    const spesa = G.storico.slice(-30).reduce((s, y) => s + ((y.dettaglio || {})[S.voce] || 0), 0) * 12, risp = spesa * S.risparmio / (1 - S.risparmio);
    return Math.round((terzi * 7 + risp * 4 + S.costo * 0.5) / 1e5) * 1e5;
  }
  function giornoGruppo(G) {
    for (const m of G.marchi || []) { m.rep = clamp(m.rep + (G.reputazione - 4 - m.rep) * 0.02, 0, 100); m.notorieta = Math.min(1, m.notorieta + 0.003); }
    const ec = G.economia ? Object.values(G.economia).reduce((s, x) => s + x, 0) / Object.keys(G.economia).length : 1;
    for (const [k, S] of Object.entries(SOCIETA)) {
      const x = statoSocieta(G, k); if (x.stato !== 'attiva') continue;
      x.clienti = Math.min(1, (x.clienti || 0) + 0.0015);
      const ric = Math.round(S.mercato * (0.3 + x.clienti) * ec), ut = Math.round(ric * S.margine);
      G.cassa += ut; G.oggi.ricavi += ric; G.oggi.costi.altro = (G.oggi.costi.altro || 0) + ric - ut; x.utile30 = (x.utile30 || 0) * 29 / 30 + ut;
      G.oggi.ricaviSocieta = (G.oggi.ricaviSocieta || 0) + ric;
    }
  }

  /* ---------- Istituzioni: bandi di continuità territoriale, tasse, aiuti di Stato, lobby ---------- */
  const LOBBY = [{ nome: 'Nessuna', costo: 0 }, { nome: 'Relazioni istituzionali', costo: 3000 }, { nome: 'Ufficio a Roma e Bruxelles', costo: 8000 }, { nome: 'Lobby aggressiva', costo: 15000 }];
  const liv = G => G.lobby || 0;
  function candidatiBando(G) {
    const out = [];
    for (const b of G.basi) for (const x of Object.values(AP)) {
      if (x.iata === b || G.basi.includes(x.iata) || x.paese !== AP[b].paese) continue;
      const d = km(b, x.iata); if (d < 200 || d > 1600) continue;
      const k = chiave(b, x.iata); if ((G.pso || []).some(p => p.k === k) || (G.bandi || []).some(p => p.k === k)) continue;
      out.push({ k, punti: (x.isola ? 3 : 0) + (x.pop < 600 ? 2 : x.pop < 1200 ? 1 : 0) + rnd() });
    }
    return out.sort((a, b) => b.punti - a.punti).slice(0, 4);
  }
  function nuovoBando(G) {
    if ((G.bandi || []).length >= 2) return;
    const c = candidatiBando(G); if (!c.length) return;
    const { k } = c[Math.floor(rnd() * c.length)], [a, b] = k.split('-'), d = km(a, b), ref = prezzoRif(d);
    const sussidio = Math.round((d < 600 ? 1.6e6 : 2.4e6) * (0.8 + rnd() * 0.5) / 1e5) * 1e5;
    (G.bandi ||= []).push({ id: 'b' + (G.seq++), k, minFreq: d < 600 ? 3 : 2, maxPrezzo: Math.round(ref * 0.85), sussidio, anni: 2, scade: G.ora + 20 * GIORNO, offerta: null, rivali: 1 + Math.floor(rnd() * 3) });
    const isola = AP[a].isola || AP[b].isola;
    notizia(G, `Bando di continuità territoriale per ${a}–${b}${isola ? ' (isola)' : ''}: ${eur(sussidio)} l’anno per 2 anni in cambio di voli e prezzi garantiti (pagina Governo e tribunali).`, 'info', true);
  }
  const probBando = (G, B, livello) => clamp(0.8 - 0.25 * livello - 0.08 * (B.rivali - 1) + 0.07 * liv(G) + (G.reputazione - 50) / 250, 0.08, 0.95);
  function chiudiBando(G, B) {
    G.bandi = G.bandi.filter(x => x !== B);
    if (!B.offerta) return;
    const [a, b] = B.k.split('-');
    if (rnd() < probBando(G, B, B.offerta.livello)) {
      const sus = Math.round(B.sussidio * [0.75, 1, 1.25][B.offerta.livello]);
      (G.pso ||= []).push({ k: B.k, inizio: G.ora, fine: G.ora + B.anni * 365 * GIORNO, minFreq: B.minFreq, maxPrezzo: B.maxPrezzo, sussidio: sus, violazioni: 0, incassato: 0 });
      if (!G.rotte[B.k]) { const d = km(a, b), ref = prezzoRif(d); G.rotte[B.k] = { aperta: G.ora, pY: Math.min(ref, B.maxPrezzo), pW: Math.round(ref * multClasse('W', d)), pJ: Math.round(ref * multClasse('J', d)) }; }
      else G.rotte[B.k].pY = Math.min(G.rotte[B.k].pY, B.maxPrezzo);
      notizia(G, `Hai vinto il bando ${a}–${b}: ${eur(sus)} l’anno. Obblighi: almeno ${B.minFreq} voli al giorno per direzione e Economy a non più di ${eur(B.maxPrezzo)}. Programma gli aerei!`, 'buona', true);
    } else notizia(G, `Bando ${a}–${b} assegnato a un concorrente.`, 'cattiva', true);
  }
  function giornoPso(G) {
    const ieri = G.storico.at(-1); if (!ieri) return;
    for (const p of (G.pso || []).slice()) {
      if (G.ora >= p.fine) { G.pso = G.pso.filter(x => x !== p); notizia(G, `Concluso il contratto di continuità territoriale ${p.k.replace('-', '–')}: incassati ${eur(p.incassato)}.`, 'info', true); continue; }
      if (G.ora - p.inizio < 21 * GIORNO) continue; // tempo per programmare gli aerei
      const r = (ieri.rotte || {})[p.k], ok0 = r && r.voli >= p.minFreq * 2 && G.rotte[p.k] && G.rotte[p.k].pY <= p.maxPrezzo, g = p.sussidio / 365;
      if (ok0) { G.cassa += g; G.oggi.ricavi += g; G.oggi.contributi = (G.oggi.contributi || 0) + g; p.incassato += g; }
      else { p.violazioni++; paga(G, g * 0.3, 'altro'); if (p.violazioni === 5) notizia(G, `Continuità territoriale ${p.k.replace('-', '–')}: obblighi non rispettati per 5 giorni, ogni giorno paghi una penale. Al decimo il contratto viene revocato.`, 'cattiva', true);
        if (p.violazioni >= 10) { G.pso = G.pso.filter(x => x !== p); paga(G, 500000, 'altro'); G.reputazione = Math.max(0, G.reputazione - 3); notizia(G, `Contratto ${p.k.replace('-', '–')} revocato per inadempienza: penale di 500.000 €.`, 'cattiva', true); } }
    }
  }
  function cambioTasse(G) {
    const paesi = [...new Set([...rotteInEsercizio(G)].flatMap(k => k.split('-')).map(i => AP[i].paese))]; if (!paesi.length) return;
    const p = paesi[Math.floor(rnd() * paesi.length)], su = rnd() < 0.62 - 0.1 * liv(G), d = (su ? 1 : -1) * (2 + Math.floor(rnd() * 5));
    G.tassePax ||= {}; G.tassePax[p] = clamp((G.tassePax[p] || 0) + d, -5, 20);
    (G.storiaTasse ||= []).unshift({ t: G.ora, paese: p, delta: d, totale: G.tassePax[p] }); G.storiaTasse.length = Math.min(G.storiaTasse.length, 12);
    notizia(G, `${su ? 'Aumenta' : 'Scende'} la tassa sui biglietti in ${PAESI_N(p)}: ${d > 0 ? '+' : ''}${d} € per passeggero in partenza.`, su ? 'cattiva' : 'buona', true);
  }
  const PAESI_N = p => Object.values(AP).find(x => x.paese === p)?.nomePaese || p;
  function giornoIstituzioni(G) {
    const d = loc(G.ora);
    if (G.lobby) paga(G, LOBBY[G.lobby].costo, 'sede');
    for (const B of (G.bandi || []).slice()) if (G.ora >= B.scade) chiudiBando(G, B);
    giornoPso(G);
    if (d.getUTCDate() === 5) {
      if (rnd() < 0.3 && G.ora - G.inizio > 45 * GIORNO) nuovoBando(G);
      if (rnd() < 0.25 && G.ora - G.inizio > 60 * GIORNO) cambioTasse(G);
      if (G.lobby && rnd() < [0, 0.01, 0.03, 0.06][G.lobby]) {
        const multa = 1e6 * G.lobby; paga(G, multa, 'altro'); G.reputazione = Math.max(0, G.reputazione - 5); if (G.ad) G.ad.rep = Math.max(0, G.ad.rep - 6); if (G.cda) G.cda.fiducia = Math.max(0, G.cda.fiducia - 5);
        notizia(G, `Scandalo: un’inchiesta giornalistica rivela i rapporti troppo stretti tra la tua compagnia e alcuni politici. Multa di ${eur(multa)}, ufficio relazioni istituzionali chiuso.`, 'cattiva', true); G.lobby = 0;
      }
      // aiuti di Stato nelle crisi
      const fiss = Object.values(costiFissi(G)).reduce((s, x) => s + x, 0), crisi = (G.crisiDomanda || []).some(c => G.ora < c.fine) || G.cassa < 15 * fiss;
      if (crisi && !G.aiuti && !G.offertaAiuto && rnd() < 0.35 && G.ora - G.inizio > 30 * GIORNO) {
        G.offertaAiuto = { importo: Math.round(clamp(fiss * 60, 2e6, 50e6) / 1e5) * 1e5, scade: G.ora + 15 * GIORNO };
        notizia(G, `Il governo offre un prestito agevolato all’1% di ${eur(G.offertaAiuto.importo)} per superare la crisi. Attenzione: l’Europa potrebbe considerarlo un aiuto di Stato illegale.`, 'info', true);
      }
    }
    if (G.offertaAiuto && G.ora >= G.offertaAiuto.scade) G.offertaAiuto = null;
    const Ai = G.aiuti; if (Ai && !Ai.chiuso && G.ora >= Ai.verifica) {
      Ai.chiuso = true; const deb = G.debiti.find(x => x.id === Ai.debito);
      if (rnd() < 0.35 - 0.04 * liv(G)) { const pen = Math.round(Ai.importo * 0.05); paga(G, pen, 'interessi'); if (deb) deb.tasso = rating(G).tasso + 0.02; notizia(G, `La Commissione europea giudica illegale l’aiuto di Stato: penale di ${eur(pen)} e il prestito torna a tassi di mercato.`, 'cattiva', true); }
      else notizia(G, 'La Commissione europea approva l’aiuto di Stato: il prestito agevolato resta.', 'buona', true);
    }
  }

  /* ---------- Rivali con un volto: i loro amministratori delegati ---------- */
  const NOMI_AD = ['Vittorio Sanna', 'Helena Krause', 'Rashid Al Mansoori', 'Beatrice Colombo', 'Pierre Lavigne', 'Tomás Herrera', 'Ingrid Holm', 'Kenzo Tanaka', 'Margaret Doyle', 'Alessio Ferrante', 'Nadia Benali', 'Lars Eklund'];
  const STILI = { aggressivo: { nome: 'aggressivo', f: 1.6, descr: 'attacca le rotte piene e lancia guerre dei prezzi' }, prudente: { nome: 'prudente', f: 0.6, descr: 'evita le guerre e difende ciò che ha' }, imprevedibile: { nome: 'imprevedibile', f: 1, descr: 'a volte calmo, a volte aggressivo' } };
  function initCeo(G) {
    const usati = new Set(G.rivali.map(R => R.ceo?.nome));
    for (const R of G.rivali) if (!R.ceo) { const liberi = NOMI_AD.filter(n => !usati.has(n)), nome = liberi[Math.floor(rnd() * liberi.length)] || 'Nuovo AD'; usati.add(nome); R.ceo = { nome, stile: ['aggressivo', 'prudente', 'imprevedibile'][Math.floor(rnd() * 3)], rancore: 10 }; }
  }
  const fStile = R => { const s = R.ceo?.stile; return (s === 'imprevedibile' ? 0.4 + rnd() * 1.6 : STILI[s]?.f ?? 1) * (1 + (R.ceo?.rancore || 0) / 120); };
  const rancore = (G, R, d, motivo) => { if (!R || !R.ceo) return; const prima = R.ceo.rancore; R.ceo.rancore = clamp(prima + d, 0, 100); if (prima < 70 && R.ceo.rancore >= 70) notizia(G, `${R.ceo.nome}, AD di ${R.nome}, ce l’ha con te${motivo ? ` (${motivo})` : ''}: aspettati attacchi mirati.`, 'cattiva', true); };
  function settimanaCeo(G) {
    initCeo(G);
    for (const R of G.rivali) {
      R.ceo.rancore = Math.max(0, R.ceo.rancore - (alleato(G, R.id) ? 3 : 1));
      // con molto rancore l'AD rivale attacca una tua rotta di proposito
      if (R.ceo.rancore >= 70 && !alleato(G, R.id) && rnd() < 0.25) {
        const mie = Object.keys(G.rotte).filter(k => !R.rotte[k] && k.split('-').some(i => km(i, R.hub) < 2500) && !G.mosseRivali.some(m => m.k === k && !m.fatta));
        if (mie.length) { const k = mie[Math.floor(rnd() * mie.length)]; G.mosseRivali.push({ riv: R.id, k, freq: 2, t: G.ora + (7 + Math.floor(rnd() * 10)) * GIORNO, attacco: true }); R.ceo.rancore -= 15; }
      }
    }
  }

  /* ---------- Cause e tribunali ---------- */
  function nuovaCausa(G, c) { (G.cause ||= []).unshift({ id: 'c' + (G.seq++), t: G.ora, stato: 'aperta', scade: G.ora + 14 * GIORNO, ...c }); notizia(G, `${c.titolo}: decidi se patteggiare o andare a processo (pagina Governo e tribunali).`, 'cattiva', true); }
  const causaRecente = (G, tipo, giorni) => (G.cause || []).some(c => c.tipo === tipo && G.ora - c.t < giorni * GIORNO);
  function settimanaCause(G) {
    const s7 = G.storico.slice(-7), canc = s7.reduce((x, y) => x + y.canc, 0), voli = s7.reduce((x, y) => x + y.voli, 0) + canc;
    if (voli > 60 && canc / voli > 0.06 && canc >= 15 && !causaRecente(G, 'classaction', 150)) {
      const imp = Math.round(canc * 140 * 110 / 1e4) * 1e4;
      nuovaCausa(G, { tipo: 'classaction', titolo: 'Class action dei passeggeri', testo: `Un’associazione di consumatori fa causa per le ${canc} cancellazioni dell’ultima settimana e chiede ${eur(imp)} di risarcimenti.`, importo: imp, prob: 0.55 });
    }
    // antitrust: se domini troppe rotte da una città
    for (const b of G.basi) {
      const mie = Object.keys(G.rotte).filter(k => k.split('-').includes(b) && (G.rotte[k].quota || 0) > 0.6);
      if (mie.length >= 5 && !causaRecente(G, 'antitrust', 365) && rnd() < 0.08) {
        const ric = G.storico.slice(-30).reduce((x, y) => x + y.ricavi, 0) * 12, imp = Math.round(Math.max(1e6, ric * 0.015) / 1e5) * 1e5;
        nuovaCausa(G, { tipo: 'antitrust', titolo: `Indagine antitrust su ${AP[b].citta}`, testo: `L’autorità della concorrenza indaga sulla tua posizione dominante a ${AP[b].citta} (${mie.length} rotte con più del 60% del mercato). Rischi una multa di ${eur(imp)} e la cessione di slot.`, importo: imp, prob: clamp(0.5 - 0.05 * liv(G), 0.2, 0.8), base: b });
        break;
      }
    }
    // contesa sugli slot con un rivale che ha l'hub nello stesso aeroporto
    for (const R of G.rivali) if (AP[R.hub].slot && (G.slot[R.hub] || 0) >= 10 && !causaRecente(G, 'slot', 365) && rnd() < 0.02) {
      nuovaCausa(G, { tipo: 'slot', titolo: `${R.nome} contesta i tuoi slot a ${R.hub}`, testo: `${R.nome} sostiene che alcuni tuoi slot a ${AP[R.hub].citta} sono stati assegnati in modo irregolare e chiede ${eur(1.5e6)} o la restituzione di 2 slot.`, importo: 1.5e6, prob: 0.45, base: R.hub, riv: R.id });
      rancore(G, R, 10); break;
    }
    for (const c of G.cause || []) if (c.stato === 'aperta' && G.ora >= c.scade) { decidiCausa(G, c.id, 'processo'); notizia(G, `${c.titolo}: non hai deciso, si va a processo.`, 'info'); }
    for (const c of G.cause || []) if (c.stato === 'processo' && G.ora >= c.sentenza) sentenza(G, c);
    if (G.cause && G.cause.length > 15) G.cause.length = 15;
  }
  function decidiCausa(G, id, scelta) {
    const c = (G.cause || []).find(x => x.id === id); if (!c || c.stato !== 'aperta') return err('Causa non più aperta');
    if (scelta === 'patteggia') { const s = Math.round(c.importo * 0.45); paga(G, s, 'altro'); c.stato = 'chiusa'; c.esito = `Patteggiata per ${eur(s)}`; return ok(c.esito); }
    const forte = scelta === 'forte', spese = Math.round(c.importo * (forte ? 0.08 : 0.03)); paga(G, spese, 'altro');
    c.stato = 'processo'; c.forte = forte; c.sentenza = G.ora + (60 + Math.floor(rnd() * 60)) * GIORNO; c.spese = spese;
    return ok(`Si va a processo: sentenza il ${dataDi(c.sentenza)}`);
  }
  function sentenza(G, c) {
    c.stato = 'chiusa';
    if (rnd() < c.prob - (c.forte ? 0.15 : 0)) {
      paga(G, c.importo, 'altro'); c.esito = `Persa: pagati ${eur(c.importo)}`;
      if ((c.tipo === 'antitrust' || c.tipo === 'slot') && c.base && G.slot[c.base]) { G.slot[c.base] = Math.max(0, G.slot[c.base] - 2); c.esito += ' e ceduti 2 slot'; }
      G.reputazione = Math.max(0, G.reputazione - 2); notizia(G, `Sentenza: ${c.titolo} persa. ${c.esito}.`, 'cattiva', true);
    } else { c.esito = 'Vinta'; G.reputazione = Math.min(100, G.reputazione + 1); notizia(G, `Sentenza: ${c.titolo} vinta in tribunale!`, 'buona', true); }
  }

  /* ---------- Dirigenti con abilità, stipendio e carattere ---------- */
  const CARATTERI_DIR = { leale: 'leale', ambizioso: 'ambizioso: i rivali lo cercano', chiacchierone: 'chiacchierone: se scontento parla ai giornali' };
  const NOMI_DIR = ['Giorgio Bassi', 'Lucia Caruso', 'Edoardo Neri', 'Martina Fabbri', 'Riccardo Leone', 'Silvia Mancini', 'Fabrizio Testa', 'Camilla Serra', 'Omar Haddad', 'Nina Bauer', 'Carlo Gentile', 'Irene Pellegrini', 'Tommaso Vitale', 'Alice Rizzo', 'Daniel Weber'];
  const BASE_DIR = 250000;
  const abil = (G, ruolo) => (G.direzione?.dirigenti?.[ruolo]?.abilita ?? 3) - 3;
  function completaDirigenti(G) {
    for (const [k, d] of Object.entries(G.direzione.dirigenti)) { d.abilita ??= 3; d.stipendio ??= BASE_DIR; d.carattere ??= ['leale', 'ambizioso', 'chiacchierone'][Math.floor(rnd() * 3)]; d.dal ??= G.ora; }
    G.direzione.candidati ||= {};
  }
  const stipendioPer = a => Math.round((100000 + 30000 * a ** 1.35) / 5000) * 5000;
  function generaCandidati(G, ruolo) {
    const usati = new Set(Object.values(G.direzione.dirigenti).map(d => d.nome)), lista = [];
    for (let i = 0; i < 3; i++) {
      const a = clamp(Math.round(2 + rnd() * 3.4 + (G.reputazione - 50) / 50), 1, 5), liberi = NOMI_DIR.filter(n => !usati.has(n)), nome = liberi[Math.floor(rnd() * liberi.length)]; usati.add(nome);
      lista.push({ nome, abilita: a, stipendio: Math.round(stipendioPer(a) * (0.9 + rnd() * 0.25) / 5000) * 5000, carattere: ['leale', 'ambizioso', 'chiacchierone', 'leale'][Math.floor(rnd() * 4)] });
    }
    G.direzione.candidati[ruolo] = { t: G.ora, lista };
    return lista;
  }
  function sostituisci(G, ruolo, nuovo, motivo) {
    const d = G.direzione.dirigenti[ruolo], vecchio = d.nome, buon = Math.round(d.stipendio / 2);
    paga(G, buon, 'sede');
    Object.assign(d, { nome: nuovo.nome, abilita: nuovo.abilita, stipendio: nuovo.stipendio, carattere: nuovo.carattere, umore: 65, n: 0, dal: G.ora });
    notizia(G, `${D.DIRIGENTI[ruolo].ruolo}: ${vecchio} lascia (${motivo}, buonuscita ${eur(buon)}). Arriva ${nuovo.nome}.`, 'info', true);
  }
  function meseDirigenti(G) {
    completaDirigenti(G);
    const R = G.direzione;
    if (!R.corteggiamento) for (const [k, d] of Object.entries(R.dirigenti)) {
      if (d.abilita >= 4 && G.rivali.length && rnd() < (d.carattere === 'ambizioso' ? 0.35 : d.carattere === 'leale' ? 0.08 : 0.18)) {
        const Rv = G.rivali[Math.floor(rnd() * G.rivali.length)];
        R.corteggiamento = { ruolo: k, riv: Rv.nome, offerta: Math.round(d.stipendio * 1.35 / 5000) * 5000, scade: G.ora + 10 * GIORNO };
        notizia(G, `${Rv.nome} vuole portarti via ${d.nome} (${D.DIRIGENTI[k].ruolo}) con uno stipendio di ${eur(R.corteggiamento.offerta)}. Rilanci o lo lasci andare?`, 'cattiva', true); break;
      }
    }
    for (const [k, d] of Object.entries(R.dirigenti)) if (d.carattere === 'chiacchierone' && d.umore < 30 && rnd() < 0.3) {
      G.reputazione = Math.max(0, G.reputazione - 2); if (G.cda) G.cda.fiducia = Math.max(0, G.cda.fiducia - 4);
      notizia(G, `Fuga di notizie: ${d.nome} (${D.DIRIGENTI[k].ruolo}), scontento, racconta ai giornali i problemi interni della compagnia.`, 'cattiva', true);
    }
  }
  function giornoDirigenti(G) {
    completaDirigenti(G);
    const extra = Object.values(G.direzione.dirigenti).reduce((s, d) => s + (d.stipendio - BASE_DIR), 0) / 365; if (extra) paga(G, extra, 'sede');
    const C = G.direzione.corteggiamento; if (C && G.ora >= C.scade) trattieni(G, false);
  }
  function trattieni(G, si) {
    const R = G.direzione, C = R.corteggiamento; if (!C) return err('Nessuna offerta in corso'); R.corteggiamento = null;
    const d = R.dirigenti[C.ruolo];
    if (si) { d.stipendio = Math.round(C.offerta * 0.95 / 5000) * 5000; d.umore = Math.min(100, d.umore + 12); return ok(`${d.nome} resta, con uno stipendio di ${eur(d.stipendio)}`); }
    const nuovo = { nome: NOMI_DIR.find(n => !Object.values(R.dirigenti).some(x => x.nome === n)) || 'Interim', abilita: 2, stipendio: 180000, carattere: 'leale' };
    const vecchio = d.nome; Object.assign(d, { ...nuovo, umore: 60, n: 0, dal: G.ora });
    const Rv = G.rivali.find(x => x.nome === C.riv); if (Rv) Rv.forza = Math.min(95, Rv.forza + 3);
    notizia(G, `${vecchio} passa a ${C.riv}. Al suo posto, ad interim, ${d.nome}: cerca un sostituto in Direzione.`, 'cattiva', true);
    return ok(`${vecchio} se ne va`);
  }

  const scegliAttaccante = G => { const l = G.rivali.filter(X => !alleato(G, X.id)), w = l.map(fStile), t = w.reduce((x, y) => x + y, 0); let r = rnd() * t; for (let i = 0; i < l.length; i++) { r -= w[i]; if (r <= 0) return l[i]; } return l[l.length - 1]; };
  function giornoGruppoIstituzioni(G) {
    giornoGruppo(G); giornoIstituzioni(G); giornoDirigenti(G);
    if (giornoSett(G.ora) === 1) { settimanaCeo(G); settimanaCause(G); }
    if (loc(G.ora).getUTCDate() === 15) meseDirigenti(G);
  }

  const AZIONI_GRUPPO = {
    creaMarchio(G, tipo, nome) {
      const T = TIPI_MARCHIO[tipo]; if (!T) return err('Tipo sconosciuto');
      nome = String(nome || '').trim().slice(0, 30); if (!nome) return err('Scegli un nome per la nuova compagnia');
      if ((G.marchi || []).length >= 3) return err('Al massimo tre compagnie controllate');
      if (G.cassa < T.costo) return err(`Servono ${eur(T.costo)}`);
      const v = serveVoto(G, 'flotta', T.costo, `nuova compagnia ${nome}`); if (v) return v;
      paga(G, T.costo, 'altro'); G.marchi ||= [];
      G.marchi.push({ id: 'm' + (G.seq++), tipo, nome, colore: COLORI_MARCHIO[G.marchi.length % COLORI_MARCHIO.length], rep: Math.max(30, G.reputazione - 8), notorieta: 0.5, dal: G.ora });
      notizia(G, `Nasce ${nome}, la tua compagnia ${T.nome.toLowerCase()}. Assegnale le rotte dalla scheda di ogni rotta o dalla pagina Gruppo.`, 'buona', true);
      return ok(`${nome} è nata`);
    },
    assegnaMarchio(G, k, id) {
      const r = G.rotte[k]; if (!r) return err('Rotta inesistente');
      if (id && !(G.marchi || []).some(m => m.id === id)) return err('Compagnia inesistente');
      if ((r.marchio || null) === (id || null)) return ok('Nessun cambiamento');
      paga(G, 25000, 'marketing'); r.marchio = id || null; vendite(G);
      return ok(id ? `${k.replace('-', '–')} ora la vola ${G.marchi.find(m => m.id === id).nome}` : `${k.replace('-', '–')} torna a ${G.nome}`);
    },
    chiudiMarchio(G, id) {
      const m = (G.marchi || []).find(x => x.id === id); if (!m) return err('Compagnia inesistente');
      for (const r of Object.values(G.rotte)) if (r.marchio === id) r.marchio = null;
      G.marchi = G.marchi.filter(x => x !== m); G.reputazione = Math.max(0, G.reputazione - 1); vendite(G);
      return ok(`${m.nome} chiusa: le sue rotte tornano a ${G.nome}`);
    },
    apriSocieta(G, k) {
      const S = SOCIETA[k]; if (!S) return err('Società sconosciuta'); G.societa ||= {};
      if (statoSocieta(G, k).stato === 'attiva') return err('Già attiva');
      if (G.cassa < S.costo) return err(`Servono ${eur(S.costo)}`);
      const v = serveVoto(G, 'flotta', S.costo, `società ${S.nome}`); if (v) return v;
      G.cassa -= S.costo; flusso(G, 'investimenti', -S.costo); G.societa[k] = { stato: 'attiva', dal: G.ora, clienti: 0, utile30: 0 };
      return ok(`${S.nome}: società avviata`);
    },
    sviluppaSocieta(G, k) {
      const x = statoSocieta(G, k); if (x.stato !== 'attiva') return err('Società non attiva'); if (x.clienti >= 0.95) return err('Ha già tutti i clienti possibili');
      if (G.cassa < 500000) return err('Servono 500.000 €'); paga(G, 500000, 'marketing'); x.clienti = Math.min(1, x.clienti + 0.15);
      return ok('Nuovi contratti con altre compagnie');
    },
    vendiSocieta(G, k) {
      const x = statoSocieta(G, k); if (x.stato !== 'attiva') return err('Società non attiva');
      const prezzo = valoreSocieta(G, k); G.cassa += prezzo; flusso(G, 'investimenti', prezzo);
      G.societa[k] = { stato: 'venduta', venduta: G.ora, prezzo, contrattoFino: G.ora + 3 * 365 * GIORNO };
      notizia(G, `Venduta la società ${SOCIETA[k].nome} per ${eur(prezzo)}. Per 3 anni la paghi come fornitore (+3% su quella voce).`, 'buona', true);
      return ok(`Incassati ${eur(prezzo)}`);
    },
    offertaBando(G, id, livello) {
      const B = (G.bandi || []).find(x => x.id === id); if (!B) return err('Bando chiuso'); livello = clamp(Math.round(livello), 0, 2);
      if (G.cassa < 20000) return err('Servono 20.000 € per la documentazione'); paga(G, 20000, 'altro');
      B.offerta = { livello }; return ok(`Offerta presentata: risultato il ${dataDi(B.scade)}`);
    },
    accettaAiuto(G, si) {
      const O = G.offertaAiuto; if (!O) return err('Nessuna offerta'); G.offertaAiuto = null;
      if (!si) return ok('Aiuto rifiutato');
      const d = { id: 'd' + (G.seq++), capitale: O.importo, tasso: 0.01, rata: Math.round(O.importo / (6 * 365)) }; G.debiti.push(d); G.cassa += O.importo; flusso(G, 'finanziamenti', O.importo);
      G.aiuti = { t: G.ora, importo: O.importo, debito: d.id, verifica: G.ora + (180 + Math.floor(rnd() * 360)) * GIORNO };
      return ok(`Incassati ${eur(O.importo)} all’1%`);
    },
    lobby(G, l) { l = clamp(Math.round(l), 0, 3); G.lobby = l; return ok(l ? `${LOBBY[l].nome}: ${eur(LOBBY[l].costo)} al giorno` : 'Nessuna attività di lobby'); },
    causa(G, id, scelta) { return decidiCausa(G, id, scelta); },
    candidati(G, ruolo) { if (!G.direzione.dirigenti[ruolo]) return err('Ruolo sconosciuto'); const c = G.direzione.candidati[ruolo]; if (c && G.ora - c.t < 30 * GIORNO) return ok('Candidati pronti'); if (G.cassa < 40000) return err('Servono 40.000 € per il cacciatore di teste'); paga(G, 40000, 'sede'); generaCandidati(G, ruolo); return ok('Tre candidati selezionati'); },
    assumiDirigente(G, ruolo, i) {
      const c = G.direzione.candidati[ruolo], x = c && c.lista[i]; if (!x) return err('Candidato non disponibile');
      sostituisci(G, ruolo, x, 'sostituito'); c.lista.splice(i, 1); return ok(`${x.nome} assunto`);
    },
    trattieni(G, si) { return trattieni(G, !!si); }
  };

  /* ---------- Creazione e migrazione ---------- */
  // settimana dell'anno (per la sfida: stessa partenza per tutti nella stessa settimana)
  function settimanaSfida(t = Date.now()) { const d = new Date(t), g = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - g + 3); const y = d.getUTCFullYear(), w = 1 + Math.round((d - Date.UTC(y, 0, 4)) / 864e5 / 7); return { anno: y, n: w, seme: y * 100 + w }; }
  const BASI_SFIDA = ['FCO', 'MXP', 'LIN', 'BGY', 'NAP', 'BRI', 'CTA', 'VCE', 'BLQ', 'TRN', 'PMO', 'CAG'];
  function nuovaPartita(scenId, { nome, codice, base, seme, t0 }) {
    const S = D.SCENARI[scenId];
    let sfida = null;
    if (scenId === 'sfida') { sfida = settimanaSfida(); rnd = generatoreSeme(sfida.seme); base = BASI_SFIDA[sfida.seme % BASI_SFIDA.length]; } else rnd = seme ? generatoreSeme(seme) : Math.random;
    const b0 = S.preset === 'crisi' ? 'FCO' : (S.base || base || 'BRI');
    FUSO = AP[b0].fuso; const [ya, ma, da] = S.inizio, inizio = t0 ? mezzanotte(t0) + GIORNO + 5 * ORA : Date.UTC(ya, ma - 1, da, 5) - FUSO * ORA;
    const G = {
      v: VERSIONE, id: 'p' + Date.now().toString(36), scenario: scenId, nome: nome || 'Nuova Compagnia', codice: (codice || 'NC').toUpperCase().slice(0, 2),
      fuso: FUSO, inizio, ora: inizio, cassa: S.cassa || 0, debiti: [], reputazione: 50, morale: 65, stipendio: 1, servizio: 'standard', carburante: 0.8,
      basi: [], hub: [], slot: {}, aerei: [], rotte: {}, equipaggi: [], fissi: {}, seqEq: {}, voli: [], registro: [], storico: [], oggi: nuovoGiorno(),
      notizie: [], eventi: [], rivali: D.RIVALI.map(r => ({ id: r.id, nome: r.nome, colore: r.colore, hub: r.hub, rep: r.rep, prezzo: r.prezzo, rotte: Object.fromEntries(Object.entries(r.rotte).map(([k, f]) => [k, { freq: f, prezzo: r.prezzo }])) })),
      traguardi: {}, stat: { pax: 0, voli: 0, utile: 0 }, mercato: [], numeri: {}, campagne: [], seq: 1, seqMarche: 0, seqVolo: 101, fallimento: 0, esito: null, genFino: 0, giorniUtile: 0,
      auto: { equipaggi: true, ispezioni: true }, missioni: { attive: [], fatte: 0 }
    };
    if (S.preset === 'crisi') presetCrisi(G);
    else {
      const b = b0;
      G.basi.push(b); if (AP[b].slot) G.slot[b] = (S.slot && S.slot[b]) || 8;
      for (const [mod, modo] of S.flotta) aggiungiAereo(G, mod, modo, b);
      for (const [tipo, n, piloti, cabina] of S.equipaggi) for (let q = 0; q < n; q++) nuovoEquipaggio(G, { base: b, tipo, piloti, cabina });
      if (S.slot) Object.assign(G.slot, S.slot);
    }
    if (sfida) { G.seme = sfida.seme; G.sfida = sfida; G.nome = nome || `Sfida ${sfida.n}/${sfida.anno}`; }
    initGestione(G);
    if (scenId === 'lowcost') { G.strategia = 'lowcost'; G.bordo = JSON.parse(JSON.stringify(D.PRESET_BORDO.base)); G.tariffe.bagaglio = 25; }
    if (scenId === 'golfo') { G.hub.push(G.basi[0]); G.slot[G.basi[0]] = Math.max(G.slot[G.basi[0]] || 0, 16); }
    if (scenId === 'tempesta') {
      G.carburante = 1.4; G.reputazione = 42; G.morale = 48; G.crisiDomanda.push({ continente: 'Europa', fattore: 0.6, fine: G.ora + 300 * GIORNO });
      G.debiti.push({ id: 'd' + (G.seq++), capitale: 25e6, tasso: 0.075, rata: Math.round(25e6 / (6 * 365)) });
      // la rete di partenza: rotte nazionali già avviate e programmate
      for (const d of ['LIN', 'CTA', 'PMO', 'CAG', 'BRI', 'TRN', 'NAP']) { const k = chiave('FCO', d), km0 = km('FCO', d), ref = prezzoRif(km0); G.rotte[k] = { aperta: G.ora - 400 * GIORNO, pY: Math.round(ref * 0.9), pW: Math.round(ref * multClasse('W', km0) * 0.9), pJ: Math.round(ref * multClasse('J', km0) * 0.9) }; }
      const P = pianificaFlotta(G); if (P.ok) { G.cassa += P.costo; const c0 = G.cassa; applicaPianoFlotta(G, P); G.cassa = c0 - P.costo; }
    }
    aggiornaMercato(G); controllaMissioni(G);
    for (let i = 0; i <= 2; i++) generaGiorno(G, giornoDopo(mezzanotte(G.ora), i));
    vendite(G);
    notizia(G, `Benvenuto in ${G.nome}! ${S.descr}`, 'buona');
    if (S.preset !== 'crisi') notizia(G, 'Primi passi: apri una rotta (Rotte e prezzi), crea la rotazione dell’aereo (Programmazione) e avvia il tempo.', 'info');
    return G;
  }
  function presetCrisi(G) {
    G.nome = G.nome || 'Aliseo Airlines'; G.cassa = 2.5e6; G.reputazione = 36; G.morale = 42; G.stipendio = 0.95; G.carburante = 0.92;
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
    for (const ae of G.aerei) { ae.prossimaC = G.ora + (200 + Math.floor(rnd() * 500)) * GIORNO; ae.prossimaD = G.ora + (400 + Math.floor(rnd() * 1700)) * GIORNO; }
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
    initGestione(G);
    G.auto ||= { equipaggi: true, ispezioni: true }; if (!G.missioni) { G.missioni = { attive: [], fatte: 0 }; controllaMissioni(G); }
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
  const paga = (G, costo, voce = 'altro') => { G.cassa -= costo; G.oggi.costi[voce] = (G.oggi.costi[voce] || 0) + costo; };
  const A = {
    apriRotta(G, a, b) {
      if (a === b) return err('Scegli due aeroporti diversi');
      const k = chiave(a, b); if (G.rotte[k]) return err('Rotta già aperta');
      if (G.cassa < 30000) return err('Cassa insufficiente');
      const d = km(a, b), ref = prezzoRif(d); paga(G, 30000);
      G.rotte[k] = { aperta: G.ora, pY: ref, pW: Math.round(ref * multClasse('W', d)), pJ: Math.round(ref * multClasse('J', d)) };
      for (const Rv of G.rivali) if (Rv.rotte[k]) rancore(G, Rv, 8, 'hai aperto una sua rotta');
      notizia(G, `Aperta la rotta ${a}–${b} (${d} km). Campagna di lancio: ${eur(30000)}.`, 'buona'); controllaTraguardi(G);
      if (!dirittiOk(G, a, b)) chiediDiritti(G, a, b);
      return ok('Rotta aperta');
    },
    chiudiRotta(G, k) {
      if (rotteInEsercizio(G).has(k)) return err('La rotta è ancora nelle rotazioni di qualche aereo');
      delete G.rotte[k]; return ok('Rotta chiusa');
    },
    prezzi(G, k, p) { const r = G.rotte[k]; for (const c of CL) if (p['p' + c] != null && !isNaN(p['p' + c])) r['p' + c] = clamp(Math.round(p['p' + c]), 10, 5000); vendite(G); return ok('Prezzi aggiornati'); },
    compraNuovo(G, mod, modo, base, cab, attesa = 1, anni = 8) {
      anni = ANNI_LEASING[+anni] ? +anni : 8;
      const m = MOD[mod], e = validaCabina(mod, cab); if (e) return err(e);
      if (!annunciato(G, mod)) return err('Modello non ancora in vendita');
      attesa = [1, 12, 24].includes(+attesa) ? +attesa : 1;
      const sc = SCONTO_ATTESA[attesa], consegna = Math.max(G.ora + (attesa === 1 ? 30 : Math.round(attesa * 30.4)) * GIORNO, disponibileDal(G, mod) || 0), lungo = consegna - G.ora > 60 * GIORNO;
      const prezzo = Math.round(m.prezzo * (1 - sc)), canone = Math.round(m.leasing * (1 - sc / 1.5) * (modo === 'leasing' ? ANNI_LEASING[anni] : 1) / 100) * 100;
      const costo = modo === 'proprieta' ? (lungo ? Math.round(prezzo * 0.1) : prezzo) : canone * 30; if (G.cassa < costo) return err(`Servono ${eur(costo)} in cassa`);
      if (G.straordinaria && modo === 'proprieta') return err('In amministrazione straordinaria puoi prendere aerei solo in leasing');
      { const v = serveVoto(G, 'flotta', modo === 'proprieta' ? prezzo : canone * 365 * 2, `${m.nome} ${modo === 'proprieta' ? 'in proprietà' : 'in leasing'}`); if (v) return v; }
      G.cassa -= costo; if (modo === 'leasing') G.oggi.costi.altro += costo; else flusso(G, 'investimenti', -costo);
      const ae = aggiungiAereo(G, mod, modo, base, { consegna, oreDaCheck: 0, cab, prezzo, leasing: canone }); if (modo === 'leasing') ae.leasingFine = consegna + anni * 365 * GIORNO;
      if (lungo) { ae.acconto = costo; if (modo === 'proprieta') ae.saldo = prezzo - costo; }
      if (lungo) { notizia(G, `Ordinato ${m.nome} (${ae.marche}) con consegna il ${dataDi(consegna)}: ${modo === 'proprieta' ? `acconto ${eur(costo)}, saldo ${eur(prezzo - costo)} alla consegna` : `canone ${eur(canone)} al giorno dalla consegna`}${sc ? ` (sconto ${Math.round(sc * 100)}%)` : ''}.`, 'info'); return ok('Ordine confermato'); }
      notizia(G, `Ordinato ${m.nome} ${modo === 'leasing' ? 'in leasing' : 'in proprietà'} (${ae.marche}, ${cab.J}J · ${cab.W}W · ${cab.Y}Y): consegna tra 30 giorni a ${base}.`, 'info');
      return ok('Ordine confermato');
    },
    compraUsato(G, id, modo, base, cab) {
      const o = G.mercato.find(x => x.id === id); if (!o) return err('Offerta non più disponibile');
      cab ||= o.cab; const e = validaCabina(o.mod, cab); if (e) return err(e);
      const cambia = CL.some(c => cab[c] !== o.cab[c]), extra = cambia ? 60000 + 800 * somma(cab) : 0;
      const costo = (modo === 'proprieta' ? o.prezzo : o.leasing * 30) + extra; if (G.cassa < costo) return err(`Servono ${eur(costo)} in cassa`);
      { const v = serveVoto(G, 'flotta', modo === 'proprieta' ? o.prezzo : o.leasing * 365 * 2, `${MOD[o.mod].nome} usato`); if (v) return v; }
      G.cassa -= costo; G.oggi.costi.altro += costo - (modo === 'proprieta' ? o.prezzo : 0); if (modo === 'proprieta') flusso(G, 'investimenti', -o.prezzo);
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
      const incasso = ae.modo === 'proprieta' ? Math.round(ae.valore * 0.92) : -(Math.round(Math.min(Math.max(0, ((ae.leasingFine || G.ora) - G.ora) / GIORNO), 365) * ae.leasing * 0.5) + Math.round(costoRiconsegna(G, ae)));
      G.cassa += incasso; if (incasso < 0) G.oggi.costi.altro -= incasso; else flusso(G, 'investimenti', incasso);
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
    compraSlot(G, i, n) { const costo = AP[i].slotPrezzo * n; if (G.cassa < costo) return err(`Servono ${eur(costo)}`); G.cassa -= costo; flusso(G, 'investimenti', -costo); G.slot[i] = (G.slot[i] || 0) + n; return ok(`Acquistati ${n} slot a ${i}`); },
    assumiEquipaggio(G, { base, tipo, piloti = 2, cabina = 4, urgente = false, contratto = 'fisso' }) {
      if (contratto === 'agenzia') urgente = true;
      if (!G.basi.includes(base)) return err('Si assume solo nelle basi');
      piloti = clamp(Math.round(piloti), 2, 3); cabina = clamp(Math.round(cabina), 1, 16);
      const as = assunzione(G, { piloti, cabina }, urgente), costo = Math.round(as.costo * (contratto === 'stagionale' ? 0.5 : 1)); if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo, 'personale'); if (as.cadetti) G.lavoro.cadetti -= as.cadetti;
      const e = nuovoEquipaggio(G, { base, tipo, piloti, cabina, stato: 'formazione', pronto: G.ora + as.giorni * GIORNO, motivo: urgente ? 'assunzione urgente tramite agenzia' : as.cadetti ? 'piloti dalla scuola aziendale' : 'nuova assunzione' });
      e.contratto = urgente ? 'agenzia' : contratto;
      if (contratto === 'stagionale') { const d = loc(G.ora), fineEstate = Date.UTC(d.getUTCFullYear(), 9, 31) - FUSO * ORA; e.scadenza = fineEstate > G.ora + 60 * GIORNO ? fineEstate : G.ora + 180 * GIORNO; }
      return ok(`Assunto l’equipaggio ${e.nome} (${tipo}, ${CONTRATTI[e.contratto].nome.toLowerCase()}): operativo tra ${as.giorni} giorni`);
    },
    stimaMancanti(G, urgente) { const p = pianoAssunzioni(G); return { n: p.length, costo: p.reduce((x, e) => x + costoAssunzione(e, urgente), 0), equipaggi: p }; },
    assumiMancanti(G, urgente = false) {
      const p = pianoAssunzioni(G); if (!p.length) return err('Tutti i turni hanno già un equipaggio (anche contando quelli in arrivo)');
      const costo = p.reduce((x, e) => x + costoAssunzione(e, urgente), 0); if (G.cassa < costo) return err(`Servono ${eur(costo)} per assumere ${p.length} equipaggi`);
      paga(G, costo, 'personale'); let maxG = 0;
      for (const x of p) { const as = assunzione(G, x, urgente); if (as.cadetti) { G.lavoro.cadetti -= as.cadetti; G.cassa += costoAssunzione(x, urgente) - as.costo; } maxG = Math.max(maxG, as.giorni);
        const e = nuovoEquipaggio(G, { base: x.base, tipo: x.tipo, piloti: x.piloti, cabina: x.cabina, stato: 'formazione', pronto: G.ora + as.giorni * GIORNO, motivo: urgente ? 'assunzione urgente tramite agenzia' : as.cadetti ? 'piloti dalla scuola aziendale' : 'nuova assunzione' }); if (urgente) e.contratto = 'agenzia'; }
      return ok(`Assunti ${p.length} equipaggi (${eur(costo)}): operativi entro ${maxG} giorni`);
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
    ritocca(G, k, f) {
      const r = G.rotte[k]; if (!r) return err('Rotta non aperta');
      for (const c of CL) r['p' + c] = clamp(Math.round(r['p' + c] * f), 10, 5000);
      r.ritocco = G.ora; vendite(G); return ok(`Prezzi ${k.replace('-', '–')} ${f > 1 ? 'alzati' : 'abbassati'} del ${Math.round(Math.abs(f - 1) * 100)}%`);
    },
    // gli equipaggi in formazione arrivano in 2 giorni tramite agenzia (si paga la differenza)
    stimaAnticipo(G) { const l = G.equipaggi.filter(e => e.stato === 'formazione' && e.pronto > G.ora + 2 * GIORNO && !/riqualif|trasfer/.test(e.motivo || '')); return { n: l.length, costo: l.reduce((x, e) => x + costoAssunzione(e, true) - costoAssunzione(e, false), 0), lista: l }; },
    anticipaFormazione(G) {
      const st = A.stimaAnticipo(G); if (!st.n) return err('Nessun equipaggio da anticipare');
      if (G.cassa < st.costo) return err(`Servono ${eur(st.costo)}`);
      paga(G, st.costo, 'personale'); for (const e of st.lista) { e.pronto = G.ora + 2 * GIORNO; e.motivo = 'formazione accelerata tramite agenzia'; }
      return ok(`${st.n} equipaggi operativi tra 2 giorni (${eur(st.costo)})`);
    },
    ispezione(G, id) { const ae = G.aerei.find(a => a.id === id); if (!ae || ae.lavori) return err('L’aereo ha già lavori programmati'); pianificaCheck(G, id); return ok('Ispezione programmata nella prossima sosta lunga'); },
    impostaAuto(G, chiave, val) {
      G.auto ||= {}; G.auto[chiave] = !!val;
      if (chiave === 'ispezioni') for (const ae of G.aerei) ae.autoCheck = !!val;
      if (chiave === 'equipaggi' && val) autoAssumi(G);
      return ok(val ? 'Pilota automatico acceso' : 'Pilota automatico spento');
    },
    // applica la rotazione guidata: apre le rotte, compra gli slot che servono e salva il programma
    applicaRotazione(G, aeId, r) {
      if (!r || !r.ok) return err((r && r.errore) || 'Rotazione non valida');
      if (G.cassa < r.costo) return err(`Servono ${eur(r.costo)} in cassa`);
      const ae = G.aerei.find(a => a.id === aeId); if (!ae) return err('Aereo inesistente');
      for (const k of r.nuove) if (!G.rotte[k]) { const [a, b] = k.split('-'); A.apriRotta(G, a, b); }
      for (const x of r.slot) A.compraSlot(G, x.i, x.n);
      const v = salvaProgramma(G, aeId, r.prog);
      return v.E.length ? err(v.E[0]) : ok('Rotazione salvata: i voli partono dai prossimi giorni');
    },
    strategia(G, id) {
      if (!D.STRATEGIE[id] || id === G.strategia) return err('Scegli un altro posizionamento');
      if (G.cambioStrategia && G.ora - G.cambioStrategia < 180 * GIORNO) return err('Il posizionamento si può cambiare al massimo ogni 6 mesi');
      const costo = 300000; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo, 'marketing'); G.strategia = id; G.cambioStrategia = G.ora; G.reputazione = Math.max(0, G.reputazione - 3); vendite(G);
      notizia(G, `Nuovo posizionamento: ${D.STRATEGIE[id].nome}. I clienti ci metteranno un po’ ad accorgersene (reputazione −3).`, 'info');
      return ok('Posizionamento cambiato');
    },
    bordo(G, c, el, l) {
      const E = D.BORDO[el]; if (!E || !CL.includes(c) || (E.classi && !E.classi.includes(c))) return err('Scelta non valida');
      if (E.richiede && !(G.mod || {})[E.richiede] && l > 0) return err('Serve prima il Wi‑Fi satellitare (progetto del CTO)');
      G.bordo[c][el] = clamp(Math.round(l), 0, E.livelli.length - 1); vendite(G); return ok(`${E.nome} ${CLS[c].nome}: ${E.livelli[G.bordo[c][el]].nome}`);
    },
    tariffe(G, x) {
      const T = G.tariffe;
      for (const k of ['bagaglio', 'posto', 'priorita']) if (x[k] != null) T[k] = clamp(Math.round(+x[k] || 0), 0, 200);
      if (x.famiglie != null) T.famiglie = !!x.famiglie;
      if (x.dinamico != null) { const R0 = D.DINAMICO[x.dinamico]; if (!R0) return err('Scelta non valida'); if (R0.richiede && !(G.mod || {})[R0.richiede]) return err('Serve prima il sistema di revenue management (progetto del CTO)'); T.dinamico = x.dinamico; }
      if (x.overbooking != null) T.overbooking = clamp(+x.overbooking || 0, 0, 0.12);
      vendite(G); return ok('Tariffe aggiornate');
    },
    ricerca(G, { tipo, da, a, base }) {
      const Rr = D.RICERCHE[tipo]; if (!Rr) return err('Ricerca sconosciuta');
      if (tipo === 'domanda' && (!da || !a || da === a)) return err('Scegli due aeroporti');
      if (tipo === 'area' && !G.basi.includes(base)) return err('Scegli una base');
      if (G.ricerche.some(r => !r.fatta && r.tipo === tipo && r.da === da && r.a === a && r.base === base)) return err('Ricerca già in corso');
      if (G.cassa < Rr.costo) return err(`Servono ${eur(Rr.costo)}`);
      paga(G, Rr.costo, 'marketing');
      G.ricerche.push({ id: 'r' + (G.seq++), tipo, da, a, base, inizio: G.ora, fine: G.ora + Rr.giorni * GIORNO, fatta: false });
      return ok(`${Rr.nome} commissionato: pronto tra ${Rr.giorni} giorni`);
    },
    decidi(G, i, si) { return decidi(G, i, si); },
    dilemma(G, i) { return scegliDilemma(G, i); },
    alleanza(G, rid, livello) { return proponiAlleanza(G, rid, livello); },
    chiudiAlleanza(G, rid) { return chiudiAlleanza(G, rid); },
    jointVenture(G, rid, k) { return jointVenture(G, rid, k); },
    acquisisci(G, rid) { return acquisisci(G, rid); },
    annullaOrdine(G, id) { return annullaOrdine(G, id); },
    fedelta(G, x) {
      const F = G.fedelta; if (!F.attivo) return err('Il programma fedeltà non è ancora attivo');
      if (x.nome != null) F.nome = String(x.nome).slice(0, 30) || F.nome;
      if (x.accumulo != null && ACCUMULO[x.accumulo]) F.accumulo = +x.accumulo;
      if (x.scadenza != null && SCADENZE[x.scadenza]) F.scadenza = String(x.scadenza);
      if (x.vantaggi != null && VANTAGGI[x.vantaggi]) F.vantaggi = x.vantaggi;
      vendite(G); return ok('Programma fedeltà aggiornato');
    },
    firmaCarta(G, id) { const F = G.fedelta, o = (F.offerteCarta || []).find(x => x.id === id); if (!o) return err('Offerta scaduta'); F.carta = { banca: o.banca, perTitolare: o.perTitolare, inizio: G.ora, fine: G.ora + o.anni * 365 * GIORNO }; F.offerteCarta = []; return ok(`Carta di credito con ${o.banca} firmata`); },
    scuolaPiloti(G) { return apriScuola(G); },
    trattativa(G, x) { return trattativa(G, x); },
    applicaPianoFlotta(G, P, opz) { return applicaPianoFlotta(G, P, opz); },
    revisione(G, id, tipo, quando) { return pianificaRevisione(G, id, tipo, quando); },
    leasing(G, id, scelta) { const ae = G.aerei.find(a => a.id === id); if (!ae || ae.modo !== 'leasing') return err('Non è un aereo in leasing');
      if (scelta === 'rinnova') { rinnovaLeasing(G, ae); return ok('Leasing rinnovato'); }
      if (scelta === 'restituisci') { ae.restituire = true; return ok(`${ae.marche} sarà restituito alla scadenza del contratto (${dataDi(ae.leasingFine)})`); }
      if (scelta === 'tieni') { ae.restituire = false; return ok('Il contratto verrà rinnovato alla scadenza'); }
      return err('Scelta non valida'); },
    ammoderna(G, id, cosa) {
      const ae = G.aerei.find(a => a.id === id), X = AMMODERNAMENTI[cosa]; if (!ae || !X) return err('Ammodernamento non valido');
      const m = MOD[ae.modello]; if (!X.ok(ae, m)) return err(cosa === 'motori' ? 'Conviene solo su aerei di almeno 6 anni' : 'Non disponibile per questo modello');
      if ((ae.ammodernamenti || []).includes(cosa)) return err('Già fatto'); if (ae.lavori) return err('L’aereo ha già lavori programmati');
      const costo = Math.round(X.costo(m)); if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      G.cassa -= costo; flusso(G, 'investimenti', -costo);
      const inizio = fineGiornataAereo(G, ae); ae.lavori = { tipo: 'ammodernamento', cosa, fattore: X.fattore, inizio, fine: inizio + X.giorni * GIORNO, costo: 0 }; ae.lavori.costoInvestito = costo; rigeneraAereo(G, ae);
      return ok(`${X.nome}: lavori dal ${dataDi(inizio)} per ${X.giorni} giorni`);
    },
    diritti(G, a, b) { return chiediDiritti(G, a, b); },
    irops(G, k, v) { G.irops ||= {}; if (!['riserva', 'riprotezione'].includes(k)) return err('Impostazione sconosciuta'); G.irops[k] = !!v; return ok('Centro operativo aggiornato'); },
    esperto(G, v) { G.esperto = !!v; return ok(v ? 'Modalità esperto attiva: controlli tutto a mano' : 'Modalità semplice: il pilota automatico gestisce i dettagli'); },
    aderisci(G, id) {
      const X = ALLEANZE_G[id]; if (!X) return err('Alleanza sconosciuta'); if (G.globale) return err('Fai già parte di un’alleanza');
      if (G.reputazione < 55) return err('Serve una reputazione di almeno 55'); if (flottaAttiva(G).length < 8) return err('Servono almeno 8 aerei');
      if (G.cassa < QUOTA_GLOBALE) return err(`Quota d’ingresso: ${eur(QUOTA_GLOBALE)}`);
      paga(G, QUOTA_GLOBALE, 'alleanze'); G.globale = id; G.reputazione = Math.min(100, G.reputazione + 2); vendite(G);
      notizia(G, `${G.nome} entra in ${X.nome}: più passeggeri in coincidenza e nessuna guerra con gli altri membri.`, 'buona', true); return ok(`Benvenuto in ${X.nome}`);
    },
    lasciaAlleanza(G) { if (!G.globale) return err('Non fai parte di alleanze'); paga(G, 1e6, 'alleanze'); const n = ALLEANZE_G[G.globale].nome; G.globale = null; vendite(G); return ok(`Uscito da ${n} (penale 1 M€)`); },
    promozione(G, k, sconto, giorni) {
      if (!G.rotte[k]) return err('Rotta non aperta'); sconto = clamp(+sconto || 0.2, 0.05, 0.5); giorni = clamp(Math.round(+giorni || 14), 3, 60);
      const costo = 3000; if (G.cassa < costo) return err(`Servono ${eur(costo)}`); paga(G, costo, 'marketing');
      G.promozioni.push({ k, sconto, inizio: G.ora, fine: G.ora + giorni * GIORNO }); vendite(G);
      return ok(`Promozione −${Math.round(sconto * 100)}% su ${k.replace('-', '–')} per i voli dei prossimi ${giorni} giorni`);
    },
    tariffeRotta(G, k, x) {
      const r = G.rotte[k]; if (!r) return err('Rotta non aperta');
      if (x.promo !== undefined) r.promo = x.promo === null || x.promo === '' ? null : clamp(+x.promo, 0, 0.8);
      if (x.alta != null) r.alta = clamp(+x.alta || 1, 0.7, 1.6); if (x.weekend != null) r.weekend = clamp(+x.weekend || 1, 0.7, 1.4);
      vendite(G); return ok('Tariffe della rotta aggiornate');
    },
    canale(G, k, v) { G.canali ||= { ota: true, aziende: false }; if (!['ota', 'aziende'].includes(k)) return err('Canale sconosciuto'); G.canali[k] = !!v; vendite(G); return ok('Canali di vendita aggiornati'); },
    emergenza(G, i) { return decidiEmergenza(G, i); },
    impostazione(G, k, v) {
      const ok0 = { imprevisti: LIVELLI_IMPREVISTI, assicurazione: ASSICURAZIONI, benessere: BENESSERE };
      if (ok0[k]) { if (!ok0[k][v]) return err('Scelta non valida'); G[k] = v; return ok('Impostazione salvata'); }
      if (k === 'quotaRiserve') { G.quotaRiserve = clamp(+v || 0, 0, 0.3); return ok('Quota di riserve aggiornata'); }
      if (k === 'manutenzioneInterna') { G.manutenzioneInterna = !!v; return ok(v ? 'Manutenzione con tecnici tuoi' : 'Manutenzione affidata a un’officina esterna'); }
      if (k === 'marchio') { G.marchio = { colore: /^#[0-9a-f]{6}$/i.test(v.colore) ? v.colore : G.marchio.colore, simbolo: v.simbolo || G.marchio.simbolo }; return ok('Marchio aggiornato'); }
      return err('Impostazione sconosciuta');
    },
    handling(G, base, proprio) { G.handlingProprio = (G.handlingProprio || []).filter(b => b !== base); if (proprio && G.basi.includes(base)) G.handlingProprio.push(base); return ok(proprio ? `Assistenza a terra in proprio a ${base}` : `Assistenza a terra affidata a un fornitore a ${base}`); },
    assumiRiserve(G) {
      const p = pianoRiserve(G); if (!p.length) return err('Le riserve bastano già');
      const costo = p.reduce((x, e) => x + costoAssunzione(e, false), 0); if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo, 'personale'); for (const x of p) { const e = nuovoEquipaggio(G, { ...x, stato: 'formazione', pronto: G.ora + giorniAssunzione(false) * GIORNO, motivo: 'riserva' }); e.riserva = true; }
      return ok(`Assunti ${p.length} equipaggi di riserva`);
    },
    riserva(G, id, si) { const e = G.equipaggi.find(x => x.id === id); if (!e) return err('Equipaggio inesistente'); e.riserva = !!si; G._roster = null; return ok(si ? `${e.nome} passa tra le riserve` : `${e.nome} torna nei turni`); },
    stabilizza(G, id) { const e = G.equipaggi.find(x => x.id === id); if (!e || e.contratto === 'fisso') return err('Contratto già a tempo indeterminato'); paga(G, 5000, 'personale'); e.contratto = 'fisso'; delete e.scadenza; G.morale = Math.min(100, G.morale + 0.5); return ok(`${e.nome} assunto a tempo indeterminato`); },
    corsoCabina(G) { const costo = 150000 + 1000 * G.equipaggi.length; if (G.cassa < costo) return err(`Servono ${eur(costo)}`); paga(G, costo, 'personale'); G.mod.corsoCabina = G.ora + 365 * GIORNO; G.morale = Math.min(100, G.morale + 2); return ok('Corso di servizio per la cabina fatto: passeggeri più soddisfatti per un anno'); },
    sondaggioClima(G) {
      paga(G, 10000, 'personale'); const L = G.lavoro, cop = copertura(G), gap = L ? G.stipendio * L.contratto / L.mercato - 1 : 0, u30 = G.storico.slice(-30);
      G.clima = { t: G.ora, morale: Math.round(G.morale), voci: [
        { t: 'Paga rispetto al mercato', v: gap, testo: gap < -0.03 ? 'si sentono pagati meno della concorrenza' : gap > 0.03 ? 'sono contenti della paga' : 'paga in linea con il mercato' },
        { t: 'Carico di lavoro', v: (22 - cop.oreMedie) / 22, testo: cop.oreMedie > 24 ? 'volano troppe ore: sono stanchi' : 'carico sostenibile' },
        { t: 'Benessere', v: BENESSERE[G.benessere || 'nessuno'].morale / 12 - 0.5, testo: G.benessere === 'nessuno' ? 'chiedono welfare e alloggi decenti fuori casa' : 'apprezzano il welfare' },
        { t: 'Stabilità', v: -G.equipaggi.filter(e => e.contratto !== 'fisso').length / Math.max(1, G.equipaggi.length), testo: G.equipaggi.some(e => e.contratto !== 'fisso') ? 'i precari vorrebbero un contratto fisso' : 'tutti a tempo indeterminato' },
        { t: 'Assenze negli ultimi 30 giorni', v: -u30.reduce((s, x) => s + (x.canc || 0), 0) / Math.max(1, u30.length * 10), testo: 'più cancellazioni = più stress per chi resta' }] };
      return ok('Sondaggio sul clima aziendale pronto');
    },
    chiediOfferta(G, iata) { return chiediOfferta(G, iata); },
    accettaOfferta(G, id) { return accettaOfferta(G, id); },
    rifiutaOfferta(G, id) { return rifiutaOfferta(G, id); },
    recediAccordo(G, id) { return recediAccordo(G, id); },
    saf(G, x) { G.saf = clamp(+x || 0, 0, 0.5); vendite(G); return ok(G.saf ? `Carburante sostenibile al ${Math.round(G.saf * 100)}%` : 'Niente carburante sostenibile'); },
    salvaStagione(G, aeId, prog) { return salvaStagione(G, aeId, prog); },
    copiaStagione(G, aeId) { const ae = G.aerei.find(a => a.id === aeId); if (!ae) return err('Aereo inesistente'); ae.progAlt = normalizza(JSON.parse(JSON.stringify(ae.prog))); return ok('Programma copiato nell’altra stagione'); },
    togliStagione(G, aeId) { const ae = G.aerei.find(a => a.id === aeId); if (ae) delete ae.progAlt; return ok('Stesso programma tutto l’anno'); },
    progetto(G, tipo) { return avviaProgetto(G, tipo); },
    quotazione(G, quota = 0.3) {
      const B = G.borsa; if (B.quotata) return err('Sei già quotato');
      { const v = serveVoto(G, 'quotazione', null, 'quotazione in borsa'); if (v) return v; }
      if (valoreCompagnia(G) < 25e6) return err('Per quotarti serve un valore della compagnia di almeno 25 M€');
      if (G.ora - G.inizio < 60 * GIORNO) return err('Servono almeno 60 giorni di storia per la quotazione');
      quota = clamp(quota, 0.1, 0.45);
      const cap = valoreEquo(G), nuove = AZIONI * quota / (1 - quota), prezzo = cap / AZIONI, incasso = Math.round(nuove * prezzo * 0.94);
      Object.assign(B, { quotata: true, azioni: AZIONI, mie: AZIONI, prezzo, storico: [{ t: G.ora, p: prezzo }], ipo: G.ora, dividendi: 0 });
      { const m = socio(G, 'mercato') || nuovoSocio(G, 'mercato', 0); emetti(G, quota, m); }
      G.cassa += incasso; flusso(G, 'finanziamenti', incasso); G.cda.fiducia = Math.min(100, G.cda.fiducia + 5);
      notizia(G, `Quotazione in borsa riuscita: venduto il ${Math.round(quota * 100)}% a ${prezzo.toFixed(2)} € per azione, incassati ${eur(incasso)}.`, 'buona', true);
      return ok('Sei in borsa!');
    },
    aumentoCapitale(G, quota = 0.1) {
      const B = G.borsa; if (!B.quotata) return err('Prima serve la quotazione');
      { const v = serveVoto(G, 'aumento', null, `aumento di capitale del ${Math.round(quota * 100)}%`); if (v) return v; }
      const nuove = B.azioni * quota;
      const incasso = Math.round(nuove * B.prezzo * 0.95); { const m = socio(G, 'mercato') || nuovoSocio(G, 'mercato', 0); emetti(G, quota / (1 + quota), m); } B.prezzo *= 0.96; G.cassa += incasso; flusso(G, 'finanziamenti', incasso);
      return ok(`Aumento di capitale: incassati ${eur(incasso)}`);
    },
    dividendo(G, importo) {
      const B = G.borsa; if (!B.quotata) return err('Prima serve la quotazione');
      importo = Math.round(importo); if (importo <= 0 || G.cassa < importo) return err('Cassa insufficiente');
      { const v = serveVoto(G, 'dividendo', null, `dividendo di ${eur(importo)}`); if (v) return v; }
      G.ad.ultimoDividendo = G.ora; G.ad.patrimonio += Math.round(importo * mia(G));
      G.cassa -= importo; flusso(G, 'finanziamenti', -importo); B.dividendi += importo; B.prezzo *= 1 + Math.min(0.06, importo / (B.prezzo * B.azioni) * 2); G.cda.fiducia = Math.min(100, G.cda.fiducia + 3);
      return ok(`Dividendo di ${eur(importo)} pagato`);
    },
    riacquisto(G, importo) {
      const B = G.borsa; if (!B.quotata) return err('Prima serve la quotazione');
      importo = Math.round(importo); if (importo <= 0 || G.cassa < importo) return err('Cassa insufficiente');
      const m0 = socio(G, 'mercato'), n = Math.min(importo / (B.prezzo * 1.02), (m0?.quota || 0) * B.azioni); if (n <= 0) return err('Non ci sono azioni sul mercato');
      G.cassa -= n * B.prezzo * 1.02; annulla(G, m0, n / B.azioni); B.prezzo *= 1.01;
      return ok(`Riacquistate ${num(n)} azioni`);
    },
    premio(G) { const costo = totPersonale(G) * 1500; if (G.cassa < costo) return err(`Servono ${eur(costo)}`); paga(G, costo, 'personale'); G.morale = Math.min(100, G.morale + 12); return ok(`Premio distribuito (${eur(costo)}): morale +12`); },
    limitePrestito(G) { let f = 0; for (const ae of G.aerei) if (ae.modo === 'proprieta') f += ae.valore; return Math.max(0, Math.round((0.6 * f + 3e6 + Math.max(0, G.stat.utile) * 0.3 - debitoTot(G)) / 1e5) * 1e5); },
    tassoPrestito(G) { let f = 0; for (const ae of G.aerei) if (ae.modo === 'proprieta') f += ae.valore; return rating(G).tasso + 0.01 * debitoTot(G) / (0.6 * f + 3e6) + (G.reputazione < 40 ? 0.01 : 0) - 0.0025 * abil(G, 'cfo'); },
    prestito(G, importo) {
      if (importo <= 0 || importo > A.limitePrestito(G)) return err('Importo oltre il limite concesso dalla banca');
      { const v = serveVoto(G, 'prestito', importo, `prestito di ${eur(importo)}`); if (v) return v; }
      const tasso = A.tassoPrestito(G); G.debiti.push({ id: 'd' + (G.seq++), capitale: importo, tasso, rata: Math.round(importo / (5 * 365)) }); G.cassa += importo; flusso(G, 'finanziamenti', importo);
      return ok(`Prestito di ${eur(importo)} al ${(tasso * 100).toFixed(1)}% in 5 anni`);
    },
    rimborsa(G, id, importo) {
      const d = G.debiti.find(x => x.id === id); importo = Math.min(importo, d.capitale, Math.max(0, G.cassa)); if (importo <= 0) return err('Cassa insufficiente');
      d.capitale -= importo; G.cassa -= importo; flusso(G, 'finanziamenti', -importo); G.debiti = G.debiti.filter(x => x.capitale > 1); return ok(`Rimborsati ${eur(importo)}`);
    },
    obbligazione(G, importo, anni) {
      const R0 = rating(G); if (R0.i > 3) return err(`Con un rating ${R0.sigla} nessuno compra le tue obbligazioni: serve almeno BB`);
      anni = [3, 5, 7].includes(+anni) ? +anni : 5; importo = Math.round(+importo / 1e6) * 1e6;
      const max = Math.max(5e6, Math.round(A.limitePrestito(G) * 1.5 / 1e6) * 1e6); if (importo < 5e6 || importo > max) return err(`Emissione tra 5 M€ e ${eur(max)}`);
      { const v = serveVoto(G, 'obbligazione', importo, `obbligazioni per ${eur(importo)}`); if (v) return v; }
      const tasso = Math.round((R0.tasso - 0.005 + (anni - 5) * 0.002) * 1000) / 1000;
      G.debiti.push({ id: 'b' + (G.seq++), tipo: 'obbligazione', capitale: importo, tasso, rata: 0, scadenza: G.ora + anni * 365 * GIORNO }); G.cassa += importo * 0.985; paga(G, 0, 'altro'); flusso(G, 'finanziamenti', importo * 0.985);
      return ok(`Emesse obbligazioni per ${eur(importo)} al ${(tasso * 100).toFixed(1)}% per ${anni} anni (capitale rimborsato tutto alla scadenza)`);
    },
    coperturaCambio(G, mesi) {
      mesi = [6, 12].includes(+mesi) ? +mesi : 6; const premio = Math.round(usdGiornalieri(G) * 30 * mesi * 0.008); if (G.cassa < premio) return err(`Servono ${eur(premio)}`);
      paga(G, premio, 'altro'); G.coperturaCambio = { cambio: G.cambio, fine: G.ora + mesi * 30 * GIORNO }; return ok(`Cambio euro/dollaro bloccato a ${G.cambio.toFixed(3)} per ${mesi} mesi (premio ${eur(premio)})`);
    },
    coperturaCarburante(G, mesi) {
      mesi = [3, 6, 12].includes(+mesi) ? +mesi : 6; const u = G.storico.slice(-30), carb = u.length ? u.reduce((s, x) => s + (x.dettaglio?.carburante || 0), 0) / u.length : 0, premio = Math.round(carb * 30 * mesi * 0.02);
      if (G.cassa < premio) return err(`Servono ${eur(premio)}`); paga(G, premio, 'altro'); G.copertura = { prezzo: G.carburante * 1.02, fine: G.ora + mesi * 30 * GIORNO };
      return ok(`Cherosene bloccato a ${(G.carburante * 1.02).toFixed(2)} €/kg per ${mesi} mesi (premio ${eur(premio)})`);
    }
  };

  Object.assign(A, AZIONI_PROPRIETA, AZIONI_GRUPPO);
  return { TIPI_MARCHIO, SOCIETA, LOBBY, STILI, CARATTERI_DIR, contiGruppo, valoreSocieta, statoSocieta, probBando, marchioDi, stipendioPer, TIPI_SOCIO, CARATTERI, COMPENSI, CONDIZIONI, DOMANDE, controllo, seggi, mia, sogliaVoto, probabilitaSi, carriera, valoreQuotaRiv, probOpa, costoOpa, ALLEANZE_G, QUOTA_GLOBALE, CANONE_GLOBALE, contiRivale, REVISIONI, AMMODERNAMENTI, ANNI_LEASING, costoRevisione, costoRiconsegna, dirittiOk, servonoDiritti, chiaveDiritti, segmenti, mixTariffe, quotaPromo, canali, altaStagione, fattoreMarchio, SCAGLIONI, indicatori, contoEconomico, statoPatrimoniale, rating, RATING, settimanaSfida, LIVELLI_IMPREVISTI, ASSICURAZIONI, BENESSERE, CONTRATTI, fattoreLavoro, fattorePaga, pianoRiserve, assente, generatoreSeme, impostaRnd: f => { rnd = f || Math.random; }, pianificaFlotta, stimaPersonalePiano, generosita, livelliFedelta, ACCUMULO, SCADENZE, VANTAGGI, VALORE_MIGLIO, giorniAssunzione, assunzione, disponibile, annunciato, disponibileDal, superato, SCONTO_ATTESA, statoAccordo, scontoAeroporto, contributoRotta, stagioneDi, QUOTA_CO2, sommario, dataDi, valoreRivale, prezzoAcquisto, flottaRivale, disponibilita, LIVELLI_ALLEANZA, QUOTA_JV, AVVIO_JV, alleanzaCon: alleanza, jvSu, valoreProdotto, analisiProdotto, contoBordo, proposteDestinazioni, candidati, statoCda, valoreEquo, studiato, fattoreRotta, intel, initGestione, convocaRiunione, AZIONI, rotazioneGuidata, consigli, salute, statRecenti, controllaMissioni, roster, copertura, pianoAssunzioni, sistemaTurni, equipaggioDi, pagaEquipaggio, costoAssunzione, persone, MAX_TURNI, MAX_ORE, GIORNI_SETT, giornoSett, normalizza, settimanaVuota, impostaFuso, oraIn, oraLocaleMin, oraLocaleT, loc, multClasse, lungoRaggio, spazioPosto, pianoCiclo, continentiServiti, VERSIONE, MIN, ORA, GIORNO, CL, AP, MOD, CLS, km, durata, prezzoRif, chiave, chiaveCitta, dataDi, mezzanotte, tsDi, giornoDopo, minDaOra, oraDaMin, zero, somma, posti, cabMin, spazioUsato, cabinaStandard, validaCabina, quoteClassi, prezziRotta, legsGiorno, tratteDi, indiceCiclo, mediaCiclo, validaProgramma, salvaProgramma, partenzePerScalo, nuovaPartita, migra, avanza, analisiMercato, domandaClassi, spinta, stimaMarketing, rivaliSu, coincidenze,  costiFissi, valoreCompagnia, debitoTot, obiettivi, pianificaCheck, totPersonale, vendite, venduti, rotteInEsercizio, A, eur };
})();
if (typeof module !== 'undefined') module.exports = SIM;
