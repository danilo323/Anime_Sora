import { Link } from 'react-router-dom'
import Logo from './ui/Logo'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-brand-100/70 bg-surface-100/60 py-8 text-ink-muted">
      <div className="wrap flex flex-col items-center justify-between gap-4 text-center text-xs sm:flex-row sm:text-left">
        <div className="flex items-center gap-2 font-medium text-ink">
          <Logo size="sm" />
          <span>Sora Anime</span>
          <span className="text-ink-muted">· Plataforma visual de anime</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5">
          <Link to="/" className="hover:text-ink">
            Inicio
          </Link>
          <Link to="/explorar" className="hover:text-ink">
            Explorar
          </Link>
          <Link to="/favoritos" className="hover:text-ink">
            Favoritos
          </Link>
          <Link to="/coleccion" className="hover:text-ink">
            Mi colección
          </Link>
          <Link to="/bienvenida" className="hover:text-ink">
            Bienvenida
          </Link>
        </div>
      </div>
    </footer>
  )
}
