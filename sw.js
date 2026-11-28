// AvioGest — service worker: l'app si apre anche senza connessione.
// File del gioco: prima la rete (così gli aggiornamenti arrivano subito), se manca la rete la copia salvata.
// Librerie e caratteri da altri siti: la copia salvata, se c'è. I salvataggi sul server (/api) non passano mai dalla cache.
const CACHE = 'aviogest-v4';
const FILE = ["./","index.html","style.css","data.js","sim.js","icon.svg","manifest.webmanifest","ui/base.js","ui/mappa-grafici.js","ui/viste-operazioni.js","ui/viste-commerciale.js","ui/viste-azienda.js","ui/gestione.js","ui/facile.js","ui/persone.js","ui/espansione.js","ui/concorrenza.js","ui/pianificatore.js","ui/navigazione.js","ui/ciclo.js","ui/azioni.js","ui/eventi.js","ui/realismo.js","ui/avanzato.js","ui/proprieta.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(l => Promise.all(l.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.pathname.includes('/api/')) return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
  } else if (/cdnjs.cloudflare.com|fonts.(googleapis|gstatic).com/.test(u.host)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); return res; })));
  }
});
