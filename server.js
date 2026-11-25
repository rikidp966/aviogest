// AvioGest — server del gioco: file statici, salvataggi delle partite e classifica. Nessuna dipendenza esterna.
const http = require('http'), fs = require('fs'), path = require('path');

const PORT = process.env.PORT || 5190;
const PUB = path.join(__dirname, 'public');
const DATI = path.join(__dirname, 'data');
const SALV = path.join(DATI, 'salvataggi');
const CLASSIFICA = path.join(DATI, 'classifica.json');
fs.mkdirSync(SALV, { recursive: true });

const scriviAtomico = (f, s) => { fs.writeFileSync(f + '.tmp', s); fs.renameSync(f + '.tmp', f); };
const idValido = id => /^[a-z0-9]{3,40}$/.test(id || '');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function leggiCorpo(req) {
  return new Promise((ok, ko) => {
    const pezzi = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 30e6) { ko(new Error('Troppo grande')); req.destroy(); } else pezzi.push(c); });
    req.on('end', () => ok(Buffer.concat(pezzi).toString('utf8')));
  });
}

function salvaPartita(id, testo) {
  const g = JSON.parse(testo);
  scriviAtomico(path.join(SALV, id + '.json'), testo);
  scriviAtomico(path.join(SALV, id + '.meta.json'), JSON.stringify({ id, nome: g.nome, scenario: g.scenario, ora: g.ora, cassa: Math.round(g.cassa), salvato: Date.now() }));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (stato, dati) => { res.writeHead(stato, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(typeof dati === 'string' ? dati : JSON.stringify(dati)); };
  try {
    const p = url.pathname.split('/').filter(Boolean);
    if (p[0] === 'api') {
      if (p[1] === 'salvataggi') {
        const id = p[2];
        if (!id && req.method === 'GET') {
          const lista = fs.readdirSync(SALV).filter(f => f.endsWith('.meta.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(SALV, f), 'utf8')); } catch { return null; } }).filter(Boolean);
          return json(200, lista.sort((a, b) => b.salvato - a.salvato));
        }
        if (!idValido(id)) return json(400, { errore: 'Identificativo non valido' });
        const file = path.join(SALV, id + '.json');
        if (req.method === 'GET') return fs.existsSync(file) ? json(200, fs.readFileSync(file, 'utf8')) : json(404, { errore: 'Partita non trovata' });
        if (req.method === 'PUT' || (req.method === 'POST' && p[3] === 'beacon')) { salvaPartita(id, await leggiCorpo(req)); return json(200, { ok: true }); }
        if (req.method === 'DELETE') { for (const f of [file, path.join(SALV, id + '.meta.json')]) fs.rmSync(f, { force: true }); return json(200, { ok: true }); }
      }
      if (p[1] === 'classifica') {
        let c = []; try { c = JSON.parse(fs.readFileSync(CLASSIFICA, 'utf8')); } catch { }
        if (req.method === 'GET') return json(200, c);
        if (req.method === 'POST') {
          const x = JSON.parse(await leggiCorpo(req));
          c.push({ nome: String(x.nome || '').slice(0, 40), scenario: String(x.scenario || '').slice(0, 20), punteggio: Math.round(+x.punteggio || 0), giorni: Math.round(+x.giorni || 0), data: Date.now() });
          c.sort((a, b) => b.punteggio - a.punteggio); c = c.slice(0, 100);
          scriviAtomico(CLASSIFICA, JSON.stringify(c)); return json(200, { ok: true });
        }
      }
      return json(404, { errore: 'Non trovato' });
    }
    const file = path.normalize(path.join(PUB, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(PUB)) return json(403, { errore: 'Vietato' });
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Non trovato'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
    });
  } catch (e) {
    console.error(e); json(500, { errore: e.message });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`AvioGest pronto su http://localhost:${PORT}`);
  // indirizzi da aprire sul telefono collegato alla stessa rete Wi-Fi
  for (const [nome, lista] of Object.entries(require('os').networkInterfaces()))
    for (const x of lista || []) if (x.family === 'IPv4' && !x.internal) console.log(`Dal telefono (stessa rete Wi-Fi): http://${x.address}:${PORT}   [${nome}]`);
});
