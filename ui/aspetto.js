'use strict';
// AvioGest — Aspetto: tema chiaro/scuro, schede interne nelle pagine di dettaglio, tabelle che su telefono diventano schede

/* ---------- Tema ---------- */
const TEMI = [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']];
function applicaTema(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.dataset.theme = t; else delete r.dataset.theme;
  const scuro = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scuro ? '#04070d' : '#0b1220');
}
const temaSalvato = () => { try { return localStorage.getItem('aviogest-tema') || 'auto'; } catch { return 'auto'; } };
applicaTema(temaSalvato());
function pannelloAspetto() {
  const t = temaSalvato();
  return `<div class="pannello"><h2>Aspetto</h2><div class="opzioni-tema">${TEMI.map(([k, n]) => `<button class="${k === t ? 'on' : ''}" data-az="tema" data-t="${k}">${n}</button>`).join('')}</div>
    <p class="nota">Automatico segue il tema chiaro o scuro del telefono o del computer.</p></div>`;
}
const _impAspetto = VISTE.impostazioni;
VISTE.impostazioni = (...a) => { const html = _impAspetto(...a), i = html.indexOf('<div class="pannello">'); return i < 0 ? html + pannelloAspetto() : html.slice(0, i) + pannelloAspetto() + html.slice(i); };

/* ---------- Schede interne delle pagine di dettaglio ---------- */
// divide la pagina in schede leggendo il titolo (h2) di ogni pannello; testata, salute e numeri chiave restano sempre in alto
function schedeDettaglio(html, chiave, gruppi, extra = {}) {
  const t = document.createElement('template'); t.innerHTML = html;
  const testa = [], per = Object.fromEntries(gruppi.map(g => [g.id, []]));
  let inTesta = true, ultimo = gruppi[0].id;
  const titolo = el => (el.querySelector('h2')?.textContent || '').trim().toLowerCase();
  const assegna = el => {
    const h = titolo(el);
    if (gruppi.some(g => g.togli && g.togli.includes(h))) return;
    if (h) { const g = gruppi.find(x => (x.h2 || []).some(p => h.includes(p))); ultimo = g ? g.id : (gruppi.find(x => x.altro) || gruppi[0]).id; }
    else if (el.matches('.filtri')) ultimo = (gruppi.find(x => x.altro) || gruppi[0]).id;
    per[ultimo].push(el.outerHTML);
  };
  for (const el of [...t.content.children]) {
    if (el.matches('.salute, .kpi') || (inTesta && el.matches('.schede-area, .sottoschede, .testata'))) { testa.push(el.outerHTML); continue; }
    inTesta = false;
    if (el.matches('.griglia') && el.children.length > 1) [...el.children].forEach(assegna); else assegna(el);
  }
  const visibili = gruppi.filter(g => !g.togli && (per[g.id].length || extra[g.id]));
  const scelta = (UI.schedaDett ||= {})[chiave], att = visibili.find(g => g.id === scelta) ? scelta : visibili[0]?.id;
  return testa.join('') + `<div class="schede-dett" role="tablist">${visibili.map(g => `<button role="tab" aria-selected="${g.id === att}" class="${g.id === att ? 'on' : ''}" data-az="scheda-dett" data-k="${chiave}" data-s="${g.id}">${g.nome}</button>`).join('')}</div>`
    + `<div class="dett-corpo">${(per[att] || []).join('')}${extra[att] || ''}</div>`;
}
// rotta: Panoramica · Prezzi (tutto il sistema tariffario) · Mercato · Gestione
const _corpoTariffe = VISTE.tariffe;
const _rottaDett = VISTE.rotta;
VISTE.rotta = (...a) => {
  const k = UI.arg || ''; if (!G.rotte[k]) return _rottaDett(...a);
  const tar = _corpoTariffe(), i = tar.indexOf('<div class="pannello mt"><h2>1 ·');
  return schedeDettaglio(_rottaDett(...a), 'rotta', [
    { id: 'panoramica', nome: 'Panoramica', h2: ['come va', 'utile dei voli', 'aerei su questa rotta'] },
    { id: 'prezzi', nome: 'Prezzi e tariffe', h2: [] },
    { id: 'mercato', nome: 'Mercato e clienti', h2: ['mercato', 'clienti'] },
    { id: 'gestione', nome: 'Gestione', h2: ['compagnia del gruppo'], altro: true },
    { id: 'via', togli: ['prezzi'] }
  ], { prezzi: i >= 0 ? tar.slice(i) : '' });
};
// il vecchio indirizzo dei prezzi apre la scheda Prezzi della rotta
VISTE.tariffe = () => { (UI.schedaDett ||= {}).rotta = 'prezzi'; const k = UI.arg; setTimeout(() => location.replace('#/rotta/' + k), 0); return ''; };
// aereo: Panoramica · Voli · Vendita
const _aereoDett = VISTE.aereo;
VISTE.aereo = (...a) => schedeDettaglio(_aereoDett(...a), 'aereo', [
  { id: 'panoramica', nome: 'Panoramica', h2: ['settimana', 'manutenzione', 'cabina'], altro: true },
  { id: 'voli', nome: 'Voli', h2: ['ultimi voli', 'voli'] },
  { id: 'vendita', nome: 'Vendita', h2: ['vendere', 'leasing', 'venduto'] }
]);

/* ---------- Tabelle che su telefono diventano schede ---------- */
const ESCLUSE = '.tabellone table, table.roster, .crono table, table.bilancio, .giornale table, table.solo-desktop, .menu-box table, table.no-schede, table.biglietto';
function etichettaTabelle(radice) {
  if (!radice) return;
  for (const tb of radice.querySelectorAll('table')) {
    if (tb.matches(ESCLUSE) || tb.dataset.schede) continue;
    const th = [...tb.querySelectorAll('thead th')].map(x => x.textContent.trim());
    if (!th.length) continue;
    tb.dataset.schede = '1'; tb.classList.add('a-schede');
    for (const tr of tb.querySelectorAll('tbody tr')) [...tr.children].forEach((td, i) => { if (th[i] && !td.dataset.l) td.dataset.l = th[i]; });
  }
}
const _renderAspetto = render;
render = function (...a) { const r = _renderAspetto.apply(this, a); etichettaTabelle(document.getElementById('vista')); return r; };
const _modaleAspetto = modale;
modale = function (...a) { const r = _modaleAspetto.apply(this, a); etichettaTabelle(document.getElementById('modale')); return r; };

Object.assign(AZ, {
  tema: el => { try { localStorage.setItem('aviogest-tema', el.dataset.t); } catch { } applicaTema(el.dataset.t); render(); },
  'scheda-dett': el => { (UI.schedaDett ||= {})[el.dataset.k] = el.dataset.s; render(); window.scrollTo({ top: 0 }); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applicaTema(temaSalvato()));
