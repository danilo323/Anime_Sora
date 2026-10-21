import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Film, Heart, Play, Plus, Star } from 'lucide-react'
import AnimePoster from '../components/ui/AnimePoster'
import { AnimeGrid } from '../components/AnimeCard'
import { SectionHeader, Tabs } from '../components/ui'
import { useApp, episodeList } from '../context/AppContext'
import { ALL_CATALOG, DEFAULT_REVIEWS, GENRES, getCatalogAnime, sceneSvg } from '../data/animeCatalog'
import { getAnimeById, getRecommendations } from '../lib/jikan'

const DETAIL_TABS = [
  ['ov', 'Resumen'],
  ['rev', 'Reseñas'],
  ['eps', 'Episodios'],
]

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
  const [tab, setTab] = useState('ov')
  const [loading, setLoading] = useState(false)

  // Anime resuelto (state de navegación, colección / caché en memoria o catálogo local / remoto)
  const anime = useMemo(() => {
    if (passedAnime && String(passedAnime.id) === String(id)) return passedAnime
    return getItemOrCatalog(id) || remoteAnime
  }, [id, passedAnime, getItemOrCatalog, remoteAnime])

  // Cargar de la API si no viene en state o colección
  useEffect(() => {
    if (passedAnime && String(passedAnime.id) === String(id)) return
    setLoading(true)
    getAnimeById(id)
      .then((data) => {
        if (data) setRemoteAnime(data)
        getRecommendations(id).then(setRemoteRecs).catch(() => {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, passedAnime])

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

  const primaryGenre = anime.genres?.[0] || anime.g || 'Anime'
  const otherGenres = GENRES.filter((g) => g !== primaryGenre).slice(0, 2)
  const allGenreChips = [primaryGenre, ...otherGenres]

  const episodes = episodeList(anime)

  // Recomendados
  const moreLikeThis =
    remoteRecs.length > 0
      ? remoteRecs.slice(0, 6)
      : ALL_CATALOG.filter((a) => String(a.id) !== String(anime.id)).slice(0, 6)

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
      </div>

      {/* Grid de 2 columnas: Vista previa / pestañas a la izquierda, Ficha a la derecha */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Columna principal */}
        <div className="flex flex-col gap-6">
          {/* Banner 16:9 con botón central de reproducción */}
          <div className="group relative aspect-video w-full overflow-hidden rounded-[22px] bg-navy-900 shadow-card">
            {anime.trailerImage || anime.image ? (
              <img
                src={anime.trailerImage || anime.image}
                alt={anime.title}
                className="size-full object-cover transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div
                className="size-full transition duration-500 group-hover:scale-105"
                dangerouslySetInnerHTML={{ __html: sceneSvg(anime.sc || 'bienvenida') }}
              />
            )}
            <div className="absolute inset-0 bg-navy-900/35 transition group-hover:bg-navy-900/20" />

            {/* Gran botón Play circular */}
            <button
              onClick={() => handlePlay(resumeEp)}
              aria-label="Reproducir"
              className="absolute inset-0 m-auto grid size-20 place-items-center rounded-full bg-white/95 text-brand-600 shadow-2xl transition duration-200 hover:scale-110 active:scale-95"
            >
              <Play className="ml-1 size-8 fill-current" />
            </button>

            {/* Barra de progreso si ya se empezó a ver */}
            {percent > 0 && (
              <div className="absolute inset-x-6 bottom-4 h-1.5 overflow-hidden rounded-full bg-white/40">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>

          {/* Pestañas: Resumen | Reseñas | Episodios */}
          <div className="border-b border-brand-100">
            <Tabs items={DETAIL_TABS} value={tab} onChange={setTab} />
          </div>

          {/* Contenido de la pestaña activa */}
          {tab === 'ov' && (
            <div className="flex flex-col gap-6">
              <p className="text-base leading-relaxed text-ink-soft">
                {anime.synopsis || 'Sin descripción disponible para este título.'}
              </p>

              {/* Ficha técnica en tarjetas cuadradas */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-[14px] bg-surface-0 p-4 shadow-sm">
                  <span className="block text-xs text-ink-muted">Género</span>
                  <b className="mt-1 block truncate text-sm font-semibold">{primaryGenre}</b>
                </div>
                <div className="rounded-[14px] bg-surface-0 p-4 shadow-sm">
                  <span className="block text-xs text-ink-muted">Formato</span>
                  <b className="mt-1 block truncate text-sm font-semibold">{anime.type || anime.kind || 'TV'}</b>
                </div>
                <div className="rounded-[14px] bg-surface-0 p-4 shadow-sm">
                  <span className="block text-xs text-ink-muted">Duración</span>
                  <b className="mt-1 block truncate text-sm font-semibold">{anime.duration || '24 min'}</b>
                </div>
                <div className="rounded-[14px] bg-surface-0 p-4 shadow-sm">
                  <span className="block text-xs text-ink-muted">Puntuación</span>
                  <b className="mt-1 block truncate text-sm font-semibold text-brand-600">
                    {anime.score || anime.s || '8.5'} / 10
                  </b>
                </div>
              </div>
            </div>
          )}

          {tab === 'rev' && (
            <div className="flex flex-col gap-4">
              {DEFAULT_REVIEWS.map((r, i) => (
                <div key={i} className="flex gap-4 rounded-[14px] bg-surface-0 p-4 shadow-sm">
                  <div className="grid size-10 flex-none place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {r.user.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <b className="text-sm font-semibold">{r.user}</b>
                      <div className="flex items-center text-star">
                        {Array.from({ length: r.rating }).map((_, si) => (
                          <Star key={si} className="size-3.5 fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{r.text}</p>
                    <small className="mt-2 block text-xs text-ink-muted">{r.date}</small>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'eps' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {episodes.map((epNum) => (
                <button
                  key={epNum}
                  onClick={() => handlePlay(epNum)}
                  className="group flex items-center gap-3 rounded-[14px] bg-surface-0 p-2.5 text-left shadow-sm transition hover:shadow-card"
                >
                  <div className="relative aspect-video w-[90px] flex-none overflow-hidden rounded-lg bg-brand-100">
                    <AnimePoster anime={anime} />
                    <span className="absolute inset-0 grid place-items-center bg-navy-900/25 transition group-hover:bg-navy-900/10">
                      <Play className="size-4 fill-white text-white drop-shadow" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold group-hover:text-brand-600">
                      Episodio {epNum}
                    </b>
                    <small className="text-xs text-ink-muted">{anime.duration || '24 min'}</small>
                  </div>
                  <span className="grid size-8 flex-none place-items-center rounded-full bg-brand-600 text-white transition group-hover:bg-brand-700">
                    <Play className="ml-0.5 size-3.5 fill-current" />
                  </span>
                </button>
              ))}
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

          <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-ink-muted">
            <span>{anime.episodes || episodes.length} episodios</span>
            <span>·</span>
            <span>{anime.views ? `${anime.views} vistas` : `${anime.year || '2024'}`}</span>
          </div>

          {/* Chips de formato, favorito y puntuación */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="chip-score !bg-brand-100 !text-brand-700 flex items-center gap-1.5">
              <Film className="size-3.5" />
              {anime.type || anime.kind || 'Película'}
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
              ★ {anime.score || anime.s || '9.0'}
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
      <section className="mt-8 border-t border-brand-100/70 pt-8">
        <SectionHeader title="También te puede gustar" />
        <AnimeGrid items={moreLikeThis} loading={false} />
      </section>
    </div>
  )
}
