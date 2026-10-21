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
  Sparkles,
  Radio,
  Clock,
  AlertCircle,
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

  // Estado de emisión en tiempo real (para animes en emisión)
  const [airingInfo, setAiringInfo] = useState(null)
  const [unairedState, setUnairedState] = useState(null)

  // Consulta el estado de emisión al abrir la serie
  useEffect(() => {
    if (!resolvedSlug) return
    let alive = true
    axios
      .get(`${API_BASE}/anime/${encodeURIComponent(resolvedSlug)}/airing`, { timeout: 3500 })
      .then((res) => {
        if (!alive || !res.data) return
        setAiringInfo(res.data)
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [resolvedSlug])

  // Lista de episodios ajustada si el anime está en emisión
  const episodes = useMemo(() => {
    const planned = item?.episodes ? Number(item.episodes) : 0
    const maxAired = airingInfo?.maxEpisode ? Number(airingInfo.maxEpisode) : 0
    const count = Math.max(planned || 1, maxAired || 1, episode || 1)
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [item?.episodes, airingInfo?.maxEpisode, episode])

  const epIdx = episodes.indexOf(episode)
  const prevEp = epIdx > 0 ? episodes[epIdx - 1] : null
  const nextEp = epIdx >= 0 && epIdx < episodes.length - 1 ? episodes[epIdx + 1] : null

  // Datos de servidores y fuentes en español
  const [sources, setSources] = useState([])
  const [servers, setServers] = useState([])
  const [subtitles, setSubtitles] = useState([])
  const [serverIdx, setServerIdx] = useState(0)
  const [hasTelegramVault, setHasTelegramVault] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [vaultToast, setVaultToast] = useState(null)
  const [loading, setLoading] = useState(Boolean(resolvedSlug))
  const [streamError, setStreamError] = useState(null)

  // Referencias para el reproductor de video nativo y Hls.js
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const lastTimeRef = useRef(0)
  const serversContainerRef = useRef(null)

  const scrollServers = useCallback((direction) => {
    if (serversContainerRef.current) {
      const amount = direction === 'left' ? -260 : 260
      serversContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' })
    }
  }, [])

  // Desplazar automáticamente el botón del servidor activo a la vista
  useEffect(() => {
    if (serverIdx > 0 && serversContainerRef.current) {
      const liveIdx = serverIdx - 1
      if (serversContainerRef.current.children[liveIdx]) {
        serversContainerRef.current.children[liveIdx].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
    }
  }, [serverIdx])

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
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState(-1)

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
              hasAired: ep.hasAired !== false,
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

  // Cargar servidores y fuentes del episodio actual en TIEMPO REAL
  useEffect(() => {
    if (!resolvedSlug) {
      setSources([])
      setServers([])
      setSubtitles([])
      setUnairedState(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()

    // Reseteo inmediato: visualización en tiempo real sin estados congelados
    setSources([])
    setServers([])
    setSubtitles([])
    setUnairedState(null)
    setServerIdx(0)
    setLoading(true)
    setStreamError(null)
    lastTimeRef.current = 0

    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      } catch (_) {}
    }
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const audioKey = item?.audioKey || 'SUB'
    axios
      .get(`${API_BASE}/episode/${encodeURIComponent(resolvedSlug)}/${episode}`, {
        params: { audioKey },
        signal: controller.signal,
        timeout: 9000,
      })
      .then((res) => {
        // Manejar episodios no emitidos de animes en emisión
        if (res.data?.hasAired === false || (res.data?.isAiring && !res.data?.servers?.length)) {
          setUnairedState({
            isAiring: true,
            maxEpisode: res.data?.maxEpisode || airingInfo?.maxEpisode,
            message: res.data?.message,
          })
          setSources([])
          setServers([])
          setSubtitles([])
          return
        }

        const srcList = res.data?.sources || []
        const srvList = res.data?.servers || []
        const subList = res.data?.subtitles || []
        const vaultOk = Boolean(res.data?.hasTelegramVault)
        const isArch = Boolean(res.data?.isArchiving)

        setUnairedState(null)
        setSources(srcList)
        setServers(srvList)
        setSubtitles(subList)
        setHasTelegramVault(vaultOk)
        setIsArchiving(isArch)

        // Si existe en Telegram, activar Sora HD (index 0); si aún no, activar el primer servidor en vivo
        if (vaultOk) {
          setServerIdx(0)
        } else if (srvList.length > 1) {
          setServerIdx(1)
        } else {
          setServerIdx(0)
        }
        lastTimeRef.current = 0
      })
      .catch((err) => {
        if (axios.isCancel(err) || err.name === 'CanceledError') return
        console.warn('Error al obtener servidores en español:', err.message)
        setStreamError('No se pudo conectar con los servidores para este episodio. Intenta cambiar de servidor o reintentar.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [resolvedSlug, episode, item?.audioKey, airingInfo?.maxEpisode])

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

  // Servidor o fuente actualmente seleccionada
  const curServer = useMemo(() => {
    if (servers.length > 0) return servers[serverIdx] || servers[0]
    if (sources.length > 0) return sources[serverIdx] || sources[0]
    return null
  }, [servers, sources, serverIdx])

  const vaultServer = useMemo(() => {
    return servers.find((s) => s.group === 'vault') || (servers[0]?.group === 'vault' ? servers[0] : null)
  }, [servers])

  const liveServers = useMemo(() => {
    return servers.filter((s) => s.group === 'live')
  }, [servers])

  const activeStreamUrl = useMemo(() => {
    const raw = curServer?.embedUrl || curServer?.url || ''
    if (!raw) return ''
    if (raw.startsWith('http')) return raw
    const origin = API_BASE.replace(/\/api$/, '')
    return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`
  }, [curServer])

  const isDirectStream = Boolean(
    curServer?.isDirectVideo ||
    curServer?.isM3U8 ||
    curServer?.isTelegram ||
    activeStreamUrl.includes('.m3u8') ||
    activeStreamUrl.endsWith('.mp4') ||
    activeStreamUrl.includes('/stream/telegram/')
  )
  const hasEmbedUrl = Boolean(activeStreamUrl && !isDirectStream)

  // Manejador del reproductor de video nativo cuando hay stream directo (.m3u8 o .mp4)
  useEffect(() => {
    if (!isDirectStream || !activeStreamUrl) return
    const video = videoRef.current
    if (!video) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const restoreTimeAndPlay = () => {
      if (lastTimeRef.current > 0 && Number.isFinite(lastTimeRef.current)) {
        video.currentTime = lastTimeRef.current
      }
      video.play().catch(() => {})
    }

    const isM3U8 = activeStreamUrl.includes('.m3u8') || curServer?.isM3U8

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

        hls.on(Hls.Events.MANIFEST_PARSED, restoreTimeAndPlay)
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
                setStreamError('Error al reproducir el stream directo.')
                break
            }
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeStreamUrl
        video.addEventListener('loadedmetadata', restoreTimeAndPlay, { once: true })
      } else {
        video.src = activeStreamUrl
      }
    } else {
      video.src = activeStreamUrl
      video.addEventListener('loadedmetadata', restoreTimeAndPlay, { once: true })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [activeStreamUrl, isDirectStream, curServer?.isM3U8])

  // Cambio de servidor / calidad preservando segundo de reproducción
  const handleServerChange = useCallback((newIdx) => {
    if (videoRef.current) {
      lastTimeRef.current = videoRef.current.currentTime || 0
    }
    setServerIdx(newIdx)
  }, [])

  const handleClose = useCallback(() => {
    closePlayer()
  }, [closePlayer])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'IFRAME') return

      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      } else if (e.key === ' ' || e.code === 'Space') {
        if (isDirectStream && videoRef.current) {
          e.preventDefault()
          if (videoRef.current.paused) videoRef.current.play()
          else videoRef.current.pause()
        }
      } else if (e.key === 'ArrowRight') {
        if (isDirectStream && videoRef.current) {
          e.preventDefault()
          videoRef.current.currentTime += 5
        }
      } else if (e.key === 'ArrowLeft') {
        if (isDirectStream && videoRef.current) {
          e.preventDefault()
          videoRef.current.currentTime -= 5
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (isDirectStream && videoRef.current) {
          e.preventDefault()
          if (document.fullscreenElement) document.exitFullscreen()
          else videoRef.current.requestFullscreen().catch(() => {})
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose, isDirectStream])

  const fav = isFavorite(item?.id)

  // Rangos de paginación
  const ranges = useMemo(() => {
    const totalRanges = Math.ceil(episodes.length / RANGE_SIZE)
    return Array.from({ length: totalRanges }, (_, idx) => {
      const start = idx * RANGE_SIZE + 1
      const end = Math.min((idx + 1) * RANGE_SIZE, episodes.length)
      return { idx, label: `Ep ${start} - ${end}`, start, end }
    })
  }, [episodes.length])

  // Episodios filtrados
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
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate text-white">{item?.title || 'Sora Anime'}</h1>
              {airingInfo?.isAiring && (
                <span className="flex-none inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
                  <Radio className="size-2.5 text-amber-400 animate-pulse" />
                  En emisión
                </span>
              )}
            </div>
            <p className="text-xs text-white/60 truncate">
              Episodio {episode} {item?.episodes ? `de ${item.episodes}` : ''} ·{' '}
              {item?.audioKey === 'LAT' ? 'Español Latino 🇲🇽' : 'Sub Español 🇯🇵'}
              {airingInfo?.maxEpisode ? ` · (Último emitido: Ep ${airingInfo.maxEpisode})` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* 2. Cuerpo principal: Contenedor de Video a la izquierda y Episodios a la derecha */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative overflow-hidden">
        {/* Columna Izquierda: Reproductor Híbrido (Nativo HLS / Embed Blindado sin redirecciones / Pantalla de En Emisión) */}
        <section className="flex-1 flex flex-col min-w-0 h-full bg-black relative">
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center gap-3 text-white p-6 text-center">
                <span className="size-12 animate-spin rounded-full border-4 border-brand-500/30 border-t-brand-500" />
                <b className="text-base font-semibold">Cargando Episodio {episode} en Español…</b>
                <p className="text-xs text-white/60 max-w-xs">
                  Sincronizando servidores y estado de emisión en tiempo real.
                </p>
              </div>
            ) : unairedState ? (
              /* Pantalla amigable cuando se elige un episodio que aún no se ha emitido */
              <div className="flex flex-col items-center justify-center gap-4 text-center p-8 max-w-lg mx-auto bg-navy-900/90 rounded-2xl border border-amber-500/30 backdrop-blur-md shadow-2xl animate-fade-in m-4">
                <div className="grid size-16 place-items-center rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
                  <Radio className="size-8 animate-pulse" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 uppercase tracking-wider">
                    <span className="size-2 rounded-full bg-amber-400 animate-ping" />
                    Anime en Emisión
                  </span>
                  <h2 className="mt-3 text-lg sm:text-xl font-bold text-white">
                    Episodio {episode} aún no emitido
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm text-white/70 leading-relaxed">
                    {unairedState.message ||
                      `Este capítulo aún no ha sido transmitido en televisión o plataformas oficiales en Japón. El último capítulo disponible es el Episodio ${unairedState.maxEpisode || 1}.`}
                  </p>
                </div>
                {unairedState.maxEpisode && unairedState.maxEpisode !== episode && (
                  <button
                    onClick={() => play(item, unairedState.maxEpisode)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg transition active:scale-95"
                  >
                    <Play className="size-4 fill-white" />
                    Ver último disponible (Episodio {unairedState.maxEpisode})
                  </button>
                )}
              </div>
            ) : isDirectStream ? (
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
            ) : hasEmbedUrl ? (
              <iframe
                key={`${curServer.name}-${curServer.embedUrl || curServer.url}`}
                src={curServer.embedUrl || curServer.url}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="absolute inset-0 size-full border-0 bg-black"
                title={`${item?.title || 'Anime'} - ${curServer.name}`}
              />
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
                <p className="text-base font-semibold">No se encontraron servidores para este episodio</p>
                <p className="text-xs text-white/50 mt-1">
                  Intenta cambiar de servidor abajo o selecciona otro episodio en la lista de la derecha.
                </p>
              </div>
            )}
            {/* Notificación flotante de Bóveda Telegram si está archivando o pendiente */}
            {vaultToast && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md bg-purple-950/95 border border-purple-500/40 text-purple-200 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs flex items-center gap-2 animate-fade-in">
                <Sparkles className="size-4 text-purple-400 flex-none" />
                <span className="flex-1 font-medium">{vaultToast}</span>
                <button onClick={() => setVaultToast(null)} className="text-white/60 hover:text-white ml-2">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 1. Franja con las 2 OPCIONES separadas a la vez (Opción 1: Bóveda Telegram / Opción 2: Servidores en Vivo) */}
          {servers.length > 0 && !unairedState && (
            <div className="flex-none border-t border-white/10 bg-navy-900/95 px-3 py-2 z-15 backdrop-blur-md flex flex-wrap lg:flex-nowrap items-center gap-2.5">
              {/* OPCIÓN 1: Bóveda Telegram (Indestructible) */}
              <div className="flex items-center gap-2 flex-none bg-purple-950/40 border border-purple-500/30 rounded-xl px-2.5 py-1.5 shadow-inner">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                  <Sparkles className="size-3 text-purple-400" />
                  <span className="hidden sm:inline">Opción 1:</span> Bóveda
                </span>

                {vaultServer && (
                  <button
                    onClick={() => {
                      if (vaultServer.available) {
                        handleServerChange(0)
                      } else {
                        setVaultToast(
                          '⚡ El bot está respaldando este video en Telegram en segundo plano. Usa los servidores en vivo mientras finaliza.'
                        )
                        setTimeout(() => setVaultToast(null), 5000)
                      }
                    }}
                    className={`whitespace-nowrap flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                      serverIdx === 0 && vaultServer.available
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-500/40 ring-2 ring-purple-400'
                        : vaultServer.available
                        ? 'bg-purple-900/60 text-purple-200 hover:bg-purple-800/80 border border-purple-500/40'
                        : 'bg-white/5 text-white/50 border border-dashed border-white/20 hover:bg-white/10'
                    }`}
                    title={vaultServer.desc}
                  >
                    <span>{vaultServer.name || 'Sora HD'}</span>
                    {vaultServer.available ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 flex items-center gap-0.5">
                        ⚡ Blindado 1080p
                      </span>
                    ) : isArchiving ? (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex items-center gap-1 animate-pulse">
                        <span className="size-1.5 rounded-full bg-amber-400 animate-ping" />
                        Guardando…
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-white/10 text-white/60">
                        Auto-guardar
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Separador vertical sutil entre las dos opciones */}
              <div className="hidden lg:block h-6 w-px bg-white/15 flex-none" />

              {/* OPCIÓN 2: Servidores en Vivo (Espejos de Respaldo) */}
              <div className="flex-1 flex items-center gap-2 min-w-0 bg-navy-950/40 border border-white/10 rounded-xl px-2 py-1">
                <div className="flex items-center gap-1 flex-none pl-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                    <Tv className="size-3 text-sky-400" />
                    <span className="hidden sm:inline">Opción 2:</span> En Vivo ({liveServers.length}):
                  </span>
                </div>

                {/* Flecha izquierda */}
                <button
                  onClick={() => scrollServers('left')}
                  className="grid size-6 flex-none place-items-center rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition active:scale-95"
                  title="Desplazar a la izquierda"
                >
                  <ChevronLeft className="size-3.5" />
                </button>

                {/* Lista horizontal de servidores en vivo */}
                <div
                  ref={serversContainerRef}
                  className="flex-1 flex items-center gap-1.5 overflow-x-auto scroll-smooth scrollbar-thin py-0.5"
                >
                  {liveServers.map((s) => {
                    const actualIndex = s.id
                    const active = serverIdx === actualIndex
                    return (
                      <button
                        key={`${s.name}-${actualIndex}`}
                        onClick={() => handleServerChange(actualIndex)}
                        className={`whitespace-nowrap flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition active:scale-95 ${
                          active
                            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30 ring-2 ring-brand-400'
                            : 'bg-white/5 text-white/80 hover:text-white hover:bg-white/15 border border-white/5'
                        }`}
                        title={`${s.name}: ${s.desc || s.quality || 'Servidor'}`}
                      >
                        <span>{s.name}</span>
                        {s.originalServer && (
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                              active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'
                            }`}
                          >
                            {s.originalServer}
                          </span>
                        )}
                        {s.quality && (
                          <span
                            className={`text-[9px] font-bold px-1 rounded ${
                              s.quality.includes('1080')
                                ? 'bg-emerald-500/25 text-emerald-300'
                                : s.quality.includes('720')
                                ? 'bg-sky-500/25 text-sky-300'
                                : 'bg-amber-500/25 text-amber-300'
                            }`}
                          >
                            {s.quality}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Flecha derecha */}
                <button
                  onClick={() => scrollServers('right')}
                  className="grid size-6 flex-none place-items-center rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition active:scale-95"
                  title="Desplazar a la derecha"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 2. Barra de información del episodio y acciones */}
          <div className="flex-none border-t border-white/10 bg-navy-950/95 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 z-10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="block text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate">
                  EPISODIO {episode} {item?.audioKey === 'LAT' ? 'LATINO' : 'SUB'} - {item?.title}
                </span>
                {curServer?.isTelegram && (
                  <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-300 ring-1 ring-purple-500/30">
                    <Sparkles className="size-3 text-purple-400" /> Bóveda Telegram (Indestructible)
                  </span>
                )}
                {isDirectStream && !curServer?.isTelegram && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                    <Tv className="size-3" /> Stream Nativo HLS
                  </span>
                )}
                {unairedState && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    <Clock className="size-3 text-amber-400" /> Próximamente
                  </span>
                )}
              </div>
              <div className="mt-1 h-0.5 w-16 bg-amber-500 rounded-full" />
              <span className="mt-1 block text-[11px] text-white/60">
                {unairedState
                  ? `Serie en emisión · Último capítulo disponible: Ep ${unairedState.maxEpisode || 1}`
                  : curServer?.desc || (item?.audioKey === 'LAT' ? 'Audio en Español Latino' : 'Subtitulado en Español')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Subtítulos si existen */}
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
                  const isUnairedEp = Boolean(
                    (airingInfo?.isAiring && airingInfo?.maxEpisode && num > airingInfo.maxEpisode) ||
                    (episodesMeta[num] && episodesMeta[num].hasAired === false)
                  )

                  return (
                    <button
                      key={num}
                      ref={isActive ? activeItemRef : null}
                      onClick={() => play(item, num)}
                      className={`group w-full flex items-center gap-3 rounded-xl p-2 text-left transition duration-150 ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-1 ring-brand-400'
                          : isUnairedEp
                          ? 'bg-white/[0.02] hover:bg-white/[0.05] text-white/50 border border-white/5'
                          : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white border border-white/5'
                      }`}
                    >
                      {/* Miniatura del episodio */}
                      <div className="relative aspect-video w-[82px] sm:w-[94px] flex-none overflow-hidden rounded-lg bg-navy-950 shadow-inner">
                        <img
                          src={episodesMeta[num]?.thumb || item?.poster || item?.image}
                          alt={`Episodio ${num}`}
                          className={`size-full object-cover transition duration-300 ${
                            isActive
                              ? 'opacity-90 scale-105'
                              : isUnairedEp
                              ? 'opacity-40 grayscale-[50%]'
                              : 'opacity-70 group-hover:opacity-90 group-hover:scale-105'
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
                        ) : isUnairedEp ? (
                          <span className="absolute inset-0 grid place-items-center bg-black/40">
                            <Clock className="size-3.5 text-amber-400 drop-shadow" />
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
                          <b className={`text-xs font-bold truncate ${isActive ? 'text-white' : isUnairedEp ? 'text-white/60' : 'text-sky-400'}`}>
                            Episodio {num}
                          </b>
                          {isActive ? (
                            <span className="flex-none rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                              Reproduciendo
                            </span>
                          ) : isUnairedEp ? (
                            <span className="flex-none rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold flex items-center gap-1">
                              <Clock className="size-2.5" />
                              Próximamente
                            </span>
                          ) : isWatched ? (
                            <span className="flex-none text-[10px] text-emerald-400 font-medium">
                              Visto
                            </span>
                          ) : null}
                        </div>
                        <p className={`mt-0.5 truncate text-[11px] ${isActive ? 'text-white/85' : isUnairedEp ? 'text-white/40' : 'text-white/60'}`}>
                          {episodesMeta[num]?.title || item?.title || 'Anime'}
                        </p>
                        <span className={`mt-1 block text-[10px] ${isActive ? 'text-white/70' : 'text-white/40'}`}>
                          {isUnairedEp ? 'Por emitir' : item?.audioKey === 'LAT' ? 'Audio Latino' : 'Subtitulado'}
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
