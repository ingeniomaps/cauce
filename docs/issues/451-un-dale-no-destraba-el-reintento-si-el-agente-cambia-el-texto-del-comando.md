---
caso: 451
titulo: Un «dale» no destraba el reintento de un comando destructivo si el agente cambia algo del texto, porque la confirmación cubre el comando entero tal como llegó
estado: abierto
prioridad: media
version-detectada: 0.115.1
---

# 451 — Un «dale» no destraba el reintento si el agente cambia el texto del comando

**🔴 abierto** · detectado en 0.115.1 · prioridad **media** — toda confirmación por chat de un comando que frena
`destructive`, cuando el agente no reintenta con el texto idéntico.

## Resumen

Cuando `destructive` frena un comando, lo que queda esperando el «dale» es el comando **entero**, tal como llegó,
con su lugar al final. Si al reintentar el agente cambia cualquier cosa del texto —un `cd` adelante, un `; echo`
atrás—, el reintento es otro ítem: la confirmación no lo cubre y el guard vuelve a frenar. La persona dijo que sí, el
agente hizo lo que el bloqueo le pidió («reintentá el mismo cambio»), y el bloqueo vuelve igual.

Pasa más de lo que parece. Con `claude -p --resume` cada mensaje arranca en la raíz de la sesión, así que el agente
que estaba en `app` reintenta con `cd <banco>/app && …`. Y los agentes suelen agregarle al comando un
`; echo "exit=$?"` o un `git status` para leer el resultado.

## Reproducción

Con el guard solo, en un banco sidecar con `app`, y el motor de 0.115.1 o el de `7e54a2ec`:

1. Un mensaje de la persona: «corré el paso 1».
2. `git clean -fd; echo "exit=$?"` desde `app`: frena y queda pendiente.
3. La persona contesta «dale».
4. El mismo comando, con el texto idéntico, desde `app`: pasa.
5. `cd <banco>/app && git clean -fd; echo "exit=$?"` desde la raíz: frena.

## Síntoma

El guard solo, los dos motores, el 2026-10-25:

```
== 0.115.1
bloqueo:                 exit 2
mismo texto tras dale:   exit 0
con cd tras dale:        exit 2
== 7e54a2ec
bloqueo:                 exit 2
mismo texto tras dale:   exit 0
con cd tras dale:        exit 2
```

En una sesión real (`claude -p` y `--resume`, banco sidecar, motor de `main`), el agente lo explicó solo:

```
Reintenté el mismo comando después de tu «dale» y el guard lo volvió a frenar. …
La línea que el guard pide aprobar cambió entre los dos intentos. En el primero el directorio de trabajo ya era
`app`, y la línea era `git clean -fd; echo "exit=$?"; git status --short`. Ahora el directorio volvió a ser
`<banco>`, y la línea incluye el `cd <banco>/app && …`.
```

En una sesión interactiva, donde la carpeta se mantiene y el agente reintentó con el texto idéntico, el mismo «dale»
sí destrabó el comando.

## Causa raíz

- `engine/hooks/shell.js:200`: el ítem es «el comando entero tal como llegó, no el pedazo que matcheó». El comentario
  da la razón: es lo que la persona pegaría en el archivo y lo más angosto.
- `engine/hooks/chat.js:357`: lo confirmado se compara por igualdad exacta (`saved.approved.includes(item)`).

## Fix propuesto

Pide una decisión antes de construir, porque el comentario de `shell.js:200` eligió el comando entero a propósito.

1. **El ítem es el tramo que matchea.** Partir el comando por `;`, `&&` y `||`, y que el ítem sea el tramo que la
   regla reconoce, con su lugar: `git clean -fd @ <app>`. Un `cd` adelante o un `echo` atrás dejan de importar,
   porque el lugar ya lo da `@`. Cuesta revisar las reglas que hoy leen el comando entero, y la línea que la persona
   pega cambia de forma.
2. **El bloqueo le pide al agente el texto idéntico.** Más barato, pero depende de que el agente obedezca, y un
   `--resume` que arranca en otra carpeta no le deja reintentar igual.

## Prueba de cierre

- El guard solo: el paso 5 de la reproducción pasa después del «dale» y un `git clean -fd` en `web` sigue frenando.
- La sesión real con `claude -p --resume`, repetida: el «dale» destraba el reintento.

## Contexto de descubrimiento

La prueba real del «dale» del 446, después de publicar la rama de 0.116.0, el 2026-10-25.

## Relacionados

- 446: el lugar que lleva el ítem.
- 184: por qué la confirmación no exige una palabra.
