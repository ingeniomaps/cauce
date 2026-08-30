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

// La ruta absoluta del banco no entra al registro. El cargo y el juez la escriben con naturalidad
// —trabajaron ahí— y el repositorio la rechaza: una ruta de una máquina no le sirve a nadie más y ata el
// documento a un `/home` que en otra no existe. Se recorta acá y no pidiéndoselo al modelo: un pedido se
// cumple casi siempre, y ese «casi» ya costó dos corridas de CI en rojo, la segunda después de haber
// arreglado a mano el archivo de la primera en vez del instrumento.
const stripRoot = (text, root) => String(text || '').split(`${root}/`).join('')
