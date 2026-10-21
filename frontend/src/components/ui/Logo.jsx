/** Isotipo de Sora: luna creciente recortada sobre el color de fondo. */
const SIZES = {
  sm: 'size-6 after:size-[19px] after:left-[9px] after:-top-[3px]',
  md: 'size-7 after:size-[22px] after:left-[11px] after:-top-1',
  lg: 'size-10 after:size-[31px] after:left-4 after:-top-1.5',
}

// Clases completas para que Tailwind las detecte al compilar.
const CUTOUTS = {
  page: 'after:bg-surface-100',
  card: 'after:bg-surface-0',
}

export default function Logo({ size = 'md', on = 'page', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`relative block flex-none overflow-hidden rounded-full bg-brand-600 after:absolute after:rounded-full after:content-[''] ${SIZES[size]} ${CUTOUTS[on]} ${className}`}
    />
  )
}
