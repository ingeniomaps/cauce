---
caso: 138
titulo: En sidecar los workflows se instalan en la raíz del workspace y el runner no los encuentra por nombre
estado: resuelto
resuelto-en: 0.89.0
prioridad: media
version-detectada: 0.87.0
---

# 138 — `Workflow({ name: "autobuild" })` no existe cuando la instancia es sidecar

**🟢 resuelto en 0.89.0** · detectado en 0.87.0 · prioridad **media** — el recorrido es invocable igual,
pero sólo si alguien descubre la ruta absoluta

## Resumen

`make install-claude` reporta que dejó los workflows al día:

```
= claude: .claude/workflows/autobuild.js ya está al día
```

y en modo sidecar los escribe en la **raíz del workspace** —`/home/manuel/Code/venotal/.claude/workflows/`—,
que es coherente con que el runner se abra ahí. Pero el runner resuelve los workflows por nombre
**relativos a su directorio de trabajo**, que es la instancia (`venotal-ops/`), y ahí no hay ningún
`.claude/`. Entonces:

```
Workflow({ name: "autobuild" })
→ Workflow "autobuild" not found. Available: deep-research
```

El único que aparece es el del propio harness. Los nueve que instaló Cauce son invisibles.

## Reproducción

1. Instancia sidecar 0.87.0; el runner se abre en la raíz del workspace y el `ops` vive en `venotal-ops/`.
2. `make install-claude` → `✓ claude: adaptador operativo (0 advertencia(s))`.
3. Invocar el recorrido por nombre. Falla con la lista de arriba.
4. `Workflow({ scriptPath: "/home/manuel/Code/venotal/.claude/workflows/autobuild.js" })` **sí corre**, y el
   recorrido completo funciona: once agentes, quince fases declaradas, `meta` aceptado.

O sea que el script es correcto y lo único que falla es el descubrimiento por nombre.

## Síntoma

`automation check` dice que el adaptador está operativo y `install` dice que los workflows están al día,
y las dos cosas son ciertas: el archivo existe y es válido. Lo que ninguna de las dos comprueba es que el
runner pueda **nombrarlo**. Quien siga la documentación —`/autobuild`, o invocarlo por su nombre— recibe
un «no existe» que sugiere que la instalación falló, y la instalación está bien.

## Fix propuesto

1. **Que `automation check` compruebe el descubrimiento, no sólo la escritura.** La pregunta que hay que
   contestar es «¿el runner ve este workflow?», y en sidecar la respuesta depende del directorio desde el
   que se abre.
2. **Que `install` imprima la ruta absoluta del script cuando el modo es sidecar**, con la forma exacta de
   invocarlo. Una línea al final del install ahorra el descubrimiento.
3. Si el runner admite ambas ubicaciones, escribir también en la instancia — pero eso duplica archivos y
   contradice OPS-005; la vía barata es la 1 y la 2.

## Tradeoffs

Comprobar el descubrimiento exige saber cómo resuelve cada runner, que es justo lo que el adaptador
abstrae. Puede alcanzar con comprobar que existe un `.claude/` en el directorio desde el que el runner se
abre, que es dato que el propio `install` ya tiene: lo imprime.

## Contexto de descubrimiento

2026-09-14, al lanzar el primer `autobuild` de esta instancia. Se resolvió pasando `scriptPath` absoluto.

## Relacionados

- **137**, **139** — misma familia: supuestos sobre el directorio desde el que se invoca, en sidecar.

## Cierre

**🟢 resuelto en 0.89.0** · `engine/automation/index.js`, `test/wiring/runners.test.js`,
`test/repo/repo.test.js`

Se tomó la **opción 2**. La **1 no se puede construir honestamente** y la **3 la descartaba el propio
caso**. Lo que se arregló es la salida: dejó de nombrar en relativo unos archivos que aterrizan en otra
carpeta.

### Contra lo que el caso enumeró

- **Opción 1, que `automation check` compruebe el descubrimiento** — se decidió que **no**, y la razón es
  que la pregunta no se puede contestar desde donde está `check`. «¿El runner ve este workflow?» depende del
  directorio en el que se abra la sesión, y eso no es un dato del repositorio: es de la sesión, que todavía
  no existe cuando `install` corre. Comprobarlo exigiría saber cómo resuelve nombres cada runner, que es lo
  que el adaptador abstrae — el propio caso lo anota como tradeoff.
- **El atajo que el caso proponía para la opción 1** —«puede alcanzar con comprobar que existe un `.claude/`
  en el directorio desde el que el runner se abre, que es dato que el propio `install` ya tiene»— **se
  midió y no sirve**: `install` **crea** ese `.claude/` ahí, por construcción. La comprobación pasaría
  siempre, incluso en el escenario exacto que originó el caso. Es un verde que no mira nada.
- **Opción 2, que `install` imprima la ruta absoluta cuando el modo es sidecar** — construida. La salida
  nombra el directorio donde quedaron los artefactos y desde dónde hay que abrir la sesión para que los
  encuentre por nombre.
- **Opción 3, escribir también en la instancia** — se decidió que **no**, por lo que el caso ya decía:
  duplica archivos y contradice OPS-005, que decide que el catálogo se resuelve desde donde vive en vez de
  copiarse, porque dos copias divergen y una se pudre sin que nada falle.
- **Tradeoff «comprobar el descubrimiento exige saber cómo resuelve cada runner»** — contestado arriba: es
  exactamente por eso que se eligió decir dónde quedó en vez de afirmar que se ve.

### Lo que el caso no preveía

- **El aviso ya existía, y cubría un archivo de once.** `install` imprimía «el runner se abre en `<raíz>` —
  ahí queda su configuración» para `settings.json`, y enseguida diez líneas
  `✓ claude: instalado .claude/workflows/<x>.js` en **relativo**, que leídas desde la instancia apuntan a una
  carpeta vacía. Y cerraba con «adaptador operativo (0 advertencia(s))». O sea que el engaño no era la falta
  de un aviso sino la convivencia de uno correcto con diez rutas que lo contradecían.
- **La línea nueva se deriva de lo instalado, no de `.claude`.** El destino sale de `path.dirname` de cada
  artefacto que el adaptador declara, así que vale igual para el runner que se agregue después y para un
  adaptador que use otra carpeta. Cablear `.claude/workflows` habría sido escribir el nombre de un runner
  dentro del motor.

### Qué se corrió

- **Reproducción real**, en banco sidecar desechable. Antes: `automation install . claude` corrido **desde
  la instancia** deja los nueve workflows en `<workspace>/.claude/workflows/`, la instancia queda con
  `.claude/` vacío, y la salida los nombra en relativo. Después: la misma invocación agrega
  `claude: <workspace>/.claude/workflows — los encuentra por nombre una sesión abierta en <workspace>`.
- **Rojo previo**: la prueba nueva falla antes del cambio, con los archivos ya instalados en su sitio — o
  sea que lo que asercia es la salida y no la escritura, que es lo que el caso separa.
- **Mutación**, en copia con verde de control 39/39: desactivar la recolección del destino mata «en sidecar
  el install dice dónde quedaron los workflows, no sólo dónde la configuración» y ninguna otra.
- **Verde**: `npm run ci` en 0 y **817 pruebas** (815 antes).
