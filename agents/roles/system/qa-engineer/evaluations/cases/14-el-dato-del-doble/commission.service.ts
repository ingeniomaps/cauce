import { Order, Seller } from './order'
import { CommissionRepository } from './commission.repository'
import { FxConverter } from '../fx/fx-converter'

export class CommissionService {
  constructor(
    private readonly repo: CommissionRepository,
    private readonly fx: FxConverter,
  ) {}

  async settle(order: Order, seller: Seller): Promise<void> {
    let base = order.total
    if (order.currency && order.currency !== seller.settlementCurrency) {
      base = await this.fx.convert(order.total, order.currency, seller.settlementCurrency, order.paidAt)
    }
    const amount = Math.round(base * seller.commissionRate)
    await this.repo.saveCommission({
      orderId: order.id,
      sellerId: seller.id,
      amount,
      currency: seller.settlementCurrency,
    })
  }
}
