import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark } from 'lucide-react'
import { AnimeGrid } from '../components/AnimeCard'
import { EmptyState, PageHeader } from '../components/ui'
import { useApp } from '../context/AppContext'

export default function Collection() {
  const { collection, library } = useApp()

  const list = useMemo(() => {
    const map = new Map()
    for (const item of Object.values(library)) {
      if (item) map.set(String(item.id), item)
    }
    for (const item of Object.values(collection)) {
      if (item && !map.has(String(item.id))) map.set(String(item.id), item)
    }
    return Array.from(map.values())
  }, [collection, library])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi colección" count={list.length > 0 ? list.length : null} />

      {list.length > 0 ? (
        <AnimeGrid items={list} loading={false} />
      ) : (
        <EmptyState
          icon={Bookmark}
          message="Tu colección está vacía. Usa “Añadir a mi colección” en la ficha de cualquier anime o añade servidores propios con el botón superior."
        >
          <Link to="/explorar" className="btn btn-primary btn-sm">
            Explorar anime
          </Link>
        </EmptyState>
      )}
    </div>
  )
}
