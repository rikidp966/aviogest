'use strict';
// AvioGest — Gruppo (compagnie controllate, società di servizi), Governo e tribunali (bandi, tasse, aiuti, lobby, cause),
// dirigenti con abilità e stipendio, amministratori delegati dei rivali

{ const az = AREE.find(a => a.id === 'azienda').pagine, i = az.findIndex(p => p[0] === 'proprieta') + 1; az.splice(i, 0, ['gruppo', 'Gruppo'], ['istituzioni', 'Governo e tribunali']); }
const _badgeGruppo = badgeArea;
badgeArea = id => _badgeGruppo(id) + (id === 'azienda' && G ? (G.cause || []).filter(c => c.stato === 'aperta').length + (G.direzione?.corteggiamento ? 1 : 0) + (G.offertaAiuto ? 1 : 0) : 0);
const _bannerGruppo = bannerDilemma;
bannerDilemma = () => bannerGruppo() + _bannerGruppo();
function bannerGruppo() {
  let s = '';
  const C = G.direzione?.corteggiamento;
  if (C) { const d = G.direzione.dirigenti[C.ruolo]; s += `<div class="banner-riunione"><span class="br-icona" aria-hidden="true">🎣</span><div><b>${h(C.riv)} vuole ${h(d.nome)}</b><span class="piccolo">${D.DIRIGENTI[C.ruolo].ruolo} · offerta ${mln(C.offerta)} l’anno · decidi entro ${giorniA(C.scade)} giorni</span></div><button class="btn primario" data-az="apri-corteggiamento">Decidi</button></div>`; }
  const ap = (G.cause || []).filter(c => c.stato === 'aperta');
  if (ap.length) s += `<div class="banner-riunione emergenza"><span class="br-icona" aria-hidden="true">⚖️</span><div><b>${ap.length === 1 ? h(ap[0].titolo) : ap.length + ' cause da decidere'}</b><span class="piccolo">Patteggiare o andare a processo?</span></div><a class="btn primario" href="#/istituzioni">Vedi</a></div>`;
  if (G.offertaAiuto) s += `<div class="banner-riunione"><span class="br-icona" aria-hidden="true">🏛️</span><div><b>Aiuto di Stato</b><span class="piccolo">Prestito all’1% di ${mln(G.offertaAiuto.importo)}</span></div><a class="btn primario" href="#/istituzioni">Vedi</a></div>`;
  return s;
}
const stelleAb = a => '★'.repeat(a) + '☆'.repeat(5 - a);

