import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import Hero from '../components/Hero'
import { AnimeGrid } from '../components/AnimeCard'
import AnimePoster from '../components/ui/AnimePoster'
import { SectionHeader } from '../components/ui'
import { useApp } from '../context/AppContext'
import { GENRES } from '../data/animeCatalog'
import { getTopAnime } from '../lib/jikan'

const GENRE_GRADIENTS = {
  Aventura: 'from-blue-600 to-indigo-950',
  Fantasía: 'from-purple-600 to-slate-950',
  Drama: 'from-amber-600 to-stone-950',
  Comedia: 'from-emerald-500 to-teal-950',
  Romance: 'from-pink-500 to-rose-950',
  Misterio: 'from-cyan-600 to-blue-950',
}

export default function Home() {
  const navigate = useNavigate()
  const { progress, play, getItemOrCatalog, collection } = useApp()
  const [remoteTop, setRemoteTop] = useState([])
  const [loading, setLoading] = useState(true)

  const vaultItems = useMemo(() => {
    return Object.values(collection || {}).filter(Boolean)
  }, [collection])

  // Cargar destacados desde el backend (/api/top)
  useEffect(() => {
    setLoading(true)
    getTopAnime({ limit: 12 })
      .then((items) => {
        if (items && items.length) setRemoteTop(items)
      })
      .catch((err) => {
        console.warn('Error al cargar top anime:', err.message)
      })
      .finally(() => setLoading(false))
  }, [])

  // Destacados para el carrusel Hero
  const heroItems = useMemo(() => {
    return remoteTop.slice(0, 4)
  }, [remoteTop])

  // Top anime
  const topList = useMemo(() => {
    return remoteTop.slice(0, 6)
  }, [remoteTop])

  // Más vistos
  const mostViewed = useMemo(() => {
    return remoteTop.slice(4, 10)
  }, [remoteTop])

  // Seguir viendo (animes con progreso registrado)
  const continueWatching = useMemo(() => {
    const list = []
    for (const [id, prog] of Object.entries(progress)) {
      if (prog && prog.time > 0) {
        const anime = getItemOrCatalog(id)
        if (anime) {
          const percent = prog.duration > 0 ? Math.min(100, Math.round((prog.time / prog.duration) * 100)) : 10
          list.push({ anime, episode: prog.episode || 1, percent })
        }
      }
    }
    return list
  }, [progress, getItemOrCatalog])

  return (
    <div className="flex flex-col gap-8 pb-12 md:gap-12">
      {/* Carrusel Hero */}
      <Hero items={heroItems} loading={loading && !heroItems.length} />

      {/* Seguir viendo (si hay episodios empezados) */}
      {continueWatching.length > 0 && (
        <section>
          <SectionHeader title="Seguir viendo" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {continueWatching.map(({ anime, episode, percent }) => (
              <div
                key={anime.id}
                onClick={() => play(anime, episode)}
                className="group relative flex cursor-pointer items-center gap-3.5 rounded-[14px] bg-surface-0 p-3 shadow-sm transition hover:shadow-card"
              >
                <div className="relative aspect-video w-[120px] flex-none overflow-hidden rounded-[10px] bg-brand-100">
                  <AnimePoster anime={anime} />
                  <span className="absolute inset-0 grid place-items-center bg-navy-900/30 transition group-hover:bg-navy-900/10">
                    <span className="grid size-9 place-items-center rounded-full bg-white/90 text-brand-600 shadow transition group-hover:scale-110">
                      <Play className="ml-0.5 size-4 fill-current" />
                    </span>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm font-semibold">{anime.title}</b>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Episodio {episode} · {percent}% visto
                  </span>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-brand-100">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{ width: `${Math.max(5, percent)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mi colección (animes guardados en el vault) */}
      {vaultItems.length > 0 && (
        <section>
          <SectionHeader title="Mi colección" to="/coleccion" action="Ver todo" />
          <AnimeGrid items={vaultItems.slice(0, 6)} loading={false} />
        </section>
      )}

      {/* Top anime */}
      {(topList.length > 0 || loading) && (
        <section>
          <SectionHeader title="Top anime" to="/explorar?sort=score" action="Ver más" />
          <AnimeGrid items={topList} loading={loading && !topList.length} />
        </section>
      )}

      {/* Más vistos */}
      {mostViewed.length > 0 && (
        <section>
          <SectionHeader title="Más vistos" to="/explorar?sort=views" action="Ver más" />
          <AnimeGrid items={mostViewed} loading={false} />
        </section>
      )}

      {/* Explora por género */}
      <section>
        <SectionHeader title="Explora por género" />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {GENRES.map((g) => {
            const grad = GENRE_GRADIENTS[g] || 'from-indigo-600 to-navy-950'
            return (
              <button
                key={g}
                onClick={() => navigate(`/explorar?genre=${encodeURIComponent(g)}`)}
                className={`group relative h-[110px] overflow-hidden rounded-[14px] bg-gradient-to-br ${grad} p-4 text-left transition hover:-translate-y-1 hover:shadow-card`}
              >
                <div className="absolute inset-0 bg-black/20 transition group-hover:bg-black/10" />
                <b className="absolute bottom-3 left-3 z-10 text-base font-semibold text-white drop-shadow">
                  {g}
                </b>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
