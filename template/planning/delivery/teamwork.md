# Trabajo en equipo

> Camino recomendado. Adaptar en `project.md` y registrar excepciones durables mediante ADR.

Una instancia la comparte un equipo, y lo que comparte es de tres clases distintas. Casi todos los
choques entre dos personas —o entre dos agentes— salen de tratarlas igual.

## Los tres anillos

| Anillo | Qué vive ahí | Escritores | Frecuencia |
|---|---|---|---|
| **Compartido** | `roadmap/`, `BACKLOG.md`, `INBOX.md`, `HUMAN_ACTIONS.md`, `DONE.md`, reglas y ADR | cualquiera, en actos humanos | baja |
| **Coordinación** | qué tarea tomó cada quien | uno por persona | dos veces por tarea |
| **Local** | el plan en curso, `.verify-log`, el árbol de trabajo | vos | continua |

La regla que los separa: **un archivo con más de un escritor tiene que cambiar poco; uno que cambia mucho
tiene que tener un solo escritor.** Cuando uno viola las dos a la vez, el equipo se pisa en cada commit.

De ahí sale el corolario que ahorra la mayor parte de las conversaciones: **no hace falta que cada persona
sepa qué está haciendo la otra.** Hacen falta dos cosas y sólo dos — qué está tomado, para no tomarlo dos
veces, y qué terminó, porque es evidencia y destraba lo que dependía de eso. Todo lo del medio —el plan,
los pasos, las decisiones en vuelo— no le sirve a nadie más y es justo lo que más cambia.

## Un árbol de trabajo por persona o por agente

Dos agentes en el mismo directorio comparten índice de git y archivos: uno stagea lo del otro, uno
commitea trabajo ajeno, y los errores no se parecen a la causa — un archivo trackeado que «no existe»
suele ser la otra sesión y no tu cambio. No es un problema de este toolkit sino del filesystem, y la
respuesta es un árbol por cada uno:

```bash
git worktree add ../repo-dashboard  feat/dashboard-filtros
git worktree add ../repo-exportar   feat/boton-exportar
```

Mismo `.git`, índices separados, archivos separados. Es la **precondición** para correr dos agentes a la
vez: sin esto, nada de lo demás de esta guía alcanza.

Cada árbol necesita además sus propios recursos —puertos, contenedores, base—. Dos agentes levantando el
mismo entorno de desarrollo en el mismo puerto fallan mucho antes que cualquier archivo de planning.

La rama por tarea y su ciclo viven en `branches.md`; acá se agrega que el árbol también se separa.

## Tomar una tarea sin pisarse

`ops context` entrega la primera tarea pendiente y no bloqueada de la cola. **Con dos personas entrega la
misma a las dos**, y ninguna se entera. Hoy no hay mecanismo que lo impida: se sostiene por convención, y
decirlo es parte de la guía — presentarlo como resuelto sería peor que no tenerlo.

Lo que funciona mientras tanto, de más barato a más fuerte:

- **Repartir por hito.** Cada persona toma de un `## Hito` distinto. Cuesta cero y corta la colisión.
- **Mirar el `service:`.** Es el dominio de colisión y ya está declarado en cada tarea: dos tareas de
  servicios distintos no se pueden pisar en el código. Dos del mismo servicio pueden, y conviene saberlo
  antes y no al mergear.
- **Decirlo donde el equipo mire.** Un canal, una reunión de diez minutos, lo que ya usen.

## Cuando el equipo crece o se achica

**No se escala por archivo: se escala por instancia.** Los umbrales no son leyes; son el momento de mirar.

| Tamaño | Qué alcanza | Qué se rompe primero |
|---|---|---|
| 1 | todo tal cual | nada |
| 2 a 8 | un `planning/`, un árbol por persona, reparto por hito | `DONE.md` en conflicto, y de eso se ocupa `.gitattributes` |
| 8 a 20 | lo mismo, con la cola filtrada por hito y por cast | el `BACKLOG` se vuelve **ilegible** antes que contencioso: nadie lee sesenta tareas para elegir la suya |
| 20+ | una instancia por equipo o por dominio | la coordinación pasa a ser entre instancias, que es `multi-repo.md` |

Achicarse parece más fácil y tiene una trampa: **lo que tomó quien se fue no se libera solo.** Al bajar de
tamaño se recorren las tareas tomadas para devolverlas a la cola o reasignarlas, igual que las filas de
`HUMAN_ACTIONS.md` que esperaban a esa persona.

## Dónde va cada cosa que el equipo se dice

| Lo que pasó | Dónde va | Por qué ahí |
|---|---|---|
| Una decisión que cambia cómo se construye | `adr/` | se consulta dentro de un año |
| Una norma que hay que cumplir siempre | `business-rules/` o `rules/` | la lee un agente en cada tarea |
| Algo que sólo puede hacer una persona | `HUMAN_ACTIONS.md` | frena su tarea hasta que se resuelva |
| Una idea, una deuda, una lección | `INBOX.md` | espera promoción humana |
| Lo que una tarea entregó, con su evidencia | `DONE.md` | es lo que se audita |
| «Tomo ésta», «salgo a almorzar», «está lento el CI» | el canal del equipo | no es durable y no se audita |

La última fila pesa tanto como las otras: meter conversación en el repositorio lo vuelve ilegible, y sacar
decisiones del repositorio las pierde.

## Lo que git tiene que saber

`.gitattributes` declara que `DONE.md` y `HUMAN_ACTIONS.md` se concatenan en vez de conflictuar cuando dos
personas cierran trabajo el mismo día. Llega con la instancia y sus bordes están escritos ahí adentro.
