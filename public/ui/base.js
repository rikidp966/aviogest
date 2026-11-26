'use strict';
/* AvioGest — interfaccia di gioco (v2: cabine a tre classi, cicli su più giorni, equipaggi per base, hub) */
const { MIN, ORA, GIORNO, AP, MOD, CL, CLS } = SIM;
const D = DATI;
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = SIM.eur;
const num = (n, d = 0) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: d }).format(n || 0);
const pct = x => x == null || isNaN(x) || !isFinite(x) ? '—' : Math.round(x * 100) + '%';
const mln = n => Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' M€' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'k €' : eur(n);
const pad = n => String(n).padStart(2, '0');
const fmtOra = t => SIM.oraIn(t);
const fmtData = t => SIM.loc(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtGiorno = t => SIM.loc(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fusoTxt = f => 'UTC' + (f >= 0 ? '+' : '−') + String(Math.abs(f)).replace('.5', ':30');
// orario nell'ora locale di un aeroporto, mostrato solo se il fuso è diverso da quello della base
const locale = (t, i) => AP[i].fuso !== G.fuso ? ` <span class="muto piccolo">(${SIM.oraLocaleT(t, i)} a ${i})</span>` : '';
const oraMin = m => SIM.oraDaMin(m) + (m >= 1440 ? '<sup>+1</sup>' : '');
const localeMin = (m, i) => AP[i].fuso !== G.fuso ? ` <span class="muto">(${SIM.oraDaMin(SIM.oraLocaleMin(m, i))} locali)</span>` : '';
const fmtDur = m => `${Math.floor(m / 60)}h${pad(Math.round(m % 60))}`;
const citta = i => AP[i]?.citta || i;
const somma = SIM.somma;
const cabTesto = c => CL.filter(x => c[x]).map(x => `${c[x]}${x}`).join(' · ');
const chipCab = (c, venduti) => CL.filter(x => c[x]).map(x => `<span class="chip"><i style="background:var(--cl-${x})"></i>${CLS[x].breve} ${venduti ? `${venduti[x]}/` : ''}${c[x]}</span>`).join('');

let G = null, vel = 0, pagina = 'panoramica', bozza = null;
const VEL = [0, 10 * MIN, ORA, 4 * ORA];
const UI = { voliTab: 'oggi', mercatoTab: 'nuovi', ricaviPer: 7, aeroQ: '', aereoSel: null, suoni: true, pausaAuto: true, scenarioSel: 'primo', classeAnalisi: 'Y' };
try { Object.assign(UI, JSON.parse(localStorage.getItem('aviogest-opz') || '{}')); } catch { }
const salvaOpz = () => { try { localStorage.setItem('aviogest-opz', JSON.stringify({ suoni: UI.suoni, pausaAuto: UI.pausaAuto })); } catch { } };

/* ---------- Utilità di interfaccia ---------- */
function toast(msg, tipo = '') {
  const t = document.createElement('div'); t.className = 'toast ' + tipo; t.textContent = msg;
  $('#toast').appendChild(t); while ($('#toast').children.length > 4) $('#toast').firstChild.remove();
  setTimeout(() => t.remove(), tipo === 'err' ? 5000 : 4200);
}
function esito(r) { if (r?.errore) { toast(r.errore, 'err'); suono('cattiva'); return false; } if (r?.msg) toast(r.msg, 'buona'); suono('click'); return true; }
function modale({ titolo, corpo, piede = '', larga = false }) {
  const m = $('#modale');
  m.innerHTML = `<div class="finestra ${larga ? 'larga' : ''}"><header><h3>${titolo}</h3><button type="button" class="chiudi" data-az="chiudi" aria-label="Chiudi">×</button></header><div class="corpo">${corpo}</div>${piede ? `<footer>${piede}</footer>` : ''}</div>`;
  m.hidden = false;
}
function chiudiModale() { $('#modale').hidden = true; $('#modale').innerHTML = ''; }
let CONFERMA = null;
function conferma(titolo, testo, etichetta, azione) {
  CONFERMA = azione;
  modale({ titolo, corpo: `<p>${testo}</p>`, piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma">${etichetta}</button>` });
}
function barretta(x, testo, soglie = [0.9, 1]) {
  const w = Math.max(0, Math.min(1, x || 0)) * 100, cls = x > soglie[1] ? 'oltre' : x >= soglie[0] ? 'alto' : '';
  return `<div class="barretta"><div class="traccia"><div class="riemp ${cls}" style="width:${w}%"></div></div><small>${testo ?? pct(x)}</small></div>`;
}
const opzioni = (lista, sel) => lista.map(([v, t]) => `<option value="${h(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${h(t)}</option>`).join('');
const segno = n => `<span class="${n < 0 ? 'neg' : ''}">${eur(n)}</span>`;

let actx = null;
function suono(tipo) {
  if (!UI.suoni) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const note = { buona: [660, 880], cattiva: [300, 220], evento: [740], click: [520] }[tipo] || [600];
    note.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(tipo === 'click' ? 0.03 : 0.08, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 0.3);
    });
  } catch { }
}

/* ---------- Statistiche ---------- */
function statsRotta(k, giorni = 7) {
  const s = { voli: 0, pax: 0, posti: 0, ricavi: 0, costi: 0, canc: 0, transito: 0, paxC: SIM.zero(), ricaviC: SIM.zero(), postiC: SIM.zero() };
  for (const x of G.storico.slice(-giorni)) {
    const r = x.rotte?.[k]; if (!r) continue;
    for (const c of ['voli', 'pax', 'posti', 'ricavi', 'costi', 'canc', 'transito']) s[c] += r[c] || 0;
    for (const c of CL) for (const m of ['paxC', 'ricaviC', 'postiC']) s[m][c] += r[m]?.[c] || 0;
  }
  return s;
}
function statsAereo(id, giorni = 7) {
  const s = { ore: 0, ricavi: 0, costi: 0 };
  for (const x of G.storico.slice(-giorni)) { const r = x.aerei?.[id]; if (r) for (const c in s) s[c] += r[c]; }
  return s;
}
function ultimi(giorni) {
  const s = G.storico.slice(-giorni), S = k => s.reduce((a, x) => a + (x[k] || 0), 0), C = k => { const o = SIM.zero(); for (const x of s) for (const c of CL) o[c] += x[k]?.[c] || 0; return o; };
  return { n: s.length, voli: S('voli'), canc: S('canc'), pax: S('pax'), posti: S('posti'), puntuali: S('puntuali'), ricavi: S('ricavi'), costi: S('costi'), utile: S('utile'), transito: S('transito'), ricaviTransito: S('ricaviTransito'), paxC: C('paxC'), ricaviC: C('ricaviC') };
}
const flotta = () => G.aerei.filter(a => a.stato !== 'venduto');
const oreGiorno = ae => SIM.mediaCiclo(ae).ore;
// Voli al giorno (media sul ciclo) su una rotta, entrambe le direzioni
const freqRotta = k => G.aerei.reduce((n, ae) => n + SIM.mediaCiclo(ae).tratte.filter(l => SIM.chiave(l.da, l.a) === k).reduce((s, l) => s + l.peso, 0), 0);
// Posti medi al giorno per classe in una direzione
function postiDirezione(a, b) {
  const p = SIM.zero(); let voli = 0;
  for (const ae of flotta()) for (const l of SIM.mediaCiclo(ae).tratte) if (l.da === a && l.a === b) { voli += l.peso; for (const c of CL) p[c] += ae.cab[c] * l.peso; }
  return { p, voli };
}
