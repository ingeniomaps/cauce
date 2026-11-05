import { refund } from '../refund'

const captured = { id: 'p1', amount: 100, status: 'captured' as const, refunded: 0 }

test('a full refund returns the whole captured amount', () => {
  expect(refund(captured).refunded).toBe(100)
})

test('a refunded payment cannot be refunded again', () => {
  const done = refund(captured)
  expect(() => refund(done)).toThrow('only captured payments can be refunded')
})

test('only captured payments are refunded', () => {
  expect(() => refund({ ...captured, status: 'authorized' })).toThrow('only captured')
})
