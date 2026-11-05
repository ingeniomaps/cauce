// Cliente del proveedor de envíos. Falta implementarlo.
export interface Shipment { id: string; status: 'created' | 'in_transit' | 'delivered' | 'failed' }

export interface ShippingClient {
  createShipment(orderId: string, address: string): Promise<Shipment>
  getShipment(id: string): Promise<Shipment>
}

export function makeShippingClient(baseUrl: string, apiKey: string): ShippingClient {
  throw new Error('sin implementar')
}
