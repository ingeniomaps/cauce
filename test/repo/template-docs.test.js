'use strict'

// Un documento largo del molde lleva índice (caso 442). Una instancia recibe estos archivos tal cual y no puede
// agregarles navegación sin separarse del molde, así que si falta, falta para todas. El umbral —más de 300 líneas y
// cuatro secciones o más— es el de la instancia que lo pidió; con él, esta prueba falla en el primer documento que
// lo cruce, en vez de que lo descubra una empresa.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const LONG = 300
const SECTIONS = 4

// El ancla que GitHub le da a un título: en minúsculas, sin signos, con guiones por espacios y con los acentos
// intactos. Comprobado contra el render de GitHub de template/AGENTS.md y teamwork.md el 2026-10-23: «Qué sabe este
// proyecto y no este archivo» → `qué-sabe-este-proyecto-y-no-este-archivo`.
const anchor = (title) => title.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')

// Del disco y no de `git ls-files`: sin git la lista salía vacía y la prueba pasaba sin mirar nada.
const markdown = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const at = path.join(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : markdown(at)
  return entry.name.endsWith('.md') ? [path.relative(ROOT, at)] : []
})

test('todo documento largo del molde tiene un índice que enlaza cada sección', () => {
  const docs = markdown(path.join(ROOT, 'template'))
  assert.ok(docs.length > 20, `el molde trae decenas de documentos y se leyeron ${docs.length}`)
  const missing = []
  for (const file of docs) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    const titles = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]).filter((one) => one !== 'Contenido')
    if (text.split('\n').length <= LONG || titles.length < SECTIONS) continue
    const index = (text.match(/^## Contenido\n([\s\S]*?)\n## /m) || [])[1] || ''
    for (const title of titles) {
      if (!index.includes(`](#${anchor(title)})`)) missing.push(`${file}: ${title}`)
    }
  }
  assert.deepEqual(missing, [], 'secciones sin entrada en el índice de su documento')
})
