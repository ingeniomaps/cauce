// Qué se midió y qué no. Un caso sin veredicto no es un caso reprobado: es un caso que no se midió, y
// la diferencia es quién falló. Escribirlo como «no pasa» le atribuye al sujeto un fallo del
// instrumento —el juez que murió, la etapa que se cayó— y eso no se distingue después leyendo el
// registro.
//
// Y el que desaparece es peor que el que miente: al caerse sale del arreglo, el total se achica solo y
// el registro queda idéntico a uno que midió menos casos a propósito.
function measured(items, verdicts) {
  const answered = verdicts.filter((one) => one && one.verdict)
  const ids = answered.map((one) => one.id)
  return { answered, unmeasured: items.map((item) => item.id).filter((id) => !ids.includes(id)) }
}

// La línea que impide leer el registro como completo. Va en el cuerpo y no al pie: sirve para que la
// vea quien decide, no para dejar constancia de que se sabía.
const unmeasuredNote = (unmeasured) => (unmeasured.length
  ? `> Sin medir en esta corrida: ${unmeasured.join(', ')} — el caso no llegó a un veredicto.\n\n`
  : '')

// Ninguna ruta de esta máquina entra al registro. El sujeto y el juez las escriben con naturalidad
// —trabajaron ahí— y el repositorio las rechaza: una ruta bajo el `/home` de alguien no le sirve a nadie
// más y ata el documento a un directorio que en otra máquina no existe.
//
// La raíz no siempre la trae `root`: `{{OPS_DIR}}` lo completa `automation install`, y en el repositorio
// del toolkit —que no se instala a sí mismo— queda vacío y `ROOT` vale `.`. Cuando falta, la revela el
// propio texto: cualquier ruta del banco la lleva adelante. Con ella se recorta también la que apunta a la
// raíz sin nada detrás, que es la que se escapó el 2026-08-31 después de dos arreglos que cubrían el caso
// visto y no la clase.
//
// Se aplica sobre la fila entera del registro y no pedazo por pedazo: así ninguno queda afuera —la
// nota del juez lo estaba, y es el que más fácil filtra una ruta— y la raíz se deriva una sola vez.
//
// El recorte es el mecanismo y está medido: su prueba lo ejecuta y mira qué sale. La regla que además se
// le pide al juez y al sujeto —nombrar los archivos relativos a la raíz— es defensa en profundidad y **no
// está medida**: sólo consta que el texto está en los prompts, que es estructura y no conducta. Sirve para
// que el registro no quede con «todos bajo ``», no para garantizar nada; lo que garantiza es esto.
//
// Medirla pide otro instrumento. Una corrida de evaluación aporta once textos de prosa, y distinguir el
// 39 % de base de un 10 % necesita del orden de treinta y cuatro por brazo: hace falta una sonda que corra
// la misma tarea con y sin la frase, con la propiedad decidida por un regex y sin juez. El 39 % no es
// estimado: son 9 de 23 textos con una ruta, contados sobre el `journal.jsonl` de las tres corridas del
// 2026-08-30 y 31.
const stripRoot = (text, root) => {
  const one = String(text || '')
  const visto = (one.match(/([A-Za-z0-9_./~-]+)\/\.cauce-eval\//) || [])[1]
  const base = root && root !== '.' ? root : (visto && visto.startsWith('/') ? visto : '')
  return (base ? one.split(`${base}/`).join('') : one)
    .replace(/[A-Za-z0-9_./~-]*\/\.cauce-eval\//g, '.cauce-eval/')
}

// Lo que va en una línea del registro se aplana antes de escribirlo: el motor lee `- Para el contrato:`
// como línea propia, y un salto adentro partiría el documento en dos justo donde hay un dato.
const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim()
