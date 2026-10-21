import { useCallback, useEffect, useRef, useState } from 'react'

/** Estado sincronizado con localStorage (clave con prefijo `sora-`). */
export function useLocalStorage(key, initial) {
  const storageKey = `sora-${key}`
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw != null ? JSON.parse(raw) : typeof initial === 'function' ? initial() : initial
    } catch {
      return typeof initial === 'function' ? initial() : initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [storageKey, value])

  return [value, setValue]
}

/** Devuelve `value` tras `delay` ms sin cambios. */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/**
 * Ejecuta una función asíncrona y expone { data, loading, error }.
 * Ignora respuestas obsoletas si las dependencias cambian.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (alive && error?.name !== 'CanceledError') setState({ data: null, loading: false, error })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])
  return { ...state, reload: run }
}
