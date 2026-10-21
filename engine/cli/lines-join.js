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
const LT = require('../core/line-trees')
const LN = require('./lines')
const C = require('../planning/claims')

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
  if (name && LT.declared(root)[name]) return retire(LN.real(root), name, cli)
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

// Retirar una línea declarada (caso 394). Su trabajo llega a la rama viva de cada repositorio por PR, como el de
// cualquier rama: acá no se mergea nada. Se comprueba que haya llegado y se desarma lo que la línea armó —sus
// árboles, sus ramas, los enlaces de su carpeta y su declaración—. En seco dice qué falta; con `--apply` se
// niega si algo no llegó o tiene cambios sin commitear, porque lo que se retira no vuelve.
function retire(root, name, cli) {
  const branch = `${LNP.BRANCH}${name}`
  const repos = LT.trees(root).filter((one) => one.line === name).map(({ repo, source, tree }) => {
    const live = LNP.startPoint(source)
    const has = branchExists(source, branch)
    // Sin rama no hay nada que perder; con rama, llegó si la viva la contiene.
    const merged = !has || Boolean(live && git(source, 'merge-base', '--is-ancestor', branch, live).status === 0)
    const exists = fs.existsSync(tree)
    const dirty = exists ? (git(tree, 'status', '--porcelain').stdout || '').split('\n').filter(Boolean).length : 0
    return { repo, source, tree, branch, live, has, merged, exists, dirty }
  })
  const ST = require('../planning/state')
  const state = ST.snapshot(path.join(root, 'planning'))
  const milestones = state.milestones.filter((one) => one.line === name
    && one.tasks.some((task) => !state.done.set.has(task.slug))).map((one) => one.slug)
  const report = { line: name, branch, applied: false, repos, milestones }
  const held = repos.filter((one) => !one.merged || one.dirty)
  if (cli.has('--apply')) {
    if (held.length) {
      const why = held.map((one) => heldWhy(one)).join('; ')
      return fail(`la línea ${name} no se puede retirar todavía: ${why}. Si ya se mergeó en el remoto, `
        + '`git fetch` primero: la rama viva se lee de lo último que se bajó.', REFUSED)
    }
    for (const one of repos) {
      if (one.exists) {
        const removed = git(one.source, 'worktree', 'remove', one.tree)
        if (removed.status !== 0) {
          return fail(`git worktree remove falló en ${one.repo}: ${(removed.stderr || '').trim()}`, REFUSED)
        }
      }
      // `-D` y no `-d`: `-d` pregunta contra el `HEAD` del checkout principal, que puede estar en otra rama.
      // Que la viva la contiene ya se comprobó arriba.
      if (one.has) git(one.source, 'branch', '-D', branch)
    }
    const folder = path.join(LT.sessionOf(root), LT.DIR, name)
    if (fs.existsSync(folder)) unlinkOnly(folder)
    const lines = LT.sessionOf(root) && path.join(LT.sessionOf(root), LT.DIR)
    try { fs.rmdirSync(lines) } catch { /* quedan otras líneas */ }
    report.leftover = fs.existsSync(folder) ? folder : ''
    const config = LT.config(root)
    delete config.lines[name]
    if (!Object.keys(config.lines).length) delete config.lines
    fs.writeFileSync(path.join(root, 'ops.config.json'), `${JSON.stringify(config, null, 2)}\n`)
    report.applied = true
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  console.log(`RETIRAR la línea ${name}  (${repos.length} repositorio(s))`)
  for (const one of repos) {
    console.log(`  ${one.repo}  ${one.merged ? `llegó a ${one.live || '(sin rama viva)'}` : heldWhy(one, false)}`
      + `${one.merged && one.dirty ? `, pero ${one.dirty} cambio(s) sin commitear en ${one.tree}` : ''}`)
  }
  if (milestones.length) {
    console.log(`  quedan hitos de la línea sin terminar: ${milestones.join(', ')} — sin la línea no los toma `
      + 'nadie: sacales el `line:` para que los tome la principal, o retirala cuando estén')
  }
  if (report.applied) {
    console.log(`✓ retirada: sin árboles, sin ${branch} y fuera de ops.config.json, que hay que commitear`)
    if (report.leftover) console.log(`  quedó ${report.leftover} con algo que no es de la línea: miralo y borralo`)
  } else if (held.length) console.log('  todavía no se puede retirar')
  else console.log(`Para hacerlo: ops lines join <ops-root> ${name} --apply`)
}

const heldWhy = (one, named = true) => `${named ? `${one.repo}: ` : ''}${one.merged
  ? `${one.dirty} cambio(s) sin commitear en ${one.tree}`
  : one.live ? `${one.branch} no llegó a ${one.live}`
    : `no tiene rama viva contra qué comprobar que ${one.branch} llegó`}`

// Lo que queda de la carpeta de una línea después de sacar sus árboles son enlaces. Se borran ésos y las carpetas
// que quedan vacías, nada más: un enlace se quita sin tocar adonde lleva, y una carpeta con algo adentro que no es
// de la línea se queda, y se dice (R23).
function unlinkOnly(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const at = path.join(dir, entry)
    const stat = fs.lstatSync(at)
    if (stat.isSymbolicLink()) fs.unlinkSync(at)
    else if (stat.isDirectory()) unlinkOnly(at)
  }
  try { fs.rmdirSync(dir) } catch { /* tiene algo propio */ }
}

