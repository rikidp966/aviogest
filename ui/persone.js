'use strict';
// AvioGest — Programma fedeltà (livelli, miglia, carta di credito) e personale (mercato del lavoro, scuola piloti, trattative)

/* ---------- Fedeltà ---------- */
VISTE.fedelta = () => {
  const F = G.fedelta || {}, inCorso = G.direzione.progetti.find(p => p.tipo === 'fedelta' && !p.fatto);
  if (!F.attivo) return `<div class="testata"><h1>Programma fedeltà</h1></div>
    <div class="pannello"><p>Un programma fedeltà con livelli Argento, Oro e Platino tiene con te i viaggiatori frequenti: più clienti Business e Premium, un po’ più di passeggeri su tutta la rete e ricavi da una carta di credito in partnership. In cambio le miglia sono un debito: ogni miglio riscattato è un posto regalato.</p>
    ${inCorso ? `<p><span class="badge b-info">In preparazione</span> pronto il ${fmtGiorno(inCorso.fine)}</p>` : `<div class="filtri"><button class="primario" data-az="progetto" data-t="fedelta">Avvia il programma · ${mln(D.PROGETTI.fedelta.costo)}</button><span class="piccolo muto">30 giorni di preparazione, poi ${eur(D.PROGETTI.fedelta.quotidiano)} al giorno di gestione</span></div>`}</div>`;
  const g = SIM.generosita(G), lv = SIM.livelliFedelta(G), u = G.storico.slice(-30), costo30 = u.reduce((s, x) => s + (x.dettaglio.fedelta || 0), 0), U = F.ultimo || {};
  const sel = (k, obj, v) => `<select data-fed="${k}">${opzioni(Object.entries(obj).map(([x, o]) => [x, o.nome]), v)}</select>`;
  return `<div class="testata"><h1>${h(F.nome)}</h1><span class="sotto">Il tuo programma fedeltà</span></div>
  <div class="kpi">
    <div><small>Soci</small><b>${num(F.iscritti)}</b><span>${num(lv.platino)} Platino · ${num(lv.oro)} Oro · ${num(lv.argento)} Argento</span></div>
    <div><small>Miglia in circolazione</small><b>${num(F.miglia / 1e6, 1)} mln</b><span>debito ${mln(F.miglia * SIM.VALORE_MIGLIO)}</span></div>
    <div><small>Costo dei premi 30 gg</small><b>${mln(costo30)}</b><span>miglia riscattate e vantaggi</span></div>
    <div><small>Generosità</small><b>${Math.round(g * 100)}%</b><span>+${Math.round(12 * g)}% clienti Business e Premium</span></div>
  </div>
  <div class="griglia g2">
    <div class="pannello"><h2>Regole</h2><div class="form">
      <label class="pieno">Nome del programma<input data-fed="nome" value="${h(F.nome)}" maxlength="30"></label>
      <label>Miglia accumulate${sel('accumulo', SIM.ACCUMULO, F.accumulo)}</label>
      <label>Scadenza${sel('scadenza', SIM.SCADENZE, F.scadenza)}</label>
      <label class="pieno">Vantaggi dei livelli${sel('vantaggi', SIM.VANTAGGI, F.vantaggi)}</label></div>
      <p class="nota">Più miglia, nessuna scadenza e vantaggi ricchi rendono il programma più attraente (più soci, più clienti d’affari), ma aumentano miglia in circolazione e costi. Miglia che scadono presto fanno risparmiare ma irritano i clienti (reputazione −1).</p>
      <p class="piccolo">Ieri: ${num(U.guadagnate || 0)} miglia guadagnate, ${num(U.riscattate || 0)} riscattate, ${num(U.scadute || 0)} scadute.</p></div>
    <div class="pannello carta"><h2>Carta di credito</h2>${F.carta ? `<p><b>${h(F.carta.banca)}</b> paga ${eur(F.carta.perTitolare)} all’anno per ogni titolare della carta ${h(F.nome)}.</p>
      <div class="riga"><span>Titolari</span><b>${num(F.titolari || 0)}</b></div><div class="riga"><span>Ricavo di ieri</span><b>${eur(U.ricaviCarta || 0)}</b></div><div class="riga"><span>Scadenza contratto</span><span>${fmtGiorno(F.carta.fine)}</span></div>`
      : (F.offerteCarta || []).length ? `<p class="piccolo">Le banche vogliono una carta col tuo marchio: pagano per ogni titolare. Più soci e più generosità = più titolari.</p><ul class="elenco">${F.offerteCarta.map(o => `<li><b>${h(o.banca)}</b><span class="piccolo muto">${eur(o.perTitolare)} all’anno a titolare · ${o.anni} anni</span><span class="spazio"></span><button class="piccolo primario" data-az="firma-carta" data-id="${o.id}">Firma</button></li>`).join('')}</ul>` : '<p class="muto piccolo">Nessuna offerta: le banche si rifanno vive a metà mese.</p>'}</div>
  </div>`;
};

