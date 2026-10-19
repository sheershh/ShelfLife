// Builds the shared header (navigation) and footer on every page, and the scroll-reveal effect.
// Each HTML page has <div id="navbar"></div> and <div id="footer"></div>; this file fills them.

import { brandMark, icon } from './icons.js'
import { initSession, logout, session } from './session.js'
import { escapeHtml } from './ui.js'

const links = [
  { href: '/scan', label: 'Scanner', match: ['/scan'], dot: true },
  { href: '/foods', label: 'Food guide', match: ['/foods', '/food'] },
  { href: '/nutrition', label: 'Nutrition', match: ['/nutrition'] },
  { href: '/recipes', label: 'Use it up', match: ['/recipes'] },
  { href: '/about', label: 'About', match: ['/about'] },
]

const currentPath = () => window.location.pathname.replace(/\.html$/, '').replace(/^\/index$/, '/') || '/'
const current = (paths) => (paths.includes(currentPath()) ? 'aria-current="page"' : '')

function linkHtml(link) {
  const dot = link.dot ? '<span class="nav-scan-dot" aria-hidden="true"></span>' : ''
  return `<li><a href="${link.href}" ${current(link.match)}>${dot}${link.label}</a></li>`
}

function accountHtml() {
  if (!session.user) {
    return `
      <a href="/login" ${current(['/login'])}>Log in</a>
      <a href="/signup" class="btn btn-primary btn-sm">Create account</a>`
  }
  const count = session.savedIds.size
  const admin = session.user.role === 'admin' ? `<a href="/admin" ${current(['/admin'])}>Admin</a>` : ''
  return `
    <a href="/saved" ${current(['/saved'])}>Saved
      <span class="nav-count num" id="nav-count" ${count ? '' : 'hidden'}>${count}</span></a>
    ${admin}
    <span class="nav-user">${escapeHtml(session.user.name.split(' ')[0])}</span>
    <button type="button" class="nav-logout" id="logout-button">Log out</button>`
}

function headerHtml() {
  return `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand" aria-label="ShelfLife home" translate="no">${brandMark}<span>ShelfLife</span></a>
        <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>
        <nav class="site-nav" id="site-nav" aria-label="Main">
          <ul class="nav-links">${links.map(linkHtml).join('')}</ul>
          <div class="nav-account">${accountHtml()}</div>
        </nav>
      </div>
    </header>`
}

const footerHtml = `
  <footer class="site-footer">
    <div class="container footer-top">
      <p class="footer-statement">One scan closer to a <span>smarter kitchen.</span></p>
      <div>
        <h2 class="footer-heading">Product</h2>
        <ul class="footer-links">
          <li><a href="/scan">Freshness scanner</a></li>
          <li><a href="/foods">Food guide</a></li>
          <li><a href="/nutrition">Nutrition diary</a></li>
          <li><a href="/recipes">Use it up</a></li>
          <li><a href="/saved">Your saved foods</a></li>
          <li><a href="/add">Add groceries</a></li>
        </ul>
      </div>
      <div>
        <h2 class="footer-heading">Project</h2>
        <ul class="footer-links">
          <li><a href="/about">About ShelfLife</a></li>
        </ul>
      </div>
    </div>
    <p class="footer-wordmark reveal" aria-hidden="true" translate="no">ShelfLife<span>.</span></p>
    <div class="container footer-bottom">
      <p>Shelf-life figures are general estimates. The scanner judges visible quality, not food safety. When in doubt, throw it out.</p>
    </div>
  </footer>`

function updateNavCount() {
  const badge = document.getElementById('nav-count')
  if (!badge) return
  badge.textContent = session.savedIds.size
  badge.hidden = session.savedIds.size === 0
}

// Sections marked .reveal fade up once when they scroll into view.
// The class on <html> is only added when JavaScript runs, so nothing stays hidden without it.
const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-visible')
      revealObserver.unobserve(entry.target)
    }
  }, { rootMargin: '0px 0px -8% 0px' })
  : null

export function observeReveals(root = document) {
  for (const el of root.querySelectorAll('.reveal:not(.is-visible)')) {
    if (revealObserver) revealObserver.observe(el)
    else el.classList.add('is-visible')
  }
}

// The service worker makes ShelfLife installable and keeps the food guide readable offline.
// It is optional: a browser without one, or one that refuses it, just uses the site as normal.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Call once at the top of every page script. Loads the session, then draws header and footer.
export async function initLayout() {
  document.documentElement.classList.add('js-reveal')
  await initSession()
  document.getElementById('navbar').innerHTML = headerHtml()
  document.getElementById('footer').innerHTML = footerHtml

  const toggle = document.getElementById('menu-toggle')
  const nav = document.getElementById('site-nav')
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open')
    toggle.setAttribute('aria-expanded', String(open))
    toggle.textContent = open ? 'Close' : 'Menu'
  })

  document.getElementById('logout-button')?.addEventListener('click', logout)
  document.addEventListener('saved-changed', updateNavCount)
  observeReveals()
}

export { icon }
