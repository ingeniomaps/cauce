// Campo de fecha del sistema de diseño. Lo usan cuentas, facturas y reportes.
export default function DateField({ label, value, onChange }) {
  const display = value ? new Date(value).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '—'
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input type="date" className="rounded border px-2 py-1" value={value || ''}
        onChange={(event) => onChange(event.target.value)} />
      <span className="text-gray-500">{display}</span>
    </label>
  )
}
