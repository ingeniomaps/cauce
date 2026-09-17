---
caso: 172
titulo: Los subcomandos de `flow` ignoran la raíz que se les pasa y corren contra el directorio actual
estado: resuelto
resuelto-en: 0.96.0
prioridad: media
version-detectada: 0.95.0
---

# 172 — `flow` ignora la raíz que le pasan

**🟢 resuelto en 0.96.0** · detectado en 0.95.0 · prioridad **media** — el argumento parece aceptado, se descarta, y
el comando contesta sobre otra instancia sin decirlo

## Resumen

Todos los comandos que leen una instancia toman su raíz como posicional —`check <planning>`,
`contract <ops-root>`, `agents list [ops-root]`—. **`flow` no**: resuelve por `opsRoot()`, que sale de
`OPS_ROOT` o del directorio actual, y lo que se le pase se descarta en silencio.

`ops flow list /otra/instancia` contesta sobre el directorio en el que estás parado.

## Reproducción

Con dos instancias, `A` con recorridos resolubles y `B` sin ellos, parado en `A`:

```
$ node tools/ops.js flow list /ruta/a/B
change-review
defect-triage
…
```

Son los recorridos de **A**. Verificado el 2026-09-16: lo destapó una prueba que le pasaba el target y
medía el cwd del proceso de prueba, con el verde puesto.

## Causa raíz

`engine/cli/catalog.js`, `function flow(action, slug, cli)`: la firma toma `action` y `slug`, y la raíz la
resuelve adentro con `opsRoot()`. El despacho de `ops.js` le pasa `arg[1]` y `arg[2]`, así que un tercer
posicional no tiene dónde entrar.

No es que `flow` deba tomar raíz por fuerza —`opsRoot()` es una resolución legítima—: lo que no puede es
**aceptar un argumento que descarta**. Es la misma forma que el `-h` que el 0.95.0 arregló: algo que se
escribe, no falla, y contesta sobre otra cosa.

## Fix propuesto

Dos salidas y no es obvio cuál:

1. **Que `flow` tome la raíz como posicional**, igual que sus hermanos: `ops flow list [ops-root]`. Lo
   uniforma y es lo que alguien espera después de usar `agents list [ops-root]`.
2. **Que rechace el posicional de más**, como ya hace el CLI con una bandera desconocida. Más barato y deja
   `opsRoot()` como la única vía.

La 1 parece mejor por simetría, pero cambia una firma pública; la 2 no cambia nada y cierra el hueco. La
decisión es de producto: si `flow` es un comando de instancia como los demás o uno que sólo corre desde
adentro.

## Prioridad

**Media.** No corrompe nada y no deja pasar nada: contesta sobre la instancia equivocada. Lo que lo sube de
baja es que la respuesta se lee perfectamente bien —una lista de recorridos es una lista de recorridos— y
nada dice que salió de otro lado.

## Contexto de descubrimiento

2026-09-16, arreglando el caso 171. La prueba nueva le pasaba el target a `flow list` y quedaba en rojo
sobre un arreglo que sí funcionaba: el comando estaba midiendo el cwd. Sale como caso propio porque no le
tocaba al 171 y porque la salida elegida cambia una firma.

**Consultado para escribir esto**: `engine/cli/catalog.js` (`flow`), `engine/cli/ops.js` (línea 239, el
despacho) y `engine/cli/io.js` (`opsRoot`).

## Relacionados

- **171** — el caso del que sale.

## Cierre

**Resuelto en 0.96.0, por la salida 1: `flow` toma la raíz.**

- **«Que `flow` tome la raíz como posicional» → se hizo.** `ops flow list [ops-root]`,
  `ops flow check <flow> [ops-root]` y `ops flow show <flow> [ops-root]`: `list` no lleva recorrido, así que
  la suya es el primer posicional, y las otras dos la llevan después —la misma forma que
  `agents fork <cargo> [ops-root]`—. El uso lo anuncia.
- **«Que rechace el posicional de más» → no se tomó**, y la razón es que la 1 no rompe nada: hoy ese
  argumento se ignora, así que aceptarlo no invalida ninguna invocación que ya funcione. La 2 habría
  dejado a `flow` como el único comando que no se puede apuntar a otra instancia.

### Qué se corrió

- **Rojo previo**: desde un directorio que no es instancia, `flow list <raíz>` no listaba nada.
- Después: `list`, `check` y `show` contestan sobre la raíz que reciben, comprobado desde afuera de ella.
- **Mutación**: el despacho volviendo a descartar el posicional deja la prueba en rojo.
- `npm run ci` exit 0, **911 pruebas**.
