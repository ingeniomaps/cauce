---
caso: 469
titulo: Un commit esconde a los guards lo que su comando ejecuta entre comillas
estado: abierto
prioridad: media
version-detectada: 0.117.2
---

# 469 — Un commit esconde lo que ejecuta entre comillas

**🔴 abierto** · detectado en 0.117.2 · prioridad **media**: hace falta un comando que meta una orden en un commit, y no se contó cuántas veces aparece; pero lo que se esconde es un `push --force`. Antes de arreglarlo hay que decidir qué hacer con el mensaje de commit por `$(cat <<EOF …)`.

## Resumen

`asRun` vacía todo lo entrecomillado de un commit, porque es el mensaje. También lo que el shell ejecuta: una sustitución dentro del `-m`, o un `sh -c '…'` encadenado después. Los guards no lo ven.

## Reproducción

En un banco `sidecar` con raíz `..`, una rama de trabajo en `app` y un archivo stageado. Se le pregunta al hook, sin commitear:

```bash
printf '%s' "{\"cwd\":\"$W\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"<comando>\"}}" \
  | OPS_ROOT=$W/ops node engine/hooks/run.js pre-shell; echo "exit $?"
```

## Síntoma

Salida real, 2026-10-31. Motor de 0.117.2 y motor con el 464, iguales:

| Comando | Exit |
|---|---|
| `git -C app push -f origin main` | 2 |
| `git -C app commit -m "$(git push -f origin main)"` | **0** |
| `cd app && git commit -m "$(git push -f origin main)"` | **0** |
| `git -C app commit -m x; sh -c 'git reset --hard'` | **0** |

Bash ejecuta esas sustituciones: se comprobó con `echo` delante del verbo. Con el 464, la misma forma alcanza también a una ruta con espacios, que antes no se leía como commit y frenaba por otro camino.

## Causa raíz

`asRun` (`engine/hooks/input.js`, `if (isCommit(raw)) return unquoted(raw)`) trata como mensaje todo lo entrecomillado del comando entero.

## Fix propuesto

**Decisión abierta.** Dejar a la vista una sustitución dentro de un commit frenaría la forma normal de escribir un mensaje largo, `-m "$(cat <<'EOF' … EOF)"`, cuyo texto puede citar cualquier comando. Las formas:

1. Tapar sólo el mensaje real: el valor de `-m`, salvo una sustitución que no sea un `cat` de heredoc; y dejar a la vista lo que venga después de un separador.
2. Dejar a la vista toda sustitución, y mandar a escribir el mensaje con `-F`.

Se recomienda la 1. Necesita leer el comando por segmentos, lo mismo que el 468, así que conviene hacerlos juntos.

## Tradeoffs

- Es la lectura que evita que un mensaje que cita un comando se frene a sí mismo. Cualquier arreglo se prueba contra los mensajes de este repositorio, que citan muchos.
- `git-globals.js` se escribió a mano por las regresiones de leer comandos con regex: un parser de segmentos pide las mismas ocho pasadas.

## Contexto de descubrimiento

La última revisión independiente del 464.

## Relacionados

Caso 464, caso 468.
