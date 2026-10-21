import { useMemo } from 'react'
import { sceneSvg } from '../../data/animeCatalog'

export default function AnimePoster({ anime, className = '', alt = '' }) {
  const sc = anime?.sc
  const svg = useMemo(() => {
    if (sc) return sceneSvg(sc)
    return null
  }, [sc])

  const imgSrc = anime?.image || anime?.poster || anime?.imageSmall

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={alt || anime?.title || ''}
        loading="lazy"
        className={`size-full object-cover ${className}`}
      />
    )
  }

  if (svg) {
    return (
      <span
        className={`block size-full overflow-hidden ${className}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  return <span className={`skeleton block size-full ${className}`} />
}
