---
caso: 065
titulo: Una URL que el cargo prueba durante la investigación y nadie declaró no deja rastro en ningún inventario
estado: resuelto
resuelto-en: 0.72.0
prioridad: baja
version-detectada: 0.72.0
---

# 065 — Lo que el ciclo comprueba es lo declarado, y un cargo prueba más que eso

**🟢 resuelto en 0.72.0** · detectado en 0.72.0 · prioridad **baja** — la forma ya existía en cinco
cargos, sin documentar y sin que nadie la mirara

## Resumen

El chequeo semanal comprueba las URLs que el catálogo **declara**: `sources.yaml`, `references/` y
`SKILL.md`. Durante una investigación el cargo prueba además URLs derivadas —un `whats-new`, un
changelog, la página de una release, el PDF de una norma— y cuando ésas fallan lo escribe en su informe
y ahí se queda: no están declaradas, así que ningún inventario las mira y nadie las arregla.

Esta dimensión la enumeraron tres casos —el [060](060-una-fuente-que-responde-200-y-no-trae-nada-legible.md),
el [063](063-el-catalogo-cita-las-normas-en-un-dominio-que-lo-bloquea.md) y el
[064](064-las-url-de-references-no-las-comprueba-nadie.md)— y los tres la dejaron declarada con lo que la
activaría: «que un informe vuelva a reportar un 404 sobre una URL derivada y eso cueste algo». **Se
cumplió**, así que sale como unidad propia en vez de repetirse en un cuarto cierre.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

