// Cómo se lee una aceptación, compartido por las dos puntas que la juzgan: `check`, que avisa sobre la
// cola, y `autobuild`, que la manda a Verify. Vive acá y no en el motor porque el recorrido no puede hacer
// `require` —se renderiza con `{{INCLUDE:}}`— y el motor sí puede leer este archivo: lo carga
// `engine/planning/acceptance.js`. Escrito dos veces, una copia dejaba de reconocer lo que la otra pedía
// escribir, que es exactamente el caso 195: `check` ofrecía una marca que el recorrido no conocía.

// Una condición por tramo separado con `;`, el grano con el que Verify contrasta —su `uncovered` enumera
// criterios— y con el que `check` avisa.
const acceptanceConditions = (acceptance) => String(acceptance || '').split(';')
  .map((one) => one.trim()).filter(Boolean)

// La salida explícita, con la forma que el repositorio ya usa dos veces: `(sin partir: …)` para el umbral
// de R17 y `n/a — razón` para `tests:` y `commit:`. Acá vale lo mismo que allá —«como lleva su razón
// escrita se lee en el propio artefacto sin que nadie la cruce»— y por eso no se intenta adivinar si la
// prosa excluye a Verify. Adivinarlo es lo que no se puede: la única aceptación real que nombra el commit
// lo hace justamente para decir que no es condición de Verify, y cualquier lista de frases que la
// reconociera enseñaría a escribir esa frase exacta para silenciar el aviso.
const OUT_OF_VERIFY = /\(fuera de verify:\s*[^)]+\)/i

// Lo que no se ejecuta, y por eso lo único que un criterio `no-surface` puede haber producido (caso 189).
// Es la lista a favor y no la de lo ejecutable a propósito (R27): un `.sql` de migración, un workflow en
// YAML, un `Dockerfile`, un `Makefile` o un `.json` de configuración se ejecutan sin parecer código, y una
// lista de lo ejecutable dejaría afuera lo que venga después. Ampliarla es un cambio con su razón al lado.
// Las imágenes entraron porque un ADR suele traer su diagrama, y sin ellas ese commit contaba como código.
// Lo que no tiene extensión sigue contando como ejecutable: `Makefile` y `Dockerfile` no la tienen.
const NON_EXECUTABLE = ['.md', '.txt', '.adoc', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']
