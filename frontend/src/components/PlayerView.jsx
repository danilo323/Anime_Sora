import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Heart, SkipBack, SkipForward, X } from 'lucide-react'
import axios from 'axios'
import { useApp, episodeList, API_BASE } from '../context/AppContext'
import { useLocalStorage } from '../hooks'

const DEFAULT_SERVERS = [
  { name: 'Sora HD', desc: 'Principal · 1080p' },
  { name: 'Nube', desc: 'Alternativo · 720p' },
  { name: 'Espejo', desc: 'Respaldo · 480p' },
]

export default function PlayerView() {
  const { player, getItemOrCatalog } = useApp()
  if (!player) return null
  const item = getItemOrCatalog(player.animeId)
  return <PlayerSession key={`${player.animeId}-${player.episode}`} item={item} episode={player.episode} />
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
  const [srvMin, setSrvMin] = useLocalStorage('srvmin', false)

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

  return (
    <div className="player opening" role="dialog" aria-modal="true" aria-label={`Reproduciendo ${item?.title}`}>
      {/* Fondo oscuro nativo */}
      <div className="absolute inset-0 bg-navy-950" />

      {/* Si hay embedUrl real disponible, se renderiza el iframe a pantalla completa */}
      {hasEmbedUrl ? (
        <iframe
          key={`${curServer.name}-${curServer.embedUrl}`}
          src={curServer.embedUrl}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          className="absolute inset-0 size-full border-0 z-[5] bg-black"
          title={`${item?.title || 'Anime'} - ${curServer.name}`}
        />
      ) : !loading && (
        <div className="absolute inset-0 z-[5] grid place-items-center bg-black/80 text-center p-6 text-ink-muted">
          <div className="max-w-md">
            <p className="text-base text-white font-medium">
              No se encontraron servidores activos para este episodio
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">
              Intenta seleccionar otro servidor arriba a la derecha (Sora HD, Nube o Espejo) o regresa al catálogo.
            </p>
            <button
              onClick={handleClose}
              className="btn btn-primary btn-sm mt-4"
            >
              Volver al anime
            </button>
          </div>
        </div>
      )}

      {/* Barra superior con botón de cerrar, título y navegación de episodios */}
      <div className="vtop">
        <button
          onClick={handleClose}
          title="Cerrar (Esc)"
          aria-label="Cerrar"
          className="grid size-10 place-items-center rounded-full bg-white/12 text-white transition hover:bg-white/24"
        >
          <X className="size-5" />
        </button>
        <div>
          <b>{item?.title || 'Sora Anime'}</b>
          <small>
            Episodio {episode}
            {item?.episodes ? ` de ${item.episodes}` : ''} · {item?.genres?.[0] || 'Anime'}
          </small>
        </div>
      </div>

      {/* Navegación rápida de episodios */}
      <div className="absolute top-4 left-[260px] z-10 hidden items-center gap-2 md:flex md:top-6">
        <button
          disabled={!prevEp}
          onClick={() => prevEp && play(item, prevEp)}
          title={prevEp ? `Episodio ${prevEp}` : 'Primer episodio'}
          className="grid size-9 place-items-center rounded-full bg-white/12 text-white transition hover:bg-white/24 disabled:opacity-30"
        >
          <SkipBack className="size-4" />
        </button>
        <button
          disabled={!nextEp}
          onClick={() => nextEp && play(item, nextEp)}
          title={nextEp ? `Episodio ${nextEp}` : 'Último episodio'}
          className="grid size-9 place-items-center rounded-full bg-white/12 text-white transition hover:bg-white/24 disabled:opacity-30"
        >
          <SkipForward className="size-4" />
        </button>
      </div>

      {/* Selector de servidores (arriba a la derecha) */}
      {srvMin ? (
        <button
          onClick={() => setSrvMin(false)}
          className="srvpill"
          title="Mostrar lista de reproductores"
        >
          <i className={loading ? 'wait' : 'good'} />
          Reproductor: <b>{curServer?.name}</b>
          <ChevronRight className="size-3.5 rotate-90" />
        </button>
      ) : (
        <div className="srvbox">
          <div className="srvhead">
            <span className="srvlbl">Calidad / Servidor</span>
            <button onClick={() => setSrvMin(true)} className="srvmin" title="Minimizar">
              <ChevronRight className="size-3.5 -rotate-90" />
              Minimizar
            </button>
          </div>
          <div className="srvs">
            {serversList.map((s, i) => {
              const on = i === serverIdx
              return (
                <button
                  key={`${s.name}-${i}`}
                  onClick={() => setServerIdx(i)}
                  className={`srv ${on ? 'on good' : ''}`}
                  title={s.desc}
                >
                  <i />
                  <span>
                    {s.name}
                    <small>{s.desc}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Estado central mientras carga */}
      {loading && (
        <div className="vstate z-[15]">
          <span className="size-12 animate-spin rounded-full border-4 border-white/25 border-t-white" />
          <b>Cargando servidor {curServer?.name || 'Sora HD'}…</b>
        </div>
      )}

      {/* Barra inferior */}
      <div className="vbottom pointer-events-none flex items-center justify-between">
        <span className="rounded-full bg-navy-900/80 px-3 py-1.5 text-xs text-white/80 backdrop-blur pointer-events-auto">
          {curServer?.name} · {curServer?.desc}
        </span>
        <button
          onClick={() => toggleFavorite(item)}
          title="Marcar favorito"
          className={`pointer-events-auto grid size-9 place-items-center rounded-full transition sm:size-10 shadow-lg ${
            fav ? 'bg-white text-danger' : 'bg-navy-900/80 text-white backdrop-blur hover:bg-navy-900'
          }`}
        >
          <Heart className={`size-4.5 ${fav ? 'fill-current' : ''}`} />
        </button>
      </div>
    </div>
  )
}
