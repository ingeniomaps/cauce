import express from 'express'
import { refund } from './refunds/refund'
import { findPayment, savePayment } from './payments/store'

export const app = express()
app.use(express.json())

app.post('/payments/:id/refunds', (req, res) => {
  const payment = findPayment(req.params.id)
  if (!payment) return res.status(404).json({ error: 'payment not found' })
  try {
    const updated = refund(payment, req.body.amount)
    savePayment(updated)
    return res.status(201).json(updated)
  } catch (error) {
    return res.status(422).json({ error: (error as Error).message })
  }
})
