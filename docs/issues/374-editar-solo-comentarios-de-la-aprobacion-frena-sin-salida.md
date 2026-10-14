---
caso: 374
titulo: editar sólo comentarios de la aprobación frena sin salida
estado: abierto
prioridad: media
version-detectada: 0.106.1
---

# 374 — Una edición de `.ops-approval` que sólo cambia comentarios se frena con el bloqueo seco: no se puede confirmar, y la persona que la pidió tiene que editar el archivo a mano

**🔴 abierto** · detectado en 0.106.1, sigue en 0.107.0 · prioridad **media**.

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
