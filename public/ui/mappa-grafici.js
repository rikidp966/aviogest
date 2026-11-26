'use strict';
// AvioGest — Mappa Leaflet, grafici SVG, elenchi di aeroporti

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
    for (const i of Object.keys(AP)) if (!serviti.has(i)) L.circleMarker([AP[i].lat, AP[i].lon], { radius: 3, color: '#7b8799', weight: 1, fillColor: '#b9c3d0', fillOpacity: 0.8 }).bindTooltip(`<b>${i}</b> · ${h(AP[i].citta)}`).on('click', () => apriAeroporto(i)).addTo(this.lScali);
    for (const i of serviti) {
      const base = G.basi.includes(i), hub = G.hub.includes(i);
      if (hub) L.circleMarker([AP[i].lat, AP[i].lon], { radius: 13, color: '#c98500', weight: 3, fill: false }).addTo(this.lScali);
      L.circleMarker([AP[i].lat, AP[i].lon], { radius: base ? 7 : 4.5, color: '#fff', weight: 2, fillColor: base ? '#2a78d6' : '#12213a', fillOpacity: 1 })
        .bindTooltip(`<b>${i}</b> · ${h(AP[i].nome)}${hub ? '<br>Hub' : base ? '<br>Base' : ''}`).on('click', () => apriAeroporto(i)).addTo(this.lScali);
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
function graficoLinea(dati, fmt = eur) {
  const W = 640, H = 200, ml = 56, mr = 6, mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  const vals = dati.map(d => d.v), mn = Math.min(0, ...vals), mx = Math.max(1, ...vals), passo = passoBello((mx - mn) / 4);
  const lo = Math.floor(mn / passo) * passo, hi = Math.ceil(mx / passo) * passo;
  const x = i => ml + (dati.length < 2 ? iw / 2 : i / (dati.length - 1) * iw), y = v => mt + (hi - v) / (hi - lo) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cassa">`;
  for (let v = lo; v <= hi + 1e-6; v += passo) s += `<line class="${v === 0 ? 'zero' : 'griglia-l'}" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${fmt === eur ? mln(v) : fmt(v)}</text>`;
  const pts = dati.map((d, i) => `${x(i)},${y(d.v)}`).join(' ');
  if (dati.length > 1) s += `<polygon class="area" points="${x(0)},${y(lo)} ${pts} ${x(dati.length - 1)},${y(lo)}"/><polyline class="linea" points="${pts}"/>`;
  const col = iw / Math.max(1, dati.length);
  dati.forEach((d, i) => { s += `<g data-tip="${h(`${fmtGiorno(d.t)}: ${fmt(d.v)}`)}"><rect class="bersaglio" x="${x(i) - col / 2}" y="${mt}" width="${col}" height="${ih}"/><circle class="punto" cx="${x(i)}" cy="${y(d.v)}" r="4"/></g>${etichetteX(dati, i, x(i), H)}`; });
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
