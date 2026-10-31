---
caso: 468
titulo: El repositorio de un commit se lee del primer cd o -C del comando, aunque no sea el del commit
estado: abierto
prioridad: media
version-detectada: 0.117.2
---

# 468 — El repositorio de un commit se lee del primer `cd` o `-C` del comando

**🔴 abierto** · detectado en 0.117.2 · prioridad **media**: un commit encadenado con un `cd` que no es el suyo pasa sin
`verify`, `governance` ni `live-commit`, y no avisa nada. Hace falta esa forma de comando, y no se contó cuántas veces
aparece. Sube a alta si aparece en los diarios de una corrida real.

## Resumen

`gitDirectory` busca en todo el comando el primer `-C` de un `git` y, si no hay, el primer `cd`. No mira si vienen antes o
después del commit, ni de qué `git` son. Si el repositorio que lee no es de la instancia, los guards se abstienen: creen que el
commit es de otro.

## Reproducción

En un banco `tarea`, en la rama viva y con un archivo stageado, se le pregunta al hook sin commitear nada:

```bash
printf '%s' "{\"cwd\":\"$R\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"<comando>\"}}" \
  | OPS_ROOT=$R node engine/hooks/run.js pre-shell; echo "exit $?"
```

## Síntoma

Salida real, 2026-10-31, con el arreglo del 464 puesto:

| Comando | Exit | Lo correcto |
|---|---|---|
| `git commit -m x` | 2, `live-commit` | 2 |
| `git commit -m x && cd /etc` | **0** | 2: el commit corre antes del `cd` |
| `echo git -C /etc && git commit -m x` | **0** | 2: ese `git` es texto de un `echo` |
| `cd /etc; cd R && git commit -m x` | **0** | 2: el último `cd` antes del commit es el que vale |

La forma entrecomillada de la segunda fila, `echo git -C "/etc"`, antes del 464 lanzaba y también dejaba pasar.

## Causa raíz

`gitDirectory` (`engine/hooks/input.js`): `text.match` devuelve la primera coincidencia del comando entero. El comentario de
arriba de la función explica por qué se lee el mensaje como dato, pero no contempla varios comandos.

## Fix propuesto

Hipótesis, sin probar: partir el comando por sus separadores, ubicar el segmento del `git commit`, y leer el `-C` de ese segmento o,
si no tiene, el último `cd` de los segmentos anteriores. `expandAssigned` ya resuelve las variables asignadas en el comando.

`(cd "/o" && git commit)` también se lee mal, porque el `cd` tras el paréntesis no cae en el ancla. Es de esta misma lectura.

Y un tercer resto del 464: el valor con espacios sólo se lee entero con `git` como primera palabra del comando. `true; git -C "a b"
commit` se sigue leyendo como antes de ese caso, así que no se reconoce como commit y pasa sin guards. Se dejó así a propósito: cada
intento de leerlo también en otras posiciones dejó pasar órdenes que el shell re-parsea (`eval git -C 'x push -f'`,
`ssh h true \; git -C 'x reset --hard'`). Arreglarlo pide leer el comando con un parser de shell de verdad.

## Tradeoffs

- Se usa en cinco lugares (`approval.js`, `ai-signature.js`, `live-commit.js`, `shell.js` y `stagedForCommit`). Cambiar qué repositorio
  se lee puede frenar commits que hoy pasan.
- Si el `cd` es condicional (`cd a || cd b`), el repositorio no se sabe mirando el comando. Frenar es lo que pide R27.

## Contexto de descubrimiento

La revisión independiente del 464. El arreglo de ese caso no lo crea: la forma sin comillas ya pasaba.

## Relacionados

Caso 464 (la ruta entrecomillada), caso 261 (el destino de un `cd` por variable).
