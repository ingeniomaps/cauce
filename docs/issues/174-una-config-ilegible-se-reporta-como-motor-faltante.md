---
caso: 174
titulo: Con `ops.config.json` ilegible, `automation check` reporta que falta el motor y manda a correr npm install
estado: resuelto
resuelto-en: 0.96.0
prioridad: media
version-detectada: 0.95.0
---

# 174 — Una config ilegible se reporta como motor faltante

**🟢 resuelto en 0.96.0** · detectado en 0.95.0 · prioridad **media** — el motor está instalado, lo roto es un JSON, y
la acción que el mensaje sugiere no arregla nada

## Resumen

Con un `ops.config.json` que no parsea, `automation check` contesta:

```
✗ falta engine/hooks/run.js: corré "npm install" en la raíz del repo ops
✗ falta automatization/workflows/autobuild.js: corré "npm install" en la raíz del repo ops
```

El motor **está instalado** y `npm install` no cambia nada. Lo único roto es un archivo de una línea.

Los otros dos comandos que leen esa misma config lo dicen bien:

```
check planning   ✗ ops.config.json: JSON inválido (Unexpected end of JSON input)
contract .       ops.config.json no se pudo leer como JSON: Unexpected end of JSON input
```

## Reproducción

Verificado el 2026-09-16 sobre el paquete armado con `npm pack`, en una instancia sidecar con el paquete
un nivel arriba —el layout documentado—:

```
$ node tools/ops.js automation check .      # con la config sana
✓ automatización válida: 20 guards, 4 adaptadores

$ echo '{ "project": ' > ops.config.json
$ node tools/ops.js automation check .
✗ falta engine/hooks/run.js: corré "npm install" en la raíz del repo ops
```

Mismo estado en disco, misma instalación: lo único que cambió es que el JSON dejó de parsear.

## Causa raíz

La resolución del paquete pasa por `declaredRoot(root)`, que **lee `ops.config.json`**. Con el archivo
ilegible no hay raíz declarada, así que el candidato de arriba no se prueba y el motor no se encuentra —y
lo que `automation check` sabe decir en ese punto es «falta el archivo».

O sea que la config ilegible se propaga como una ausencia, y el comando informa el síntoma en vez de la
causa. `check` y `contract` no lo sufren porque leen la config **directamente** y tienen su propio mensaje
para el JSON roto.

## Fix propuesto

Que `automation check` distinga las dos cosas antes de buscar archivos: si la config no parsea, decirlo con
su error de JSON —como ya hacen `check` y `contract`— y no seguir. Hoy el orden es al revés.

Vale la pena mirar si la asimetría está sólo acá: cualquier comando cuya resolución dependa de
`declaredRoot` va a ver una ausencia donde hay un JSON roto.

## Tradeoffs

Ninguno visible. No cambia qué se valida; cambia cuál de dos causas se nombra, y la que hoy se nombra
sugiere una acción que no arregla nada.

## Prioridad

**Media.** No es silencioso —falla ruidosamente y con exit 1— pero es ruidoso sobre lo que no es: manda a
bajar una segunda copia del paquete, que es exactamente lo que el caso 158 existía para evitar.

## Contexto de descubrimiento

2026-09-16, en el barrido exhaustivo del paquete: 168 casos sobre toda la superficie del CLI, incluidos los
caminos de corrupción. Salió comparando lo que dicen tres comandos sobre el mismo archivo roto.

**Consultado para escribir esto**: las salidas de `check`, `contract` y `automation check` sobre la misma
instancia con la config sana y rota, aisladas una de otra; y `declaredRoot`/`packagePath` en
`engine/core/ownership.js`.

## Relacionados

- **158** y **171** — la resolución del paquete desde la raíz declarada. Acá el problema no es dónde busca
  sino qué dice cuando la raíz no se puede leer.

## Cierre

**Resuelto en 0.96.0.** `automation check` lee la configuración primero y corta ahí, reusando el mensaje que
`mode()` ya tenía —«ops.config.json no se puede leer (…)»—, que es el mismo que dan `check` y `contract`.

- **«Que distinga las dos cosas antes de buscar archivos» → se hizo**, y además **no sigue**: enumerar
  ausencias que salen de una causa ya nombrada manda a arreglar lo que no está roto.
- **«Vale la pena mirar si la asimetría está sólo acá» → se miró.** `check` y `contract` ya nombraban el
  JSON; los demás comandos que resuelven por `declaredRoot` no informan ausencias de archivos, así que no
  tienen dónde confundir la causa con el síntoma. Era el único.

### Qué se corrió

- **Rojo previo**: con la config rota, `✗ falta engine/hooks/run.js: corré "npm install"…`.
- Después: `✗ ops.config.json no se puede leer (…)`, sin nombrar `npm install` ni ninguna ausencia.
- **Mutación**: quitada la lectura previa, vuelve el mensaje viejo y la prueba a rojo.
- `npm run ci` exit 0, **911 pruebas**.
