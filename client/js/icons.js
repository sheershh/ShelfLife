// Small inline SVG icons (no icon font or image requests needed).
// Each icon is a 24x24 outline drawn with the current text colour.

const paths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M5 15v4h14v-4"/>',
  back: '<path d="M15 6 9 12l6 6"/>',
  forward: '<path d="m9 6 6 6-6 6"/>',
  send: '<path d="M5 12h13m0 0-5-5m5 5-5 5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12"/>',
  edit: '<path d="m15 5 4 4L8 20H4v-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4m0 3v.01"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  home: '<path d="M4 11 12 4l8 7v9H4z"/>',
  box: '<path d="M4 8 12 4l8 4v8l-8 4-8-4z"/><path d="m4 8 8 4 8-4M12 12v8"/>',
  fridge: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
  arrow: '<path d="M5 12h14m0 0-5-5m5 5-5 5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m20 16-5-5-8 8"/>',
}

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`
}

// The ShelfLife logo mark: a lens (a second look) on a tomato-red disc, with a leaf.
export const brandMark = `
  <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="16" cy="16" r="16" fill="#df4328"/>
    <circle cx="16" cy="17" r="7.5" fill="none" stroke="#f5f0e6" stroke-width="2.6"/>
    <circle cx="16" cy="17" r="2.4" fill="#f5f0e6"/>
    <path d="M17 6.2c3.6-1.6 7-.6 8.6 1.6-3 1.8-6.3 1.6-8.6-1.6Z" fill="#1f5a3a"/>
  </svg>`
