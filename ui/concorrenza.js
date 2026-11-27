'use strict';
// AvioGest — Concorrenza: salute dei rivali, alleanze (non belligeranza, codeshare, joint venture) e acquisizioni

function livelloDisponibilita(R, livello) {
  const L = SIM.LIVELLI_ALLEANZA[livello], d = SIM.disponibilita(G, R, livello) - L.soglia;
  return d >= 8 ? ['alta', 'b-ok'] : d >= -8 ? ['incerta', 'b-warn'] : ['bassa', 'b-err'];
}
function cartaRivale(R) {
  const al = SIM.alleanzaCon(G, R.id), intel = SIM.intel(G), fl = SIM.flottaRivale(R), aerei = fl.reduce((s, x) => s + x.n, 0);
  const comuni = Object.keys(R.rotte).filter(k => G.rotte[k]), jv = G.jv.filter(j => j.riv === R.id), prezzo = SIM.prezzoAcquisto(G, R);
  const alleatoCon = R.alleato && G.rivali.find(x => x.id === R.alleato);
  const bott = livello => { const [t, c] = livelloDisponibilita(R, livello), L = SIM.LIVELLI_ALLEANZA[livello];
    return `<button class="piccolo" data-az="alleanza" data-r="${R.id}" data-l="${livello}" ${R.rifiutoFino && G.ora < R.rifiutoFino ? 'disabled' : ''}>Proponi ${L.nome.toLowerCase()}</button><span class="badge ${c}" title="Probabilità che accettino">disponibilità ${t}</span>`; };
  return `<div class="pannello carta rivale ${al ? 'alleato' : ''}">
    <div class="riga" style="margin:0"><span class="titolo"><span class="pallino" style="background:${R.colore}"></span>${h(R.nome)}</span>${al ? `<span class="badge b-ok">${SIM.LIVELLI_ALLEANZA[al.livello].nome}</span>` : R.crisi ? '<span class="badge b-err">In vendita a sconto</span>' : ''}</div>
    <div class="riga"><span>Hub</span><span>${R.hub} · ${h(citta(R.hub))}</span></div>
    <div class="riga"><span>Reputazione · prezzi</span><span>${Math.round(R.rep)}/100 · ${R.prezzo < 0.9 ? 'low cost' : R.prezzo > 1.1 ? 'premium' : 'nella media'}</span></div>
    <div class="riga"><span>Rete</span><span>${Object.keys(R.rotte).length} rotte · circa ${aerei} aerei</span></div>
    <div class="riga"><span>Salute finanziaria</span><span>${intel || R.crisi ? '' : '<span class="muto piccolo">serve l’analisi della concorrenza</span>'}</span></div>
    ${intel && R.conti ? `<div class="riga"><span>Conti</span><span>${mln(R.conti.ricavi)} di ricavi al giorno · utile ${mln(R.conti.utile)} · aerei pieni al ${pct(R.conti.lf)}</span></div><div class="riga"><span>Cassa</span><span>${mln(R.cassa || 0)}</span></div>` : ''}
    ${intel || R.crisi ? barretta(R.forza / 100, R.forza < 18 ? 'in crisi' : R.forza < 40 ? 'debole' : R.forza > 65 ? 'solida' : 'nella norma', [2, 2]) : ''}
    ${alleatoCon ? `<p class="piccolo">Alleata con <span class="pallino" style="background:${alleatoCon.colore}"></span>${h(alleatoCon.nome)}</p>` : ''}
    ${comuni.length ? `<p class="piccolo">Rotte in comune con te: ${comuni.map(k => linkRotta(k)).join(' · ')}</p>` : ''}
    <details class="piccolo"><summary>Tutte le sue rotte</summary><p class="muto">${Object.entries(R.rotte).map(([k, x]) => `${k.replace('-', '–')} (${x.freq}/g)${x.guerraFino ? ' sconti!' : ''}`).join(' · ')}</p></details>
    <h3>Accordi</h3>
    ${al ? `<p class="piccolo">${h(SIM.LIVELLI_ALLEANZA[al.livello].descr)} Dal ${fmtGiorno(al.inizio)}, ${eur(SIM.LIVELLI_ALLEANZA[al.livello].quotidiano)} al giorno.</p>
      <div class="filtri">${al.livello === 'pace' ? bott('codeshare') : ''}<button class="piccolo pericolo" data-az="chiudi-alleanza" data-r="${R.id}">Chiudi l’accordo</button></div>
      ${al.livello === 'codeshare' ? `<p class="piccolo">${jv.length ? 'Joint venture: ' + jv.map(j => linkRotta(j.k)).join(' · ') : 'Nessuna joint venture.'}</p>
        ${comuni.filter(k => !SIM.jvSu(G, k)).length ? `<div class="filtri"><select id="jv-${R.id}" aria-label="Rotta per la joint venture">${opzioni(comuni.filter(k => !SIM.jvSu(G, k)).map(k => [k, k.replace('-', '–')]), '')}</select><button class="piccolo" data-az="jv" data-r="${R.id}">Joint venture · ${mln(SIM.AVVIO_JV)}</button></div><p class="nota">Su quella rotta smettete di farvi concorrenza: tu prendi i suoi passeggeri e gli giri il ${Math.round(SIM.QUOTA_JV * 100)}% dei ricavi.</p>` : ''}` : ''}`
    : `<div class="filtri">${bott('pace')}</div><div class="filtri">${bott('codeshare')}</div>
      ${R.rifiutoFino && G.ora < R.rifiutoFino ? `<p class="piccolo muto">Ha rifiutato da poco: riprova dopo il ${fmtGiorno(R.rifiutoFino)}.</p>` : ''}`}
    <h3>Acquisizione</h3>
    <p class="piccolo">Prezzo richiesto <b>${eur(prezzo)}</b>${R.crisi ? ' (scontato: è in crisi)' : R.forza > 60 && (intel || R.crisi) ? ' (caro: è in salute)' : ''}. Ottieni ${aerei} aerei, ${Object.keys(R.rotte).length} rotte, i suoi slot e i suoi equipaggi, con ${R.hub} come base.</p>
    <div class="filtri"><button class="piccolo ${R.crisi ? 'primario' : ''}" data-az="acquisisci" data-r="${R.id}" ${G.cassa < prezzo ? 'disabled title="Cassa insufficiente"' : ''}>Compra ${h(R.nome)}</button>${G.cassa < prezzo ? `<span class="piccolo muto">mancano ${mln(prezzo - G.cassa)}</span>` : ''}</div>
  </div>`;
}
VISTE.concorrenza = () => {
  const domani = SIM.giornoDopo(SIM.mezzanotte(G.ora)), mie = [...SIM.rotteInEsercizio(G)], costoAll = Object.values(G.alleanze || {}).reduce((s, a) => s + SIM.LIVELLI_ALLEANZA[a.livello].quotidiano, 0);
  return `<div class="testata"><h1>Concorrenza</h1><span class="sotto">${G.rivali.length} concorrenti · ${Object.keys(G.alleanze || {}).length} accordi${costoAll ? ` (${eur(costoAll)} al giorno)` : ''}${G.jv?.length ? ` · ${G.jv.length} joint venture` : ''}</span></div>
  ${G.acquisizioni?.length ? `<div class="pannello"><h2>Le tue acquisizioni</h2><ul class="elenco">${G.acquisizioni.map(a => `<li><b>${h(a.nome)}</b><span class="muto piccolo">${fmtGiorno(a.t)} · ${a.aerei} aerei · ${a.rotte} rotte · base ${a.hub}</span><span class="spazio"></span>${eur(a.prezzo)}</li>`).join('')}</ul></div>` : ''}
  ${pannelloAlleanzeGlobali()}
  <div class="carte mt">${G.rivali.map(cartaRivale).join('')}</div>
  <div class="pannello mt"><h2>Quote di mercato sulle tue rotte (domani)</h2><div class="tab-wrap">${mie.length ? `<table><thead><tr><th>Rotta</th><th>Tu</th><th>Concorrenti</th><th>Altri mezzi e compagnie</th></tr></thead><tbody>
    ${mie.map(k => { const [a, b] = k.split('-'), f = Math.max(1, Math.round(freqRotta(k) / 2)), am = SIM.analisiMercato(G, a, b, domani, f, G.rotte[k].pY);
      return `<tr><td>${linkRotta(k)}${SIM.jvSu(G, k) ? ' <span class="badge b-ok">JV</span>' : ''}</td><td>${barretta(am.quota, null, [2, 2])}</td><td>${am.rivali.map(x => `<span class="pallino" style="background:${x.riv.colore}"></span>${h(x.riv.nome)} ${pct(x.quota)}`).join(' · ') || '<span class="muto">nessuno</span>'}</td><td>${pct(am.altri)}</td></tr>`; }).join('')}
  </tbody></table>` : '<p class="muto">Nessuna rotta in esercizio.</p>'}</div>
  <p class="nota">I concorrenti attaccano le tue rotte più piene e lanciano guerre di prezzi dove sei forte, ma non se avete un accordo. Si indeboliscono con le guerre, l’economia debole e la tua concorrenza: sotto una certa soglia vanno in vendita a sconto, e se nessuno li compra falliscono o vengono assorbiti da un altro rivale.</p></div>`;
};