/* ---------- Gruppo ---------- */
VISTE.gruppo = () => {
  const C = SIM.contiGruppo(G), marchi = G.marchi || [], principali = Object.keys(G.rotte).filter(k => !G.rotte[k].marchio);
  return `<div class="testata"><h1>Gruppo</h1><span class="sotto">${marchi.length ? `${marchi.length + 1} compagnie` : 'Una sola compagnia'} · ${Object.values(G.societa || {}).filter(x => x.stato === 'attiva').length} società di servizi</span></div>
  <div class="pannello"><h2>Conti del gruppo · ultimi 30 giorni</h2><div class="tab-wrap"><table><thead><tr><th>Compagnia</th><th class="num">Rotte</th><th class="num">Riempimento</th><th class="num">Utile al giorno</th></tr></thead><tbody>
    ${Object.entries(C).map(([id, x]) => { const m = marchi.find(y => y.id === id); return `<tr><td>${m ? `<span class="pallino" style="background:${m.colore}"></span>` : ''}${h(x.nome)}</td><td class="num">${x.rotte}</td><td class="num">${x.posti ? pct(x.lf) : '—'}</td><td class="num ${x.giorno < 0 ? 'neg' : ''}">${eur(x.giorno)}</td></tr>`; }).join('')}
  </tbody></table></div><p class="nota">I ricavi delle società di servizi verso altre compagnie non sono in questa tabella: li trovi sotto.</p></div>
  <div class="carte mt">${marchi.map(m => { const T = SIM.TIPI_MARCHIO[m.tipo], rotte = Object.keys(G.rotte).filter(k => G.rotte[k].marchio === m.id);
    return `<div class="pannello carta"><div class="riga" style="margin:0"><span class="titolo"><span class="pallino" style="background:${m.colore}"></span>${h(m.nome)}</span><span class="badge">${T.nome}</span></div>
      <p class="piccolo muto">${h(T.descr)}</p>
      <div class="piccolo">Reputazione</div>${barretta(m.rep / 100, Math.round(m.rep) + '/100', [0.4, 0.99])}
      <div class="piccolo">Notorietà del marchio</div>${barretta(m.notorieta, pct(m.notorieta), [0.6, 0.99])}
      <p class="piccolo">Rotte: ${rotte.length ? rotte.map(k => linkRotta(k)).join(' · ') : '<span class="muto">nessuna</span>'}</p>
      ${principali.length ? `<div class="filtri"><select id="asg-${m.id}" aria-label="Rotta da spostare">${opzioni(principali.map(k => [k, k.replace('-', '–')]), '')}</select><button class="piccolo" data-az="assegna-marchio" data-m="${m.id}">Sposta qui · 25.000 €</button></div>` : ''}
      <div class="filtri"><button class="piccolo pericolo" data-az="chiudi-marchio" data-m="${m.id}">Chiudi la compagnia</button></div></div>`; }).join('')}
    ${marchi.length < 3 ? `<div class="pannello carta"><h2>Nuova compagnia controllata</h2><p class="piccolo">Un marchio separato con costi e clientela suoi: se va male, non rovina il nome di ${h(G.nome)}.</p>
      <label>Tipo<select id="mTipo">${opzioni(Object.entries(SIM.TIPI_MARCHIO).map(([k, x]) => [k, `${x.nome} · ${mln(x.costo)}`]), 'lowcost')}</select></label>
      <label>Nome<input id="mNome" maxlength="30" placeholder="Es. ${h(G.nome.split(' ')[0])} Smart"></label>
      <div class="filtri mt"><button class="primario" data-az="crea-marchio">Fonda la compagnia</button></div>
      <p class="nota">Low cost: handling −20%, bordo −50%, vendite dirette, +30% di servizi extra venduti, clienti attenti al prezzo. Regionale: più passeggeri sulle tratte brevi. Personale meno caro in proporzione alle rotte assegnate.</p></div>` : ''}</div>
  <h2 class="mt">Società di servizi</h2>
  <div class="carte">${Object.entries(SIM.SOCIETA).map(([k, S]) => { const x = SIM.statoSocieta(G, k);
    return `<div class="pannello carta"><div class="riga" style="margin:0"><b>${h(S.nome)}</b>${x.stato === 'attiva' ? '<span class="badge b-ok">attiva</span>' : x.stato === 'venduta' ? '<span class="badge">venduta</span>' : ''}</div>
      <p class="piccolo">${h(S.descr)}</p>
      ${x.stato === 'attiva' ? `<div class="piccolo">Clienti esterni</div>${barretta(x.clienti, pct(x.clienti), [0.6, 0.99])}
        <div class="riga"><span>Utile da clienti esterni</span><b>${eur(x.utile30 || 0)} in 30 gg</b></div><div class="riga"><span>Valore se la vendi</span><span>${eur(SIM.valoreSocieta(G, k))}</span></div>
        <div class="filtri"><button class="piccolo" data-az="sviluppa-soc" data-k="${k}" ${x.clienti >= 0.95 ? 'disabled' : ''}>Cerca clienti · 500.000 €</button><button class="piccolo" data-az="vendi-soc" data-k="${k}">Vendi</button></div>`
      : x.stato === 'venduta' ? `<p class="piccolo muto">Venduta il ${fmtGiorno(x.venduta)} per ${eur(x.prezzo)}. ${G.ora < x.contrattoFino ? `Fino al ${fmtGiorno(x.contrattoFino)} la paghi come fornitore (+3%).` : ''}</p><div class="filtri"><button class="piccolo" data-az="apri-soc" data-k="${k}">Rifondala · ${mln(S.costo)}</button></div>`
      : `<div class="filtri"><button class="piccolo primario" data-az="apri-soc" data-k="${k}">Fonda · ${mln(S.costo)}</button></div>`}</div>`; }).join('')}</div>`;
};

