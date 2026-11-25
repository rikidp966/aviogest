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

/* ---------- Mappa ---------- */
// Punto a frazione f lungo la rotta più breve tra due aeroporti (interpolazione sferica)
function puntoArco(A, B, f) {
  const r = Math.PI / 180, la1 = A.lat * r, lo1 = A.lon * r, la2 = B.lat * r, lo2 = B.lon * r;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d < 1e-9) return [A.lat, A.lon];
  const a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(la1) * Math.cos(lo1) + b * Math.cos(la2) * Math.cos(lo2), y = a * Math.cos(la1) * Math.sin(lo1) + b * Math.cos(la2) * Math.sin(lo2), z = a * Math.sin(la1) + b * Math.sin(la2);
  return [Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r];
}
// Arco come lista di punti, con le longitudini "srotolate" per non attraversare la mappa quando passa la linea del cambio di data
function arco(A, B) {
  const n = Math.max(2, Math.ceil(SIM.km(A.iata, B.iata) / 300)), pts = [];
  for (let i = 0; i <= n; i++) { const p = puntoArco(A, B, i / n); if (pts.length) { const prev = pts.at(-1)[1]; while (p[1] - prev > 180) p[1] -= 360; while (p[1] - prev < -180) p[1] += 360; } pts.push(p); }
  return pts;
}
const AEREO_PATH = 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z';
const Mappa = {
  map: null, el: null, marker: {},
  init() {
    if (!window.L) return false;
    this.el = document.createElement('div'); this.el.className = 'mappa';
    this.map = L.map(this.el, { zoomSnap: 0.5, worldCopyJump: true }).setView([30, 10], 3);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { minZoom: 2, maxZoom: 9, attribution: '© OpenStreetMap' }).addTo(this.map);
    this.lRotte = L.layerGroup().addTo(this.map); this.lScali = L.layerGroup().addTo(this.map); this.lAerei = L.layerGroup().addTo(this.map);
    return true;
  },
  monta(posto) {
    if (!posto) return;
    if (!this.map && !this.init()) { posto.innerHTML = '<p class="vuoto">Mappa non disponibile: serve la connessione a internet.</p>'; return; }
    posto.appendChild(this.el);
    this.disegnaRete(); this.aggiorna();
    setTimeout(() => {
      this.map.invalidateSize();
      if (!this.inquadrata) {
        const pts = [...new Set([...G.basi, ...Object.keys(G.rotte).flatMap(k => k.split('-'))])].map(i => [AP[i].lat, AP[i].lon]);
        if (pts.length > 1) this.map.fitBounds(pts, { padding: [40, 40], maxZoom: 7 }); else if (pts.length) this.map.setView(pts[0], 5);
        this.inquadrata = true;
      }
    }, 0);
  },
  reset() { this.inquadrata = false; if (this.map) { this.lAerei.clearLayers(); this.marker = {}; } },
  disegnaRete() {
    if (!this.map || !G) return;
    this.lRotte.clearLayers(); this.lScali.clearLayers();
    const serviti = new Set(G.basi), attive = SIM.rotteInEsercizio(G);
    for (const k of Object.keys(G.rotte)) {
      const [a, b] = k.split('-'); serviti.add(a); serviti.add(b);
      const on = attive.has(k);
      L.polyline(arco(AP[a], AP[b]), { color: '#2a78d6', weight: on ? 2.5 : 1.5, opacity: on ? 0.7 : 0.35, dashArray: on ? null : '5 6' }).addTo(this.lRotte);
    }
    for (const i of serviti) {
      const base = G.basi.includes(i), hub = G.hub.includes(i);
      if (hub) L.circleMarker([AP[i].lat, AP[i].lon], { radius: 13, color: '#c98500', weight: 3, fill: false }).addTo(this.lScali);
      L.circleMarker([AP[i].lat, AP[i].lon], { radius: base ? 7 : 4.5, color: '#fff', weight: 2, fillColor: base ? '#2a78d6' : '#12213a', fillOpacity: 1 })
        .bindTooltip(`<b>${i}</b> · ${h(AP[i].nome)}${hub ? '<br>Hub' : base ? '<br>Base' : ''}`).on('click', e => e.target.openTooltip()).addTo(this.lScali);
    }
  },
  aggiorna() {
    if (!this.map || !this.el.isConnected) return;
    const vivi = new Set();
    flotta().forEach((ae, idx) => {
      if (ae.stato === 'consegna') return;
      vivi.add(ae.id);
      const v = ae.inVolo && G.voli.find(x => x.id === ae.inVolo);
      let lat, lon, rot = 0, colore = '#7b8494', desc;
      if (v && v.stato === 'volo') {
        const A = AP[v.da], B = AP[v.a], f = Math.max(0, Math.min(1, (G.ora - v.depEff) / (v.arrEff - v.depEff)));
        [lat, lon] = puntoArco(A, B, f); const [la2, lo2] = puntoArco(A, B, Math.min(1, f + 0.01));
        rot = Math.atan2((lo2 - lon) * Math.cos(lat * Math.PI / 180), la2 - lat) * 180 / Math.PI;
        colore = '#2a78d6'; desc = `<b>${ae.marche}</b> · volo ${v.num}<br>${v.da} → ${v.a} · arrivo ${fmtOra(v.arrEff)}<br>${SIM.venduti(v)}/${SIM.posti(ae)} passeggeri${somma(v.t) ? ` (${somma(v.t)} in coincidenza)` : ''}`;
      } else {
        const p = AP[v && v.stato === 'rit' ? v.da : ae.pos] || AP[ae.base];
        lat = p.lat + Math.sin(idx * 2.4) * 0.12; lon = p.lon + Math.cos(idx * 2.4) * 0.12; rot = (idx * 47) % 360;
        if (ae.stato === 'guasto') colore = '#d93b30'; else if (ae.stato === 'manutenzione') colore = '#c98500';
        desc = `<b>${ae.marche}</b> · a terra a ${p.iata}<br>${statoAereo(ae).t}${v && v.stato === 'rit' ? ` · volo ${v.num} in ritardo` : ''}`;
      }
      let m = this.marker[ae.id];
      if (!m) m = this.marker[ae.id] = L.marker([lat, lon], { icon: L.divIcon({ className: 'aereo-icona', html: `<svg viewBox="0 0 24 24"><path d="${AEREO_PATH}"/></svg>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 500 }).bindTooltip('').on('click', e => e.target.openTooltip()).addTo(this.lAerei);
      m.setLatLng([lat, lon]); m.setTooltipContent(desc);
      const svg = m.getElement()?.querySelector('svg');
      if (svg) { svg.style.transform = `rotate(${rot}deg)`; svg.querySelector('path').setAttribute('fill', colore); }
    });
    for (const id in this.marker) if (!vivi.has(id)) { this.marker[id].remove(); delete this.marker[id]; }
  }
};
function statoAereo(ae) {
  if (ae.stato === 'consegna') return { t: `In consegna (${Math.ceil((ae.fino - G.ora) / GIORNO)} gg)`, c: 'b-info' };
  if (ae.stato === 'manutenzione') return { t: ae.lavori?.tipo === 'cabina' ? 'Rifacimento cabina' : 'In manutenzione', c: 'b-warn' };
  if (ae.stato === 'guasto') return { t: 'Fermo per guasto', c: 'b-err' };
  if (ae.oreDaCheck > 700) return { t: 'Ispezione scaduta', c: 'b-err' };
  const v = ae.inVolo && G.voli.find(x => x.id === ae.inVolo);
  if (v && v.stato === 'volo') return { t: `In volo ${v.da}→${v.a}`, c: 'b-info' };
  return { t: `Operativo · a ${ae.pos}`, c: 'b-ok' };
}

/* ---------- Grafici ---------- */
function passoBello(x) { const p = 10 ** Math.floor(Math.log10(x || 1)), n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function etichetteX(dati, i, x, H) { return i % Math.ceil(dati.length / 8) === 0 ? `<text class="asse" x="${x}" y="${H - 6}" text-anchor="middle">${SIM.loc(dati[i].t).getUTCDate()}/${SIM.loc(dati[i].t).getUTCMonth() + 1}</text>` : ''; }
function graficoUtile(dati) {
  const W = 640, H = 220, ml = 56, mr = 6, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  const max = Math.max(1, ...dati.map(d => Math.abs(d.v))), passo = passoBello(max / 2);
  const top = Math.ceil(Math.max(0, ...dati.map(d => d.v)) / passo) * passo || passo, bot = Math.ceil(Math.max(0, ...dati.map(d => -d.v)) / passo) * passo;
  const y = v => mt + (top - v) / (top + bot) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Utile giornaliero">`;
  for (let v = -bot; v <= top + 1e-6; v += passo) s += `<line class="${v === 0 ? 'zero' : 'griglia-l'}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${mln(v)}</text>`;
  const col = iw / dati.length, bw = Math.max(2, Math.min(18, col - 2));
  dati.forEach((d, i) => {
    const x = ml + i * col + (col - bw) / 2, y0 = y(0), y1 = y(d.v), alto = Math.abs(y1 - y0), r = Math.min(3, alto, bw / 2);
    const path = !alto ? '' : d.v > 0 ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z` : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 - r} V${y0} Z`;
    s += `<g data-tip="${h(`${fmtGiorno(d.t)}: ${d.v >= 0 ? 'utile' : 'perdita'} ${eur(d.v)} · ricavi ${eur(d.r)} · costi ${eur(d.c)}`)}"><rect class="bersaglio" x="${ml + i * col}" y="${mt}" width="${col}" height="${ih}"/>${path ? `<path class="${d.v >= 0 ? 'pos-b' : 'neg-b'}" d="${path}"/>` : ''}</g>${etichetteX(dati, i, x + bw / 2, H)}`;
  });
  return `<div class="legenda"><span><i style="background:var(--series-1)"></i>Utile</span><span><i style="background:var(--div-neg)"></i>Perdita</span></div><div class="grafico">${s}</svg></div>`;
}
function graficoLinea(dati) {
  const W = 640, H = 200, ml = 56, mr = 6, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  const vals = dati.map(d => d.v), mn = Math.min(0, ...vals), mx = Math.max(1, ...vals), passo = passoBello((mx - mn) / 4);
  const lo = Math.floor(mn / passo) * passo, hi = Math.ceil(mx / passo) * passo;
  const x = i => ml + (dati.length < 2 ? iw / 2 : i / (dati.length - 1) * iw), y = v => mt + (hi - v) / (hi - lo) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cassa">`;
  for (let v = lo; v <= hi + 1e-6; v += passo) s += `<line class="${v === 0 ? 'zero' : 'griglia-l'}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${mln(v)}</text>`;
  const pts = dati.map((d, i) => `${x(i)},${y(d.v)}`).join(' ');
  if (dati.length > 1) s += `<polygon class="area" points="${x(0)},${y(lo)} ${pts} ${x(dati.length - 1)},${y(lo)}"/><polyline class="linea" points="${pts}"/>`;
  const col = iw / Math.max(1, dati.length);
  dati.forEach((d, i) => { s += `<g data-tip="${h(`${fmtGiorno(d.t)}: ${eur(d.v)}`)}"><rect class="bersaglio" x="${x(i) - col / 2}" y="${mt}" width="${col}" height="${ih}"/><circle class="punto" cx="${x(i)}" cy="${y(d.v)}" r="4"/></g>${etichetteX(dati, i, x(i), H)}`; });
  return `<div class="grafico">${s}</svg></div>`;
}
// Barre impilate dei ricavi per classe (ordine fisso Business, Premium, Economy; 2 px di stacco tra i segmenti)
function graficoClassi(dati) {
  const W = 640, H = 220, ml = 56, mr = 6, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  const max = Math.max(1, ...dati.map(d => somma(d.c))), passo = passoBello(max / 4), top = Math.ceil(max / passo) * passo;
  const y = v => mt + (top - v) / top * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ricavi per classe">`;
  for (let v = 0; v <= top + 1e-6; v += passo) s += `<line class="${v === 0 ? 'zero' : 'griglia-l'}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${mln(v)}</text>`;
  const col = iw / dati.length, bw = Math.max(3, Math.min(22, col - 2));
  dati.forEach((d, i) => {
    const x = ml + i * col + (col - bw) / 2; let base = 0, seg = '';
    const ordine = ['Y', 'W', 'J']; // dal basso: Economy, Premium, Business
    ordine.forEach((c, k) => {
      const v = d.c[c]; if (v <= 0) return;
      const y1 = y(base + v), y0 = y(base) - (base > 0 ? 2 : 0), alto = Math.max(0, y0 - y1);
      const ultimo = !ordine.slice(k + 1).some(cc => d.c[cc] > 0), r = ultimo ? Math.min(3, alto, bw / 2) : 0;
      seg += `<path class="cl-${c}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z"/>`;
      base += v;
    });
    s += `<g data-tip="${h(`${fmtGiorno(d.t)}: ${eur(somma(d.c))} · Business ${eur(d.c.J)} · Premium ${eur(d.c.W)} · Economy ${eur(d.c.Y)}`)}"><rect class="bersaglio" x="${ml + i * col}" y="${mt}" width="${col}" height="${ih}"/>${seg}</g>${etichetteX(dati, i, x + bw / 2, H)}`;
  });
  return `<div class="legenda">${CL.map(c => `<span><i style="background:var(--cl-${c})"></i>${CLS[c].nome}</span>`).join('')}</div><div class="grafico">${s}</svg></div>`;
}

/* ---------- Elenchi di aeroporti raggruppati per continente ---------- */
const CONTINENTI = ['Europa', 'Nord America', 'Sud America', 'Africa', 'Asia', 'Oceania'];
const perContinente = () => Object.values(AP).sort((a, b) => CONTINENTI.indexOf(a.continente) - CONTINENTI.indexOf(b.continente) || a.nomePaese.localeCompare(b.nomePaese) || a.citta.localeCompare(b.citta));
function opzioniAeroporti(lista, sel, extra = () => '') {
  return CONTINENTI.map(c => { const g = lista.filter(a => a.continente === c); return g.length ? `<optgroup label="${c}">${g.map(a => `<option value="${a.iata}" ${a.iata === sel ? 'selected' : ''}>${h(a.citta)} · ${a.iata} (${h(a.nomePaese)})${extra(a)}</option>`).join('')}</optgroup>` : ''; }).join('');
}

/* ---------- Barra superiore ---------- */
function costruisciCima() {
  $('#cima').innerHTML = `
    <div class="orario"><b id="cOra"></b><small id="cData"></small></div>
    <div class="velocita" role="group" aria-label="Velocità del tempo">${['⏸', '▶', '▶▶', '▶▶▶'].map((s, i) => `<button data-az="vel" data-v="${i}" title="${['Pausa (spazio)', '10 minuti al secondo (1)', '1 ora al secondo (2)', '4 ore al secondo (3)'][i]}">${s}</button>`).join('')}</div>
    <div class="valori">
      <div><small>Cassa</small><b id="cCassa"></b></div>
      <div><small>Utile di ieri</small><b id="cUtile"></b></div>
      <div><small>Reputazione</small><b id="cRep"></b></div>
      <div><small>Cherosene</small><b id="cCarb"></b></div>
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
}

/* ---------- Viste ---------- */
const VISTE = {};
const SCEN = () => D.SCENARI[G.scenario];

VISTE.panoramica = () => `
  <div class="testata"><h1>${h(G.nome)}</h1><span class="sotto">${SCEN().nome} · giorno ${Math.floor((G.ora - G.inizio) / GIORNO) + 1} · basi ${G.basi.join(', ')}${G.hub.length ? ' · hub ' + G.hub.join(', ') : ''}</span></div>
  ${primiPassi()}
  <div class="griglia g-21">
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
    <div class="piccolo">Copertura equipaggi (base più scoperta)</div>${barretta(Math.min(cop.min, 1.5) / 1.5, pct(Math.min(cop.min, 9)), [2, 2])}
    ${cop.min < 1 ? '<p class="piccolo neg">Equipaggi insufficienti in qualche base: rischio cancellazioni. Vedi Personale.</p>' : ''}
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
    [Object.keys(G.rotte).length > 0, 'Apri la prima rotta dalla tua base', '#/rotte'],
    [G.aerei.some(a => a.prog.giorni.some(g => g.scali.length > 1)), 'Crea la rotazione dell’aereo (inizia e finisce in una base)', '#/programmazione'],
    [vel > 0, 'Avvia il tempo con ▶ in alto', null]
  ];
  return `<div class="pannello" style="margin-bottom:16px"><h2>Primi passi</h2><ul class="problemi">${passi.map(([fatto, t, l]) => `<li class="${fatto ? 'ok' : 'avviso'}">${fatto ? '✓' : '○'} ${l && !fatto ? `<a href="${l}">${t}</a>` : t}</li>`).join('')}</ul>
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
      return `<tr><td><b>${h(v.num)}</b></td><td>${v.da} → ${v.a} <span class="muto piccolo">${h(citta(v.da))}–${h(citta(v.a))}</span></td><td>${h(ae?.marche || '—')} <span class="muto piccolo">base ${v.base}${v.fineTurno ? ', rientro' : ''}</span></td>
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
const VOCI = { carburante: 'Carburante', tasse: 'Tasse aeroportuali', handling: 'Assistenza a terra', navigazione: 'Navigazione aerea', manutenzione: 'Manutenzione', servizio: 'Servizio di bordo', rimborsi: 'Rimborsi ai passeggeri', equipaggi: 'Rientro equipaggi fuori base', marketing: 'Marketing e pubblicità', leasing: 'Leasing aerei', personale: 'Stipendi', basi: 'Basi operative', hub: 'Gestione hub', sede: 'Sede e amministrazione', interessi: 'Interessi sui prestiti', assicurazione: 'Assicurazioni', altro: 'Altre spese e investimenti' };
function dettaglioVolo(r) {
  const pc = r.paxC || SIM.zero(), rc = r.ricaviC || SIM.zero(), cab = r.cab || SIM.zero();
  modale({ titolo: `Volo ${h(r.num)} · ${r.da} → ${r.a}`, corpo: `<p>${fmtData(r.dep)} · ${h(r.marche)} · equipaggio di ${h(r.base || '—')} · ${r.stato === 'canc' ? 'cancellato: ' + h(r.motivo) : `partito ${fmtOra(r.depEff)} (ritardo ${r.rit}′), atterrato ${fmtOra(r.arrEff)}`}</p>
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
    <div class="riga" style="margin:0"><span class="titolo" style="color:var(--testo)">${h(ae.marche)}</span><span class="badge ${st.c}">${h(st.t)}</span></div>
    <div class="muto">${m.nome} · ${SIM.posti(ae)} posti</div>
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
      <button class="piccolo primario" data-az="vai-prog" data-id="${ae.id}">Rotazione</button>
      <button class="piccolo" data-az="riconfigura" data-id="${ae.id}" ${ae.lavori ? 'disabled' : ''}>Cabina</button>
      <button class="piccolo" data-az="check" data-id="${ae.id}" ${ae.lavori || ae.stato === 'consegna' ? 'disabled' : ''}>Ispezione stanotte</button>
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
  if (!bozza || bozza.aeId !== ae.id) {
    const giorni = SIM.normalizza(ae.prog).giorni;
    bozza = { aeId: ae.id, turn: ae.prog.turn, giorni, sel: SIM.giornoSett(G.ora), orig: JSON.stringify({ turn: ae.prog.turn, giorni }) };
  }
  return `<div class="testata"><h1>Programmazione</h1><span class="sotto">Ogni aereo ha un programma settimanale, da lunedì a domenica. Notti e soste lunghe solo nelle basi; nessun decollo tra le 00:30 e le 05:30 ora locale. Orari nell’ora di ${h(citta(G.basi[0]))}, tra parentesi l’ora locale.</span></div>
  <div class="prog">
    <div class="lista-aerei">${f.map(a => { const mc = SIM.mediaCiclo(a); return `<button data-az="sel-aereo" data-id="${a.id}" class="${a.id === ae.id ? 'on' : ''}"><span><b class="mono">${h(a.marche)}</b> <span class="muto piccolo">${a.modello}</span></span><span class="piccolo">${mc.tratte.length} voli · ${Math.round(mc.ore * 7)} h</span></button>`; }).join('')}</div>
    <div class="pannello" id="editor">${editor(ae)}</div>
  </div>
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
  const dest = Object.keys(G.rotte).map(k => k.split('-')).filter(p => p.includes(ultimo)).map(p => p[0] === ultimo ? p[1] : p[0]).map(d => ({ d, k: SIM.km(ultimo, d) })).sort((a, b) => a.k - b.k);
  const modificato = JSON.stringify({ turn: bozza.turn, giorni: bozza.giorni }) !== bozza.orig;
  const basiRientro = G.basi.filter(b => b !== ultimo && G.rotte[SIM.chiave(ultimo, b)]);
  const errDi = i => v.E.some(e => e.startsWith(GS[i] + ':'));
  const minimi = SIM.legsGiorno(ae, { ...g, attese: [] }, bozza.turn);
  return `<div class="testata" style="margin-bottom:10px"><h2 style="margin:0"><span class="mono">${h(ae.marche)}</span> · ${m.nome}</h2><span class="sotto">${cabTesto(ae.cab)} · autonomia ${num(m.autonomia)} km</span></div>
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
        <span class="orario-volo">${i === 0 ? `<b class="mono">${oraMin(l.dep)}</b>` : `<input type="time" class="ora-volo" data-leg="${i}" value="${SIM.oraDaMin(l.dep)}" step="300" aria-label="Partenza del volo ${i + 1}">`}<small>${i > 0 ? (extra ? `+${extra} min a terra` : 'al più presto') : 'primo volo'}</small></span>
        <span><b>${l.da} → ${l.a}</b> <span class="muto">${h(citta(l.da))}–${h(citta(l.a))}</span><br><span class="piccolo">${oraMin(l.dep)}${localeMin(l.dep, l.da)} – ${oraMin(l.arr)}${localeMin(l.arr, l.a)} · ${fmtDur(l.dur)} · ${num(SIM.km(l.da, l.a))} km${r ? ` · ${CL.filter(c => ae.cab[c]).map(c => `${CLS[c].breve} ${eur(r['p' + c])}`).join(' · ')}` : ''}${G.hub.includes(l.a) ? ' · <b>arrivo in hub</b>' : ''}</span></span>
        <span>${i === gv.legs.length - 1 ? `<button class="piccolo" data-az="p-togli">Togli</button>` : ''}</span></div>`; }).join('')
      : `<p class="muto">Nessun volo: l’aereo resta a terra a ${g.scali[0]} tutto il giorno.</p>`}</div>
    <div class="filtri mt">
      <select id="pDest">${dest.length ? opzioni(dest.map(x => [x.d, `${x.d} · ${citta(x.d)} · ${num(x.k)} km${x.k > m.autonomia ? ' (fuori autonomia)' : ''}${G.basi.includes(x.d) ? ' · base' : ''}`]), '') : '<option value="">Nessuna rotta aperta da ' + ultimo + '</option>'}</select>
      <button data-az="p-aggiungi" ${dest.length ? '' : 'disabled'}>Aggiungi volo</button>
      ${basiRientro.map(b => `<button data-az="p-rientra" data-b="${b}">Chiudi a ${b}</button>`).join('')}
      ${g.scali.length > 2 && ultimo === g.scali[0] ? `<button data-az="p-ripeti">Ripeti il giro</button>` : ''}
      ${g.scali.length > 1 ? `<button class="pericolo" data-az="p-svuota">Svuota ${nome.toLowerCase()}</button>` : ''}
    </div>
    <div class="copia"><span>Copia ${nome.toLowerCase()} su</span>
      <button class="piccolo" data-az="p-copia" data-dove="succ">${GS[(bozza.sel + 1) % 7].toLowerCase()}</button>
      <button class="piccolo" data-az="p-copia" data-dove="feriali">lun–ven</button>
      <button class="piccolo" data-az="p-copia" data-dove="weekend">sab–dom</button>
      <button class="piccolo" data-az="p-copia" data-dove="tutti">tutta la settimana</button></div>
    ${gv.turni.length ? `<b class="piccolo">Equipaggi di ${nome.toLowerCase()}</b><ul class="turni">${gv.turni.map((t, i) => `<li>Turno ${i + 1}: base <b>${t.base}</b> · servizio dalle ${oraMin(t.legs[0].dep - 60)}, ${fmtDur(t.fine - t.inizio)} (${fmtDur(t.blocco)} di volo)${t.lungo ? ' · <b>lungo raggio, 3 piloti</b>' : ''}${t.albergo ? ' · equipaggio in albergo fuori base' : ''} · ${t.legs.length} voli · ${t.termina === t.base ? 'rientra a casa' : `<span style="color:var(--warn)">finisce a ${t.termina}: albergo o rientro a pagamento</span>`}</li>`).join('')}</ul>` : ''}
    <div class="sett-sintesi"><div><small>Voli a settimana</small><b>${v.voliSett}</b></div><div><small>Ore di volo a settimana</small><b>${num(v.oreSett, 1)}</b></div><div><small>Notti</small><b class="mono piccolo">${bozza.giorni.map((x, i) => GS3[i] + ' ' + x.scali.at(-1)).join(' · ')}</b></div></div>
    ${v.E.length || v.W.length ? `<ul class="problemi">${v.E.map(e => `<li class="errore">✖ ${h(e)}</li>`).join('')}${v.W.map(e => `<li class="avviso">▲ ${h(e)}</li>`).join('')}</ul>` : v.voliSett ? '<ul class="problemi"><li class="ok">✓ Programma coerente: notti in base, turni nei limiti, settimana che si chiude su se stessa</li></ul>' : ''}
    <div class="filtri mt"><button class="primario" data-az="p-salva" ${v.E.length || !modificato ? 'disabled' : ''}>Salva programma</button>${modificato ? '<button data-az="p-annulla">Annulla modifiche</button><span class="piccolo muto">Modifiche non salvate</span>' : ''}</div>`;
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

/* Rotte e prezzi */
VISTE.rotte = () => {
  const righe = Object.entries(G.rotte).sort((a, b) => a[0].localeCompare(b[0]));
  return `<div class="testata"><h1>Rotte e prezzi</h1><span class="sotto">${righe.length} rotte aperte</span><span class="spazio"></span><button class="primario" data-az="apri-rotta">+ Apri nuova rotta</button></div>
  <div class="pannello"><div class="tab-wrap">${righe.length ? `<table><thead><tr><th>Rotta</th><th class="num">Km</th><th class="num">Voli/sett.</th><th>Business</th><th>Premium</th><th>Economy</th><th>Quota</th><th>Concorrenti</th><th>Load factor 7 gg</th><th class="num">Ricavi 7 gg</th><th class="num">Utile voli 7 gg</th><th></th></tr></thead><tbody>
    ${righe.map(([k, r]) => { const [a, b] = k.split('-'), d = SIM.km(a, b), ref = SIM.prezzoRif(d), s = statsRotta(k), riv = SIM.rivaliSu(G, a, b), f = freqRotta(k);
      return `<tr><td><b>${a}–${b}</b> <span class="muto piccolo">${h(citta(a))}–${h(citta(b))}</span></td><td class="num">${num(d)}</td><td class="num">${num(f * 7)}</td>
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
  const d = SIM.km(a, b), domani = SIM.giornoDopo(SIM.mezzanotte(G.ora)), am = SIM.analisiMercato(G, a, b, domani, 3, SIM.prezzoRif(d));
  const modelli = [...new Set(flotta().map(x => x.modello))], ok = modelli.filter(x => MOD[x].autonomia >= d), slot = [a, b].filter(i => AP[i].slot), q = am.quote;
  box.innerHTML = `<table><tbody>
    <tr><td>Distanza</td><td><b>${num(d)} km</b> · ${d > 5000 ? `${fmtDur(SIM.durata(d, 'A359'))} con un A350` : `${fmtDur(SIM.durata(d, 'A320'))} con un A320, ${fmtDur(SIM.durata(d, 'ATR72'))} con un ATR`}${AP[a].fuso !== AP[b].fuso ? ` · fuso orario ${fusoTxt(AP[a].fuso)} → ${fusoTxt(AP[b].fuso)}` : ''}</td></tr>
    <tr><td>Domanda totale stimata</td><td><b>${num(am.mercato)}</b> viaggiatori al giorno per direzione (tutti i mezzi)</td></tr>
    <tr><td>Clientela</td><td>${CL.map(c => `<span class="chip"><i style="background:var(--cl-${c})"></i>${CLS[c].nome} ${pct(q[c])}</span>`).join('')}</td></tr>
    <tr><td>Con 3 voli al giorno ai prezzi di riferimento</td><td>circa <b>${num(am.pax / am.maturita)}</b> passeggeri al giorno per direzione a regime (${pct(am.quota)} di quota)</td></tr>
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
    const am = SIM.analisiMercato(G, a, b, domani, f, prezzi.pY), dom = SIM.domandaClassi(am.pax, am.quote, prezzi, am.ref, am.km);
    const pax = Math.min(capC, dom[cl]);
    return { p, pax, lf: pax / capC, ric: pax * p, quota: am.quota };
  });
  const best = righe.reduce((x, y) => y.ric > x.ric ? y : x);
  modale({
    titolo: `Analisi prezzi ${a}→${b}`, larga: true,
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
VISTE.mercato = () => `
  <div class="testata"><h1>Mercato aerei</h1><span class="sotto">Cassa ${eur(G.cassa)}</span><span class="spazio"></span>
    <div class="segmenti"><button data-az="tab-mercato" data-t="nuovi" class="${UI.mercatoTab === 'nuovi' ? 'on' : ''}">Nuovi dal costruttore</button><button data-az="tab-mercato" data-t="usati" class="${UI.mercatoTab === 'usati' ? 'on' : ''}">Usati (${G.mercato.length})</button></div></div>
  <div class="carte">${UI.mercatoTab === 'nuovi' ? Object.entries(MOD).map(([k, m]) => cartaModello(k, m)).join('') : G.mercato.length ? G.mercato.map(cartaUsato).join('') : '<p class="vuoto">Nessuna offerta questa settimana. Il mercato si aggiorna ogni lunedì.</p>'}</div>
  <p class="nota">Al momento dell’ordine scegli la base di consegna e la configurazione della cabina (Business, Premium Economy, Economy). Nuovi: consegna in 30 giorni. Usati: 5 giorni, 9 se rifai la cabina. Il leasing richiede un deposito di 30 giorni di canone.</p>`;
function avvisoPiloti(mod) {
  const t = MOD[mod].tipo, ha = Object.values(G.personale).reduce((s, P) => s + (P.CMD[t] || 0), 0) + G.formazione.filter(f => f.tipo === t).length;
  return ha ? '' : `<p class="piccolo" style="color:var(--warn)">▲ Nessun pilota abilitato ${t}: assumili o riqualificali in Personale.</p>`;
}
function cartaModello(k, m) {
  const costoOra = m.consumo * G.carburante + m.manut;
  return `<div class="pannello carta"><div class="titolo">${m.nome}</div><div class="muto">${m.spazio} unità di cabina · abilitazione ${m.tipo}</div>
    <div class="riga"><span>Esempio</span><span>${chipCab(SIM.cabinaStandard(k, 'mista'))}</span></div>
    <div class="riga"><span>Autonomia · velocità</span><span>${num(m.autonomia)} km · ${m.vel} km/h</span></div>
    <div class="riga"><span>Carburante + manutenzione</span><span>${eur(costoOra)}/h</span></div>
    <div class="riga"><span>Prezzo</span><span><b>${mln(m.prezzo)}</b></span></div>
    <div class="riga"><span>Leasing</span><span><b>${eur(m.leasing)}/giorno</b></span></div>
    ${avvisoPiloti(k)}
    <div class="azioni"><button class="piccolo primario" data-az="compra" data-mod="${k}">Configura e ordina…</button></div></div>`;
}
function cartaUsato(o) {
  const m = MOD[o.mod];
  return `<div class="pannello carta"><div class="titolo">${m.nome}</div><div class="muto">${o.eta} anni · ${num(o.ore)} ore di volo</div>
    <div class="riga"><span>Cabina attuale</span><span>${chipCab(o.cab)}</span></div>
    <div class="riga"><span>Prezzo</span><span><b>${mln(o.prezzo)}</b> <span class="muto piccolo">(nuovo ${mln(m.prezzo)})</span></span></div>
    <div class="riga"><span>Leasing</span><span><b>${eur(o.leasing)}/giorno</b></span></div>
    <div class="riga"><span>Manutenzione</span><span>+${Math.round(o.eta * 3)}% rispetto al nuovo</span></div>
    ${avvisoPiloti(o.mod)}
    <div class="azioni"><button class="piccolo primario" data-az="compra-usato" data-id="${o.id}">Configura e acquista…</button></div></div>`;
}
function formAcquisto({ mod, usato }) {
  const m = MOD[mod], o = usato && G.mercato.find(x => x.id === usato), cab = o ? o.cab : SIM.cabinaStandard(mod, 'mista');
  const prezzo = o ? o.prezzo : m.prezzo, leasing = o ? o.leasing : m.leasing;
  configuratore({
    titolo: `${o ? 'Acquista' : 'Ordina'} ${m.nome}${o ? ` usato di ${o.eta} anni` : ''}`, mod, cab,
    info: `<div class="form" style="margin-bottom:14px"><label>Contratto<select id="acqModo">${opzioni([['leasing', `Leasing · ${eur(leasing)}/giorno, deposito ${eur(leasing * 30)}`], ['proprieta', `Acquisto · ${eur(prezzo)}`]], 'leasing')}</select></label>
      <label>Base di consegna<select id="acqBase">${opzioni(G.basi.map(b => [b, `${b} · ${citta(b)}`]), G.basi[0])}</select></label></div>
      ${o ? `<p class="piccolo">Cabina attuale: ${chipCab(o.cab)} — se la cambi: ${eur(60000)} + ${eur(800)} a posto e 4 giorni in più.</p>` : ''}`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-conferma-cab data-az="conferma-acquisto" data-mod="${mod}" ${o ? `data-usato="${o.id}"` : ''}>Conferma</button>`
  });
}

/* Personale per base */
VISTE.personale = () => {
  const cop = SIM.copertura(G), costo = SIM.costiFissi(G).personale;
  const tipiFlotta = [...new Set(flotta().map(a => MOD[a.modello].tipo))];
  let s = `<div class="testata"><h1>Personale</h1><span class="sotto">${SIM.totPersonale(G)} persone in ${G.basi.length} basi · ${eur(costo)} al giorno</span></div>
  <div class="kpi">
    <div><small>Morale</small><b>${Math.round(G.morale)}/100</b><span>${G.morale < 30 ? 'rischio sciopero!' : G.morale < 50 ? 'basso' : 'buono'}</span></div>
    <div><small>Copertura minima</small><b>${pct(Math.min(cop.min, 9))}</b><span>sotto il 90% si cancellano voli</span></div>
    <div><small>Turni al giorno</small><b>${num(Object.values(cop.f).reduce((a, x) => a + x.turni, 0), 1)}</b><span>in media sul ciclo</span></div>
  </div>`;
  for (const b of G.basi) {
    const P = SIM.squadra(G, b), f = cop.f[b] || { CMD: {}, FO: {}, CC: 0, ADV: 0, turni: 0 }, cb = cop.basi[b];
    const tipi = [...new Set([...Object.keys(f.CMD), ...Object.keys(P.CMD).filter(t => P.CMD[t]), ...Object.keys(P.FO).filter(t => P.FO[t]), ...tipiFlotta])].sort();
    const arrivo = (r, t) => G.formazione.filter(x => x.base === b && x.ruolo === r && (x.tipo || null) === (t || null)).reduce((a, x) => a + x.n, 0);
    const riga = (r, t) => {
      const ha = t ? (P[r][t] || 0) : P[r], serve = t ? (f[r][t] || 0) : f[r], c = serve ? ha / serve : null;
      return `<tr><td>${D.RUOLI[r].nome}</td><td>${t || '<span class="muto">tutti i tipi</span>'}</td><td class="num">${ha}</td><td class="num">${serve}</td><td class="num">${arrivo(r, t) || ''}</td>
        <td>${c == null ? '<span class="muto">—</span>' : barretta(Math.min(c, 1.5) / 1.5, pct(c), [2, 2])}</td>
        <td><button class="piccolo" data-az="assumi" data-b="${b}" data-r="${r}" data-t="${t || ''}" data-n="1">+1</button> <button class="piccolo" data-az="assumi" data-b="${b}" data-r="${r}" data-t="${t || ''}" data-n="5">+5</button> <button class="piccolo" data-az="licenzia" data-b="${b}" data-r="${r}" data-t="${t || ''}">−1</button>
        ${G.basi.length > 1 ? ` <button class="piccolo" data-az="trasferisci-pers" data-b="${b}" data-r="${r}" data-t="${t || ''}">Trasferisci</button>` : ''}${t ? ` <button class="piccolo" data-az="riqualifica" data-b="${b}" data-r="${r}" data-t="${t}">Riqualifica</button>` : ''}</td></tr>`;
    };
    s += `<div class="pannello"><div class="testata" style="margin-bottom:8px"><h2 style="margin:0">Base di ${h(citta(b))} (${b})${G.hub.includes(b) ? ' · hub' : ''}</h2><span class="sotto">${num(f.turni, 1)} turni al giorno partono da qui${cb ? ` · copertura ${pct(Math.min(cb.min, 9))}` : ''}</span></div>
      <div class="tab-wrap"><table><thead><tr><th>Ruolo</th><th>Abilitazione</th><th class="num">In servizio</th><th class="num">Necessari</th><th class="num">In arrivo</th><th>Copertura</th><th></th></tr></thead><tbody>
      ${tipi.map(t => riga('CMD', t)).join('')}${tipi.map(t => riga('FO', t)).join('')}${riga('CC')}${riga('ADV')}</tbody></table></div></div>`;
  }
  s += `<p class="nota">Ogni turno di servizio (al massimo 13 ore) richiede un comandante, un primo ufficiale, un capo cabina e gli assistenti necessari (1 ogni 50 posti). Per coprire riposi, ferie e riserve servono circa 2,4 persone per ogni turno giornaliero. Gli equipaggi lavorano solo dalla propria base: il personale di una base non copre i voli di un’altra. Piloti: 12.000 € di selezione e 10 giorni; cabina: 1.500 € e 3 giorni; trasferimento: 3.000 € e 5 giorni.</p>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Politiche</h2><div class="form">
      <label>Livello stipendi<select data-az-change="stipendio">${opzioni([[0.9, '90% (risparmio, morale giù)'], [1, '100% (di mercato)'], [1.1, '110% (morale su)'], [1.2, '120% (morale alto)']], G.stipendio)}</select></label>
      <label>Servizio di bordo<select data-az-change="servizio">${opzioni(Object.entries(D.SERVIZIO).map(([k, x]) => [k, `${x.nome} · ${x.costo} €/pax`]), G.servizio)}</select></label></div>
      <div class="filtri mt"><button data-az="premio">Distribuisci un premio (${eur(SIM.totPersonale(G) * 1500)})</button></div></div>
    <div class="pannello"><h2>Formazione e trasferimenti in corso</h2>${G.formazione.length ? `<table><tbody>${G.formazione.map(x => `<tr><td>${x.base}</td><td>${x.n} ${D.RUOLI[x.ruolo].nome.toLowerCase()}${x.tipo ? ' ' + x.tipo : ''}</td><td>${x.riq ? 'riqualifica' : x.trasf ? 'trasferimento' : 'nuove assunzioni'}</td><td class="num">pronti ${fmtGiorno(x.fine)}</td></tr>`).join('')}</tbody></table>` : '<p class="muto">Nessuna</p>'}</div>
  </div>`;
  return s;
};
function formRiqualifica(b, r, t) {
  const tipi = [...new Set(Object.values(MOD).map(m => m.tipo))].filter(x => x !== t);
  modale({
    titolo: `Riqualifica ${D.RUOLI[r].nome.toLowerCase()} ${t} di ${b}`,
    corpo: `<div class="form"><label>Nuova abilitazione<select id="rqTipo">${opzioni(tipi.map(x => [x, x]), tipi[0])}</select></label><label>Quanti<input type="number" id="rqN" min="1" value="1"></label></div>
      <p class="nota">35.000 € a persona, 30 giorni di corso durante i quali non volano. Disponibili: ${SIM.squadra(G, b)[r][t] || 0}.</p>`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma-riq" data-b="${b}" data-r="${r}" data-t="${t}">Avvia corso</button>`
  });
}
function formTrasferisci(b, r, t) {
  const P = SIM.squadra(G, b), ha = t ? (P[r][t] || 0) : P[r];
  modale({
    titolo: `Trasferisci ${D.RUOLI[r].nome.toLowerCase()}${t ? ' ' + t : ''} da ${b}`,
    corpo: `<div class="form"><label>Verso la base<select id="trBase">${opzioni(G.basi.filter(x => x !== b).map(x => [x, `${x} · ${citta(x)}`]), '')}</select></label><label>Quanti (disponibili ${ha})<input type="number" id="trN" min="1" max="${ha}" value="1"></label></div>
      <p class="nota">3.000 € a persona, operativi nella nuova base dopo 5 giorni.</p>`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="conferma-trasf" data-b="${b}" data-r="${r}" data-t="${t}">Trasferisci</button>`
  });
}

/* Aeroporti */
VISTE.aeroporti = () => {
  const dep = SIM.partenzePerScalo(G), q = UI.aeroQ.toLowerCase();
  const lista = Object.values(AP).filter(a => !q || `${a.iata} ${a.nome} ${a.citta} ${a.paese}`.toLowerCase().includes(q)).sort((a, b) => (G.basi.includes(b.iata) - G.basi.includes(a.iata)) || ((dep[b.iata] || 0) - (dep[a.iata] || 0)) || a.citta.localeCompare(b.citta));
  return `<div class="testata"><h1>Aeroporti e slot</h1><span class="sotto">Basi: ${G.basi.join(', ')}${G.hub.length ? ' · hub: ' + G.hub.join(', ') : ''}</span></div>
  <div class="filtri"><input type="search" placeholder="Cerca aeroporto…" value="${h(UI.aeroQ)}" id="aeroQ"></div>
  <div class="pannello"><div class="tab-wrap"><table><thead><tr><th>Aeroporto</th><th>Paese</th><th class="num">Bacino</th><th>Turismo</th><th class="num">Tassa/pax</th><th class="num">Tue partenze/g</th><th>Slot</th><th></th></tr></thead><tbody>
    ${lista.map(a => { const base = G.basi.includes(a.iata), hub = G.hub.includes(a.iata), d = dep[a.iata] || 0, s = G.slot[a.iata] || 0;
      return `<tr><td><b>${a.iata}</b> ${h(a.nome)} ${hub ? '<span class="badge b-warn">Hub</span>' : base ? '<span class="badge b-info">Base</span>' : ''}</td><td>${h(a.nomePaese)} <span class="muto piccolo">${fusoTxt(a.fuso)}</span></td><td class="num">${num(a.pop / 1000, 1)} M</td><td>${barretta(a.tur, null, [2, 2])}</td><td class="num">${eur(a.tassa)}</td><td class="num">${d || ''}</td>
      <td>${a.slot ? `<span class="${d > s ? 'neg' : ''}">${s} posseduti</span> <span class="muto piccolo">${eur(a.slotPrezzo)} l’uno</span>` : '<span class="muto">libero</span>'}</td>
      <td>${a.slot ? `<button class="piccolo" data-az="slot" data-i="${a.iata}" data-n="1">+1 slot</button> <button class="piccolo" data-az="slot" data-i="${a.iata}" data-n="4">+4</button> ` : ''}${base ? (hub ? '' : `<button class="piccolo" data-az="apri-hub" data-i="${a.iata}">Rendi hub</button> <button class="piccolo pericolo" data-az="chiudi-base" data-i="${a.iata}">Chiudi base</button>`) : `<button class="piccolo" data-az="apri-base" data-i="${a.iata}">Apri base (${mln(a.slot ? 500000 : 300000)})</button>`}</td></tr>`; }).join('')}
  </tbody></table></div><p class="nota">Nelle basi gli aerei possono passare la notte e lavorano gli equipaggi (costo ${eur(1200)}–${eur(2500)} al giorno). Un hub è una base dove vendi coincidenze tra i tuoi voli (${mln(D.HUB.costo)} + ${eur(D.HUB.giornaliero)} al giorno). Negli aeroporti regolati ogni partenza giornaliera richiede uno slot.</p></div>`;
};

/* Finanze */
VISTE.finanze = () => {
  const ieri = G.storico.at(-1), u7 = ultimi(7), u30 = ultimi(30), deb = SIM.debitoTot(G), lim = SIM.A.limitePrestito(G), tasso = SIM.A.tassoPrestito(G);
  const voce = (k, n) => G.storico.slice(-n).reduce((a, x) => a + (x.dettaglio[k] || 0), 0);
  const ric = (c, n) => G.storico.slice(-n).reduce((a, x) => a + (x.ricaviC ? x.ricaviC[c] : c === 'Y' ? x.ricavi : 0), 0);
  return `<div class="testata"><h1>Finanze</h1></div>
  <div class="kpi">
    <div><small>Cassa</small><b class="${G.cassa < 0 ? 'neg' : ''}">${mln(G.cassa)}</b><span>fido fino a −2 M€</span></div>
    <div><small>Debiti</small><b>${mln(deb)}</b><span>${G.debiti.length} prestiti</span></div>
    <div><small>Valore compagnia</small><b>${mln(SIM.valoreCompagnia(G))}</b><span>cassa + aerei + slot − debiti</span></div>
    <div><small>Utile ultimi 30 giorni</small><b class="${u30.utile < 0 ? 'neg' : ''}">${mln(u30.utile)}</b><span>${u30.n} giorni</span></div>
    <div><small>Utile cumulato</small><b class="${G.stat.utile < 0 ? 'neg' : ''}">${mln(G.stat.utile)}</b><span>dall’inizio</span></div>
  </div>
  <div class="griglia g2">
    <div class="pannello"><h2>Utile giornaliero · ultimi 60 giorni</h2>${G.storico.length ? graficoUtile(G.storico.slice(-60).map(x => ({ t: x.t, v: x.utile, r: x.ricavi, c: x.costi }))) : '<p class="vuoto">Dati disponibili dopo il primo giorno</p>'}</div>
    <div class="pannello"><h2>Cassa · ultimi 120 giorni</h2>${G.storico.length ? graficoLinea(G.storico.slice(-120).map(x => ({ t: x.t, v: x.cassa }))) : '<p class="vuoto">Dati disponibili dopo il primo giorno</p>'}</div>
  </div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Conto economico</h2><div class="tab-wrap"><table><thead><tr><th>Voce</th><th class="num">Ieri</th><th class="num">7 giorni</th><th class="num">30 giorni</th></tr></thead><tbody>
      ${CL.map(c => `<tr><td>Biglietti ${CLS[c].nome}</td><td class="num">${eur(ric(c, 1))}</td><td class="num">${eur(ric(c, 7))}</td><td class="num">${eur(ric(c, 30))}</td></tr>`).join('')}
      <tr><td><b>Totale ricavi</b> <span class="muto piccolo">di cui coincidenze</span></td><td class="num"><b>${eur(ieri?.ricavi || 0)}</b> <span class="muto piccolo">${mln(ieri?.ricaviTransito || 0)}</span></td><td class="num"><b>${eur(u7.ricavi)}</b> <span class="muto piccolo">${mln(u7.ricaviTransito)}</span></td><td class="num"><b>${eur(u30.ricavi)}</b> <span class="muto piccolo">${mln(u30.ricaviTransito)}</span></td></tr>
      ${Object.keys(VOCI).map(k => `<tr><td>${VOCI[k]}</td><td class="num">${eur(-(ieri?.dettaglio[k] || 0))}</td><td class="num">${eur(-voce(k, 7))}</td><td class="num">${eur(-voce(k, 30))}</td></tr>`).join('')}
      <tr><td><b>Utile</b></td><td class="num"><b>${segno(ieri?.utile || 0)}</b></td><td class="num"><b>${segno(u7.utile)}</b></td><td class="num"><b>${segno(u30.utile)}</b></td></tr>
    </tbody></table></div></div>
    <div class="pannello"><h2>Prestiti</h2>
      ${G.debiti.length ? `<table><thead><tr><th class="num">Capitale</th><th class="num">Tasso</th><th class="num">Rata/g</th><th></th></tr></thead><tbody>${G.debiti.map(d => `<tr><td class="num">${eur(d.capitale)}</td><td class="num">${(d.tasso * 100).toFixed(1)}%</td><td class="num">${eur(d.rata)}</td><td><input type="number" class="prezzo" id="rimb-${d.id}" min="0" step="100000" value="${Math.min(d.capitale, Math.max(0, Math.floor(G.cassa / 1e5) * 1e5))}"> <button class="piccolo" data-az="rimborsa" data-id="${d.id}">Rimborsa</button></td></tr>`).join('')}</tbody></table>` : '<p class="muto">Nessun prestito in corso.</p>'}
      <h3 class="mt">Nuovo prestito</h3>
      <p class="piccolo">La banca ti concede fino a <b>${eur(lim)}</b> al <b>${(tasso * 100).toFixed(1)}%</b> annuo, da restituire in 5 anni con rate giornaliere.</p>
      <div class="filtri"><input type="number" id="importoPrestito" min="0" step="500000" value="${Math.min(lim, 5e6)}" style="width:140px"><button data-az="prestito" ${lim <= 0 ? 'disabled' : ''}>Chiedi prestito</button></div></div>
  </div>`;
};

/* Concorrenza */
VISTE.concorrenza = () => {
  const domani = SIM.giornoDopo(SIM.mezzanotte(G.ora)), mie = [...SIM.rotteInEsercizio(G)];
  return `<div class="testata"><h1>Concorrenza</h1></div>
  <div class="carte">${G.rivali.map(r => `<div class="pannello carta"><div class="titolo"><span class="pallino" style="background:${r.colore}"></span>${h(r.nome)}</div>
    <div class="riga"><span>Hub</span><span>${r.hub} · ${h(citta(r.hub))}</span></div>
    <div class="riga"><span>Reputazione</span><span>${r.rep}/100</span></div>
    <div class="riga"><span>Livello prezzi</span><span>${r.prezzo < 0.9 ? 'low cost' : r.prezzo > 1.1 ? 'premium' : 'nella media'} (${Math.round(r.prezzo * 100)}%)</span></div>
    <div class="riga"><span>Rotte</span><span>${Object.keys(r.rotte).length}</span></div>
    <p class="piccolo muto">${Object.entries(r.rotte).map(([k, x]) => `${k.replace('-', '–')}${x.guerraFino ? ' (sconti!)' : ''}`).join(' · ')}</p></div>`).join('')}</div>
  <div class="pannello mt"><h2>Quote di mercato sulle tue rotte (domani)</h2><div class="tab-wrap">${mie.length ? `<table><thead><tr><th>Rotta</th><th>Tu</th><th>Concorrenti</th><th>Altri mezzi e compagnie</th></tr></thead><tbody>
    ${mie.map(k => { const [a, b] = k.split('-'), f = Math.max(1, Math.round(freqRotta(k) / 2)), am = SIM.analisiMercato(G, a, b, domani, f, G.rotte[k].pY);
      return `<tr><td><b>${a}–${b}</b></td><td>${barretta(am.quota, null, [2, 2])}</td><td>${am.rivali.map(x => `<span class="pallino" style="background:${x.riv.colore}"></span>${h(x.riv.nome)} ${pct(x.quota)}`).join(' · ') || '<span class="muto">nessuno</span>'}</td><td>${pct(am.altri)}</td></tr>`; }).join('')}
  </tbody></table>` : '<p class="muto">Nessuna rotta in esercizio.</p>'}</div>
  <p class="nota">Ogni lunedì i concorrenti valutano le mosse: entrano sulle tue rotte più piene, lanciano guerre di prezzi dove sei forte e abbandonano le rotte dove perdono.</p></div>`;
};

/* Obiettivi */
VISTE.obiettivi = () => {
  const S = SCEN();
  return `<div class="testata"><h1>Obiettivi e traguardi</h1></div>
  <div class="griglia g2">
    <div class="pannello"><h2>${S.nome}</h2><p>${h(S.descr)}</p>${obiettiviHTML()}
      <p class="piccolo">Valore della compagnia: <b>${mln(SIM.valoreCompagnia(G))}</b> · passeggeri trasportati: <b>${num(G.stat.pax)}</b> · voli: <b>${num(G.stat.voli)}</b></p></div>
    <div class="pannello"><h2>Classifica</h2><div id="classifica"><p class="muto">Caricamento…</p></div></div>
  </div>
  <div class="pannello mt"><h2>Traguardi (${Object.keys(G.traguardi).length}/${D.TRAGUARDI.length})</h2><div class="traguardi">${D.TRAGUARDI.map(([id, t, d]) => `<div class="${G.traguardi[id] ? '' : 'no'}"><b>${G.traguardi[id] ? '🏆' : '🔒'} ${t}</b><small>${d}${G.traguardi[id] ? ` · ${fmtGiorno(G.traguardi[id])}` : ''}</small></div>`).join('')}</div></div>`;
};
async function caricaClassifica(el) {
  try {
    const c = await Archivio.classifica();
    el.innerHTML = c.length ? `<table><thead><tr><th>#</th><th>Compagnia</th><th>Scenario</th><th class="num">Giorni</th><th class="num">Punteggio</th></tr></thead><tbody>${c.slice(0, 15).map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.nome)}</td><td>${h(D.SCENARI[x.scenario]?.nome || x.scenario)}</td><td class="num">${x.giorni}</td><td class="num"><b>${num(x.punteggio)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muto">Nessuno scenario completato finora. Il punteggio dipende dal valore della compagnia e dai giorni risparmiati.</p>';
  } catch { el.innerHTML = '<p class="muto">Classifica non disponibile.</p>'; }
}

/* ---------- Render ---------- */
function render() {
  if (!G) return;
  const [v] = (location.hash.slice(2) || 'panoramica').split('/');
  pagina = VISTE[v] ? v : 'panoramica';
  document.querySelectorAll('#menu a, .navbar-basso a').forEach(a => a.classList.toggle('attivo', a.dataset.v === pagina));
  $('#app').classList.remove('menu-aperto');
  $('#vista').innerHTML = VISTE[pagina]();
  if (pagina === 'panoramica') Mappa.monta($('#mappaPosto'));
  if (pagina === 'obiettivi') caricaClassifica($('#classifica'));
  $('#tip').hidden = true;
}
function aggiornaLive() {
  if (!$('#modale').hidden) return;
  if (pagina === 'panoramica') { const l = $('#live'); if (l) l.innerHTML = live(); const n = $('#notizie'); if (n) n.innerHTML = notizieHTML(40); }
  if (pagina === 'voli' && UI.voliTab === 'oggi') { const r = $('#risultati'); if (r) r.innerHTML = tabellaOggi(); }
  if (pagina === 'programmazione') { const c = document.querySelector('.crono .ora-ora'); if (c) c.style.left = `calc(100px + (100% - 100px) * ${(G.ora - SIM.mezzanotte(G.ora)) / GIORNO})`; }
}
function dopoAzione() { render(); Mappa.disegnaRete(); }

/* ---------- Ciclo di gioco ---------- */
let tPrec = performance.now(), accLive = 0, accMappa = 0;
function loop(t) {
  const dt = Math.min(250, t - tPrec); tPrec = t;
  if (G) {
    if (vel && !(G.esito && !G.esito.visto)) {
      const g0 = SIM.mezzanotte(G.ora);
      SIM.avanza(G, VEL[vel] * dt / 1000);
      gestisciNovita();
      if (SIM.mezzanotte(G.ora) !== g0 && $('#modale').hidden && !inputAttivo() && pagina !== 'programmazione') render();
      accLive += dt; if (accLive > 700) { accLive = 0; aggiornaLive(); }
    }
    aggiornaCima();
    accMappa += dt; if (accMappa > 150) { accMappa = 0; Mappa.aggiorna(); }
  }
  requestAnimationFrame(loop);
}
const inputAttivo = () => { const a = document.activeElement; return a && /INPUT|SELECT/.test(a.tagName); };
function gestisciNovita() {
  const nuove = G._nuove || []; G._nuove = [];
  let pausa = false;
  for (const n of nuove) if (n.imp) { toast(n.testo, n.tipo); suono(n.tipo === 'buona' ? 'buona' : n.tipo === 'cattiva' ? 'cattiva' : 'evento'); if (UI.pausaAuto) pausa = true; }
  if (pausa && vel) { vel = 0; aggiornaVel(); }
  if (G._salva) { G._salva = false; salva(); }
  if (G.esito && !G.esito.visto) mostraEsito();
}
const Archivio = {
  server: true,
  locale() { try { return JSON.parse(localStorage.getItem('aviogest-indice') || '[]'); } catch { return []; } },
  async lista() {
    try { const r = await fetch('/api/salvataggi'); if (!r.ok) throw 0; this.server = true; return await r.json(); }
    catch { this.server = false; return this.locale(); }
  },
  async carica(id) {
    if (this.server) { try { const r = await fetch('/api/salvataggi/' + id); if (r.ok) return await r.json(); } catch { } }
    return JSON.parse(localStorage.getItem('aviogest-p-' + id));
  },
  async salva(g, corpo) {
    if (this.server) { try { const r = await fetch('/api/salvataggi/' + g.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: corpo }); if (r.ok) return true; } catch { } this.server = false; }
    try {
      localStorage.setItem('aviogest-p-' + g.id, corpo);
      const ind = this.locale().filter(x => x.id !== g.id);
      ind.unshift({ id: g.id, nome: g.nome, scenario: g.scenario, ora: g.ora, cassa: Math.round(g.cassa), salvato: Date.now() });
      localStorage.setItem('aviogest-indice', JSON.stringify(ind)); return true;
    } catch { return false; }
  },
  async elimina(id) {
    if (this.server) { try { await fetch('/api/salvataggi/' + id, { method: 'DELETE' }); } catch { } }
    try { localStorage.removeItem('aviogest-p-' + id); localStorage.setItem('aviogest-indice', JSON.stringify(this.locale().filter(x => x.id !== id))); } catch { }
  },
  async classifica() {
    if (this.server) { try { const r = await fetch('/api/classifica'); if (r.ok) return await r.json(); } catch { } }
    try { return JSON.parse(localStorage.getItem('aviogest-classifica') || '[]'); } catch { return []; }
  },
  async registra(x) {
    if (this.server) { try { const r = await fetch('/api/classifica', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(x) }); if (r.ok) return; } catch { } }
    try { const c = await this.classifica(); c.push({ ...x, data: Date.now() }); c.sort((a, b) => b.punteggio - a.punteggio); localStorage.setItem('aviogest-classifica', JSON.stringify(c.slice(0, 100))); } catch { }
  }
};
async function salva(manuale) {
  const ok = await Archivio.salva(G, JSON.stringify(G, (k, v) => k.startsWith('_') ? undefined : v));
  if (manuale) toast(ok ? (Archivio.server ? 'Partita salvata' : 'Partita salvata su questo dispositivo') : 'Salvataggio non riuscito: memoria piena?', ok ? 'buona' : 'err');
}
function mostraEsito() {
  const e = G.esito; e.visto = true; vel = 0; aggiornaVel();
  if (e.tipo === 'vittoria') {
    suono('buona');
    Archivio.registra({ nome: G.nome, scenario: G.scenario, punteggio: e.punteggio, giorni: e.giorni });
    modale({ titolo: '🏆 Scenario completato!', corpo: `<p>${h(G.nome)} ha raggiunto gli obiettivi di <b>${SCEN().nome}</b> in <b>${e.giorni}</b> giorni.</p><p style="font-size:28px;margin:8px 0"><b>${num(e.punteggio)}</b> punti</p><p class="muto">Il punteggio è stato registrato in classifica. Puoi continuare a far crescere la compagnia.</p>`, piede: `<button data-az="esci">Torna al menu</button><button class="primario" data-az="chiudi">Continua a giocare</button>` });
  } else if (e.tipo === 'scaduto') {
    modale({ titolo: 'Tempo scaduto', corpo: `<p>Gli obiettivi di <b>${SCEN().nome}</b> non sono stati raggiunti in tempo.</p><p class="muto">Puoi continuare a giocare liberamente, senza punteggio.</p>`, piede: `<button data-az="esci">Torna al menu</button><button class="primario" data-az="chiudi">Continua</button>` });
  } else {
    suono('cattiva');
    modale({ titolo: 'Fallimento', corpo: `<p>Dopo 10 giorni oltre il limite di fido, le banche hanno chiuso i conti di ${h(G.nome)}.</p><p class="muto">Giorni di attività: ${Math.round((G.ora - G.inizio) / GIORNO)} · passeggeri trasportati: ${num(G.stat.pax)}</p>`, piede: `<button class="primario" data-az="esci">Torna al menu</button>` });
  }
  salva();
}

/* ---------- Menu iniziale ---------- */
async function menuIniziale() {
  G = null; vel = 0; Mappa.reset();
  $('#app').hidden = true; const m = $('#menu-iniziale'); m.hidden = false;
  let salvati = [], classifica = [];
  salvati = await Archivio.lista(); classifica = await Archivio.classifica();
  const S = D.SCENARI[UI.scenarioSel];
  const basi = perContinente();
  m.innerHTML = `<div class="menu-box">
    <h1><span class="logo-segno" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 15.5v-1.6l-6.7-4.2V5.2a1.3 1.3 0 0 0-2.6 0v4.5L4 13.9v1.6l6.7-2.1v4.1L9 18.8v1.2l3-.8 3 .8v-1.2l-1.7-1.3v-4.1z"/></svg></span>AvioGest</h1>
    <p class="motto">Costruisci la tua compagnia aerea in tutto il mondo: flotta e cabine, programmi settimanali, prezzi per classe, basi e hub, equipaggi, marketing e concorrenti.</p>
    <div class="striscia" aria-label="Partenze">${'PARTENZE'.split('').map(c => `<span>${c}</span>`).join('')}</div>
    ${salvati.length ? `<h2>Continua</h2><div class="pannello"><table><thead><tr><th>Compagnia</th><th>Scenario</th><th>Data di gioco</th><th class="num">Cassa</th><th>Salvata</th><th></th></tr></thead><tbody>
      ${salvati.map(s => `<tr class="clic" data-az="carica" data-id="${s.id}"><td><b>${h(s.nome)}</b></td><td>${h(D.SCENARI[s.scenario]?.nome || '')}</td><td>${fmtData(s.ora)}</td><td class="num">${eur(s.cassa)}</td><td>${new Date(s.salvato).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</td><td><button class="piccolo" data-az="elimina-salvataggio" data-id="${s.id}">Elimina</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <h2>Nuova partita</h2>
    <div class="scenari">${Object.entries(D.SCENARI).map(([k, s], i) => `<button class="scenario ${k === UI.scenarioSel ? 'on' : ''}" data-az="scegli-scenario" data-s="${k}" aria-pressed="${k === UI.scenarioSel}">
      <span class="pass-main"><span class="pass-testa">Carta d’imbarco <i>${h(s.difficolta)}</i></span>
        <b class="pass-nome">${h(s.nome)}</b><p>${h(s.descr)}</p>
        <span class="pass-lab">Obiettivo</span><p class="pass-ob">${h(s.obiettivi)}</p></span>
      <span class="pass-stub"><span class="pass-lab">Posto</span><span class="codice">${['1A', '2C', '3F', '4D', '5K'][i] || '6B'}</span>
        <span class="pass-lab">Durata</span><b>${s.durata ? Math.round(s.durata / 365 * 10) / 10 + ' anni' : 'libera'}</b>
        <span class="pass-lab">Capitale</span><b>${s.cassa ? mln(s.cassa) : '0,8 M€'}</b><i class="barcode"></i></span></button>`).join('')}</div>
    <div class="pannello mt"><div class="form">
      <label class="campo">Nome della compagnia<input id="nNome" value="${UI.scenarioSel === 'crisi' ? 'Aliseo Airlines' : 'Volaria'}" maxlength="30"></label>
      <label class="campo">Codice volo (2 lettere)<input id="nCodice" value="${UI.scenarioSel === 'crisi' ? 'AL' : 'VL'}" maxlength="2"></label>
      ${S.sceltaBase ? `<label class="campo">Base di partenza<select id="nBase">${opzioniAeroporti(basi, S.mondo ? 'FCO' : 'BRI', a => a.slot ? ' (slot regolati)' : '')}</select><span class="aiuto">Una base in un aeroporto a slot dà 8 slot gratuiti.</span></label>` : `<p class="piccolo">Basi: ${S.base || 'Roma Fiumicino (hub) e Milano Malpensa'}</p>`}
      <div class="pieno"><button class="primario" data-az="nuova-partita">Decolla!</button></div></div></div>
    ${classifica.length ? `<h2>Classifica</h2><div class="pannello"><table><tbody>${classifica.slice(0, 10).map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.nome)}</td><td>${h(D.SCENARI[x.scenario]?.nome || '')}</td><td class="num">${x.giorni} giorni</td><td class="num"><b>${num(x.punteggio)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="nota" style="color:#8ea0bb">Comandi: barra spaziatrice = pausa, tasti 1-2-3 = velocità. La partita si salva da sola ogni giorno di gioco.</p>
  </div>`;
  avviaCielo(m);
}
// Cielo del menu: aeroporti come punti e voli che disegnano rotte ad arco sul planisfero
let cieloAnim = 0;
function avviaCielo(contenitore) {
  cancelAnimationFrame(cieloAnim);
  const cv = document.createElement('canvas'); cv.className = 'cielo'; cv.setAttribute('aria-hidden', 'true');
  contenitore.prepend(cv);
  const ctx = cv.getContext('2d'), aero = Object.values(AP), fermo = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0;
  const dim = () => { const r = window.devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight; cv.width = W * r; cv.height = H * r; ctx.setTransform(r, 0, 0, r, 0, 0); };
  const xy = ([la, lo]) => [(lo + 180) / 360 * W, (75 - la) / 135 * H];
  const nuovo = () => { let a, b; do { a = aero[Math.floor(Math.random() * aero.length)]; b = aero[Math.floor(Math.random() * aero.length)]; } while (a === b || SIM.km(a.iata, b.iata) < 1500); return { a, b, p: 0, v: 0.0025 + Math.random() * 0.003 }; };
  const voli = Array.from({ length: 14 }, () => { const v = nuovo(); v.p = Math.random(); return v; });
  const disegna = () => {
    if (!cv.isConnected) return;
    if (cv.clientWidth !== W || cv.clientHeight !== H) dim();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(160,185,220,.35)';
    for (const a of aero) { const [x, y] = xy([a.lat, a.lon]); ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const v of voli) {
      const n = 40, fino = Math.min(1, v.p), coda = Math.max(0, v.p - 0.45);
      let prec = null;
      for (let i = 0; i <= n; i++) {
        const f = coda + (fino - coda) * i / n, pt = xy(puntoArco(v.a, v.b, f));
        if (prec && Math.abs(pt[0] - prec[0]) < W / 2) { ctx.strokeStyle = `rgba(255,201,41,${0.05 + 0.55 * i / n})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(prec[0], prec[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); }
        prec = pt;
      }
      if (v.p <= 1) { const [x, y] = xy(puntoArco(v.a, v.b, fino)); ctx.fillStyle = '#ffc929'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); }
      if (!fermo) { v.p += v.v; if (v.p > 1.45) Object.assign(v, nuovo()); }
    }
    if (!fermo) cieloAnim = requestAnimationFrame(disegna);
  };
  dim(); disegna();
}
function avviaPartita(g) {
  cancelAnimationFrame(cieloAnim);
  G = SIM.migra(g); G._nuove = []; vel = 0; bozza = null; UI.aereoSel = null;
  $('#menu-iniziale').hidden = true; $('#app').hidden = false;
  $('#nomeCompagnia').textContent = G.nome; $('#scenarioNome').textContent = SCEN().nome;
  costruisciCima(); Mappa.reset();
  if (location.hash !== '#/panoramica') location.hash = '#/panoramica'; else render();
}

/* ---------- Programmazione: modifiche alla bozza ---------- */
function aggiornaEditor() { const ae = G.aerei.find(a => a.id === bozza.aeId); $('#editor').innerHTML = editor(ae); }
// dopo una modifica al giorno i, se il giorno seguente non ha ancora tratte lo fa partire da dove finisce il giorno i
function allinea(i) {
  const n = bozza.giorni.length, succ = bozza.giorni[(i + 1) % n];
  if (n > 1 && succ !== bozza.giorni[i] && succ.scali.length === 1) succ.scali[0] = bozza.giorni[i].scali.at(-1);
}
const copiaGiorno = g => ({ inizio: g.inizio, scali: g.scali.slice(), attese: (g.attese || []).slice() });

/* ---------- Azioni ---------- */
const AZ = {
  chiudi: () => chiudiModale(),
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
    const r = el.dataset.usato ? SIM.A.compraUsato(G, el.dataset.usato, modo, base, cab) : SIM.A.compraNuovo(G, el.dataset.mod, modo, base, cab);
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
  'p-aggiungi': () => { const d = $('#pDest').value; if (d) { bozza.giorni[bozza.sel].scali.push(d); allinea(bozza.sel); aggiornaEditor(); } },
  'p-rientra': el => { bozza.giorni[bozza.sel].scali.push(el.dataset.b); allinea(bozza.sel); aggiornaEditor(); },
  'p-togli': () => { const g = bozza.giorni[bozza.sel]; if (g.scali.length > 1) g.scali.pop(); g.attese = (g.attese || []).slice(0, g.scali.length - 1); allinea(bozza.sel); aggiornaEditor(); },
  'p-svuota': () => { const g = bozza.giorni[bozza.sel]; g.scali = g.scali.slice(0, 1); g.attese = []; allinea(bozza.sel); aggiornaEditor(); },
  'p-ripeti': () => {
    const g = bozza.giorni[bozza.sel], sc = g.scali; if (sc.at(-1) !== sc[0]) return;
    const n = sc.length - 1, att = Array.from({ length: n }, (_, i) => g.attese?.[i] || 0);
    sc.push(...sc.slice(1)); g.attese = [...att, 0, ...att.slice(1)]; aggiornaEditor();
  },
  'p-annulla': () => { bozza = null; render(); },
  'p-salva': () => {
    const r = SIM.salvaProgramma(G, bozza.aeId, { turn: bozza.turn, giorni: bozza.giorni.map(copiaGiorno) });
    if (r.E.length) return toast(r.E[0], 'err');
    toast(`Programma salvato: ${r.voliSett} voli a settimana in vendita`, 'buona'); suono('click'); bozza = null; dopoAzione();
  },
  'apri-rotta': () => formApriRotta(),
  'conferma-rotta': () => { const a = $('#rDa').value, b = $('#rA').value; if (!b) return toast('Scegli la destinazione', 'err'); if (esito(SIM.A.apriRotta(G, a, b))) { chiudiModale(); dopoAzione(); } },
  'chiudi-rotta': el => conferma('Chiudere la rotta?', 'La rotta verrà chiusa. Per riaprirla dovrai pagare di nuovo la campagna di lancio.', 'Chiudi rotta', () => { esito(SIM.A.chiudiRotta(G, el.dataset.k)); dopoAzione(); }),
  analisi: el => analisiPrezzi(el.dataset.k),
  'analisi-cl': el => { UI.classeAnalisi = el.dataset.c; analisiPrezzi(el.dataset.k, el.dataset.c); },
  'applica-prezzo': el => { esito(SIM.A.prezzi(G, el.dataset.k, { ['p' + el.dataset.c]: +el.dataset.p })); chiudiModale(); render(); },
  assumi: el => { esito(SIM.A.assumi(G, el.dataset.b, el.dataset.r, el.dataset.t || null, +el.dataset.n)); render(); },
  licenzia: el => { esito(SIM.A.licenzia(G, el.dataset.b, el.dataset.r, el.dataset.t || null, 1)); render(); },
  riqualifica: el => formRiqualifica(el.dataset.b, el.dataset.r, el.dataset.t),
  'conferma-riq': el => { esito(SIM.A.riqualifica(G, el.dataset.b, el.dataset.r, el.dataset.t, $('#rqTipo').value, +$('#rqN').value)); chiudiModale(); render(); },
  'trasferisci-pers': el => formTrasferisci(el.dataset.b, el.dataset.r, el.dataset.t || null),
  'conferma-trasf': el => { esito(SIM.A.trasferisciPersonale(G, el.dataset.b, $('#trBase').value, el.dataset.r, el.dataset.t || null, +$('#trN').value)); chiudiModale(); render(); },
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

/* ---------- Eventi ---------- */
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-az]');
  if (el && AZ[el.dataset.az] && el.type !== 'checkbox' && el.tagName !== 'SELECT') {
    if (el.disabled) return;
    if (el.tagName === 'A') ev.preventDefault();
    AZ[el.dataset.az](el, ev); return;
  }
  if (ev.target === $('#modale')) chiudiModale();
  if (ev.target.closest('#menu a')) $('#app').classList.remove('menu-aperto');
  const t = ev.target.closest('[data-tip]');
  if (t && TOCCO) mostraTip(t.dataset.tip, ev.clientX, ev.clientY, 3500);
});
const TOCCO = matchMedia('(hover: none)').matches;
let tipTimer;
function mostraTip(testo, x, y, durata) {
  const tip = $('#tip'); tip.textContent = testo; tip.hidden = false;
  tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(8, y - tip.offsetHeight - 14) + 'px';
  clearTimeout(tipTimer); if (durata) tipTimer = setTimeout(() => tip.hidden = true, durata);
}
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.az === 'autocheck') return AZ.autocheck(el);
  if (el.dataset.prezzo) { esito(SIM.A.prezzi(G, el.dataset.prezzo, { ['p' + el.dataset.cl]: +el.value })); return; }
  if (el.dataset.azChange === 'stipendio') { G.stipendio = +el.value; toast('Livello stipendi aggiornato'); render(); return; }
  if (el.dataset.azChange === 'servizio') { G.servizio = el.value; toast('Servizio di bordo aggiornato'); return; }
  if (el.id === 'cmAmbito') { aggiornaObiettivi(); stimaCampagna(); return; }
  if (el.id === 'cmOb' || el.id === 'cmGiorni' || el.id === 'cmBudget') { stimaCampagna(); return; }
  if (el.classList.contains('ora-volo')) {
    const g = bozza.giorni[bozza.sel], k = +el.dataset.leg, ae = G.aerei.find(a => a.id === bozza.aeId);
    const att = (g.attese || []).slice(); att[k] = 0;
    const minimo = SIM.legsGiorno(ae, { ...g, attese: att }, bozza.turn)[k].dep;
    let voluto = SIM.minDaOra(el.value || '00:00') + 1440 * Math.floor(minimo / 1440);
    if (voluto < minimo && voluto + 1440 - minimo <= 720) voluto += 1440;
    const extra = voluto - minimo;
    if (extra < 0) { toast(`Questo volo può partire al più presto alle ${SIM.oraDaMin(minimo)} (arrivo del volo prima + turnaround)`, 'err'); att[k] = 0; }
    else if (extra > 720) { toast('Al massimo 12 ore a terra tra un volo e l’altro', 'err'); att[k] = g.attese?.[k] || 0; }
    else att[k] = extra;
    g.attese = att; allinea(bozza.sel); aggiornaEditor(); return;
  }
  if (el.id === 'pInizio') { bozza.giorni[bozza.sel].inizio = el.value || bozza.giorni[bozza.sel].inizio; aggiornaEditor(); return; }
  if (el.id === 'pTurn') { bozza.turn = +el.value; aggiornaEditor(); return; }
  if (el.id === 'pPartenza') {
    const g = bozza.giorni[bozza.sel];
    if (g.scali.length > 1) { conferma('Cambiare l’aeroporto di partenza?', 'I voli di questo giorno verranno tolti.', 'Cambia', () => { g.scali = [el.value]; g.attese = []; aggiornaEditor(); }); return; }
    g.scali = [el.value]; g.attese = []; aggiornaEditor(); return;
  }
  if (el.id === 'rDa' || el.id === 'rA') { if (el.id === 'rDa') { const a = el.value; $('#rA').innerHTML = '<option value="">— scegli —</option>' + opzioniAeroporti(perContinente().filter(x => x.iata !== a), ''); } infoRotta(); return; }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'aeroQ') { UI.aeroQ = ev.target.value; const pos = ev.target.selectionStart; render(); const i = $('#aeroQ'); i.focus(); i.setSelectionRange(pos, pos); }
  if (/^cab[JWY]$/.test(ev.target.id)) aggiornaConfig();
  if (ev.target.id === 'cmBudget') stimaCampagna();
});
document.addEventListener('keydown', ev => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList?.contains('sett-riga')) { ev.preventDefault(); ev.target.click(); return; }
  if (ev.key === 'Escape' && !$('#modale').hidden) return chiudiModale();
  if (!G || inputAttivo() || !$('#modale').hidden) return;
  if (ev.code === 'Space') { ev.preventDefault(); vel = vel ? 0 : 1; aggiornaVel(); }
  if (['1', '2', '3'].includes(ev.key)) { vel = +ev.key; aggiornaVel(); }
  if (ev.key === '0') { vel = 0; aggiornaVel(); }
});
document.addEventListener('mouseover', ev => {
  if (TOCCO) return;
  const t = ev.target.closest('[data-tip]'), tip = $('#tip');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip; tip.hidden = false;
});
document.addEventListener('mousemove', ev => {
  const tip = $('#tip'); if (tip.hidden) return;
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 16) + 'px';
});
window.addEventListener('hashchange', () => { if (G) { render(); scrollTo(0, 0); } });
// su telefono la pagina può essere chiusa in qualsiasi momento: salva quando passa in secondo piano
document.addEventListener('visibilitychange', () => { if (document.hidden && G) salva(); });
window.addEventListener('beforeunload', () => { if (G && Archivio.server) navigator.sendBeacon?.('/api/salvataggi/' + G.id + '/beacon', new Blob([JSON.stringify(G, (k, v) => k.startsWith('_') ? undefined : v)], { type: 'application/json' })); });

menuIniziale();
requestAnimationFrame(loop);
