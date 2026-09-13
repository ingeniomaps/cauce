---
caso: 131
titulo: El barrido de superficie muerta no lo prueba nadie, y desactivarlo se ve exactamente igual que un repositorio limpio
estado: abierto
prioridad: media
version-detectada: 0.86.0
---

# 131 — `dead-code.js` decide qué sobra y ninguna prueba lo vigila

**🔴 abierto**

## Resumen

`test/tools/dead-code.js` son 381 líneas y once funciones de decisión —`bindings`, `candidates`,
`opaqueModules`, `resolvedUses`, `checkExports`, `checkSuites`, `checkEngine`—, corre en `ci` desde
0.86.0 y decide qué import y qué export del repositorio sobran. **Ninguna prueba lo nombra.**

Lo que lo vuelve serio no es la ausencia en sí, sino la forma de su salida: cuando no encuentra nada
imprime `✓ ninguna superficie muerta` y sale **0**. Una herramienta rota y un repositorio limpio
producen exactamente el mismo texto y el mismo código. No hay ninguna señal que distinga «barrí y no
había nada» de «no barrí».

## Reproducción

Sobre una copia desechable hecha con `tar` —por qué no sirve una hecha con `git ls-files`, en el 129—:

```bash
# 1. Control: se inyecta un import que nadie usa, con un identificador que no colisione.
#    (después de la línea `const { spawnSync } = require('node:child_process')`)
#    const zzunused = require('node:os')
grep -c zzunused engine/core/trails.js     # 1, confirmado antes de medir

node test/tools/dead-code.js               # lo caza, exit 1

# 2. Se apaga la herramienta por dentro: candidates() devuelve siempre vacío.
#    function candidates(files) {
#  +   if (files) return []
node test/tools/dead-code.js               # ✓ ninguna superficie muerta, exit 0

# 3. ¿Lo nota alguna prueba?
node --test "test/repo/*.test.js"          # 82 pruebas, 82 pass, 0 fail
```

## Síntoma

Medido el 2026-09-13. El control caza, cada uno con su corrida de confirmación:

```
=== engine/core/trails.js ===
    1 candidato(s) en 81 archivo(s), 1 corrida(s).
    ✗ 1 sin uso:
      engine/core/trails.js:17 zzunused
    exit=1
=== engine/hooks/trail.js ===
      engine/hooks/trail.js:23 zzunused
    exit=1
=== engine/core/repos.js ===
      engine/core/repos.js:9 zzunused
    exit=1
```

Con `candidates()` apagado, el mismo árbol —con el import muerto adentro— devuelve:

```
  0 candidato(s) en 69 suite(s), 0 corrida(s).
  0 candidato(s) en 81 archivo(s), 0 corrida(s).
  0 export(s) sin uso en 1462 archivo(s), 0 corrida(s).
  ✓ ninguna superficie muerta
  exit=0
```

Y la suite del repositorio, con la herramienta así:

```
  ℹ tests 82
  ℹ pass 82
  ℹ fail 0
```

## Causa raíz

No hay un `archivo:línea` que esté mal: el defecto es una ausencia. Ninguna suite de `test/` nombra a
`test/tools/dead-code.js`, y `npm test` no lo invoca —lo invoca `npm run ci`, como paso aparte—, así que
no hay ninguna corrida en la que una herramienta rota pueda manifestarse.

Lo que convierte esa ausencia en un riesgo silencioso es `test/tools/dead-code.js:370-378`: cuando
`dead` está vacío imprime `✓ ninguna superficie muerta` y sale 0. Ese camino ya tiene **una** defensa
contra el falso verde, y conviene decirlo porque marca el molde de lo que falta: si la suite no está
verde, la corrida se declara `inconclusive` y el mensaje cambia a `⚠ sin confirmar: la suite no está
verde`. O sea que el archivo ya distingue «no pude medir» de «medí y no había nada» **para una** causa de
ceguera, y no para las demás.

## Fix propuesto

Una suite propia —`test/repo/dead-code.test.js`, junto a la del piso de cobertura, porque es una
convención que este repositorio se promete a sí mismo y no algo que una empresa herede—. Lo mínimo que
la haría morder:

