'use strict';
// AvioGest — Imprevisti e grandi crisi, impostazioni di realismo, personale (riserve, contratti, carriere, benessere,
// tecnici e assistenza a terra), marchio della compagnia

/* ---------- Grandi crisi: il gioco si ferma e chiede una decisione ---------- */
function bannerEmergenza() {
  const E = G.emergenza; if (!E) return '';
  return `<div class="banner-riunione emergenza"><span class="br-icona" aria-hidden="true">🚨</span><div><b>Emergenza</b><span class="piccolo">${h(E.titolo)} · decidi entro ${giorniA(E.scade)} giorni</span></div><button class="btn primario" data-az="apri-emergenza">Decidi</button></div>`;
}
function apriEmergenza() {
  const E = G.emergenza; if (!E) return;
  vel = 0; aggiornaVel();
  modale({ titolo: `🚨 ${E.titolo}`, corpo: `<p>${h(E.testo)}</p><div class="opzioni-dilemma">${E.opzioni.map((o, i) => `<button data-az="emergenza" data-i="${i}" class="${i === 0 ? 'primario' : ''}"><b>${h(o.t)}</b><small>${h(o.d)}</small></button>`).join('')}</div>
    <p class="nota">Il tempo è fermo finché non decidi. Se chiudi la finestra, la trovi in Panoramica: dopo ${giorniA(E.scade)} giorni senza risposta vale l’ultima opzione.</p>` });
}

/* ---------- Impostazioni: imprevisti, assicurazione, marchio ---------- */
const COLORI_MARCHIO = ['#2a78d6', '#c2255c', '#0b7a4b', '#e8590c', '#5f3dc4', '#0c8599', '#d6336c', '#495057'];
const SIMBOLI = {
  aereo: '<path d="M20 15.5v-1.6l-6.7-4.2V5.2a1.3 1.3 0 0 0-2.6 0v4.5L4 13.9v1.6l6.7-2.1v4.1L9 18.8v1.2l3-.8 3 .8v-1.2l-1.7-1.3v-4.1z"/>',
  stella: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  ala: '<path d="M3 15c5-1 9-4 13-9l5-1-2 5c-4 5-9 8-16 8z"/>',
  sole: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" fill="none"/>'
};
function applicaMarchio() {
  if (!G) return; const M = G.marchio || { colore: '#2a78d6', simbolo: 'aereo' };
  document.documentElement.style.setProperty('--marchio', M.colore);
  const s = $('.barra .logo-segno svg'); if (s) s.innerHTML = SIMBOLI[M.simbolo] || SIMBOLI.aereo;
}
function pannelloRealismo() {
  const M = G.marchio || {};
  return `<div class="griglia g2 mt">
    <div class="pannello"><h2>Imprevisti</h2><div class="form">
      <label class="pieno">Quanti imprevisti<select data-imp="imprevisti">${opzioni(Object.entries(SIM.LIVELLI_IMPREVISTI).map(([k, x]) => [k, x.nome]), G.imprevisti)}</select></label>
      <label class="pieno">Assicurazione della flotta<select data-imp="assicurazione">${opzioni(Object.entries(SIM.ASSICURAZIONI).map(([k, x]) => [k, `${x.nome} · premio ×${x.premio} · paghi il ${Math.round(x.franchigia * 100)}% dei danni`]), G.assicurazione)}</select></label></div>
      <p class="nota">Meteo, guasti, emergenze, scioperi e crisi restano sempre casuali: qui scegli solo quanto spesso capitano. L’assicurazione copre guasti, impatti con uccelli e controlli straordinari.</p></div>
    <div class="pannello"><h2>Il tuo marchio</h2>
      <p class="piccolo">Colore e simbolo della compagnia: compaiono nel menu e sulla mappa (rotte e aerei in volo).</p>
      <div class="colori-marchio">${COLORI_MARCHIO.map(c => `<button type="button" data-az="marchio" data-colore="${c}" class="${c === M.colore ? 'on' : ''}" style="background:${c}" aria-label="Colore ${c}"></button>`).join('')}</div>
      <div class="simboli-marchio">${Object.entries(SIMBOLI).map(([k, svg]) => `<button type="button" data-az="marchio" data-simbolo="${k}" class="${k === M.simbolo ? 'on' : ''}" aria-label="Simbolo ${k}"><svg viewBox="0 0 24 24">${svg}</svg></button>`).join('')}</div></div>
  </div>`;
}

