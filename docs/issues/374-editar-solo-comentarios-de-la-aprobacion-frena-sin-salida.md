---
caso: 374
titulo: editar sólo comentarios de la aprobación frena sin salida
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.106.1
---

# 374 — Una edición de `.ops-approval` que sólo cambia comentarios se frena con el bloqueo seco: no se puede confirmar, y la persona que la pidió tiene que editar el archivo a mano

**🟢 resuelto en 0.108.0** · detectado en 0.106.1 · prioridad **media** — una escritura que no agrega ninguna línea
pasa sin preguntar, como ya pasaba cuando la persona nombraba el archivo.

## Resumen

`selfApproval` deja escribir la aprobación si la persona nombró el archivo, o si confirma el bloqueo que le
muestra qué rutas se agregan. Pero cuando no lo nombró y la escritura **no agrega ninguna ruta** —sólo cambia
comentarios—, no hay nada que mostrar ni que dejar pendiente, y devuelve `SELF`: el bloqueo seco, sin diálogo y
sin registro que una confirmación pueda aprobar. Es el caso más inofensivo de todos y el único sin salida.

## Reproducción

Llamando a `selfApproval` directo, con una entrada de la sesión principal en modo `default` (`native` verdadero)
y sin mensaje registrado, sobre el `.ops-approval` de una instancia sidecar real (sólo lectura):

```js
const file = '<instancia>/planning/.ops-approval'
const base = { hook_event_name: 'PreToolUse', prompt_id: 'p1', permission_mode: 'default',
  cwd: '<instancia>', tool_name: 'Edit' }
selfApproval({ ...base, tool_input: { file_path: file, new_string: '# comentario corregido' } }, file)
selfApproval({ ...base, tool_input: { file_path: file, new_string: '# comentario\nsrc/nuevo.js' } }, file)
```

## Síntoma

Mismo resultado con el paquete 0.106.1 y con el repositorio en 0.107.0 (`4f72222f`):

```
solo comentario → «… es la aprobación de una persona, y escribírsela es aprobarse solo. Si la persona
                   quiere autorizar algo, que lo diga en el chat —nombrándolo, o confirmando el bloqueo— …»
agrega una ruta → «el agente quiere agregar a …/.ops-approval, la aprobación de una persona, estas líneas:
                     src/nuevo.js» (diálogo de confirmación)
```

En uso: la persona pidió en el chat «editá el comentario» de una línea que ella misma había aprobado (de
«mientras dure el hito» a «para siempre»). Dos pedidos seguidos frenaron igual; el mensaje decía «confirmando
el bloqueo», pero no había bloqueo que confirmar. Terminó editándolo a mano.

## Causa raíz

`engine/hooks/self-approval.js`, `unnamed` (líneas 87-93): `added()` descarta los comentarios —`AP.lines` corta
desde `#` (`approval.js:41`)—, así que una edición sólo de comentarios da `lines = []`. Con eso no entra a `ASKED`
(`lines.length && CF.native(input)`), `held` queda en `false` y cae en `return SELF(file)`.

El propio archivo ya razona lo contrario en `added` (línea 77): «Quitar tampoco se pregunta: una aprobación más
corta autoriza menos». Un comentario no autoriza nada, ni más ni menos.

## Fix propuesto

En `unnamed`, y en `unasked` por simetría: si `added()` vuelve vacío, devolver `''`. La escritura no agrega
ninguna línea que algún guard lea, así que no hay aprobación que darse.

Alternativa más conservadora: tratarla como las que agregan rutas —diálogo o `hold` con el archivo— para que
la confirmación de la persona alcance.

## Qué podría salir mal

- Con el fix directo, el agente puede reescribir comentarios sin que nadie los vea, por ejemplo el «quién
  aprobó y para qué» de una línea. No cambia ninguna autorización, pero sí el rastro que `check` y la persona
  leen. Si eso importa, va la alternativa conservadora.
- `added` compara contra lo que ya está en disco: un fragmento de `Edit` que repite una ruta existente sigue
  contando como «sin rutas nuevas». Es lo que ya pasa hoy cuando el archivo se nombra.

