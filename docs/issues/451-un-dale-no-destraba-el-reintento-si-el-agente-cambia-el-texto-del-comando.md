---
caso: 451
titulo: Un «dale» no destraba el reintento de un comando destructivo si el agente cambia algo del texto, porque la confirmación cubre el comando entero tal como llegó
estado: resuelto
resuelto-en: 0.116.0
prioridad: media
version-detectada: 0.115.1
---

# 451 — Un «dale» no destraba el reintento si el agente cambia el texto del comando

**🟢 resuelto en 0.116.0** · detectado en 0.115.1 · prioridad **media** — toda confirmación por chat de un comando que frena
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

## Cierre

**Resuelto en 0.116.0**, en la rama de los huecos de esa versión. La decisión, del 2026-10-25, fue la primera del
fix propuesto.

- **El ítem es el tramo que matchea.** Se hizo. `stretchOf` (`engine/hooks/shell.js`) parte el comando por `;`, `&`,
  `|` y el salto de línea fuera de comillas, le saca los paréntesis, las llaves y las redirecciones, y si la regla
  reconoce un solo tramo, ése es el ítem. Si reconoce dos, el ítem sigue siendo el comando entero, así que aprobar
  uno no aprueba el otro. Dónde corre lo sigue diciendo el lugar, que se lee del comando entero (el `cd` cuenta ahí).
- **Las líneas viejas.** Una línea escrita antes, con el comando entero y su lugar, sigue aprobando ese mismo comando.
- **Pedir el texto idéntico.** No se hizo: era la alternativa.

La prueba:

- `test/hooks/approval-place.test.js`. Con `cd <api> && git clean -fd; echo …` el bloqueo da `git clean -fd @
  <api>`, y esa línea aprueba también `git clean -fd 2>&1 | tail -3`. En `web`, frena. La línea vieja con el comando
  entero sigue valiendo, y dos tramos no se parten. Por chat, el «dale» a `git clean -fd; echo …` cubre el reintento
  con `cd <api> && git clean -fd`, y no el de `web`. Antes del arreglo dio rojo, con el ítem entero. En una copia,
  cuatro mutaciones dieron rojo: el comando entero, sin la línea vieja, partir dos tramos, y dejar las redirecciones.
- **El guard solo**, con la secuencia de la reproducción. Con 0.115.1: bloqueo `exit 2`, reintento con `cd` `exit 2`.
  Con el motor de la rama: bloqueo `exit 2`, reintento con `cd` `exit 0`, el mismo en `web` `exit 2`.
- **Sesiones reales** de `claude -p --resume`. En una, el bloqueo de `cd <banco>/app && git clean -fd; echo …` ofreció
  la línea `git clean -fd @ <banco>/app`, sólo el tramo. El «dale» lo destrabó, y el paso en `web` volvió a frenar.
  En esa sesión el agente reintentó con el mismo texto, así que no ejercitó el cambio de texto; eso lo mide el guard
  solo, arriba. En otra, el agente corrió por su cuenta `git clean -fdn` antes del paso, el guard lo frenó, y el
  «dale» quedó atado a esa simulación. Esa simulación nunca tenía que frenar, y salió como el caso 452.

**La revisión de código del conjunto, el mismo día, encontró una regresión de este arreglo.** El lugar sale de
`AP.locate`, que no sigue un subshell, un `pushd` ni el `cd` de un bucle. Con el tramo solo como ítem, la línea
`git clean -fd @ <api>` dejaba pasar `(cd ../web; git clean -fd)` corrido desde `api`. Antes del arreglo no pasaba,
porque el ítem era el comando entero. Medido con el guard: pasaban `(cd ../web; git clean -fd)`, `pushd ../web && git
clean -fd` y `for d in ../web; do cd $d; git clean -fd; done`.

Se corrigió: el tramo se usa sólo si la carpeta donde corre, leída con `steps` (que sí sigue esas formas), es la del
lugar. Si no, el ítem vuelve a ser el comando entero. Las tres formas frenan, y `cd <api> && git clean -fd; echo …`
sigue reduciéndose al tramo. Las tres entraron en la prueba, y su mutación (no comprobar el lugar) dio rojo. Por el
guard solo, otra vez: el reintento con `cd` tras el «dale» `exit 0`, el mismo en `web` `exit 2`, el subshell a `web`
`exit 2`. El comentario de `destructive` que todavía decía «el comando entero» se corrigió.

**La segunda pasada de revisión, sobre esa corrección, encontró que tampoco alcanzaba.** `steps` no sigue `builtin
cd`, `eval "cd …"` ni `source`, así que con esas formas el tramo seguía reduciéndose en la carpeta equivocada. Y
comparar dos resolvedores del lugar dejaba la aprobación dependiendo de que los dos coincidieran. Se cambió el
criterio: el tramo se usa sólo si todo lo demás del comando es inerte —un `cd` a una ruta escrita, o `echo`,
`printf`, `true`, `tail`, `head`, `wc`, `sort`, `git status|log|diff|show`— y el comando no agrupa con paréntesis ni
llaves. Cualquier otra cosa deja el comando entero, como antes del 451 (cerrado por defecto, R27). La prueba suma
`builtin cd`, `eval` y `source` frenando, y `git clean -fd && git status --short` reduciéndose. Dos mutaciones dieron
rojo: no mirar los grupos, y no exigir lo inerte. Por el guard solo, otra vez: el reintento con `cd` tras el «dale»
`exit 0`, el mismo en `web` `exit 2`.
