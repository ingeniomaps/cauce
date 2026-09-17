---
caso: 178
titulo: Un `--amend` sobre un commit sin publicar no lo puede autorizar ni la persona, y el motor escribe que lo bloquea por política y no por daño
estado: resuelto
resuelto-en: 0.97.0
prioridad: media
version-detectada: 0.96.0
---

# 178 — La única salida a un mensaje de commit roto es que nadie lo arregle

**🟢 resuelto en 0.97.0** · detectado en 0.96.0 · prioridad **media** — el guard mira si el commit
está publicado, y R8 dice lo que protege

## Resumen

`git commit --amend` se frena siempre: sin variable de entorno, sin aprobación por ruta y sin el canal
de chat que otros guards sí tienen. La lista de reglas de `engine/hooks/shell.js` marca con un tercer
elemento cuáles admiten salida, y `--amend` no lo lleva; el comentario de las líneas 133-137 lo dice sin
vueltas: son *«las que una persona tampoco debería poder abrir pidiéndolo»*.

El problema es que ahí conviven dos cosas distintas, y el propio motor las distingue en otra línea. Del
force-push escribe una razón que se sostiene: *«publicar se autoriza; reescribir historia publicada,
no»* (`shell.js:68-71`). Del amend escribe, textual (`shell.js:83-85`):

> Se bloquea por política y no por daño —un `--amend` sobre algo que nadie vio no rompe nada—, así que
> el mensaje manda a lo que sí corresponde: otro commit.

Y ahí está el hueco: **«otro commit» no arregla lo que el amend arregla**. Un mensaje de commit con un
error —una palabra pegada, una cita equivocada, basura que se coló al tipear— no se corrige con un
commit nuevo: el mensaje malo queda en la historia para siempre, y el commit siguiente sólo agrega
ruido. La regla manda a una salida que no resuelve el caso que la dispara.

## Reproducción

1. Crear un commit local, sin empujar, cuyo mensaje tenga un error.
2. La persona pide, en el chat y con todas las letras, que se corrija.
3. `git commit --amend` → bloqueado.
4. No hay ruta que aprobar en `planning/.ops-approval` —el guard no ofrece ninguna— ni variable que lo
   apague: `OPS_*_OVERRIDE` no cubre a este guard.

## Síntoma

Verbatim, el 2026-09-17:

```
BLOQUEADO: 'git commit --amend' reescribe un commit ya creado. R8 pide uno nuevo en su lugar.
```

El commit no estaba empujado, la rama era local, y quien pedía la corrección era la persona dueña del
repositorio. La única salida real que queda es `git reset --soft HEAD~1` y volver a commitear — que
produce **exactamente** el mismo efecto que el amend, no lo frena ningún guard, y no deja constancia de
nada. O sea que la regla no impide el resultado: impide el comando que lo nombra.

## Causa raíz

- **`engine/hooks/shell.js:86-89`**: la regla de `--amend`, sin el tercer elemento que habilita salida.
- **`engine/hooks/shell.js:133-137`**: la decisión escrita de que ni la persona pueda abrirla, junto a
  `rm -r /`, el borrado de disco y el force-push.
- **`planning/rules/system/commits.md`, R8**: «No usar `git add .`, `git add -A`, amend, force ni
  trailers de IA», sin distinguir publicado de no publicado.

Y la comparación que lo deja claro: `git clean -f` y `git reset --hard` —que destruyen trabajo de verdad
y sin recuperación— **sí** tienen salida por chat. El amend, que el propio comentario reconoce
inofensivo sobre algo que nadie vio, no la tiene.

## Fix propuesto

Distinguir lo que R8 de verdad protege. Tres formas, de menor a mayor alcance:

1. **La más chica**: darle a `--amend` el tercer elemento, como a `clean -f`. Queda bloqueado por
   defecto y la persona puede abrirlo pidiéndolo en el chat, con el rastro que ese canal ya deja.
2. **La más precisa**: permitirlo cuando el commit no está publicado —`git branch -r --contains HEAD`
   vacío, o `@{upstream}` que no lo contiene— y seguir bloqueándolo cuando sí lo está. Ahí la regla
   pasa a decir lo que quiere decir, que es lo mismo que ya dice del push.
3. **Y en R8, la frase que falta**: hoy prohíbe «amend» a secas. Lo que protege es la historia que otro
   ya leyó; sobre un commit que nadie vio, el amend es la corrección y no el daño.

La 1 y la 3 juntas alcanzan. La 2 es mejor y cuesta una llamada a git.

## Tradeoffs

Abrir el amend por chat reintroduce la posibilidad de que un agente pida permiso para tapar un commit
feo en vez de explicarlo. Es real, y es el mismo riesgo que ya se aceptó para `clean -f`, que borra
archivos. El canal de chat existe justamente para eso: lo autoriza una persona, para un comando
concreto, y queda escrito.

