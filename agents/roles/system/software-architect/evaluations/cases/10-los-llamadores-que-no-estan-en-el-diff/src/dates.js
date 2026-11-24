'use strict'

// Una fecha `AAAA-MM-DD` como Date; una inválida devuelve null.
function parseDate(text) {
  const date = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

module.exports = { parseDate }
