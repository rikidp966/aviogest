'use strict';
// AvioGest — Soci e CdA: chi possiede la compagnia, voti del consiglio, assemblee, scalate, la tua carriera da AD;
// storie dei passeggeri (recensioni, lettere, viaggiatori abituali)

// ogni azione che richiede il voto del CdA viene ricordata, così la si ripete se il consiglio approva
(() => {
  let prof = 0;
  for (const [k, f] of Object.entries(SIM.A)) {
    if (typeof f !== 'function') continue;
    SIM.A[k] = function (...a) { prof++; let r; try { r = f.apply(this, a); } finally { prof--; } if (!prof && r && r.voto) UI.votoAttesa = { k, a, voto: r.voto }; return r; };
  }
})();
const _esitoBase = esito;
esito = function (r) { if (r && r.voto && UI.votoAttesa) { apriVoto(); return false; } return _esitoBase(r); };

AREE.find(a => a.id === 'azienda').pagine.splice(1, 0, ['proprieta', 'Soci e CdA']);
const _badgeBase = badgeArea;
badgeArea = id => _badgeBase(id) + (id === 'azienda' && G && G.proprieta ? (G.proprieta.assemblea ? 1 : 0) + (G.proprieta.opa ? 1 : 0) + (G.proprieta.uscita ? 1 : 0) : 0);
const _bannerBase = bannerDilemma;
bannerDilemma = () => bannerProprieta() + _bannerBase();

const pct1 = x => (x * 100).toFixed(x < 0.1 ? 1 : 0).replace('.', ',') + '%';
const nomeSocio = id => id === 'ad' ? 'amministratore delegato' : G.proprieta.soci.find(s => s.id === id)?.nome || '—';
const stelline = n => '★'.repeat(n) + '☆'.repeat(5 - n);

function bannerProprieta() {
  if (!G.proprieta) return '';
  const P = G.proprieta;
  if (G.esito && G.esito.tipo === 'licenziato') return `<div class="banner-riunione emergenza"><span class="br-icona" aria-hidden="true">📉</span><div><b>Sei stato licenziato</b><span class="piccolo">${h(G.esito.motivo)}</span></div><button class="btn primario" data-az="apri-licenziamento">Scegli</button></div>`;
  let s = '';
  if (P.opa) s += `<div class="banner-riunione emergenza"><span class="br-icona" aria-hidden="true">🦈</span><div><b>OPA ostile di ${h(P.opa.nome)}</b><span class="piccolo">Mancano ${giorniA(P.opa.scade)} giorni per difenderti</span></div><a class="btn primario" href="#/proprieta">Difenditi</a></div>`;
  if (P.assemblea) s += `<div class="banner-riunione"><span class="br-icona" aria-hidden="true">🏛️</span><div><b>Assemblea dei soci</b><span class="piccolo">Bilancio, dividendo e compenso · si chiude tra ${giorniA(P.assemblea.scade)} giorni</span></div><a class="btn primario" href="#/proprieta">Prepara</a></div>`;
  if (P.uscita) s += `<div class="banner-riunione"><span class="br-icona" aria-hidden="true">🚪</span><div><b>Un socio vuole uscire</b><span class="piccolo">${h(nomeSocio(P.uscita.socio))} · decidi entro ${giorniA(P.uscita.scade)} giorni</span></div><a class="btn" href="#/proprieta">Vedi</a></div>`;
  return s;
}

