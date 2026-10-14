'use strict'

// Traer una línea de trabajo a la rama del árbol donde se corre. En seco dice qué pasaría: cuántos commits
// trae, qué archivos chocan y qué hacer con cada uno, qué épicas repiten número y qué reclamos en vuelo
// vienen con ella. Con `--apply` hace el merge y corre `check` sobre lo que quedó, que es donde se ve la fila
// de acciones humanas que volvió a pendiente. Nunca empuja.
//
// Qué pasaría se calcula con `git merge-tree --write-tree`, que fusiona de verdad sin tocar el worktree:
// verificado con git 2.43, sale 1 con conflictos y lista sus rutas después del árbol resultante.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const LNP = require('../planning/lines')
const { fail, opsRoot, REFUSED, USAGE } = require('./io')

const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
const branchExists = (cwd, name) => git(cwd, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`).status === 0

// Una línea por su nombre, o una rama cualquiera por el suyo: desde una línea, lo que se trae es la principal.
function resolveSource(root, name) {
  if (name && LNP.NAME.test(name) && branchExists(root, `${LNP.BRANCH}${name}`)) return `${LNP.BRANCH}${name}`
  if (name && branchExists(root, name)) return name
  const lines = LNP.worktrees(root).map((one) => one.branch).filter((one) => one.startsWith(LNP.BRANCH))
    .map((one) => one.slice(LNP.BRANCH.length))
  return fail(`no existe la línea ${name || '(sin nombre)'} ni una rama con ese nombre. Hay: `
    + `${lines.join(', ') || '(ninguna)'}. \`ops lines join <ops-root> <nombre> [--apply]\``, USAGE)
}

const listed = (root, ref, dir) => (git(root, 'ls-tree', '--name-only', ref, `${dir}/`).stdout || '')
  .split('\n').filter(Boolean)

function join(dir, name, cli) {
  const root = opsRoot(dir)
  const planning = path.join(root, 'planning')
  if (!fs.existsSync(path.join(planning, 'BACKLOG.md'))) {
    return fail(`${root} (ruta resuelta) no es una raíz ops: falta planning/BACKLOG.md.`, USAGE)
  }
  const where = LNP.placement(planning)
  if (!where) return fail(`${root} no está en un repositorio git: las líneas son worktrees de él.`, REFUSED)
  const head = git(root, 'symbolic-ref', '--short', '-q', 'HEAD')
  if (head.status !== 0) return fail('este árbol no está en ninguna rama: no hay a dónde traer la línea.', REFUSED)
  const target = head.stdout.trim()
  const source = resolveSource(root, name)
  if (source === target) return fail(`ya estás en ${target}.`, USAGE)

  const commits = Number(git(root, 'rev-list', '--count', `${target}..${source}`).stdout.trim()) || 0
  const probe = git(root, 'merge-tree', '--write-tree', '--name-only', '--no-messages', target, source)
  if (probe.status > 1) return fail(`git merge-tree falló: ${(probe.stderr || '').trim()}`, REFUSED)
  const files = probe.stdout.split('\n').slice(1).filter(Boolean)
  const roadmap = `${where.relative ? `${where.relative}/` : ''}roadmap`
  const claimsDir = `${where.relative ? `${where.relative}/` : ''}claims`
  const report = {
    source, target, commits, applied: false,
    // Sucio es lo trackeado con cambios: un archivo suelto no lo toca el merge, y casi siempre hay alguno.
    dirty: (git(root, 'status', '--porcelain', '--untracked-files=no').stdout || '').split('\n').filter(Boolean).length,
    conflicts: LNP.classifyConflicts(where.relative, files),
    duplicates: LNP.duplicateEpics(listed(root, target, roadmap), listed(root, source, roadmap)),
    // Sólo los reclamos que el merge trae: los que ya están de los dos lados llegaron en un join anterior.
    claims: (git(root, 'diff', '--name-only', '--diff-filter=A', `${target}...${source}`, '--', claimsDir).stdout || '')
      .split('\n').filter(Boolean).map((one) => path.basename(one, '.md')).filter((one) => one !== 'README'),
  }
  const apply = cli.has('--apply')
  if (apply && report.dirty) {
    return fail(`el árbol tiene ${report.dirty} cambio(s) sin commitear: commitealos o guardalos antes de juntar.`,
      REFUSED)
  }
  // Con conflictos el merge queda en curso, que es lo que git hace: la clasificación de arriba es para
  // resolverlos, y abortarlo es un `git merge --abort` que se dice.
  if (apply && commits) {
    const merged = git(root, 'merge', '--no-ff', '--no-edit', '-m', `merge ${source} into ${target}`, source)
    report.applied = merged.status === 0
    report.inProgress = !report.applied && git(root, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD').status === 0
    if (!report.applied && !report.inProgress) {
      return fail(`git merge falló: ${(merged.stderr || '').trim()}`, REFUSED)
    }
  }
  // Sobre lo que quedó, no sobre lo que se calculó: la fila revivida y la épica repetida las ve `check`. En
  // JSON viaja adentro del informe, para que la salida siga siendo un solo documento.
  const json = cli.has('--json')
  let checked = null
  if (report.applied) {
    const args = [path.join(__dirname, 'ops.js'), 'check', planning, ...(json ? ['--json'] : [])]
    checked = spawnSync(process.execPath, args, { encoding: 'utf8' })
    if (json) {
      try { report.check = JSON.parse(checked.stdout) } catch {
        report.check = { ok: false, output: `${checked.stdout || ''}${checked.stderr || ''}` }
      }
    }
    if (checked.status !== 0) process.exitCode = 1
  }
  if (json) console.log(JSON.stringify(report))
  else {
    print(report, name)
    if (checked) process.stdout.write(`${checked.stdout || ''}${checked.stderr || ''}`)
  }
  if (report.inProgress) {
    return fail('el merge quedó en curso: resolvé los conflictos y commiteá, o git merge --abort.', REFUSED)
  }
}

function print(report, name) {
  const { source, target, commits, conflicts, duplicates, claims, dirty, applied } = report
  console.log(`JUNTAR ${source} → ${target}  (${commits} commit(s) que traer)`)
  if (!commits) return console.log('  nada que traer: la rama ya tiene todo lo de la línea')
  if (conflicts.length) {
    console.log('  conflictos:')
    for (const one of conflicts) console.log(`    ${one.file} — ${one.kind}: ${one.advice}`)
  } else console.log('  sin conflictos')
  if (duplicates.length) {
    console.log('  épicas con el mismo número:')
    for (const one of duplicates) {
      console.log(`    ${one.num}: ${one.files.join(', ')} — renumber-epic sobre la que todavía no llegó a ${target}`)
    }
  }
  if (claims.length) console.log(`  reclamos en vuelo: ${claims.join(', ')} — traer la línea ahora trae media tarea`)
  if (applied) return console.log(`✓ mergeado en ${target}. Lo que dice check:`)
  if (report.inProgress) return
  if (dirty) console.log(`  el árbol tiene ${dirty} cambio(s) sin commitear: --apply se va a negar`)
  console.log(`Para hacerlo: ops lines join <ops-root> ${name} --apply`
    + (conflicts.length ? ' — deja el merge en curso, con esos conflictos para resolver' : ''))
}

module.exports = { join }
