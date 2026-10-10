---
caso: 358
titulo: ops line arma la línea sin decir que el producto quedó vacío
estado: resuelto
resuelto-en: 0.106.0
prioridad: baja
version-detectada: 0.105.0
---

# 358 — Con el producto anidado y registrado como enlace de git, `ops line` arma la línea, contesta `✓` y no dice que la carpeta del producto quedó vacía

**🟢 resuelto en 0.106.0** · detectado en 0.105.0 · prioridad **baja**.

**Prioridad baja**: `check` ya lo avisa desde el 352, antes y después de armar la línea. Vale arreglarlo
porque el aviso llega en otro comando y el momento en que sirve es éste: quien arma la línea sin haber
corrido `check` recibe un `✓` sobre una línea que no tiene producto.

## Resumen

El caso 352 dejó dos partes. La primera, que `check` avise, se hizo. La segunda, que `ops line` se niegue a
armar una línea sin producto, quedó propuesta dentro del caso cerrado, «a la espera de una instancia real
con esa disposición». Este caso es esa segunda parte, sacada de ahí para que no quede en un caso que nadie
va a volver a leer, y más chica: decirlo, sin negarse.

## Reproducción

Instancia sidecar con el producto en `app/`, adentro de la instancia y con su propio repositorio, y
`workspaceRoots: [{ name: app, path: app }]`. Un `git add` que incluya `app` lo registra como enlace.

```bash
git ls-files -s app            # 160000 … app
node tools/ops.js line . auth
ls -la ../<carpeta>-auth/ops/app
```

## Síntoma

Corrido el 2026-10-09, sobre el commit `d97a321f`:

```
$ node tools/ops.js line . auth
✓ …/cabo2-auth/ops  (line/auth)
  runners: (ninguno instalado en la instancia)
Abrí la sesión de esta línea en …/cabo2-auth: ahí está su configuración, apuntando a su árbol.

$ ls -la …/cabo2-auth/ops/app
total 8                        # vacía
```

Y desde la línea, el repositorio del servicio `app` resuelve al de la instancia —`reposFor` devuelve
`…/cabo2-auth/ops`—, que es el defecto del 352. `check` lo avisa en el árbol principal y en la línea;
`ops line` no dice nada y sale con código 0.

## Causa raíz

- `engine/cli/lines.js`, `line` — enlaza al original lo que falta en la línea. La carpeta del enlace de git
  existe —vacía—, así que no la enlaza, y no comprueba qué quedó adentro.
- `engine/core/repos.js`, `nestedRootWarnings` — tiene ya la respuesta, y sólo la llama `check`.

## Fix propuesto

Que `ops line` imprima, después del `✓`, el mismo aviso que `check` para cada raíz declarada que quedó como
enlace de git: es `nestedRootWarnings`, sin lógica nueva. No se niega.

## Valor

Bajo: una línea más de salida en el momento en que alguien todavía puede corregirlo, antes de abrir una
sesión que va a construir en el repositorio equivocado.

## Qué podría salir mal

1. **Negarse frenaría a quien hoy tiene esa disposición y le funciona a medias.** Es la razón por la que el
   352 no lo construyó, y sigue sin conocerse una instancia así. Por eso la propuesta es avisar.
2. **Un aviso que nadie lee.** Es el mismo límite que el de `check`. Si aparece una instancia real con esta
   disposición, la negativa se decide ahí, con ese dato.

## Cierre

**Resuelto en 0.106.0** con el fix propuesto: avisa, no se niega.

### El recorrido de lo que este caso enumeró

- **Fix, que `ops line` imprima el aviso de `check` — se hizo.** Es `nestedRootWarnings`, sin lógica nueva;
  sale después del `✓` y en `--json` como `warnings`.
- **Qué podría salir mal 1, negarse — no se hizo, y es la decisión.** La línea se arma igual, con código 0.
  La negativa sigue esperando lo mismo que en el 352: una instancia real con esa disposición.
- **2, un aviso que nadie lee — sigue siendo el límite**, y es el mismo que el de `check`.

### Qué se corrió

- **La reproducción del caso**, sobre una instancia con el producto anidado, con el arreglo:

  ```
  $ node tools/ops.js line . auth
  ✓ …/cabo2-auth/ops  (line/auth)
    runners: (ninguno instalado en la instancia)
  Abrí la sesión de esta línea en …/cabo2-auth: ahí está su configuración, apuntando a su árbol.
  ⚠ workspaceRoots: app es un repositorio que el de la instancia registra como enlace de git, así que
  en una línea de trabajo esa carpeta queda vacía. Desde la raíz del repositorio, sacalo del índice
  —git rm --cached "app"— e ignoralo, o movelo afuera
  ```

- Rojo previo: la prueba nueva de `test/wiring/lines.test.js`, antes del cambio. Fija también que sin nada
  anidado no se avisa.
- Dos mutaciones, cada una en rojo: sin pedir el aviso, y sin imprimirlo en la salida de texto.

No tuvo revisión independiente: es una llamada a una función que ya tenía sus pruebas.

## Contexto de descubrimiento

Quedó como propuesta sin construir en el cierre del 352. Reproducido el 2026-10-09 para decidir si
ameritaba caso propio.

## Relacionados

- **352** — el defecto, el aviso de `check` y la propuesta de la que sale este caso.