/* ---------- Voto del consiglio ---------- */
function propensione(c, voto) {
  const p = SIM.probabilitaSi(G, c, voto.tipo, voto.importo);
  return p >= 0.99 ? ['con te', 'b-ok'] : p >= 0.62 ? ['favorevole', 'b-ok'] : p >= 0.42 ? ['incerto', 'b-warn'] : ['contrario', 'b-err'];
}
function apriVoto() {
  const V = UI.votoAttesa; if (!V) return;
  modale({ titolo: 'Serve il voto del CdA', corpo: `<p><b>${h(V.voto.titolo)}</b>${V.voto.importo ? ` · ${eur(V.voto.importo)}` : ''}</p>
    <p class="piccolo">Non hai la maggioranza: le spese sopra ${eur(SIM.sogliaVoto(G))}, i dividendi, gli aumenti di capitale, l’ingresso di nuovi soci e la quotazione passano dal consiglio.</p>
    <ul class="consiglio">${G.proprieta.consiglio.map(c => { const [t, cl] = propensione(c, V.voto); return `<li><span class="avatar piccola" aria-hidden="true">${h(iniziali(c.nome))}</span><div><b>${h(c.nome)}</b><small>${h(nomeSocio(c.socio))}${c.carattere && SIM.CARATTERI[c.carattere] ? ' · ' + SIM.CARATTERI[c.carattere] : ''}</small></div><span class="badge ${cl}">${t}</span></li>`; }).join('')}</ul>`,
    piede: `<button data-az="chiudi">Rinuncia</button><button class="primario" data-az="vota-cda">Metti ai voti</button>` });
}
function mostraVoto(r) {
  const V = UI.votoAttesa, rec = r.votazione; if (!rec) { esito(r); return; }
  if (r.ok) {
    suono('buona'); toast(r.msg, 'buona'); UI.votoAttesa = null; chiudiModale();
    const r2 = SIM.A[V.k](...V.a); esito(r2); dopoAzione(); return;
  }
  suono('cattiva');
  modale({ titolo: 'Il CdA ha bocciato la proposta', corpo: `<p><b>${h(V.voto.titolo)}</b></p><p>${h(r.errore)}</p>
    <ul class="consiglio">${rec.voti.map(v => `<li><span class="badge ${v.si ? 'b-ok' : 'b-err'}">${v.si ? 'Sì' : 'No'}</span><div><b>${h(v.nome)}</b><small>${h(nomeSocio(v.socio))}</small></div></li>`).join('')}</ul>
    ${rec.trattata ? '' : '<p class="nota">Puoi trattare con i contrari e rivotare: costa un po’ di fiducia (−3), ma qualcuno può cambiare idea.</p>'}`,
    piede: `<button data-az="chiudi">Chiudi</button>${rec.trattata ? '' : '<button class="primario" data-az="tratta-cda">Tratta e rivota</button>'}` });
}

