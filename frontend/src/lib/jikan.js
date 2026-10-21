import axios from 'axios'
import { API_BASE } from '../context/AppContext'

/**
 * Cliente de anime que ahora se comunica exclusivamente con nuestro Backend
 * (/api/top, /api/anime/:id, /api/anime/:id/recommendations, /api/search).
 */
export async function getTopAnime({ limit = 12 } = {}) {
  try {
    const res = await axios.get(`${API_BASE}/top`, { params: { limit } })
    return Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.warn('Error al obtener top anime desde backend:', error.message)
    return []
  }
}

export async function getAnimeById(id) {
  try {
    const res = await axios.get(`${API_BASE}/anime/${id}`)
    return res.data || null
  } catch (error) {
    console.warn(`Error al obtener anime ${id} desde backend:`, error.message)
    return null
  }
}

export async function getRecommendations(id) {
  try {
    const res = await axios.get(`${API_BASE}/anime/${id}/recommendations`)
    return Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.warn(`Error al obtener recomendaciones para ${id}:`, error.message)
    return []
  }
}

export async function searchAnime(query, { limit = 12 } = {}) {
  if (!query?.trim()) return []
  try {
    const res = await axios.get(`${API_BASE}/search`, { params: { q: query.trim(), limit } })
    return Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.warn('Error al buscar anime desde backend:', error.message)
    return []
  }
}

export function formatMembers(n) {
  if (!n) return ''
  const num = typeof n === 'string' ? parseInt(n.replace(/\D/g, ''), 10) : Number(n)
  if (isNaN(num)) return ''
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return String(num)
}
