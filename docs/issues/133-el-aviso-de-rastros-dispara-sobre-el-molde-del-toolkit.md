---
caso: 133
titulo: El aviso de rastros locales dispara sobre el molde de este repositorio, donde esos archivos no existen ni pueden existir, y nombra rutas distintas de las que consultó
estado: abierto
prioridad: baja
version-detectada: 0.86.0
---

# 133 — La puerta del toolkit se queja de tres rastros que este repositorio nunca va a tener

**🔴 abierto**

## Resumen

El 128 agregó un aviso: si git no está ignorando los rastros locales —`planning/.verify-log`,
`planning/.push-log`, `planning/.grant-log`— `check` lo dice, para que no entren al repositorio de la
empresa por descuido. En una instancia funciona y está probado.

En **este** repositorio, que es el toolkit, el mismo aviso salta en cada corrida de la puerta y es falso
por dos razones distintas:

- **Los rastros no existen ni pueden existir acá.** `ops.config.json` declara `mode: toolkit`, no hay
  `planning/` en la raíz —`AGENTS.md` lo prohíbe con todas las letras— y el único planning que vive acá
  es `template/planning`, que es el molde que se distribuye.
- **El aviso nombra rutas que no son las que consultó.** La puerta corre `check template/planning`, así
  que la raíz que recibe es `template/`; desde ahí pregunta por `template/planning/.verify-log` y
  **imprime** `planning/.verify-log`. Quien haga caso pegaría tres líneas que no cubren lo que el aviso
  miró.

Sale en cada `npm run ci`, y salió también dentro del `publish` de 0.86.0, que es donde se vio: el
`prepublishOnly` corre la puerta entera y el aviso quedó impreso en el log de la release.

## Reproducción

```bash
# En el repositorio del toolkit, sin preparar nada:
npm run check
```

## Síntoma

```
> @ingeniomaps/cauce@0.86.0 check
> node engine/cli/ops.js check template/planning

⚠ 3 rastro(s) local(es) que git no ignora (planning/.verify-log, planning/.push-log, planning/.grant-log); agregá esas líneas a tu .gitignore o van a entrar al repositorio
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
```

Y el estado real contra el que ese aviso se emite, medido el 2026-09-13:

```
planning/.verify-log: no existe
planning/.push-log:   no existe
planning/.grant-log:  no existe
¿hay planning/ en la raíz?: no
mode del repositorio: toolkit
rastros dentro del molde: 0
```

## Causa raíz

`engine/core/trails.js:33-40`. `unignored(root)` le pregunta a git si ignoraría tres rutas y **nunca
pregunta si esa raíz es una instancia**:

```js
function unignored(root) {
  const asked = spawnSync('git', ['check-ignore', '--', ...LOCAL], { cwd: root, encoding: 'utf8' })
  if (asked.status !== 0 && asked.status !== 1) return []
  const covered = new Set(asked.stdout.split('\n').map((one) => one.trim()).filter(Boolean))
  return LOCAL.filter((one) => !covered.has(one))
}
```

El módulo ya eligió callarse cuando no hay a quién preguntarle —`check-ignore` sale 128 y devuelve
vacío—, y esa degradación está escrita y razonada en su encabezado. Lo que no contempló es la otra forma
de no tener sentido: hay repositorio y contesta, pero **la pregunta no aplica a esa raíz**. Medido:
`git check-ignore` sale 1 tanto desde la raíz como desde `template/`, así que las tres se reportan como
no ignoradas y el aviso dispara.

El motor **ya sabe** hacer esa distinción, y el precedente está a la vista en un guard que resolvió lo
mismo: `engine/hooks/files.js:346`, `if (config.mode === 'toolkit') return`, con el comentario que lo
explica —«en modo `toolkit` no aplica: ahí el motor es el producto»—.

La segunda capa es de mensaje y vive en `engine/cli/planning.js:181`:

```js
warnings.push(...TR.warnings(path.resolve(root, '..')))
```

La raíz es el **padre del directorio de planning**, que en una instancia es la instancia y acá es
`template/`. Las rutas de `LOCAL` son literales relativas a esa raíz, así que lo consultado y lo impreso
coinciden en una instancia y divergen acá.