Lo que hoy pasa es peor que ese riesgo: el resultado se consigue igual por `reset --soft`, y el único
efecto del bloqueo es que se consiga por un camino que nadie nombró.

## Prioridad

**Media.** No pierde trabajo ni rompe una corrida; deja mensajes de commit rotos en la historia y
enseña que la salida es el rodeo. Eso último es lo que la hace valer la pena: una regla que se cumple
mejor esquivándola se termina esquivando siempre.

## Contexto de descubrimiento

Instancia de venotal, 2026-09-17, sobre 0.96.0. Al cerrar una tarea, al mensaje del commit de cierre se
le coló un carácter suelto en medio de una frase (`what the probe观察 observed`). La persona pidió el
amend con todas las letras y el guard lo frenó; el commit estaba sin empujar y la rama era local.

**Consultado para escribir esto**: `engine/hooks/shell.js` (líneas 60-95 y 128-140) del paquete
`@ingeniomaps/cauce@0.96.0` instalado en `venotal-ops/node_modules`;
`planning/rules/system/commits.md` (R8) de la instancia; la lista de variables de override de
`AGENTS.md`; y el bloqueo real, citado arriba.

## Relacionados

- **103** — `allowPush` y el force-push escrito en el refspec. Es la otra mitad de esta misma rama, y la
  que sí tiene su razón bien escrita.
- **117** y **124** — cuándo un guard deja a la persona sin ninguna salida. Éste es otro de ésos, con el
  agravante de que el motor ya escribió que el daño no existe.

## Cierre

**Resuelto en 0.97.0, por el camino 2 —«la más precisa»— más el 3.** El caso recomendaba 1 y 3 juntas y
decía que la 2 era mejor; se hizo la 2 porque además es **más segura**: la 1 abría el amend por chat
también sobre historia publicada, que es justo lo que el force-push tiene cerrado.

Las tres anclas se abrieron antes de tocar nada: la regla de `--amend` no llevaba el tercer elemento, el
comentario de al lado declaraba que ni la persona podía abrirla, y R8 decía «amend» sin distinguir.

Recorriendo lo que enumeró:

- **«Darle el tercer elemento, como a `clean -f`» → se decidió que no**, y la razón es del propio caso:
  si el bloqueo se acota a lo publicado, sobre lo no publicado no hay nada que abrir, y sobre lo publicado
  no corresponde abrirlo. Una salida por chat ahí contradiría la frase que el motor ya escribe del
  force-push.
- **«Permitirlo cuando el commit no está publicado» → se hizo.** El guard mira si algún remoto alcanza a
  HEAD, con una lectura local que no habla con ningún servidor.
- **«En R8, la frase que falta» → se hizo.** R8 pasa a prohibir reescribir historia que otro ya leyó, y
  dice por qué: sobre un commit que no salió de tu máquina, prohibirlo no impide el resultado sino el
  comando que lo nombra.
- **«Abrir el amend reintroduce la posibilidad de que un agente tape un commit feo» → cerrado por el
  camino elegido.** Sobre historia publicada sigue bloqueado sin salida; sobre la que nadie vio, tapar un
  commit propio no es distinto de escribirlo bien la primera vez.

Y lo que apareció arreglándolo:

- **Tres pruebas existentes codificaban la conducta vieja**, y ninguna se borró: se les dio el estado que
  ejerce su intención —un repositorio con HEAD publicado—. La que dice «lo que R8 prohíbe no se abre ni
  pidiéndolo» sigue midiendo eso, ahora sobre el caso donde la prohibición rige.
- **Una mutación sobrevivió y hubo que matarla.** Cambiar «sin dato, cerrado» por «sin dato, abierto`»
  dejaba la suite entera en verde: ninguna prueba ejercía el caso de un cwd sin repositorio. Es la mitad
  de R27 que se abre sola si nadie la mide, y ahora tiene su caso.

### Qué se corrió

- **Rojo previo**: el amend sobre un commit sin publicar se frenaba.
- **Tres mutaciones, las tres en rojo**: abrir el guard también sobre lo publicado; volver a bloquear
  siempre; y —la que hubo que agregar— fallar hacia el «pasá» cuando no hay con qué saber.
- Comprobado sobre repositorios de verdad, con un remoto bare local: sin remoto pasa, con el commit
  empujado y `fetch` corrido bloquea nombrando que está publicado.
- `npm run ci` exit 0: **923 pruebas**, 0 en rojo, 0 salteadas.

### Límite declarado

La respuesta sale de `refs/remotes/`, que sólo se actualiza con un `fetch`. Un remoto que avanzó y que
nadie trajo hace que el guard crea «no publicado» algo que sí lo está. Envejece hacia el lado permisivo y
queda dicho: por eso esto **acota un bloqueo y no autoriza nada** — lo que decide publicar sigue siendo
`push`, que mira otra cosa. Cerrarlo del todo exigiría hablar con el remoto en cada comando, que es un
costo que R26 no admite en una puerta.
