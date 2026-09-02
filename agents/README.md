# El catálogo de cargos

Un cargo es un contrato: su `SKILL.md` declara cuándo actuar, qué decide, qué no le corresponde y cuál
es su entrega mínima; sus métodos viven en `references/`. Para ver la lista con una línea por cargo:

```bash
node tools/ops.js agents list
```

Un slug es único entre todas las categorías. Si dos contienen el mismo, el CLI falla por ambigüedad en
lugar de elegir uno en silencio.

## Dónde vive cada cosa

Los cargos que trae Cauce **no se copian al proyecto**: se resuelven desde la dependencia. Evolucionan
como profesión, y esa evolución es la misma para todas las empresas: investigarla una vez y bien es
mejor que repetirla en cada instalación.

| Qué | Dónde | Quién lo mantiene |
|---|---|---|
| El cargo como profesión | el paquete | el toolkit, con `learn` en **su** repositorio |
| Lo que el cargo debe saber de tu empresa | `organization/roles/<slug>.md` | la empresa |
| Un cargo propio, o una versión propia de uno del catálogo | `agents/roles/<slug>/` | la empresa |

Por eso `learn` falla si lo corrés sobre un cargo del catálogo dentro de una instancia: escribiría en el
paquete y se perdería. El ciclo de aprendizaje de esos cargos tampoco se distribuye.

## Quedarse con una versión propia

```bash
node tools/ops.js agents fork product-manager
```

Copia el cargo entero a `agents/roles/<slug>/` y desde ahí lo mantenés vos: `learn`, `evaluate` y el
puntero que instala el runner pasan a resolver contra tu copia. **Copiarlo a mano no es equivalente**
—se agarra el `SKILL.md`, que es lo que se ve, y quedan atrás los casos, las fuentes y el modelo
operativo: el cargo responde igual y ya no se puede evaluar—.

Lo que no viaja son los informes de aprendizaje, las propuestas y los veredictos de evaluación. Un
veredicto pertenece al contrato que lo ganó, y el fork nace para dejar de ser ese contrato.

Tu copia deja de recibir las mejoras del catálogo, pero no en silencio: `check` y `upgrade` avisan
cuando el original cambia río arriba. Editar tu propia copia no dispara nada — se compara contra lo que
el catálogo tenía el día del fork, no contra lo que escribiste después.

## Evaluar un cargo

`evaluate <slug>` corre los casos adversariales del cargo contra su contrato. Lo que se evalúa desde una
empresa tiene que ser un cargo suyo —propio o adoptado—, y su instancia ya es el lugar donde trabajar.

### Un caso en rojo dice algo, y casi nunca que el cargo esté roto

Los casos vienen con el catálogo; los veredictos, no. El primero que corras es tuyo, y va a decirte una
de tres cosas — separarlas es lo que evita arreglar lo que no estaba mal.

**El cargo no cumplió lo que su contrato ya pedía.** Es el caso más común y no pide cambiar nada: se
vuelve a correr. En el catálogo, dos cargos que arrastraban un rojo lo cerraron así, sin tocarles una
línea. Se reconoce porque el veredicto nombra un comportamiento que el contrato enumera y dice que no se
observó.

**El contrato tiene un hueco.** El veredicto lo dice con todas las letras: registra que ninguna conducta
enumerada cubre lo que ahí falló. Eso sí pide un cambio, y el camino es la propuesta mensual del cargo —
no editar `expected-behaviors.yaml` a mano, porque un contrato que cambia sin veredicto que lo respalde
deja de poder medirse.

**Fue varianza.** Existe y no es raro: un mismo caso puede pasar dos veces y fallar la tercera sin que
nada cambie. Por eso un rojo aislado no autoriza a concluir; y por eso repetir la corrida esperando otro
número no es medir. Lo que distingue una varianza de un defecto es que el defecto se repite **por la
misma razón**, no que se repita el rojo.

Lo que un rojo nunca significa es que el paquete venga fallado. El cargo es un contrato y el caso es la
medición: que la medición encuentre algo es para lo que existe, y un cargo con un caso en rojo se sigue
usando mientras se sepa por qué.
