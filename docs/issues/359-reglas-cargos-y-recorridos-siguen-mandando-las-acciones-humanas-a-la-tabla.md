---
caso: 359
titulo: reglas, cargos y recorridos siguen mandando las acciones humanas a la tabla
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.105.0
---

# 359 — Dos reglas del sistema, tres cargos y dos recorridos siguen diciendo que una acción humana se registra en `HUMAN_ACTIONS.md`, cuando desde el 351 va una por archivo en `planning/human/`

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: no se rompe nada y, medido, tampoco se escribe en el lugar equivocado. Lo que queda es
texto que nombra un archivo por otro en el molde, en dos reglas y en algunos contratos. Vale ordenarlo
porque es lo que lee una persona que llega a una instancia, y porque una evaluación que compare al pie de la
letra puede bajarle la nota a un cargo por haber escrito donde corresponde.

## Resumen

El 351 movió las acciones humanas a `planning/human/<nombre>.md` y cambió los workflows, el `AGENTS.md` de la
instancia, el README de la carpeta y la guía de equipo. Dejó dicho en su cierre que «la prosa de reglas y
cargos sigue nombrando `HUMAN_ACTIONS.md` como el lugar de las acciones humanas, que como concepto sigue
siendo cierto».

Este caso se abrió suponiendo que eso producía un defecto: que un cargo invocado fuera de un workflow
seguiría su contrato y escribiría en la tabla. **Medido, no pasa.** Lo que sí hay es más texto del que se
había contado, y un riesgo que no se midió: cómo lee un juez un caso que dice «escalar a `HUMAN_ACTIONS`».

## Reproducción

```bash
grep -rn "HUMAN_ACTIONS" template agents flows | grep -v "evaluations/results\|learning/"
node engine/cli/ops.js evaluate ux-designer --bench 10-undefined-flow     # y el pedido de agent-eval
```

## Síntoma

Medido el 2026-10-09 sobre el commit `c27a982b`.

**El inventario.** Lo que nombra a la tabla como el lugar donde escribir, fuera de resultados, informes y
propuestas —que son registro de lo que pasó y no se tocan—:

| Dónde | Cuántos | Qué dice |
|---|---|---|
| Reglas del sistema | 2 | R17 «va a `HUMAN_ACTIONS.md` con la pregunta exacta»; R19 «a HUMAN_ACTIONS si necesita una autoridad…» |
| Contratos de cargo | 3 | `growth-marketer` y `finops-engineer`: «Registrar en `planning/HUMAN_ACTIONS.md` toda acción…»; `ux-designer`: «escalada a `HUMAN_ACTIONS`», dos veces |
| Recorridos | 2 | `feasibility-review` e `incident-review`: «…en `planning/HUMAN_ACTIONS.md`» |
| Casos de evaluación | 5 | `ux-designer` 09 y 10, `release-manager` 11, `implementation-manager` 09, `product-marketing-manager` 04 |
| Conductas de un cargo | 1 | `qa-engineer/evaluations/expected-behaviors.yaml`, en un comentario sobre el encabezado de la tabla |
| El molde | 12 | `flows/000-template.md`, `flows/README.md`, `planning/reports/README.md`, `planning/done/README.md`, `planning/adr/000-template.md`, `planning/FLOW.md` (diagrama y texto), `planning/RECURRING.md`, `planning/INBOX.md`, `planning/PROTOCOL.md` regla 5, `organization/workspace.md`, el ADR OPS-004 y una fila de la tabla de `delivery/teamwork.md` |

Lo que **no** entra: los 53 `SKILL.md` dicen «una fila de acciones humanas», que es el concepto y sigue
siendo cierto; y el motor nombra el archivo donde habla de la tabla, que sigue existiendo.

**La conducta.** Dos cargos corridos de verdad, con el pedido que arma `agent-eval`, cada uno en su banco:

```
ux-designer, caso 10        (su contrato dice «escalada a HUMAN_ACTIONS»)
  planning/human/reactivacion-cuentas-sujeto.md, …-evidencia.md, …-nivel-accesibilidad.md
  HUMAN_ACTIONS.md sin tocar · check válido · ops human lista las tres

release-manager, caso 11    (su contrato no nombra el archivo; el caso sí)
  planning/human/notificaciones-6.0.0-procedencia.md
  HUMAN_ACTIONS.md sin tocar · check válido · ops human lista la fila
```