## Contexto de descubrimiento

Instancia sidecar `acme-ops`, Claude Code, 2026-10-13/14. El operador aprobó por chat agregar una ruta y
pasó; después pidió corregir el comentario de esa misma línea y el guard lo frenó dos veces sin salida.

## Relacionados

- [119](./119-nombrar-el-archivo-de-aprobacion-no-controla-que-se-escribe-adentro.md) — de donde sale comparar
  línea por línea.
- [202](./202-no-hay-forma-durable-de-autorizar-una-lectura-de-secreto-que-la-propia-regla-del-proyecto-exige.md)
  — el bloqueo sin anotar que dejaba la confirmación sin efecto; éste es el mismo hueco cuando no hay líneas.
- [375](./375-el-guard-de-dependencias-no-reconoce-un-script-nuevo-con-pnpm.md) — encontrado en la misma sesión.

## Cierre

**Resuelto en 0.108.0.** En `unnamed`, si la escritura no agrega ninguna línea que un guard lea, devuelve vacío:
no hay aprobación que darse. Es el fix directo del caso, y lo decidió un dato que el caso no tenía: la otra vía,
`unasked` —cuando la persona sí nombra el archivo—, ya devolvía vacío en ese mismo caso. La asimetría era entre
dos funciones del mismo archivo, así que la alternativa conservadora habría dejado una vía preguntando por lo
que la otra ya deja pasar.

**Lo que se corrió para saber que funciona.** `test/hooks/chat-effects.test.js`, «editar sólo comentarios de la
aprobación pasa sin nombrarla, y agregar una ruta sigue frenando»: con un `Edit` que cambia un comentario y sin
nombrar el archivo ni confirmar nada, el guard deja pasar; quitar una ruta también pasa; y agregar `src/nuevo.js`
frena mostrando la ruta. En rojo antes del cambio y en verde después. La aserción que fijaba lo contrario —«no
hay qué mostrarle», en la prueba de los bordes sin oferta— se invirtió a propósito. Mutación en copia: sin la
salida temprana, dos aserciones en rojo.

**Lo que el caso no preveía.** Que «no agrega líneas» y «no hay cuerpo que juzgar» se ven iguales desde
`added()`: una escritura sin `content` ni `new_string` también da cero líneas, y el primer fix la dejaba pasar.
Lo atrapó `test/hooks/boundary-links.test.js` en la puerta de verify del commit: la aprobación escrita por un
enlace, sin cuerpo, tiene que seguir frenando. La salida temprana vale sólo cuando la llamada trae con qué
escribe; sin cuerpo se frena, que es el lado correcto para equivocarse, y una mutación que borra esa
distinción pone en rojo esa prueba. Y el riesgo que el caso anotaba —reescribir el «quién aprobó» sin que
nadie lo vea— ya existía por la otra vía, así que el fix no lo abre.

**Recorrido de lo que el caso enumeraba.**

- **Fix directo, devolver vacío sin líneas — se hizo**, en `unnamed`; `unasked` ya lo hacía.
- **Alternativa conservadora, diálogo o `hold` sin líneas — se decidió que no**: preguntaría por lo que la otra vía
  no pregunta, y no hay línea que una confirmación pueda aprobar.
- **«`added` compara contra el disco: repetir una ruta existente cuenta como sin rutas nuevas» — se conserva**,
  es lo que ya pasaba y es correcto: lo que ya está no se agrega.

**Revisión del PR 819.** La revisión independiente encontró que el primer fix juzgaba el fragmento que entra y no
el archivo que queda: un `Edit` que borra el `#` de `#push origin main` no agrega ninguna línea y activaba la
aprobación. `added()` ahora simula el reemplazo sobre lo que hay en disco y compara las líneas resultantes, y
`carriesContent` vive en `input.js` junto a `contentOf`, con la misma lista de campos. Prueba: borrar el `#`
frena nombrando `push origin main`; mutación en copia, juzgar por el fragmento, en rojo.