node -e '
const fs = require("fs"), path = require("path")
const { documentUrls, sourceUrls } = require("./engine/agents/learning-sources.js")
const base = "agents/roles/system"
for (const slug of fs.readdirSync(base)) {
  const dir = path.join(base, slug)
  const declaradas = new Set()
  const sf = path.join(dir, "learning/sources.yaml")
  if (fs.existsSync(sf)) for (const o of sourceUrls(fs.readFileSync(sf, "utf8"))) declaradas.add(o.url.replace(/\/+$/, ""))
  for (const o of documentUrls(dir)) declaradas.add(o.url.replace(/\/+$/, ""))
  const rd = path.join(dir, "learning/reports")
  if (!fs.existsSync(rd)) continue
  for (const f of fs.readdirSync(rd)) {
    for (const linea of fs.readFileSync(path.join(rd, f), "utf8").split("\n")) {
      if (!/\b404\b/.test(linea)) continue
      for (const u of linea.match(/https?:\/\/[^\s)>"`\]]+/g) || []) {
        const limpia = u.replace(/[.,;:]+$/, "").replace(/\/+$/, "")
        if (!declaradas.has(limpia)) console.log(`${slug}/${f}: ${limpia}`)
      }
    }
  }
}'
```

## Síntoma

Medido el 2026-09-09 sobre el catálogo entero:

```
mobile-engineer/2026-09-07.md: https://source.android.com/docs/security/bulletin/2026/2026-09-01
qa-engineer/2026-08-22.md:     https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf
ui-designer/2026-09-07.md:     https://developer.apple.com/design/human-interface-guidelines/whats-new
```

Tres cargos, dos de ellos la semana pasada. Ninguna aparece en ningún resumen de job ni en ningún
inventario: viven en la prosa del informe que las reportó.

## Causa raíz

No es un defecto de código sino un límite del alcance, y está escrito en el propio chequeo: mira
`sourceUrls` y `documentUrls`, o sea el contrato del cargo. Una URL que el cargo probó por su cuenta es
un hecho **de esa corrida**, no del contrato, así que no tiene dónde vivir.

Por eso los tres casos anteriores lo dejaron afuera y no fue un descuido: cubrirlo pide decidir dónde se
anota algo que hoy no tiene lugar, y esa decisión no le tocaba a ninguno de ellos.

## Fix propuesto

Ninguno cerrado. Las vías que se ven, de menos a más maquinaria:

- **Contarlas en el resumen del job.** El paso que recoge el informe ya lo tiene en la mano: un
  `grep` de `404` sobre el informe daría el número. Barato, y mide menciones, no URLs — depende de cómo
  redacte cada cargo, que es justo lo que el chequeo de alcanzabilidad evitó a propósito.
- **Un campo del frontmatter**, como `propone`: el cargo enumera las URLs derivadas que no pudo abrir.
  Lo vuelve un dato en vez de prosa, con el modo de fallo conocido de depender del modelo.
- **Promoverlas al contrato**: si una URL derivada se prueba todas las semanas, es una fuente y le toca
  estar en `sources.yaml`. No cubre la que se probó una vez.

La segunda es la que el 060 prefería para su propio problema y terminó no necesitando; acá sí aplica,
porque no hay umbral que medir sino una lista que sólo el cargo conoce.

## Tradeoffs

- **Anotar todo lo que un cargo probó y falló puede ser ruido.** Una URL derivada que falla una vez y no
  se vuelve a usar no le cuesta nada a nadie; lo que cuesta es la que se sigue probando cada semana.
  Ninguna de las tres vías distingue las dos hoy.
- **Mover el juicio al modelo**, en la segunda vía, es lo que el chequeo de alcanzabilidad evitó
  deliberadamente. Acá el argumento es distinto —no hay nada objetivo que medir— pero el modo de fallo
  es el mismo.
- **No medido cuánto cuesta**: son tres URLs en seis semanas de informes. Puede que la respuesta
  correcta sea no hacer nada y volver a mirar el número en un mes.

## Contexto de descubrimiento

Validando, uno por uno, que los dieciséis casos cerrados en la sesión del 2026-09-09 no dejaran huecos.
El barrido de los cierres mostró esta dimensión diferida tres veces, y medir su propia condición de
activación mostró que ya se había cumplido.

## Relacionados

- [060](060-una-fuente-que-responde-200-y-no-trae-nada-legible.md) — la enumeró primero.
- [064](064-las-url-de-references-no-las-comprueba-nadie.md) — amplió el chequeo a lo declarado y dejó
  esto explícitamente afuera.

## Cierre

**Resuelto en 0.72.0**, y el caso se cierra distinto de como se enunció porque medirlo lo corrigió dos
veces.

- **La primera medición estaba contaminada y se rehizo.** Comparaba los informes contra el contrato de
  **hoy**, así que contaba como «no declarada» cualquier fuente que el 063 hubiera reemplazado desde
  entonces: daba 43 URLs y 18 recurrentes. Comparando contra todo lo que cada cargo declaró alguna vez
  —`git log -p` sobre su `sources.yaml`— quedan **23 URLs y sólo 3 recurrentes**. El número del
  enunciado, «tres 404», era la punta de otro conteo.
- **Y con ese número, la vía que el caso prefería no era la correcta.** Enumeraba tres —contar en el
  resumen, un campo del frontmatter, promoverlas al contrato— y decía que la segunda era la que aplicaba
  «porque no hay nada objetivo que medir». Ninguna hacía falta: **cinco cargos ya habían inventado la
  forma** —`data-governance-steward`, `tech-lead`, `integrations-engineer`,
  `logistics-operations-manager` y `treasury-analyst` la escribían como comentario en su propio
  archivo—. Lo que faltaba no era inventar un mecanismo sino darle esquema al que ya existía y hacer que
  alguien lo mirara.
- **`url` quedó opcional, y eso salió de los datos.** La mitad de esas trece entradas están pendientes
  **porque no hay ninguna URL que responda** —ISO/IEC/IEEE 24765, la ley federal mexicana, ASCM SCOR
  DS—. Exigirla habría dejado fuera justo las que más cuesta resolver, que es lo contrario de lo que el
  caso pedía.
- **El chequeo reporta sólo lo que volvió a servir.** Una pendiente que sigue cerrada es lo esperado, y
  anunciarla cada semana sería el aviso permanente que el 060 ya había identificado como el que enseña a
  ignorar el resto.
- **Tradeoff «anotar todo lo que falló puede ser ruido» — no se pagó**, por lo anterior: el silencio es
  el caso normal. Lo que sí sigue sin distinguirse es la pendiente que se prueba cada semana de la que se
  probó una vez; `since` deja verlo a mano y nada lo calcula.
- **Tradeoff «mover el juicio al modelo» — no se pagó tampoco**, porque no se tomó esa vía: la lista la
  escribe quien mantiene el cargo y el chequeo es objetivo.
- **Tradeoff «no medido cuánto cuesta» — medido**, y es lo que cambió el diseño: 3 recurrencias en seis
  semanas no justifican maquinaria nueva, y por eso lo que se hizo fue dar forma a lo que ya se escribía.

**Lo que apareció y el enunciado no preveía, y es lo más importante de este cierre: la primera versión
del chequeo produjo un falso positivo, y era mío.** Con el umbral de 50 palabras heredado del 060, dio
por recuperada `standards.ieee.org/ieee/1028/4266/` — 652 palabras de navegación, título genérico del
sitio y la cadena «1028» **cero veces**, que es exactamente el impedimento que `tech-lead` había anotado.
El umbral separa una ficha de catálogo de una cáscara y no separa una ficha del armazón de un sitio
grande. Se agregó pedir la **marca del documento** —el primer token con dígito del nombre— y con eso la
ficha de IEEE vuelve a no anunciarse, que es lo correcto.

Se encontró por no creerle al propio verde: de las tres «recuperadas» de la primera corrida, dos eran
URLs que yo mismo había puesto sabiendo que respondían y sólo demostraban la plomería. La única
independiente era la falsa.

**Probado con el paso ejecutado de verdad** sobre los cinco cargos que tienen pendientes:

```
data-governance-steward       ISO 8000-61  → committee.iso.org/standard/63086.html · ya se puede declarar
logistics-operations-manager  ISO 10002    → committee.iso.org/standard/71580.html · ya se puede declarar
tech-lead                     (nada)       ← la ficha de IEEE 1028 sigue siendo una cáscara
integrations-engineer         (nada)
treasury-analyst              (nada)
```

Cuatro mutaciones comprobadas: quitar la marca del documento, quitar el umbral, quitar el chequeo
entero, y dejar de cortar `sources:` en `pending:`. Las cuatro ponen su prueba en rojo. La última cuida
lo que no se ve: sin ese corte, una pendiente entra como fuente declarada y se reporta rota **todas las
semanas**, que es el aviso permanente que esta lista existe para no producir.

**Dos dependientes se rompieron al agregar la forma y hubo que arreglarlos**: las dos pruebas del
catálogo que cuentan fuentes con su propio lector empezaron a leer las pendientes como fuentes. Se
corrigieron transcribiendo el corte en cada una, no reusando el del motor — si las dos cuentas salieran
del mismo código, la prueba no comprobaría nada.
