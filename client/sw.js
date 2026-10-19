// Service worker: lets ShelfLife install like an app and keep working for the parts that do not need the server.
//
//   Pages, scripts, styles, images  -> network first, falling back to the last copy we saved
//   /api/foods and /api/meta        -> network first, falling back to the last copy (the food guide works offline)
//   Everything else under /api      -> never cached: accounts, saved foods and scans are personal and must be live
//
// Bump VERSION to throw away old copies after a release.

const VERSION = 'shelflife-v2'
const PAGES = ['/', '/foods', '/recipes', '/about', '/scan', '/saved', '/add', '/nutrition', '/css/style.css', '/favicon.svg']
const PUBLIC_API = ['/api/foods', '/api/meta']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PAGES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return // fonts etc. go straight to the network
  if (url.pathname.startsWith('/api/') && !PUBLIC_API.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return

  event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
  const cache = await caches.open(VERSION)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request, { ignoreSearch: false }) || (request.mode === 'navigate' ? await cache.match(new URL(request.url).pathname) : null)
    if (cached) return cached
    if (request.mode === 'navigate') return (await cache.match('/')) || Response.error()
    return Response.error()
  }
}
