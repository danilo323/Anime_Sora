import { Link } from 'react-router-dom'
import { Bookmark, Heart, Play } from 'lucide-react'
import AnimePoster from './ui/AnimePoster'
import { useApp, episodeList } from '../context/AppContext'

/**
 * Tarjeta de póster (diseño `.pcard`): portada 3:4 con elevación al pasar el
 * ratón, botón de play, indicador de favorito / colección, badge de idioma (SUB/LAT) y metadatos.
 */
export default function AnimeCard({ anime }) {
  const { isFavorite, isInCollection, toggleCollection, library } = useApp()
  const fav = isFavorite(anime.id)
  const inCol = isInCollection(anime.id)
  const item = library[anime.id]
  const eps = item ? episodeList(item).length : (anime.episodes || null)
  const genre = anime.genres?.[0] || anime.g

  return (
    <Link
      to={`/anime/${anime.id}`}
      state={{ anime }}
      id={`anime-card-${anime.id}`}
      className="group block min-w-0 text-left text-inherit outline-none"
      title={anime.title}
    >
      <span className="relative block aspect-[3/4] overflow-hidden rounded-[14px] bg-brand-100 shadow-card transition duration-200 group-hover:-translate-y-1 group-hover:shadow-card-hover group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
        <AnimePoster anime={anime} />

        {/* Indicador superior de Favorito */}
        {fav && (
          <div className="absolute top-2.5 right-2.5 z-[2]">
            <span className="grid size-7 place-items-center rounded-full bg-white/90 shadow-sm">
              <Heart className="size-[15px] fill-danger text-danger" />
            </span>
          </div>
        )}

        {/* Indicador de Colección */}
        {(inCol || item) && (
          <span className="absolute top-2.5 left-2.5 z-[2] flex items-center gap-1 rounded-full bg-brand-600/95 px-2 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur">
            <Bookmark className="size-3 fill-current" />
            <span>{item && eps ? `${eps} ep${eps > 1 ? 's' : ''}` : 'Colección'}</span>
          </span>
        )}

        {/* Botón rápido para guardar/quitar de la colección con un clic */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggleCollection(anime)
          }}
          title={inCol ? 'Quitar de mi colección' : 'Guardar en mi colección'}
          className={`absolute bottom-2.5 right-2.5 z-[3] grid size-8 place-items-center rounded-full transition shadow-md ${
            inCol ? 'bg-brand-600 text-white' : 'bg-surface-0/90 text-ink hover:bg-white hover:scale-105'
          }`}
        >
          <Bookmark className={`size-4 ${inCol ? 'fill-current' : ''}`} />
        </button>

        <span className="absolute inset-0 grid place-items-center bg-navy-900/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="grid size-[54px] translate-y-2 place-items-center rounded-full bg-white/90 text-brand-600 shadow-md transition duration-200 group-hover:translate-y-0">
            <Play className="ml-[3px] size-[22px] fill-current" />
          </span>
        </span>
      </span>

      <b className="mt-3 block truncate text-[14px] font-semibold md:text-[15px]">{anime.title}</b>
      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-muted">
        <span className="truncate">{[genre, anime.type || anime.kind].filter(Boolean).join(' · ')}</span>
        {(anime.score || anime.s) && <span className="chip-score flex-none">{anime.score || anime.s}</span>}
      </span>
      <span className="mt-1 block text-xs text-ink-muted">
        {[
          anime.episodes ? `${anime.episodes} ${anime.episodes === 1 ? 'ep' : 'eps'}` : null,
          anime.duration || anime.year,
        ]
          .filter(Boolean)
          .join(' · ') || '\u00a0'}
      </span>
    </Link>
  )
}

export function AnimeCardSkeleton() {
  return (
    <div aria-hidden="true">
      <span className="skeleton block aspect-[3/4] rounded-[14px]" />
      <span className="skeleton mt-3 block h-4 w-4/5 rounded" />
      <span className="skeleton mt-2 block h-3 w-1/2 rounded" />
    </div>
  )
}

/** Rejilla responsive de tarjetas con estado de carga. */
export function AnimeGrid({ items, loading, skeletons = 6, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-x-3.5 gap-y-[22px] sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-x-[22px] sm:gap-y-7 ${className}`}>
      {loading
        ? Array.from({ length: skeletons }, (_, i) => <AnimeCardSkeleton key={i} />)
        : items?.map((a) => <AnimeCard key={a.id} anime={a} />)}
    </div>
  )
}
