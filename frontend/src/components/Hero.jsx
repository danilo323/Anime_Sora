import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Play } from 'lucide-react'
import { useApp, episodeList } from '../context/AppContext'
import { formatMembers } from '../lib/jikan'
import { sceneSvg, wideSvg } from '../data/animeCatalog'
import AnimePoster from './ui/AnimePoster'

/** Carrusel destacado de la portada (diseño `.hero`). */
export default function Hero({ items = [], loading }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const { progress, isFavorite, toggleFavorite, play } = useApp()

  useEffect(() => {
    if (paused || items.length < 2) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setI((n) => (n + 1) % items.length)
    }, 7000)
    return () => clearInterval(t)
  }, [paused, items.length])

  if (loading || !items.length) {
    return <section className="skeleton h-[360px] rounded-[22px] md:h-[400px] md:rounded-[28px] xl:h-[440px]" aria-busy="true" />
  }

  const a = items[i % items.length]
  const eps = episodeList(a)
  const resumeEp = progress[a.id]?.episode
  const fav = isFavorite(a.id)

  const watch = () => {
    play(a, resumeEp || (eps[0] || 1))
  }

  return (
    <section
      className="relative isolate min-h-[360px] overflow-hidden rounded-[22px] bg-navy-900 shadow-card md:h-[400px] md:rounded-[28px] xl:h-[440px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrusel"
    >
      {items.map((it, n) => {
        const isCurrent = n === i % items.length
        if (it.trailerImage || it.image) {
          return (
            <img
              key={it.id}
              src={it.trailerImage || it.image}
              alt=""
              className={`absolute inset-0 -z-10 size-full object-cover transition-opacity duration-700 ${
                isCurrent ? 'opacity-100' : 'opacity-0'
              } ${it.trailerImage ? '' : 'scale-110 blur-sm'}`}
            />
          )
        }
        // Vector scene background
        const svgContent = it.id === 'luna' ? wideSvg('hero') : sceneSvg(it.sc || 'bienvenida')
        return (
          <div
            key={it.id}
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className={`absolute inset-0 -z-10 size-full transition-opacity duration-700 ${
              isCurrent ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )
      })}

      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-900/95 via-navy-900/50 to-navy-900/10 md:bg-gradient-to-r md:from-navy-900/90 md:via-navy-900/55 md:via-45% md:to-transparent md:to-75%" />

      {/* Poster flotante a la derecha en pantallas grandes */}
      <div className="absolute top-1/2 right-[8%] hidden aspect-[3/4] h-[78%] -translate-y-1/2 rotate-2 overflow-hidden rounded-2xl shadow-2xl ring-4 ring-white/10 lg:block">
        <AnimePoster anime={a} />
      </div>

      <div key={a.id} className="relative animate-fade px-5 pt-[140px] pb-5.5 text-white md:absolute md:top-1/2 md:left-10 md:max-w-[500px] md:-translate-y-1/2 md:p-0 xl:left-14">
        <span className="text-xs font-semibold tracking-[2px] uppercase opacity-85">
          Destacado · {a.genres?.[0] || a.g || a.type}
        </span>
        <h1 className="mt-2 mb-2.5 line-clamp-2 text-[28px] leading-[1.1] font-semibold tracking-tight md:text-[38px] xl:text-[46px]">
          {a.title || a.t}
        </h1>
        <div className="flex flex-wrap items-center gap-2.5 text-xs opacity-90 md:text-[13px]">
          <span className="chip-score">★ {a.score != null ? a.score : (a.s != null ? a.s : '—')}</span>
          {[
            a.type || a.kind || 'Serie',
            a.episodes ? `${a.episodes} ${a.episodes === 1 ? 'ep' : 'eps'}` : 'En emisión',
            a.duration || a.year || '—',
            a.views ? `${a.views} vistas` : a.members ? `${formatMembers(a.members)} miembros` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <p className="mt-3.5 mb-6 line-clamp-3 hidden text-sm leading-relaxed opacity-90 md:block">
          {a.synopsis || a.syn}
        </p>
        <div className="mt-5 flex items-center gap-2 md:mt-0 md:gap-3">
          <button id="hero-watch" onClick={watch} className="btn btn-primary flex-1 !px-2.5 py-[11px] text-[13px] md:flex-none md:!px-7 md:py-3 md:text-[15px]">
            <Play className="size-[18px] fill-current" />
            {resumeEp ? 'Continuar' : 'Ver ahora'}
          </button>
          <Link to={`/anime/${a.id}`} id="hero-info" className="btn btn-ghost flex-1 !px-2.5 py-[11px] text-[13px] md:flex-none md:!px-7 md:py-3 md:text-[15px]">
            Más información
          </Link>
          <button
            id="hero-fav"
            title="Favorito"
            aria-label="Favorito"
            onClick={() => toggleFavorite(a)}
            className={`grid size-[42px] flex-none place-items-center rounded-full transition md:size-[46px] ${
              fav ? 'bg-white text-danger' : 'bg-white/20 text-white ring-[1.5px] ring-white/50 ring-inset hover:bg-white/30'
            }`}
          >
            <Heart className={`size-5 ${fav ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {items.length > 1 && (
        <div className="absolute top-5 right-5 flex gap-2 md:top-auto md:right-7 md:bottom-6">
          {items.map((it, n) => (
            <button
              key={it.id}
              aria-label={`Destacado ${n + 1}`}
              onClick={() => setI(n)}
              className={`h-2.5 rounded-full transition-all duration-200 ${n === i % items.length ? 'w-7 bg-white' : 'w-2.5 bg-white/45'}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
