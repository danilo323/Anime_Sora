import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, LoaderCircle, Search, Star, X } from 'lucide-react'
import axios from 'axios'
import Logo from './ui/Logo'
import { useApp, API_BASE } from '../context/AppContext'
import { useDebounce } from '../hooks'

/**
 * Modal "Añadir anime" conectado al backend de Sora Anime:
 * - Busca en GET http://localhost:4000/api/search?q=${query} con debounce de 400ms.
 * - Muestra las versiones Japonés (SUB) y Español Latino (LAT) con sus respectivos badges.
 * - Al hacer clic en un anime, lo guarda directamente en la colección (POST /api/vault)
 *   y lo agrega al catálogo sin pedir URLs manuales.
 */
export default function AddAnimeModal() {
  const { addModal, closeAddModal } = useApp()
  if (!addModal) return null

  return <ModalBody onClose={closeAddModal} />
}

function ModalBody({ onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const debounced = useDebounce(q, 400)
  const { toggleCollection, isInCollection } = useApp()
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const term = debounced.trim()
    if (term.length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }

    const source = axios.CancelToken.source()
    setLoading(true)
    setError(null)

    axios
      .get(`${API_BASE}/search`, {
        params: { q: term },
        cancelToken: source.token,
        timeout: 8000,
      })
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setResults(res.data)
        } else {
          setResults([])
        }
      })
      .catch((err) => {
        if (axios.isCancel(err)) return
        console.warn('Error en búsqueda de modal:', err.message)
        setError('No se pudo conectar con el servidor de búsqueda. Inténtalo de nuevo.')
        setResults([])
      })
      .finally(() => {
        setLoading(false)
      })

    return () => {
      source.cancel('Query changed')
    }
  }, [debounced])

  const handleSelect = (anime) => {
    toggleCollection(anime)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] animate-fade bg-player/55 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-anime-title"
        className="fixed top-1/2 left-1/2 z-[61] flex max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] bg-surface-0 text-ink shadow-modal sm:rounded-3xl"
      >
        <div className="animate-pop flex min-h-0 flex-1 flex-col">
          <button
            id="add-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 z-10 grid size-9 place-items-center rounded-full text-ink-muted transition hover:bg-brand-100"
          >
            <X className="size-5" />
          </button>

          <div className="px-6 pt-7 sm:px-8 sm:pt-8">
            <Logo size="lg" on="card" />
            <h2 id="add-anime-title" className="mt-3.5 text-2xl font-semibold">Añadir anime</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              Busca el título en Japonés (SUB) o Español Latino (LAT) y agrégalo a tu colección en un clic.
            </p>
            <label className="field mt-5">
              {loading ? <LoaderCircle className="size-[18px] animate-spin text-brand-500" /> : <Search className="size-[18px]" />}
              <input
                ref={inputRef}
                id="add-modal-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej. Naruto, Frieren, Spy x Family…"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="mt-4 min-h-[220px] flex-1 overflow-y-auto px-3 pb-4 sm:px-5">
            {error && (
              <p className="flex items-center gap-2 px-3 py-4 text-sm text-danger-text">
                <CircleAlert className="size-4" /> {error}
              </p>
            )}
            {!error && q.trim().length < 2 && (
              <p className="px-3 py-10 text-center text-sm text-ink-muted">Escribe al menos 2 letras para buscar anime.</p>
            )}
            {!error && !loading && debounced.trim().length >= 2 && results.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-ink-muted">No encontramos resultados para “{debounced}”.</p>
            )}

            <ul className="flex flex-col gap-1">
              {loading && results.length === 0 &&
                Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="skeleton h-[72px] w-[52px] rounded-lg" />
                    <span className="flex-1">
                      <span className="skeleton block h-4 w-2/3 rounded" />
                      <span className="skeleton mt-2 block h-3 w-1/3 rounded" />
                    </span>
                  </li>
                ))}

              {results.map((a) => {
                const inCol = isInCollection(a.id)
                const posterSrc = a.poster || a.imageSmall || a.image
                return (
                  <li key={a.id}>
                    <button
                      id={`add-modal-result-${a.id}`}
                      onClick={() => handleSelect(a)}
                      className="group flex w-full items-center gap-3.5 rounded-2xl px-3 py-2 text-left transition hover:bg-surface-100"
                    >
                      <div className="relative h-[72px] w-[52px] flex-none overflow-hidden rounded-lg bg-brand-100 shadow-card">
                        {posterSrc ? (
                          <img src={posterSrc} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <span className="skeleton block size-full" />
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[15px] font-semibold">{a.title}</b>
                        <small className="mt-0.5 block truncate text-xs text-ink-muted">
                          {[
                            a.type || a.kind,
                            a.year,
                            a.episodes ? `${a.episodes} eps` : null,
                            Array.isArray(a.genres) ? a.genres.slice(0, 2).join(', ') : a.g,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        {inCol && (
                          <small className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-link">
                            <Check className="size-3" /> En tu colección (haz clic para quitar)
                          </small>
                        )}
                      </span>
                      {(a.score || a.s) && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-star">
                          <Star className="size-3.5 fill-current" /> {a.score || a.s}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className="border-t border-brand-100 px-6 py-3 text-center text-[11px] text-ink-muted">
            Haz clic en cualquier versión para guardarla en tu colección y verla al instante
          </p>
        </div>
      </div>
    </>
  )
}
