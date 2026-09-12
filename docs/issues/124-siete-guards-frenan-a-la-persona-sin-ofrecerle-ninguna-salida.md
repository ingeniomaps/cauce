---
caso: 124
titulo: Siete guards frenan también lo que la persona pide y no le ofrecen ninguna salida, ni variable ni archivo ni «dale»
estado: resuelto
resuelto-en: 0.84.0
prioridad: alta
version-detectada: 0.83.0
---

# 124 — Un guard sin salida trata igual a la persona que al agente

**🟢 resuelto en 0.84.0**

## Resumen

Los guards existen para contener al agente cuando trabaja solo —dentro de una tarea, dentro de
`autobuild`—, no para interrogar a la persona que está pidiendo algo. Desde 0.81.0 el motor **sabe**
distinguirlos: `CHAT.said` separa el turno en curso de la persona, un mensaje anterior de la sesión, un
subagente, un recorrido de Cauce y «sin persona».

Pero esa señal es **opt-in guard por guard**, y siete de los diecinueve que pueden frenar nunca la
consultaron. Para esos siete no hay ninguna salida: ni variable de entorno, ni línea en
`planning/.ops-approval`, ni contestar «dale». Lo que la persona pide con todas las letras se frena igual
que lo que el agente decidió solo.

El daño no es teórico y no está repartido parejo: entre esos siete está `destructive`, cuyas reglas
cubren trabajo de desarrollo diario —`git reset --hard`, `git clean -f`, `git checkout -- .`,
`docker compose down`, `docker system prune`—. Pedirlos explícitamente no servía de nada.

Y hay una asimetría que nadie decidió: **leer** una credencial se podía aprobar desde 0.80.0
(`secrets-read` consulta la aprobación), y **escribirla** no (`secrets` frenaba sin ofrecer nada).

## Reproducción

```bash
cd "$(mktemp -d)"
node <ruta-al-motor>/engine/cli/ops.js init acme-ops --name Acme --mode sidecar --no-install
cd acme-ops
# Con el hook de mensaje registrando lo que la persona dijo, y habiéndolo pedido con todas las letras:
#   persona: «corré docker compose down»
#   agente:  Bash(docker compose down)
```

## Síntoma

```
Detener un stack Compose puede interrumpir servicios compartidos.
```

Y nada más: el mensaje no dice cómo autorizarlo, porque no había forma. La comparación que lo delata es
con cualquier otro guard, que al frenar agrega «si contesta "dale", reintentá el mismo cambio y pasa».

## Causa raíz

- `engine/hooks/shell.js` — el bucle de `destructive` era
  `for (const [pattern, message] of rules) if (pattern.test(command)) block(message)`: bloquea sin
  consultar nada.
- `engine/hooks/files.js` — `secrets`, `generated`, `integrationSnapshot` y `engineWrites` llamaban a
  `block()` directo, mientras su vecino `secretsRead` ya consultaba `approved()`.

Ninguno de los cuatro es una decisión registrada: son **anteriores al canal de chat de 0.81.0** y nadie
volvió a pasarles por encima cuando el canal existió. El comentario que justifica no tener salida en
`destructive` argumenta sólo por las dos ramas de reescribir historia publicada; las otras cinco reglas
nunca recibieron esa justificación.

## Fix propuesto

Cablear la pregunta «¿lo pidió la persona?» en los que no la hacían, reusando el patrón que ya usan seis
guards, y **no** en los que una persona tampoco debería poder abrir pidiéndolo.

Con salida: las cinco reglas no-R8 de `destructive`, más `secrets`, `generated`,
`integration-snapshot` y `engine`.

Sin salida, y con la razón: el force-push y `git commit --amend`, que R8 prohíbe sin excepción
configurable; el borrado de disco; `rm -r` sobre raíz, home o el padre, que es la clase que gobierna R23;
y `git add -A`, cuyo precedente ya estaba escrito.

## Tradeoffs

- **Se pierde un freno de reflejo** sobre `git reset --hard` y `git checkout -- .` cuando la persona los
  pide. El comentario de `shell.js` registra que ese comando se llevó puesto trabajo sin commitear dos
  veces en una sesión. Se acota con el alcance del ítem: se aprueba **el comando entero tal como llegó**,
  así que cualquier otra bandera es otro comando y vuelve a preguntarse.
- **`planning-drift` queda afuera** y no por olvido: es un guard de cierre de sesión, no frena una acción
  que alguien pidió, así que «¿lo pidió la persona?» no significa nada ahí.
- **El bloqueo de estos guards no nombra ninguna variable**, porque no tienen apagado por sesión.
  Anunciar el permiso más ancho cuando alcanza el angosto es lo que hizo que la variable quedara como la
  vía a mano (caso 089).

## Prioridad

