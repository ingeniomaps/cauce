---
caso: 181
titulo: El guard de manifest bloquea por qué archivos están staged y no por qué cambió dentro, y su mensaje promete un «dale» que su código no consulta
estado: resuelto
resuelto-en: 0.98.0
prioridad: media
version-detectada: 0.96.0
---

# 181 — Cambiar un script del `package.json` frena el commit, y el desbloqueo que el mensaje ofrece no existe

**🟢 resuelto en 0.98.0** · detectado en 0.96.0, presente igual en 0.97.0 · prioridad **media**. Se
registró como dos defectos; al verificarlo, el primero se confirmó y el segundo no se reprodujo (ver Cierre).

## Resumen

El guard de dependencias de `shell` frena todo commit que lleve un manifest al índice sin su lockfile. La
condición mira **qué archivos están staged**, nunca el contenido del diff, así que un cambio que no toca
ninguna dependencia —agregar un script a `scripts`, fijar un `coverageThreshold`— se bloquea igual que un
`npm install` sin lock regenerado.

Eso por sí solo sería fricción con salida. El problema es la segunda mitad: **el mensaje del bloqueo dice
que un «dale» de la persona destraba el reintento, y el código del guard no consulta ninguna aprobación de
sesión.** El desbloqueo se resuelve con `AP.pendingNow(...)`, que lee `planning/.ops-approval` y la
variable de entorno. La palabra «dale» no aparece en `engine/hooks/shell.js`.

Quien recibe el bloqueo hace lo que el mensaje dice: pide el «dale», reintenta, y vuelve a frenar. Con el
comando byte a byte idéntico. La conclusión que saca es que la salida del guard no es confiable, y el
camino que le queda a la vista es `OPS_DEPENDENCIES_OVERRIDE=1`, que apaga la comprobación para toda la
sesión.

## Reproducción

En cualquier repo con `package.json` y `package-lock.json` versionados:

1. Editar sólo un script del `package.json` —por ejemplo, quitar `--passWithNoTests` de `test:cov`— sin
   tocar `dependencies` ni `devDependencies`.
2. `git add package.json` y cualquier otro archivo del cambio. **No** stagear el lockfile: no hace falta,
   porque ninguna dependencia se movió.
3. `git commit -m "…"`.

Frena. Pedir el «dale» a la persona y reintentar el mismo comando: frena otra vez.

## Síntoma

```
BLOQUEADO: .: cambió package.json sin actualizar su lockfile.
Decile a la persona qué se frenó y por qué, y esperá: si contesta «dale», reintentá el mismo cambio y pasa.
```

Lo segundo no ocurre. En la sesión que originó este caso el guard frenó **tres veces** el mismo tipo de
commit, y las tres necesitaron que una persona interviniera: dos veces para nada, porque el «dale» que dio
no tenía efecto.

## Causa raíz

`engine/hooks/shell.js:253` en 0.97.0 (`:230` en 0.96.0):

```js
const manifests = sinAprobar(parent, state.manifests)
if (state.manifests.length && existingLocks.length && !state.locks.length && manifests.length) {
  block(`${parent}: cambió ${state.manifests.join(', ')} sin actualizar su lockfile.\n`
    + AP.HOW('OPS_DEPENDENCIES_OVERRIDE', manifests, input))
}
```

Las cuatro condiciones son sobre **presencia de archivos**: hay un manifest staged, existe un lockfile,
el lockfile no está staged, y el manifest no figura aprobado. Ninguna abre el diff, así que el guard no
puede distinguir un cambio de dependencias de un cambio de script.

Y el texto que acompaña sale de `AP.HOW('OPS_DEPENDENCIES_OVERRIDE', …)`, un generador compartido por
todos los guards que describe el circuito del «dale». Este guard no participa de ese circuito: su única
puerta es `sinAprobar` → `AP.pendingNow(opsRoot(input), …)` (`:208`/`:252`), que consulta el archivo de
aprobación. El mensaje es correcto para los guards que sí tienen memoria de sesión, y falso para éste.

## Fix propuesto

Dos partes, y la segunda es la que importa más aunque la primera se vea antes.

**1. Mirar el diff del manifest, no su presencia en el índice.** Antes de bloquear, comparar los bloques
de dependencias entre `HEAD` y el índice; si no cambiaron, no hay nada que frenar:

