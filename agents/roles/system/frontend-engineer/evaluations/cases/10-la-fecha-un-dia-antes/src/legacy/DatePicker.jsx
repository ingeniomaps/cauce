// DEPRECADO: usar src/ui/DateField.jsx. Se borra cuando pagos migre a DateField (épica de pagos v2).
export default function DatePicker({ value, onChange }) {
  const shown = value ? new Date(value).toLocaleDateString('es-CO') : ''
  return (
    <div className="legacy-date">
      <input type="date" value={value || ''} onChange={(event) => onChange(event.target.value)} />
      <span className="legacy-date-shown">{shown}</span>
    </div>
  )
}
