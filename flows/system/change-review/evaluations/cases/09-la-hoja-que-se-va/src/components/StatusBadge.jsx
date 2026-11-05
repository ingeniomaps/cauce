// Estado de una cuenta en la tabla de cuentas.
export default function StatusBadge({ status }) {
  const pending = status === 'pending'
  return (
    <span className={pending ? 'badge-warning' : 'badge-ok'}>
      {pending ? 'Pendiente' : 'Activa'}
    </span>
  )
}