/* ---------- Personale: mercato del lavoro, scuola, contratto, trattativa ---------- */
function pannelliLavoro() {
  const L = G.lavoro, T = G.trattativa, paga = G.stipendio * L.contratto, gap = paga / L.mercato - 1, S = L.scuola;
  return `<div class="griglia g2 mt">
    <div class="pannello carta"><h2>Mercato del lavoro</h2>
      <div class="riga"><span>Disponibilità di piloti</span><b class="${L.piloti > 1.15 ? 'neg' : ''}">${L.piloti > 1.25 ? 'grave carenza' : L.piloti > 1.08 ? 'scarsa' : L.piloti < 0.95 ? 'abbondante' : 'normale'}</b></div>
      <div class="riga"><span>Tempo per assumere</span><span>${SIM.giorniAssunzione(false)} giorni (urgente: 2)</span></div>
      <div class="riga"><span>Le tue paghe rispetto al mercato</span><b class="${gap < -0.03 ? 'neg' : gap > 0.03 ? 'pos' : ''}">${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}%</b></div>
      <div class="riga"><span>Contratto collettivo</span><span>${L.contratto > 1 ? `+${((L.contratto - 1) * 100).toFixed(1)}% sulle paghe base` : 'paghe base'}${L.premio ? ' · premio di risultato' : ''}</span></div>
      <div class="riga"><span>Prossimo rinnovo</span><span>${T ? '<b>trattativa in corso</b>' : fmtGiorno(L.scadenzaContratto)}</span></div>
      ${T ? `<div class="filtri mt"><button class="primario" data-az="apri-trattativa">Vai alla trattativa</button></div>` : ''}
      <p class="nota">Il mercato dei piloti si fa più caro col tempo: se le tue paghe restano indietro il morale scende e il sindacato chiede di più.</p></div>
    <div class="pannello carta"><h2>Scuola piloti</h2>${S ? `<div class="riga"><span>Aperta dal</span><span>${fmtGiorno(S.aperta)}</span></div><div class="riga"><span>Piloti formati</span><b>${S.formati || 0}</b></div><div class="riga"><span>Piloti pronti da assumere</span><b>${L.cadetti}</b></div><div class="riga"><span>Prossimo corso finisce</span><span>${fmtGiorno(S.prossimo)}</span></div>
      <p class="nota">Con piloti della scuola un equipaggio è operativo in 3 giorni e la parte dei piloti costa il 60% in meno. Costo di gestione 4.000 € al giorno.</p>`
      : `<p class="piccolo">Forma i tuoi piloti invece di cercarli sul mercato: 6 nuovi piloti ogni 2 mesi (il primo corso dura 4 mesi), assunzioni in 3 giorni e molto più economiche.</p><div class="filtri"><button data-az="scuola" ${G.cassa < 2.5e6 ? 'disabled' : ''}>Apri la scuola · 2,5 M€</button><span class="piccolo muto">poi 4.000 € al giorno</span></div>`}</div>
  </div>`;
}
function bannerTrattativa() {
  const T = G.trattativa; if (!T) return '';
  return `<div class="banner-riunione trattativa"><span class="br-icona" aria-hidden="true">🤝</span><div><b>Trattativa sindacale</b><span class="piccolo">Il sindacato chiede +${(T.richiesta * 100).toFixed(1)}% · ${4 - T.round} incontri prima dello sciopero · risposta entro ${giorniA(T.scade)} giorni</span></div><button class="btn primario" data-az="apri-trattativa">Tratta</button></div>`;
}
function apriTrattativa() {
  const T = G.trattativa; if (!T) return;
  const proposta = UI.propostaSind ?? Math.round(T.richiesta * 0.6 * 1000) / 10;
  modale({ titolo: 'Trattativa per il nuovo contratto', corpo: `
    <p>Il sindacato di piloti e assistenti di volo chiede un aumento del <b>${(T.richiesta * 100).toFixed(1)}%</b>${T.iniziale !== T.richiesta ? ` (all’inizio chiedeva il ${(T.iniziale * 100).toFixed(1)}%)` : ''}. Il morale è ${Math.round(G.morale)}/100.</p>
    ${T.offerte.length ? `<p class="piccolo muto">Le tue proposte: ${T.offerte.map(o => `${(o.aumento * 100).toFixed(1)}%${o.premio ? ' + premio' : ''}`).join(' · ')}</p>` : ''}
    <div class="form"><label>La tua proposta<span class="input-euro"><input type="number" id="sindAumento" min="0" max="${(T.richiesta * 100).toFixed(1)}" step="0.1" value="${Math.min(proposta, T.richiesta * 100).toFixed(1)}"> %</span></label>
      <label class="interruttore" style="border:0"><input type="checkbox" id="sindPremio"><span class="lev" aria-hidden="true"></span><span><b>Premio di risultato</b><small>3% dell’utile di ogni giorno in attivo va al personale: vale per il sindacato quanto un 1,5% di aumento</small></span></label></div>
    <p class="nota">Ogni aumento vale per sempre su tutte le paghe. Il sindacato ha un minimo che non dice: se ci arrivi firma, altrimenti abbassa un po’ la richiesta. Dopo 4 incontri senza accordo scatta lo sciopero.</p>`,
    piede: `<button class="pericolo" data-az="sind" data-t="rompi">Rompi la trattativa</button><button data-az="sind" data-t="accetta">Accetta ${(T.richiesta * 100).toFixed(1)}%</button><button class="primario" data-az="sind" data-t="proponi">Proponi</button>` });
}
