---
caso: 043
titulo: la cabecera de `HUMAN_ACTIONS.md` sólo se saltea si la primera celda dice exactamente `Tarea`
estado: abierto
prioridad: baja
version-detectada: 0.66.0
---

# 043 — La fila de encabezado se lee como dato y `check` la reporta como una acción rota

**🔴 abierto** · detectado en 0.66.0 · prioridad **baja** — ruido con diagnóstico equivocado, no pérdida

## Resumen

`readHumanActions` descarta la cabecera comparando su primera celda contra `^tarea$`. Cualquier otro
encabezado —`Tarea Requerida`, `Acción`, `Bloqueo`— cae del lado de los datos, y `check` la reporta como
una fila cuyo estado dice `Estado` y está fuera del vocabulario.

El molde del toolkit escribe `| Tarea |`, así que una instancia recién creada no lo ve. Lo ve quien llega
con una tabla propia, que es exactamente el caso de adoptar Cauce sobre un sistema que ya existía.

El error es correcto en su forma y equivocado en lo que señala: manda a arreglar el vocabulario de una
fila que no es una fila.

## Reproducción

```bash
BANCO=~/.cache/sonda-043 && rm -rf "$BANCO" && mkdir -p "$BANCO" && cd "$BANCO"
npx @ingeniomaps/cauce@0.66.0 init . --mode embedded --force

cat > planning/HUMAN_ACTIONS.md <<'EOF'
# Acciones humanas

| Tarea Requerida | Estado | Origen | Descripción / Instrucciones |
| :--- | :---: | :---: | :--- |
| sembrar-el-flag | pendiente | Ready | Sembrar `FLAG` en Infisical. |
EOF
cauce check planning
```

*Verificado* el 2026-09-07 sobre 0.66.0. Renombrar la cabecera a `| Tarea |` —sin tocar nada más— deja
el `check` en verde, que es lo que confirma la causa.

## Síntoma

```
✗ HUMAN_ACTIONS Tarea Requerida: estado "Estado" fuera de pendiente | resuelta; mientras no se entienda, la tarea queda bloqueada
```

Nombra una tarea llamada `Tarea Requerida` y un estado llamado `Estado`. Las dos son las etiquetas de las
columnas.

## Causa raíz

`engine/planning/parser.js:293`:

```js
return rows.filter(({ cells }) => cells.length >= 4 && !/^tarea$/i.test(cells[0]))
```

El filtro anterior, en `:291`, ya descarta la fila de guiones (`|---|` o `| :--- |`), así que la
cabecera llega hasta acá y la única defensa es el literal.

## Fix propuesto

La fila de separadores es lo que define a la cabecera en markdown: la anterior a ella es el encabezado,
diga lo que diga. Eso no depende de ninguna palabra.

```diff
-  const rows = withoutComments(read(path.join(dir, 'HUMAN_ACTIONS.md'))).split('\n')
-    .filter((line) => /^\|/.test(line) && !/^\|\s*:?-+/.test(line))
+  // En markdown la cabecera es la fila anterior a la de separadores, diga lo que diga su primera
+  // celda. Reconocerla por el literal `tarea` sólo funciona con el encabezado del molde: quien llega
+  // con una tabla propia recibe un error que nombra las etiquetas de sus columnas como si fueran datos.
+  const all = withoutComments(read(path.join(dir, 'HUMAN_ACTIONS.md'))).split('\n')
+  const header = all.findIndex((line) => /^\|\s*:?-+/.test(line)) - 1
+  const rows = all
+    .filter((line, i) => /^\|/.test(line) && !/^\|\s*:?-+/.test(line) && i !== header)
```

Si se prefiere no tocar la forma de detectar, la alternativa barata es dejar el literal y agregarle al
mensaje la pista que hoy falta: nombrar que esa fila podría ser el encabezado.

## Tradeoffs

Con varias tablas en el archivo —el caso real que lo destapó tenía tres, una por sección— hay que
saltear la cabecera de cada una, no sólo la primera. El `findIndex` de arriba resuelve una sola; la
forma correcta es marcar cada índice que preceda a una fila de separadores.

Nada más se mueve: una fila de datos nunca está inmediatamente antes de los guiones.

## Prioridad

**Baja.** No se pierde información ni se lee nada mal: la fila se rechaza y el `check` queda rojo, que es
visible. El costo es el rato que lleva entender que el error habla de la cabecera, y aparece justo en el
primer contacto con la herramienta, cuando nadie tiene todavía el modelo mental para descartarlo.

## Contexto de descubrimiento

Migrando `roax-ops` a Cauce 0.66.0 el 2026-09-07. Su tabla usaba `| Tarea Requerida |` y el archivo
tiene tres tablas, así que fueron tres errores de este tipo mezclados con 87 reales de vocabulario. Se
resolvió renombrando las tres cabeceras a `Tarea`.

## Relacionados

- [042](042-la-tabla-de-acciones-humanas-se-parte-por-todo-pipe.md) — mismo parser, misma función; los
  dos salieron de la misma migración. **Va primero aquél**: los dos diffs reescriben líneas contiguas
  del mismo encadenado, así que el que entre segundo no aplica tal cual. Si éste entra después, su
  `-` tiene que incluir el `split` ya corregido por 042, no el de hoy.
