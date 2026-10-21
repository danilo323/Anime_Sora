import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon } from 'lucide-react'
import axios from 'axios'
import { AnimeGrid } from '../components/AnimeCard'
import { EmptyState, PageHeader } from '../components/ui'
import { API_BASE } from '../context/AppContext'

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
        if (Array.isArray(res.data)) {
          setResults(res.data)
        } else {
          setResults([])
        }
      })
      .catch((err) => {
        if (axios.isCancel(err)) return
        console.warn('Error al buscar en backend (/api/search):', err.message)
        setResults([])
      })
      .finally(() => setLoading(false))

    return () => {
      source.cancel('Search query changed')
    }
  }, [q])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={q ? `Búsqueda: “${q}”` : 'Búsqueda'}
        count={!loading && results.length > 0 ? results.length : null}
      />

      {loading ? (
        <AnimeGrid loading={true} skeletons={12} />
      ) : results.length > 0 ? (
        <AnimeGrid items={results} loading={false} />
      ) : q ? (
        <EmptyState
          icon={SearchIcon}
          message={`No encontramos animes que coincidan con “${q}”.`}
        >
          <Link to="/explorar" className="btn btn-primary btn-sm">
            Explorar catálogo completo
          </Link>
        </EmptyState>
      ) : (
        <EmptyState
          icon={SearchIcon}
          message="Escribe algo en la barra de búsqueda superior para comenzar a buscar."
        />
      )}
    </div>
  )
}