```js
const depsChanged = (dir, manifest) => {
  const read = (ref) => {
    const r = run('git', ['-C', dir, 'show', `${ref}:${manifest}`], dir)
    if (!r.ok) return null
    try { return JSON.parse(r.output) } catch { return null }
  }
  const [head, staged] = [read('HEAD'), read(':0')]
  if (!head || !staged) return true   // sin poder comparar, se frena como hoy
  const keys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies',
                'overrides', 'resolutions', 'packageManager', 'engines']
  return keys.some((k) => JSON.stringify(head[k]) !== JSON.stringify(staged[k]))
}
```

y agregar `&& depsChanged(dir, enParent(name))` a la condición. El caso en que la comparación no se puede
hacer —manifest nuevo, JSON inválido, `git show` que falla— vuelve al comportamiento de hoy: se frena.

**2. Que el mensaje diga la verdad.** O este guard acepta la aprobación de sesión como los demás, o
`AP.HOW` recibe una variante que no menciona el «dale» y manda directo a `.ops-approval`. Cualquiera de
las dos sirve; lo que no puede quedar es la promesa incumplida, porque es lo que empuja al override.

## Tradeoffs

* El fix 1 agrega un `git show` por manifest staged, sólo cuando el guard ya decidió que iba a bloquear.
  No cuesta nada en el camino normal.
* Sigue frenando lo que debe: un `npm install` que mueve una versión toca `dependencies`, así que la
  comparación lo ve.
* Queda un hueco conocido y aceptable: un cambio que toca a la vez un script y una dependencia se frena,
  aunque el motivo real sea la dependencia. Eso es correcto, no un falso positivo.
* El fix 2 no tiene tradeoff: es decir lo que el código hace.

## Prioridad

**Media.** El bloqueo tiene salida, así que no frena definitivamente, y el daño directo es fricción
medida —tres veces en una sesión, dos intervenciones humanas inútiles—. Lo que lo acercaría a alta es el
efecto de la segunda mitad: un guard cuya salida se comprueba falsa enseña a no leerla, y el camino que
queda a la vista apaga la comprobación entera para la sesión. Eso es exactamente el modo de fallo que la
propia regla de puertas del toolkit nombra: una puerta que estorba se saltea con la variable de escape, y
desde ahí no protege de nada.

## Contexto de descubrimiento

Sesión del 2026-09-22 en la instancia `roax-ops` (Cauce 0.96.0), construyendo el hito de tests y CI de
`backend-auth`. El commit llevaba cuatro specs nuevos y un `package.json` con dos cambios: quitar
`--passWithNoTests` del script `test:cov` y agregar `coverageThreshold` con los valores medidos. Ninguna
dependencia se movió y el lockfile no tenía por qué cambiar.

El mismo guard había frenado antes en la misma sesión, con la misma forma, al commitear un script de
verificación cableado en `scripts` del `package.json` de `frontend-auth`.

## Relacionados

* **170** — «el dale no dice hasta dónde llega» (resuelto en 0.95.0). Distinto: ahí el alcance de una
  aprobación existente era demasiado estrecho; acá el circuito del «dale» no llega a este guard.
* **119** — «nombrar el archivo de aprobación no controla qué se escribe adentro». Mismo mecanismo de
  aprobación, otro ángulo.
* **151** — «la mitigación de pnpm en verify es un no-op y ningún commit con lockfile pasa». Toca
  lockfiles, pero en `verify` y no en el guard del manifest.

## Cierre

**Resuelto en 0.98.0 en su primera mitad. La segunda no se reprodujo, y el arreglo que el caso
proponía para la primera habría abierto un hueco.** Recorriendo lo que enumeró:

