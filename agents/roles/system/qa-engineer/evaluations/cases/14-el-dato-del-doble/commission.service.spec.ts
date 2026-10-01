import { CommissionService } from './commission.service'

describe('CommissionService', () => {
  it('liquida la comisión de un pedido en otra moneda', async () => {
    const repo = { saveCommission: jest.fn() }
    const fx = { convert: jest.fn().mockResolvedValue(4_100_000) }
    const service = new CommissionService(repo as any, fx as any)

    const order = { id: 'o-1', sellerId: 's-1', total: 1_000, paidAt: new Date('2026-09-01') } as any
    const seller = { id: 's-1', commissionRate: 0.08, settlementCurrency: 'COP' } as any

    await service.settle(order, seller)

    expect(repo.saveCommission).toHaveBeenCalled()
  })
})
