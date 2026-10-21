import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Film, Heart, Play, Plus, Search } from 'lucide-react'
import axios from 'axios'
import AnimePoster from '../components/ui/AnimePoster'
import { AnimeGrid } from '../components/AnimeCard'
import { SectionHeader, Tabs } from '../components/ui'
import { useApp, episodeList, API_BASE } from '../context/AppContext'
import { getAnimeById, getRecommendations } from '../lib/jikan'

const DETAIL_TABS = [
  ['eps', 'Episodios'],
  ['ov', 'Resumen / Sinopsis'],
]

const EPISODES_PER_PAGE = 24

export default function Detail() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const passedAnime = location.state?.anime
  const {
    getItemOrCatalog,
    isFavorite,
    toggleFavorite,
    isInCollection,
    toggleCollection,
    progress,
    play,
  } = useApp()

  const [remoteAnime, setRemoteAnime] = useState(null)
  const [remoteRecs, setRemoteRecs] = useState([])
  const [tab, setTab] = useState('eps')
  const [loading, setLoading] = useState(false)
  const [epPage, setEpPage] = useState(1)
  const [epSearch, setEpSearch] = useState('')
  const [episodesMeta, setEpisodesMeta] = useState({})

  // Anime resuelto (state de navegación, colección o remoto del backend)
  const anime = useMemo(() => {
    if (passedAnime && String(passedAnime.id) === String(id)) return passedAnime
    return getItemOrCatalog(id) || remoteAnime
  }, [id, passedAnime, getItemOrCatalog, remoteAnime])

  // Cargar capturas y títulos reales de cada episodio (Kitsu CDN)
  useEffect(() => {
    if (!anime?.id && !anime?.title) return
    let alive = true
    const animeId = anime?.id || 'custom'
    axios
      .get(`${API_BASE}/anime/${encodeURIComponent(animeId)}/episodes-thumbnails`, {
        params: { title: anime?.title || '', limit: 100 },
        timeout: 7000,
      })
      .then((res) => {
        if (!alive || !Array.isArray(res.data)) return
        const map = {}
        for (const ep of res.data) {
          if (ep.number) {
            map[ep.number] = {
              thumb: ep.thumbnail,
              title: ep.title,
              synopsis: ep.synopsis,
            }
          }
        }
        setEpisodesMeta(map)
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [anime?.id, anime?.title])

  // Cargar de la API si no viene en state o colección
  useEffect(() => {
    if (passedAnime && String(passedAnime.id) === String(id)) return
    const ctrl = new AbortController()
    setLoading(true)
    getAnimeById(id, { signal: ctrl.signal })
      .then((data) => {
        if (data) setRemoteAnime(data)
        getRecommendations(id, { signal: ctrl.signal })
          .then(setRemoteRecs)
          .catch(() => {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    return () => ctrl.abort()
  }, [id, passedAnime])

  // Resetear página de episodios si cambia el anime
  useEffect(() => {
    setEpPage(1)
  }, [id])

  if (!anime && loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="skeleton h-10 w-48 rounded-full" />
        <div className="skeleton aspect-video w-full rounded-2xl md:aspect-[21/9]" />
      </div>
    )
  }

  if (!anime) {
    return (
      <div className="py-20 text-center text-ink-muted">
        <h1 className="text-2xl font-semibold text-ink">Anime no encontrado</h1>
        <p className="mt-2 text-sm">No pudimos encontrar la información de este título.</p>
        <Link to="/explorar" className="btn btn-primary btn-sm mt-5">
          Volver a explorar
        </Link>
      </div>
    )
  }

  const fav = isFavorite(anime.id)
  const inCol = isInCollection(anime.id)
  const prog = progress[anime.id]
  const resumeEp = prog?.episode || 1
  const percent = prog?.duration ? Math.min(100, Math.round((prog.time / prog.duration) * 100)) : 0

  // Muestra SOLO los géneros reales del anime (Item 3)
  const allGenreChips = Array.isArray(anime.genres) && anime.genres.length > 0
    ? anime.genres
    : (anime.g ? [anime.g] : [])

  const episodes = episodeList(anime)
  const filteredEpisodes = useMemo(() => {
    const q = epSearch.trim().toLowerCase()
    if (!q) return episodes
    return episodes.filter((n) => {
      const s = String(n)
      return s.includes(q) || `episodio ${s}`.includes(q)
    })
  }, [episodes, epSearch])

  const totalPages = Math.max(1, Math.ceil(filteredEpisodes.length / EPISODES_PER_PAGE))
  const currentEpisodes = filteredEpisodes.slice(
    (epPage - 1) * EPISODES_PER_PAGE,
    epPage * EPISODES_PER_PAGE,
  )

  const moreLikeThis = remoteRecs.slice(0, 6)

  const handlePlay = (ep = resumeEp) => {
    play(anime, ep)
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Barra superior de navegación rápida */}
      <div className="flex flex-wrap items-center gap-3 md:gap-6">
        <button
          onClick={() => navigate(-1)}
          className="btn btn-outline btn-sm !px-3.5 gap-2"
        >
          <ArrowLeft className="size-4" />
          Volver
        </button>
        {allGenreChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allGenreChips.map((g, i) => (
              <Link
                key={g}
                to={`/explorar?genre=${encodeURIComponent(g)}`}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  i === 0
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-0 text-ink ring-[1.5px] ring-brand-100 ring-inset hover:ring-brand-400'
                }`}
              >
                {g}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Grid de 2 columnas: Vista previa / pestañas a la izquierda, Ficha a la derecha */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Columna principal */}
        <div className="flex flex-col gap-6">
          {/* Banner 16:9 con botón central de reproducción */}
          <div className="group relative aspect-video w-full overflow-hidden rounded-[22px] bg-navy-900 shadow-card">
            {anime.trailerImage || anime.image || anime.poster ? (
              <img
                src={anime.trailerImage || anime.image || anime.poster}
                alt={anime.title}
                className="size-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="grid size-full place-items-center text-ink-muted">
                <Film className="size-16 stroke-1 opacity-40" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-transparent to-black/20" />

            <button
              onClick={() => handlePlay(resumeEp)}
              aria-label="Reproducir ahora"
              className="absolute inset-0 grid place-items-center group-hover:bg-navy-900/10 transition"
            >
              <span className="grid size-16 place-items-center rounded-full bg-white/95 text-brand-600 shadow-2xl transition duration-300 group-hover:scale-110 group-hover:bg-white md:size-20">
                <Play className="ml-1 size-7 fill-current md:size-9" />
              </span>
            </button>

            {/* Barra de progreso si ya empezó */}
            {percent > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>

          {/* Pestañas de contenido */}
          <Tabs items={DETAIL_TABS} value={tab} onChange={setTab} />

          {tab === 'ov' && (
            <div className="space-y-4 rounded-[18px] bg-surface-0 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink">Sinopsis</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                {anime.synopsis || 'Sinopsis no disponible.'}
              </p>
              {anime.originalTitle && (
                <div className="border-t border-brand-100/60 pt-4 text-xs text-ink-muted">
                  <span className="font-semibold text-ink">Título original:</span> {anime.originalTitle}
                </div>
              )}
            </div>
          )}

          {tab === 'eps' && (
            <div className="flex flex-col gap-4">
              {/* Barra superior de episodios con buscador */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-surface-0 px-4 py-3 shadow-sm">
                <span className="text-sm font-semibold text-ink">
                  Episodios disponibles ({filteredEpisodes.length}
                  {filteredEpisodes.length !== episodes.length ? ` de ${episodes.length}` : ''})
                </span>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
                  <input
                    type="text"
                    placeholder="Filtrar por número..."
                    value={epSearch}
                    onChange={(e) => {
                      setEpSearch(e.target.value)
                      setEpPage(1)
                    }}
                    className="w-full rounded-lg bg-surface-100 py-1.5 pl-8 pr-7 text-xs text-ink placeholder-ink-muted outline-none ring-1 ring-brand-100 focus:ring-2 focus:ring-brand-500"
                  />
                  {epSearch && (
                    <button
                      onClick={() => {
                        setEpSearch('')
                        setEpPage(1)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {currentEpisodes.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {currentEpisodes.map((epNum) => {
                    const epMeta = episodesMeta[epNum]
                    return (
                      <button
                        key={epNum}
                        onClick={() => handlePlay(epNum)}
                        className="group flex items-center gap-3 rounded-[14px] bg-surface-0 p-2.5 text-left shadow-sm transition hover:shadow-card hover:ring-1 hover:ring-brand-400"
                      >
                        <div className="relative aspect-video w-[90px] flex-none overflow-hidden rounded-lg bg-navy-950 shadow-inner">
                          {epMeta?.thumb ? (
                            <img
                              src={epMeta.thumb}
                              alt={`Episodio ${epNum}`}
                              className="size-full object-cover transition duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <AnimePoster anime={anime} />
                          )}
                          <span className="absolute inset-0 grid place-items-center bg-navy-900/25 transition group-hover:bg-navy-900/10">
                            <Play className="size-4 fill-white text-white drop-shadow" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <b className="block truncate text-sm font-semibold group-hover:text-brand-600">
                            Episodio {epNum}
                          </b>
                          <small className="block truncate text-xs text-ink-muted">
                            {epMeta?.title ? epMeta.title : (anime.duration || '24 min')}
                          </small>
                        </div>
                        <span className="grid size-8 flex-none place-items-center rounded-full bg-brand-600 text-white transition group-hover:bg-brand-700">
                          <Play className="ml-0.5 size-3.5 fill-current" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-[16px] bg-surface-0 p-8 text-center text-xs text-ink-muted shadow-sm">
                  No se encontraron episodios con el filtro "{epSearch}".
                </div>
              )}

              {/* Paginación de episodios si superan el tamaño de página (Item 6) */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-surface-0 px-4 py-3 shadow-sm text-xs font-medium text-ink-muted">
                  <span>
                    Episodios {(epPage - 1) * EPISODES_PER_PAGE + 1} -{' '}
                    {Math.min(epPage * EPISODES_PER_PAGE, episodes.length)} de {episodes.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEpPage((p) => Math.max(1, p - 1))}
                      disabled={epPage === 1}
                      className="btn btn-outline btn-sm !px-3 !py-1 text-xs disabled:opacity-30"
                    >
                      Anterior
                    </button>
                    <span className="px-2 font-semibold text-ink">
                      {epPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setEpPage((p) => Math.min(totalPages, p + 1))}
                      disabled={epPage === totalPages}
                      className="btn btn-outline btn-sm !px-3 !py-1 text-xs disabled:opacity-30"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ficha lateral (sidebar adhesiva) */}
        <aside className="h-fit rounded-[22px] bg-surface-0 p-6 shadow-card lg:sticky lg:top-24">
          <div className="mx-auto aspect-[3/4] w-[130px] overflow-hidden rounded-xl shadow-md">
            <AnimePoster anime={anime} />
          </div>

          <h1 className="mt-4 text-center text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {anime.title}
          </h1>

          {/* Formateo de episodios y año seguro (Item 4) */}
          <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-ink-muted">
            <span>{anime.episodes ? `${anime.episodes} episodios` : 'En emisión'}</span>
            <span>·</span>
            <span>{anime.views ? `${anime.views} vistas` : (anime.year || '—')}</span>
          </div>

          {/* Chips de formato, favorito y puntuación (Item 4) */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="chip-score !bg-brand-100 !text-brand-700 flex items-center gap-1.5">
              <Film className="size-3.5" />
              {anime.type || anime.kind || 'Serie'}
            </span>
            <button
              onClick={() => toggleFavorite(anime)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                fav
                  ? 'bg-danger-100 text-danger'
                  : 'bg-surface-100 text-ink-muted ring-[1.5px] ring-brand-100 ring-inset hover:text-ink'
              }`}
            >
              <Heart className={`size-3.5 ${fav ? 'fill-current' : ''}`} />
              Favorito
            </button>
            <span className="chip-score !bg-star/15 !text-amber-700 font-bold">
              ★ {anime.score != null ? anime.score : '—'}
            </span>
          </div>

          {/* Botones de acción principales */}
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => handlePlay(resumeEp)}
              className="btn btn-primary w-full shadow-brand"
            >
              <Play className="size-4.5 fill-current" />
              {percent > 0 ? 'Continuar reproducción' : 'Ver ahora'}
            </button>

            <button
              onClick={() => toggleCollection(anime)}
              className={`btn btn-outline w-full ${inCol ? '!bg-brand-100 !text-brand-700 !ring-0' : ''}`}
            >
              {inCol ? <Check className="size-4.5" /> : <Plus className="size-4.5" />}
              {inCol ? 'En mi colección' : 'Añadir a mi colección'}
            </button>
          </div>
        </aside>
      </div>

      {/* También te puede gustar */}
      {moreLikeThis.length > 0 && (
        <section className="mt-8 border-t border-brand-100/70 pt-8">
          <SectionHeader title="También te puede gustar" />
          <AnimeGrid items={moreLikeThis} loading={false} />
        </section>
      )}
    </div>
  )
}