/* ---------- Personale ---------- */
const ASSENZE = { malattia: 'in malattia', simulatore: 'al simulatore', 'limite di 900 ore annue': 'limite annuale di ore' };
function infoEq(e) { return `${SIM.CONTRATTI[e.contratto || 'fisso'].nome.toLowerCase()}${e.scadenza ? ` fino al ${fmtGiorno(e.scadenza)}` : ''} · ${e.anni || 1} anni in compagnia · comandante di ${e.etaCpt || '?'} anni`; }
function statoEq(e, x) {
  if (e.stato !== 'attivo') return `<span class="badge b-info">Dal ${fmtGiorno(e.pronto)}</span> <span class="muto piccolo">${h(e.motivo || '')}</span>`;
  if (SIM.assente(e, G.ora)) return `<span class="badge b-warn">${ASSENZE[e.assenza] || 'assente'} fino al ${fmtGiorno(e.assenteFino)}</span>`;
  if (e.riserva) return '<span class="badge b-info">Riserva</span>';
  return x.turni ? '<span class="badge b-ok">In servizio</span>' : '<span class="badge">Senza turni</span>';
}
function azioniEq(e) {
  return `${G.basi.length > 1 ? `<button class="piccolo" data-az="eq-trasferisci" data-id="${e.id}">Trasferisci</button>` : ''}<button class="piccolo" data-az="eq-riserva" data-id="${e.id}" data-si="${e.riserva ? '' : '1'}">${e.riserva ? 'Metti nei turni' : 'Metti in riserva'}</button>${e.contratto && e.contratto !== 'fisso' ? `<button class="piccolo" data-az="eq-stabilizza" data-id="${e.id}">Assumi a tempo indeterminato</button>` : ''}<button class="piccolo" data-az="eq-riqualifica" data-id="${e.id}">Riqualifica</button><button class="piccolo pericolo" data-az="eq-licenzia" data-id="${e.id}">Licenzia</button>`;
}
function pannelliPersonale() {
  const ris = SIM.pianoRiserve(G), assenti = G.equipaggi.filter(e => SIM.assente(e, G.ora)), B = SIM.BENESSERE, C = G.clima;
  return `<div class="griglia g2 mt">
    <div class="pannello carta"><h2>Riserve e assenze</h2>
      <div class="riga"><span>Assenti oggi</span><b class="${assenti.length ? 'neg' : ''}">${assenti.length}</b></div>
      <div class="riga"><span>Equipaggi di riserva</span><b>${G.equipaggi.filter(e => e.riserva).length}</b></div>
      <label class="campo mt">Riserve per base<select data-imp="quotaRiserve">${opzioni([[0, 'Nessuna'], [0.05, '5% degli equipaggi'], [0.1, '10% degli equipaggi'], [0.15, '15% degli equipaggi'], [0.2, '20% degli equipaggi']], G.quotaRiserve)}</select></label>
      ${ris.length ? `<div class="filtri mt"><button class="primario" data-az="assumi-riserve">Assumi ${ris.length} ${ris.length === 1 ? 'riserva' : 'riserve'}</button>${G.auto?.equipaggi ? '<span class="piccolo muto">o lascia fare al pilota automatico</span>' : ''}</div>` : ''}
      <p class="nota">Ogni giorno qualche equipaggio si ammala (di più in inverno e se vola troppe ore) e ogni 6 mesi passa 2 giorni al simulatore. Le riserve non hanno turni fissi e prendono il posto di chi manca: senza riserve quei voli si cancellano.</p></div>
    <div class="pannello carta"><h2>Clima e benessere</h2>
      <label class="campo">Benessere aziendale<select data-imp="benessere">${opzioni(Object.entries(B).map(([k, x]) => [k, `${x.nome}${x.costo ? ` · ${x.costo} € a persona al giorno` : ''}`]), G.benessere)}</select></label>
      <p class="piccolo">Più benessere: morale più alto, meno malattie, meno dimissioni${B.completo.alloggi ? ', alberghi fuori base più economici con gli alloggi' : ''}.</p>
      <div class="filtri"><button data-az="sondaggio-clima">Sondaggio sul clima · 10.000 €</button><button data-az="corso-cabina">Corso di servizio per la cabina · ${mln(150000 + 1000 * G.equipaggi.length)}</button></div>
      ${G.mod?.corsoCabina && G.ora < G.mod.corsoCabina ? `<p class="piccolo pos">Corso di servizio attivo fino al ${fmtGiorno(G.mod.corsoCabina)}: passeggeri più soddisfatti.</p>` : ''}
      ${C ? `<h3 class="mt">Sondaggio del ${fmtGiorno(C.t)} · morale ${C.morale}/100</h3><ul class="elenco">${C.voci.map(v => `<li><b>${h(v.t)}</b><span class="spazio"></span><span class="piccolo ${v.v < -0.02 ? 'neg' : v.v > 0.02 ? 'pos' : ''}">${h(v.testo)}</span></li>`).join('')}</ul>` : ''}</div>
  </div>
  <div class="griglia g2 mt">
    <div class="pannello carta"><h2>Manutenzione</h2>
      <label class="interruttore" style="border:0"><input type="checkbox" data-imp-chk="manutenzioneInterna" ${G.manutenzioneInterna ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Tecnici della compagnia</b><small>${num(3000 + 700 * flotta().length)} € al giorno di stipendi. Ispezioni in 6 ore invece di 8 e il 35% più economiche, guasti un po’ più rari. Senza: paghi l’officina esterna a ogni lavoro.</small></span></label></div>
    <div class="pannello carta"><h2>Assistenza a terra</h2>
      <p class="piccolo">Nelle tue basi puoi avere personale di rampa e check-in tuo: costo fisso, ma handling −60% e voli più puntuali.</p>
      ${G.basi.map(b => `<label class="interruttore" style="border:0"><input type="checkbox" data-handling="${b}" ${(G.handlingProprio || []).includes(b) ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>${b} · ${h(citta(b))}</b><small>${eur(2500 * SIM.fattoreLavoro(b))} al giorno</small></span></label>`).join('')}</div>
  </div>`;
}
