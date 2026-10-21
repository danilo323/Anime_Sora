import { Link } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { wideSvg } from '../data/animeCatalog'

export default function Welcome() {
  const { user, openAuthModal, theme, toggleTheme } = useApp()
  const bgSvg = wideSvg('welcome')

  return (
    <div className="fixed inset-0 z-50 flex items-center overflow-hidden bg-navy-900">
      {/* Fondo vectorial SVG Sora */}
      <div
        className="absolute inset-0 size-full"
        dangerouslySetInnerHTML={{ __html: bgSvg }}
      />

      {/* Sombra de contraste para lectura */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/60 to-navy-900/30 sm:bg-gradient-to-r sm:from-navy-900/90 sm:via-navy-900/55 sm:to-transparent" />

      {/* Contenido principal */}
      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-6 sm:px-12 lg:px-16">
        <div className="max-w-[620px] text-white">
          <div className="text-xl font-normal opacity-90 sm:text-2xl md:text-3xl">Bienvenido a</div>
          <h1 className="mt-2 inline-block border-b-[3px] border-white/90 pb-2 text-5xl font-bold tracking-tight sm:text-7xl lg:text-8xl">
            Sora Anime
          </h1>
          <div className="mt-3 text-xs tracking-[18px] opacity-85 sm:text-sm">ソラ アニメ</div>
          <p className="my-6 max-w-[440px] text-base leading-relaxed opacity-90 sm:text-lg">
            La mejor plataforma para ver tus animes favoritos. Entra directo o inicia sesión si quieres guardar tu progreso.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link to="/" className="btn btn-primary btn-lg shadow-brand">
              Comenzar
            </Link>

            {user.isGuest ? (
              <button
                onClick={() => openAuthModal('login')}
                className="btn btn-ghost btn-lg"
              >
                Iniciar sesión
              </button>
            ) : (
              <span className="text-sm text-white/90">
                Sesión iniciada como <b>{user.name}</b>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Botón de tema flotante arriba a la derecha */}
      <button
        onClick={toggleTheme}
        aria-label="Cambiar tema"
        className="absolute top-6 right-6 z-20 grid size-11 place-items-center rounded-full bg-white/20 text-white ring-[1.5px] ring-white/50 ring-inset backdrop-blur-md transition hover:bg-white/30"
      >
        {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
    </div>
  )
}