/* ---------- Governo e tribunali ---------- */
VISTE.istituzioni = () => {
  const B = G.bandi || [], pso = G.pso || [], cause = G.cause || [], tasse = Object.entries(G.tassePax || {}).filter(([, v]) => v);
  const livelli = [['Chiedi il 25% in meno', 0], ['Chiedi il sussidio pieno', 1], ['Chiedi il 25% in più', 2]];
  return `<div class="testata"><h1>Governo e tribunali</h1><span class="sotto">${pso.length} contratti pubblici · ${cause.filter(c => c.stato !== 'chiusa').length} cause in corso · lobby: ${h(SIM.LOBBY[G.lobby || 0].nome.toLowerCase())}</span></div>
  ${G.offertaAiuto ? `<div class="pannello evidenza"><h2>Aiuto di Stato</h2><p>Il governo offre un prestito di <b>${eur(G.offertaAiuto.importo)}</b> all’1% in 6 anni. C’è circa un terzo di probabilità che la Commissione europea lo giudichi illegale: in quel caso paghi una penale del 5% e il tasso torna di mercato.</p>
    <div class="filtri"><button class="primario" data-az="aiuto" data-s="1">Accetta</button><button data-az="aiuto" data-s="0">Rifiuta</button><span class="piccolo muto">scade tra ${giorniA(G.offertaAiuto.scade)} gg</span></div></div>` : ''}
  ${cause.filter(c => c.stato === 'aperta').map(c => `<div class="pannello mt evidenza-err"><h2>${h(c.titolo)}</h2><p>${h(c.testo)}</p>
    <p class="piccolo">Probabilità di perdere a processo: <b>${pct(c.prob)}</b> (${pct(Math.max(0, c.prob - 0.15))} con avvocati migliori).</p>
    <div class="filtri"><button data-az="causa" data-id="${c.id}" data-s="patteggia">Patteggia · ${eur(c.importo * 0.45)}</button><button data-az="causa" data-id="${c.id}" data-s="processo">Processo · spese ${eur(c.importo * 0.03)}</button><button data-az="causa" data-id="${c.id}" data-s="forte">Avvocati migliori · ${eur(c.importo * 0.08)}</button></div>
    <p class="nota">Se non decidi entro ${giorniA(c.scade)} giorni si va a processo.</p></div>`).join('')}
  <div class="pannello mt"><h2>Bandi di continuità territoriale</h2>
    ${B.length ? `<div class="carte">${B.map(x => { const [a, b] = x.k.split('-'); return `<div class="pannello carta"><div class="riga" style="margin:0"><b>${a}–${b}</b><span class="badge">${x.rivali} concorrenti in gara</span></div>
      <p class="piccolo">${h(citta(a))}–${h(citta(b))} · ${num(SIM.km(a, b))} km</p>
      <div class="riga"><span>Sussidio</span><b>${eur(x.sussidio)} l’anno per ${x.anni} anni</b></div>
      <div class="riga"><span>Obblighi</span><span>${x.minFreq} voli al giorno per direzione · Economy al massimo ${eur(x.maxPrezzo)}</span></div>
      ${x.offerta ? `<p><span class="badge b-info">Offerta presentata</span> risultato il ${fmtGiorno(x.scade)}</p>` : `<div class="filtri">${livelli.map(([t, l]) => `<button class="piccolo ${l === 1 ? 'primario' : ''}" data-az="bando" data-id="${x.id}" data-l="${l}">${t} · ${pct(SIM.probBando(G, x, l))}</button>`).join('')}</div><p class="nota">Più chiedi, meno probabile è vincere. Presentare l’offerta costa 20.000 €. Scade tra ${giorniA(x.scade)} giorni.</p>`}</div>`; }).join('')}</div>`
    : '<p class="muto piccolo">Nessun bando aperto. Escono per i collegamenti con isole e città minori del paese delle tue basi.</p>'}
    ${pso.length ? `<h3>Contratti vinti</h3><div class="tab-wrap"><table><thead><tr><th>Rotta</th><th class="num">Sussidio</th><th>Obblighi</th><th>Stato</th></tr></thead><tbody>${pso.map(p => { const ok0 = G.rotte[p.k] && G.rotte[p.k].pY <= p.maxPrezzo; return `<tr><td>${linkRotta(p.k)}</td><td class="num">${eur(p.sussidio)}/anno</td><td>${p.minFreq} voli/giorno · max ${eur(p.maxPrezzo)}${ok0 ? '' : ' <span class="badge b-err">prezzo troppo alto</span>'}</td><td>${G.ora - p.inizio < 21 * GIORNO ? `parte il ${fmtGiorno(p.inizio + 21 * GIORNO)}` : p.violazioni ? `<span class="badge b-warn">${p.violazioni} giorni non rispettati</span>` : '<span class="badge b-ok">in regola</span>'} · fino al ${fmtGiorno(p.fine)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="nota">Hai 3 settimane per programmare gli aerei. Ogni giorno fuori dagli obblighi paghi una penale; al decimo il contratto viene revocato.</p>` : ''}</div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Tasse sui biglietti</h2>${tasse.length ? `<ul class="piccolo">${tasse.map(([p, v]) => `<li>${h(Object.values(AP).find(x => x.paese === p)?.nomePaese || p)}: <b class="${v > 0 ? 'neg' : 'pos'}">${v > 0 ? '+' : ''}${v} €</b> per passeggero in partenza</li>`).join('')}</ul>` : '<p class="muto piccolo">Nessuna variazione finora.</p>'}
      ${(G.storiaTasse || []).length ? `<details><summary class="piccolo">Storia</summary><ul class="piccolo">${G.storiaTasse.map(t => `<li>${fmtGiorno(t.t)}: ${h(Object.values(AP).find(x => x.paese === t.paese)?.nomePaese || t.paese)} ${t.delta > 0 ? '+' : ''}${t.delta} €</li>`).join('')}</ul></details>` : ''}
      <p class="nota">I governi cambiano spesso le tasse sui biglietti: le paghi tu su ogni passeggero in partenza da quel paese.</p></div>
    <div class="pannello"><h2>Lobby e relazioni istituzionali</h2>
      <div class="opzioni-lobby">${SIM.LOBBY.map((L, i) => `<button class="${(G.lobby || 0) === i ? 'primario' : ''}" data-az="lobby" data-l="${i}"><b>${h(L.nome)}</b><small>${L.costo ? eur(L.costo) + ' al giorno' : 'gratis'}</small></button>`).join('')}</div>
      <p class="nota">Ogni livello rende i diritti di traffico più rapidi (−15%) e più sicuri, aiuta a vincere i bandi, rende meno probabili gli aumenti delle tasse e le multe antitrust. Ma più spingi, più rischi uno scandalo: multa, reputazione a picco e ufficio chiuso.</p>
      ${G.aiuti ? `<p class="piccolo">Aiuto di Stato ricevuto il ${fmtGiorno(G.aiuti.t)} (${eur(G.aiuti.importo)}): ${G.aiuti.chiuso ? 'verifica europea conclusa' : `verifica europea in corso`}.</p>` : ''}</div>
  </div>
  <div class="pannello mt"><h2>Cause e sentenze</h2>${cause.filter(c => c.stato !== 'aperta').length ? `<ul class="verbale">${cause.filter(c => c.stato !== 'aperta').map(c => `<li><span class="badge ${c.stato === 'processo' ? 'b-warn' : /Vinta/.test(c.esito) ? 'b-ok' : 'b-err'}">${c.stato === 'processo' ? 'in tribunale' : h(c.esito.split(':')[0])}</span> <span class="piccolo muto">${fmtGiorno(c.t)}</span><br><span class="piccolo">${h(c.titolo)}${c.stato === 'processo' ? ` · sentenza il ${fmtGiorno(c.sentenza)}` : ` · ${h(c.esito)}`}</span></li>`).join('')}</ul>` : '<p class="muto piccolo">Nessuna causa. Arrivano dopo molte cancellazioni (class action), se domini una città (antitrust) o per contese sugli slot.</p>'}</div>`;
};

/* ---------- Scheda rotta: quale compagnia la vola ---------- */
const _vistaRotta = VISTE.rotta;
VISTE.rotta = (...a) => {
  const html = _vistaRotta(...a), k = decodeURIComponent((location.hash.split('/')[2] || '')), r = G.rotte[k];
  if (!r || !(G.marchi || []).length) return html;
  return html + `<div class="pannello mt"><h2>Compagnia del gruppo</h2><div class="filtri"><select data-marchio="${k}" aria-label="Compagnia che vola la rotta">${opzioni([['', G.nome], ...G.marchi.map(m => [m.id, `${m.nome} (${SIM.TIPI_MARCHIO[m.tipo].nome.toLowerCase()})`])], r.marchio || '')}</select></div><p class="nota">Cambiare compagnia costa 25.000 € di rebranding: cambiano clientela, costi e reputazione sulla rotta.</p></div>`;
};

/* ---------- Dirigenti: sostituzioni e corteggiamenti ---------- */
function apriCandidati(ruolo) {
  const c = G.direzione.candidati?.[ruolo], d = G.direzione.dirigenti[ruolo];
  modale({ titolo: `Nuovo ${D.DIRIGENTI[ruolo].ruolo}`, corpo: `<p class="piccolo">Oggi: <b>${h(d.nome)}</b> · ${stelleAb(d.abilita)} · ${mln(d.stipendio)} l’anno. Sostituirlo costa mezza annualità di buonuscita (${eur(d.stipendio / 2)}).</p>
    <div class="opzioni-dilemma">${(c?.lista || []).map((x, i) => `<button data-az="assumi-dir" data-r="${ruolo}" data-i="${i}"><b>${h(x.nome)} · ${stelleAb(x.abilita)}</b><small>${mln(x.stipendio)} l’anno · ${h(SIM.CARATTERI_DIR[x.carattere])}</small></button>`).join('') || '<p class="muto">Nessun candidato rimasto.</p>'}</div>
    <p class="nota">Più stelle = effetto più forte: commerciale → domanda, COO → puntualità, CFO → tassi dei prestiti, CMO → effetto del marketing, CTO → durata dei progetti.</p>` });
}
function apriCorteggiamento() {
  const C = G.direzione.corteggiamento; if (!C) return; const d = G.direzione.dirigenti[C.ruolo];
  modale({ titolo: `${C.riv} vuole ${d.nome}`, corpo: `<p>${h(d.nome)} (${D.DIRIGENTI[C.ruolo].ruolo}, ${stelleAb(d.abilita)}) ha ricevuto un’offerta di <b>${eur(C.offerta)}</b> l’anno. Oggi guadagna ${eur(d.stipendio)}.</p>
    <div class="opzioni-dilemma"><button class="primario" data-az="trattieni" data-s="1"><b>Rilancia e trattienilo</b><small>Stipendio a ${eur(Math.round(C.offerta * 0.95 / 5000) * 5000)}, umore in salita</small></button><button data-az="trattieni" data-s="0"><b>Lascialo andare</b><small>Arriva un sostituto ad interim (2 stelle) e il rivale si rafforza</small></button></div>` });
}

/* ---------- Azioni ---------- */
Object.assign(AZ, {
  'crea-marchio': () => { if (esito(SIM.A.creaMarchio(G, $('#mTipo').value, $('#mNome').value))) dopoAzione(); },
  'assegna-marchio': el => { const k = $(`#asg-${el.dataset.m}`)?.value; if (k && esito(SIM.A.assegnaMarchio(G, k, el.dataset.m))) dopoAzione(); },
  'chiudi-marchio': el => { const m = G.marchi.find(x => x.id === el.dataset.m); conferma(`Chiudere ${m.nome}?`, 'Le sue rotte tornano alla compagnia principale; perdi l’investimento.', 'Chiudi', () => { esito(SIM.A.chiudiMarchio(G, m.id)); dopoAzione(); }); },
  'apri-soc': el => { const S = SIM.SOCIETA[el.dataset.k]; conferma(`Fondare ${S.nome}?`, `Investimento di ${eur(S.costo)}. ${S.descr}`, 'Fonda', () => { if (esito(SIM.A.apriSocieta(G, el.dataset.k))) render(); }); },
  'sviluppa-soc': el => { if (esito(SIM.A.sviluppaSocieta(G, el.dataset.k))) render(); },
  'vendi-soc': el => { const S = SIM.SOCIETA[el.dataset.k]; conferma(`Vendere ${S.nome}?`, `Incassi ${eur(SIM.valoreSocieta(G, el.dataset.k))}, perdi il risparmio interno e per 3 anni paghi il 3% in più su quella voce.`, 'Vendi', () => { if (esito(SIM.A.vendiSocieta(G, el.dataset.k))) render(); }); },
  bando: el => { if (esito(SIM.A.offertaBando(G, el.dataset.id, +el.dataset.l))) render(); },
  aiuto: el => { if (esito(SIM.A.accettaAiuto(G, el.dataset.s === '1'))) render(); },
  lobby: el => { if (esito(SIM.A.lobby(G, +el.dataset.l))) render(); },
  causa: el => { if (esito(SIM.A.causa(G, el.dataset.id, el.dataset.s))) render(); },
  candidati: el => { const r = el.dataset.r; if (esito(SIM.A.candidati(G, r))) apriCandidati(r); },
  'assumi-dir': el => { if (esito(SIM.A.assumiDirigente(G, el.dataset.r, +el.dataset.i))) { chiudiModale(); render(); } },
  'apri-corteggiamento': () => apriCorteggiamento(),
  trattieni: el => { esito(SIM.A.trattieni(G, el.dataset.s === '1')); chiudiModale(); render(); }
});
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.marchio) { esito(SIM.A.assegnaMarchio(G, el.dataset.marchio, el.value || null)); render(); } });
