// Builds the shared header (navigation) and footer on every page.
// Each HTML page has <div id="navbar"></div> and <div id="footer"></div>; this file fills them.

import { brandMark, icon } from './icons.js'
import { initSession, logout, session } from './session.js'
import { escapeHtml } from './ui.js'

const links = [
  { href: '/scan', label: 'Scanner', match: ['/scan'], dot: true },
  { href: '/foods', label: 'Food guide', match: ['/foods', '/food'] },
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
    <button type="button" class="btn btn-secondary btn-sm" id="logout-button">Log out</button>`
}

function headerHtml() {
  return `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand" aria-label="ShelfLife home">${brandMark}<span>ShelfLife</span></a>
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
      <div>
        <a href="/" class="brand">${brandMark}<span>ShelfLife</span></a>
        <p class="footer-statement">Know what's still good, store it well, and waste less of it.</p>
      </div>
      <div>
        <h2 class="footer-heading">Product</h2>
        <ul class="footer-links">
          <li><a href="/scan">Freshness scanner</a></li>
          <li><a href="/foods">Food guide</a></li>
          <li><a href="/recipes">Use it up</a></li>
        </ul>
      </div>
      <div>
        <h2 class="footer-heading">Project</h2>
        <ul class="footer-links">
          <li><a href="/about">About ShelfLife</a></li>
          <li><a href="https://sdgs.un.org/goals/goal12" rel="noopener" target="_blank">UN SDG 12</a></li>
          <li><a href="/saved">Your saved foods</a></li>
        </ul>
      </div>
    </div>
    <div class="container footer-bottom">
      <p>Shelf-life figures are general estimates. The scanner judges visible quality, not food safety. When in doubt, throw it out.</p>
      <p>A college mini-project supporting SDG 12 and SDG 2.</p>
    </div>
  </footer>`

function updateNavCount() {
  const badge = document.getElementById('nav-count')
  if (!badge) return
  badge.textContent = session.savedIds.size
  badge.hidden = session.savedIds.size === 0
}

// Call once at the top of every page script. Loads the session, then draws header and footer.
export async function initLayout() {
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
}

export { icon }
