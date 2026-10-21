import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bookmark, Compass, Heart, House, LoaderCircle, Moon, Plus, Search, Star, Sun, X } from 'lucide-react'
import axios from 'axios'
import Logo from './ui/Logo'
import { useApp, API_BASE } from '../context/AppContext'
import { useDebounce } from '../hooks'
import { ALL_CATALOG } from '../data/animeCatalog'

const LINKS = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/explorar', label: 'Explorar', icon: Compass },
  { to: '/favoritos', label: 'Favoritos', icon: Heart },
  { to: '/coleccion', label: 'Mi colección', icon: Bookmark },
]

export default function Navbar() {
  const { theme, toggleTheme, openAddModal, user, openAuthModal } = useApp()
  const initial = (user?.name?.charAt(0) || 'I').toUpperCase()

  return (
    <header className="sticky top-0 z-30 border-b border-brand-100 bg-surface-100/95 backdrop-blur-md">
      <div className="wrap flex flex-col gap-2 py-2.5 sm:py-0 md:h-[72px] md:flex-row md:items-center md:gap-6">
        {/* Fila principal: Logo, Navegación de pestañas, Buscador y Herramientas */}
        <div className="flex items-center justify-between gap-3 md:contents">
          {/* Logo Sora Anime */}
          <Link
            to="/"
            id="nav-logo"
            className="flex flex-none items-center gap-2.5 text-lg font-semibold text-ink md:text-xl"
          >
            <Logo />
            <span>Sora Anime</span>
          </Link>

          {/* En móvil: herramientas arriba junto al logo */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleTheme}
              aria-label="Cambiar tema"
              className="grid size-9 place-items-center rounded-full bg-surface-0 text-ink ring-[1.5px] ring-brand-100 ring-inset"
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link
              to="/perfil"
              className="grid size-9 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-sm"
            >
              {initial}
            </Link>
            <button
              onClick={() => openAddModal()}
              className="grid size-9 place-items-center rounded-full bg-brand-600 text-white"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Pestañas de Navegación principales (Inicio, Explorar, Favoritos, Mi colección) - SIEMPRE VISIBLES */}
        <nav
          aria-label="Navegación principal"
          className="flex flex-1 items-center gap-4 overflow-x-auto no-scrollbar sm:gap-6 md:gap-7"
        >
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              id={`nav-${to.replace('/', '') || 'inicio'}`}
              className={({ isActive }) =>
                `relative flex flex-none items-center gap-2 py-2 text-sm whitespace-nowrap transition-colors md:py-6 md:text-[15px] ${
                  isActive
                    ? "font-medium text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded after:bg-brand-500 after:content-['']"
                    : 'text-ink-muted hover:text-ink'
                }`
              }
            >
              <Icon className="size-4 md:size-[18px]" strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Buscador y herramientas de escritorio */}
        <div className="flex items-center gap-3 md:flex-none">
          <SearchBox />

          <div className="hidden items-center gap-2.5 md:flex">
            <button
              id="theme-toggle"
              onClick={toggleTheme}
              aria-label="Cambiar tema"
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              className="grid size-10 place-items-center rounded-full bg-surface-0 text-ink ring-[1.5px] ring-brand-100 ring-inset transition hover:ring-brand-400"
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>

            {user?.isGuest && (
              <button
                onClick={() => openAuthModal('login')}
                className="btn btn-outline btn-sm !px-3"
              >
                Iniciar sesión
              </button>
            )}

            <Link
              to="/perfil"
              id="nav-profile"
              title="Mi perfil"
              className="grid size-10 place-items-center rounded-full bg-brand-600 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {initial}
            </Link>

            <button
              id="nav-add-anime"
              onClick={() => openAddModal()}
              className="btn btn-primary btn-sm !px-4"
              aria-label="Añadir anime"
            >
              <Plus className="size-[18px]" />
              <span>Añadir</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

/** Buscador con sugerencias en vivo */
function SearchBox() {
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const debounced = useDebounce(q, 350)

  useEffect(() => {
    if (location.pathname === '/buscar') setQ(new URLSearchParams(location.search).get('q') || '')
  }, [location])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const term = debounced.trim()
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    const localMatches = ALL_CATALOG.filter(
      (a) =>
        a.title.toLowerCase().includes(term.toLowerCase()) ||
        a.genres.some((g) => g.toLowerCase().includes(term.toLowerCase())) ||
        (a.synopsis && a.synopsis.toLowerCase().includes(term.toLowerCase())),
    ).slice(0, 4)

    setResults(localMatches)

    const source = axios.CancelToken.source()
    setLoading(true)

    axios
      .get(`${API_BASE}/search`, {
        params: { q: term },
        cancelToken: source.token,
        timeout: 8000,
      })
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setResults(res.data.slice(0, 8))
        }
      })
      .catch((err) => {
        if (!axios.isCancel(err)) {
          // Si falla backend, mantener localMatches
        }
      })
      .finally(() => setLoading(false))

    return () => source.cancel('Search term changed')
  }, [debounced])

  const go = (path, state = {}) => {
    setOpen(false)
    navigate(path, state)
  }

  const submitSearch = () => {
    if (!q.trim()) return
    setOpen(false)
    inputRef.current?.blur()
    navigate(`/buscar?q=${encodeURIComponent(q.trim())}`)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && results[active]) {
        go(`/anime/${results[active].id}`, { state: { anime: results[active] } })
      } else {
        submitSearch()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown = open && q.trim().length >= 2

  return (
    <div className="relative w-full md:w-60 lg:w-72">
      <div className="flex items-center gap-2 rounded-full bg-surface-0 px-3.5 py-1.5 text-ink-muted ring-[1.5px] ring-brand-100 ring-inset focus-within:ring-2 focus-within:ring-brand-500 md:py-2">
        {loading ? (
          <LoaderCircle className="size-4 animate-spin text-brand-500" />
        ) : (
          <Search className="size-4 text-ink-muted" />
        )}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={onKeyDown}
          placeholder="Buscar anime, género…"
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted/70 sm:text-sm"
        />
        {q && (
          <button
            aria-label="Limpiar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQ('')}
            className="text-ink-muted hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 animate-pop overflow-hidden rounded-2xl bg-surface-0 shadow-modal ring-1 border border-brand-100">
          {results.length === 0 && !loading && (
            <p className="px-4 py-5 text-center text-xs text-ink-muted">Sin resultados para “{q}”.</p>
          )}
          {results.length === 0 && loading && (
            <p className="px-4 py-5 text-center text-xs text-ink-muted">Buscando anime…</p>
          )}
          <ul>
            {results.map((a, i) => {
              const posterSrc = a.poster || a.imageSmall || a.image
              return (
                <li key={a.id}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(`/anime/${a.id}`, { state: { anime: a } })}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors ${
                      active === i ? 'bg-brand-100' : 'hover:bg-surface-100'
                    }`}
                  >
                    <span className="relative size-10 flex-none overflow-hidden rounded-lg bg-brand-100">
                      {posterSrc ? (
                        <img src={posterSrc} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <span className="skeleton block size-full" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-xs font-semibold sm:text-sm">{a.title}</b>
                      <small className="text-[11px] text-ink-muted">
                        {[a.genres?.[0], a.type || a.kind].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    {(a.score || a.s) && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-star">
                        <Star className="size-3 fill-current" />
                        {a.score || a.s}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {results.length > 0 && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={submitSearch}
              className="w-full border-t border-brand-100 px-4 py-2.5 text-center text-xs font-medium text-link transition hover:bg-surface-100"
            >
              Ver todos los resultados para “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
