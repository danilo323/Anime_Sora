import { useEffect, useRef } from 'react'
import Artplayer from 'artplayer'
import es from 'artplayer/i18n/es'
import Hls from 'hls.js'

const LOAD_TIMEOUT_MS = 15000

const isHls = (url) => /\.m3u8(\?|#|$)/i.test(url) || !/\.(mp4|webm|ogv|ogg|mov)(\?|#|$)/i.test(url)

/**
 * Wrapper de Artplayer con soporte HLS mediante hls.js.
 * Se recrea cada vez que cambia `url` (cambio de servidor o de episodio).
 *
 * Callbacks:
 *  - onReady()                       el vídeo puede reproducirse
 *  - onError(message)                fallo fatal (manifiesto, red, timeout…)
 *  - onTimeUpdate(current, duration) cada ~250 ms durante la reproducción
 *  - onEnded()
 */
export default function ArtPlayer({ url, poster, startTime = 0, onReady, onError, onTimeUpdate, onEnded, className = '' }) {
  const containerRef = useRef(null)
  // Callbacks en refs para no recrear el reproductor cuando cambian.
  const cb = useRef({ onReady, onError, onTimeUpdate, onEnded })
  cb.current = { onReady, onError, onTimeUpdate, onEnded }

  useEffect(() => {
    if (!url || !containerRef.current) return
    let settled = false
    let mediaRecoveries = 0

    const ready = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      cb.current.onReady?.()
    }
    const fail = (message) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      cb.current.onError?.(message)
    }
    const timeout = setTimeout(() => fail('El servidor tardó demasiado en responder.'), LOAD_TIMEOUT_MS)

    const art = new Artplayer({
      container: containerRef.current,
      url,
      type: isHls(url) ? 'm3u8' : '',
      poster,
      theme: '#5b93ff',
      lang: 'es',
      i18n: { es },
      volume: 0.8,
      autoplay: true,
      autoSize: false,
      autoMini: false,
      playsInline: true,
      pip: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: false,
      hotkey: true,
      mutex: true,
      miniProgressBar: true,
      backdrop: true,
      lock: true,
      fastForward: true,
      autoOrientation: true,
      customType: {
        m3u8(video, src, player) {
          if (Hls.isSupported()) {
            if (player.hls) player.hls.destroy()
            const hls = new Hls({ maxBufferLength: 30, enableWorker: true })
            player.hls = hls
            hls.loadSource(src)
            hls.attachMedia(video)

            // Selector de calidad a partir de los niveles del manifiesto.
            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
              const levels = data.levels || []
              if (levels.length < 2) return
              player.setting.add({
                html: 'Calidad',
                tooltip: 'Auto',
                selector: [
                  { html: 'Auto', level: -1, default: true },
                  ...levels
                    .map((l, i) => ({ html: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`, level: i, h: l.height || 0 }))
                    .sort((a, b) => b.h - a.h),
                ],
                onSelect(item) {
                  hls.currentLevel = item.level
                  return item.html
                },
              })
            })

            hls.on(Hls.Events.ERROR, (_, data) => {
              if (!data.fatal) return
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
                mediaRecoveries++
                hls.recoverMediaError()
                return
              }
              const detail = data.details?.includes('manifest') ? 'No se pudo cargar la lista de reproducción.' : 'Error de red al cargar el vídeo.'
              hls.destroy()
              fail(detail)
            })
            player.on('destroy', () => hls.destroy())
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari / iOS reproducen HLS de forma nativa.
            video.src = src
          } else {
            fail('Este navegador no soporta HLS.')
          }
        },
      },
    })

    art.on('ready', () => {
      if (startTime > 5) art.seek = startTime
    })
    art.on('video:canplay', ready)
    art.on('video:playing', ready)
    art.on('video:error', () => fail('El vídeo no se pudo reproducir.'))
    art.on('video:timeupdate', () => cb.current.onTimeUpdate?.(art.currentTime, art.duration))
    art.on('video:ended', () => cb.current.onEnded?.())

    return () => {
      clearTimeout(timeout)
      art.hls?.destroy()
      art.destroy(false)
    }
    // startTime solo se usa al montar para reanudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, poster])

  return <div ref={containerRef} className={className} />
}
