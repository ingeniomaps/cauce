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
// Lo que entra en una entrada, procedencia incluida. El tope es del conjunto y no del detalle: así un
// sufijo largo recorta lo que se cuenta y nunca al revés. Se recorta el detalle porque es lo único
// recuperable —sigue entero en el informe o en `done/`—, y la procedencia no se reconstruye después.
const INBOX_LINE = 240
// Una entrada es una línea. Un hallazgo de largo libre se recorta antes de llegar a quien lo escribe,
// porque lo que llega entero es lo que termina copiado entero.
const oneLine = (text, reserved = 0) => {
  const first = String(text || '').split('\n')[0].trim()
  const cap = INBOX_LINE - reserved
  return first.length > cap ? `${first.slice(0, cap - 1)}…` : first
}
// De qué vía salió una entrada: el recorrido, la unidad de la que salió —una tarea, un informe, un
// equipo— y la fecha. La arma el recorrido, que es el que las sabe, en vez de pedírselas al agente que
// escribe: una convención que depende de que alguien se acuerde no deja rastro cuando no se cumple, y
// una entrada sin remitente se lee igual que una que nunca lo tuvo (caso 115).
//
// Las partes vacías se caen: `onboard` no tiene ni tarea ni informe, y la fecha la da el motor —acá no
// hay reloj—, así que falta si el comando que la trae no contestó. Va entre paréntesis, al final y en
// minúscula, porque compite con lo que la entrada dice; y nombra al recorrido y nunca a un cargo, para
// que no se lea como una firma con la que decidir sin leer la entrada.
const inboxOrigin = (...parts) => `(${parts.filter(Boolean).join(' · ')})`
// La entrada ya armada, para que quien escribe la copie en vez de redactarla.
const withOrigin = (detail, origin) => `${oneLine(detail, origin.length + 1)} ${origin}`
// La forma y los nombres que ya hay en las secciones donde se va a escribir. Van los nombres y no el
// archivo: con ellos alcanza para no repetir una entrada, y el archivo entero pesaría lo que el INBOX.
function inboxAsk(sections, heads, origin) {
  const known = sections.map((name) => {
    const names = (heads || {})[name.toLowerCase()] || []
    return names.length ? `en ${name} ya están ${names.join(', ')}` : `${name} no tiene entradas`
  }).join('; ')
  return `Cada entrada con la forma del molde —${INBOX_ENTRY}—: un nombre y una línea, y la evidencia se ` +
    `cita donde ya vive, no se copia. Cada línea que te paso termina con su procedencia —${origin}—: va al ` +
    `final de la entrada tal cual, sin reescribirla, resumirla ni completarla. ` +
    `Por nombre, ${known}: lo que ya esté con uno de esos nombres no se ` +
    `vuelve a escribir.`
}
