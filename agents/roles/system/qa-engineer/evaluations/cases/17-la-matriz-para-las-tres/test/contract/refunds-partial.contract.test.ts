import request from 'supertest'
import { app } from '../../src/app'

describe('POST /payments/:id/refunds (partial)', () => {
  test('a partial refund larger than the captured total is rejected', async () => {
    const res = await request(app).post('/payments/p100/refunds').send({ amount: 150 })
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('refund exceeds captured amount')
  })

  test('two partial refunds cannot add up to more than the total', async () => {
    await request(app).post('/payments/p100/refunds').send({ amount: 60 }).expect(201)
    const res = await request(app).post('/payments/p100/refunds').send({ amount: 50 })
    expect(res.status).toBe(422)
  })
})
