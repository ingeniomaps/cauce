# Trabajo que vuelve

Lo que hay que hacer cada tanto y no una vez: actualizar dependencias, revisar quién tiene acceso a
producción, mirar el gasto del mes, recorrer el INBOX entero. No es una categoría de trabajo —puede ser
cualquier cosa— sino una forma de declararlo: acá vive el enunciado, y cada vuelta se promueve a
`BACKLOG.md` como una tarea más.

**Nada se dispara.** Este archivo no ejecuta ni encola: declara cada cuánto algo debería mirarse, y el
vencimiento se calcula cuando alguien corre el CLI. Promover sigue siendo un acto humano, igual que en
`INBOX.md`. Lo que la máquina aporta es que no se te pase, no decidir por vos.

## Cada fila

- **Qué** — un identificador estable, en minúsculas y sin espacios. No cambia nunca: es lo que ata la
  fila a las vueltas que ya se hicieron.
- **Cada** — vocabulario cerrado: `mensual`, `trimestral`, `semestral`, `anual`. No hay expresiones de
  cron, y esa ausencia es el enunciado: si hiciera falta una, lo que estarías declarando es otra cosa.
  Tampoco hay `semanal`, porque el slug de cada vuelta tiene grano de mes.
- **Desde** — `AAAA-MM-DD`. Ancla la primera vuelta y después no se toca. Es la primera fecha en que
  vence, no el día en que se escribe la fila: con la fecha de hoy nace vencida.
- **Tarea y aceptación** — lo que se va a promover, con su aceptación observable escrita una sola vez y
  con calma. Improvisada en cada vuelta, la misma recurrencia termina significando cosas distintas sin
  que nadie lo decida.

## Cuándo vence

Se cuenta desde la última vez que se cerró, no desde un día fijo del calendario: una recurrencia
atrasada no debe tres vueltas, debe una, la que no se hizo.

La fecha de ese último cierre **no se escribe acá**. Sale de `done/` — la entrada más nueva cuyo slug
sea `<qué>-AAAA-MM`—, que es la evidencia de que efectivamente se hizo y no la afirmación de que se
hizo. Una celda que alguien tiene que acordarse de actualizar miente a los tres meses, y el estado no se
copia para representar progreso.

Por eso cada vuelta se promueve con su período en el slug —`deps-2026-10`, después `deps-2026-11`— y no
con el identificador pelado. Reusarlo tiene además su propio castigo: dos entradas de DONE con el mismo
slug son un error de `check`, y ese error llega un mes tarde.

## Lo que este archivo no es

- **No bloquea.** Una recurrencia vencida no frena ninguna tarea. Lo que sí frena vive en
  `HUMAN_ACTIONS.md`; ponerlo acá entrena a ignorar lo que vence, que es lo único que este archivo hace.
- **No es una cola.** Nada de acá está aprobado para ejecutarse. `BACKLOG.md` sigue siendo la única cola
  y se escribe a mano.
- **No es el INBOX.** Una idea se promueve una vez y se borra; esto vuelve, y por eso se queda.

## Recurrencias

| Qué | Cada | Desde | Tarea y aceptación observable |
|---|---|---|---|
| inbox | trimestral | {{INBOX_SINCE}} | Recorrer el INBOX entero. _Aceptación: ninguna viñeta queda sin decisión de promover, dejar o borrar._ (service: planning) |

<!--
| deps | mensual | 2026-09-01 | Actualizar dependencias. _Aceptación: `npm outdated` no deja una versión mayor sin decisión escrita y la puerta queda verde._ (service: .) |
| accesos | trimestral | 2026-07-01 | Revisar quién tiene acceso a producción. _Aceptación: cada cuenta activa figura en `organization/`, y las demás están dadas de baja._ (service: organization) |
| costos | mensual | 2026-09-01 | Revisar el gasto de infraestructura del mes. _Aceptación: cada línea que subió más de 20% tiene una razón escrita._ (service: .) |
-->

## Postergaciones

Saltear una vuelta es legítimo y se escribe. Lo que no puede perderse es la razón: sin ella queda una
recurrencia atrasada y nadie sabe si fue una decisión o un olvido.

Postergar compra **un período**, no una fecha elegida: la vuelta siguiente vuelve a preguntar. Las
postergaciones se cuentan desde el último cierre y el contador se reinicia al cerrar. Tres seguidas no
son un atraso — son una recurrencia mal declarada, y lo que hay que revisar es la cadencia o la fila
entera.

La salida definitiva es borrar la fila. «Esto ya no lo hacemos» es un diff que alguien revisa; un estado
`retirada` es una línea que nadie vuelve a leer.

Cada una se escribe con el nombre de su fila en negrita, la fecha y la razón —`- **qué** AAAA-MM-DD —
razón`—, igual que un ítem del INBOX y por el mismo motivo: el nombre es con lo que se cita la fila.
Sólo se agrega al final; una línea escrita acá no se edita ni se borra.

<!--
- **deps** 2026-10-02 — Esperando el release de la 2.0; subir dependencias antes lo ensucia.
-->
