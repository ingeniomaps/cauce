export type Currency = 'COP' | 'USD' | 'MXN'

export interface Order {
  id: string
  sellerId: string
  total: number          // en la moneda del pedido, en unidades menores
  currency: Currency     // obligatoria: la escribe el checkout al crear el pedido
  paidAt: Date
}

export interface Seller {
  id: string
  commissionRate: number // 0.08 = 8 %
  settlementCurrency: Currency
}