## Fix propuesto

No está decidido; son tres formas y la elección cambia qué se promete.

1. **Callarse en `mode: toolkit`**, siguiendo el precedente de `files.js:346`. Es la más directa y la más
   acotada: el toolkit es el único lugar donde la pregunta no aplica por construcción. Pide que
   `warnings()` reciba la configuración o la raíz ops, que hoy no recibe.
2. **Avisar sólo de lo que puede existir.** Comprobar que exista el `planning/` al que las rutas apuntan
   antes de preguntar. Es independiente del modo y cubre también una raíz mal apuntada; el costo es que
   deja de ser preventivo en el único caso donde hoy lo es —una instancia recién creada, donde el rastro
   todavía no se escribió pero se va a escribir—, así que probablemente haya que combinarlo con lo
   anterior en vez de reemplazarlo.
3. **Nombrar las rutas como se consultaron.** Independiente de las dos anteriores y hay que hacerlo igual:
   un aviso que dice `planning/.verify-log` cuando preguntó por `template/planning/.verify-log` manda a
   pegar una línea que no cubre nada. Si se toma la opción 1 el caso desaparece de esta raíz, pero el
   defecto sigue vivo para cualquier otra donde la raíz y el planning no sean padre e hijo directo.

Cualquiera que se tome, **lo que no puede romperse** está fijado en `test/planning/ignored-trails.test.js`
y verificado en vivo el 2026-09-13 contra una instancia real: con el `.gitignore` del molde el aviso
calla; con el `.gitignore` pelado avisa nombrando las tres rutas; sin repositorio calla; y en sidecar
mira el repositorio del workspace y no la instancia.

## Tradeoffs

- **Es ruido, no daño.** Nadie pierde trabajo por este aviso: es una advertencia, `check` sigue saliendo
  0 y nada se bloquea.
- **Lo que sí cuesta es la credibilidad de la puerta.** Un aviso que aparece en todas las corridas y que
  siempre hay que ignorar enseña a ignorar los avisos, que es el argumento que este repositorio usa en
  `R10` para decir cuáles de sus límites comprueba el motor y cuáles no. Y ya viajó a un lugar donde no
  se puede borrar: el log de publicación de 0.86.0.
- **La opción 1 agranda la superficie de `warnings()`**, que hoy recibe una ruta y nada más. Pasarle la
  configuración lo acopla a `ops.config.json`; es el mismo acoplamiento que ya tiene `files.js`, así que
  no es nuevo en el motor, pero sí en este módulo.
- **La opción 2 puede tapar un caso legítimo**: una instancia donde alguien borró `planning/` a mano
  dejaría de recibir el aviso. Es raro y probablemente tenga problemas peores.

## Prioridad

**Baja.** No rompe nada, no pierde trabajo y no le llega a ningún usuario del paquete: `check` sobre una
instancia se comporta bien y está probado. Lo que arregla es que la puerta de este repositorio deje de
mentir una vez por corrida.

Sube a media si el mensaje se corrige sin corregir la premisa —o sea, si se toma la opción 3 sola—,
porque entonces el aviso pasaría a nombrar `template/planning/.verify-log` y sería un consejo **peor**:
una ruta del molde que nadie debe ignorar.

## Contexto de descubrimiento

Salió leyendo el log de publicación de 0.86.0 para verificar que el `npm publish` había ocurrido de
verdad. El aviso estaba ahí, dentro del `prepublishOnly`, entre la salida de la puerta. No lo buscaba: lo
que buscaba era la línea `+ @ingeniomaps/cauce@0.86.0`.

Vale decir que el 128 hizo lo correcto al no contemplarlo. Ese caso se escribió sobre una instancia de
una empresa, que es donde el aviso tiene sentido, y esta raíz es la única del mundo donde no lo tiene:
no hay otra instalación de Cauce en `mode: toolkit` que la que fabrica Cauce.

## Relacionados

- **128** — el caso que introdujo el aviso; su conducta en una instancia es correcta y está probada.
- **121** — la misma degradación elegida para las filas resueltas: antes callar de más que avisar de más,
  que es exactamente el criterio que este caso pide extender a una raíz donde la pregunta no aplica.
