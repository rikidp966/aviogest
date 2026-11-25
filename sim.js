// AvioGest — motore di simulazione (versione 2). Funzioni pure sullo stato di partita G, serializzabile in JSON.
// Novità v2: cabine a tre classi, cicli di rotazione su più giorni con pernottamento nelle basi,
// turni degli equipaggi legati alle basi (max 13 h, cambio solo in base), hub con passeggeri in coincidenza.
const SIM = (() => {
  const D = typeof DATI !== 'undefined' ? DATI : require('./data.js');
  const AP = D.AEROPORTI, MOD = D.MODELLI, CLS = D.CLASSI;
  const CL = ['J', 'W', 'Y'];
  const MIN = 6e4, ORA = 36e5, GIORNO = 864e5, VERSIONE = 2;
  const FDP = 13 * 60, PERSONE_PER_TURNO = 2.4;
  const rnd = Math.random;
  const pad = n => String(n).padStart(2, '0');
  const dataDi = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const mezzanotte = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const tsDi = (giorno, minuti) => { const d = new Date(giorno); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minuti).getTime(); };
  const giornoDopo = (giorno, n = 1) => { const d = new Date(giorno); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
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
  const prezzoRif = k => Math.round(25 + 0.085 * k);
  const repF = r => 0.4 + r / 80;
  function altriMezzi(a, b, k) {
    if (AP[a].isola || AP[b].isola) return 0.15;
    if (k < 350) return 1.6; if (k < 700) return 0.9; if (k < 1200) return 0.35; return 0.15;
  }
  function pesoOra(min) {
    const h = min / 60;
    if (h < 6.5) return 0.6; if (h < 9.5) return 1.3; if (h < 12) return 1.0; if (h < 16) return 0.8; if (h < 20.5) return 1.25; if (h < 22.5) return 0.85; return 0.6;
  }

  /* ---------- Cabine ---------- */
  const posti = ae => somma(ae.cab);
  const cabMin = ae => Math.max(1, Math.ceil(posti(ae) / 50));
  const spazioUsato = cab => (cab.J || 0) * CLS.J.spazio + (cab.W || 0) * CLS.W.spazio + (cab.Y || 0) * CLS.Y.spazio;
  function cabinaStandard(mod, stile = 'mista') {
    const s = MOD[mod].spazio, turbo = MOD[mod].tipo === 'ATR';
    if (stile === 'economy' || (turbo && stile === 'mista')) return { J: 0, W: 0, Y: s };
    if (stile === 'mista') { const J = s >= 170 ? 12 : 8; return { J, W: 0, Y: Math.floor(s - J * CLS.J.spazio + 1e-9) }; }
    const J = turbo ? 0 : s >= 170 ? 16 : 12, W = turbo ? 12 : s >= 170 ? 24 : 18;
    return { J, W, Y: Math.floor(s - J * CLS.J.spazio - W * CLS.W.spazio + 1e-9) };
  }
  function validaCabina(mod, cab) {
    for (const c of CL) if (!Number.isInteger(cab[c]) || cab[c] < 0) return 'I posti devono essere numeri interi non negativi';
    if (somma(cab) < 1) return 'Serve almeno un posto';
    if (spazioUsato(cab) > MOD[mod].spazio + 1e-6) return `Spazio insufficiente: ${spazioUsato(cab).toFixed(1)} su ${MOD[mod].spazio} unità`;
    return null;
  }
  // Ripartizione della domanda tra le classi: più business tra grandi città, più premium verso mete turistiche ed estere
  function quoteClassi(da, a) {
    const A = AP[da], B = AP[a], tur = (A.tur + B.tur) / 2, grande = Math.min(1, Math.min(A.pop, B.pop) / 3000), estero = A.paese !== B.paese ? 1 : 0;
    const J = 0.03 + 0.07 * grande * (1 - tur * 0.6) + 0.02 * estero, W = 0.07 + 0.05 * tur + 0.03 * estero;
    return { J, W, Y: 1 - J - W };
  }
  const prezziRotta = (G, da, a) => { const r = G.rotte[chiave(da, a)]; if (r) return r; const ref = prezzoRif(km(da, a)); return { pY: ref, pW: Math.round(ref * CLS.W.mult), pJ: Math.round(ref * CLS.J.mult) }; };

  /* ---------- Notizie, flotta ---------- */
  function nuovoGiorno() { return { voli: 0, canc: 0, pax: 0, posti: 0, puntuali: 0, ricavi: 0, paxC: zero(), ricaviC: zero(), transito: 0, ricaviTransito: 0, costi: { carburante: 0, tasse: 0, handling: 0, navigazione: 0, manutenzione: 0, servizio: 0, rimborsi: 0, equipaggi: 0, marketing: 0, leasing: 0, personale: 0, basi: 0, hub: 0, sede: 0, interessi: 0, assicurazione: 0, altro: 0 }, rotte: {}, aerei: {}, hub: {} }; }
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
      prog: { turn: 40, ancora: mezzanotte(G.ora), giorni: [{ inizio: '06:30', scali: [base] }] }, lavori: null, autoCheck: true
    };
    G.aerei.push(ae); return ae;
  }
  const flottaAttiva = G => G.aerei.filter(a => a.stato !== 'venduto');

  /* ---------- Personale per base ---------- */
  const squadraVuota = () => ({ CMD: {}, FO: {}, CC: 0, ADV: 0 });
  const squadra = (G, b) => (G.personale[b] ||= squadraVuota());

  /* ---------- Rotazioni su più giorni ---------- */
  function legsGiorno(ae, g, turn) {
    const legs = []; let t = minDaOra(g.inizio);
    for (let i = 0; i < g.scali.length - 1; i++) {
      const da = g.scali[i], a = g.scali[i + 1], dur = durata(km(da, a), ae.modello);
      legs.push({ da, a, dep: t, arr: t + dur, dur }); t += dur + turn;
    }
    return legs;
  }
  // Divide le tratte di una giornata in turni di servizio (max 13 h dal briefing al de-briefing); il cambio equipaggio si fa solo in una base
  function turniGiorno(G, legs) {
    const turni = [], errori = [];
    let cur = null;
    for (const l of legs) {
      if (!cur) cur = { base: l.da, inizio: l.dep - 60, legs: [] };
      else if (l.arr + 30 - cur.inizio > FDP) {
        if (G.basi.includes(l.da)) { cur.fine = cur.legs.at(-1).arr + 30; turni.push(cur); cur = { base: l.da, inizio: l.dep - 60, legs: [] }; }
        else if (!errori.length) errori.push(`il turno iniziato a ${cur.base} supera le 13 ore prima di ${l.da}–${l.a}: serve uno scalo in una base per il cambio equipaggio`);
      }
      cur.legs.push(l);
    }
    if (cur) { cur.fine = cur.legs.at(-1).arr + 30; turni.push(cur); }
    for (const t of turni) { t.termina = t.legs.at(-1).a; t.blocco = t.legs.reduce((s, l) => s + l.dur, 0); if (!G.basi.includes(t.base)) errori.push(`il turno parte da ${t.base}, dove non hai equipaggi (non è una base)`); }
    return { turni, errori };
  }
  const indiceCiclo = (prog, giorno) => { const n = prog.giorni.length; return ((giorniTra(prog.ancora, giorno) % n) + n) % n; };
  const giornoDelCiclo = (ae, giorno) => ae.prog.giorni[indiceCiclo(ae.prog, giorno)];
  const tratteDi = (ae, giorno) => legsGiorno(ae, giornoDelCiclo(ae, giorno), ae.prog.turn);
  // Media giornaliera sul ciclo (per fabbisogni e statistiche)
  function mediaCiclo(ae, prog = ae.prog) {
    const n = prog.giorni.length, out = { ore: 0, tratte: [] };
    prog.giorni.forEach(g => {
      const legs = legsGiorno(ae, g, prog.turn);
      out.ore += legs.reduce((s, l) => s + l.dur, 0) / 60 / n;
      legs.forEach(l => out.tratte.push({ ...l, peso: 1 / n }));
    });
    return out;
  }
  function partenzePerScalo(G, sostituisci) {
    const out = {};
    for (const ae of flottaAttiva(G)) {
      const prog = sostituisci && sostituisci.id === ae.id ? sostituisci.prog : ae.prog, max = {};
      for (const g of prog.giorni) { const c = {}; for (const l of legsGiorno(ae, g, prog.turn)) c[l.da] = (c[l.da] || 0) + 1; for (const i in c) max[i] = Math.max(max[i] || 0, c[i]); }
      for (const i in max) out[i] = (out[i] || 0) + max[i];
    }
    return out;
  }
  function validaProgramma(G, ae, prog) {
    const E = [], W = [], m = MOD[ae.modello], n = prog.giorni.length, giorni = [];
    if (n < 1 || n > 7) E.push('Il ciclo deve durare da 1 a 7 giorni');
    let notteMin = 1e9;
    prog.giorni.forEach((g, i) => {
      const legs = legsGiorno(ae, g, prog.turn), fineprec = prog.giorni[(i - 1 + n) % n].scali.at(-1);
      const tag = n > 1 ? `Giorno ${i + 1}: ` : '';
      if (g.scali[0] !== fineprec) E.push(`${tag}deve partire da ${fineprec}, dove l’aereo ha passato la notte`);
      if (!G.basi.includes(g.scali.at(-1))) E.push(`${tag}a fine giornata l’aereo resta a ${g.scali.at(-1)}, che non è una tua base: può pernottare solo in una base`);
      else if (!G.basi.includes(g.scali[0])) E.push(`${tag}l’aereo pernotta a ${g.scali[0]}, che non è una tua base`);
      for (const l of legs) {
        if (!G.rotte[chiave(l.da, l.a)]) E.push(`${tag}la rotta ${l.da}–${l.a} non è aperta`);
        if (km(l.da, l.a) > m.autonomia) E.push(`${tag}${l.da}–${l.a} supera l’autonomia (${m.autonomia} km)`);
      }
      if (legs.length) {
        if (legs[0].dep < 330) E.push(`${tag}nessuna partenza prima delle 05:30`);
        if (legs.at(-1).arr > 1440) E.push(`${tag}l’ultimo volo atterra alle ${oraDaMin(legs.at(-1).arr)}, oltre mezzanotte`);
        const ls = legsGiorno(ae, prog.giorni[(i + 1) % n], prog.turn);
        if (ls.length) notteMin = Math.min(notteMin, 1440 - legs.at(-1).arr + ls[0].dep);
      }
      const t = turniGiorno(G, legs);
      t.errori.forEach(e => E.push(tag + e));
      giorni.push({ legs, turni: t.turni });
    });
    if (prog.turn < 35) W.push('Turnaround sotto i 35 minuti: i ritardi saranno più frequenti e si propagheranno');
    if (notteMin < 8 * 60) W.push(`Pausa notturna minima di ${Math.floor(notteMin / 60)} h: le ispezioni (8 h) cancelleranno qualche volo`);
    const fuori = giorni.flatMap(g => g.turni).filter(t => t.termina !== t.base);
    if (fuori.length) W.push(`${fuori.length} turni finiscono lontano dalla base dell’equipaggio: rientro in posizionamento (circa 150 € a persona)`);
    const dep = partenzePerScalo(G, { id: ae.id, prog });
    for (const [i, c] of Object.entries(dep)) if (AP[i].slot && c > (G.slot[i] || 0)) E.push(`${i} è un aeroporto a slot: servono ${c} slot giornalieri, ne hai ${G.slot[i] || 0}`);
    return { E: [...new Set(E)], W, giorni };
  }
  function salvaProgramma(G, aeId, prog) {
    const ae = G.aerei.find(a => a.id === aeId), v = validaProgramma(G, ae, prog);
    if (v.E.length) return v;
    // "Giorno 1" del ciclo coincide con oggi
    ae.prog = { turn: prog.turn, ancora: mezzanotte(G.ora), giorni: prog.giorni.map(g => ({ inizio: g.inizio, scali: g.scali.slice() })) };
    ae.base = prog.giorni[0].scali[0];
    rigeneraAereo(G, ae); G._fab = null;
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
    const { turni } = turniGiorno(G, tratteDi(ae, giorno));
    turni.forEach((t, ti) => t.legs.forEach((l, k) => {
      const dep = tsDi(giorno, l.dep); if (dep <= G.ora) return;
      const v = { id: G.seq++, ae: ae.id, num: numeroVolo(G, l.da, l.a, l.dep), da: l.da, a: l.a, dep, arr: tsDi(giorno, l.arr), v: zero(), t: zero(), inc: zero(), incT: 0, att: zero(), conn: {}, stato: 'prog', rit: 0, base: t.base, fineTurno: k === t.legs.length - 1 && t.termina !== t.base };
      const old = vecchi && vecchi.get(`${l.da}${l.a}${dep}`);
      if (old) Object.assign(v, { v: old.v, t: old.t, inc: old.inc, incT: old.incT, conn: old.conn });
      G.voli.push(v);
    }));
  }
  function rigeneraAereo(G, ae) {
    const vecchi = new Map();
    G.voli = G.voli.filter(v => { if (v.ae === ae.id && v.stato === 'prog' && v.dep > G.ora) { vecchi.set(`${v.da}${v.a}${v.dep}`, v); return false; } return true; });
    for (let g = mezzanotte(G.ora); g <= G.genFino; g = giornoDopo(g)) generaVoliAereo(G, ae, g, vecchi);
    G.voli.sort((a, b) => a.dep - b.dep);
    vendite(G);
  }
  const venduti = v => somma(v.v) + somma(v.t);

  /* ---------- Fabbisogno e copertura del personale (per base) ---------- */
  function fabbisogno(G) {
    const f = {};
    for (const ae of flottaAttiva(G)) {
      if (ae.stato === 'consegna') continue;
      const n = ae.prog.giorni.length, tipo = MOD[ae.modello].tipo, cm = cabMin(ae), w = 1 / n;
      for (const g of ae.prog.giorni) for (const t of turniGiorno(G, legsGiorno(ae, g, ae.prog.turn)).turni) {
        const b = (f[t.base] ||= { CMD: {}, FO: {}, CC: 0, ADV: 0, turni: 0 });
        b.CMD[tipo] = (b.CMD[tipo] || 0) + w; b.FO[tipo] = (b.FO[tipo] || 0) + w; b.CC += w; b.ADV += w * (cm - 1); b.turni += w;
      }
    }
    for (const b of Object.values(f)) {
      for (const r of ['CMD', 'FO']) for (const t in b[r]) b[r][t] = Math.ceil(b[r][t] * PERSONE_PER_TURNO - 1e-9);
      b.CC = Math.ceil(b.CC * PERSONE_PER_TURNO - 1e-9); b.ADV = Math.ceil(b.ADV * PERSONE_PER_TURNO - 1e-9);
    }
    return f;
  }
  function copertura(G) {
    if (G._fab && G._fabOra === G.ora) return G._fab;
    const f = fabbisogno(G), c = { f, basi: {}, min: 9 };
    for (const [b, need] of Object.entries(f)) {
      const P = squadra(G, b), x = { tipi: {}, cabina: 1 };
      for (const t in need.CMD) x.tipi[t] = Math.min((P.CMD[t] || 0) / need.CMD[t], (P.FO[t] || 0) / need.FO[t]);
      x.cabina = Math.min(need.CC ? P.CC / need.CC : 1, need.ADV ? P.ADV / need.ADV : 1);
      x.min = Math.min(x.cabina, ...Object.values(x.tipi), 9);
      c.basi[b] = x; c.min = Math.min(c.min, x.min);
    }
    G._fab = c; G._fabOra = G.ora;
    return c;
  }
  function totPersonale(G) {
    let n = 0;
    for (const P of Object.values(G.personale)) { n += P.CC + P.ADV; for (const r of ['CMD', 'FO']) for (const t in P[r]) n += P[r][t]; }
    return n;
  }

  /* ---------- Domanda e vendite ---------- */
  function domandaBase(G, da, a, giorno) {
    const A = AP[da], B = AP[a], d = new Date(giorno), mese = d.getMonth(), tur = (A.tur + B.tur) / 2;
    const stag = mese >= 5 && mese <= 8 ? 1 + 0.6 * tur : (mese === 11 || mese <= 1) ? 1 - 0.3 * tur : (mese === 3 || mese === 4 || mese === 9) ? 1 + 0.15 * tur : 1;
    const dow = [1.12, 1.0, 0.92, 0.92, 1.0, 1.15, 0.88][d.getDay()];
    let ev = 1;
    for (const e of G.eventi) if (e.tipo === 'domanda' && (e.citta === A.citta || e.citta === B.citta) && e.inizio < giorno + GIORNO && e.fine > giorno) ev *= e.fattore;
    return 0.25 * Math.sqrt(A.pop * B.pop) * stag * dow * ev;
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
    return { mercato, quota, pax, ref, rivali, altri: altri / tot, maturita, quote, spinta: sp };
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
  function domandaClassi(pax, quote, prezzi, ref) {
    const out = {};
    for (const c of CL) out[c] = pax * quote[c] * (c === 'Y' ? 1 : clamp((ref * CLS[c].mult / prezzi['p' + c]) ** CLS[c].el, 0.2, 2.5));
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
      const dom = domandaClassi(am.pax, am.quote, pm, am.ref);
      const pesi = lista.map(v => pesoOra((v.dep - g) / MIN)), tot = pesi.reduce((s, x) => s + x, 0);
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
          const dom = domandaClassi(am.pax / am.maturita * mat, am.quote, tariffe, am.ref);
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
      const pesi = lista.map(v => pesoOra((v.dep - domani) / MIN)), tot = pesi.reduce((a, x) => a + x, 0);
      const venduti = o => {
        const am = analisiMercato(G, v0.da, v0.a, domani, lista.length, pm.pY, 1, o), dom = domandaClassi(am.pax, am.quote, pm, am.ref);
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
      const usura = ae.oreDaCheck / 600, tipo = MOD[ae.modello].tipo, cb = copertura(G).basi[v.base];
      const deficit = cb ? Math.max(0, 1 - Math.min(cb.tipi[tipo] ?? 0, cb.cabina)) : 1;
      const paese = AP[v.da].paese === 'IT' || AP[v.a].paese === 'IT', meteo = eventoAttivo(G, 'meteo', v.dep, [v.da, v.a]);
      if (paese && eventoAttivo(G, 'sciopero-atc', v.dep) && rnd() < 0.6) { motivo = 'Sciopero dei controllori di volo'; straord = true; }
      else if (eventoAttivo(G, 'sciopero', v.dep) && rnd() < 0.45) motivo = 'Sciopero del personale';
      else if (deficit > 0.1 && rnd() < (deficit - 0.1) * 1.5) motivo = `Equipaggio della base ${v.base} non disponibile`;
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
        ae.arrPrevista = v.arrEff; ae.pos = v.a; ae.inVolo = v.id;
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
      tasse: Math.round(pax * AP[v.da].tassa + np * 2),
      handling: 250 + pax * 5,
      navigazione: Math.round(k * 0.6 * m.peso / 70),
      manutenzione: Math.round(m.manut * h * (1 + ae.eta * 0.03)),
      servizio: pax * D.SERVIZIO[G.servizio].costo + (v.v.J + v.t.J) * 12 + (v.v.W + v.t.W) * 4,
      rimborsi: v.rit >= 180 ? Math.round(pax * (k < 1500 ? 250 : 400) * 0.5) : 0,
      equipaggi: v.fineTurno ? (2 + cabMin(ae)) * 150 : 0
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
    G.registro.unshift({ id: v.id, num: v.num, da: v.da, a: v.a, dep: v.dep, depEff: v.depEff, arrEff: v.arrEff, arr: v.arr, rit: v.rit, stato: v.stato, motivo: v.motivo, marche: ae?.marche, base: v.base, posti: ae ? posti(ae) : 0, cab: ae ? { ...ae.cab } : zero(), paxC: { J: v.v.J + v.t.J, W: v.v.W + v.t.W, Y: v.v.Y + v.t.Y }, transito: somma(v.t), ricaviTransito: Math.round(v.incT), ...x });
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
          else { ae.cab = L.cab; G._fab = null; rigeneraAereo(G, ae); notizia(G, `${ae.marche}: nuova cabina pronta (${L.cab.J} Business · ${L.cab.W} Premium · ${L.cab.Y} Economy).`, 'buona'); }
        }
      }
      if (ae.stato === 'guasto' && G.ora >= ae.fino) { ae.stato = 'attivo'; notizia(G, `${ae.marche} è di nuovo operativo.`, 'buona'); }
      if (ae.stato === 'consegna' && G.ora >= ae.fino) {
        ae.stato = 'attivo'; ae.pos = ae.prog.giorni[indiceCiclo(ae.prog, mezzanotte(G.ora))].scali[0]; G._fab = null;
        notizia(G, `Consegnato ${MOD[ae.modello].nome} ${ae.marche} a ${ae.base} (${ae.cab.J}J · ${ae.cab.W}W · ${ae.cab.Y}Y). Assegnagli una rotazione!`, 'buona', true);
        rigeneraAereo(G, ae); controllaTraguardi(G);
      }
    }
  }
  function fineGiornataAereo(G, ae) {
    const legs = tratteDi(ae, mezzanotte(G.ora));
    return Math.max(legs.length ? tsDi(mezzanotte(G.ora), legs.at(-1).arr + 30) : G.ora, G.ora);
  }
  function pianificaCheck(G, aeId) {
    const ae = G.aerei.find(a => a.id === aeId); if (!ae || ae.lavori) return;
    const inizio = fineGiornataAereo(G, ae);
    ae.lavori = { tipo: 'check', inizio, fine: inizio + 8 * ORA, costo: Math.round(MOD[ae.modello].check * (1 + ae.eta * 0.02)) };
    notizia(G, `${ae.marche}: ispezione programmata dalle ${oraDaMin((inizio - mezzanotte(inizio)) / MIN)} per 8 ore.`, 'info');
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
    const ora = new Date(G.ora).getHours();
    for (const f of G.formazione) if (!f.fatto && G.ora >= f.fine) {
      f.fatto = true; const P = squadra(G, f.base);
      if (f.ruolo === 'CC' || f.ruolo === 'ADV') P[f.ruolo] += f.n; else P[f.ruolo][f.tipo] = (P[f.ruolo][f.tipo] || 0) + f.n;
      notizia(G, `${f.base}: ${f.n} ${D.RUOLI[f.ruolo].nome.toLowerCase()}${f.tipo ? ' ' + f.tipo : ''} ${f.riq ? 'hanno finito la riqualifica' : f.trasf ? 'trasferiti e operativi' : 'hanno preso servizio'}.`, 'buona'); G._fab = null;
    }
    G.formazione = G.formazione.filter(f => !f.fatto);
    if (ora === 18) for (const ae of G.aerei) if (ae.autoCheck && !ae.lavori && ae.stato === 'attivo' && ae.oreDaCheck > 500) pianificaCheck(G, ae.id);
    if (ora === 3) for (const ae of G.aerei) {
      if (ae.stato === 'venduto' || ae.stato === 'consegna' || ae.inVolo) continue;
      const dove = giornoDelCiclo(ae, mezzanotte(G.ora)).scali[0];
      if (ae.pos === dove) continue;
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
    let pag = 0;
    for (const P of Object.values(G.personale)) { pag += P.CC * D.RUOLI.CC.paga + P.ADV * D.RUOLI.ADV.paga; for (const r of ['CMD', 'FO']) for (const t in P[r]) pag += P[r][t] * D.RUOLI[r].paga; }
    for (const f of G.formazione) pag += f.n * D.RUOLI[f.ruolo].paga;
    c.personale = pag * G.stipendio;
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
    const tm = clamp(60 + (G.stipendio - 1) * 160 - (cop.min < 1 ? 15 : 0) - (cop.min < 0.9 ? 15 : 0), 0, 100);
    G.morale = clamp(G.morale + (tm - G.morale) * 0.05, 0, 100);
    G.carburante = clamp(G.carburante + (0.8 - G.carburante) * 0.03 + (rnd() - 0.5) * 0.025, 0.45, 1.6);
    eventiCasuali(G);
    if (new Date(G.ora).getDay() === 1) { settimanaRivali(G); aggiornaMercato(G); }
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
    const domani = giornoDopo(mezzanotte(G.ora)), mese = new Date(G.ora).getMonth();
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
      notizia(G, `Annunciato sciopero dei controllori di volo italiani per ${new Date(g).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}, dalle 10 alle 18.`, 'evento', true);
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
      if (scaduti || cop.min < 0.9) { G.cassa -= 150000; G.oggi.costi.altro += 150000; G.reputazione = Math.max(0, G.reputazione - 3); notizia(G, `Ispezione dell’autorità aeronautica: ${scaduti ? 'aerei con ispezioni in scadenza' : 'equipaggi sotto organico'}. Multa di 150.000 €.`, 'cattiva', true); }
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
      const R = pick(G.rivali), dest = pick(Object.keys(AP).filter(i => i !== R.hub && km(R.hub, i) < 2000));
      const k = chiave(R.hub, dest); if (!R.rotte[k]) { R.rotte[k] = { freq: 2, prezzo: R.prezzo }; notizia(G, `${R.nome} inaugura un collegamento ${R.hub}–${dest}.`, 'info'); }
    }
  }
  function aggiornaMercato(G) {
    const pesi = ['ATR42', 'ATR72', 'ATR72', 'E195', 'A319', 'A319', 'A320', 'A320', 'A320', 'A321', 'A220'];
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
    if (ult.reduce((s, x) => s + (x.transito || 0), 0) >= 1000) traguardo(G, 'transito');
  }
  const debitoTot = G => G.debiti.reduce((s, d) => s + d.capitale, 0);
  function valoreCompagnia(G) {
    let v = G.cassa - debitoTot(G);
    for (const ae of G.aerei) if (ae.modo === 'proprieta' && ae.stato !== 'venduto') v += ae.valore;
    for (const [i, n] of Object.entries(G.slot)) v += n * AP[i].slotPrezzo * 0.7;
    return v;
  }
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
    const G = {
      v: VERSIONE, id: 'p' + Date.now().toString(36), scenario: scenId, nome: nome || 'Nuova Compagnia', codice: (codice || 'NC').toUpperCase().slice(0, 2),
      inizio: S.inizio, ora: S.inizio, cassa: S.cassa || 0, debiti: [], reputazione: 50, morale: 65, stipendio: 1, servizio: 'standard', carburante: 0.8,
      basi: [], hub: [], slot: {}, aerei: [], rotte: {}, personale: {}, formazione: [], voli: [], registro: [], storico: [], oggi: nuovoGiorno(),
      notizie: [], eventi: [], rivali: D.RIVALI.map(r => ({ id: r.id, nome: r.nome, colore: r.colore, hub: r.hub, rep: r.rep, prezzo: r.prezzo, rotte: Object.fromEntries(Object.entries(r.rotte).map(([k, f]) => [k, { freq: f, prezzo: r.prezzo }])) })),
      traguardi: {}, stat: { pax: 0, voli: 0, utile: 0 }, mercato: [], numeri: {}, campagne: [], seq: 1, seqMarche: 0, seqVolo: 101, fallimento: 0, esito: null, genFino: 0, giorniUtile: 0
    };
    if (S.preset === 'crisi') presetCrisi(G);
    else {
      const b = S.base || base || 'BRI';
      G.basi.push(b); if (AP[b].slot) G.slot[b] = (S.slot && S.slot[b]) || 8;
      for (const [mod, modo] of S.flotta) aggiungiAereo(G, mod, modo, b);
      G.personale[b] = JSON.parse(JSON.stringify(S.personale));
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
    const apri = (a, b) => { const k = chiave(a, b); if (!G.rotte[k]) { const ref = prezzoRif(km(a, b)); G.rotte[k] = { aperta: G.ora - 400 * GIORNO, pY: Math.round(ref * 0.85), pW: Math.round(ref * CLS.W.mult * 0.85), pJ: Math.round(ref * CLS.J.mult * 0.85) }; } };
    const piani = [
      ['A320', 'leasing', [['06:30', ['FCO', 'LIN', 'FCO', 'CDG', 'FCO']]]],
      ['A320', 'proprieta', [['07:10', ['FCO', 'CTA', 'FCO', 'BCN', 'FCO']]]],
      ['A320', 'leasing', [['06:50', ['MXP', 'NAP', 'MXP', 'FCO']], ['07:00', ['FCO', 'CTA', 'FCO', 'MXP']]]],
      ['A321', 'leasing', [['07:45', ['FCO', 'LHR', 'FCO', 'PMO', 'FCO']]]],
      ['A319', 'proprieta', [['07:30', ['FCO', 'AMS', 'FCO', 'CAG', 'FCO']]]],
      ['ATR72', 'leasing', [['07:00', ['FCO', 'BRI', 'FCO', 'VCE', 'FCO']]]],
      ['A320', 'proprieta', [['08:00', ['FCO', 'TRN', 'FCO', 'PMO', 'FCO']]]]
    ];
    for (const [mod, modo, giorni] of piani) {
      const base = giorni[0][1][0];
      const ae = aggiungiAereo(G, mod, modo, base, { eta: 6 + Math.floor(rnd() * 10), ore: 15000 + rnd() * 15000, oreDaCheck: 200 + rnd() * 350, cab: cabinaStandard(mod, 'mista') });
      if (modo === 'proprieta') ae.valore = MOD[mod].prezzo * 0.55;
      ae.prog = { turn: 40, ancora: mezzanotte(G.ora), giorni: giorni.map(([inizio, scali]) => ({ inizio, scali })) };
      for (const g of giorni) for (let i = 0; i < g[1].length - 1; i++) apri(g[1][i], g[1][i + 1]);
    }
    G.aerei[6].autoCheck = false; G.aerei[6].oreDaCheck = 640;
    for (const [i, n] of Object.entries(partenzePerScalo(G))) if (AP[i].slot) G.slot[i] = n + 1;
    for (const [b, need] of Object.entries(fabbisogno(G))) G.personale[b] = { CMD: { ...need.CMD }, FO: { ...need.FO }, CC: need.CC, ADV: need.ADV };
    G.debiti.push({ id: 'd' + (G.seq++), capitale: 30e6, tasso: 0.085, rata: Math.round(30e6 / (8 * 365)) });
  }
  // Converte i salvataggi della versione 1 (una giornata per aereo, cabine a due classi, personale unico)
  function migra(G) {
    G.campagne ||= [];
    if (G.oggi && G.oggi.costi && G.oggi.costi.marketing == null) G.oggi.costi.marketing = 0;
    if (G.v >= VERSIONE) return G;
    const oggi = mezzanotte(G.ora), b0 = G.basi[0], vecchio = G.personale || {};
    G.hub ||= []; G.numeri ||= {}; G.seqVolo = Math.max(G.seqVolo || 0, 101);
    G.personale = { [b0]: { CMD: vecchio.CMD || {}, FO: vecchio.FO || {}, CC: vecchio.CC || 0, ADV: vecchio.ADV || 0 } };
    for (const b of G.basi) squadra(G, b);
    for (const f of G.formazione) f.base ||= b0;
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
    G.voli = []; G.genFino = 0;
    for (let i = 0; i <= 2; i++) generaGiorno(G, giornoDopo(oggi, i));
    G.v = VERSIONE; vendite(G);
    notizia(G, 'Partita aggiornata: cabine a tre classi, cicli su più giorni, equipaggi per base e hub.', 'info');
    return G;
  }

  /* ---------- Avanzamento del tempo ---------- */
  function avanza(G, dt) {
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
      G.rotte[k] = { aperta: G.ora, pY: ref, pW: Math.round(ref * CLS.W.mult), pJ: Math.round(ref * CLS.J.mult) };
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
      notizia(G, `${ae.marche}: riconfigurazione cabina dalle ${oraDaMin((inizio - mezzanotte(inizio)) / MIN)}, 3 giorni di fermo, ${eur(costo)}.`, 'info');
      return ok('Lavori programmati: l’aereo resta a terra 3 giorni');
    },
    vendi(G, id) {
      const ae = G.aerei.find(a => a.id === id); if (!ae) return err('Aereo inesistente');
      if (ae.inVolo) return err('L’aereo è in volo: riprova quando è a terra');
      const incasso = ae.modo === 'proprieta' ? Math.round(ae.valore * 0.92) : -ae.leasing * 60;
      G.cassa += incasso; if (incasso < 0) G.oggi.costi.altro -= incasso;
      G.voli = G.voli.filter(v => !(v.ae === id && v.stato === 'prog'));
      G.aerei = G.aerei.filter(a => a !== ae); G._fab = null;
      notizia(G, ae.modo === 'proprieta' ? `${ae.marche} venduto per ${eur(incasso)}.` : `${ae.marche} restituito al locatore (penale ${eur(-incasso)}).`, 'info');
      return ok('Fatto');
    },
    apriBase(G, i) {
      if (G.basi.includes(i)) return err('È già una base');
      const costo = AP[i].slot ? 500000 : 300000; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo); G.basi.push(i); squadra(G, i); if (AP[i].slot) G.slot[i] = (G.slot[i] || 0) + 4;
      notizia(G, `Aperta la base di ${AP[i].citta} (${eur(costo)}): gli aerei possono pernottarci e puoi assumerci equipaggi.`, 'buona'); return ok('Base aperta');
    },
    chiudiBase(G, i) {
      if (G.basi.length < 2) return err('Serve almeno una base');
      if (G.aerei.some(a => a.stato !== 'venduto' && a.prog.giorni.some(g => g.scali[0] === i))) return err('Qualche aereo pernotta ancora in questa base');
      if (G.aerei.some(a => a.stato !== 'venduto' && a.prog.giorni.some(g => turniGiorno(G, legsGiorno(a, g, a.prog.turn)).turni.some(t => t.base === i)))) return err('Qualche turno di equipaggio parte ancora da questa base');
      const P = squadra(G, i), n = P.CC + P.ADV + Object.values(P.CMD).reduce((s, x) => s + x, 0) + Object.values(P.FO).reduce((s, x) => s + x, 0);
      if (n) return err('Trasferisci o licenzia prima il personale della base');
      G.basi = G.basi.filter(b => b !== i); G.hub = G.hub.filter(b => b !== i); delete G.personale[i]; return ok('Base chiusa');
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
    assumi(G, base, ruolo, tipo, n) {
      if (!G.basi.includes(base)) return err('Si assume solo nelle basi');
      const pilota = D.RUOLI[ruolo].pilota, costo = (pilota ? 12000 : 1500) * n; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo); G.formazione.push({ base, ruolo, tipo: pilota ? tipo : null, n, fine: G.ora + (pilota ? 10 : 3) * GIORNO });
      return ok(`Assunti ${n} a ${base}: in servizio tra ${pilota ? 10 : 3} giorni`);
    },
    licenzia(G, base, ruolo, tipo, n) {
      const P = squadra(G, base), ha = D.RUOLI[ruolo].pilota ? (P[ruolo][tipo] || 0) : P[ruolo];
      n = Math.min(n, ha); if (!n) return err('Nessuno da licenziare');
      const costo = n * D.RUOLI[ruolo].paga * 60; paga(G, costo);
      if (D.RUOLI[ruolo].pilota) P[ruolo][tipo] -= n; else P[ruolo] -= n;
      G.morale = Math.max(0, G.morale - 2 * n); G._fab = null; return ok(`Licenziati ${n} (buonuscita ${eur(costo)})`);
    },
    trasferisciPersonale(G, da, a, ruolo, tipo, n) {
      const P = squadra(G, da), pil = D.RUOLI[ruolo].pilota, ha = pil ? (P[ruolo][tipo] || 0) : P[ruolo];
      n = Math.min(n, ha); if (!n || da === a) return err('Nessuno da trasferire');
      const costo = 3000 * n; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo); if (pil) P[ruolo][tipo] -= n; else P[ruolo] -= n; G._fab = null;
      G.formazione.push({ base: a, ruolo, tipo: pil ? tipo : null, n, fine: G.ora + 5 * GIORNO, trasf: true });
      return ok(`${n} trasferiti da ${da} a ${a}: operativi tra 5 giorni`);
    },
    riqualifica(G, base, ruolo, da, a, n) {
      const P = squadra(G, base); n = Math.min(n, P[ruolo][da] || 0); if (!n) return err('Nessun pilota disponibile');
      const costo = 35000 * n; if (G.cassa < costo) return err(`Servono ${eur(costo)}`);
      paga(G, costo); P[ruolo][da] -= n; G._fab = null;
      G.formazione.push({ base, ruolo, tipo: a, n, fine: G.ora + 30 * GIORNO, riq: true });
      return ok(`${n} piloti in riqualifica su ${a} per 30 giorni`);
    },
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

  return { VERSIONE, MIN, ORA, GIORNO, CL, AP, MOD, CLS, km, durata, prezzoRif, chiave, chiaveCitta, dataDi, mezzanotte, tsDi, giornoDopo, minDaOra, oraDaMin, zero, somma, posti, cabMin, spazioUsato, cabinaStandard, validaCabina, quoteClassi, prezziRotta, legsGiorno, turniGiorno, tratteDi, indiceCiclo, mediaCiclo, validaProgramma, salvaProgramma, partenzePerScalo, nuovaPartita, migra, avanza, analisiMercato, domandaClassi, spinta, stimaMarketing, rivaliSu, coincidenze, fabbisogno, copertura, squadra, costiFissi, valoreCompagnia, debitoTot, obiettivi, pianificaCheck, totPersonale, vendite, venduti, rotteInEsercizio, A, eur };
})();
if (typeof module !== 'undefined') module.exports = SIM;
