import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
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
  Subtitles,
  Tv,
  Volume2,
  X,
  RotateCcw,
} from 'lucide-react'
import axios from 'axios'
import { useApp, episodeList, API_BASE } from '../context/AppContext'
import { useLocalStorage } from '../hooks'

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

  // Datos de video crudo (.m3u8 / .mp4) devueltos por Consumet
  const [sources, setSources] = useState([])
  const [subtitles, setSubtitles] = useState([])
  const [servers, setServers] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(Boolean(resolvedSlug))
  const [streamError, setStreamError] = useState(null)

  // Referencias para el reproductor de video nativo y Hls.js
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const lastTimeRef = useRef(0)

  // Estado del panel lateral de episodios
  const [showSidebar, setShowSidebar] = useLocalStorage('sora_player_sidebar', true)
  const [searchQuery, setSearchQuery] = useState('')
  const [rangeIdx, setRangeIdx] = useState(() => Math.floor((episode - 1) / RANGE_SIZE))
  const [sortAsc, setSortAsc] = useState(true)
  const [showAllEpisodes, setShowAllEpisodes] = useState(false)
  const [watchedEpisodes, setWatchedEpisodes] = useLocalStorage(`sora_watched_${item?.id || 'default'}`, {})
  const [filterWatchedOnly, setFilterWatchedOnly] = useState(false)
  const [episodesMeta, setEpisodesMeta] = useState({})
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState(-1) // -1 = desactivado o por defecto

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

  // Cargar fuentes de video (.m3u8 y .mp4) desde el backend (Consumet)
  useEffect(() => {
    if (!resolvedSlug) {
      setSources([])
      setServers([])
      setSubtitles([])
      setLoading(false)
      return
    }

    let alive = true
    setLoading(true)
    setStreamError(null)

    const audioKey = item?.audioKey || 'SUB'
    axios
      .get(`${API_BASE}/episode/${encodeURIComponent(resolvedSlug)}/${episode}`, {
        params: { audioKey },
        timeout: 12000,
      })
      .then((res) => {
        if (!alive) return
        const srcList = res.data?.sources || []
        const srvList = res.data?.servers || []
        const subList = res.data?.subtitles || []

        setSources(srcList)
        setServers(srvList)
        setSubtitles(subList)
        setActiveIdx(0)
        lastTimeRef.current = 0
      })
      .catch((err) => {
        if (!alive) return
        console.warn('Error al obtener stream crudo de Consumet:', err.message)
        setStreamError('No se pudo conectar con el servidor de video. Intenta nuevamente.')
        setSources([])
        setServers([])
        setSubtitles([])
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

  // Fuente o servidor actualmente activo
  const activeSource = useMemo(() => {
    if (sources.length > 0) return sources[activeIdx] || sources[0]
    if (servers.length > 0) return servers[activeIdx] || servers[0]
    return null
  }, [sources, servers, activeIdx])

  const activeStreamUrl = activeSource?.url || ''

  // Manejador del reproductor de video nativo con Hls.js
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeStreamUrl) return

    // Limpiar instancia previa de Hls.js
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const isM3U8 = Boolean(activeSource?.isM3U8 || activeStreamUrl.includes('.m3u8'))

    const restoreTimeAndPlay = () => {
      if (lastTimeRef.current > 0 && Number.isFinite(lastTimeRef.current)) {
        video.currentTime = lastTimeRef.current
      }
      video.play().catch(() => {
        // Autoplay policy puede requerir interacción del usuario
      })
    }

    if (isM3U8) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        })
        hlsRef.current = hls
        hls.loadSource(activeStreamUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          restoreTimeAndPlay()
        })

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError()
                break
              default:
                hls.destroy()
                setStreamError('Error en la transmisión de video HLS.')
                break
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Soporte nativo de HLS en Safari / iOS
        video.src = activeStreamUrl
        video.addEventListener('loadedmetadata', restoreTimeAndPlay, { once: true })
      } else {
        video.src = activeStreamUrl
      }
    } else {
      // Archivo MP4 directo
      video.src = activeStreamUrl
      video.addEventListener('loadedmetadata', restoreTimeAndPlay, { once: true })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [activeStreamUrl, activeSource?.isM3U8])

  // Guardar posición al cambiar de calidad
  const handleQualityChange = useCallback(
    (newIdx) => {
      if (videoRef.current) {
        lastTimeRef.current = videoRef.current.currentTime || 0
      }
      setActiveIdx(newIdx)
    },
    []
  )

  const handleClose = useCallback(() => {
    closePlayer()
  }, [closePlayer])

  // Atajos de teclado para el reproductor
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play()
          else videoRef.current.pause()
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (videoRef.current) videoRef.current.currentTime += 5
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (videoRef.current) videoRef.current.currentTime -= 5
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        if (videoRef.current) {
          if (document.fullscreenElement) document.exitFullscreen()
          else videoRef.current.requestFullscreen().catch(() => {})
        }
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

    if (filterWatchedOnly) {
      list = list.filter((n) => Boolean(watchedEpisodes[n]))
    }

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
              {item?.audioKey === 'LAT' ? 'Español Latino' : 'Sub Español'} · Video Crudo HLS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botón para alternar panel lateral de episodios */}
          <button
            onClick={() => setShowSidebar((s) => !s)}
            title={showSidebar ? 'Ocultar episodios' : 'Ver episodios'}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              showSidebar
                ? 'bg-brand-600 text-white shadow-sm ring-1 ring-brand-400/40'
                : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            <ListVideo className="size-4" />
            <span className="hidden sm:inline">{showSidebar ? 'Ocultar episodios' : 'Ver episodios'}</span>
          </button>
        </div>
      </header>

      {/* 2. Cuerpo principal: Contenedor con Video nativo a la izquierda y Episodios a la derecha */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative overflow-hidden">
        {/* Columna Izquierda: Reproductor de Video Nativo (Sin IFrames) */}
        <section className="flex-1 flex flex-col min-w-0 h-full bg-black relative">
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            {activeStreamUrl ? (
              <div className="relative size-full flex items-center justify-center bg-black">
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  crossOrigin="anonymous"
                  className="size-full max-h-full object-contain bg-black focus:outline-none"
                  poster={item?.poster || item?.image}
                >
                  {subtitles.map((sub, i) => (
                    <track
                      key={`${sub.lang}-${i}`}
                      kind="subtitles"
                      label={sub.lang || `Sub ${i + 1}`}
                      src={sub.url}
                      srcLang={sub.lang?.slice(0, 2)?.toLowerCase() || 'es'}
                      default={i === 0 || sub.lang?.toLowerCase().includes('es')}
                    />
                  ))}
                  Tu navegador no soporta la reproducción de video HTML5.
                </video>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center gap-3 text-white p-6 text-center">
                <span className="size-12 animate-spin rounded-full border-4 border-brand-500/30 border-t-brand-500" />
                <b className="text-base font-semibold">Extrayendo video crudo vía Consumet…</b>
                <p className="text-xs text-white/60 max-w-xs">
                  Cargando stream maestro HLS (.m3u8) para el Episodio {episode}.
                </p>
              </div>
            ) : streamError ? (
              <div className="text-center p-6 text-white/80 max-w-md">
                <p className="text-base font-semibold text-danger">{streamError}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                >
                  <RotateCcw className="size-3.5" /> Reintentar
                </button>
              </div>
            ) : (
              <div className="text-center p-6 text-white/80 max-w-md">
                <p className="text-base font-semibold">No se encontraron streams para este episodio</p>
                <p className="text-xs text-white/50 mt-1">
                  Intenta seleccionar otro episodio en la lista de la derecha.
                </p>
              </div>
            )}
          </div>

          {/* Barra inferior del reproductor: Calidad, subtítulos y controles */}
          <div className="flex-none border-t border-white/10 bg-navy-950/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="block text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate">
                  EPISODIO {episode} {item?.audioKey === 'LAT' ? 'LATINO' : 'SUB'} - {item?.title}
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                  <Tv className="size-3" /> Video Nativo HLS
                </span>
              </div>
              <div className="mt-1 h-0.5 w-16 bg-amber-500 rounded-full" />
              <span className="mt-1 block text-[11px] text-white/60">
                {activeSource?.provider ? `Proveedor: ${activeSource.provider} · ` : ''}
                {activeSource?.quality ? `Resolución: ${activeSource.quality}` : 'Reproducción fluida sin anuncios'}
              </span>
            </div>

            {/* Selector de calidad de video crudo (1080p, 720p, etc.) y subtítulos */}
            <div className="flex items-center gap-2 max-w-full">
              {sources.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-white/50 hidden md:inline flex-none">Calidad:</span>
                  <div className="flex items-center gap-1 overflow-x-auto max-w-[280px] sm:max-w-md rounded-xl bg-white/5 p-1 ring-1 ring-white/10 scrollbar-none">
                    {sources.map((s, idx) => {
                      const active = idx === activeIdx
                      return (
                        <button
                          key={`${s.quality}-${idx}`}
                          onClick={() => handleQualityChange(idx)}
                          className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            active
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'text-white/70 hover:text-white hover:bg-white/10'
                          }`}
                          title={`Ver en ${s.quality}`}
                        >
                          {s.quality ? s.quality.toUpperCase() : `Stream ${idx + 1}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Botón de subtítulos si Consumet devolvió subtítulos */}
              {subtitles.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowSubtitleMenu((v) => !v)}
                    title="Subtítulos"
                    className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/20 transition"
                  >
                    <Subtitles className="size-3.5" />
                    <span>Sub ({subtitles.length})</span>
                  </button>

                  {showSubtitleMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl bg-navy-900 border border-white/10 p-1.5 shadow-2xl z-30">
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                        Subtítulos
                      </p>
                      {subtitles.map((sub, i) => (
                        <button
                          key={`${sub.lang}-${i}`}
                          onClick={() => {
                            setActiveSubtitleTrack(i)
                            setShowSubtitleMenu(false)
                          }}
                          className={`w-full text-left rounded-lg px-2 py-1 text-xs transition ${
                            activeSubtitleTrack === i
                              ? 'bg-brand-600 text-white font-semibold'
                              : 'text-white/80 hover:bg-white/10'
                          }`}
                        >
                          {sub.lang || `Pista ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Botón de favorito */}
              <button
                onClick={() => toggleFavorite(item)}
                title={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                className={`grid size-8 flex-none place-items-center rounded-lg transition ${
                  fav ? 'bg-danger text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Heart className={`size-4 ${fav ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Columna Derecha: Panel de Selección de Episodios con Miniaturas Kitsu */}
        {showSidebar && (
          <aside className="w-full lg:w-[350px] xl:w-[390px] h-[340px] lg:h-full flex-none bg-navy-900/95 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col z-20 backdrop-blur-xl">
            {/* Cabecera del panel: Rango, búsqueda y filtros */}
            <div className="p-3 border-b border-white/10 flex flex-col gap-2.5 bg-navy-950/70">
              <div className="flex items-center justify-between gap-2">
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

                <button
                  onClick={() => setFilterWatchedOnly((w) => !w)}
                  title={filterWatchedOnly ? 'Mostrando solo vistos' : 'Mostrar todos'}
                  className={`grid size-8 place-items-center rounded-lg transition ${
                    filterWatchedOnly ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {filterWatchedOnly ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>

                <button
                  onClick={() => setSortAsc((a) => !a)}
                  title={sortAsc ? 'Orden: 1 a N' : 'Orden: N a 1'}
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
                      {/* Miniatura del episodio */}
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

                      {/* Información del episodio */}
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
