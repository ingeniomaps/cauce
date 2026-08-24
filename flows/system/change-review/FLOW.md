# Change Review

Decide si un cambio ya construido se puede entregar. No lo diseña, no lo construye y no lo despliega:
mira lo que existe y firma, o dice qué falta para poder firmar.

Es el único momento del ciclo donde las disciplinas tienen que poder **discrepar de forma acotada**, y
por eso es un recorrido y no un cargo. Un revisor solo promedia: mira lo que sabe mirar y aprueba el
resto por omisión. Acá cada disciplina responde lo suyo y la firma es de quien responde por el cambio.

## Cuándo

Cuando hay un cambio construido esperando entrega. Si todavía no está construido, lo que corresponde es
`technical-design`; si está roto en producción, `defect-triage`; si ya se entregó y falló,
`incident-review`.

## Las etapas

| etapa | cargo | pregunta |
|---|---|---|
| `scope` | tech-lead | ¿contra qué se revisa, y qué decisiones vigentes lo restringen? |
| `correctness` | el dueño de la superficie que cambió | ¿hace lo que dice, y qué rompe que nadie nombró? |
| `evidence` | qa-engineer | ¿qué prueba sostiene cada criterio, y qué está verde sin estar cubierto? |
| `exposure` | security-engineer | ¿qué queda alcanzable que antes no lo estaba, y por quién? |
| `operability` | site-reliability-engineer | ¿cómo falla, qué lo muestra y cómo se deshace? |
| `decide` | tech-lead | el veredicto, con sus tres salidas |

## El veredicto tiene tres salidas

Aprobar; aprobar con lo que hay que corregir antes de entregar; y no poder aprobar. Con dos, las dos
últimas se confunden: lo que no se resuelve dentro de este cambio gasta igual la vuelta de corrección
que no lo va a arreglar, y una mejora opinable manda a tocar código por un riesgo que nadie pidió.

Dentro del veredicto, lo que impide entregar se separa de lo que no. Lo primero se corrige; lo segundo
se registra con su dueño y su condición de reapertura. Una objeción que no se atendió **queda escrita
con su autor**: promediarla la borra sin resolverla.

## Aprobar sin mirar es el modo de falla

Un veredicto que no enumera qué se inspeccionó no es un veredicto: es una firma. Por eso `scope` cierra
con la lista literal —archivo, diff, comando con su salida— y `decide` dice qué quedó sin inspeccionar
y por qué. Un número agregado —cobertura, tests en verde, líneas cambiadas— no sustituye a esa lista:
mide qué se ejecutó, no qué se atrapó.

## Lo que este recorrido no hace

- **No construye ni corrige.** Devuelve qué hay que corregir; corregirlo es de quien lo construyó.
- **No despliega ni promueve.** La entrega es una decisión con su propia autorización.
- **No inventa el criterio.** Si no hay criterio de aceptación contra el cual revisar, eso es lo que
  informa: revisar contra un criterio supuesto produce una firma que no vale.

## Agentes condicionales

| agente | cuándo |
|---|---|
| `backend-engineer` | el cambio toca servicio, contrato o trabajo asíncrono |
| `frontend-engineer` | toca interfaz web |
| `mobile-engineer` | toca la aplicación móvil |
| `database-administrator` | toca esquema, migración o datos en reposo |
| `privacy-compliance-specialist` | toca datos personales, su base legal o su retención |

La etapa `correctness` la ocupa el dueño de la superficie que cambió; `backend-engineer` es el default
del contrato y se reemplaza por el que corresponda antes de correr el recorrido.

Validar siempre con `node tools/ops.js flow check change-review` antes de usarlo.
