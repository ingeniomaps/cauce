---
caso: 365
titulo: el guard de shell no ve un borrado fuera de las raíces
estado: abierto
prioridad: media
version-detectada: 0.106.0
---

# 365 — El guard de límites frena escribir fuera de las raíces por shell y deja pasar borrar ahí: `rm`, `rm -rf` y `find -delete` no cuentan como escritura, y tampoco `touch` ni `mkdir`

**🔴 abierto** · detectado en 0.106.0 · prioridad **media**.

**Prioridad media**: no es de esta versión ni rompe nada que hoy ande. Es un hueco de una defensa: la misma
ruta que el guard no deja tocar con un `echo >` se puede borrar entera con un `rm -rf`. Lo catastrófico ya
está cuidado aparte —`/`, el home, el directorio padre, el árbol entero (caso 337)—; lo que queda afuera es
todo lo demás: la carpeta de otro proyecto, o el servicio original visto desde una línea de trabajo.

## Resumen

`shell-boundary` decide si un comando escribe fuera de las raíces declaradas. Lo que cuenta como escritura
es una lista: una redirección, `tee`, `truncate`, `cp`, `mv`, `install`, `rsync` y `sed -i`. Borrar no está
en la lista, y crear un archivo vacío o una carpeta tampoco. Es la forma que R27 nombra: una defensa escrita
como lista de lo que protege deja abierto lo que nadie agregó.

## Reproducción

En una instancia con el runner instalado, fuera del temporal del sistema —el guard lo exime por diseño—, con
el pedido que manda Claude Code y una carpeta `otra/` al lado, fuera de toda raíz:

```bash
ask() { printf '{"cwd":"%s","tool_name":"Bash","tool_input":{"command":"%s"}}' "$PWD" "$1" \
  | CLAUDE_PROJECT_DIR="$PWD" ops/automatization/hooks/guard-shell.sh; echo "exit $? · $1"; }
```

## Síntoma

Medido el 2026-10-10 sobre una copia de una instancia real, desde la carpeta de una línea de trabajo. Las
rutas se dieron enteras; acá van abreviadas:

```
exit 2 · echo x > ../otra/x.txt            BLOQUEADO: el comando escribe en …/otra/x.txt, fuera de las raíces
exit 2 · cp CLAUDE.md ../otra/c.md
exit 2 · mv ../otra/sub ../otra/sub2
exit 2 · tee ../otra/tee.txt
exit 2 · sed -i s/a/b/ ../otra/x.txt
exit 2 · truncate -s 0 ../otra/x.txt
exit 0 · rm ../otra/x.txt
exit 0 · rm -rf ../otra
exit 0 · rm -rf <servicio original>/src     el producto, visto desde la línea por su ruta entera
exit 0 · find ../otra -delete
exit 0 · touch ../otra/t.txt
exit 0 · mkdir ../otra/d
```

La herramienta de archivos no tiene el hueco: no borra.

## Causa raíz

- `engine/hooks/shell.js`, `EVERY_ARG` y `LAST_ARG` — las dos listas de verbos que escriben: `tee|truncate`
  y `cp|mv|install|rsync`, más `sed -i` y las redirecciones. `writesWithBase` no produce nada para `rm`,
  `unlink`, `rmdir`, `find … -delete`, `touch` ni `mkdir`.
- `engine/hooks/removal.js` sí resuelve lo que un `rm -r` borra, tramo a tramo y siguiendo el `cd`, pero lo
  usa sólo `destructive`, para preguntar si el destino es el árbol entero.

## Fix propuesto

1. Que lo que un comando borra entre al mismo juicio que lo que escribe: los objetivos de `rm`, `unlink`,
   `rmdir` y `find … -delete` se resuelven —`removal.js` y `test-evidence-shell.js` ya lo hacen cada uno a
   su modo— y pasan por `beyond`, con las mismas exenciones: el temporal del sistema, `writableOutsideRoots`
   y el árbol de una tarea.
2. `touch` y `mkdir` como escritura en cada argumento.
3. La prueba que R27 pide para una lista que no se puede cerrar por defecto: una que recorra los verbos que
   modifican el disco y falle hasta que cada uno esté clasificado.

## Valor

Cierra la mitad que faltaba de un límite que ya existe. En una línea de trabajo es donde más pesa: el
servicio original queda al lado, fuera de las raíces de la línea, y es el trabajo de otra persona.

## Qué podría salir mal

1. **Frenar borrados legítimos que hoy pasan**: una caché en el home, un `rm` de un archivo que el propio
   comando creó fuera de las raíces. Cada uno pide declarar la ruta o aprobar en el chat. Cuántos son no
   está medido; los diarios de corridas lo pueden decir antes de construir.
2. **Dos resolvedores de «qué borra un comando»** que ya existen y no coinciden en todo. Sumar un tercero
   sería peor que elegir uno.
3. **Un comodín o una variable que no se pueden resolver.** `test-evidence-shell` ya decidió qué hacer con
   eso para su caso; acá hay que decidirlo de nuevo, y frenar todo lo irresoluble sería demasiado.

## Contexto de descubrimiento

Al probar la versión 0.106.0 sobre una copia de una instancia real con una línea de trabajo, preguntándole
al guard por un borrado en el servicio original. No es una regresión: el guard nunca miró borrados.

## Relacionados

- [337](./337-rm-rf-punto-y-cd-x-rm-rf-punto-pasan-el-guard-destructivo.md) — el borrado del árbol entero, que sí
  está cuidado, y de donde sale `removal.js`.
- [360](./360-en-una-linea-el-arbol-de-la-tarea-queda-fuera-de-las-raices-cuando-la-raiz-es-el-repositorio.md) —
  el árbol de una tarea, que tiene que seguir pudiendo borrarse.
- [164](./164-el-override-de-noclobber-evade-el-guard-de-escrituras.md) — otra forma de escritura que la lista
  no tenía.
