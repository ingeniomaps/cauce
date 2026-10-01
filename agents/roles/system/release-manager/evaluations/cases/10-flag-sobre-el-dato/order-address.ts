import { flags } from '../platform/flags'
import { OrderRow } from './order-row'

export type Address =
  | { kind: 'free'; line: string }
  | { kind: 'structured'; street: string; number: string; city: string; postalCode: string }

// Escritura: con el flag prendido para el cliente se guarda estructurada y `address_line` queda nula.
export function writeAddress(customerId: string, address: Address): Partial<OrderRow> {
  if (flags.isOn('structured_address', customerId) && address.kind === 'structured') {
    return {
      address_line: null,
      address_street: address.street,
      address_number: address.number,
      address_city: address.city,
      address_postal_code: address.postalCode,
    }
  }
  return { address_line: address.kind === 'free' ? address.line : formatLine(address) }
}

// Lectura: el mismo flag decide cómo se interpreta la fila.
export function readAddress(customerId: string, row: OrderRow): Address {
  if (flags.isOn('structured_address', customerId) && row.address_line === null) {
    return {
      kind: 'structured',
      street: row.address_street ?? '',
      number: row.address_number ?? '',
      city: row.address_city ?? '',
      postalCode: row.address_postal_code ?? '',
    }
  }
  return { kind: 'free', line: row.address_line ?? '' }
}

function formatLine(a: Extract<Address, { kind: 'structured' }>): string {
  return `${a.street} ${a.number}, ${a.city} (${a.postalCode})`
}
