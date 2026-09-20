// Builds the shared navbar and footer on every page.

import { escapeHtml } from './ui.js'
import { initSession, logout, session } from './session.js'

const links = [
  { href: '/', label: 'Home', match: ['/', '/index'] },
  { href: '/foods', label: 'Explore Foods', match: ['/foods', '/food'] },
  { href: '/recipes', label: 'Recipes / Use It', match: ['/recipes'] },
  { href: '/saved', label: 'Saved Foods', match: ['/saved'], badge: true },
  { href: '/about', label: 'About', match: ['/about'] },
]

function currentPath() {
  return window.location.pathname.replace(/\.html$/, '') || '/'
}

function linkHtml(link) {
  const active = link.match.includes(currentPath()) ? 'class="active" aria-current="page"' : ''
  const count = link.badge && session.savedIds.size > 0
    ? `<span class="nav-count" id="nav-count">${session.savedIds.size}</span>`
    : link.badge ? '<span class="nav-count" id="nav-count" hidden></span>' : ''
  return `<a href="${link.href}" ${active}>${link.label}${count}</a>`
}

function authHtml() {
  if (session.user) {
    return `
      <span class="nav-user">Hi, ${escapeHtml(session.user.name.split(' ')[0])}</span>
      <button type="button" class="nav-logout" id="logout-button">Logout</button>`
  }
  const loginActive = currentPath() === '/login' ? 'class="active" aria-current="page"' : ''
  const signupActive = currentPath() === '/signup' ? 'active' : ''
  return `
    <a href="/login" ${loginActive}>Login</a>
    <a href="/signup" class="nav-signup ${signupActive}">Signup</a>`
}

function navbarHtml() {
  return `
    <header class="navbar">
      <div class="container navbar-inner">
        <a href="/" class="brand"><span class="brand-mark" aria-hidden="true">S</span>ShelfLife</a>
        <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>
        <nav id="main-nav" class="nav-links" aria-label="Main navigation">
          ${links.map(linkHtml).join('')}
          <div class="nav-auth">${authHtml()}</div>
        </nav>
      </div>
    </header>`
}

const footerHtml = `
  <footer class="footer">
    <div class="container footer-inner">
      <div>
        <p class="footer-brand">ShelfLife</p>
        <p class="footer-tagline">Understand how long food lasts, store it well, and waste less.</p>
      </div>
      <nav class="footer-account" aria-label="Account links" id="footer-account"></nav>
    </div>
  </footer>`

function updateNavCount() {
  const badge = document.getElementById('nav-count')
  if (badge) {
    badge.textContent = session.savedIds.size
    badge.hidden = session.savedIds.size === 0
  }
}

// Call once at the top of every page script. Resolves when the session is known.
export async function initLayout() {
  await initSession()

  document.getElementById('navbar').innerHTML = navbarHtml()
  document.getElementById('footer').innerHTML = footerHtml
  document.getElementById('footer-account').innerHTML = session.user
    ? ''
    : '<a href="/login">Login</a><a href="/signup">Signup</a>'

  const menuToggle = document.getElementById('menu-toggle')
  const nav = document.getElementById('main-nav')
  menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open')
    menuToggle.setAttribute('aria-expanded', String(open))
    menuToggle.textContent = open ? 'Close' : 'Menu'
  })

  const logoutButton = document.getElementById('logout-button')
  if (logoutButton) logoutButton.addEventListener('click', logout)

  document.addEventListener('saved-changed', updateNavCount)
}
