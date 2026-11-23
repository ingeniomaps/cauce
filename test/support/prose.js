'use strict'

// Las palabras de la prosa del repositorio, que por convención está en español: el markdown sin sus bloques de
// código ni lo que va entre comillas invertidas, y los comentarios `//` del JavaScript. La lee `language.test.js`
// para reconocer una palabra en español que ninguna lista escrita a mano tiene.
//
// Sólo lo trackeado, cuando hay `.git`: un caso sin commitear de otra sesión trae nombres de empresas, y lo que no
// viaja con el repositorio daba una prosa distinta en cada clon.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SKIP = new Set(['node_modules', '.git', '.cauce-eval', 'coverage'])
const normalize = (word) => word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file, out)
    else if (/\.(md|js)$/.test(entry.name)) out.push(file)
  }
  return out
}

const wordsIn = (text) => (text.replace(/`[^`\n]*`/g, ' ').match(/[A-Za-zÀ-ÿ]{3,}/g) || []).map(normalize)

function tracked(root) {
  const listed = spawnSync('git', ['ls-files', '-z', '--', '*.md', '*.js'], { cwd: root, encoding: 'utf8' })
  return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean).map((one) => path.join(root, one))
    .filter((one) => fs.existsSync(one)) : walk(root)
}

function proseWords(root) {
  const found = new Set()
  for (const file of tracked(root)) {
    const text = fs.readFileSync(file, 'utf8')
    const prose = file.endsWith('.md')
      ? text.replace(/```[\s\S]*?```/g, ' ').replace(/^ {4}.*$/gm, ' ')
      : [...text.matchAll(/(?:^|\s)\/\/(.*)$/gm)].map((hit) => hit[1]).join('\n')
    for (const word of wordsIn(prose)) found.add(word)
  }
  return found
}

module.exports = { normalize, proseWords }