// A dónde llega lo que la migración trae, dicho antes de traerlo. Avisa y no frena: traerla a una rama de trabajo
// para abrir su PR es legítimo, y lo que faltaba era que se viera. El planning va al HEAD de la instancia, que suele
// ser la rama de un upgrade y no la viva (caso 397, el mismo defecto que el 395 en `ops line`).
//
// No avisa si la rama de la línea está empujada con su PR. Se midió en GitHub: que los mismos commits lleguen a la
// viva por los dos PR, con dos y con cuatro bases de merge, deja el de la instancia en `MERGEABLE CLEAN` (caso 396).
function arrival(root, branch, into, commits) {
  const live = LNP.startPoint(root)
  if (!live) return { live: '', warnings: [] }
  const name = LNP.branchOf(live)
  const warnings = []
  if (into !== name && commits) {
    const line = branch.slice(LNP.BRANCH.length)
    warnings.push(`la instancia está en ${into}; el planning de ${line} va a quedar ahí y no en ${name}. Si es la `
      + 'rama de su PR, está bien; si no, pasate a una antes de --apply.')
  }
  return { live: name, warnings }
}

// Pasar una línea de antes a la disposición nueva (caso 394). La de antes es un worktree de la instancia en
// `line/<nombre>` con su carpeta de sesión al lado, y lo que commiteó ahí es planning: llega a la instancia
// mergeando esa rama en la que tiene el árbol principal, que es lo que hacía `join`. Después se retiran ese
// worktree y su rama, y se arma la línea nueva. Lo del producto no se mueve: sus ramas de tarea siguen donde
// estaban. Sobre lo que no se puede traer —un reclamo en vuelo, que tiene el id del árbol que se va— se niega.
//
// La carpeta de al lado no se borra. Tiene lo que alguien copió a mano para que la línea anduviera —un
// `CLAUDE.md`, permisos—, y eso no se tira sin mirarlo (R23): se dice dónde quedó.
function migrate(dir, name, repos, cli) {
  const root = LN.real(opsRoot(dir))
  const legacy = name && LN.legacyTree(root, name)
  if (!legacy) {
    return fail(`no hay una línea ${name || '(sin nombre)'} de antes en esta instancia: una de antes es un worktree `
      + `de la instancia en ${LNP.BRANCH}${name || '<nombre>'}. \`ops lines migrate <ops-root> <nombre> <repo>...\``,
    USAGE)
  }
  const top = git(root, 'rev-parse', '--show-toplevel').stdout.trim()
  if (LN.real(legacy.tree) === LN.real(top)) {
    return fail(`esto es el árbol de la línea ${name}: migrala desde la instancia principal.`, USAGE)
  }
  const head = git(root, 'symbolic-ref', '--short', '-q', 'HEAD')
  if (head.status !== 0) return fail('la instancia no está en ninguna rama: no hay a dónde traer la línea.', REFUSED)
  const into = head.stdout.trim()
  const branch = `${LNP.BRANCH}${name}`
  const where = LNP.placement(path.join(root, 'planning'))
  const claims = C.read(path.join(legacy.tree, where.relative)).map((one) => one.slug)
  const session = LT.sessionOf(root)
  const commits = Number(git(root, 'rev-list', '--count', `${into}..${branch}`).stdout.trim()) || 0
  const report = {
    line: name, tree: legacy.tree, branch, into, applied: false,
    commits,
    dirty: (git(legacy.tree, 'status', '--porcelain', '--untracked-files=no').stdout || '').split('\n')
      .filter(Boolean).length,
    claims,
    home: session ? path.join(path.dirname(session), `${path.basename(session)}-${name}`) : '',
    ...arrival(root, branch, into, commits),
  }
  const apply = cli.has('--apply')
  // Con --apply el aviso sale antes de traer la línea, y también si --apply se niega: no frena (el 397 decidió que
  // traerla a una rama de trabajo es legítimo), así que lo que garantiza es que quede dicho a dónde fue, no que se
  // pueda decidir antes. Para eso está la corrida sin --apply.
  if (apply && !cli.has('--json')) for (const warning of report.warnings) console.log(`⚠ ${warning}`)
  if (apply) {
    if (report.dirty || claims.length) {
      return fail(`la línea ${name} no se puede migrar todavía: ${[
        report.dirty && `${report.dirty} cambio(s) sin commitear en ${legacy.tree}`,
        claims.length && `reclamos en vuelo (${claims.join(', ')}), que llevan el id del árbol que se retira: `
          + 'cerralos o soltalos desde la línea',
      ].filter(Boolean).join('; ')}.`, REFUSED)
    }
    if ((git(root, 'status', '--porcelain', '--untracked-files=no').stdout || '').trim()) {
      return fail('la instancia tiene cambios sin commitear: commitealos o guardalos antes de traer la línea.',
        REFUSED)
    }
    if (report.commits) {
      const merged = git(root, 'merge', '--no-ff', '--no-edit', '-m', `merge ${branch} into ${into}`, branch)
      if (merged.status !== 0) {
        return fail(`traer ${branch} a ${into} no salió solo: ${(merged.stderr || merged.stdout || '').trim()}\n`
          + 'Resolvé el merge —`ops lines join` clasifica cada conflicto— y repetí la migración.', REFUSED)
      }
    }
    const removed = git(root, 'worktree', 'remove', legacy.tree)
    if (removed.status !== 0) return fail(`git worktree remove falló: ${(removed.stderr || '').trim()}`, REFUSED)
    git(root, 'branch', '-d', branch)
    const made = LN.assemble(root, name, repos)
    if (made.error) {
      return fail(`la línea de antes quedó retirada y su planning en ${into}, pero la nueva no se armó: `
        + `${made.error}`, REFUSED)
    }
    report.applied = true
    report.made = made
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  console.log(`MIGRAR la línea ${name}  ${legacy.tree} (${branch}) → ${LT.DIR}/${name}/`)
  console.log(`  ${report.commits} commit(s) de planning que traer a ${into}`)
  if (report.dirty) console.log(`  ${report.dirty} cambio(s) sin commitear en el árbol de la línea: --apply se niega`)
  if (claims.length) console.log(`  reclamos en vuelo: ${claims.join(', ')} — --apply se va a negar hasta cerrarlos`)
  if (!apply) for (const warning of report.warnings) console.log(`⚠ ${warning}`)
  if (!apply) return console.log(`Para hacerlo: ops lines migrate <ops-root> ${name} <repo>... --apply`)
  LN.print(report.made)
  if (report.home && fs.existsSync(report.home)) {
    console.log(`⚠ ${report.home} era la carpeta de sesión de la línea y ya no se usa. No se borra sola: si le `
      + 'copiaste algo a mano, rescatalo, y después borrala.')
  }
}

module.exports = { join, migrate }
