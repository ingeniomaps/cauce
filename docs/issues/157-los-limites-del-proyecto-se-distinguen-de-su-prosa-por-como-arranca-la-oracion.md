---
caso: 157
titulo: Qué párrafo de AGENTS.md es un límite y cuál lo explica se deduce de cómo arranca la oración, así que un límite escrito de otra forma no llega a ningún agente
estado: resuelto
resuelto-en: 0.92.0
prioridad: media
version-detectada: 0.91.0
---

# 157 — El molde no marca sus límites, y derivarlos obliga a adivinar por gramática

**🟢 resuelto en 0.92.0** · detectado en 0.91.0 · prioridad **media** — el molde marca sus límites, la
gramática vieja sigue contando, y lo que no entra por ninguno de los dos caminos lo reporta `check`

## Resumen

`ops contract` deriva `boundaries` de la sección `## Autonomía` de `AGENTS.md` y de
`## Excepciones de autonomía` de `organization/workspace.md`, y esa lista viaja en el preámbulo de **cada**
subagente del recorrido.

La sección mezcla dos cosas que no se distinguen por ninguna marca:

- **Los que enuncian**, que un agente puede obedecer: «El runner puede implementar una tarea promovida…»,
  «Debe detenerse cuando falte una decisión…», «Nunca amplía el alcance…».
- **Los que explican**, dirigidos a una persona: por qué una recurrencia vencida no es una excepción, dónde
  se decide publicar, y que todo eso rige sin que nadie escriba nada.

Como no hay marca, el comando los separa **por cómo arranca el párrafo** —vocabulario cerrado
`El runner | Debe | Nunca`—. Funciona sobre el molde de hoy y es una deducción gramatical, no un contrato.

## Reproducción

```bash
node engine/cli/ops.js contract <ops-root> --json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).boundaries))"
```

Devuelve tres. Ahora, en `organization/workspace.md`, escribir una excepción real del proyecto con
cualquier otra forma —«En `api/` no se tocan migraciones», que es como la escribiría cualquiera— y repetir:
**no aparece**. El proyecto declaró un límite y ningún agente lo recibe.

## Síntoma

No hay error ni aviso: la lista sale más corta y se lee igual que una lista completa. El preámbulo llega a
cada subagente afirmando «Límites del proyecto: …» con los que sí matchearon, así que el agente trabaja
creyendo que ésos son todos.

Y es asimétrico en la dirección cara: sobre `AGENTS.md` casi no puede fallar —`upgrade` lo reemplaza entero,
así que su redacción es la del molde—, y sobre `workspace.md`, que es el archivo que **el proyecto escribe**,
falla siempre que no imite la gramática del molde.

## Causa raíz

`engine/cli/contract.js`, la función que parte la sección en límites. El defecto no es suyo: no hay nada en
`template/AGENTS.md` ni en `template/organization/workspace.md` que diga qué párrafo es un límite, así que
cualquier derivación tiene que adivinarlo.

## Fix propuesto

1. **Marcar los límites en el molde.** Una lista con viñetas bajo un encabezado propio —`### Límites`— o un
   prefijo reconocible por párrafo. El comando deja de adivinar y pasa a leer. Es lo único determinista, y
   **baja a cada instancia en su `upgrade`**: `AGENTS.md` está en `TEMPLATE_FILES`, así que el molde nuevo
   llega solo; `organization/workspace.md` es del proyecto y su sección la escribió una persona, así que
   ahí hay que decidir qué pasa con lo ya escrito.
2. **Mantener la deducción y avisar cuando no encuentre nada** en la sección del proyecto. Barato y no
   cierra el hueco: avisar de cero es fácil, y el caso malo es encontrar dos de tres.
3. **Que el propio `check` compare** los párrafos de la sección contra los que el comando derivó, y reporte
   los que quedaron afuera. No cambia el molde y convierte una pérdida silenciosa en una fila que alguien
   lee — es el mismo patrón con que `automation check` reporta un guard inerte.

El 3 no depende del 1 y los dos pueden convivir.

## Tradeoffs

- **El 1 cambia un archivo que cada instancia recibe.** Un molde que marca sus límites obliga a que quien
  los amplíe en `workspace.md` use la misma marca, y lo ya escrito sin ella deja de contar: hay que decidir
  si se migra, si se avisa o si se acepta perderlo.
- **El 2 y el 3 dejan la deducción en pie**, o sea que siguen dependiendo de cómo alguien redactó un
  párrafo. Lo que cambian es que el error deje de ser silencioso, que es la mitad que más cuesta.
- **No medido: cuántas instancias escribieron excepciones y con qué forma.** Es el número que decide si
  migrar lo existente vale la pena o si es un caso de cero, y no se puede sacar de este repositorio.

## Prioridad

**Media.** No rompe nada hoy porque el único consumidor es un comando recién escrito y el molde intacto
devuelve lo correcto. Sube a **alta** el día que una instancia declare excepciones en `workspace.md`, que es
justamente para lo que ese archivo existe: ahí la pérdida silenciosa pasa a ser la regla y no el borde.

## Contexto de descubrimiento

