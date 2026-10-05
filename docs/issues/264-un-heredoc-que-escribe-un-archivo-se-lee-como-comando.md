---
caso: 264
titulo: un heredoc que escribe un archivo se lee como comando
estado: descartado
prioridad: media
version-detectada: 0.100.0
---

# 264 — Los guards de shell leen como orden el cuerpo de un heredoc que sólo se escribe en un archivo

**⚪ descartado** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no deja pasar nada, frena de más. Es la misma clase que el 259, por la puerta que
aquél dejó sin tocar.

## Resumen

El 259 dejó de tomar por comando lo entrecomillado que una herramienta sólo lee. El cuerpo de un heredoc
quedó afuera: `cat > archivo <<'EOF' … EOF` escribe texto en un archivo, y si ese texto nombra una forma
prohibida, el comando se frena.

## Reproducción

Con el guard de este repositorio, un comando que escribe una prueba cuyo texto nombra `git add -A`:

```bash
cat > /tmp/nota.md <<'EOF'
No corras git add -A: stageá por nombre.
EOF
```

## Síntoma

```
BLOQUEADO: 'git add -A/--all/.' está prohibido. Stagea rutas explícitas.
```

Pasó tres veces el 2026-10-05, las tres sobre scripts de prueba escritos con un heredoc.

## Causa raíz

`engine/hooks/input.js`, `asRun`: vacía lo entrecomillado de los lectores y no mira heredocs, así que su
cuerpo llega entero a los patrones de `git-add` y `destructive`.

## Fix propuesto

Vaciar el cuerpo de un heredoc cuando lo recibe algo que sólo lo escribe o lo muestra —`cat`, `tee`—, y
dejarlo como orden en el resto: un heredoc que alimenta `bash`, `sh`, `python` o `node` se ejecuta.

## Tradeoffs

- `cat <<EOF | bash` es una orden aunque empiece con `cat`: la tubería a un shell tiene que seguir contando.
- `cat > x.sh <<EOF` seguido de `bash x.sh` ejecuta lo escrito. Queda afuera, igual que un `echo … > x.sh`:
  el guard mira el comando, no lo que un archivo hará después.

## Contexto de descubrimiento

Al arreglar el 259 y al armar las pruebas reales de la tanda.

## Relacionados

- 259 — un guard lee como comando el texto que va dentro de otro comando.

## Cierre

**Descartado: el defecto no existe.** El caso se escribió de memoria y al correr su propia reproducción
no se reprodujo.

`commandOf` (`engine/hooks/input.js`) le quita el cuerpo a todo heredoc antes de que ningún guard mire el
comando, y lo dice: «El cuerpo de un heredoc es entrada estándar: no se ejecuta, se escribe». Los
bloqueos que originaron este caso no fueron sobre un heredoc. Fueron dos `node -e "…"` con los comandos
como texto entre comillas, y `node` ejecuta lo que recibe: ahí frenar es lo correcto.

### El recorrido de lo que este caso enumeró

- **Resumen y Síntoma — falsos.** Lo de abajo lo muestra.
- **Fix — no hace falta.**
- **Tradeoff «`cat <<EOF | bash` es una orden» — es al revés de como el caso lo temía**, y ya estaba
  escrito: como el cuerpo se quita siempre, un heredoc que alimenta un shell pasa sin mirarse. El
  comentario de `commandOf` lo declara como lo que se pierde a cambio. No se toca acá.

### Qué se corrió

El guard `git-add` de este repositorio, invocado por su shim con cada forma:

```
el comando solo:                              BLOQUEADO
el comando y otra línea después:              BLOQUEADO
cat que escribe un archivo, con dos puntos:   pasa
cat que escribe un archivo, con espacio:      pasa
tee que escribe un archivo:                   pasa
heredoc que alimenta bash:                    pasa
cat por tubería a bash:                       pasa
```

Las tres primeras filas de «pasa» son lo que el caso decía que se frenaba.

