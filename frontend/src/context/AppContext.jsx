import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { useLocalStorage } from '../hooks'
import { getCatalogAnime } from '../data/animeCatalog'

export const API_BASE = 'http://localhost:4000/api'

/**
 * Estado global de Sora Anime:
 *  - library:    animes con servidores HLS personalizados por episodio
 *  - collection: animes guardados en "Mi colección" (sincronizados con backend /api/vault)
 *  - favorites:  animes marcados con ♥
 *  - progress:   último episodio y segundo visto por anime
 *  - user:       perfil actual (Invitado o usuario autenticado)
 *  - UI:         tema, toast, modal de añadir, modal de auth y reproductor
 */
const AppContext = createContext(null)

const uid = () => Math.random().toString(36).slice(2, 9)

export function AppProvider({ children }) {
  const [library, setLibrary] = useLocalStorage('library', {})
  const [collection, setCollection] = useLocalStorage('col', {})
  const [favorites, setFavorites] = useLocalStorage('fav', {})
  const [progress, setProgress] = useLocalStorage('progress', {})
  const [user, setUser] = useLocalStorage('user', () => ({
    name: 'Invitado',
    email: '',
    isGuest: true,
    google: false,
  }))
  const [theme, setTheme] = useLocalStorage('theme', () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [toastMsg, setToastMsg] = useState(null)
  const [addModal, setAddModal] = useState(null) // { anime?, episode? } | null
  const [authModal, setAuthModal] = useState(null) // 'login' | 'register' | null
  const [player, setPlayer] = useState(null) // { animeId, episode } | null
  const [activeAnimeItem, setActiveAnimeItem] = useState(null) // Anime activo en memoria para reproductor
  const toastTimer = useRef()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Cargar la colección sincronizada desde el backend (/api/vault) al iniciar
  useEffect(() => {
    let alive = true
    axios
      .get(`${API_BASE}/vault`, { timeout: 4000 })
      .then((res) => {
        if (!alive || !Array.isArray(res.data)) return
        const map = {}
        for (const item of res.data) {
          if (item?.id) {
            map[String(item.id)] = item
          }
        }
        setCollection((prev) => ({ ...prev, ...map }))
      })
      .catch((err) => {
        // Si el backend no está corriendo aún, usamos la caché local de localStorage
        console.warn('Backend vault no disponible aún, usando colección local:', err.message)
      })

    return () => {
      alive = false
    }
  }, [setCollection])

  // Bloquear el scroll del body mientras haya un modal o reproductor abierto.
  useEffect(() => {
    document.body.style.overflow = player || addModal || authModal ? 'hidden' : ''
  }, [player, addModal, authModal])

  const toast = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToastMsg({ message, key: Date.now() })
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800)
  }, [])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [setTheme])

  const updateUserName = useCallback(
    (newName) => {
      setUser((prev) => ({
        ...prev,
        name: newName.trim() || 'Invitado',
      }))
    },
    [setUser],
  )

  const login = useCallback(
    (email, _password) => {
      const cleanEmail = email.trim()
      const fallbackName = cleanEmail.split('@')[0]
      const capitalized = fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1)
      setUser({
        name: capitalized || 'Usuario',
        email: cleanEmail,
        isGuest: false,
        google: false,
      })
      setAuthModal(null)
      toast(`¡Bienvenido de nuevo, ${capitalized}!`)
    },
    [setUser, toast],
  )

  const register = useCallback(
    (name, email, _password) => {
      const cleanEmail = email.trim()
      const cleanName = name.trim() || cleanEmail.split('@')[0]
      const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
      setUser({
        name: capitalized,
        email: cleanEmail,
        isGuest: false,
        google: false,
      })
      setAuthModal(null)
      toast(`Cuenta creada. ¡Bienvenido a Sora Anime, ${capitalized}!`)
    },
    [setUser, toast],
  )

  const loginWithGoogle = useCallback(
    (email = 'usuario@gmail.com') => {
      const cleanEmail = email.trim() || 'usuario@gmail.com'
      const fallbackName = cleanEmail.split('@')[0]
      const capitalized = fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1)
      setUser({
        name: capitalized,
        email: cleanEmail,
        isGuest: false,
        google: true,
      })
      setAuthModal(null)
      toast(`Sesión iniciada con Google como ${capitalized}`)
    },
    [setUser, toast],
  )

  const logout = useCallback(() => {
    setUser({
      name: 'Invitado',
      email: '',
      isGuest: true,
      google: false,
    })
    toast('Cerraste sesión. Sigues en modo invitado.')
  }, [setUser, toast])

  /** Añade (o fusiona) un anime con los servidores de un episodio. */
  const addToLibrary = useCallback(
    (anime, episode, servers = []) => {
      const clean = servers
        .filter((s) => s.url?.trim())
        .map((s, i) => ({ id: s.id || uid(), name: s.name?.trim() || `Servidor ${i + 1}`, url: s.url.trim() }))
      setLibrary((lib) => {
        const prev = lib[anime.id]
        const streams = { ...(prev?.streams || {}) }
        if (episode && clean.length) streams[episode] = clean
        return { ...lib, [anime.id]: { ...prev, ...anime, addedAt: prev?.addedAt || Date.now(), streams } }
      })
      toast(`“${anime.title}” guardado en tu colección`)
    },
    [setLibrary, toast],
  )

  const removeFromLibrary = useCallback(
    (id) =>
      setLibrary((lib) => {
        const next = { ...lib }
        delete next[id]
        return next
      }),
    [setLibrary],
  )

  const removeEpisode = useCallback(
    (id, episode) =>
      setLibrary((lib) => {
        if (!lib[id]) return lib
        const streams = { ...lib[id].streams }
        delete streams[episode]
        return { ...lib, [id]: { ...lib[id], streams } }
      }),
    [setLibrary],
  )

  const toggleFavorite = useCallback(
    (anime) => {
      const wasFav = Boolean(favorites[anime.id])
      setFavorites((f) => {
        const next = { ...f }
        if (next[anime.id]) delete next[anime.id]
        else next[anime.id] = { ...anime, favAt: Date.now() }
        return next
      })
      toast(wasFav ? 'Quitado de favoritos' : `“${anime.title}” añadido a favoritos`)
    },
    [favorites, setFavorites, toast],
  )

  /**
   * Sincroniza con el backend (/api/vault):
   * - Si ya está en colección: hace DELETE /api/vault/:id
   * - Si no está: hace POST /api/vault con la tarjeta completa
   */
  const toggleCollection = useCallback(
    (anime) => {
      const strId = String(anime.id)
      const wasIn = Boolean(collection[strId])

      const cleanAnime = {
        ...anime,
        id: strId,
        title: anime.title || anime.originalTitle || 'Anime',
        originalTitle: anime.originalTitle || anime.title || '',
        slug: anime.slug || '',
        poster: anime.poster || anime.image || '',
        image: anime.image || anime.poster || '',
        score: anime.score || anime.s || 8.5,
        type: anime.type || anime.kind || 'Serie',
        genres: anime.genres || (anime.g ? [anime.g] : ['Anime']),
        synopsis: anime.synopsis || anime.syn || 'Sinopsis no disponible.',
        episodes: anime.episodes || anime.eps || 12,
        year: anime.year || 2024,
        colAt: Date.now(),
      }

      setCollection((c) => {
        const next = { ...c }
        if (next[strId]) {
          delete next[strId]
        } else {
          next[strId] = cleanAnime
        }
        return next
      })

      if (wasIn) {
        axios.delete(`${API_BASE}/vault/${encodeURIComponent(strId)}`).catch((e) => {
          console.warn('Error al eliminar de vault en backend:', e.message)
        })
        toast('Quitado de mi colección')
      } else {
        axios.post(`${API_BASE}/vault`, cleanAnime).catch((e) => {
          console.warn('Error al guardar en vault en backend:', e.message)
        })
        toast(`“${cleanAnime.title}” añadido a mi colección`)
      }
    },
    [collection, setCollection, toast],
  )

  const saveProgress = useCallback(
    (animeId, episode, time, duration) =>
      setProgress((p) => ({ ...p, [animeId]: { episode, time, duration, updatedAt: Date.now() } })),
    [setProgress],
  )

  const resetAllData = useCallback(() => {
    setFavorites({})
    setCollection({})
    setProgress({})
    setLibrary({})
    if (user.isGuest) {
      setUser({ name: 'Invitado', email: '', isGuest: true, google: false })
    }
    toast('Todos los datos locales han sido borrados.')
  }, [setFavorites, setCollection, setProgress, setLibrary, setUser, user.isGuest, toast])

  const play = useCallback((animeOrId, episode = 1) => {
    if (typeof animeOrId === 'object' && animeOrId !== null) {
      setActiveAnimeItem(animeOrId)
      setPlayer({ animeId: String(animeOrId.id), episode: Number(episode) })
    } else {
      setPlayer({ animeId: String(animeOrId), episode: Number(episode) })
    }
  }, [])

  const getItemOrCatalog = useCallback(
    (id) => {
      if (!id) return null
      const strId = String(id)
      if (activeAnimeItem && String(activeAnimeItem.id) === strId) {
        return activeAnimeItem
      }
      return collection[strId] || library[strId] || getCatalogAnime(strId) || null
    },
    [activeAnimeItem, collection, library],
  )

  const value = useMemo(
    () => ({
      library,
      collection,
      favorites,
      progress,
      user,
      theme,
      toastMsg,
      addModal,
      authModal,
      player,
      toast,
      toggleTheme,
      updateUserName,
      login,
      register,
      loginWithGoogle,
      logout,
      addToLibrary,
      removeFromLibrary,
      removeEpisode,
      toggleFavorite,
      toggleCollection,
      saveProgress,
      resetAllData,
      isFavorite: (id) => Boolean(favorites[String(id)]),
      isInCollection: (id) => Boolean(collection[String(id)] || library[String(id)]),
      openAddModal: (anime = null, episode = null) => setAddModal({ anime, episode }),
      closeAddModal: () => setAddModal(null),
      openAuthModal: (mode = 'login') => setAuthModal(mode),
      closeAuthModal: () => setAuthModal(null),
      play,
      closePlayer: () => setPlayer(null),
      getItemOrCatalog,
    }),
    [
      library,
      collection,
      favorites,
      progress,
      user,
      theme,
      toastMsg,
      addModal,
      authModal,
      player,
      toast,
      toggleTheme,
      updateUserName,
      login,
      register,
      loginWithGoogle,
      logout,
      addToLibrary,
      removeFromLibrary,
      removeEpisode,
      toggleFavorite,
      toggleCollection,
      saveProgress,
      resetAllData,
      play,
      getItemOrCatalog,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>')
  return ctx
}

/** Episodios con stream de un anime de la colección, ordenados. */
// eslint-disable-next-line react-refresh/only-export-components
export function episodeList(item) {
  if (!item) return []
  if (item.streams) {
    const eps = Object.keys(item.streams)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
    if (eps.length) return eps
  }
  const count = item.episodes || 1
  return Array.from({ length: Math.min(count, 24) }, (_, i) => i + 1)
}
