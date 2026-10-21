import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  List,
  ListVideo,
  Play,
  Search,
  Volume2,
  X,
} from 'lucide-react'
import axios from 'axios'
import { useApp, episodeList, API_BASE } from '../context/AppContext'
import { useLocalStorage } from '../hooks'

const DEFAULT_SERVERS = [
  { name: 'Sora HD', desc: 'Principal · 1080p' },
  { name: 'Nube', desc: 'Alternativo · 720p' },
  { name: 'Espejo', desc: 'Respaldo · 480p' },
]

const RANGE_SIZE = 25

export default function PlayerView() {
  const { player, getItemOrCatalog } = useApp()
  if (!player) return null
  const item = getItemOrCatalog(player.animeId)
  return <PlayerSession item={item} episode={player.episode} />
}

function PlayerSession({ item, episode }) {
  const { closePlayer, play, toggleFavorite, isFavorite } = useApp()

  const episodes = useMemo(() => episodeList(item), [item])
  const epIdx = episodes.indexOf(episode)
  const prevEp = epIdx > 0 ? episodes[epIdx - 1] : null
  const nextEp = epIdx >= 0 && epIdx < episodes.length - 1 ? episodes[epIdx + 1] : null

  const resolvedSlug = useMemo(() => {
    if (item?.slug) return item.slug
    if (!item?.title) return ''
    return item.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }, [item?.slug, item?.title])

  const [backendServers, setBackendServers] = useState([])
  const [loading, setLoading] = useState(Boolean(resolvedSlug))
  const [serverIdx, setServerIdx] = useState(0)

  // Estado del panel lateral de episodios (estilo JKAnime)
  const [showSidebar, setShowSidebar] = useLocalStorage('sora_player_sidebar', true)
  const [searchQuery, setSearchQuery] = useState('')
  const [rangeIdx, setRangeIdx] = useState(() => Math.floor((episode - 1) / RANGE_SIZE))
  const [sortAsc, setSortAsc] = useState(true)
  const [showAllEpisodes, setShowAllEpisodes] = useState(false)
  const [watchedEpisodes, setWatchedEpisodes] = useLocalStorage(`sora_watched_${item?.id || 'default'}`, {})
  const [filterWatchedOnly, setFilterWatchedOnly] = useState(false)
  const [episodesMeta, setEpisodesMeta] = useState({})

  const activeItemRef = useRef(null)

  // Cargar capturas y títulos reales de cada episodio (Kitsu CDN)
  useEffect(() => {
    if (!item?.id && !item?.title) return
    let alive = true
    const animeId = item?.id || 'custom'
    axios
      .get(`${API_BASE}/anime/${encodeURIComponent(animeId)}/episodes-thumbnails`, {
        params: { title: item?.title || '', limit: 100 },
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
  }, [item?.id, item?.title])

  // Marcar automáticamente el episodio actual como visto
  useEffect(() => {
    if (!item?.id || !episode) return
    setWatchedEpisodes((prev) => ({
      ...prev,
      [episode]: true,
    }))
  }, [item?.id, episode, setWatchedEpisodes])

  // Cargar servidores del episodio actual desde el backend
  useEffect(() => {
    if (!resolvedSlug) {
      setBackendServers([])
      setLoading(false)
      return
    }

    let alive = true
    setLoading(true)

    const audioKey = item?.audioKey || 'SUB'
    axios
      .get(`${API_BASE}/episode/${encodeURIComponent(resolvedSlug)}/${episode}`, {
        params: { audioKey },
        timeout: 9000,
      })
      .then((res) => {
        if (!alive) return
        const list = res.data?.servers || []
        if (Array.isArray(list) && list.length > 0) {
          setBackendServers(list)
          setServerIdx(0)
        } else {
          setBackendServers([])
        }
      })
      .catch((err) => {
        if (!alive) return
        console.warn('Error al obtener servidores:', err.message)
        setBackendServers([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [resolvedSlug, episode, item?.audioKey])

  // Ajustar rango cuando cambia el episodio activo
  useEffect(() => {
    const targetRange = Math.floor((episode - 1) / RANGE_SIZE)
    setRangeIdx(targetRange)
  }, [episode])

  // Desplazar automáticamente la lista hasta el episodio activo
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [episode, showSidebar, rangeIdx, showAllEpisodes])

  const serversList = useMemo(() => {
    if (backendServers.length > 0) {
      return backendServers.map((s, i) => ({
        name: s.name || `Servidor ${i + 1}`,
        desc: s.originalServer ? `${s.originalServer} · HD` : (i === 0 ? 'Principal · 1080p' : 'Alternativo · 720p'),
        embedUrl: s.embedUrl || '',
      }))
    }
    return DEFAULT_SERVERS
  }, [backendServers])

  const curServer = serversList[serverIdx] || serversList[0]
  const hasEmbedUrl = Boolean(curServer?.embedUrl)

  const handleClose = useCallback(() => {
    closePlayer()
  }, [closePlayer])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'IFRAME') return
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  const fav = isFavorite(item?.id)

  // Rangos de paginación para series largas (ej: Ep 1 - 25, Ep 26 - 50...)
  const ranges = useMemo(() => {
    const totalRanges = Math.ceil(episodes.length / RANGE_SIZE)
    return Array.from({ length: totalRanges }, (_, idx) => {
      const start = idx * RANGE_SIZE + 1
      const end = Math.min((idx + 1) * RANGE_SIZE, episodes.length)
      return { idx, label: `Ep ${start} - ${end}`, start, end }
    })
  }, [episodes.length])

  // Episodios filtrados por búsqueda, rango, orden y vistos
  const visibleEpisodes = useMemo(() => {
    let list = [...episodes]

    // Filtrar por texto de búsqueda
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((n) => {
        const numStr = String(n)
        return numStr.includes(q) || `episodio ${numStr}`.includes(q)
      })
    } else if (!showAllEpisodes && ranges[rangeIdx]) {
      const currentRange = ranges[rangeIdx]
      list = list.slice(currentRange.start - 1, currentRange.end)
    }

    // Filtrar vistos
    if (filterWatchedOnly) {
      list = list.filter((n) => Boolean(watchedEpisodes[n]))
    }

    // Orden ascendente o descendente
    if (!sortAsc) {
      list.reverse()
    }

    return list
  }, [episodes, searchQuery, showAllEpisodes, ranges, rangeIdx, filterWatchedOnly, watchedEpisodes, sortAsc])

  return (
    <div
      className="player opening fixed inset-0 z-50 flex flex-col bg-navy-950 text-white overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`Reproduciendo ${item?.title}`}
    >
      {/* 1. Barra de encabezado superior */}
      <header className="flex-none flex items-center justify-between border-b border-white/10 bg-navy-900/90 px-4 py-2.5 backdrop-blur-md z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleClose}
            title="Cerrar reproductor (Esc)"
            className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          >
            <X className="size-4.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate text-white">{item?.title || 'Sora Anime'}</h1>
            <p className="text-xs text-white/60 truncate">
              Episodio {episode} {item?.episodes ? `de ${item.episodes}` : ''} ·{' '}
              {item?.audioKey === 'LAT' ? 'Español Latino' : 'Sub Español'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón para alternar panel lateral de episodios */}
          <button
            onClick={() => setShowSidebar((s) => !s)}
            title={showSidebar ? 'Ocultar episodios' : 'Ver episodios'}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              showSidebar ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-400/40' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            <ListVideo className="size-4" />
            <span className="hidden sm:inline">{showSidebar ? 'Ocultar episodios' : 'Ver episodios'}</span>
          </button>
        </div>
      </header>

      {/* 2. Cuerpo principal: Contenedor con Video a la izquierda y Episodios a la derecha (estilo JKAnime) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative overflow-hidden">
        {/* Columna Izquierda: Reproductor de Video */}
        <section className="flex-1 flex flex-col min-w-0 h-full bg-black relative">
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            {hasEmbedUrl ? (
              <iframe
                key={`${curServer.name}-${curServer.embedUrl}`}
                src={curServer.embedUrl}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="absolute inset-0 size-full border-0 bg-black"
                title={`${item?.title || 'Anime'} - ${curServer.name}`}
              />
            ) : loading ? (
              <div className="flex flex-col items-center gap-3 text-white p-6 text-center">
                <span className="size-12 animate-spin rounded-full border-4 border-brand-500/30 border-t-brand-500" />
                <b className="text-base font-semibold">Cargando servidores de streaming…</b>
                <p className="text-xs text-white/60 max-w-xs">
                  Extrayendo servidores en tiempo real para el Episodio {episode}.
                </p>
              </div>
            ) : (
              <div className="text-center p-6 text-white/80 max-w-md">
                <p className="text-base font-semibold">No se encontraron servidores para este episodio</p>
                <p className="text-xs text-white/50 mt-1">
                  Intenta cambiar de servidor abajo o selecciona otro episodio en la lista de la derecha.
                </p>
              </div>
            )}
          </div>

          {/* Barra inferior del reproductor con título y servidores (estilo JKAnime) */}
          <div className="flex-none border-t border-white/10 bg-navy-950/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="block text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate">
                  EPISODIO {episode} {item?.audioKey === 'LAT' ? 'LATINO' : 'JAPONÉS'} - {item?.title}
                </span>
              </div>
              {/* Barra de acento inferior naranja / brand similar a JKAnime */}
              <div className="mt-1 h-0.5 w-16 bg-amber-500 rounded-full" />
              <span className="mt-1 block text-[11px] text-white/60">
                {item?.audioKey === 'LAT' ? '🇲🇽 Doblaje en Español Latino' : '🇯🇵 Audio Japonés con Subtítulos en Español'}
              </span>
            </div>

            {/* Selector de servidores (Sora HD, Nube, Espejo) y acciones */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-white/50 hidden md:inline">Servidores:</span>
              <div className="flex items-center rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
                {serversList.map((s, idx) => {
                  const active = idx === serverIdx
                  return (
                    <button
                      key={s.name}
                      onClick={() => setServerIdx(idx)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        active
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                      title={s.desc}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>

              {/* Botón de favorito */}
              <button
                onClick={() => toggleFavorite(item)}
                title={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                className={`grid size-8 place-items-center rounded-lg transition ${
                  fav ? 'bg-danger text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Heart className={`size-4 ${fav ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Columna Derecha: Panel de Selección de Episodios (diseño tipo JKAnime) */}
        {showSidebar && (
          <aside className="w-full lg:w-[350px] xl:w-[390px] h-[340px] lg:h-full flex-none bg-navy-900/95 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col z-20 backdrop-blur-xl">
            {/* Cabecera del panel: Rango, búsqueda y filtros estilo JKAnime */}
            <div className="p-3 border-b border-white/10 flex flex-col gap-2.5 bg-navy-950/70">
              <div className="flex items-center justify-between gap-2">
                {/* Selector de rango de episodios */}
                {!showAllEpisodes && ranges.length > 1 ? (
                  <div className="relative flex-1">
                    <select
                      value={rangeIdx}
                      onChange={(e) => {
                        setRangeIdx(Number(e.target.value))
                        setSearchQuery('')
                      }}
                      className="w-full rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white outline-none ring-1 ring-white/15 focus:ring-brand-500"
                    >
                      {ranges.map((r) => (
                        <option key={r.idx} value={r.idx} className="bg-navy-900 text-white">
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wider text-white/90">
                    {showAllEpisodes ? `Todos los episodios (${episodes.length})` : `Episodios (${episodes.length})`}
                  </span>
                )}

                {/* Botón ojo: alternar vistos */}
                <button
                  onClick={() => setFilterWatchedOnly((w) => !w)}
                  title={filterWatchedOnly ? 'Mostrando solo vistos' : 'Mostrar todos'}
                  className={`grid size-8 place-items-center rounded-lg transition ${
                    filterWatchedOnly ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {filterWatchedOnly ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>

                {/* Botón de orden: Ascendente / Descendente */}
                <button
                  onClick={() => setSortAsc((a) => !a)}
                  title={sortAsc ? 'Orden: 1 a N (cambiar a N a 1)' : 'Orden: N a 1 (cambiar a 1 a N)'}
                  className="grid size-8 place-items-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
                >
                  <ArrowDownUp className="size-3.5" />
                </button>

                <span className="text-[11px] font-mono text-white/50 px-2 py-1 rounded bg-white/5 flex-none">
                  {episodes.length} eps
                </span>
              </div>

              {/* Input para filtrar episodios rápidamente */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/40" />
                <input
                  type="text"
                  placeholder="Filtrar episodio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg bg-white/5 py-1.5 pl-8 pr-7 text-xs text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-brand-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Lista scrollable de episodios con miniaturas y estado activo */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
              {visibleEpisodes.length > 0 ? (
                visibleEpisodes.map((num) => {
                  const isActive = num === episode
                  const isWatched = Boolean(watchedEpisodes[num])
                  return (
                    <button
                      key={num}
                      ref={isActive ? activeItemRef : null}
                      onClick={() => play(item, num)}
                      className={`group w-full flex items-center gap-3 rounded-xl p-2 text-left transition duration-150 ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-1 ring-brand-400'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white border border-white/5'
                      }`}
                    >
                      {/* Miniatura del episodio (16:9 con captura real vía Kitsu CDN) */}
                      <div className="relative aspect-video w-[82px] sm:w-[94px] flex-none overflow-hidden rounded-lg bg-navy-950 shadow-inner">
                        <img
                          src={episodesMeta[num]?.thumb || item?.poster || item?.image}
                          alt={`Episodio ${num}`}
                          className={`size-full object-cover transition duration-300 ${
                            isActive ? 'opacity-90 scale-105' : 'opacity-70 group-hover:opacity-90 group-hover:scale-105'
                          }`}
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-mono font-medium text-white/90">
                          {item?.duration || '24m'}
                        </span>
                        {isActive ? (
                          <span className="absolute inset-0 grid place-items-center bg-brand-600/35">
                            <Play className="size-4 fill-white text-white drop-shadow" />
                          </span>
                        ) : (
                          <span className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition">
                            <Play className="size-3.5 fill-white text-white drop-shadow" />
                          </span>
                        )}
                      </div>

                      {/* Información del episodio estilo JKAnime */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <b className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-sky-400'}`}>
                            Episodio {num}
                          </b>
                          {isActive ? (
                            <span className="flex-none rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                              Reproduciendo
                            </span>
                          ) : isWatched ? (
                            <span className="flex-none text-[10px] text-emerald-400 font-medium">
                              Visto
                            </span>
                          ) : null}
                        </div>
                        <p className={`mt-0.5 truncate text-[11px] ${isActive ? 'text-white/85' : 'text-white/60'}`}>
                          {episodesMeta[num]?.title || item?.title || 'Anime'}
                        </p>
                        <span className={`mt-1 block text-[10px] ${isActive ? 'text-white/70' : 'text-white/40'}`}>
                          {item?.year ? `${item.year} · ` : ''}
                          {item?.audioKey === 'LAT' ? 'Audio Latino' : 'Subtitulado'}
                        </span>
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="p-6 text-center text-xs text-white/50">
                  No se encontraron episodios con los filtros seleccionados.
                </div>
              )}
            </div>

            {/* Pie del panel: botón Ver todos los episodios + Anterior / Siguiente */}
            <div className="flex-none border-t border-white/10 bg-navy-950 p-2.5 flex flex-col gap-2">
              {ranges.length > 1 && (
                <button
                  onClick={() => {
                    setShowAllEpisodes((v) => !v)
                    setSearchQuery('')
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 py-1.5 text-xs font-semibold text-white/80 hover:text-white transition border border-white/10"
                >
                  <List className="size-3.5" />
                  {showAllEpisodes ? 'Mostrar por rangos' : '≡ Ver todos los episodios'}
                </button>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  disabled={!prevEp}
                  onClick={() => prevEp && play(item, prevEp)}
                  className="btn btn-outline btn-sm flex-1 !py-1.5 text-xs text-white border-white/20 hover:bg-white/10 disabled:opacity-30 gap-1"
                >
                  <ChevronLeft className="size-3.5" />
                  Anterior
                </button>
                <button
                  disabled={!nextEp}
                  onClick={() => nextEp && play(item, nextEp)}
                  className="btn btn-primary btn-sm flex-1 !py-1.5 text-xs disabled:opacity-30 gap-1"
                >
                  Siguiente
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