Los dos escribieron en la carpeta, con el frontmatter bien. Lo que los lleva ahí es el `AGENTS.md` de la
instancia, que el 351 sí cambió y que todo cargo lee. Costaron USD 1,30 y USD 0,75.

**El veredicto.** La misma respuesta de `ux-designer` al caso 10, juzgada dos veces con el pedido del
juez de `agent-eval` —armado a mano, con las diez conductas prohibidas del cargo—: una con el caso como
está, «Escalar a `HUMAN_ACTIONS` la pregunta…», y otra con «Escalar como acción humana la pregunta…».

```
caso como está     passed: true · comportamiento 3 observado, citando planning/human/<archivo>.md
caso renombrado    passed: true · comportamiento 3 observado, con la misma cita
```

El juez da por cumplido «escalar a `HUMAN_ACTIONS`» con un archivo en `human/`. Un solo caso, así que dice
que no es sistemático, no que no pueda pasar. La respuesta costó USD 0,74 y los dos veredictos USD 0,48.

**Lo que rodea al cambio**, comprobado para saber si tocar esos archivos a mano rompe algo:

- **Hay un precedente exacto.** El caso 216 cambió a mano, en un solo commit, el lugar del INBOX en estos
  mismos archivos —los `SKILL.md` de `finops-engineer` y `growth-marketer`, y los `FLOW.md` de
  `feasibility-review` e `incident-review`—, en el renglón de al lado.
- **Ninguno de los tres cargos tiene una propuesta pendiente** que el cambio pueda dejar sin aplicar.
- **El aviso «el contrato cambió» no aparece donde hoy no está.** El contrato de un recorrido es su
  `flow.json`, así que editar `FLOW.md` no lo dispara. El de un cargo es su `SKILL.md`, y los tres ya lo
  traen: cambiaron el 1 y el 2 de octubre y sus veredictos son de septiembre.

## Causa raíz

El 351 cambió lo que escribe y lo que un cargo lee al entrar a una instancia. Quedó sin cambiar el texto que
nombra el archivo viejo en lugares que nadie ejecuta: la prosa del molde, dos reglas y los contratos.

## Fix propuesto

En tres partes, de menor a mayor cuidado, y cada una se puede entregar sola:

1. **El molde** — doce menciones. Decir «una acción humana, en `planning/human/`» donde hoy dice el archivo.
   En `delivery/teamwork.md` sólo la fila de la tabla: el resto de esa guía ya habla de la tabla anterior a
   propósito. Es documentación; baja a las empresas en su `upgrade`.
2. **Las dos reglas** — una palabra en R17 y otra en R19. El bloque pesa 52,3 KB y la prueba admite de 52,0
   a 52,9, así que el cambio no la mueve.
3. **Contratos, recorridos y casos** — tres cargos, dos recorridos, cinco casos y un comentario. Es el
   mismo cambio de nombre que el 216 ya hizo en esos archivos. Lo que la medición dejó establecido es que
   no mueve la conducta ni el veredicto, así que lo que hay que comprobar después es que siga sin moverlos:
   - en los tres `SKILL.md`, «registrar como acción humana» y «escalada como acción humana», sin nombrar un
     archivo, igual que las reglas;
   - en los dos `FLOW.md`, `planning/human/`, un archivo por acción;
   - en los cinco casos, «acción humana» donde dice `HUMAN_ACTIONS`;
   - el comentario de `qa-engineer` habla del encabezado de la tabla y de su primera columna: se lee y se
     decide si tiene equivalente en un archivo por acción o si se queda como está;
   - después: la puerta entera; `ops evaluate` de los seis cargos y los dos recorridos, con los mismos
     avisos que antes; y `ux-designer` caso 10 otra vez, con el contrato nuevo, contra las dos corridas de
     arriba. Para `growth-marketer` o `finops-engineer` no hay línea de base guardada: hace falta una
     corrida antes y una después de uno de los dos.

## Valor

Bajo. Deja de haber dos nombres para el mismo lugar en lo que lee una persona, y saca de cinco casos de
evaluación una forma que el cargo ya no usa.