2026-09-15, construyendo `ops contract` para el **154**. La primera versión partía la sección por oraciones
y devolvía diecisiete «límites», de los cuales cuatro lo eran: el resto eran conectores —«Eso rige sin que
nadie escriba nada.»— y párrafos que razonan sobre `BR-OPS-002` y sobre `runner.allowPush`. Acotarlo por el
sujeto de la oración dejó los tres correctos, y dejó a la vista que lo que falta es una marca en el molde.

## Relacionados

- **154** — de donde sale: el recorrido derivaba este contrato con un agente y ahora lo deriva un comando.
- **141** — la decisión de que al preámbulo de cada subagente viajen las rutas de las reglas y no su texto.
  Es el mismo problema de tamaño, resuelto una vez, y el precedente que este caso sigue.
- **105** — las reglas que rigen el proyecto, con sus overrides resueltos por el motor.

## Cierre

**🟢 resuelto en 0.92.0** · `engine/cli/contract.js`, `engine/cli/validate.js`,
`template/organization/workspace.md`, `test/planning/contract.test.js`, `CHANGELOG.md`

Se tomaron el 1 y el 3, y juntos se cubren entre sí: el molde marca sus límites bajo `### Límites`, la
gramática vieja sigue contando, y lo que no entra por ninguno de los dos caminos deja de perderse en
silencio porque `check` lo nombra.

### Contra lo que el caso enumeró

- **Opción 1, marcar los límites en el molde** — **se hizo, y su tradeoff se disolvió al conservar los dos
  caminos.** El caso advertía que un molde que marca sus límites «obliga a que quien los amplíe use la
  misma marca, y lo ya escrito sin ella deja de contar: hay que decidir si se migra, si se avisa o si se
  acepta perderlo». No hubo que decidirlo: `limits()` lee la lista marcada **y** sigue aceptando `ENUNCIA`,
  así que nada de lo ya escrito deja de contar y no hay nada que migrar.
- **Opción 2, avisar cuando no encuentre nada** — **se decidió que no, por la razón que el propio caso
  escribió**: avisar de cero es fácil y el caso malo es encontrar dos de tres. El aviso que se construyó
  compara párrafo por párrafo, así que cubre los dos.
- **Opción 3, que `check` compare y reporte lo que quedó afuera** — **se hizo.** `CT.warnings` contrasta
  los párrafos de la sección contra los del molde —que viaja en el paquete— y reporta los que el proyecto
  escribió y no llegaron. Cita el párrafo y no sólo su cantidad: sin la cita, quien lee el aviso no sabe
  cuál de sus límites se perdió.
- **Tradeoff «el 1 cambia un archivo que cada instancia recibe»** — **se paga, y es el costo aceptado.**
  `organization/workspace.md` es del proyecto y `upgrade` no lo pisa, así que la sección nueva llega a las
  instancias que nacen de acá en adelante; las existentes siguen funcionando por el camino de `ENUNCIA` y
  reciben el aviso si escriben algo que no entra.
- **Tradeoff «el 2 y el 3 dejan la deducción en pie»** — **sigue en pie y es deliberado.** Lo que cambió es
  que el error dejó de ser silencioso, que el caso ya señalaba como «la mitad que más cuesta».
- **Tradeoff «no medido: cuántas instancias escribieron excepciones y con qué forma»** — **sigue sin medir
  y se declara, pero dejó de decidir nada.** El caso decía que ese número decidía si migrar lo existente
  valía la pena; al conservar los dos caminos no hay migración que evaluar. Seguiría importando el día que
  alguien quiera retirar `ENUNCIA`, y para eso hace falta mirar instancias reales.

### Lo que el caso no preveía

- **Un ejemplo en el molde se obedece.** La primera versión de la marca traía su ejemplo como viñeta viva,
  y eso lo convertía en un límite real que viajaba al preámbulo de cada subagente de toda instancia nueva
  — una regla que nadie escribió y que todos cumplirían. Va comentado, y hay una prueba que lo fija.
- **Leer un solo bloque `### Límites` deja al proyecto sin su límite.** Con el molde trayendo ya esa
  sección, quien agregue la suya al final del archivo queda con dos, y leer sólo la primera devolvía cero
  viñetas: el límite no llegaba **y** el aviso tampoco lo veía, porque para la comparación caía dentro de
  la sección del molde. Se recorren todos los bloques.

### Qué se corrió

- **Reproducción antes de arreglar:** el molde intacto devuelve 3 límites; el proyecto declara «En `api/`
  no se tocan migraciones sin aprobación del equipo de datos» y la cuenta **sigue en 3**, sin un aviso.
- **Después:** con la marca, el mismo límite llega y `boundaries` pasa a 4; escrito como prosa suelta, no
  llega pero `check` lo reporta citando el párrafo.
- **Rojo previo** con la marca y el aviso revertidos en una copia desechable: **2 rojas de 12**, y son las
  dos del arreglo.
- **Tres mutaciones.** Leer un solo bloque → 1 roja, la de la marca. Apagar el aviso → 1 roja, la del
  aviso. **Y una que sobrevivió:** quitar el filtro de comentarios de `declared()` no puso nada en rojo —
  porque una viñeta comentada arranca con `<!--` y el filtro de viñetas ya la descarta. Era una defensa
  que no defendía de nada, así que se retiró en vez de escribirle una prueba.
- `npm run ci` **exit 0 — 872 pruebas, 0 en rojo**, sin superficie muerta, 71 archivos en su piso y
  `engine/cli/contract.js` en 100 % de líneas y funciones.
