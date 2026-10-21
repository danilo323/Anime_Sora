import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { AnimeGrid } from '../components/AnimeCard'
import { EmptyState, PageHeader } from '../components/ui'
import { useApp } from '../context/AppContext'

export default function Favorites() {
  const { favorites } = useApp()

  const list = useMemo(() => {
    return Object.values(favorites).filter(Boolean)
  }, [favorites])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Favoritos" count={list.length > 0 ? list.length : null} />

      {list.length > 0 ? (
        <AnimeGrid items={list} loading={false} />
      ) : (
        <EmptyState
          icon={Heart}
          message="Aún no tienes favoritos. Toca el botón de corazón ♥ en la ficha de cualquier anime para guardarlo aquí."
        >
          <Link to="/explorar" className="btn btn-primary btn-sm">
            Explorar anime
          </Link>
        </EmptyState>
      )}
    </div>
  )
}
