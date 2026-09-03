---
caso: 016
titulo: el workflow /onboard manda escribir el mapa real en AGENTS.md, donde ya no va
estado: resuelto
prioridad: alta
version-detectada: 0.58.0
resuelto-en: 0.60.0
---

# 016 — `/onboard` escribe el mapa donde 0.57.0 lo sacó

**🟢 resuelto en 0.60.0** · detectado en 0.58.0 · prioridad **alta** — el primer recorrido tras `init` deshace el arreglo del 008

## Resumen

0.57.0 movió el mapa real, las integraciones y las excepciones de autonomía de `AGENTS.md` a
`organization/workspace.md`, porque `AGENTS.md` es del toolkit y obligaba a fusionar a mano en cada
versión. El CLI acompañó el cambio; el workflow `/onboard` no.

`onboard.js` sigue instruyendo escribir la sección `## Mapa real` **de `AGENTS.md`** — una sección que
ya no existe en ese archivo. Es el primer recorrido que corre un proyecto recién inicializado, así que
lo primero que hace una instancia nueva es volver a poner el mapa donde el arreglo lo sacó.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install --runner claude

grep -c '## Mapa real' ops/AGENTS.md                  # 0 — ya no está ahí
grep -n  '## Mapa real' ops/organization/workspace.md # 7 — está acá

grep -n 'AGENTS.md' .claude/workflows/onboard.js      # sigue mandando ahí
grep -c 'workspace.md' .claude/workflows/*.js         # ningún workflow lo nombra
```

## Síntoma

`.claude/workflows/onboard.js:178`:

```js
`2. La sección "## Mapa real" de ${ROOT}/AGENTS.md: una entrada por servicio con su ruta, su runtime y ` +
`sus comandos **tal como los declara**, diciendo de qué archivo salió cada uno. …`
```

Y el comentario de cabecera, `onboard.js:2`:

```js
// contexto escrito —`organization/`, el mapa real de `AGENTS.md`, las raíces de código— y en la primera
```

Contra lo que dice el CLI del mismo paquete:

```text
$ node tools/ops.js onboard .
  Con tus respuestas escribe organization/, el mapa real en organization/workspace.md y la primera épica.
```

Y contra el propio `AGENTS.md` que 0.57.0 entrega, cuya primera sección es «Qué sabe este proyecto y no
este archivo» y apunta a `organization/workspace.md`.

## Causa raíz

El arreglo del [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) tocó el molde, el README,
la guía de arranque del CLI y el README de `organization/`. Los workflows de runner viven en
`automatization/workflows/` y no se revisaron: ninguno de los nueve nombra `workspace.md`.

Es la misma clase que el [012](012-el-makefile-del-molde-llama-a-un-comando-que-no-existe.md): un
cambio que llega al motor y a la documentación, y no a la superficie que el dev ejecuta.

## Fix propuesto

En `automatization/workflows/onboard.js`, cambiar el destino:

```diff
-`2. La sección "## Mapa real" de ${ROOT}/AGENTS.md: una entrada por servicio con su ruta, su runtime y ` +
+`2. La sección "## Mapa real" de ${OPS}/organization/workspace.md: una entrada por servicio con su ruta, ` +
+`su runtime y ` +
```

y el comentario de la línea 2. Conviene que el paso incluya también las otras dos secciones que ese
archivo espera —«Integraciones y ambientes» y «Excepciones de autonomía»—, que hoy ningún recorrido
llena y son justamente las que `check` cruza para avisar de credenciales sin dueño.

Y de paso completar la lista de `organization/`: el molde trae cuatro archivos y `onboard.js` sólo
nombra dos.

| Archivo del molde | ¿Lo nombra `onboard.js`? |
|---|---|
| `company.md` | sí |
| `product.md` | sí |
| `domains.md` | **no** |
| `workspace.md` | **no** |

`domains.md` es el glosario y las palabras que no se usan; queda sin llenar en toda instancia que
arranque por el recorrido.

Vale además una prueba que ate las dos superficies: que ningún workflow nombre una sección que
`template/AGENTS.md` no tenga. Este caso y el 012 se habrían visto solos.

## Tradeoffs

Ninguno. La instrucción actual apunta a una sección inexistente: cualquier cosa que un agente escriba
siguiéndola queda en el lugar equivocado, y lo marcado como edición local en el próximo `upgrade`.

## Contexto de descubrimiento

Barriendo referencias muertas en todo lo que se distribuye —comandos, artefactos declarados, enlaces
relativos, guards documentados— el 2026-09-03, después de que el mismo barrido encontrara el 012. Los
doce comandos `ops` que invocan los workflows existen; lo que no existe es la sección a la que
`/onboard` manda escribir.

## Resolución

**Resuelto en 0.60.0.** El paso 2 de `/onboard` escribe en `organization/workspace.md` y nombra sus
tres secciones, no sólo el mapa: «Integraciones y ambientes» con las credenciales que cada una necesita
—porque `check` cruza ese archivo para avisar de las que nadie carga— y «Excepciones de autonomía» sólo
si el proyecto declaró alguna. El paso 1 suma `domains.md`, que no nombraba ninguno.

Y entró la puerta que este caso pedía: una prueba comprueba el par **archivo-sección** de cada
instrucción de escritura de los nueve workflows contra el molde. Se verifica el par y no el archivo
solo, porque lo que engaña es la ruta que existe con la sección que ya no. Comprobada en rojo
devolviendo la instrucción a `AGENTS.md`: la encuentra sola.

## Relacionados

- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) — el arreglo que esta superficie no
  recibió.
- [017](017-autobuild-lee-los-limites-solo-de-agents-md.md) — el otro workflow que quedó atrás del
  mismo cambio.
