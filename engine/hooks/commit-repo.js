'use strict'

// En qué repositorio cae un commit, con los `cd` del comando. Lo que garantiza: si los comandos van encadenados sin
// dudas la respuesta es una, la que daría el shell; si no se puede saber sin ejecutar, se devuelven los candidatos y
// quien pregunta juzga el que sea de la sesión. Elegir uno a ciegas fallaba siempre por algún lado: un `cd` que no
// corrió dejaba el commit fuera de los guards, y uno que sí corrió los aplicaba a un repositorio ajeno (caso 468).

const fs = require('node:fs')
const path = require('node:path')
const { directoryFlag, isCommit, withoutGitGlobals } = require('./git-globals')
const { masked, segments, shellWord } = require('./quoting')

// Lo que separa dos comandos sin dejar dudas sobre si el segundo corre en el mismo shell.
const SURE_GAP = /^(?:[;\s]*|\s*&&\s*)$/
const MOVES_SOMEHOW = /^\s*(?:pushd|popd)(?:\s|$)/
const CD = /^\s*(?:cd|pushd)\s+([^\s;&|]+)/
const ENDS_SHELL = /^\s*(?:exit|return)(?:\s|$)/
// Un `git` corre salvo que sólo se lo nombre: lo cerrado por defecto es contarlo, y `timeout 9 git add` o
// `| xargs git add` también corren (R27).
const ONLY_NAMES_GIT = /^(?:#|(?:echo|printf|grep|rg|sed|awk|cat|test|which|type)(?:\s|$)|command\s+-v\s)/
// El `git` como palabra: ni `my-git` ni `.git`, pero sí el que corre un `sh -c 'git add'`.
const NAMES_GIT = /(?:^|[\s'"])git\s/
// Lo que no escribe en el repositorio: juzgarlo aplicaría los guards de un commit a una carpeta que sólo se miró.
// `init` y `clone` escriben en uno nuevo.
const ONLY_READS = new RegExp(String.raw`\bgit\s+(?:status|log|diff|show|rev-parse|rev-list`
  + String.raw`|worktree\s+list|branch|remote|config|ls-files`
  + String.raw`|ls-tree|describe|fetch|version|--version|help|blame|shortlog|grep|cat-file|init|clone`
  + String.raw`|tag\s+(?:-l|--list)|stash\s+list)(?:\s|$)`)

const expandPwd = (word, base) => word.replace(/^\$(?:PWD|\{PWD\})(?=\/|$)/, base)

// `T=$(mktemp -d)` no mueve al shell, y lo que corre adentro no es el commit: se tapa antes de partir el comando. Una
// redirección como `2>&1` tampoco separa nada.
const hideSubstitutions = (text) => text
  .replace(/\\[\s\S]/g, '\u0000\u0000')
  .replace(/\d*>&\d*|&>/g, (found) => '\u0000'.repeat(found.length))
  .replace(/\$\([^()]*\)|`[^`]*`/g, (found) => '\u0000'.repeat(found.length))

function gitDirOf(text, command, start, base, cwd) {
  const found = text.match(/^\s*(?:\S+=\S*\s+)*git\s.*?--git-dir[=\s]\s*(\S+)/)
  if (!found) return null
  const stop = start + found.index + found[0].length
  const value = expandPwd(shellWord(command.slice(stop - found[1].length, stop)), base)
  return /[$`*?~]/.test(value) ? null : path.resolve(cwd, value.replace(/\/\.git\/?$/, ''))
}

function directoriesOf(command, cwd) {
  const hidden = masked(command)
  const clean = hideSubstitutions(hidden)
  const parts = segments(clean)
  const gapBefore = (index) => clean.slice(index ? parts[index - 1].end : 0, parts[index].start)
  const raw = (index) => command.slice(parts[index].start, parts[index].end).trimStart()
  const textAt = (index) => clean.slice(parts[index].start, parts[index].end)
  const flagAt = (index, base) => {
    const flag = directoryFlag(hidden.slice(parts[index].start, parts[index].end))
    if (!flag) return null
    const from = parts[index].start
    return path.resolve(base, expandPwd(shellWord(command.slice(from + flag.start, from + flag.end)), base))
  }
  const cdAt = (index) => {
    const found = textAt(index).match(CD)
    if (!found) return null
    const stop = parts[index].start + found[0].length
    return shellWord(command.slice(stop - found[1].length, stop))
  }
  const firstCommit = parts.findIndex((_, index) => isCommit(raw(index)))

  let base = cwd
  let sure = true
  let primary = null
  let skipGap = false
  const seen = [cwd]
  const others = []
  for (let index = 0; index < parts.length; index += 1) {
    // Un `|` o un `||` sólo dejan dudas al lado de un `cd`: en otro lugar no mueven al shell.
    const nearCd = cdAt(index) !== null || (index > 0 && cdAt(index - 1) !== null)
    if (!skipGap && nearCd && !SURE_GAP.test(gapBefore(index))) sure = false
    skipGap = false
    const gitDir = gitDirOf(textAt(index), command, parts[index].start, base, cwd)
    if (gitDir) others.push(gitDir)
    if (isCommit(raw(index))) {
      const own = flagAt(index, base)
      const bases = sure ? [own === null ? base : own]
        : [...new Set([cwd, ...seen])].map((one) => flagAt(index, one) || one)
      if (primary) others.push(...bases)
      else primary = bases
      continue
    }
    const writes = NAMES_GIT.test(raw(index)) && !ONLY_NAMES_GIT.test(raw(index))
      && !ONLY_READS.test(withoutGitGlobals(raw(index)))
    if (writes) {
      others.push(flagAt(index, base) || base)
    }
    const moves = MOVES_SOMEHOW.test(textAt(index))
    if (moves) sure = false
    const target = cdAt(index)
    if (target === null || target === '-') {
      if (target === '-' || /^\s*cd\s*$/.test(textAt(index))) sure = false
      continue
    }
    const next = path.resolve(base, expandPwd(target, base))
    seen.push(next)
    if (moves) continue
    const after = index + 1 < parts.length ? gapBefore(index + 1).trim() : ''
    // `cd X || exit 1` no deja dudas: si no entra, lo que sigue no corre.
    const orExit = after === '||' && (ENDS_SHELL.test(textAt(index + 1))
      || (/^\s*\{/.test(textAt(index + 1))
        && parts.slice(index + 2, index + 5).some((_, at) => ENDS_SHELL.test(textAt(index + 2 + at)))))
    if (orExit) skipGap = true
    // `A && cd X; …` no se sabe: si A falla, el `cd` no corre y lo que sigue sí.
    const chained = parts.slice(index + 1, Math.max(firstCommit + 1, index + 1))
      .every((_, at) => gapBefore(index + 1 + at).trim() === '&&')
    // Salvo que A sea lo que prepara el `cd`: `mkdir T && cd T`.
    const prepares = index > 0 && /^\s*(?:mkdir\s|cd\s|[A-Za-z_]\w*=)/.test(textAt(index - 1))
    if (gapBefore(index).trim() === '&&' && !chained && !prepares) sure = false
    const named = parts.slice(0, index).some(({ start, end }) => clean.slice(start, end).includes(target))
    const made = /\bmktemp\b|[$`]/.test(target) || named
    if (after === '&&' || orExit || made || fs.existsSync(next)) base = next
  }
  return [...new Set([...(primary || [cwd]), ...others])]
}

module.exports = { directoriesOf }
