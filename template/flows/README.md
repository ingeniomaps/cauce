# Recorridos

Un recorrido es **un flujo con su reparto por defecto**: las etapas, sus gates y lo que produce cada una
—el flujo—, y qué cargo ocupa cada puesto —el reparto—. Los dos viven en el mismo `flow.json` porque
se leen juntos, y conviene saber que son dos cosas: cambiar quién ocupa un puesto no cambia el
recorrido, y llevar el mismo recorrido a otra empresa suele cambiar sólo el reparto.

Es lo que convierte una intención en una épica candidata —o en la razón por la que todavía no lo es—
sin que un solo agente decida por todos.

## Los que trae Cauce

| Recorrido | Descubrimiento | Deja | Para qué |
|---|---|---|---|
| `system/intake` | 4 etapas | informe | ¿hay una intención acá? Convierte lo que alguien dijo en algo que otro recorrido pueda tomar. |
| `system/feasibility-review` | 3 etapas | épica | ¿vale el esfuerzo? Con la evidencia que ya existe. |
| `system/product-development` | 5 etapas | épica | ¿qué construimos y cómo? Produce evidencia nueva. |
| `system/incident-review` | 4 etapas | informe | ¿qué pasó y qué aprendemos? Después de contener. |
| `system/defect-triage` | 4 etapas | informe | ¿qué falla, a quiénes y qué hacemos? Con el defecto vivo. |
| `system/technical-design` | 6 etapas | informe | ¿cómo se construye lo ya decidido? Cada disciplina en paralelo. |
| `system/change-review` | 6 etapas | informe | ¿se puede entregar lo ya construido? Cada disciplina revisa lo suyo y firma quien responde. |

Son seis **formas**, no seis dominios. Un recorrido de seguridad o uno de crecimiento tienen la misma forma
con otros cargos: eso lo escribe cada empresa, porque cómo decide es suyo.

## Escribir uno propio

Copiar la estructura de [000-template.md](000-template.md) a `flows/<slug>/`, con su `flow.json` y su
`FLOW.md`, y validar:

```bash
node tools/ops.js flow list
node tools/ops.js flow check <slug>
node tools/ops.js flow show <slug>
```

Un recorrido propio con el mismo slug que uno de `system/` lo reemplaza; con otro slug, convive. **Nunca
editar dentro de `system/`**: se reemplaza completo en cada actualización.

## Invocar un recorrido

Tres formas, de la más simple a la más explícita:

```text
/flow quiero cobrar con tarjeta guardada
/flow incident-review: se cayó el checkout el martes a las 14:00
/flow {"flow": "acme-soporte", "intent": "qué se quiere evaluar"}
```

Sin prefijo corre `product-development`. El prefijo se confirma contra los recorridos que existen: si no
es uno, el texto completo se toma como intención, así que escribir `nota: revisar esto` no dispara un
recorrido llamado `nota`. Con el recorrido pasado explícitamente, un slug inexistente falla en vez de caer al
por defecto en silencio.

## Corto o largo

Un recorrido largo cuesta más y aporta más certeza. La elección es la misma que con los lanes de una
tarea: usar el corto cuando la evidencia ya existe y la pregunta es de esfuerzo, y el largo cuando hay
que averiguar algo antes de comprometerse.

Un recorrido corto que termina en "hay que investigar" no falló: acotó el problema por el costo de tres
etapas en lugar de cinco.

## Lo que un recorrido nunca hace

Ningún recorrido promueve trabajo al BACKLOG. Escribe la épica candidata en `planning/roadmap/` y para;
la promoción es la firma humana que autoriza ejecución. Un gate que no se cumple se convierte en una
acción concreta en `planning/HUMAN_ACTIONS.md`, no en un gate más blando.