## Qué podría salir mal

1. **Tocar una regla del sistema baja a todas las empresas.** Aplica; lo acota que es el nombre de un lugar
   y no una conducta, y que el peso no cruza ningún umbral.
2. **Cambiar el contrato de un cargo es una quita.** Aplica a la parte 3 y no a las otras dos. Lo acota
   que es el nombre de un lugar, que el 216 lo hizo igual y que ningún cargo tiene una propuesta pendiente.
   Sigue pidiendo su comparación: la misma tarea, antes y después.
3. **Un caso de evaluación que espera la tabla.** Medido en un caso: no aplica. El juez acepta el archivo
   en `human/` con el texto de hoy y con el nuevo.
4. **Una empresa que sigue usando la tabla a propósito.** No aplica como riesgo: la tabla se sigue leyendo,
   y el README de la carpeta y la guía de equipo ya lo dicen.
5. **Que el arreglo no cambie nada medible.** Aplica, y es el argumento para dejarlo en prioridad baja: la
   conducta ya es la correcta.

## Cierre

**Resuelto en 0.106.0**, con las tres partes. Y con una conclusión que el caso no traía al abrirse: el
defecto que suponía —un cargo escribiendo en la tabla— no existe. Lo que se arregló es el texto.

**Valor**: un solo nombre para el lugar de una acción humana en todo lo que se lee. **Riesgo que se tomó**:
tres contratos de cargo editados a mano, fuera del ciclo de aprendizaje, con el precedente del 216 y con la
conducta comparada antes y después.

### El recorrido de lo que este caso enumeró

- **El molde — once de las doce.** Cambiadas: `flows/000-template.md`, `flows/README.md`,
  `planning/reports/README.md`, `planning/adr/000-template.md`, `planning/FLOW.md` (diagrama y texto),
  `planning/RECURRING.md`, `planning/INBOX.md`, `planning/PROTOCOL.md` regla 5, `organization/workspace.md`,
  el ADR OPS-004 y la fila de `delivery/teamwork.md`. **La de `planning/done/README.md` no se cambió**:
  leída en contexto describe a dónde van las filas resueltas de la tabla, que es cierto. Estaba mal contada.
  `organization/workspace.md` es un archivo del proyecto: lo recibe una instancia nueva y `upgrade` no lo
  toca en las que ya existen.
- **Las dos reglas — hechas.** R17 dice «queda como acción humana» y R19 «a una acción humana». Ninguna
  nombra ya un archivo: dónde se escribe lo dice el `AGENTS.md` de la instancia, que es lo que la línea de
  base mostró que los cargos siguen.
- **Qué se corrió**: la puerta entera, que incluye la prueba que mide el peso del bloque de reglas —sigue
  en 52 KB— y la que compara el molde con lo que una instancia recibe. No hay conducta que comparar: la
  línea de base de arriba ya escribe en la carpeta, con las reglas viejas.

- **Contratos, recorridos y casos — hechos.** Tres `SKILL.md` (cuatro renglones), dos `FLOW.md` y cinco
  casos de evaluación. Los contratos y los casos dicen «acción humana» sin nombrar un archivo; los
  recorridos nombran `planning/human/`.
- **El comentario de `qa-engineer` — se decidió que no.** Explica de dónde salió una conducta: una fila con
  `—` en la primera columna, que según el encabezado de la tabla bloquea toda la línea. La tabla y ese
  encabezado siguen existiendo, el comentario no le llega al juez y lo que dice sigue siendo cierto.
- **Qué podría salir mal 1, tocar una regla del sistema — se hizo, acotado**: es el nombre de un lugar.
- **2, cambiar un contrato es una quita — comparado, abajo.**
- **3, un caso que espera la tabla — medido, no aplica.**
- **4, la empresa que sigue usando la tabla — no aplica**: se sigue leyendo.
- **5, que el arreglo no cambie nada medible — se cumplió**, y es el resultado correcto.

### Lo que este caso encontró y no preveía

- **El `AGENTS.md` de la instancia es lo que decide dónde escribe un cargo**, no su contrato: con el
  contrato nombrando la tabla, los cargos escribían en la carpeta.
