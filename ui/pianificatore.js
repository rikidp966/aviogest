'use strict';
// AvioGest — Pianificatore automatico: programma tutta la flotta sulle rotte aperte

function apriPianificatore() {
  modale({ titolo: 'Pianifica tutta la flotta', larga: true, corpo: '<p class="muto">Sto calcolando il piano migliore per i tuoi aerei sulle rotte aperte…</p>' });
  setTimeout(() => {
    const P = UI.pianoFlotta = SIM.pianificaFlotta(G);
    if (P.errore) return modale({ titolo: 'Pianifica tutta la flotta', corpo: `<p>${h(P.errore)}</p>` });
    const st = UI.pianoPersonale = SIM.stimaPersonalePiano(G, P);
    disegnaPianificatore();
  }, 30);
}
function disegnaPianificatore() {
  const P = UI.pianoFlotta, st = UI.pianoPersonale, urg = !!UI.pianoUrgente, ae = id => G.aerei.find(a => a.id === id);
  const totale = P.costo + (st.n ? (urg ? st.costoUrgente : 0) : 0);
  modale({ titolo: 'Pianifica tutta la flotta', larga: true, corpo: `
    <p class="piccolo">Prima ogni rotta aperta riceve almeno un volo di andata e ritorno al giorno, poi gli aerei con tempo libero prendono altri voli dove la domanda li regge e il margine è più alto. Usa solo le rotte che hai già.</p>
    <div class="sett-sintesi"><div><small>Rotte coperte</small><b>${P.rotteCoperte}/${P.rotteTotali}</b></div><div><small>Voli a settimana</small><b>${num(P.voliSett)}</b></div><div><small>Aerei programmati</small><b>${P.piani.length}/${P.piani.length + P.ferme.length}</b></div></div>
    <ul class="elenco piano-aerei">${P.piani.map(p => `<li><b class="mono">${h(p.marche)}</b><span class="muto piccolo">${MOD[p.modello].nome} · base ${p.base}${p.spostato ? ' <span class="badge b-warn">cambia base</span>' : ''}</span><span class="piano-descr">${h(p.descr)}</span></li>`).join('')}
      ${P.ferme.map(id => `<li><b class="mono">${h(ae(id).marche)}</b><span class="muto piccolo">${MOD[ae(id).modello].nome}</span><span class="piano-descr muto">resta a terra: nessuna rotta adatta libera</span></li>`).join('')}</ul>
    ${P.scoperte.length ? `<h3 class="mt">Rotte senza voli</h3><ul class="problemi">${P.scoperte.map(s => `<li class="avviso">${s.k.replace('-', '–')}: ${h(s.motivo)}</li>`).join('')}</ul>` : '<ul class="problemi mt"><li class="ok">✓ Tutte le rotte aperte hanno almeno un volo al giorno</li></ul>'}
    <ul class="problemi mt">
      ${P.slot.map(s => `<li class="avviso">Compra ${s.n} slot a ${s.i} · ${eur(s.costo)}</li>`).join('')}
      ${st.n ? `<li class="avviso">Servono ${st.n} equipaggi in più (${eur(st.costo)} con assunzione normale, ${eur(st.costoUrgente)} con agenzia in 2 giorni)</li>` : '<li class="ok">✓ Gli equipaggi attuali bastano</li>'}
      ${P.ferme.length ? `<li class="avviso">${P.ferme.length} aerei restano senza voli: apri altre rotte o vendili</li>` : ''}
    </ul>
    ${st.n ? `<label class="interruttore mt" style="border:0"><input type="checkbox" id="pianoUrgente" ${urg ? 'checked' : ''}><span class="lev" aria-hidden="true"></span><span><b>Assumi subito gli equipaggi mancanti con l’agenzia</b><small>Operativi in 2 giorni invece di ${SIM.giorniAssunzione(false)}: nel frattempo i turni scoperti fanno cancellare voli${G.auto?.equipaggi ? '. Senza questa scelta il pilota automatico li assume stanotte con l’assunzione normale' : ''}</small></span></label>` : ''}
    <p class="nota">Sostituisce i programmi attuali di tutti gli aerei. L’orario dell’altra stagione non cambia. Dopo puoi ritoccare ogni aereo a mano dalla Programmazione.</p>`,
    piede: `<button data-az="chiudi">Annulla</button><button class="primario" data-az="applica-piano" ${G.cassa < totale ? 'disabled' : ''}>Applica il piano${totale ? ` · ${eur(totale)}` : ''}</button>` });
}
