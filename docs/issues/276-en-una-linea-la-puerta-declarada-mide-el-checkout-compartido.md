---
caso: 276
titulo: en una línea la puerta declarada mide el checkout compartido
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 276 — Dentro de una línea, Verify corre la puerta de la raíz sobre un código que no tiene la tarea

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: el verde es verdadero y no dice nada de la entrega. No llegó a publicarse: nació con el
274, en la misma versión sin salir.

## Resumen

Desde el 274, en una línea la tarea se construye en un árbol propio. La puerta que declara la raíz
—`verify` en `workspaceRoots`— nombra al servicio por su ruta dentro de la raíz, y en una línea esa ruta es
el enlace al checkout que comparten todas, parado en `main`. Corrida «tal cual y desde esa raíz», que es lo
que Verify pedía, pasa sobre el código de antes.

## Reproducción

Banco sidecar con `workspaceRoots: [{ path: '..', verify: 'npm --prefix app test' }]`, dos líneas armadas con
`ops line` y una sesión real con `/autobuild` en cada una. Al cerrar, en la carpeta de la línea:

```bash
npm --prefix app test
```

## Síntoma

Las dos sesiones lo reportaron por su cuenta al terminar. Una de ellas:

```
El gate declarado no ejercita esta entrega. npm --prefix app test da verde con 1 prueba y ninguna de la
tarea, porque app apunta al checkout en main, que no tiene baja.js.
```

## Causa raíz

`automatization/workflows/autobuild.js`, el pedido de Verify: con puertas declaradas dice «corré la de la raíz
que contiene ese servicio, tal cual y desde esa raíz». El 274 le agregó dónde está el trabajo, y las dos
instrucciones se contradicen: el comando declarado lleva escrita la otra ruta.

El guard de commit no tiene el defecto: corre sobre el índice del repositorio donde se commitea, que es el
árbol de la tarea. `ops evidence` de las dos corridas registra ahí `test (exit 0)`.

## Fix propuesto

Que en un árbol de tarea Verify corra el mismo comando con la ruta del servicio cambiada por la del árbol, y
reporte el comando como lo corrió.

## Tradeoffs

- La sustitución la hace quien verifica, leyendo el comando: una puerta que no nombre al servicio por su
  ruta —un `make ci` en la raíz que recorre todo— no tiene qué cambiar. No se midió con una así.

## Contexto de descubrimiento

La primera corrida real con dos líneas a la vez, la que cerró el 274.

## Relacionados

- 274 — en una línea, cada tarea en su árbol.
- 263 — la raíz que contiene a los repositorios.

## Cierre

**Resuelto en 0.101.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** Fuera de una línea la puerta corre tal cual, como antes.
- **Tradeoff, la puerta que no nombra al servicio — queda dicho y sin medir.** Lo cierra una corrida en una
  línea cuya raíz declare una puerta así; no se abrió caso porque no hay todavía un síntoma que registrar.

### Qué se corrió

- **Una corrida real en la misma línea, con el motor arreglado.** Lo que Verify devolvió como comando:
  `npm --prefix <línea>/app-reactivar-usuario test`, exit 0, con la nota «puerta declarada corrida con la
  ruta del servicio cambiada por el árbol de trabajo: 3 pruebas, 1 previa y 2 de la tarea». Antes eran una
  prueba y ninguna de la tarea.
- **La prueba nueva vista en rojo** sin la instrucción, y la que comprueba que fuera de una línea no aparece,
  en rojo al darla siempre.
- **La puerta entera**, `npm run ci`.
