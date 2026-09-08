---
caso: 051
titulo: Una fuente que el entorno no puede leer se consulta igual cada semana y nada lo detecta
estado: abierto
prioridad: media
version-detectada: 0.70.0
---

# 051 — El ciclo paga por fuentes ilegibles y no tiene cómo saberlo

**🔴 abierto** · detectado en 0.70.0 · prioridad **media** — gasto recurrente sin señal

## Resumen

La cadencia de un cargo sale del `tier` de su fuente más rápida, así que una sola fuente `platform` o
`project` lo pone a investigar todas las semanas. `evaluate` valida que `sources.yaml` esté bien formado
—que cada entrada tenga nombre, URL y un `tier` del vocabulario, que no haya una URL con dos nombres—
pero **no comprueba que la fuente se pueda leer**.

El resultado es que el ciclo consulta cada lunes páginas que devuelven 403, 404 o un cuerpo vacío, y lo
único que lo registra es la prosa del informe, en «Fuentes consultadas», donde nadie lo agrega. Ninguna
puerta lo mira, ningún comando lo reporta, y la cadencia sigue siendo la de una fuente que se mueve
rápido aunque haga dos meses que no se lee ni una vez.

Es distinto de una fuente que no cambió: una que no cambió se comprobó y no traía nada, y eso es un
resultado. Una que no se pudo abrir no se comprobó, y el informe sale igual.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce
npm ci

# `customer-success-manager` es semanal por una sola fuente.
node -e '
const { cadence, evaluate } = require("./engine/agents/learning-sources.js")
console.log("cadencia:", cadence(".", "customer-success-manager"))
const r = evaluate(".", "customer-success-manager")
console.log("errores:", JSON.stringify(r.errors))
console.log("avisos :", JSON.stringify(r.warnings))'

# La fuente que le da esa cadencia:
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -L \
  https://www.gainsight.com/guides/the-essential-guide-to-customer-success/
```

## Síntoma

```
cadencia: semanal
errores: []
avisos : []
HTTP 403
```

`evaluate` da el visto a un cargo que investiga cada semana contra una página que le cierra la puerta.

Otros tres, en la misma tanda del 2026-09-07 y verificados con `curl` el 2026-09-08:

| Fuente | Cargos | Estado |
|---|---|---|
| `developer.apple.com/design/human-interface-guidelines/whats-new` | ui-designer | HTTP 404 |
| `www.gainsight.com/guides/…` | customer-success-manager | HTTP 403 |
| `m3.material.io/` | ui-designer | HTTP 200, cuerpo renderizado por cliente |
| `www.iso.org/…` | analytics-engineer, cloud-architect, data-governance-steward | HTTP 403 sostenido |

El de `iso.org` lleva registrado desde el informe del 2026-08-16 y tres cargos lo reportan por separado:
`cloud-architect` cuenta seis intentos en dos corridas consecutivas.

## Causa raíz

`engine/agents/learning-sources.js`. `evaluate` recorre estructura y vocabulario —archivos requeridos,
`tier` válido, URL duplicada— y no tiene ningún paso que consulte la fuente. `cadence` (líneas 78-84)
deriva la frecuencia del `tier` declarado, que es una etiqueta escrita a mano y no una medición.

No hay causa en el sentido de un defecto de código: es una dimensión que el diseño no cubre. El commit
`bf8bdfc` («eighteen sources were tagged fast») corrigió dieciocho `tier` a mano, comprobando cada uno
contra su fuente, y dejó explícitamente los que no pudo medir. Ese trabajo no tiene hoy forma de
repetirse solo.

## Fix propuesto

Nada automático que consulte fuentes desde la puerta: `npm run ci` no debe depender de la red, y R12
manda tratar todo sistema externo como real.

Lo que sí cabe es que el ciclo registre lo que ya observa. El paso que recoge el informe puede contar
cuántas fuentes declaradas aparecen en «Fuentes consultadas» marcadas como no leídas, y anotarlo en el
resumen del job:

```diff
+  # Una fuente que no se pudo abrir no es una que no cambió: la primera no se comprobó. Sin esto la
+  # diferencia sólo vive en la prosa del informe, y la cadencia sigue siendo la de una fuente rápida
+  # que hace dos meses no se lee.
+  ilegibles="$(grep -ciE 'HTTP (403|404)|no devolvió|sin cuerpo|truncad' "$report" || true)"
+  echo "| fuentes no leídas | $ilegibles |" >> "$GITHUB_STEP_SUMMARY"
```

Con dos o tres corridas de esa cuenta se puede decidir el `tier` con evidencia en vez de a mano, que es
lo que `bf8bdfc` tuvo que hacer sin ella.

## Tradeoffs

- Contar por `grep` sobre prosa es frágil: mide menciones, no fuentes distintas, y depende de cómo cada
  cargo redacte. Sirve como señal para mirar, no como número para decidir solo.
- La alternativa —un chequeo de alcanzabilidad de verdad— mete red en el ciclo y falsos positivos por
  bloqueo temporal, y hace falta decidir qué se hace cuando falla. Es más caro y más honesto.
- Bajar el `tier` de una fuente ilegible reduce el gasto y **no la vuelve legible**: la pregunta de si
  hay que reemplazarla o retirarla queda abierta y es otra decisión.

## Contexto de descubrimiento

Midiendo por qué la tanda del 2026-09-07 corrió veinte cargos y once no propusieron ningún cambio. Los
costos salen de los logs de la corrida `34150836365`: USD 34.23 la tanda, de los cuales USD 5.33 fueron a
tres cargos cuya cadencia semanal la sostiene una fuente que no se lee.

## Relacionados

- Ninguno todavía.
