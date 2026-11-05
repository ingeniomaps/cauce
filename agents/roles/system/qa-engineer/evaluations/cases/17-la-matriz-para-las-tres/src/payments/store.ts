import type { Payment } from '../refunds/refund'

// Almacén en memoria del servicio; el de contrato arranca con `p100`, un pago capturado de 100.
const payments = new Map<string, Payment>([['p100', { id: 'p100', amount: 100, status: 'captured', refunded: 0 }]])

export const findPayment = (id: string) => payments.get(id)
export const savePayment = (payment: Payment) => { payments.set(payment.id, payment) }
