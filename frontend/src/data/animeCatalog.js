/**
 * Constantes y utilidades del catálogo Sora Anime
 */

export const GENRES = [
  'Aventura',
  'Fantasía',
  'Drama',
  'Comedia',
  'Romance',
  'Misterio',
  'Acción',
  'Ciencia Ficción',
  'Sobrenatural',
]

export function parseViews(viewsStr) {
  if (!viewsStr) return 0
  return parseInt(String(viewsStr).replace(/\./g, '').replace(/,/g, ''), 10) || 0
}

export function sortAnime(items = [], sortBy = 'score') {
  const arr = [...items]
  if (sortBy === 'views') {
    return arr.sort((a, b) => parseViews(b.views) - parseViews(a.views))
  }
  if (sortBy === 'az') {
    return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }
  return arr.sort((a, b) => {
    const scoreA = a.score != null ? Number(a.score) : -1
    const scoreB = b.score != null ? Number(b.score) : -1
    return scoreB - scoreA
  })
}

export function sceneSvg(_key = 'default') {
  return `<svg viewBox="0 0 120 160" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sora_ph" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="120" height="160" fill="url(#sora_ph)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="11">Sora Anime</text></svg>`
}

export function wideSvg(_key = 'default') {
  return `<svg viewBox="0 0 1600 900" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sora_wph" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#020617"/></linearGradient></defs><rect width="1600" height="900" fill="url(#sora_wph)"/></svg>`
}