/* ---------- Pagina Soci e CdA ---------- */
function pannelloAssemblea() {
  const AS = G.proprieta.assemblea, u = Math.max(0, AS.utile);
  const domanda = id => SIM.DOMANDE.find(d => d.id === id);
  return `<div class="pannello mt evidenza"><h2>Assemblea dei soci ${AS.anno}</h2>
    <p class="piccolo">Bilancio dell’anno scorso: utile <b class="${AS.utile < 0 ? 'neg' : ''}">${eur(AS.utile)}</b>. I soci votano in proporzione alle loro quote. Si chiude da sola tra ${giorniA(AS.scade)} giorni.</p>
    <div class="griglia g2">
      <label>Dividendo da proporre<select id="asDiv">${opzioni(u > 0 ? [[0, 'Nessun dividendo'], [1, `25% dell’utile (≈ ${mln(u * 0.25)})`], [2, `50% dell’utile (≈ ${mln(u * 0.5)})`]] : [[0, 'Nessun dividendo (anno in perdita)']], u > 0 ? 1 : 0)}</select></label>
      <label>Il tuo compenso<select id="asComp">${opzioni(SIM.COMPENSI.map((c, i) => [i, `${c.nome} · ${mln(c.annuo)}`]), G.ad.compenso ?? 1)}</select></label>
    </div>
    ${AS.domande.map((id, i) => { const d = domanda(id); if (!d) return ''; const t = typeof d.t === 'function' ? d.t(G) : d.t;
      return `<fieldset class="domanda"><legend>${h(t)}</legend>${d.o.map((o, j) => `<label class="opz"><input type="radio" name="asD${i}" value="${j}" ${j === 0 ? 'checked' : ''}> ${h(o[0])}</label>`).join('')}</fieldset>`; }).join('')}
    <div class="filtri mt"><button class="primario" data-az="chiudi-assemblea">Presenta all’assemblea</button></div>
    <p class="nota">Un dividendo piace ai fondi e alla borsa ma toglie cassa. Un compenso alto senza utili fa arrabbiare i soci: se lo bocciano resti al minimo. Se il bilancio viene respinto la fiducia crolla.</p></div>`;
}
function pannelloOpa() {
  const O = G.proprieta.opa, r = G.proprieta.soci.find(s => s.id === O.socio);
  return `<div class="pannello mt evidenza-err"><h2>OPA ostile di ${h(O.nome)}</h2>
    <p>${h(O.nome)} offre <b>${O.prezzo.toFixed(2)} €</b> per azione (+${Math.round(O.premio * 100)}% sul prezzo di borsa). Ha già il <b>${pct1(r?.quota || 0)}</b>; se con le adesioni supera il 50% prende la compagnia e ti licenzia. Scade tra <b>${giorniA(O.scade)} giorni</b>.</p>
    <div class="filtri"><button data-az="cavaliere" ${O.difese.includes('cavaliere') ? 'disabled' : ''}>Chiama un cavaliere bianco</button>
      <button data-az="ricorso-opa" ${O.difese.includes('ricorso') ? 'disabled' : ''}>Ricorso all’antitrust · 500.000 €</button>
      <button data-az="appello-soci" ${O.difese.includes('appello') ? 'disabled' : ''}>Roadshow con i soci · 150.000 €</button></div>
    <p class="nota">Funziona anche riacquistare azioni in borsa (pagina Finanze) e tenere contenti i soci: un socio di buon umore aderisce di meno.</p></div>`;
}
function pannelloOfferte() {
  const P = G.proprieta;
  return `<div class="pannello mt"><h2>Investitori interessati</h2><div class="carte">${P.offerte.map(o => `<div class="pannello carta">
      <div class="riga" style="margin:0"><b>${h(o.nome)}</b><span class="badge">${h(SIM.TIPI_SOCIO[o.tipo].nome)}</span></div>
      <p class="piccolo muto">${h(SIM.TIPI_SOCIO[o.tipo].descr)}</p>
      <div class="riga"><span>Chiede</span><b>${pct1(o.quota)} della compagnia</b></div>
      <div class="riga"><span>Porta in cassa</span><b>${eur(o.incasso)}</b></div>
      <div class="riga"><span>Prezzo</span><span class="${o.premio >= 0 ? 'pos' : 'neg'}">${o.premio >= 0 ? '+' : ''}${Math.round(o.premio * 100)}% sul valore</span></div>
      <p class="piccolo">${h(SIM.CONDIZIONI[o.cond] || 'Nessuna condizione: voterà sempre con te')}</p>
      <div class="filtri"><button class="primario piccolo" data-az="accetta-offerta" data-id="${o.id}">Accetta</button><button class="piccolo" data-az="rifiuta-offerta" data-id="${o.id}">Rifiuta</button><span class="piccolo muto">scade tra ${giorniA(o.scade)} gg</span></div></div>`).join('')}</div>
    <p class="nota">Ogni nuovo socio diluisce la tua quota: sotto il 50% non decidi più da solo e il CdA può sfiduciarti.</p></div>`;
}
function pannelloUscita() {
  const U = G.proprieta.uscita;
  return `<div class="pannello mt"><h2>${h(nomeSocio(U.socio))} vuole uscire</h2>
    <p>Chiede <b>${eur(U.prezzo)}</b> per le sue quote.${U.obbligo ? ' Il patto firmato all’ingresso ti obbliga a ricomprarle.' : ' Se non le ricompri le venderà a un nuovo investitore: potrebbe essere un concorrente.'}</p>
    <div class="filtri"><button class="primario" data-az="uscita-socio" data-c="1">Ricompra le quote (le altre crescono)</button>${U.obbligo ? '' : '<button data-az="uscita-socio" data-c="0">Lascia che venda</button>'}</div></div>`;
}
VISTE.proprieta = () => {
  const P = G.proprieta, B = G.borsa, ctrl = SIM.controllo(G), seg = SIM.seggi(G), ad = G.ad;
  const umore = u => barretta(u / 100, Math.round(u) + '', [0.4, 0.99]);
  return `<div class="testata"><h1>Soci e CdA</h1><span class="sotto">La tua quota <b>${pct1(SIM.mia(G))}</b> · ${ctrl ? (G.straordinaria ? 'amministrazione straordinaria' : 'decidi tu') : 'non hai la maggioranza'} · fiducia del CdA <b>${Math.round(G.cda.fiducia)}/100</b></span></div>
  ${G.straordinaria ? `<div class="pannello evidenza"><h2>Amministrazione straordinaria</h2><p>Sei commissario fino al <b>${fmtGiorno(G.straordinaria.fine)}</b>. Debiti congelati, soci senza potere, niente acquisizioni né dividendi. Per uscirne servono utili negli ultimi 90 giorni e cassa positiva; altrimenti la compagnia va in liquidazione.</p></div>` : ''}
  ${P.opa ? pannelloOpa() : ''}${P.assemblea ? pannelloAssemblea() : ''}${P.uscita ? pannelloUscita() : ''}${P.offerte.length ? pannelloOfferte() : ''}
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Chi possiede la compagnia</h2>
      <ul class="soci">${P.soci.map(s => `<li><div><b>${h(s.nome)}</b>${s.cond && SIM.CONDIZIONI[s.cond] ? ` <span class="badge b-warn" title="${h(SIM.CONDIZIONI[s.cond])}">patto</span>` : ''}<small>${h(SIM.TIPI_SOCIO[s.tipo]?.descr || '')}${seg[s.id] ? ` · ${seg[s.id]} ${seg[s.id] === 1 ? 'posto' : 'posti'} in CdA` : ''}</small></div>
        <div class="quota"><b>${pct1(s.quota)}</b>${s.id === 'tu' ? '' : umore(s.umore)}</div></li>`).join('')}</ul>
      <p class="nota">Il numero accanto a ogni socio è il suo umore: dipende da ciò che vuole (utili, dividendi, posti di lavoro, debito basso, crescita). Soci scontenti votano contro e abbassano la fiducia.</p></div>
    <div class="pannello"><h2>Consiglio di amministrazione</h2>
      <ul class="consiglio">${P.consiglio.map(c => `<li><span class="avatar piccola" aria-hidden="true">${h(iniziali(c.nome))}</span><div><b>${h(c.nome)}</b><small>${h(nomeSocio(c.socio))}${SIM.CARATTERI[c.carattere] ? ' · ' + SIM.CARATTERI[c.carattere] : ''}</small></div></li>`).join('')}</ul>
      <p class="nota">${ctrl ? 'Hai la maggioranza: le decisioni le prendi tu.' : `Sopra ${eur(SIM.sogliaVoto(G))} di spesa, e per dividendi, aumenti di capitale e nuovi soci, serve il voto. Con la fiducia sotto 20 a fine semestre il CdA vota la tua sfiducia.`}</p></div>
  </div>
  <div class="griglia g2 mt">
    <div class="pannello"><h2>Tu, amministratore delegato</h2>
      <div class="piccolo">Reputazione personale</div>${barretta(ad.rep / 100, Math.round(ad.rep) + '/100', [0.4, 0.99])}
      <div class="riga"><span>Compenso</span><span>${h(SIM.COMPENSI[ad.compenso ?? 1].nome)} · ${mln(G.straordinaria ? 250000 : ad.stipendio)} l’anno</span></div>
      <div class="riga"><span>Patrimonio personale</span><b>${eur(ad.patrimonio)}</b></div>
      ${ad.opzioni.filter(o => !o.fatta).map(o => `<div class="riga"><span>Stock option ${pct1(o.quota)}</span><span>maturano il ${fmtGiorno(o.scade)} · oggi valgono ${eur(Math.max(0, SIM.valoreEquo(G) * o.quota - o.strike))}</span></div>`).join('')}
      ${B.quotata ? `<div class="filtri mt"><button class="piccolo" data-az="azioni-pers" data-q="0.01">Compra l’1% (≈ ${mln(B.prezzo * B.azioni * 0.0102)})</button><button class="piccolo" data-az="azioni-pers" data-q="-0.01">Vendi l’1%</button></div><p class="nota">Con il tuo patrimonio puoi salire nel capitale fino alla maggioranza. Vendere molte azioni preoccupa il mercato.</p>` : '<p class="nota">Dopo la quotazione in borsa potrai comprare azioni con il tuo patrimonio.</p>'}
      ${ad.carriera.length ? `<h3>Carriera</h3><ul class="piccolo">${ad.carriera.map(c => `<li><b>${h(c.nome)}</b> · ${fmtGiorno(c.dal)} – ${fmtGiorno(c.al)} · ${h(c.motivo)}</li>`).join('')}<li><b>${h(G.nome)}</b> · dal ${fmtGiorno(G.inizio)}</li></ul>` : ''}
      <p class="nota">La reputazione cresce con i risultati e le buone risposte nelle interviste, e scende con gli scandali. Se ti licenziano, decide quali compagnie ti chiamano.</p></div>
    <div class="pannello"><h2>Votazioni</h2>${P.votazioni.length ? `<ul class="verbale">${P.votazioni.slice(0, 12).map(v => `<li><span class="badge ${v.approvata ? (v.tipo === 'sfiducia' ? 'b-err' : 'b-ok') : (v.tipo === 'sfiducia' ? 'b-ok' : 'b-err')}">${v.tipo === 'sfiducia' ? (v.approvata ? 'Sfiduciato' : 'Respinta') : v.approvata ? 'Approvata' : 'Bocciata'}</span> <span class="piccolo muto">${fmtGiorno(v.t)} · ${v.si} sì, ${v.no} no${v.trattata ? ' · dopo trattativa' : ''}</span><br><span class="piccolo">${h(v.titolo)}</span></li>`).join('')}</ul>` : '<p class="muto piccolo">Nessuna votazione finora.</p>'}
      ${P.assemblee.length ? `<h3>Assemblee</h3><ul class="piccolo">${P.assemblee.map(a => `<li><b>${a.anno}</b>: ${h(a.righe.join(' · '))}</li>`).join('')}</ul>` : `<p class="nota">L’assemblea dei soci si tiene ogni anno a fine aprile.</p>`}</div>
  </div>
  <div class="pannello mt"><h2>Partecipazioni nei concorrenti</h2>
    <div class="tab-wrap"><table><thead><tr><th>Compagnia</th><th class="num">Tua quota</th><th class="num">Prossimo 5%</th><th>Mosse</th></tr></thead><tbody>
    ${G.rivali.map(R => { const q = R.miaQuota || 0, c5 = SIM.valoreQuotaRiv(G, R, 0.05);
      return `<tr><td><span class="pallino" style="background:${R.colore}"></span>${h(R.nome)}</td><td class="num">${q ? pct1(q) : '—'}</td><td class="num">${eur(c5)}</td>
        <td><div class="filtri" style="margin:0"><button class="piccolo" data-az="quota-riv" data-r="${R.id}" ${q + 0.05 > 0.3001 ? 'disabled title="Oltre il 30% serve un’OPA"' : ''}>Compra 5%</button>${q ? `<button class="piccolo" data-az="vendi-quota-riv" data-r="${R.id}">Vendi</button>` : ''}
        ${q >= 0.1 ? [0.2, 0.35, 0.5].map(p => `<button class="piccolo" data-az="opa-riv" data-r="${R.id}" data-p="${p}" title="Costo ${eur(SIM.costoOpa(G, R, p))}">OPA +${Math.round(p * 100)}% · ${pct(SIM.probOpa(G, R, p))}</button>`).join('') : ''}</div></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="nota">Compra quote di un concorrente in silenzio, poi con almeno il 10% lancia un’OPA: offri un premio sul suo valore e i suoi soci decidono se venderti. Più alto il premio, più è probabile che accettino. La percentuale sul pulsante è la probabilità di successo. Oltre il 30% la legge obbliga all’OPA.</p></div>`;
};

/* ---------- Licenziamento e carriera ---------- */
function modaleLicenziamento() {
  const L = G.licenziamento || {}, off = (L.offerte || []).map(id => G.rivali.find(r => r.id === id)).filter(Boolean);
  suono('cattiva');
  modale({ titolo: 'Sei stato licenziato', corpo: `<p>${h(G.esito.motivo)}.</p><p class="muto piccolo">Reputazione personale ${Math.round(G.ad.rep)}/100 · patrimonio ${eur(G.ad.patrimonio)} · ${Math.round((G.ora - G.inizio) / GIORNO)} giorni alla guida di ${h(G.nome)}</p>
    <div class="opzioni-dilemma">${off.map(R => { const n = SIM.flottaRivale(R).reduce((s, x) => s + x.n, 0); return `<button data-az="carriera" data-r="${R.id}" class="primario"><b>Diventa AD di ${h(R.nome)}</b><small>Circa ${n} aerei e ${Object.keys(R.rotte).length} rotte, base ${R.hub}. La tua carriera continua lì.</small></button>`; }).join('')}
      <button data-az="straordinaria"><b>Resta come commissario straordinario</b><small>Un anno con debiti congelati e soci senza potere, ma niente acquisizioni né dividendi. Se torni in utile resti alla guida, altrimenti liquidazione.</small></button>
      <button data-az="esci"><b>Chiudi qui la carriera</b><small>Torna al menu</small></button></div>` });
}

/* ---------- Passeggeri: abituali, lettere, recensioni ---------- */
function pannelloPasseggeri() {
  const PX = G.passeggeri; if (!PX) return '';
  const rec = PX.recensioni, media = rec.length ? rec.reduce((s, r) => s + r.stelle, 0) / rec.length : 0, aperte = PX.lettere.filter(l => !l.risposta);
  return `<div class="griglia g2 mt">
    <div class="pannello"><h2>Viaggiatori abituali</h2>${PX.abituali.length ? `<ul class="soci">${PX.abituali.map(a => `<li><div><b>${h(a.nome)}</b><small>${h(a.chi)} · ${linkRotta(a.k)} · ${a.voli} voli con te</small></div><div class="quota">${barretta(a.soddisfazione / 100, Math.round(a.soddisfazione) + '', [0.4, 0.85])}</div></li>`).join('')}</ul>` : '<p class="muto piccolo">Arriveranno quando le tue rotte avranno qualche settimana di storia.</p>'}
      <p class="nota">Volano con te ogni settimana. Ritardi, cancellazioni e prezzi troppo alti li fanno andare dai concorrenti; se sono molto contenti portano i colleghi (+3% di domanda sulla rotta per un mese).</p></div>
    <div class="pannello"><h2>Lettere dei passeggeri</h2>${aperte.length ? aperte.map(l => `<div class="lettera"><p class="piccolo"><b>${h(l.nome)}</b>${l.abituale ? ' <span class="badge b-warn">abituale</span>' : ''} · ${fmtGiorno(l.t)} · risposta entro ${giorniA(l.scade)} gg</p><p>«${h(l.testo)}»</p>
        <div class="filtri"><button class="piccolo primario" data-az="lettera" data-id="${l.id}" data-r="rimborso">Rimborso · 250 €</button><button class="piccolo" data-az="lettera" data-id="${l.id}" data-r="voucher">Buono · 80 €</button><button class="piccolo" data-az="lettera" data-id="${l.id}" data-r="scuse">Solo scuse</button></div></div>`).join('') : '<p class="muto piccolo">Nessuna lettera in attesa di risposta.</p>'}
      ${PX.lettere.filter(l => l.risposta).slice(0, 4).map(l => `<p class="piccolo muto">${l.grazie ? '💌' : '✉️'} ${h(l.nome)}: ${l.grazie ? h(l.testo) : `risposta: ${h({ rimborso: 'rimborso', voucher: 'buono', scuse: 'scuse', ignorata: 'nessuna (ignorata)' }[l.risposta] || l.risposta)}`}</p>`).join('')}
      <p class="nota">Una lettera senza risposta per 10 giorni costa reputazione.</p></div>
  </div>
  <div class="pannello mt"><h2>Recensioni</h2><p class="stelle">${stelline(Math.round(media))}<b>${media.toFixed(1).replace('.', ',')}</b></p>
    ${rec.length ? `<ul class="recensioni">${rec.slice(0, 8).map(r => `<li><div class="riga" style="margin:0"><b>${h(r.nome)}</b><span class="stelle-p">${stelline(r.stelle)}</span></div><small class="muto">${h(r.chi)} · volo ${h(r.volo)} ${r.da}–${r.a} · ${fmtGiorno(r.t)}</small><p>${h(r.testo)}</p></li>`).join('')}</ul>` : '<p class="muto piccolo">Le prime recensioni arrivano dopo i primi voli.</p>'}</div>`;
}
const _fedeltaBase = VISTE.fedelta;
VISTE.fedelta = () => _fedeltaBase() + pannelloPasseggeri();

/* ---------- Azioni ---------- */
Object.assign(AZ, {
  'vota-cda': () => { const V = UI.votoAttesa; if (V) mostraVoto(SIM.A.votaCda(G, V.voto)); },
  'tratta-cda': () => { const V = UI.votoAttesa; if (V) mostraVoto(SIM.A.votaCda(G, V.voto, true)); },
  'chiudi-assemblea': () => {
    const AS = G.proprieta.assemblea; if (!AS) return;
    const risposte = AS.domande.map((_, i) => +(document.querySelector(`input[name="asD${i}"]:checked`)?.value ?? 2));
    if (esito(SIM.A.assemblea(G, { dividendo: +$('#asDiv').value, compenso: +$('#asComp').value, risposte }))) dopoAzione();
  },
  'accetta-offerta': el => { const o = G.proprieta.offerte.find(x => x.id === el.dataset.id); if (!o) return; conferma(`Far entrare ${o.nome}?`, `Incassi ${eur(o.incasso)} e cedi il ${pct1(o.quota)} della compagnia. ${SIM.CONDIZIONI[o.cond] || ''}`, 'Accetta', () => { if (esito(SIM.A.accettaOfferta(G, o.id))) dopoAzione(); }); },
  'rifiuta-offerta': el => { esito(SIM.A.rifiutaOfferta(G, el.dataset.id)); render(); },
  'uscita-socio': el => { if (esito(SIM.A.uscitaSocio(G, el.dataset.c === '1'))) dopoAzione(); },
  'azioni-pers': el => { if (esito(SIM.A.azioniPersonali(G, +el.dataset.q))) render(); },
  cavaliere: () => conferma('Chiamare un cavaliere bianco?', 'Un investitore amico sottoscrive un aumento di capitale del 15%: porta cassa, diluisce tutti (anche il predatore) e non aderirà mai all’OPA.', 'Chiama', () => { if (esito(SIM.A.cavaliereBianco(G))) render(); }),
  'ricorso-opa': () => { if (esito(SIM.A.ricorsoOpa(G))) render(); },
  'appello-soci': () => { if (esito(SIM.A.appelloSoci(G))) render(); },
  'quota-riv': el => { if (esito(SIM.A.compraQuotaRivale(G, el.dataset.r, 0.05))) render(); },
  'vendi-quota-riv': el => { if (esito(SIM.A.vendiQuotaRivale(G, el.dataset.r))) render(); },
  'opa-riv': el => { const R = G.rivali.find(x => x.id === el.dataset.r), p = +el.dataset.p; conferma(`OPA su ${R.nome}?`, `Offri il ${Math.round(p * 100)}% in più del suo valore: costo ${eur(SIM.costoOpa(G, R, p))} se riesce, probabilità ${pct(SIM.probOpa(G, R, p))}. Se fallisce paghi il 2% di spese e perdi un po’ di fiducia.`, 'Lancia l’OPA', () => { esito(SIM.A.opaRivale(G, R.id, p)); dopoAzione(); }); },
  'apri-licenziamento': () => modaleLicenziamento(),
  straordinaria: () => { if (esito(SIM.A.straordinaria(G))) { chiudiModale(); dopoAzione(); } },
  carriera: async el => { const N = SIM.carriera(G, el.dataset.r); if (!N) return; G.esito.visto = true; await salva(); chiudiModale(); avviaPartita(N); await salva(); toast(`Benvenuto in ${N.nome}: sei il nuovo amministratore delegato`, 'buona'); },
  lettera: el => { if (esito(SIM.A.rispondiLettera(G, el.dataset.id, el.dataset.r))) render(); }
});
