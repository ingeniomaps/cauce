'use strict'

// El envío del formulario de alta y lo que se le muestra a la persona.
async function submitSignup(fetchImpl, form, show) {
  const response = await fetchImpl('/api/customers', { method: 'POST', body: JSON.stringify(form) })
  if (!response.ok) {
    show('Algo salió mal, probá de nuevo')
    return false
  }
  show('¡Listo! Ya tenés tu cuenta')
  return true
}

module.exports = { submitSignup }
