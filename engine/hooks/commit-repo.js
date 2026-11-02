'use strict'

// En qué repositorio cae un commit, con los `cd` del comando. Lo que garantiza: si los comandos van encadenados sin
// dudas la respuesta es una, la que daría el shell; si no se puede saber sin ejecutar, se devuelven los candidatos y
// quien pregunta juzga el que sea de la sesión. Elegir uno a ciegas fallaba siempre por algún lado: un `cd` que no
// corrió dejaba el commit fuera de los guards, y uno que sí corrió los aplicaba a un repositorio ajeno (caso 468).

const fs = require('node:fs')
const path = require('node:path')
const { directoryFlag, isCommit, shellScriptOf, withoutGitGlobals } = require('./git-globals')
const { masked, segments, shellWord, withoutHeredocBodies } = require('./quoting')

// Lo que separa dos comandos sin dejar dudas sobre si el segundo corre en el mismo shell.
const SURE_GAP = /^(?:[;\s]*|\s*&&\s*)$/
const POPS = /^\s*popd(?:\s|$)/
const CD = /^\s*(?:\{\s*|(?:then|else|elif|if|do|while|until|!)\s+)?(cd|pushd)\s+([^\s;&|]+)/
// Una función corre cuando se la llama, y eso no se sigue: su commit puede caer en cualquier carpeta del comando.
const CREATES_DIRECTORY = /^\s*(?:mkdir\s|git\s+(?:init|clone)\s)/
const FUNCTION_OPENS = /(?<![\w-])(?:function\s+[\w-]+|[\w-]+\s*\(\s*\))\s*\{/
// Por tramos y no con una sola expresión: con `f() { git ` repetido, ésa volvía atrás hasta tardar segundos (caso 477).
const commitsInFunction = (text) => text.split('}').some((stretch) => {
  const opened = FUNCTION_OPENS.exec(stretch)
  if (!opened) return false
  const body = stretch.slice(opened.index + opened[0].length)
  const git = body.search(/\bgit\b/)
  return git >= 0 && /\scommit\b/.test(body.slice(git))
})
const OPENS_BLOCK = /^\s*(?:(?:then|else|do|\{)\s+)*(?:if|for|while|until|case)\s/
const ENDS_BLOCK = /^\s*(?:fi|esac|done|\})(?:\s|$)/
const OPENS_BRACE = /^\s*\{(?:\s|$)/
const ENDS_SHELL = /^\s*(?:exit|return)(?:\s|$)/
// Un `git` corre salvo que sólo se lo nombre: lo cerrado por defecto es contarlo, y `timeout 9 git add` o
// `| xargs git add` también corren (R27).
const ONLY_NAMES_GIT = /^(?:#|(?:echo|printf|grep|rg|sed|awk|cat|test|which|type)(?:\s|$)|command\s+-v\s)/
// El `git` como palabra: ni `my-git` ni `.git`, pero sí el que corre un `sh -c 'git add'`.
const NAMES_GIT = /(?:^|[\s'"])git\s/
// Lo que no toca el índice de este repositorio: juzgarlo aplicaría los guards de un commit a una carpeta que sólo se
// miró. `init`, `clone` y `worktree add` escriben en otro árbol, y `pull` y `push` no dejan nada para commitear.
const ONLY_READS = new RegExp(String.raw`\bgit\s+(?:status|log|diff|show|rev-parse|rev-list`
  + String.raw`|worktree\s+(?:list|add)|branch|remote|config|ls-files|ls-remote|archive|merge-base|merge-tree`
  + String.raw`|for-each-ref|show-ref|symbolic-ref|reflog|cherry|count-objects|name-rev|format-patch`
  + String.raw`|ls-tree|describe|fetch|pull|push|version|--version|help|blame|shortlog|grep|cat-file|init|clone`
  + String.raw`|tag\s+(?:-l|--list)|stash\s+list)(?:\s|$)`)

const expandPwd = (word, base) => word.replace(/^\$(?:PWD|\{PWD\})(?=\/|$)/, base)

// `T=$(mktemp -d)` no mueve al shell, y lo que corre adentro no es el commit: se tapa antes de partir el comando. Una
// redirección como `2>&1` tampoco separa nada.
const hideSubstitutions = (text) => text
  .replace(/\\[\s\S]/g, '\u0000\u0000')
  .replace(/(^|[\s;&|(])#[^\n]*/gm, (found, before) => before + '\u0000'.repeat(found.length - before.length))
  .replace(/\d*>&\d*|&>/g, (found) => '\u0000'.repeat(found.length))
  .replace(/\$\([^()]*\)|`[^`]*`/g, (found) => '\u0000'.repeat(found.length))

function gitDirOf(text, command, start, base, cwd) {
  const found = text.match(/^\s*(?:\S+=\S*\s+)*git\s.*?--git-dir[=\s]\s*(\S+)/)
  if (!found) return null
  const stop = start + found.index + found[0].length
  const value = expandPwd(shellWord(command.slice(stop - found[1].length, stop)), base)
  return /[$`*?~]/.test(value) ? null : path.resolve(cwd, value.replace(/\/\.git\/?$/, ''))
}

// Lo que corre un `sh -c` se lee como un subshell: su `-C` y su `cd` deciden dónde cae su commit.
function withScriptsOpened(text) {
  let out = ''
  let copied = 0
  for (const { start, end } of segments(text)) {
    const opened = shellScriptOf(text.slice(start, end))
    if (opened) {
      out += `${text.slice(copied, start)} ( ${opened.script} ) `
      copied = end
    }
  }
  return out + text.slice(copied)
}

const inRepository = (dir) => {
  for (let at = dir, up = path.dirname(at); ; at = up, up = path.dirname(at)) {
    if (fs.existsSync(path.join(at, '.git'))) return true
    if (up === at) return false
  }
}

function directoriesOf(given, cwd) {
  // Un cuerpo no es comando: una línea `done` de un mensaje no cierra nada.
  const command = withScriptsOpened(withoutHeredocBodies(given))
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
    return shellWord(command.slice(stop - found[2].length, stop))
  }
  const firstCommit = parts.findIndex((_, index) => isCommit(raw(index)))

  let base = cwd
  let sure = true
  let primary = null
  let skipGap = false
  let skipNext = false
  const scopes = []
  const pushed = []
  // Lo de un bloque puede no correr, y un `{ … } | x` corre en otro proceso: un `cd` ahí deja dudas al cerrar.
  let blocks = 0
  let movedInBlock = false
  const seen = [cwd]
  const others = []
  for (let index = 0; index < parts.length; index += 1) {
    // Un subshell lleva su propia carpeta: se apila al abrir y se recupera al cerrar. Un `|` o un `||` sólo dejan dudas
    // al lado de un `cd`: en otro lugar no mueven al shell.
    const gap = gapBefore(index)
    for (const char of gap) {
      if (char === '(') scopes.push(base)
      if (char === ')' && scopes.length) base = scopes.pop()
    }
    const nearCd = cdAt(index) !== null || (index > 0 && cdAt(index - 1) !== null)
    if (!skipGap && nearCd && !SURE_GAP.test(gap.replace(/[()]/g, ''))) sure = false
    skipGap = false
    if (skipNext) {
      skipNext = false
      continue
    }
    if (OPENS_BRACE.test(textAt(index))) blocks += 1
    if (OPENS_BLOCK.test(textAt(index))) blocks += 1
    if (ENDS_BLOCK.test(textAt(index))) {
      blocks = Math.max(0, blocks - 1)
      if (movedInBlock) sure = false
      movedInBlock = false
    }
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
      if (sure) others.push(flagAt(index, base) || base)
      else others.push(...[cwd, ...seen].map((one) => flagAt(index, one) || one))
    }
    if (POPS.test(textAt(index))) {
      if (pushed.length) base = pushed.pop()
      else sure = false
      continue
    }
    const target = cdAt(index)
    if (target === null || target === '-') {
      if (target === '-' || /^\s*(?:cd|pushd)\s*$/.test(textAt(index))) sure = false
      continue
    }
    const next = path.resolve(base, expandPwd(target, base))
    seen.push(next)
    const after = index + 1 < parts.length ? gapBefore(index + 1).replace(/[()]/g, '').trim() : ''
    // `cd X || exit 1` no deja dudas: si no entra, lo que sigue no corre. `cd X || cd Y` tampoco, mirando si X existe.
    const orExit = after === '||' && (ENDS_SHELL.test(textAt(index + 1))
      || (/^\s*\{/.test(textAt(index + 1))
        && parts.slice(index + 2, index + 5).some((_, at) => ENDS_SHELL.test(textAt(index + 2 + at)))))
    const orOther = after === '||' && !orExit && cdAt(index + 1) !== null && cdAt(index + 1) !== '-'
      && !/[$`]/.test(target)
    if (orExit || orOther) skipGap = true
    if (orOther && fs.existsSync(next)) skipNext = true
    // `A && cd X; …` no se sabe: si A falla, el `cd` no corre y lo que sigue sí.
    // Sin commit, lo que importa llega hasta el último `git` que escribe, que no se conoce: se mira hasta el final.
    const chained = parts.slice(index + 1, firstCommit < 0 ? parts.length : Math.max(firstCommit + 1, index + 1))
      .every((_, at) => gapBefore(index + 1 + at).replace(/[()]/g, '').trim() === '&&')
    // Salvo que A sea lo que prepara el `cd`: `mkdir T && cd T`.
    const prepares = index > 0 && /^\s*(?:mkdir\s|cd\s|[A-Za-z_]\w*=)/.test(textAt(index - 1))
    if (gapBefore(index).trim() === '&&' && !chained && !prepares) sure = false
    // Una ruta absoluta no depende de lo de antes: si no entra y sigue `&&`, lo encadenado no corre; si existe, entra.
    const sureGap = SURE_GAP.test(gap.replace(/[()]/g, '')) && gap.trim() !== '&&'
    const conditional = blocks > 0
    if (conditional) movedInBlock = true
    const certain = after === '&&' ? chained : !conditional && fs.existsSync(next)
    if (sureGap && certain && path.isAbsolute(target)) sure = true
    const named = parts.slice(0, index).some(({ start, end }) => clean.slice(start, end).includes(target))
    const made = /\bmktemp\b|[$`]/.test(target) || named
    // `cd X && A; git commit`: si X no existe, A no corre y el commit sí, en la carpeta de antes. Salvo que el comando
    // la cree: lo que la nombra puede estar escrito con otra variable.
    const creates = parts.slice(0, index).some((_, at) => CREATES_DIRECTORY.test(textAt(at))
      && (/[$`]/.test(raw(at)) || raw(at).includes(path.basename(target))))
    if (after === '&&' && !chained && !made && !creates && !fs.existsSync(next)) sure = false
    if (/^\s*(?:\{\s*)?pushd\s/.test(textAt(index))) pushed.push(base)
    if (after === '&&' || orExit || made || fs.existsSync(next)) base = next
  }
  if (commitsInFunction(clean)) others.push(...seen)
  const all = [...new Set([...(primary || (others.length ? [] : [cwd])), ...others])]
  // Con dudas y algún repositorio entre los candidatos, se descarta la carpeta que existe sin ninguno: ahí git falla y
  // no commitea nada. Una que no existe puede crearse antes del commit, y una con variable no se sabe cuál es.
  const existing = all.filter((dir) => fs.existsSync(dir))
  if (!existing.some(inRepository)) return [...new Set(all)]
  return [...new Set(all.filter((dir) => !existing.includes(dir) || inRepository(dir)))]
}

module.exports = { directoriesOf }
