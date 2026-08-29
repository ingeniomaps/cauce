// Qué casos correr. Sin `cases` van todos, que es lo que hace falta la primera vez y cuando el
// contrato cambió entero.
//
// Nombrar uno existe porque comprobar un arreglo no pide la batería: un sujeto falla un caso de seis y
// correr los seis cuesta seis veces lo mismo para volver a mirar cinco veredictos que ya se tenían. Es
// el desperdicio que R20 nombra —repetir sin que el cambio pueda mover ese veredicto—, y acá tenía
// forma de comando.
//
// El registro que sale entonces cubre menos casos de los que el sujeto tiene, y `evaluate` lo dirá:
// «el resultado no vale». Es correcto que lo diga. Lo que corresponde es componer el registro nuevo
// con los veredictos que no se volvieron a medir, citando de qué corrida vienen.
//
// Vive acá y no en cada evaluador porque los dos lo necesitan igual, y el que se agrega después es el
// que se queda sin él: ya pasó cuatro veces —`contexto`, la ruta del CLI, el esquema de dos niveles y
// este mismo filtro— que un arreglo entrara en un gemelo y no en el otro.
const onlyCases = (input) => (Array.isArray(input.cases) ? input.cases : String(input.cases || '')
  .split(',')).map((one) => String(one).trim()).filter(Boolean)

// Devuelve los casos pedidos, o los que faltan para que quien llama frene con su propio vocabulario.
function pickCases(items, only) {
  const present = items.map((item) => item.id)
  const missing = only.filter((id) => !present.includes(id))
  return { present, missing, items: items.filter((item) => only.includes(item.id)) }
}