- **«Mirar el diff del manifest, no su presencia en el índice» → se hizo distinto, con la razón.** El
  caso proponía comparar ocho claves de dependencias y dejar pasar todo lo demás. Se midió antes de
  escribirlo, con npm 11.16.0: `npm install --package-lock-only` cambiando una clave por vez. Resultado:
  `name`, `version`, `license`, `engines`, `bin`, `funding`, `workspaces`, `os`, `cpu` y los scripts
  `preinstall`, `install` y `postinstall` también mueven `package-lock.json`. El fix del caso habría
  dejado pasar, por ejemplo, un cambio de versión sin su lock.

  Por eso quedó al revés, cerrado por defecto (R27). `lockUnaffected` en `engine/hooks/shell.js` deja
  pasar el commit sólo si:
  - el lockfile es `package-lock.json` y ningún otro;
  - `HEAD` y el índice tienen el `package.json` y los dos se parsean;
  - toda clave que cambió está en la lista medida: `scripts` (sin tocar los tres de instalación),
    `description`, `keywords`, `author`, `repository`, `homepage`, `bugs`, `private`, `type`, `main`,
    `files`, `exports`, `config`, `jest`, `eslintConfig` y `prettier`.

  Cualquier otra cosa, o lo que no se pueda comparar, frena como antes. Con pnpm, yarn o bun no se
  afloja nada: no se midió su lock.
- **«Que el mensaje diga la verdad» → se decidió que no hacía falta: el mensaje ya la decía.** El caso
  afirmaba que el guard no consulta ninguna aprobación de sesión. No es así: `sinAprobar` →
  `AP.pendingNow` → `CHAT.unauthorizedNow` (`engine/hooks/approval.js:66`) consulta el «dale» del chat,
  además de `.ops-approval`. Que la palabra no aparezca en `shell.js` es cierto; el circuito vive en
  `chat.js`.
- **Tradeoff «un `git show` por manifest staged» → aceptado.** Son dos, y sólo cuando el guard ya iba a
  frenar.
- **Tradeoff «un script y una dependencia juntos se frenan» → confirmado**, con su prueba.

Lo que el caso no preveía: **por qué el «dale» no destrabó en roax sigue sin saberse.** En este
repositorio funciona desde antes de 0.93.0 (`chat-effects.test.js`). Las causas posibles, ninguna
comprobable desde acá: el commit lo corrió un subagente o un recorrido, donde `CHAT.said` no concede
nada a propósito, o la instancia no tenía instalado el hook que registra el mensaje. Con este arreglo,
el commit que lo originó ya no se frena, así que no hay un «dale» que dar. Si vuelve a pasar con otro
cambio, lo que falta registrar es desde qué tipo de sesión se commiteó.

### Qué se corrió

- **La medición del lock**, en un directorio desechable con npm 11.16.0: cada clave cambiada por
  separado contra el lock base, con el resultado igual o distinto que resume el punto de arriba.
- **Prueba nueva en `test/hooks/commit.test.js`**, «guard-dependencies deja pasar lo que no llega al
  lockfile de npm, y sólo eso».
  - Pasan: un script, la configuración de `jest` y la descripción.
  - Frenan: una dependencia, la versión, un `postinstall`, `engines`, un script junto con una
    dependencia, un script con `pnpm-lock.yaml` y un manifiesto nuevo con sólo scripts.
- **Cinco mutaciones en una copia del árbol, las cinco en rojo**:
  - Sin el filtro, que es el rojo previo: vuelve el comportamiento de antes.
  - Sin la lista de claves.
  - Aceptando cualquier gestor.
  - Ignorando los scripts de instalación.
  - Comparando un manifiesto que `HEAD` no tiene. Ésta sobrevivió la primera vez, porque el escenario
    traía claves que la lista ya frenaba; se ajustó el escenario y quedó en rojo.
- **El «dale» sobre este guard**: «lo concedido no abre un gate de commit, y gobernanza no interroga a
  la persona» (`test/hooks/chat-effects.test.js`) en verde. Ejercita `dependencies` con un manifiesto
  sin su lock, un mensaje que no autoriza (frena) y un «dale» (pasa).

### Prueba real posterior, 2026-09-23

El hook real, `automatization/hooks/guard-dependencies.sh`, con el JSON de PreToolUse por stdin como lo
invoca el runner, sobre un repo de un banco `suelto` con `package.json` y `package-lock.json` commiteados:

```
== script nuevo (el caso de roax):  exit=0
== jest coverageThreshold:          exit=0
== version:        exit=2 BLOQUEADO: .: cambió package.json sin actualizar su lockfile.
== dependencia:    exit=2 BLOQUEADO: …
== postinstall:    exit=2 BLOQUEADO: …
```

Y el mismo script nuevo con el guard de `v0.97.0` (`git archive v0.97.0`): `exit=2 BLOQUEADO`.
