'use strict'

// Caso 409. El Mapa real de `workspace.md` llega a las fases que trabajan el código por el contrato, porque el
// preámbulo les dice que no relean ese archivo. Sin mapa en el contrato, el preámbulo es el de siempre.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const MAP = '- app → `../app`: Next.js. Estilos y tokens en `src/styles/_variables.scss`.'

test('el Mapa real viaja en el preámbulo de las fases que trabajan, y sin mapa no aparece', async () => {
  const withMap = await runFlow({ [KEY.contract]: { ...baseScript()[KEY.contract], map: MAP } })
  ranToEnd(withMap.result)
  const seen = (prompts, key) => prompts.find((one) => one.key === key).prompt
  for (const key of [KEY.plan, KEY.build, KEY.review]) {
    assert.ok(seen(withMap.prompts, key).includes(`Dónde vive cada cosa, según el Mapa real del proyecto:\n${MAP}`),
      key)
  }
  const plain = await runFlow({})
  ranToEnd(plain.result)
  for (const { key, prompt } of plain.prompts) assert.doesNotMatch(prompt, /Mapa real del proyecto/, key)
})
