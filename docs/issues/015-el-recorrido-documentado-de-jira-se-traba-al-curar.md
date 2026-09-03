---
caso: 015
titulo: curar el draft como manda el README deja la integración en rojo, y el error no dice el remedio
estado: resuelto
prioridad: media
version-detectada: 0.58.0
resuelto-en: 0.60.0
---

# 015 — El recorrido documentado de Jira se traba en el paso de curación

**🟢 resuelto en 0.60.0** · detectado en 0.58.0 · prioridad **media** — el camino feliz del README no funciona como está escrito

## Resumen

El README de Jira dice: *«Edita únicamente el draft […] Después ejecuta `integration check` e
`integration promote`»*. Seguido al pie de la letra, `check` falla: editar el draft deja obsoleto el
`draftChanged` que vive en `remote.json`, y nada en ese camino lo recalcula.

El remedio existe —`rebase`, `reconcile` o un `sync` nuevo— pero vive en otra sección del README, para
otro problema, y el mensaje de error no lo nombra.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install --integration jira
cd ops
cp <cauce>/test/support/fixtures/jira-search.json fx.json
# habilitar jira en integrations/jira/config.json

node tools/ops.js integration sync . jira --fixture fx.json

# el paso que dice el README: editar el draft
sed -i 's/state: pending/state: ready/' integrations/jira/staging/stories/DEMO-42/draft.md

node tools/ops.js integration check . jira      # ✗ falla
```

## Síntoma

```text
$ node tools/ops.js integration check . jira
✗ integrations/jira/staging/stories/DEMO-42: draftChanged no coincide con el contenido real
exit=1
```

`integration promote` se niega por lo mismo. El mensaje nombra un campo interno de `remote.json` y no
dice qué hacer.

Los tres remedios funcionan, comprobados por separado sobre un draft recién curado:

| Comando | Resultado |
|---|---|
| `integration rebase . jira DEMO-42` | ✓ desaparece el error, conserva la curación |
| `integration reconcile . jira DEMO-42` | ✓ ídem |
| `integration sync . jira --fixture fx.json` | ✓ ídem, y reporta «1 curados preservados» |

## Causa raíz

`draftChanged` es un derivado guardado en `remote.json` y validado contra el contenido real en
`engine/integrations/registry.js:135`:

```js
const actualDraftChanged = sha256(draft) !== snapshot.sync.draftBaseHash
if (snapshot.sync.draftBaseHash && snapshot.sync.draftChanged !== actualDraftChanged) {
  errors.push(`${at}: draftChanged no coincide con el contenido real`)
}
```

Lo recalculan `sync` (`registry.js:249`) y las operaciones de reconciliación. La curación a mano —que
es el paso que el README pide— no pasa por ninguna de las dos, así que el flag queda como lo dejó el
último sync.

La comprobación en sí es sana: detecta un `remote.json` manipulado. Lo que falla es que el recorrido
documentado la dispara siempre.

## Fix propuesto

Dos opciones, y la primera es la barata:

1. **Que el mensaje diga el remedio.** Es un error que va a ver todo el que cure un draft:

   ```
   draftChanged quedó viejo: editaste el draft y la base no se recalculó.
   Corré "ops integration rebase . jira DEMO-42" y repetí.
   ```

   Y que el README, en «Staging y promoción», nombre ese paso entre editar y `check`.

2. **Que `check` lo recalcule en vez de exigirlo.** Si el único guardián del `remote.json` manipulado
   es la coincidencia de ese flag, se lo puede derivar al leer —como ya hace `S.derive`— y reservar el
   error para lo que de verdad no se puede recomponer: la base remota ausente, el `missingFromRemote`
   con tipo equivocado. Un derivado que se puede recalcular no debería ser un error de validación.

## Tradeoffs

La opción 2 pierde una señal: hoy un `remote.json` editado a mano dispara este error. Vale preguntarse
cuánto vale esa señal frente a un camino feliz que no funciona — y si vale, la opción 1 la conserva
entera y sólo agrega la instrucción.

## Contexto de descubrimiento

Barriendo la superficie de integraciones de 0.58.0 el 2026-09-03 con el `--fixture` del CLI, siguiendo
el README de Jira paso por paso. Es el primer tropiezo del recorrido; el segundo, ya con el draft
curado y promovido, es el [014](014-integration-promote-genera-una-epica-que-check-rechaza.md).

## Resolución

**Resuelto en 0.60.0 por la opción 2**, y con un dato que cambia su tradeoff: la señal que decía perder
no existe.

`draftChanged` se escribe en tres lugares —`sync`, `rebase` y `reconcile`— y se leía en **uno solo**:
esta validación, que lo comparaba consigo mismo recalculado. Lo que decide qué vuelve al remoto es
`S.derive`, que compara el contenido contra la base y nunca lo consulta. O sea que el campo sólo existía
para validarse a sí mismo, y esa validación ponía en rojo el paso siguiente del recorrido documentado,
todas las veces que alguien curara un draft — que es el paso que el README pide.

Se quitó la comprobación, con la razón escrita al lado para que nadie la reponga. El campo se sigue
manteniendo en los tres comandos que lo escriben.

Por eso tampoco entró la opción 1: sin el error, no hay remedio que documentar.

Verificado el 2026-09-03: `sync` con el fixture, curar el draft a mano —`state: ready`,
`promotionKind: epic`— y `integration check` da `✓ integraciones válidas: jira`, sin pasos intermedios.

## Relacionados

- [014](014-integration-promote-genera-una-epica-que-check-rechaza.md) — el paso siguiente del mismo
  recorrido.
