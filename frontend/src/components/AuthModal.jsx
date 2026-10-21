import { useState } from 'react'
import { Lock, Mail, User, X } from 'lucide-react'
import Logo from './ui/Logo'
import { useApp } from '../context/AppContext'

export default function AuthModal() {
  const { authModal, closeAuthModal, login, register, loginWithGoogle } = useApp()
  const [tab, setTab] = useState(authModal === 'register' ? 'register' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  if (!authModal) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setErr('')
    if (!email.trim() || !email.includes('@')) {
      setErr('Introduce un correo electrónico válido.')
      return
    }
    if (password.length < 4) {
      setErr('La contraseña debe tener al menos 4 caracteres.')
      return
    }

    if (tab === 'register') {
      register(name, email, password)
    } else {
      login(email, password)
    }
  }

  const handleGoogle = () => {
    loginWithGoogle(email.trim() || 'usuario@gmail.com')
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] animate-fade bg-player/55 backdrop-blur-sm"
        onClick={closeAuthModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="fixed top-1/2 left-1/2 z-[61] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 animate-pop overflow-hidden rounded-[24px] bg-surface-0 p-6 text-ink shadow-modal sm:p-7"
      >
        <button
          onClick={closeAuthModal}
          aria-label="Cerrar"
          className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-ink-muted transition hover:bg-brand-100"
        >
          <X className="size-5" />
        </button>

        <Logo size="lg" on="card" />

        <h2 id="auth-modal-title" className="mt-3.5 text-2xl font-semibold">
          {tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Guarda tus animes favoritos y continúa tu reproducción donde la dejaste.
        </p>

        {/* Pestañas Iniciar sesión / Registro */}
        <div className="mt-5 flex rounded-full bg-surface-100 p-1">
          <button
            type="button"
            onClick={() => {
              setTab('login')
              setErr('')
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              tab === 'login' ? 'bg-surface-0 text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register')
              setErr('')
            }}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
              tab === 'register' ? 'bg-surface-0 text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* Botón de Google */}
        <button
          type="button"
          onClick={handleGoogle}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl bg-surface-100 py-3 text-sm font-medium text-ink ring-[1.5px] ring-brand-100 ring-inset transition hover:ring-brand-400"
        >
          <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          Continuar con Google
        </button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-brand-100" />
          </div>
          <span className="relative bg-surface-0 px-3 text-xs uppercase tracking-wider text-ink-muted">
            o con tu correo
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {tab === 'register' && (
            <div className="field">
              <User className="size-4.5 text-ink-muted" />
              <input
                type="text"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <Mail className="size-4.5 text-ink-muted" />
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <Lock className="size-4.5 text-ink-muted" />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && <p className="text-xs font-medium text-danger">{err}</p>}

          <button type="submit" className="btn btn-primary mt-2 w-full">
            {tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <button
          type="button"
          onClick={closeAuthModal}
          className="mt-3.5 block w-full text-center text-xs font-medium text-ink-muted hover:text-ink hover:underline"
        >
          Continuar como invitado
        </button>
      </div>
    </>
  )
}
