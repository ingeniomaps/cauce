export interface Payment { id: string; amount: number; status: 'authorized' | 'captured' | 'refunded'; refunded: number }

export function refund(payment: Payment, amount = payment.amount - payment.refunded): Payment {
  if (payment.status !== 'captured') throw new Error('only captured payments can be refunded')
  if (payment.refunded >= payment.amount) throw new Error('already refunded')
  if (payment.refunded + amount > payment.amount) throw new Error('refund exceeds captured amount')
  const refunded = payment.refunded + amount
  return { ...payment, refunded, status: refunded === payment.amount ? 'refunded' : 'captured' }
}
