// AvioGest — dati statici del gioco (aeroporti, aerei, concorrenti, scenari, traguardi)
const DATI = (() => {
  // iata, nome, città, paese, lat, lon, bacino (migliaia di abitanti della città), turismo 0-1, slot regolati, tassa €/pax, prezzo slot giornaliero
  const A = [
    ['FCO', 'Roma Fiumicino', 'Roma', 'IT', 41.800, 12.250, 4300, .8, 1, 26, 60000],
    ['LIN', 'Milano Linate', 'Milano', 'IT', 45.445, 9.277, 3200, .3, 1, 20, 150000],
    ['MXP', 'Milano Malpensa', 'Milano', 'IT', 45.630, 8.723, 3200, .3, 1, 18, 40000],
    ['BGY', 'Bergamo Orio al Serio', 'Bergamo', 'IT', 45.674, 9.704, 1600, .3, 0, 12, 0],
    ['NAP', 'Napoli Capodichino', 'Napoli', 'IT', 40.886, 14.291, 3000, .6, 1, 16, 35000],
    ['CTA', 'Catania Fontanarossa', 'Catania', 'IT', 37.467, 15.066, 1100, .7, 0, 14, 0],
    ['PMO', 'Palermo Punta Raisi', 'Palermo', 'IT', 38.176, 13.091, 1200, .7, 0, 14, 0],
    ['BRI', 'Bari Palese', 'Bari', 'IT', 41.139, 16.761, 1200, .5, 0, 13, 0],
    ['BDS', 'Brindisi Casale', 'Brindisi', 'IT', 40.658, 17.947, 650, .7, 0, 11, 0],
    ['CAG', 'Cagliari Elmas', 'Cagliari', 'IT', 39.251, 9.054, 800, .8, 0, 12, 0],
    ['OLB', 'Olbia Costa Smeralda', 'Olbia', 'IT', 40.899, 9.518, 300, 1, 0, 12, 0],
    ['AHO', 'Alghero Fertilia', 'Alghero', 'IT', 40.632, 8.291, 250, .8, 0, 10, 0],
    ['VCE', 'Venezia Tessera', 'Venezia', 'IT', 45.505, 12.352, 1500, 1, 1, 19, 50000],
    ['TRN', 'Torino Caselle', 'Torino', 'IT', 45.200, 7.650, 2000, .4, 0, 15, 0],
    ['BLQ', 'Bologna Marconi', 'Bologna', 'IT', 44.535, 11.289, 1500, .5, 0, 15, 0],
    ['FLR', 'Firenze Peretola', 'Firenze', 'IT', 43.810, 11.205, 1400, 1, 1, 18, 45000],
    ['PSA', 'Pisa Galilei', 'Pisa', 'IT', 43.684, 10.392, 800, .8, 0, 12, 0],
    ['GOA', 'Genova Cristoforo Colombo', 'Genova', 'IT', 44.413, 8.838, 1100, .4, 0, 13, 0],
    ['VRN', 'Verona Villafranca', 'Verona', 'IT', 45.396, 10.888, 1000, .6, 0, 12, 0],
    ['TRS', 'Trieste Ronchi', 'Trieste', 'IT', 45.827, 13.472, 500, .4, 0, 11, 0],
    ['SUF', 'Lamezia Terme', 'Lamezia', 'IT', 38.905, 16.242, 900, .5, 0, 11, 0],
    ['REG', 'Reggio Calabria', 'Reggio Calabria', 'IT', 38.071, 15.652, 500, .3, 0, 10, 0],
    ['PEG', 'Perugia San Francesco', 'Perugia', 'IT', 43.096, 12.513, 600, .5, 0, 9, 0],
    ['CDG', 'Parigi Charles de Gaulle', 'Parigi', 'FR', 49.010, 2.548, 11000, 1, 1, 28, 220000],
    ['LHR', 'Londra Heathrow', 'Londra', 'GB', 51.470, -0.454, 12000, 1, 1, 35, 400000],
    ['MAD', 'Madrid Barajas', 'Madrid', 'ES', 40.472, -3.561, 6500, .8, 1, 20, 120000],
    ['BCN', 'Barcellona El Prat', 'Barcellona', 'ES', 41.297, 2.078, 5000, 1, 1, 18, 100000],
    ['LIS', 'Lisbona Humberto Delgado', 'Lisbona', 'PT', 38.774, -9.134, 2900, 1, 1, 16, 70000],
    ['AMS', 'Amsterdam Schiphol', 'Amsterdam', 'NL', 52.310, 4.768, 4000, .9, 1, 25, 150000],
    ['BRU', 'Bruxelles Zaventem', 'Bruxelles', 'BE', 50.901, 4.484, 3000, .6, 1, 20, 70000],
    ['FRA', 'Francoforte', 'Francoforte', 'DE', 50.033, 8.570, 5500, .5, 1, 22, 150000],
    ['MUC', 'Monaco di Baviera', 'Monaco di Baviera', 'DE', 48.354, 11.786, 4500, .7, 1, 20, 100000],
    ['BER', 'Berlino Brandeburgo', 'Berlino', 'DE', 52.366, 13.503, 5000, .8, 0, 18, 0],
    ['ZRH', 'Zurigo', 'Zurigo', 'CH', 47.458, 8.555, 2500, .6, 1, 25, 100000],
    ['VIE', 'Vienna Schwechat', 'Vienna', 'AT', 48.110, 16.570, 2800, .8, 1, 20, 70000],
    ['PRG', 'Praga Václav Havel', 'Praga', 'CZ', 50.101, 14.260, 2700, .9, 0, 15, 0],
    ['ATH', 'Atene Eleftherios Venizelos', 'Atene', 'GR', 37.936, 23.944, 3800, 1, 0, 17, 0],
    ['TIA', 'Tirana Madre Teresa', 'Tirana', 'AL', 41.415, 19.721, 1000, .5, 0, 10, 0],
    ['MLA', 'Malta Luqa', 'Malta', 'MT', 35.857, 14.477, 500, 1, 0, 14, 0]
  ];
  const ISOLE = new Set(['CTA', 'PMO', 'CAG', 'OLB', 'AHO', 'MLA']);
  const AEROPORTI = {};
  for (const [iata, nome, citta, paese, lat, lon, pop, tur, slot, tassa, slotPrezzo] of A)
    AEROPORTI[iata] = { iata, nome, citta, paese, lat, lon, pop, tur, slot: !!slot, tassa, slotPrezzo, isola: ISOLE.has(iata) };

  // Modelli: spazio in cabina (posti Economy equivalenti), prezzo nuovo (€), consumo kg/h, manutenzione €/h di blocco, costo A-check, autonomia km
  const MODELLI = {
    ATR42: { nome: 'ATR 42-600', spazio: 48, tipo: 'ATR', vel: 470, prezzo: 18e6, consumo: 560, manut: 240, check: 20000, autonomia: 1300, peso: 18 },
    ATR72: { nome: 'ATR 72-600', spazio: 72, tipo: 'ATR', vel: 480, prezzo: 26e6, consumo: 700, manut: 290, check: 25000, autonomia: 1500, peso: 23 },
    E195: { nome: 'Embraer 195-E2', spazio: 136, tipo: 'E-JET', vel: 770, prezzo: 40e6, consumo: 1750, manut: 450, check: 45000, autonomia: 4000, peso: 61 },
    A220: { nome: 'Airbus A220-300', spazio: 145, tipo: 'A220', vel: 800, prezzo: 52e6, consumo: 1650, manut: 470, check: 50000, autonomia: 5500, peso: 70 },
    A319: { nome: 'Airbus A319', spazio: 144, tipo: 'A320', vel: 780, prezzo: 38e6, consumo: 2300, manut: 540, check: 55000, autonomia: 5500, peso: 75 },
    A320: { nome: 'Airbus A320', spazio: 180, tipo: 'A320', vel: 790, prezzo: 46e6, consumo: 2450, manut: 600, check: 60000, autonomia: 5500, peso: 78 },
    A20N: { nome: 'Airbus A320neo', spazio: 186, tipo: 'A320', vel: 800, prezzo: 56e6, consumo: 2050, manut: 560, check: 60000, autonomia: 6000, peso: 79 },
    A321: { nome: 'Airbus A321', spazio: 220, tipo: 'A320', vel: 800, prezzo: 55e6, consumo: 2850, manut: 680, check: 70000, autonomia: 5000, peso: 93 }
  };
  for (const m of Object.values(MODELLI)) { m.posti = m.spazio; m.leasing = Math.round(m.prezzo * (m.tipo === 'ATR' ? 0.000115 : 0.00016) / 100) * 100; }

  // Classi di viaggio: spazio occupato da un posto, moltiplicatore della tariffa, elasticità al prezzo
  const CLASSI = {
    J: { nome: 'Business', breve: 'Business', spazio: 1.9, mult: 2.6, el: 1.0 },
    W: { nome: 'Premium Economy', breve: 'Premium', spazio: 1.3, mult: 1.55, el: 1.3 },
    Y: { nome: 'Economy', breve: 'Economy', spazio: 1, mult: 1, el: 0.8 }
  };
  const HUB = { costo: 1000000, giornaliero: 6000, mct: 45, attesaMax: 240, deviazione: 1.6 };

  // Canali di marketing. effetto = aumento massimo dell'attrattività; scala = budget giornaliero che dà ~63% dell'effetto massimo;
  // salita/discesa = quanto in fretta l'effetto arriva e svanisce (frazione al giorno); avvio = costo iniziale di produzione
  const MARKETING = {
    online: { nome: 'Marketing online', icona: '🖥', ambiti: ['rotta', 'rete'], min: 300, max: 20000, scala: 1500, effetto: 0.4, salita: 0.5, discesa: 0.35, avvio: 0,
      descr: 'Motori di ricerca, social e comparatori. Mirato su una rotta o su tutta la rete, parte subito e si spegne in fretta.', forte: 'Precisione e costo basso' },
    radio: { nome: 'Radio', icona: '📻', ambiti: ['citta'], min: 1000, max: 15000, scala: 4000, effetto: 0.25, salita: 0.4, discesa: 0.2, avvio: 5000,
      descr: 'Spot sulle radio locali di una città: spinge chi parte da lì, e un po’ chi ci arriva.', forte: 'Traffico locale' },
    giornali: { nome: 'Giornali', icona: '📰', ambiti: ['citta', 'nazionale'], min: 1500, max: 25000, scala: 5000, effetto: 0.3, salita: 0.3, discesa: 0.12, avvio: 3000, business: true,
      descr: 'Pagine su quotidiani e riviste economiche, in una città o in tutta Italia. Attira soprattutto clienti Business e Premium.', forte: 'Clienti d’affari' },
    tv: { nome: 'Televisione', icona: '📺', ambiti: ['nazionale'], min: 20000, max: 150000, scala: 50000, effetto: 0.6, salita: 0.2, discesa: 0.06, avvio: 50000, reputazione: true,
      descr: 'Spot sulle reti nazionali: effetto su tutte le rotte da e per l’Italia, lento a partire ma duraturo, e migliora la reputazione. Conviene con una rete grande.', forte: 'Notorietà del marchio' }
  };

  const RUOLI = { CMD: { nome: 'Comandanti', paga: 330, pilota: true }, FO: { nome: 'Primi ufficiali', paga: 190, pilota: true }, CC: { nome: 'Capi cabina', paga: 130 }, ADV: { nome: 'Assistenti di volo', paga: 95 } };
  const SERVIZIO = { base: { nome: 'Essenziale', costo: 0, rep: -6 }, standard: { nome: 'Standard', costo: 3, rep: 0 }, premium: { nome: 'Premium', costo: 8, rep: 8 } };

  // Concorrenti (nomi di fantasia). prezzo = moltiplicatore della tariffa di riferimento
  const RIVALI = [
    { id: 'cex', nome: 'Cielo Express', colore: '#8a5cf6', hub: 'FCO', rep: 55, prezzo: 1.0, rotte: { 'FCO-LIN': 6, 'CTA-FCO': 4, 'FCO-PMO': 4, 'CDG-FCO': 3, 'FCO-LHR': 3, 'BRI-FCO': 2, 'CAG-FCO': 2, 'FCO-VCE': 2, 'FCO-TRN': 2, 'BCN-FCO': 2 } },
    { id: 'aqj', nome: 'Aquila Jet', colore: '#e07b00', hub: 'BGY', rep: 42, prezzo: 0.78, rotte: { 'BGY-CTA': 3, 'BGY-PMO': 3, 'BGY-BRI': 2, 'BGY-NAP': 3, 'BGY-CAG': 2, 'BCN-BGY': 2, 'BGY-MAD': 1, 'ATH-BGY': 1, 'BGY-OLB': 1 } },
    { id: 'ven', nome: 'Ventura Air', colore: '#0f9d8a', hub: 'LIN', rep: 68, prezzo: 1.2, rotte: { 'FCO-LIN': 5, 'LIN-NAP': 3, 'CTA-LIN': 2, 'BRI-LIN': 2, 'LHR-LIN': 2, 'CDG-LIN': 2, 'FRA-LIN': 2, 'AMS-LIN': 1 } }
  ];

  // Scenari
  const g = (y, m, d, h = 5) => new Date(y, m - 1, d, h, 0).getTime();
  const SCENARI = {
    primo: {
      nome: 'Primo decollo', difficolta: 'Normale', durata: 1095, inizio: g(2027, 3, 1), sceltaBase: true,
      descr: 'Hai 6 milioni, un ATR 72 in leasing e un sogno. Scegli la base e costruisci una compagnia vera.',
      obiettivi: 'Raggiungi 8 aerei e 15 M€ di utile cumulato entro 3 anni.',
      cassa: 6e6, flotta: [['ATR72', 'leasing']], personale: { CMD: { ATR: 5 }, FO: { ATR: 5 }, CC: 5, ADV: 5 }
    },
    crisi: {
      nome: 'Compagnia in crisi', difficolta: 'Difficile', durata: 365, inizio: g(2027, 1, 10),
      descr: 'Aliseo Airlines: 7 aerei, tanti debiti, reputazione a terra e prezzi sbagliati. Il consiglio ti dà un anno.',
      obiettivi: 'Porta i debiti sotto 5 M€ e la reputazione sopra 60 entro un anno, senza fallire.',
      preset: 'crisi'
    },
    milano: {
      nome: 'Conquista Milano', difficolta: 'Difficile', durata: 540, inizio: g(2027, 4, 1),
      descr: 'Base a Malpensa, tre aerei e Ventura Air che domina Linate. Prenditi il mercato milanese.',
      obiettivi: 'Opera almeno 5 rotte da Milano con una quota media del 35% entro 18 mesi.',
      base: 'MXP', cassa: 12e6, slot: { MXP: 14 }, flotta: [['A320', 'leasing'], ['A320', 'leasing'], ['A319', 'proprieta']],
      personale: { CMD: { A320: 15 }, FO: { A320: 15 }, CC: 15, ADV: 45 }
    },
    libera: {
      nome: 'Partita libera', difficolta: 'Facile', durata: 0, inizio: g(2027, 3, 1), sceltaBase: true,
      descr: '40 milioni, due A320 in leasing, nessuna scadenza. Fai crescere il valore della compagnia.',
      obiettivi: 'Nessun obiettivo: conta il valore della compagnia.',
      cassa: 40e6, flotta: [['A320', 'leasing'], ['A320', 'leasing']], personale: { CMD: { A320: 10 }, FO: { A320: 10 }, CC: 10, ADV: 30 }
    }
  };

  const TRAGUARDI = [
    ['primo-volo', 'Si parte!', 'Completa il primo volo'],
    ['pax-1k', 'Mille a bordo', 'Trasporta 1.000 passeggeri'],
    ['pax-100k', 'Centomila', 'Trasporta 100.000 passeggeri'],
    ['pax-1m', 'Un milione', 'Trasporta 1.000.000 di passeggeri'],
    ['jet', 'A reazione', 'Metti in flotta il primo jet'],
    ['flotta-10', 'Squadriglia', 'Arriva a 10 aerei'],
    ['flotta-25', 'Grande compagnia', 'Arriva a 25 aerei'],
    ['rotte-10', 'Ragnatela', 'Opera 10 rotte'],
    ['estero', 'Oltre confine', 'Apri una rotta internazionale'],
    ['mese-utile', 'Conti in ordine', 'Chiudi 30 giorni consecutivi in utile'],
    ['puntuale', 'Svizzero', 'Puntualità del 95% in una settimana (almeno 50 voli)'],
    ['dominio', 'Padroni della rotta', 'Supera il 70% di quota su una rotta'],
    ['cassa-100', 'Forziere', 'Accumula 100 M€ di cassa'],
    ['reputazione-80', 'Amati dai clienti', 'Porta la reputazione a 80'],
    ['hub', 'Snodo', 'Trasforma una base in hub'],
    ['transito', 'Coincidenze', 'Fai transitare 1.000 passeggeri in una settimana'],
    ['marketing', 'In onda', 'Lancia la prima campagna pubblicitaria']
  ];

  return { AEROPORTI, MODELLI, CLASSI, HUB, MARKETING, RUOLI, SERVIZIO, RIVALI, SCENARI, TRAGUARDI };
})();
if (typeof module !== 'undefined') module.exports = DATI;
