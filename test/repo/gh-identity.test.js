'use strict'

// El guard que exige credencial en cada `gh`. Vive en `.claude/` y no en `engine/` —es la credencial
// de este repositorio, y en el motor bajaría a toda empresa en su próximo `upgrade`— así que no lo
// cubre nada del paquete; esta prueba existe para que igual tenga una.
//
// Se lo ejecuta como lo ejecuta el harness, con el JSON del PreToolUse por stdin y mirando el código
// de salida: lo que decide es `exit 2`, y afirmar sobre el fuente daría por buena una condición mal
// cableada.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const HOOK = path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'gh-identity.js')

function correr(command) {
  const hecho = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8',
  })
  return { bloqueado: hecho.status === 2, salida: hecho.status, stderr: hecho.stderr }
}

test('un `gh` sin credencial se bloquea', () => {
  for (const command of [
    'gh pr list',
    'gh api user -q .login',
    'cd /tmp && gh run list',
    'echo hola; gh pr merge 1',
    'GH_TOKEN2=x gh pr list',
  ]) {
    assert.equal(correr(command).bloqueado, true, `debería bloquear: ${command}`)
  }
})

test('un `gh` con la credencial en la misma línea pasa', () => {
  for (const command of [
    'GH_TOKEN="$GITHUB_PAT_CAUCE" gh pr list',
    'set -a; . ./.env; set +a; GH_TOKEN="$GITHUB_PAT_CAUCE" gh api user',
    'GITHUB_TOKEN=x gh run list',
    // R14 pide poder comprobar una versión sin ceremonia.
    'gh --version',
    'gh --help',
  ]) {
    assert.equal(correr(command).bloqueado, false, `no debería bloquear: ${command}`)
  }
})

// El caso que lo hizo fallar: un separador dentro de comillas no separa nada, y el guard leía el `|`
// de un patrón de grep como si fuera un pipe. Bloqueó una lectura inocua el 2026-08-31, y un guard
// que salta cuando no debe es el que se termina desactivando.
test('un `gh` que es texto de búsqueda, y no un comando, no se bloquea', () => {
  for (const command of [
    'grep -n "push\\|gh pr\\|force" .github/workflows/agent-learning.yml',
    "grep -E 'gh pr create|git push' Makefile",
    'echo "usá: gh api user"',
    'rg "gh auth login" docs/',
  ]) {
    const hecho = correr(command)
    assert.equal(hecho.bloqueado, false, `no debería bloquear: ${command}\n${hecho.stderr}`)
  }
})

// El hueco que deja vaciar las comillas: un ejecutor recibe su comando como cadena, así que ahí se
// analiza la línea entera y se prefiere el falso positivo al agujero.
test('un `gh` escondido dentro de un ejecutor sigue bloqueándose', () => {
  for (const command of [
    'bash -c "gh pr list"',
    "sh -c 'gh api user'",
    'eval "gh run list"',
  ]) {
    assert.equal(correr(command).bloqueado, true, `debería bloquear: ${command}`)
  }
})

// Un guard que no entiende su entrada bloquea, nunca permite.
test('una entrada que no se entiende bloquea en vez de dejar pasar', () => {
  const hecho = spawnSync(process.execPath, [HOOK], { input: 'no soy json', encoding: 'utf8' })
  assert.equal(hecho.status, 2, 'stdin ilegible tiene que bloquear')
})

// Lo destapó el commit que arregló el caso del ejecutor: su mensaje **explicaba** esa forma, la palabra
// `bash` del texto encendió la excepción, y el guard bloqueó un `git commit`. El cuerpo de un heredoc
// es lo que se escribe en un archivo, no un comando; prosa que cita un comando es el caso común.
test('un comando citado dentro de un heredoc es texto, no una invocación', () => {
  const heredoc = [
    "cat > msg.txt <<'EOF'",
    'fix(hooks): the guard reads commands',
    '',
    'That leaves a hole where a runner takes its command as a string,',
    'so bash -c "gh pr list" gets the whole line analysed instead.',
    'EOF',
    'git commit -F msg.txt',
  ].join('\n')
  const hecho = correr(heredoc)
  assert.equal(hecho.bloqueado, false, `no debería bloquear un heredoc de prosa\n${hecho.stderr}`)
})
// El hueco que dejaba sacar todo heredoc del análisis: cuando quien lo recibe es un shell, ese cuerpo
// sí se ejecuta. Lo decide la línea que abre el heredoc, no el heredoc.
test('un heredoc que alimenta un shell sí es un comando', () => {
  for (const command of [
    "bash <<'EOF'\ngh pr list\nEOF",
    'sh <<EOF\ngh api user\nEOF',
    "bash -s <<'EOF'\ncd /tmp\ngh run list\nEOF",
  ]) {
    const hecho = correr(command)
    assert.equal(hecho.bloqueado, true, `debería bloquear:\n${command}`)
  }
})

// Y el caso común sigue pasando: el mismo cuerpo, escrito a un archivo, es texto.
test('el mismo cuerpo escrito a un archivo sigue siendo texto', () => {
  const hecho = correr("cat > script.sh <<'EOF'\ngh pr list\nEOF")
  assert.equal(hecho.bloqueado, false, `no debería bloquear:\n${hecho.stderr}`)
})
// Un `.sh` en un nombre de archivo no es un shell. Con la excepción del ejecutor buscando la palabra
// suelta, ese punto alcanzaba para apagar el vaciado de comillas y bloquear una lectura inocua: el
// guard ya lo hacía antes de tocar los heredocs, y ninguna prueba lo miraba.
test('un archivo .sh nombrado no convierte el texto en un comando', () => {
  for (const command of [
    'cat deploy.sh | grep "gh pr create"',
    'grep -n "gh auth" scripts/release.sh',
  ]) {
    const hecho = correr(command)
    assert.equal(hecho.bloqueado, false, `no debería bloquear: ${command}`)
  }
})
