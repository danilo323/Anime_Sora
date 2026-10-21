import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Compass, RotateCcw } from 'lucide-react'
import { AnimeGrid } from '../components/AnimeCard'
import { EmptyState, PageHeader, Tabs } from '../components/ui'
import { ALL_CATALOG, GENRES, sortAnime } from '../data/animeCatalog'
import { getTopAnime } from '../lib/jikan'

const KIND_TABS = [
  ['all', 'Todo'],
  ['series', 'Series'],
  ['movies', 'Películas'],
]

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') || 'all'
  const genre = params.get('genre') || ''
  const sort = params.get('sort') || 'score'

  const [remoteAnime, setRemoteAnime] = useState([])
  const [_loading, setLoading] = useState(false)

  // Opcionalmente enriquece con Jikan si hay conexión
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    const typeParam = kind === 'movies' ? 'movie' : kind === 'series' ? 'tv' : undefined
    getTopAnime({ limit: 18, type: typeParam, signal: ctrl.signal })
      .then((items) => {
        if (items?.length) setRemoteAnime(items)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    return () => ctrl.abort()
  }, [kind])

  const setParam = (key, val) => {
    const next = new URLSearchParams(params)
    if (!val || val === 'all' || (key === 'sort' && val === 'score')) {
      next.delete(key)
    } else {
      next.set(key, val)
    }
    setParams(next)
  }

  const items = useMemo(() => {
    // Mezclar catálogo local y remotos únicos
    const all = [...ALL_CATALOG]
    const seen = new Set(all.map((a) => String(a.id)))
    for (const r of remoteAnime) {
      if (!seen.has(String(r.id))) {
        all.push(r)
        seen.add(String(r.id))
      }
    }

    const filtered = all.filter((a) => {
      // Filtro formato
      const isMovie = (a.type || a.kind) === 'Película' || a.type === 'Movie'
      if (kind === 'movies' && !isMovie) return false
      if (kind === 'series' && isMovie) return false

      // Filtro género
      if (genre) {
        const itemGenres = a.genres || [a.g].filter(Boolean)
        const match = itemGenres.some((g) => g.toLowerCase() === genre.toLowerCase())
        if (!match) return false
      }

      return true
    })

    return sortAnime(filtered, sort)
  }, [kind, genre, sort, remoteAnime])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <PageHeader title="Explorar" />
        <Tabs items={KIND_TABS} value={kind} onChange={(k) => setParam('kind', k)} />
      </div>

      {/* Barra de filtros: chips de género y ordenación */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setParam('genre', '')}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              !genre
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-surface-0 text-ink ring-[1.5px] ring-brand-100 ring-inset hover:ring-brand-400'
            }`}
          >
            Todos
          </button>
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setParam('genre', g === genre ? '' : g)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                genre.toLowerCase() === g.toLowerCase()
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-surface-0 text-ink ring-[1.5px] ring-brand-100 ring-inset hover:ring-brand-400'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span>Ordenar por:</span>
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="rounded-xl border-0 bg-surface-0 px-3 py-1.5 text-xs font-medium text-ink ring-[1.5px] ring-brand-100 ring-inset outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="score">Mejor valorados</option>
            <option value="views">Más vistos</option>
            <option value="az">A - Z</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-ink-muted">{items.length} títulos encontrados</p>

      {items.length > 0 ? (
        <AnimeGrid items={items} loading={false} />
      ) : (
        <EmptyState
          icon={Compass}
          message="No encontramos animes con los filtros seleccionados."
        >
          <button
            onClick={() => {
              setParams(new URLSearchParams())
            }}
            className="btn btn-outline btn-sm gap-2"
          >
            <RotateCcw className="size-4" />
            Limpiar filtros
          </button>
        </EmptyState>
      )}
    </div>
  )
}
