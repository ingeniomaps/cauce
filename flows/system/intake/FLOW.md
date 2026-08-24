# Intake

## Cómo activarlo

Usar este equipo cuando **alguien dijo algo y todavía no hay una intención**: un mensaje de un cliente,
un comentario en una reunión, un pedido de otro equipo. Lo que sale de acá es lo que los demás
recorridos dan por hecho que ya existe.

```text
Usa el recorrido intake para esto que nos llegó:
<lo que se dijo, tal como se dijo, y de quién viene>
```

## Por qué existe

`feasibility-review` arranca pidiendo «qué se quiere lograr, para quién, y qué evidencia ya tenemos»,
y su primera etapa exige que el problema y el outcome estén explícitos. Cuando nadie hizo ese trabajo,
esa etapa lo inventa: encuadra sobre un pedido que nunca se separó de su solución, y el recorrido
entero decide sobre una intención que alguien improvisó en el camino.

Este equipo hace ese trabajo a propósito y con dueños, en vez de que ocurra sin que nadie lo note.

## La forma del recorrido

```text
                        ┌─ separate (user-researcher) ─┐
capture (product-manager)┤                             ├─→ route (product-manager)
                        └─ evidence (data-analyst)    ─┘
```

`separate` y `evidence` dependen de lo capturado y **de nada más entre sí**: una lee el pedido para
encontrar el problema detrás, la otra busca qué se sabe ya. Si la segunda esperara a la primera,
buscaría evidencia del problema ya interpretado y perdería la del pedido literal, que es donde suele
estar el dato que contradice la interpretación.

## Lo que este equipo no hace

- **No decide si vale.** Eso es `feasibility-review`, con más evidencia y con sus dueños de decisión.
  Adelantarlo acá es decidir con menos y sin quien firma.
- **No diseña ni estima.** Una intención con la solución adentro llega al recorrido siguiente con la
  respuesta ya elegida, y lo que sigue deja de poder cuestionarla.
- **No reescribe el pedido.** Se conserva literal y la interpretación va aparte, para que el próximo
  pueda discutir la lectura sin perder lo que se dijo.
- **No le responde a quien pidió.** Qué se le contesta y quién lo hace es una decisión humana; de acá
  no sale ningún compromiso.

## «Nada que hacer» es un resultado

Un pedido puede no tener intención detrás: ya está resuelto, es un defecto y va a `defect-triage`,
corresponde a soporte, o no hay problema que valga la pena nombrar. Ese destino se entrega con su
razón escrita, igual que cualquier otro. Un intake que siempre produce una intención no está
escuchando, está fabricando trabajo.

## Agentes condicionales

| agente | cuándo |
|---|---|
| `customer-support-specialist` | el pedido viene de un ticket y hace falta el caso original sin interpretar |
| `sales-representative` | viene de una oportunidad y hay que separar la necesidad del argumento de venta |
| `business-strategist` | el pedido toca dónde compite la empresa y no sólo qué construye |
