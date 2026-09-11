// Lo que un recorrido le pide a un agente cuando escribe en el INBOX (caso 101). El tope lo aplica el
// recorrido sobre lo que le pasa al agente, no el agente: pedirle que se limite no es un tope. Lo que no
// entra se cuenta donde cada recorrido lo deja, y ninguno lo tira en silencio.
const INBOX_CAP = 3
// La forma de una entrada, igual a la que declara el molde de `INBOX.md`: quien escribe no tiene que
// abrir el archivo para saberla. Una prueba ata las dos.
const INBOX_ENTRY = '- **slug-del-item** — Qué es, y qué se decide o se resuelve con esto.'
// Los nombres que ya hay, por sección, tal como los imprime `ops context --json` en su campo inbox.
const INBOX_HEADS = { type: 'object', additionalProperties: false, properties: Object.fromEntries(
  ['deuda', 'ideas', 'propuestas', 'lecciones'].map((key) => [key, { type: 'array', items: { type: 'string' } }]),
) }
// Una entrada es una línea. Un hallazgo de largo libre se recorta antes de llegar a quien lo escribe,
// porque lo que llega entero es lo que termina copiado entero.
const oneLine = (text) => {
  const first = String(text || '').split('\n')[0].trim()
  return first.length > 240 ? `${first.slice(0, 239)}…` : first
}
// La forma y los nombres que ya hay en las secciones donde se va a escribir. Van los nombres y no el
// archivo: con ellos alcanza para no repetir una entrada, y el archivo entero pesaría lo que el INBOX.
function inboxAsk(sections, heads) {
  const known = sections.map((name) => {
    const names = (heads || {})[name.toLowerCase()] || []
    return names.length ? `en ${name} ya están ${names.join(', ')}` : `${name} no tiene entradas`
  }).join('; ')
  return `Cada entrada con la forma del molde —${INBOX_ENTRY}—: un nombre y una línea, y la evidencia se ` +
    `cita donde ya vive, no se copia. Por nombre, ${known}: lo que ya esté con uno de esos nombres no se ` +
    `vuelve a escribir.`
}