1. **Que caza lo que tiene que cazar.** Un árbol de prueba con un import que nadie usa y la aserción de
   que aparece en la salida con su archivo y su línea. La sonda de la reproducción ya es esta prueba.
2. **Que no acusa lo que sí se usa**, que es la mitad cara: un falso positivo manda a borrar código
   vivo. Un import usado una sola vez, y otro usado sólo dentro de un string, que es el caso que
   `candidates()` declara resolver hacia el lado seguro.
3. **Que un export nombrado en otro archivo no se propone**, que es la rama de `checkExports`.
4. **Que la ceguera se ve.** Con la suite en rojo, la salida tiene que decir `⚠ sin confirmar` y no `✓`.

Vale la pena mirar si el arnés puede montar un árbol chico en vez de correr sobre el repositorio entero:
la sonda de arriba tarda lo que tarda una confirmación real —una corrida de la suite por candidato—, y
una prueba que cuesta un minuto no se corre. Si no se puede, el caso lo dice y se corre acotado.

## Tradeoffs

- **Probar esta herramienta es caro por construcción.** Confirma un candidato **corriendo la suite** sin
  ese binding; eso es su diseño y es lo que la hace confiable. Una prueba que la ejercite de punta a
  punta hereda ese costo, así que probablemente haya que probar las funciones puras —`bindings`,
  `candidates`, `exportNames`— por separado de la confirmación.
- **El archivo hoy corre como script**, así que importarlo ejecuta el barrido entero. Igual que en el
  129 con `--baseline=`, va a hacer falta una costura mínima; a diferencia de aquél, acá probablemente
  sea un `require.main === module`, que es el idioma que ya usa el puente de Antigravity.
- **Cubrirlo no sube ningún número.** `test/` no entra en el piso de cobertura, así que esto no lo va a
  reclamar ninguna puerta: lo reclama este caso o no lo reclama nadie.

## Lo que además hay que saber

**La heurística de `candidates()` da por vivo un identificador corto, y es conducta declarada, no un
defecto.** Cuenta apariciones con `\b<nombre>\b` sobre el archivo entero —comentarios incluidos— y sólo
propone si aparece una vez. Con prosa en español, un binding llamado `os` aparece en los comentarios y
queda «vivo»: la primera versión de esta reproducción usó `os` y el control falló, y la conclusión
apresurada habría sido «hay un falso negativo». No lo hay. El comentario de la función lo dice antes de
que nadie lo mida: «el conteo se equivoca sólo hacia el lado seguro —da por vivo lo que aparece dentro
de un string—, así que propone de menos y nunca de más».

Quien escriba las pruebas tiene que saberlo por dos razones: un caso con un identificador corto **va a
fallar** y parecerá un bug de la herramienta, y **fijar esa conducta con una prueba** es justamente una
de las que valen —hoy vive sólo en un comentario, y un comentario no impide que alguien la «arregle»
bajando el umbral y llene la salida de falsos positivos—.

## Prioridad

**Media.** No rompe nada hoy: la sonda muestra que la herramienta funciona. Lo que hace es que su rotura
sea indistinguible de su éxito, y que el barrido de `ci` pueda quedar inerte durante meses sin que nada
lo diga — que es, palabra por palabra, el defecto que el 129 destapó para la puerta de cobertura.

Sube a alta el día que alguien toque `dead-code.js`, porque ese día no hay nada que le avise si lo
rompió.

## Contexto de descubrimiento

Salió contando qué herramientas de `test/tools/` tienen pruebas, después de cerrar el 129: cero para
ésta. La primera reproducción se escribió mal dos veces —una inyección que nunca entró, y después un
identificador que colisionaba con la prosa— y las dos veces el error se vio porque el guion verificaba
el paso intermedio en vez de creerle al código de salida. Eso también es parte del caso: la conducta de
esta herramienta es fácil de medir mal.

## Relacionados

- **129** — el mismo defecto en la puerta de cobertura: un mecanismo que nadie comprueba que muerda.
- **130** — las cuatro ramas viejas de `coverage-files.js` que ninguna aserción mira.
- **132** — `hooks-smoke.sh`, la tercera herramienta de la puerta, con una prueba que no puede fallar.
