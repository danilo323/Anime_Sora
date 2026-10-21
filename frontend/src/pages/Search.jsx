import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon } from 'lucide-react'
import axios from 'axios'
import { AnimeGrid } from '../components/AnimeCard'
import { EmptyState, PageHeader } from '../components/ui'
import { API_BASE } from '../context/AppContext'
import { ALL_CATALOG } from '../data/animeCatalog'

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (!term) {
      setResults([])
      setLoading(false)
      return
    }

    const source = axios.CancelToken.source()
    setLoading(true)

    axios
      .get(`${API_BASE}/search`, {
        params: { q: term },
        cancelToken: source.token,
        timeout: 10000,
      })
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setResults(res.data)
        } else {
          // Fallback a coincidencias locales si no devuelve resultados del backend
          const local = ALL_CATALOG.filter((x) => {
            const matchTitle = x.title.toLowerCase().includes(term.toLowerCase())
            const matchGenre = x.genres?.some((g) => g.toLowerCase().includes(term.toLowerCase()))
            const matchSyn = x.synopsis && x.synopsis.toLowerCase().includes(term.toLowerCase())
            return matchTitle || matchGenre || matchSyn
          })
          setResults(local)
        }
      })
      .catch((err) => {
        if (axios.isCancel(err)) return
        console.warn('Error al buscar en backend (/api/search), usando catálogo local:', err.message)
        const local = ALL_CATALOG.filter((x) => {
          const matchTitle = x.title.toLowerCase().includes(term.toLowerCase())
          const matchGenre = x.genres?.some((g) => g.toLowerCase().includes(term.toLowerCase()))
          const matchSyn = x.synopsis && x.synopsis.toLowerCase().includes(term.toLowerCase())
          return matchTitle || matchGenre || matchSyn
        })
        setResults(local)
      })
      .finally(() => setLoading(false))

    return () => {
      source.cancel('Query changed')
    }
  }, [q])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={q ? `Resultados para “${q}”` : 'Buscar anime'} />

      {q && (
        <p className="text-xs text-ink-muted">
          {loading ? 'Buscando títulos e idiomas...' : `${results.length} títulos encontrados`}
        </p>
      )}

      {loading ? (
        <AnimeGrid loading={true} count={8} />
      ) : results.length > 0 ? (
        <AnimeGrid items={results} loading={false} />
      ) : (
        <EmptyState
          icon={SearchIcon}
          message={
            q
              ? `No encontramos nada para “${q}”. Prueba con otro título o un género como “Fantasía”.`
              : 'Escribe un término en el buscador para encontrar animes, géneros o películas.'
          }
        >
          <Link to="/explorar" className="btn btn-primary btn-sm">
            Explorar catálogo
          </Link>
        </EmptyState>
      )}
    </div>
  )
}
