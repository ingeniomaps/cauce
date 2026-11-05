import { useState } from 'react'
import DatePicker from './legacy/DatePicker'

export default function PaymentsScreen() {
  const [due, setDue] = useState('')
  return (
    <section>
      <h2>Vencimiento del pago</h2>
      <DatePicker value={due} onChange={setDue} />
    </section>
  )
}