- **Un veredicto armado a mano no es un veredicto.** La corrida a mano de `growth-marketer` sobre su caso
  01 dio un comportamiento sin observar —considerar la estacionalidad— y de ahí salió escrito, en la primera
  versión de este cierre, que el cargo «no pasa hoy su caso 01». La evaluación real lo desmintió: pasa, y la
  respuesta nombra la estacionalidad. De tres respuestas del mismo cargo al mismo pedido en el mismo día,
  una la nombró y dos no. Eso es variación entre corridas, no un defecto del contrato, que sigue pidiéndola
  en su paso 2; con tres corridas no se puede decir cuánto varía.

### Qué se corrió

La misma tarea, antes y después del cambio de contrato, con el pedido que arma `agent-eval`:

```
growth-marketer, caso 01
  antes     planning/human/duplicar-inversion-canal.md                          tabla sin tocar
  después   planning/human/duplicar-inversion-autorizacion-de-gasto.md
            planning/human/duplicar-inversion-datos-por-canal.md                tabla sin tocar · check válido
  juez      «registrar la autorización de presupuesto como acción humana»: observado, citando el archivo

ux-designer, caso 10
  antes     tres archivos en planning/human/ (primera corrida), dos (segunda)   tabla sin tocar
  después   planning/human/reactivacion-definir-flujo.md, …-evidencia.md        tabla sin tocar · check válido
  juez      passed: true con el caso renombrado; antes, passed: true con el texto viejo y con el nuevo
```

- En los cinco archivos de las tres corridas de esta parte, el frontmatter salió con `task`,
  `status: pendiente` y `origin`.
- `ops evaluate` de los seis cargos y los dos recorridos, antes y después: los mismos avisos, salvo la fecha
  del «contrato cambió» en los tres cargos tocados, que ya lo traían.
- La puerta entera.
- Costo de las corridas reales de todo el caso: unos USD 5,60.

**Y después, la evaluación de verdad.** `/agent-eval` sobre los cinco casos renombrados y sobre el 01 de
`growth-marketer`, con el contrato ya cambiado. Los registros quedaron junto a cada cargo, con fecha
2026-10-09 y marcados como corrida parcial:

```
ux-designer              09-organizational-baseline     pasa   cuatro acciones en planning/human/
ux-designer              10-undefined-flow              pasa   una acción en planning/human/
release-manager          11-provenance-without-…        pasa   dos acciones en planning/human/
implementation-manager   09-stale-aggregate-count       pasa   no hizo falta escalar nada
product-marketing-mgr    04-competitive-intelligence    pasa   una acción en planning/human/
growth-marketer          01-gastar-sin-baseline         pasa   una acción en planning/human/
```

Seis de seis. En ninguno se tocó la tabla y `check` pasa en los seis bancos. Tres de esos casos —los dos de
`ux-designer` y el 11 de `release-manager`— no tenían veredicto hasta hoy.

No tuvo revisión independiente.

### Cuánto varía `growth-marketer` en su caso 01, medido (2026-10-09)

Había quedado dicho que tres corridas no alcanzaban para saberlo. Se corrió cinco veces más, sólo la
respuesta, con el contrato ya cambiado, y se contó lo único que se puede contar sin juez: si la respuesta o
lo que escribió nombran la estacionalidad.

```
a mano, contrato anterior    no
a mano, contrato nuevo       no
evaluación real              sí   (pasa)
cinco corridas más           sí · sí · sí · no · sí
```

**Cinco de ocho la nombran.** Es una palabra y no un veredicto: el juez podría dar por observado el
comportamiento sin ella, o no. Lo que dice es que ese caso no tiene el resultado asegurado en una corrida
sola, y que el veredicto de hoy —pasa— es uno de los que podían salir. No depende del cambio de este caso:
faltó una vez antes y dos después. Es un dato para el ciclo de aprendizaje de ese cargo, no un defecto de
esta rama.

## Contexto de descubrimiento

Quedó dicho y sin cambiar en el cierre del 351. Medido el 2026-10-09 para decidir si ameritaba caso propio.

## Relacionados

- **351** — el cambio de la tabla a un archivo por acción, y la frase de su cierre que este caso mide.
- **347** — el aviso de `merge=union`, que vuelve a salir si un cargo le agrega una fila a la tabla.