**Alta.** Es la causa medida de que la herramienta se perciba como un estorbo: siete de diecinueve guards
contradiciendo el principio que los justifica, y el de mayor frecuencia entre ellos.

## Contexto de descubrimiento

Lo levantó el dueño del producto el 2026-09-12, con esta queja: «si le doy acciones a la IA me restringes
en vez de dejarlo correrlo; y una cosa es el autobuild y otra yo mandando a hacer. Siento que con Cauce
está peor que cuando no lo adopté».

El inventario que salió de ahí midió las cuatro formas de destrabar un guard: siete se destraban con que
la persona lo pida, tres exigen «dale», dos exigen editar un archivo, y **siete no tienen ninguna**.

## Relacionados

- **117** — registra la otra mitad: que una autorización ya dada no se puede dejar registrada con alcance.
  Este caso es sobre los guards que ni siquiera preguntan; aquél, sobre los que preguntan de más.
- **109** — fijó que nombrar no es pedir, y esa precisión es la que este cambio reusa.
- **116** — lo que un guard deja pasar queda concedido y se hereda; es lo que obligó a que los negativos de
  las pruebas nuevas corran en su propia sesión.
- **089** — por qué no se anuncia una variable cuando no hace falta.

## Cierre

**🟢 resuelto en 0.84.0** · `engine/hooks/shell.js`, `engine/hooks/files.js`, `engine/hooks/approval.js`,
`test/wiring/hooks.test.js`

### Contra lo que el caso enumeró

**Las cinco reglas no-R8 de `destructive`** — hecho. El bucle lee un tercer elemento que dice si la regla
tiene salida, y el ítem que se aprueba es el comando entero tal como llegó. Se eligió entero y no el
fragmento que matcheó porque `git clean -f` no aparece completo dentro de «corré git clean -fd», así que
aprobar el pedazo no destrabaría lo que la persona escribió.

**`secrets`, `generated`, `integration-snapshot` y `engine`** — hecho, con el mismo patrón de
`secrets-read`: `approved(input, file)` saltea y el mensaje agrega `AP.HOW`.

**Lo que se queda sin salida** — hecho, y con la razón en el código: force-push y `--amend` por R8,
el borrado de disco, y `rm -r` sobre raíz, home o padre por R23.

**`planning-drift` queda afuera** — se decidió que no, por la razón del Tradeoff: no frena una acción
pedida.

**El tradeoff del freno de reflejo** — asumido y acotado, no ignorado: el alcance del ítem es el comando
entero, así que la aprobación no se estira a una variante.

**El tradeoff de la variable** — hecho: `AP.HOW` admite no recibir ninguna y entonces no la nombra. Los
doce llamadores que ya existían pasan una y no cambian.

### Lo que apareció y el caso no preveía

**Las pruebas negativas se tapaban solas.** La primera redacción ponía «nombrar no es pedir» en la misma
sesión de chat que los casos positivos, y por el 116 lo que pasó quedaba concedido y se heredaba: el
`blocked` siguiente no podía frenar porque el ítem ya estaba autorizado. Se vio en rojo como `Missing
expected exception`, y se arregló abriendo una sesión nueva para los negativos, que es el recaudo que la
prueba del 118 ya tomaba.

**El cambio de `HOW` no tenía prueba.** Se agregó la que contrasta los dos lados: el bloqueo de `secrets`
no nombra variable y el de `secrets-read` sigue nombrando `OPS_SECRETS_READ_OVERRIDE`.

### Qué se corrió

- **Rojo previo.** Las tres pruebas nuevas contra el motor sin tocar: `tests 97, pass 94, fail 3`, y cada
  una por el motivo correcto —`Got unwanted exception: git reset --hard`, `Got unwanted exception:
  secrets`, y el mismo sobre el motor—: el guard lanzaba sobre algo que la persona había pedido.
- **Verde.** `node --test test/wiring/hooks.test.js`: **97 de 97**. Puerta completa: `npm run ci` y
  `npm test` en 0, **765 de 765**, cobertura en su piso.
- **Cuatro mutaciones, cada una en su copia desechable (R23), las cuatro rojas:**

  | Mutación | Qué se apagó | Prueba que se puso roja |
  |---|---|---|
  | M1 | la salida de `destructive` (`open` ignorado) | «deja pasar lo que la persona pidió…» |
  | M2 | todas las reglas abiertas, R8 incluidas | la misma, por los negativos |
  | M3 | `secrets` vuelve a frenar sin consultar | «los guards de archivo dejan pasar…» |
  | M4 | `HOW` nombra la variable siempre | la misma, por la aserción de ausencia |

  **M2 es la que sostiene el cambio**: prueba que abrir las cinco reglas no abrió las de R8. Sin ella, el
  verde sólo diría que la salida funciona, no que lo cerrado siguió cerrado — que es la mitad que R9 pide
  cuando lo que se entrega quita un freno.
