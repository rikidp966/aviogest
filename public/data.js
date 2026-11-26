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
    ['MLA', 'Malta Luqa', 'Malta', 'MT', 35.857, 14.477, 500, 1, 0, 14, 0],
    // Resto d'Europa
    ['LGW', 'Londra Gatwick', 'Londra', 'GB', 51.148, -0.190, 12000, 1, 1, 25, 150000],
    ['ORY', 'Parigi Orly', 'Parigi', 'FR', 48.723, 2.379, 11000, 1, 1, 20, 120000],
    ['DUB', 'Dublino', 'Dublino', 'IE', 53.421, -6.270, 1900, .7, 0, 20, 0],
    ['CPH', 'Copenaghen Kastrup', 'Copenaghen', 'DK', 55.618, 12.656, 2000, .7, 1, 20, 60000],
    ['ARN', 'Stoccolma Arlanda', 'Stoccolma', 'SE', 59.650, 17.930, 2400, .6, 0, 18, 0],
    ['OSL', 'Oslo Gardermoen', 'Oslo', 'NO', 60.194, 11.100, 1500, .6, 0, 20, 0],
    ['HEL', 'Helsinki Vantaa', 'Helsinki', 'FI', 60.317, 24.963, 1500, .5, 0, 18, 0],
    ['WAW', 'Varsavia Chopin', 'Varsavia', 'PL', 52.166, 20.967, 3100, .5, 0, 15, 0],
    ['BUD', 'Budapest Liszt Ferenc', 'Budapest', 'HU', 47.437, 19.256, 3000, .8, 0, 15, 0],
    ['OTP', 'Bucarest Otopeni', 'Bucarest', 'RO', 44.571, 26.085, 2300, .4, 0, 14, 0],
    ['IST', 'Istanbul', 'Istanbul', 'TR', 41.275, 28.752, 15500, .9, 1, 18, 80000],
    // Medio Oriente e Africa
    ['DXB', 'Dubai', 'Dubai', 'AE', 25.253, 55.364, 3500, 1, 1, 30, 150000],
    ['DOH', 'Doha Hamad', 'Doha', 'QA', 25.273, 51.608, 2400, .5, 0, 25, 0],
    ['RUH', 'Riad King Khalid', 'Riad', 'SA', 24.958, 46.700, 7500, .3, 0, 20, 0],
    ['TLV', 'Tel Aviv Ben Gurion', 'Tel Aviv', 'IL', 32.011, 34.887, 4000, .7, 0, 25, 0],
    ['CAI', 'Il Cairo', 'Il Cairo', 'EG', 30.122, 31.406, 20000, .8, 0, 20, 0],
    ['CMN', 'Casablanca Mohammed V', 'Casablanca', 'MA', 33.367, -7.590, 4300, .7, 0, 18, 0],
    ['TUN', 'Tunisi Cartagine', 'Tunisi', 'TN', 36.851, 10.227, 2700, .8, 0, 15, 0],
    ['LOS', 'Lagos Murtala Muhammed', 'Lagos', 'NG', 6.577, 3.321, 15000, .3, 0, 25, 0],
    ['ADD', 'Addis Abeba Bole', 'Addis Abeba', 'ET', 8.978, 38.799, 5000, .4, 0, 15, 0],
    ['NBO', 'Nairobi Jomo Kenyatta', 'Nairobi', 'KE', -1.319, 36.928, 5000, .7, 0, 20, 0],
    ['JNB', 'Johannesburg O. R. Tambo', 'Johannesburg', 'ZA', -26.139, 28.246, 9000, .6, 0, 20, 0],
    ['CPT', 'Città del Capo', 'Città del Capo', 'ZA', -33.965, 18.602, 4600, 1, 0, 20, 0],
    // Asia e Oceania
    ['DEL', 'Nuova Delhi Indira Gandhi', 'Nuova Delhi', 'IN', 28.556, 77.100, 30000, .6, 1, 15, 60000],
    ['BOM', 'Mumbai Chhatrapati Shivaji', 'Mumbai', 'IN', 19.089, 72.868, 21000, .5, 1, 15, 60000],
    ['CMB', 'Colombo Bandaranaike', 'Colombo', 'LK', 7.180, 79.884, 5600, .7, 0, 15, 0],
    ['MLE', 'Malé Velana', 'Malé', 'MV', 4.192, 73.529, 400, 1, 0, 25, 0],
    ['BKK', 'Bangkok Suvarnabhumi', 'Bangkok', 'TH', 13.690, 100.750, 11000, 1, 1, 18, 60000],
    ['SGN', 'Ho Chi Minh Tan Son Nhat', 'Ho Chi Minh', 'VN', 10.819, 106.652, 9000, .7, 0, 15, 0],
    ['KUL', 'Kuala Lumpur', 'Kuala Lumpur', 'MY', 2.746, 101.710, 8000, .7, 0, 15, 0],
    ['SIN', 'Singapore Changi', 'Singapore', 'SG', 1.364, 103.991, 5900, .9, 1, 25, 120000],
    ['CGK', 'Giacarta Soekarno-Hatta', 'Giacarta', 'ID', -6.126, 106.656, 33000, .5, 1, 15, 40000],
    ['DPS', 'Bali Ngurah Rai', 'Bali', 'ID', -8.748, 115.167, 4000, 1, 0, 15, 0],
    ['MNL', 'Manila Ninoy Aquino', 'Manila', 'PH', 14.509, 121.020, 14000, .6, 1, 15, 40000],
    ['HKG', 'Hong Kong', 'Hong Kong', 'HK', 22.308, 113.918, 7500, .9, 1, 25, 150000],
    ['TPE', 'Taipei Taoyuan', 'Taipei', 'TW', 25.077, 121.233, 7000, .6, 0, 20, 0],
    ['PVG', 'Shanghai Pudong', 'Shanghai', 'CN', 31.143, 121.805, 27000, .7, 1, 20, 100000],
    ['PEK', 'Pechino Capital', 'Pechino', 'CN', 40.080, 116.584, 21500, .7, 1, 20, 100000],
    ['ICN', 'Seul Incheon', 'Seul', 'KR', 37.460, 126.441, 25000, .7, 1, 25, 80000],
    ['NRT', 'Tokyo Narita', 'Tokyo', 'JP', 35.772, 140.393, 37000, .9, 1, 30, 150000],
    ['HND', 'Tokyo Haneda', 'Tokyo', 'JP', 35.549, 139.780, 37000, .9, 1, 30, 300000],
    ['PER', 'Perth', 'Perth', 'AU', -31.940, 115.967, 2100, .6, 0, 25, 0],
    ['SYD', 'Sydney Kingsford Smith', 'Sydney', 'AU', -33.946, 151.177, 5300, .9, 1, 30, 100000],
    ['MEL', 'Melbourne Tullamarine', 'Melbourne', 'AU', -37.669, 144.841, 5100, .8, 0, 25, 0],
    ['AKL', 'Auckland', 'Auckland', 'NZ', -37.008, 174.792, 1700, .9, 0, 25, 0],
    // Americhe
    ['JFK', 'New York John F. Kennedy', 'New York', 'US', 40.641, -73.778, 20000, 1, 1, 35, 300000],
    ['EWR', 'New York Newark', 'New York', 'US', 40.690, -74.174, 20000, 1, 1, 30, 200000],
    ['BOS', 'Boston Logan', 'Boston', 'US', 42.366, -71.010, 4900, .7, 0, 25, 0],
    ['IAD', 'Washington Dulles', 'Washington', 'US', 38.953, -77.456, 6300, .7, 0, 25, 0],
    ['ATL', 'Atlanta Hartsfield-Jackson', 'Atlanta', 'US', 33.640, -84.427, 6100, .5, 0, 22, 0],
    ['MIA', 'Miami', 'Miami', 'US', 25.795, -80.287, 6100, 1, 0, 25, 0],
    ['ORD', 'Chicago O’Hare', 'Chicago', 'US', 41.978, -87.905, 9500, .6, 1, 25, 120000],
    ['DFW', 'Dallas Fort Worth', 'Dallas', 'US', 32.899, -97.040, 7600, .4, 0, 22, 0],
    ['DEN', 'Denver', 'Denver', 'US', 39.856, -104.674, 3000, .6, 0, 22, 0],
    ['LAX', 'Los Angeles', 'Los Angeles', 'US', 33.942, -118.408, 13000, 1, 1, 30, 150000],
    ['SFO', 'San Francisco', 'San Francisco', 'US', 37.621, -122.379, 7700, .9, 1, 30, 120000],
    ['SEA', 'Seattle-Tacoma', 'Seattle', 'US', 47.450, -122.309, 4000, .6, 0, 25, 0],
    ['YYZ', 'Toronto Pearson', 'Toronto', 'CA', 43.677, -79.624, 6200, .6, 0, 25, 0],
    ['YUL', 'Montréal Trudeau', 'Montréal', 'CA', 45.470, -73.741, 4300, .7, 0, 25, 0],
    ['YVR', 'Vancouver', 'Vancouver', 'CA', 49.195, -123.184, 2600, .8, 0, 25, 0],
    ['MEX', 'Città del Messico', 'Città del Messico', 'MX', 19.436, -99.072, 21800, .6, 1, 20, 40000],
    ['CUN', 'Cancún', 'Cancún', 'MX', 21.037, -86.877, 900, 1, 0, 20, 0],
    ['HAV', 'L’Avana José Martí', 'L’Avana', 'CU', 22.989, -82.409, 2100, .9, 0, 15, 0],
    ['PTY', 'Panama Tocumen', 'Panama', 'PA', 9.071, -79.383, 1900, .5, 0, 15, 0],
    ['BOG', 'Bogotà El Dorado', 'Bogotà', 'CO', 4.702, -74.147, 11000, .5, 0, 20, 0],
    ['LIM', 'Lima Jorge Chávez', 'Lima', 'PE', -12.022, -77.114, 11000, .6, 0, 20, 0],
    ['GRU', 'San Paolo Guarulhos', 'San Paolo', 'BR', -23.432, -46.469, 22000, .6, 1, 20, 60000],
    ['GIG', 'Rio de Janeiro Galeão', 'Rio de Janeiro', 'BR', -22.810, -43.251, 13500, 1, 0, 20, 0],
    ['EZE', 'Buenos Aires Ezeiza', 'Buenos Aires', 'AR', -34.822, -58.536, 15500, .7, 0, 20, 0],
    ['SCL', 'Santiago del Cile', 'Santiago', 'CL', -33.393, -70.786, 7000, .6, 0, 20, 0]
  ];
  // Fuso orario standard (ore rispetto a UTC, ora legale non considerata) e continente per paese
  const PAESI = {
    IT: ['Italia', 1, 'Europa'], FR: ['Francia', 1, 'Europa'], GB: ['Regno Unito', 0, 'Europa'], ES: ['Spagna', 1, 'Europa'], PT: ['Portogallo', 0, 'Europa'],
    NL: ['Paesi Bassi', 1, 'Europa'], BE: ['Belgio', 1, 'Europa'], DE: ['Germania', 1, 'Europa'], CH: ['Svizzera', 1, 'Europa'], AT: ['Austria', 1, 'Europa'],
    CZ: ['Cechia', 1, 'Europa'], GR: ['Grecia', 2, 'Europa'], AL: ['Albania', 1, 'Europa'], MT: ['Malta', 1, 'Europa'], IE: ['Irlanda', 0, 'Europa'],
    DK: ['Danimarca', 1, 'Europa'], SE: ['Svezia', 1, 'Europa'], NO: ['Norvegia', 1, 'Europa'], FI: ['Finlandia', 2, 'Europa'], PL: ['Polonia', 1, 'Europa'],
    HU: ['Ungheria', 1, 'Europa'], RO: ['Romania', 2, 'Europa'], TR: ['Turchia', 3, 'Europa'],
    AE: ['Emirati Arabi', 4, 'Asia'], QA: ['Qatar', 3, 'Asia'], SA: ['Arabia Saudita', 3, 'Asia'], IL: ['Israele', 2, 'Asia'],
    EG: ['Egitto', 2, 'Africa'], MA: ['Marocco', 0, 'Africa'], TN: ['Tunisia', 1, 'Africa'], NG: ['Nigeria', 1, 'Africa'], ET: ['Etiopia', 3, 'Africa'],
    KE: ['Kenya', 3, 'Africa'], ZA: ['Sudafrica', 2, 'Africa'],
    IN: ['India', 5.5, 'Asia'], LK: ['Sri Lanka', 5.5, 'Asia'], MV: ['Maldive', 5, 'Asia'], TH: ['Thailandia', 7, 'Asia'], VN: ['Vietnam', 7, 'Asia'],
    MY: ['Malesia', 8, 'Asia'], SG: ['Singapore', 8, 'Asia'], ID: ['Indonesia', 7, 'Asia'], PH: ['Filippine', 8, 'Asia'], HK: ['Hong Kong', 8, 'Asia'],
    TW: ['Taiwan', 8, 'Asia'], CN: ['Cina', 8, 'Asia'], KR: ['Corea del Sud', 9, 'Asia'], JP: ['Giappone', 9, 'Asia'],
    AU: ['Australia', 10, 'Oceania'], NZ: ['Nuova Zelanda', 12, 'Oceania'],
    US: ['Stati Uniti', -5, 'Nord America'], CA: ['Canada', -5, 'Nord America'], MX: ['Messico', -6, 'Nord America'], CU: ['Cuba', -5, 'Nord America'], PA: ['Panama', -5, 'Nord America'],
    CO: ['Colombia', -5, 'Sud America'], PE: ['Perù', -5, 'Sud America'], BR: ['Brasile', -3, 'Sud America'], AR: ['Argentina', -3, 'Sud America'], CL: ['Cile', -4, 'Sud America']
  };
  // Fusi diversi da quello del paese (Stati Uniti, Canada, Australia, Indonesia)
  const FUSI = { ORD: -6, DFW: -6, DEN: -7, LAX: -8, SFO: -8, SEA: -8, YVR: -8, PER: 8, DPS: 8, CUN: -5 };
  const ISOLE = new Set(['CTA', 'PMO', 'CAG', 'OLB', 'AHO', 'MLA', 'MLE', 'DPS']);
  const AEROPORTI = {};
  for (const [iata, nome, citta, paese, lat, lon, pop, tur, slot, tassa, slotPrezzo] of A)
    AEROPORTI[iata] = { iata, nome, citta, paese, nomePaese: PAESI[paese][0], continente: PAESI[paese][2], fuso: FUSI[iata] ?? PAESI[paese][1], lat, lon, pop, tur, slot: !!slot, tassa, slotPrezzo, isola: ISOLE.has(iata) };

  // Modelli: spazio in cabina (posti Economy equivalenti), prezzo nuovo (€), consumo kg/h, manutenzione €/h di blocco, costo A-check, autonomia km
  const MODELLI = {
    ATR42: { nome: 'ATR 42-600', spazio: 48, tipo: 'ATR', vel: 470, prezzo: 18e6, consumo: 560, manut: 240, check: 20000, autonomia: 1300, peso: 18 },
    ATR72: { nome: 'ATR 72-600', spazio: 72, tipo: 'ATR', vel: 480, prezzo: 26e6, consumo: 700, manut: 290, check: 25000, autonomia: 1500, peso: 23 },
    E195: { nome: 'Embraer 195-E2', spazio: 136, tipo: 'E-JET', vel: 770, prezzo: 40e6, consumo: 1750, manut: 450, check: 45000, autonomia: 4000, peso: 61 },
    A220: { nome: 'Airbus A220-300', spazio: 145, tipo: 'A220', vel: 800, prezzo: 52e6, consumo: 1650, manut: 470, check: 50000, autonomia: 5500, peso: 70 },
    A319: { nome: 'Airbus A319', spazio: 144, tipo: 'A320', vel: 780, prezzo: 38e6, consumo: 2300, manut: 540, check: 55000, autonomia: 5500, peso: 75 },
    A320: { nome: 'Airbus A320', spazio: 180, tipo: 'A320', vel: 790, prezzo: 46e6, consumo: 2450, manut: 600, check: 60000, autonomia: 5500, peso: 78 },
    A20N: { nome: 'Airbus A320neo', spazio: 186, tipo: 'A320', vel: 800, prezzo: 56e6, consumo: 2050, manut: 560, check: 60000, autonomia: 6000, peso: 79 },
    A321: { nome: 'Airbus A321', spazio: 220, tipo: 'A320', vel: 800, prezzo: 55e6, consumo: 2850, manut: 680, check: 70000, autonomia: 5000, peso: 93 },
    A21X: { nome: 'Airbus A321XLR', spazio: 210, tipo: 'A320', vel: 820, prezzo: 66e6, consumo: 2750, manut: 720, check: 80000, autonomia: 8700, peso: 101 },
    A339: { nome: 'Airbus A330-900neo', spazio: 370, tipo: 'A330', vel: 870, prezzo: 110e6, consumo: 5700, manut: 2400, check: 200000, autonomia: 13300, peso: 251, lungo: true },
    B789: { nome: 'Boeing 787-9', spazio: 360, tipo: 'B787', vel: 900, prezzo: 130e6, consumo: 5400, manut: 2300, check: 180000, autonomia: 14000, peso: 254, lungo: true },
    A359: { nome: 'Airbus A350-900', spazio: 400, tipo: 'A350', vel: 905, prezzo: 150e6, consumo: 5800, manut: 2400, check: 200000, autonomia: 15000, peso: 283, lungo: true },
    B77W: { nome: 'Boeing 777-300ER', spazio: 470, tipo: 'B777', vel: 900, prezzo: 160e6, consumo: 7600, manut: 3000, check: 260000, autonomia: 13600, peso: 351, lungo: true },
    A388: { nome: 'Airbus A380', spazio: 700, tipo: 'A380', vel: 900, prezzo: 230e6, consumo: 11000, manut: 4200, check: 400000, autonomia: 15000, peso: 575, lungo: true }
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

  // ---------- Gestione aziendale ----------
  // Posizionamento: quote = moltiplicatori della clientela per classe, attesa = qualità che i clienti si aspettano,
  // tolleranza = quanto pesano i supplementi (bagaglio, posto), handling/sede = moltiplicatori di costo
  const STRATEGIE = {
    lowcost: { nome: 'Low cost', descr: 'Prezzi bassi, servizi a pagamento, aerei pieni. Pochi clienti business, che però non si aspettano molto.', quote: { J: 0.3, W: 0.6, Y: 1 }, domanda: 1.08, attesa: { J: -0.1, W: -0.06, Y: -0.04 }, tolleranza: 0.4, handling: 0.85, sede: 0.85, rep: -2 },
    tradizionale: { nome: 'Tradizionale', descr: 'Compagnia di bandiera classica: un po’ di tutto, servizio standard.', quote: { J: 1, W: 1, Y: 1 }, domanda: 1, attesa: { J: 0, W: 0, Y: 0 }, tolleranza: 1, handling: 1, sede: 1, rep: 0 },
    premium: { nome: 'Premium', descr: 'Clientela d’affari e di fascia alta: paga di più ma pretende un prodotto curato.', quote: { J: 1.6, W: 1.35, Y: 0.9 }, domanda: 0.95, attesa: { J: 0.06, W: 0.05, Y: 0.04 }, tolleranza: 1.5, handling: 1.05, sede: 1.15, rep: 3 },
    regionale: { nome: 'Regionale', descr: 'Specialista delle tratte brevi: più passeggeri sotto i 900 km, meno sul lungo raggio.', quote: { J: 0.7, W: 0.8, Y: 1 }, domanda: 1, corto: 1.12, lungo: 0.85, attesa: { J: 0, W: 0, Y: 0 }, tolleranza: 0.8, handling: 0.9, sede: 0.95, rep: 1 }
  };
  // Prodotto di bordo: per ogni elemento i livelli possibili; val = gradimento per classe (0 = standard),
  // costo € a passeggero, costoOra € a passeggero per ora di volo, ricavo € medi incassati a passeggero, durata = conta di più sui voli lunghi
  const BORDO = {
    pasto: { nome: 'Ristorazione', durata: true, livelli: [
      { nome: 'Niente', val: { J: -0.2, W: -0.06, Y: -0.02 } },
      { nome: 'A pagamento', ricavo: { J: 0, W: 1.5, Y: 2.5 }, val: { J: -0.15, W: -0.04, Y: -0.01 } },
      { nome: 'Snack e bevande', costo: 2, val: { J: -0.08, W: 0, Y: 0.01 } },
      { nome: 'Pasto caldo', costo: 4, costoOra: 3, val: { J: 0, W: 0.04, Y: 0.03 } },
      { nome: 'Gourmet', costo: 10, costoOra: 9, val: { J: 0.1, W: 0.07, Y: 0.04 } }] },
    sedile: { nome: 'Sedili', durata: true, livelli: [
      { nome: 'Standard', val: { J: 0, W: 0, Y: 0 } },
      { nome: 'Comfort', costoOra: 0.8, val: { J: 0.04, W: 0.03, Y: 0.03 } },
      { nome: 'Lusso (letto in Business)', costoOra: 2.5, val: { J: 0.1, W: 0.06, Y: 0.05 } }] },
    svago: { nome: 'Intrattenimento', durata: true, livelli: [
      { nome: 'Niente', val: { J: -0.05, W: -0.03, Y: -0.01 } },
      { nome: 'Film sul telefono', costoOra: 0.3, val: { J: 0, W: 0, Y: 0 } },
      { nome: 'Schermi personali', costoOra: 1, val: { J: 0.05, W: 0.04, Y: 0.03 } }] },
    wifi: { nome: 'Wi‑Fi', richiede: 'wifi', livelli: [
      { nome: 'Niente', val: { J: 0, W: 0, Y: 0 } },
      { nome: 'A pagamento', ricavo: { J: 0, W: 1.2, Y: 0.8 }, val: { J: 0.01, W: 0.01, Y: 0 } },
      { nome: 'Gratis', costo: 2.5, val: { J: 0.04, W: 0.03, Y: 0.02 } }] },
    lounge: { nome: 'Lounge in aeroporto', classi: ['J', 'W'], livelli: [
      { nome: 'Nessuna', val: { J: -0.06, W: -0.01, Y: 0 } },
      { nome: 'Lounge di un partner', costo: 16, val: { J: 0, W: 0.02, Y: 0 } },
      { nome: 'Lounge propria (2.500 €/giorno per base)', costo: 6, fisso: 2500, val: { J: 0.05, W: 0.04, Y: 0 } }] }
  };
  const PRESET_BORDO = {
    base: { J: { pasto: 2, sedile: 0, svago: 1, wifi: 0, lounge: 0 }, W: { pasto: 1, sedile: 0, svago: 1, wifi: 0, lounge: 0 }, Y: { pasto: 1, sedile: 0, svago: 0, wifi: 0, lounge: 0 } },
    standard: { J: { pasto: 3, sedile: 0, svago: 1, wifi: 0, lounge: 1 }, W: { pasto: 2, sedile: 0, svago: 1, wifi: 0, lounge: 0 }, Y: { pasto: 2, sedile: 0, svago: 1, wifi: 0, lounge: 0 } },
    premium: { J: { pasto: 4, sedile: 1, svago: 2, wifi: 0, lounge: 1 }, W: { pasto: 3, sedile: 1, svago: 2, wifi: 0, lounge: 1 }, Y: { pasto: 3, sedile: 0, svago: 1, wifi: 0, lounge: 0 } }
  };
  const DINAMICO = {
    fisso: { nome: 'Prezzo fisso', rialzo: 0, perdita: 0 },
    prudente: { nome: 'Prudente', rialzo: 0.08, perdita: 0.02 },
    bilanciato: { nome: 'Bilanciato', rialzo: 0.16, perdita: 0.05, richiede: 'rm' },
    aggressivo: { nome: 'Aggressivo', rialzo: 0.26, perdita: 0.12, richiede: 'rm' }
  };
  const RICERCHE = {
    domanda: { nome: 'Studio di domanda', costo: 15000, giorni: 5, descr: 'Domanda vera, stagionalità e tipo di clientela tra due città. Le stime su quella coppia diventano precise per un anno.' },
    area: { nome: 'Indagine di mercato su una base', costo: 45000, giorni: 10, descr: 'Studia le 12 destinazioni più promettenti da una base: tutte diventano stime precise.' },
    concorrenza: { nome: 'Analisi della concorrenza', costo: 40000, giorni: 7, descr: 'Per 60 giorni vedi in anticipo le mosse dei concorrenti: nuove rotte e attacchi alle tue.' },
    sondaggio: { nome: 'Sondaggio passeggeri', costo: 20000, giorni: 7, descr: 'Cosa pensano i passeggeri del prodotto di bordo, classe per classe, e cosa migliorerebbero.' }
  };
  const DIRIGENTI = {
    cfo: { ruolo: 'CFO', area: 'Finanza', nomi: ['Giulia Ferraris', 'Marco Bellandi', 'Elena Russo'], motto: 'Prudente: guarda prima la cassa' },
    comm: { ruolo: 'Direttore commerciale', area: 'Rotte e prezzi', nomi: ['Luca Moretti', 'Sara Conti', 'Davide Greco'], motto: 'Ambizioso: vuole crescere' },
    coo: { ruolo: 'COO', area: 'Operazioni', nomi: ['Paolo Lombardi', 'Chiara Rinaldi', 'Stefano Gallo'], motto: 'Pignolo: puntualità prima di tutto' },
    cmo: { ruolo: 'CMO', area: 'Marketing', nomi: ['Federica Marino', 'Andrea Costa', 'Valentina Bruno'], motto: 'Creativo: il marchio è tutto' },
    cto: { ruolo: 'CTO', area: 'Tecnologia', nomi: ['Simone Ricci', 'Laura Fontana', 'Matteo Villa'], motto: 'Innovatore: automatizza tutto' }
  };
  // Progetti a effetto ritardato proposti in riunione
  const PROGETTI = {
    rm: { nome: 'Sistema di revenue management', ruolo: 'cto', costo: 900000, giorni: 45, effetto: 'Prezzi dinamici bilanciati e aggressivi, +3% di ricavi per biglietto' },
    app: { nome: 'App e check-in online', ruolo: 'cto', costo: 500000, giorni: 30, effetto: 'Handling −15%, +20% di vendite di servizi extra, reputazione +2' },
    wifi: { nome: 'Wi‑Fi satellitare sulla flotta', ruolo: 'cto', costo: 0, perAereo: 80000, giorni: 20, effetto: 'Sblocca il Wi‑Fi a bordo (a pagamento o gratis); 150 € al giorno per aereo' },
    predittiva: { nome: 'Manutenzione predittiva', ruolo: 'cto', costo: 400000, giorni: 30, effetto: 'Guasti −40%' },
    sito: { nome: 'Nuovo sito di prenotazione', ruolo: 'cto', costo: 250000, giorni: 21, effetto: 'Più vendite dirette: domanda +3% su tutte le rotte' },
    puntualita: { nome: 'Programma puntualità', ruolo: 'coo', costo: 150000, giorni: 30, effetto: 'Ritardi −25%' },
    hangar: { nome: 'Hangar di manutenzione', ruolo: 'coo', costo: 2000000, giorni: 60, effetto: 'Ispezioni −30% di costo' },
    fedelta: { nome: 'Programma fedeltà', ruolo: 'cmo', costo: 400000, giorni: 30, quotidiano: 5000, effetto: 'Clienti Business e Premium +12%, reputazione +2; 5.000 € al giorno' },
    rebranding: { nome: 'Nuova immagine del marchio', ruolo: 'cmo', costo: 600000, giorni: 30, effetto: 'Reputazione +8 a lavori finiti' },
    sponsor: { nome: 'Sponsorizzazione sportiva', ruolo: 'cmo', costo: 250000, giorni: 7, effetto: 'Reputazione +4' },
    tagli: { nome: 'Piano di riduzione costi', ruolo: 'cfo', costo: 0, giorni: 14, effetto: 'Costi di sede −15% per 6 mesi, morale −8' }
  };

  // Concorrenti (nomi di fantasia). prezzo = moltiplicatore della tariffa di riferimento
  const RIVALI = [
    { id: 'cex', nome: 'Cielo Express', colore: '#8a5cf6', hub: 'FCO', rep: 55, prezzo: 1.0, rotte: { 'FCO-LIN': 6, 'CTA-FCO': 4, 'FCO-PMO': 4, 'CDG-FCO': 3, 'FCO-LHR': 3, 'BRI-FCO': 2, 'CAG-FCO': 2, 'FCO-VCE': 2, 'FCO-TRN': 2, 'BCN-FCO': 2 } },
    { id: 'aqj', nome: 'Aquila Jet', colore: '#e07b00', hub: 'BGY', rep: 42, prezzo: 0.78, rotte: { 'BGY-CTA': 3, 'BGY-PMO': 3, 'BGY-BRI': 2, 'BGY-NAP': 3, 'BGY-CAG': 2, 'BCN-BGY': 2, 'BGY-MAD': 1, 'ATH-BGY': 1, 'BGY-OLB': 1 } },
    { id: 'ven', nome: 'Ventura Air', colore: '#0f9d8a', hub: 'LIN', rep: 68, prezzo: 1.2, rotte: { 'FCO-LIN': 5, 'LIN-NAP': 3, 'CTA-LIN': 2, 'BRI-LIN': 2, 'LHR-LIN': 2, 'CDG-LIN': 2, 'FRA-LIN': 2, 'AMS-LIN': 1 } },
    { id: 'mer', nome: 'Meridian Global', colore: '#c2255c', hub: 'DXB', rep: 76, prezzo: 1.1, raggio: 14000, rotte: { 'DXB-LHR': 3, 'CDG-DXB': 2, 'DXB-FCO': 2, 'DXB-MXP': 1, 'BKK-DXB': 2, 'DXB-SIN': 2, 'DEL-DXB': 3, 'BOM-DXB': 3, 'DXB-JFK': 1, 'DXB-SYD': 1, 'DXB-JNB': 1 } },
    { id: 'nst', nome: 'Northstar Airlines', colore: '#3b5bdb', hub: 'JFK', rep: 60, prezzo: 1.05, raggio: 12000, rotte: { 'JFK-LHR': 4, 'CDG-JFK': 2, 'FCO-JFK': 1, 'JFK-MXP': 1, 'JFK-LAX': 6, 'JFK-MIA': 5, 'JFK-SFO': 4, 'JFK-ORD': 5, 'BOS-JFK': 3, 'GRU-JFK': 1, 'JFK-MEX': 2, 'CUN-JFK': 2 } },
    { id: 'pac', nome: 'Pacific Crest', colore: '#2b8a3e', hub: 'SIN', rep: 72, prezzo: 1.0, raggio: 12000, rotte: { 'HKG-SIN': 4, 'BKK-SIN': 4, 'KUL-SIN': 6, 'CGK-SIN': 5, 'NRT-SIN': 2, 'SIN-SYD': 3, 'DPS-SIN': 3, 'LHR-SIN': 1, 'FRA-SIN': 1, 'DEL-SIN': 2, 'MNL-SIN': 3, 'ICN-SIN': 2 } }
  ];

  // Scenari
  const g = (y, m, d) => [y, m, d];
  const SCENARI = {
    primo: {
      nome: 'Primo decollo', difficolta: 'Normale', durata: 1095, inizio: g(2027, 3, 1), sceltaBase: true,
      descr: 'Hai 6 milioni, un ATR 72 in leasing e un sogno. Scegli la base e costruisci una compagnia vera.',
      obiettivi: 'Raggiungi 8 aerei e 15 M€ di utile cumulato entro 3 anni.',
      cassa: 6e6, flotta: [['ATR72', 'leasing']], equipaggi: [['ATR', 4, 2, 2]]
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
      equipaggi: [['A320', 9, 2, 4]]
    },
    libera: {
      nome: 'Partita libera', difficolta: 'Facile', durata: 0, inizio: g(2027, 3, 1), sceltaBase: true,
      descr: '40 milioni, due A320 in leasing, nessuna scadenza. Fai crescere il valore della compagnia.',
      obiettivi: 'Nessun obiettivo: conta il valore della compagnia.',
      cassa: 40e6, flotta: [['A320', 'leasing'], ['A320', 'leasing']], equipaggi: [['A320', 6, 2, 4]]
    },
    globale: {
      nome: 'Compagnia globale', difficolta: 'Difficile', durata: 1825, inizio: g(2027, 3, 1), sceltaBase: true, mondo: true,
      descr: 'Base dove vuoi nel mondo, 150 milioni, un A330-900neo e due A320 in leasing. Costruisci una rete intercontinentale.',
      obiettivi: 'Collega 5 continenti e porta il valore della compagnia a 400 M€ entro 5 anni.',
      cassa: 150e6, flotta: [['A339', 'leasing'], ['A320', 'leasing'], ['A320', 'leasing']],
      equipaggi: [['A330', 7, 3, 6], ['A320', 6, 2, 4]]
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
    ['marketing', 'In onda', 'Lancia la prima campagna pubblicitaria'],
    ['intercontinentale', 'Oltreoceano', 'Opera una rotta di oltre 5.000 km'],
    ['continenti', 'Giro del mondo', 'Vola in 5 continenti']
  ];

  return { AEROPORTI, PAESI, MODELLI, CLASSI, HUB, MARKETING, RUOLI, SERVIZIO, STRATEGIE, BORDO, PRESET_BORDO, DINAMICO, RICERCHE, DIRIGENTI, PROGETTI, RIVALI, SCENARI, TRAGUARDI };
})();
if (typeof module !== 'undefined') module.exports = DATI;
