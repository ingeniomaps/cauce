---
caso: 051
titulo: Una fuente que el entorno no puede leer se consulta igual cada semana y nada lo detecta
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.70.0
---

# 051 — El ciclo paga por fuentes ilegibles y no tiene cómo saberlo

**🟢 resuelto en 0.71.0** · detectado en 0.70.0 · prioridad **media** — gasto recurrente sin señal

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
| `www.gainsight.com/guides/…` | customer-success-manager | ~~HTTP 403~~ → **200**, ver el Cierre |
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

## Cierre

**Resuelto en 0.71.0, y a medias a propósito.** El recorrido de lo que enumeró:

- **No se hizo el fix propuesto sino el que este caso descartaba, y la razón es que el argumento para
  descartarlo era falso.** El caso decía que un chequeo de alcanzabilidad «mete red en el ciclo». No la
  mete: el ciclo **ya sale a la red** —investigar es leer esas mismas fuentes—, así que lo único que
  agrega es un pedido más por fuente. Lo que sí se evitó es el `grep` que este caso proponía, y por la
  razón que él mismo escribió: medía menciones, no fuentes, y dependía de cómo redactara cada cargo.
- **Tradeoff «contar por grep es frágil» — no se paga, porque no se contó por grep.** El dato sale del
  código de respuesta, que es el mismo para todos los cargos.
- **Tradeoff «la alternativa mete falsos positivos» — se paga, y se acota.** Un 403 de una semana puede
  ser un bloqueo temporal, así que el paso **avisa y no falla**: lo que decide un `tier` es el patrón
  sostenido, y fallar la corrida tiraría la investigación por algo que no la invalida.
- **Tradeoff «bajar el tier no vuelve legible la fuente» — sigue cierto y sin cambios.** Reemplazar o
  retirar una fuente ilegible sigue siendo otra decisión.
- **La mitad del síntoma que este arreglo NO cubre sale como caso propio, el 060.** El chequeo mira el
  código de respuesta, así que atrapa un 403 y da por buena una página que contesta 200 con una cáscara
  vacía. Corrido de verdad sobre `ui-designer`, sus cuatro fuentes dan alcanzables mientras sus informes
  dicen desde hace semanas que no puede leer dos.
- **Y la tabla del síntoma de este caso tenía dos errores, que el arreglo destapó al correrse de verdad.**
  El chequeo mira **las fuentes declaradas** en `sources.yaml`, y el `whats-new` de Apple no lo declara
  ningún cargo: era una URL que el agente probó por su cuenta durante la investigación, así que ni antes
  ni ahora entra en ningún inventario. Y el **403 de Gainsight era artefacto del `User-Agent`**: con el
  `Mozilla/5.0` a secas que se usó al escribir la tabla devuelve 403, y con el de este chequeo o con uno
  de navegador completo devuelve **200**. Se tacha en la tabla en vez de borrarse, porque el dato viajó a
  una decisión —ver abajo— y borrarlo escondería de dónde salió.
- **Esa corrección alcanza a una decisión ya tomada, y hay que decirlo.** El commit `96786bc` bajó a
  mensual la cadencia de `customer-success-manager` citando dos razones: que la guía de Gainsight no
  publica fechas de revisión —de `bf8bdfc`, y sigue en pie— y ese 403, que era falso. La decisión se
  sostiene por la primera; el segundo dato no debió haberse usado.
- **La dependencia del `User-Agent` queda como limitación del chequeo, no como defecto.** Un sitio puede
  contestar 403 a lo que parece un bot, así que el código depende de con qué se pregunta. Lo que se mide
  es si **este** ciclo puede abrir la fuente, que es la pregunta que importa; lo que no se puede concluir
  de un 403 es que la fuente esté caída. Por eso avisa y no falla.

**Probado con el paso ejecutado de verdad, no sólo con la suite**, contra las fuentes reales del catálogo:

```
cloud-architect  | fuentes declaradas | 6 |  no alcanzables | 2 |  iso.org → 403 (×2)
mlops-engineer   | fuentes declaradas | 6 |  no alcanzables | 2 |  iso.org → 403 (×2)
ui-designer      | fuentes declaradas | 4 |  (ninguna)
```

Lo que el caso no preveía y apareció al arreglarlo: **el lector de fuentes era ciego para uno de los dos
formatos del catálogo.** `sourceUrls` sólo entendía la entrada repartida en varias líneas, así que en los
seis cargos que la escriben en una sola veía **cero fuentes** — `mlops-engineer` declaraba seis y se leían
cero. Eso no era cosmético: de ahí sale la validación de URL duplicada, que es un **error** de `check`, y
esos seis nunca la tuvieron. No fallaba nada porque no encontrar duplicados y no mirar producen el mismo
silencio. Se arregló acá porque el chequeo nuevo lo necesitaba, y con la prueba que recorre el catálogo
entero: 299 fuentes declaradas, 299 leídas.
