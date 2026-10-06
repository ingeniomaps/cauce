---
caso: 288
titulo: escribir en el scratchpad de la sesión se frena por estar fuera de las raíces
estado: resuelto
resuelto-en: 0.104.0
prioridad: media
version-detectada: 0.103.0
---

# 288 — Un agente no puede escribir una sonda en el scratchpad que el runner le dio para eso

**🟢 resuelto en 0.104.0** · detectado en 0.103.0 · prioridad **media**.

**Prioridad media**: no rompe nada: el agente escribe el mismo archivo en otro lado, dentro del producto, que es peor lugar para un archivo de paso.

## Resumen

Claude Code le da a cada sesión un directorio de paso y lo manda en cada llamada como `scratchpad_dir`. Queda
bajo el temporal del sistema, fuera de las raíces que la instancia declara, así que `workspace-boundary` frena
toda escritura ahí.

## Reproducción

Instancia con raíces declaradas. Pasándole al hook un `Write` cuya ruta cuelga del `scratchpad_dir` de la
misma entrada.

## Síntoma

```
BLOQUEADO: <scratchpad>/scan.mjs está fuera de las raíces declaradas en ops.config.json. Si el proyecto
necesita escribir ahí, declaralo en writableOutsideRoots […]
```

En una instancia real: 14 de 44 frenos, todos archivos de paso —scripts de una mutación, sondas, un parche,
las filas de una tabla—. La instancia lo resolvió declarando la carpeta a mano en `ops.config.local.json`.

## Causa raíz

`engine/hooks/input.js`, `writableRoots`: la lista sale de `ops.config.json` y no conoce el scratchpad de la
sesión, que cambia con cada una.

## Fix propuesto

Contar el `scratchpad_dir` de la entrada como escribible, para los dos guards de límites.

## Tradeoffs

- El dato llega en la entrada del hook. Una ruta que no sea desechable no tiene que volverse escribible por
  venir ahí.
- Sólo Claude Code lo manda. En los demás runners no cambia nada.

## Contexto de descubrimiento

El mismo relevamiento del 287.

## Relacionados

- 269 — el archivo de plan del runner no es una escritura fuera de las raíces.
- 261 — una copia desechable armada con `mktemp`.

## Cierre

**Resuelto en 0.104.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, en `writableRoots`, que es de donde preguntan los dos guards.
- **Tradeoff, una ruta que no es desechable — se atendió.** Vale sólo si cuelga del temporal del sistema: el
  home, la raíz y el temporal entero declarados como scratchpad no abren nada.
- **Tradeoff, sólo Claude Code — se paga.**

### Qué se corrió

- **La reproducción, antes y después**, contra el guard: el `Write` en el scratchpad de la sesión salía con 2
  y ahora con 0; el mismo `Write` fuera de él sigue saliendo con 2.
- **Tres mutaciones en rojo**, en una copia: el scratchpad sin contar, cualquier ruta declarada valiendo, y el
  temporal entero valiendo.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una sesión real escribiendo en su scratchpad con el guard instalado.
