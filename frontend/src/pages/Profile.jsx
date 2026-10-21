import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Moon, Sun, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'

export default function Profile() {
  const navigate = useNavigate()
  const {
    user,
    updateUserName,
    favorites,
    collection,
    library,
    progress,
    openAuthModal,
    logout,
    theme,
    toggleTheme,
    resetAllData,
  } = useApp()

  const [nameInput, setNameInput] = useState(user?.name || 'Invitado')

  const favCount = Object.keys(favorites).length
  const colCount = new Set([...Object.keys(collection), ...Object.keys(library)]).size
  const progCount = Object.keys(progress).length

  const handleNameChange = (e) => {
    const val = e.target.value
    setNameInput(val)
    updateUserName(val)
  }

  const initial = (user?.name?.charAt(0) || 'I').toUpperCase()

  const handleReset = () => {
    if (window.confirm('¿Seguro que quieres borrar todos tus datos locales (favoritos, colección y progreso)?')) {
      resetAllData()
      setNameInput('Invitado')
    }
  }

  return (
    <div className="mx-auto flex max-w-[800px] flex-col gap-8 pb-16">
      {/* Cabecera del perfil: avatar e input de nombre editable */}
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="grid size-24 flex-none place-items-center rounded-full bg-brand-600 text-3xl font-bold text-white shadow-brand sm:size-28 sm:text-4xl">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="user-name-input" className="block text-xs font-medium text-ink-muted">
            Tu nombre
          </label>
          <input
            id="user-name-input"
            type="text"
            maxLength={20}
            value={nameInput}
            onChange={handleNameChange}
            className="mt-1 w-full max-w-[320px] border-0 border-b-2 border-dashed border-brand-300 bg-transparent py-1 text-2xl font-bold text-ink outline-none transition focus:border-brand-600 sm:text-3xl"
          />
          <p className="mt-2 text-xs text-ink-muted">
            {user.isGuest
              ? 'Modo invitado: tus datos se guardan en este navegador.'
              : `Cuenta${user.google ? ' de Google' : ''}: ${user.email}`}
          </p>
        </div>
      </div>

      {/* Estadísticas rápidas: 3 tarjetas interactivas */}
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        <button
          onClick={() => navigate('/favoritos')}
          className="rounded-[18px] bg-surface-0 p-4 text-left shadow-sm transition hover:shadow-card sm:p-6"
        >
          <b className="block text-2xl font-bold text-link sm:text-3xl">{favCount}</b>
          <span className="mt-1 block text-xs text-ink-muted sm:text-sm">Favoritos</span>
        </button>

        <button
          onClick={() => navigate('/coleccion')}
          className="rounded-[18px] bg-surface-0 p-4 text-left shadow-sm transition hover:shadow-card sm:p-6"
        >
          <b className="block text-2xl font-bold text-link sm:text-3xl">{colCount}</b>
          <span className="mt-1 block text-xs text-ink-muted sm:text-sm">En mi colección</span>
        </button>

        <button
          onClick={() => navigate('/')}
          className="rounded-[18px] bg-surface-0 p-4 text-left shadow-sm transition hover:shadow-card sm:p-6"
        >
          <b className="block text-2xl font-bold text-link sm:text-3xl">{progCount}</b>
          <span className="mt-1 block text-xs text-ink-muted sm:text-sm">Empezados</span>
        </button>
      </div>

      {/* Sección de cuenta */}
      <div className="flex flex-col justify-between gap-4 rounded-[20px] bg-surface-0 p-6 shadow-sm sm:flex-row sm:items-center sm:p-7">
        {user.isGuest ? (
          <>
            <div className="max-w-[460px]">
              <b className="text-base font-semibold">¿Quieres una cuenta? Es opcional</b>
              <p className="mt-1 text-sm text-ink-muted leading-relaxed">
                Puedes seguir usando Sora Anime sin registrarte. Si creas una cuenta o inicias sesión con Google,
                lo que ya guardaste pasa a ella.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => openAuthModal('register')}
                className="btn btn-primary btn-sm whitespace-nowrap"
              >
                Crear cuenta
              </button>
              <button
                onClick={() => openAuthModal('login')}
                className="btn btn-outline btn-sm whitespace-nowrap"
              >
                Iniciar sesión
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <b className="text-base font-semibold">Sesión iniciada</b>
              <p className="mt-1 text-sm text-ink-muted">
                Tus favoritos, tu colección y tu progreso están ligados a <b>{user.email}</b>.
              </p>
            </div>
            <button onClick={logout} className="btn btn-outline btn-sm gap-2">
              <LogOut className="size-4" />
              Cerrar sesión
            </button>
          </>
        )}
      </div>

      {/* Sección de apariencia */}
      <div className="flex flex-col justify-between gap-4 rounded-[20px] bg-surface-0 p-6 shadow-sm sm:flex-row sm:items-center sm:p-7">
        <div>
          <b className="text-base font-semibold">Apariencia</b>
          <p className="mt-1 text-sm text-ink-muted">Elige el modo claro u oscuro para la interfaz.</p>
        </div>
        <div className="flex rounded-full bg-surface-100 p-1">
          <button
            onClick={() => theme !== 'light' && toggleTheme()}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition ${
              theme === 'light' ? 'bg-surface-0 text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Sun className="size-4" />
            Claro
          </button>
          <button
            onClick={() => theme !== 'dark' && toggleTheme()}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition ${
              theme === 'dark' ? 'bg-surface-0 text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Moon className="size-4" />
            Oscuro
          </button>
        </div>
      </div>

      {/* Botón de borrado de datos locales */}
      <div className="pt-2">
        <button
          onClick={handleReset}
          className="btn btn-outline btn-sm gap-2 text-danger ring-danger/40 hover:bg-danger-100"
        >
          <Trash2 className="size-4" />
          Borrar mis datos
        </button>
      </div>
    </div>
  )
}
