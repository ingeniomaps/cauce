'use strict'

// El alta de un cliente: un email que ya tiene cuenta se rechaza con 409 y el motivo en el cuerpo.
function signup(store, { email, name }) {
  const normalized = String(email).trim().toLowerCase()
  if (store.has(normalized)) return { status: 409, body: { error: 'Ese email ya tiene una cuenta' } }
  store.set(normalized, { email: normalized, name })
  return { status: 201, body: { email: normalized } }
}

module.exports = { signup }
