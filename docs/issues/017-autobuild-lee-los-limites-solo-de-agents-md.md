---
caso: 017
titulo: /autobuild arma sus límites sólo desde AGENTS.md y no ve las excepciones del proyecto
estado: resuelto
prioridad: alta
version-detectada: 0.58.0
resuelto-en: 0.60.0
---

# 017 — `/autobuild` no ve las excepciones de autonomía del proyecto

**🟢 resuelto en 0.60.0** · detectado en 0.58.0 · prioridad **alta** — el ejecutor autónomo trabaja con los límites incompletos

## Resumen

`autobuild.js` lee el contrato una sola vez por corrida —`AGENTS.md`, `ops.config.json` y
`PROTOCOL.md`— y de ahí arma los `boundaries` que viajan como texto a cada subagente que toca código.
La instrucción es explícita: *«En boundaries listá sólo los límites que AGENTS.md enuncia»*.

Desde 0.57.0 los límites **de este proyecto** no están en `AGENTS.md`: están en
`organization/workspace.md`, sección «Excepciones de autonomía», que el molde describe como *«lo que
este proyecto amplía o restringe, con su razón»*. `autobuild` no lee ese archivo, así que corre con los
límites genéricos del toolkit y sin los que el proyecto escribió.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install --runner claude

grep -n '^## ' ops/AGENTS.md                      # Autonomía (genérica, del toolkit)
grep -n '^## ' ops/organization/workspace.md      # Excepciones de autonomía (del proyecto)

grep -n 'AGENTS.md' .claude/workflows/autobuild.js
grep -c 'workspace.md' .claude/workflows/autobuild.js   # 0
```

## Síntoma

`.claude/workflows/autobuild.js:282-288`:

```js
`Leé ${ROOT}/AGENTS.md, ${CONFIG} y ${P}/PROTOCOL.md una sola vez y no leas nada más. …` +
`En boundaries listá sólo los límites que AGENTS.md enuncia y que restringen la ejecución autónoma.`
```

y el preámbulo que reciben los subagentes de escritura (`autobuild.js:294-299`):

```js
const limits = bounds.length ? ` Límites del proyecto: ${bounds.join('; ')}.` : ''
```

Se llama «Límites del proyecto» y no incluye ninguno de los que el proyecto declaró.

En una instancia real —`venotal-ops`— esa sección contiene, entre otras: no escribir en la tienda
Shopify productiva aunque la tarea esté promovida; el tema tiene dos escritores y hay que hacer `pull`
antes de editar; las llamadas a Gemini, SerpAPI y ElevenLabs cuestan por llamada y van al volumen
mínimo; Dropi es de sólo lectura. Ninguna llega al subagente que construye.

Algunas las ataja igual un guard —el push, la escritura a `.env`—, pero varias no tienen guard: son
exactamente las que dependen de que el ejecutor las conozca.

## Causa raíz

El arreglo del [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) creó
`organization/workspace.md` y le dio tres secciones, una de ellas «Excepciones de autonomía».
`autobuild.js` no se actualizó: ninguno de los nueve workflows nombra ese archivo.

La instrucción «y no leas nada más» es deliberada y correcta —el contrato se lee una vez y viaja como
texto, para no releerlo en cada subagente—. El defecto es que la lista de archivos quedó incompleta.

## Fix propuesto

Sumar el archivo a la lectura única y a lo que se pide extraer:

```diff
-`Leé ${ROOT}/AGENTS.md, ${CONFIG} y ${P}/PROTOCOL.md una sola vez y no leas nada más. …` +
+`Leé ${ROOT}/AGENTS.md, ${OPS}/organization/workspace.md, ${CONFIG} y ${P}/PROTOCOL.md una sola vez y ` +
+`no leas nada más. …` +
-`En boundaries listá sólo los límites que AGENTS.md enuncia y que restringen la ejecución autónoma.`
+`En boundaries listá los límites que AGENTS.md enuncia y las "Excepciones de autonomía" que declare ` +
+`organization/workspace.md, que son las de este proyecto. Si el archivo no existe o la sección está ` +
+`en su molde, no inventes ninguna.`
```

Y el `no vuelvas a leer` de la línea 298 debería nombrarlo también, para que la economía de contexto
siga valiendo.

Vale mirar de paso `flow.js` y `agent-eval.js`, que arman contexto de proyecto por su cuenta: no los
revisé línea por línea.

## Tradeoffs

Una lectura más en la fase Triage, una sola vez por corrida. A cambio, los límites que viajan a cada
subagente pasan a incluir los del proyecto, que es lo que su propio nombre promete.

Si el archivo no existe —una instancia anterior a 0.57.0 que nunca corrió `upgrade`— la instrucción
tiene que tolerarlo sin inventar límites, de ahí la última frase del diff.

## Contexto de descubrimiento

Leyendo estáticamente los nueve workflows de runner el 2026-09-03, después de encontrar el
[016](016-el-workflow-onboard-manda-escribir-el-mapa-en-agents-md.md) en el mismo barrido. No se
ejecutó `/autobuild`: el defecto está en el texto del prompt y en la lista de archivos que declara
leer.

## Resolución

**Resuelto en 0.60.0** con el fix propuesto: `organization/workspace.md` entra en la lectura única de
Triage, en lo que se pide extraer para `boundaries` y en el `no vuelvas a leer` que reciben los
subagentes, para que la economía de contexto siga valiendo. Con la tolerancia que el caso pedía: si el
archivo no está o su sección sigue como la trae el molde, no se inventan límites.

Se revisó lo que el caso dejó pendiente. `flow.js` y `agent-eval.js` **no** están afectados: el segundo
nombra `AGENTS.md` como «las reglas que todo cargo obedece», que sigue siendo cierto —ahí viven las del
toolkit—, y ninguno de los dos arma límites de proyecto. Los únicos dos workflows que quedaron atrás del
008 son éste y el [016](016-el-workflow-onboard-manda-escribir-el-mapa-en-agents-md.md).

## Relacionados

- [016](016-el-workflow-onboard-manda-escribir-el-mapa-en-agents-md.md) — el otro workflow que quedó
  atrás del mismo cambio.
- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) — el arreglo que ninguno de los dos
  recibió.
