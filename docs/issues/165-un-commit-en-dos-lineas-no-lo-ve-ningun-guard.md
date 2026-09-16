---
caso: 165
titulo: Un commit escrito en dos líneas no lo reconoce `isCommit`, así que los tres guards que sólo corren sobre un commit no corren
estado: resuelto
resuelto-en: 0.95.0
prioridad: alta
version-detectada: 0.94.0
---

# 165 — Un commit en dos líneas no lo ve ningún guard

**🟢 resuelto en 0.95.0** · detectado en 0.94.0 · prioridad **alta** — y la forma que lo dispara es
exactamente cómo un agente escribe dos pasos

## Resumen

`isCommit` anclaba el patrón en `(?:^|[;&|]\s*)`: principio de comando, o después de `;`, `&` o `|`. El
salto de línea no estaba, aunque el léxico de `shell.js:46` ya lo declara separador —«el salto de línea
va adentro de lo excluido porque también separa comandos, exactamente igual que `;`, `&` y `|`»—. El `(`
de un subshell tampoco.

Con `isCommit` en falso no corren `governance`, `dependencies` ni `verify`, ni el bloqueo de
`stagedForCommit` que existe para impedir stagear y commitear en una sola llamada.

## Reproducción

```
SÍ  ← "git commit -m x"
NO  ← "git add src/x.js\ngit commit -m x"
NO  ← "(git commit -m x)"
```

## Causa raíz

`engine/hooks/input.js:160`, la clase del ancla de `PREFIX`. El comentario que la acompaña ya describía
este daño exacto para el caso del prefijo de entorno —«los tres guards que sólo corren sobre un commit
dejan de correr»— y no cubría estas dos formas de llegar al mismo lugar.

## Fix

`(?:^|[;&|(\n]\s*)`. El salto y el `(` abren un comando igual que los tres que ya estaban.

## Lo que quedó sin cerrar, declarado

`bash -c "git commit …"` sigue sin reconocerse, y **no se arregla acá a propósito**: `isCommit` no
desentrecomilla, y hacerlo choca con la decisión de que el mensaje de un commit es dato y no código —la
misma que sostiene que `git commit -m "no usar git push --force"` no dispare el guard de publicación. Lo
que lo activaría: que aparezca un agente que commitee habitualmente por `bash -c`.

## Tradeoffs

Ampliar el ancla amplía también el falso positivo que ya existía: `echo "a; git commit"` podía leerse
como commit antes y sigue pudiendo. No es nuevo ni empeora — es la misma propiedad de una clase que ya
tenía `;` adentro— y frenar de más en un guard cuesta una vuelta, mientras que el falso negativo que se
cerró cuesta que nadie mire.

## Prioridad

Alta. No se ve: el commit ocurre, la corrida sigue, y los guards simplemente no corrieron.

## Contexto de descubrimiento

2026-09-16, revisión de código de `engine/`. Lo encontró un revisor probando `isCommit` con sondas contra
el código real, no leyéndolo.

## Cierre

**Resuelto en 0.95.0.**

- **El ancla — ampliada**, con el salto y el subshell.
- **La forma más común resultó caer en otro bloqueo, y es el correcto.** `git add X` ⏎ `git commit` ahora
  frena con «el comando stagea y commitea a la vez», que es la protección que este hueco apagaba. La
  prueba asercia **ese** motivo y no sólo que frene: frenar por la razón equivocada ya lo encontró esta
  suite una vez.
- **`bash -c` — declarado sin cerrar**, con la razón y con qué lo activaría.
- **Y el corte de `commit.test.js`, que no estaba previsto.** La prueba nueva cruzó las 500 líneas y la
  puerta lo dijo. Mirando el archivo, cuatro pruebas no eran sobre qué se exige al commitear sino sobre
  **el registro de guards y cómo se los invoca** —ni coincidían con su propio encabezado—, así que salieron
  a `test/hooks/registry.test.js`. El umbral disparó la revisión; lo que decidió el corte fue el sujeto.

### Qué se corrió

- **Rojo previo** con las tres formas.
- **Las dos direcciones**: que las formas nuevas frenen, y que `git add x.js` ⏎ `git status` y
  `git log --format=%s` sigan sin ser commits.
- **`npm run ci` exit 0**, 882 pruebas, 0 fallos.
