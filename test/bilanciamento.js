// AvioGest — prova automatica del bilanciamento.
// Uso: node test/bilanciamento.js   (circa 2-4 minuti)
// Simula gli scenari principali e controlla che i risultati restino in intervalli sensati.
const SIM = require('../public/sim.js'), eur = SIM.eur;
const esiti = [];
function media(G, n, k) { const u = G.storico.slice(-n); return u.reduce((s, x) => s + (x[k] || 0), 0) / Math.max(1, u.length); }
function riempimento(G, n) { const u = G.storico.slice(-n), p = u.reduce((s, x) => s + x.posti, 0); return p ? u.reduce((s, x) => s + x.pax, 0) / p : 0; }
function controlla(nome, valore, min, max, fmt = v => v) {
  const ok = valore >= min && valore <= max;
  esiti.push(ok);
  console.log(`${ok ? 'OK  ' : 'NO  '} ${nome.padEnd(48)} ${String(fmt(valore)).padStart(14)}   atteso ${fmt(min)} … ${fmt(max)}`);
}
const consiglia = G => { for (const c of SIM.consigli(G)) for (const a of c.azioni) if (a.az === 'ritocca' || a.az === 'anticipaFormazione') SIM.A[a.az](G, ...a.args); };
const giorni = (G, n, passo = 3, f) => { for (let i = 0; i < n / passo; i++) { SIM.avanza(G, passo * SIM.GIORNO); if (f) f(G); } };

// 1. Primo decollo: rotazione guidata sulla destinazione consigliata, poi i consigli sui prezzi
let G = SIM.nuovaPartita('primo', { nome: 'Test', codice: 'TT', base: 'BRI' });
let pr = SIM.proposteDestinazioni(G, 1);
SIM.A.applicaRotazione(G, G.aerei[0].id, SIM.rotazioneGuidata(G, G.aerei[0].id, { tipo: 'navetta', dest: [pr[0].a] }));
giorni(G, 90, 3, consiglia);
controlla('Primo decollo: utile al giorno (90 gg)', media(G, 30, 'utile'), 5000, 120000, eur);
controlla('Primo decollo: riempimento', riempimento(G, 30), 0.65, 0.98, v => Math.round(v * 100) + '%');

// 2. Compagnia in crisi senza fare nulla: deve fallire
G = SIM.nuovaPartita('crisi', { nome: 'Test', codice: 'TT' });
giorni(G, 70, 7);
controlla('Crisi senza interventi: fallisce (1 = sì)', G.esito && G.esito.tipo === 'fallimento' ? 1 : 0, 1, 1);

// 3. Compagnia in crisi gestita: prezzi +25%, equipaggi, ispezioni
// il giocatore decide le emergenze con la prima opzione (la più prudente); media di due partite con numeri casuali fissi
const decidi = G => { if (G.emergenza) SIM.A.emergenza(G, 0); if (G.dilemma) SIM.A.dilemma(G, G.dilemma.opzioni.length - 1); };
const crisiGestita = seme => { const g = SIM.nuovaPartita('crisi', { nome: 'Test', codice: 'TT' }); SIM.impostaRnd(SIM.generatoreSeme(seme));
  for (const k in g.rotte) { const r = g.rotte[k]; SIM.A.prezzi(g, k, { pY: r.pY * 1.25, pW: r.pW * 1.25, pJ: r.pJ * 1.25 }); }
  g.stipendio = 1.05; for (const a of g.aerei) a.autoCheck = true; SIM.A.assumiMancanti(g, true);
  giorni(g, 120, 1, decidi); return g; };
const c1 = crisiGestita(2027), c2 = crisiGestita(4242);
controlla('Crisi gestita: utile al giorno (120 gg, media di 2)', (media(c1, 30, 'utile') + media(c2, 30, 'utile')) / 2, 5000, 150000, eur);
controlla('Crisi gestita: non fallisce (1 = sì)', [c1, c2].some(g => g.esito && g.esito.tipo === 'fallimento') ? 0 : 1, 1, 1);

// 4. Partita libera: stima delle proposte contro il risultato reale
G = SIM.nuovaPartita('libera', { nome: 'Test', codice: 'TT', base: 'LIN' });
pr = SIM.proposteDestinazioni(G, 1);
SIM.A.applicaRotazione(G, G.aerei[0].id, SIM.rotazioneGuidata(G, G.aerei[0].id, { tipo: 'navetta', dest: [pr[0].a], giri: pr[0].giri }));
SIM.avanza(G, 70 * SIM.GIORNO);
const k = SIM.chiave(pr[0].da, pr[0].a), S = SIM.statRecenti(G, 14).rotte[k], reale = S ? (S.ricavi - S.costi) / S.giorni : 0;
controlla('Libera: margine reale / stima della proposta', reale / pr[0].utile, 0.6, 1.4, v => v.toFixed(2));

// 5. Prezzo migliore: con +30% deve rendere più che al prezzo di riferimento e meno che al doppio
// stessi numeri casuali per ogni prezzo: così cambia solo il prezzo, non gli imprevisti
const prova = (f, seme = 12345) => { const g = SIM.nuovaPartita('libera', { nome: 'T', codice: 'TT', base: 'LIN' }); g.id = 'fisso'; SIM.impostaRnd(SIM.generatoreSeme(seme));
  ['ATH', 'MAD'].forEach((d, i) => SIM.A.applicaRotazione(g, g.aerei[i].id, SIM.rotazioneGuidata(g, g.aerei[i].id, { tipo: 'navetta', dest: [d], giri: 2 })));
  for (const x in g.rotte) { const r = g.rotte[x]; SIM.A.prezzi(g, x, { pY: r.pY * f, pW: r.pW * f, pJ: r.pJ * f }); }
  SIM.avanza(g, 50 * SIM.GIORNO); return [media(g, 15, 'utile'), riempimento(g, 15)]; };
// media di due partite per ogni prezzo: gli eventi casuali (guasti, meteo) pesano molto su 50 giorni
const due = f => { const a = prova(f, 12345), b = prova(f, 777); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
const [u1, lf1] = due(1), [u13] = due(1.3), [u2, lf2] = due(2);
controlla('Prezzi ×1,3 rendono più che ×1', u13 / Math.max(1, u1), 1.05, 3, v => v.toFixed(2));
controlla('Prezzi ×2 non rendono molto più di ×1,3', u2 / Math.max(1, u13), 0, 1.15, v => v.toFixed(2));
controlla('Riempimento a prezzi ×2', lf2, 0.2, 0.8, v => Math.round(v * 100) + '%');

const falliti = esiti.filter(x => !x).length;
console.log(falliti ? `\n${falliti} controlli fuori intervallo su ${esiti.length}` : `\nTutti i ${esiti.length} controlli sono nella norma`);
process.exitCode = falliti ? 1 : 0;
