---
caso: 171
titulo: El catálogo no resuelve desde la raíz declarada, así que `agents list` contesta vacío con exit 0 sobre una instancia sana
estado: resuelto
resuelto-en: 0.96.0
prioridad: alta
version-detectada: 0.95.0
---

# 171 — El catálogo no resuelve desde la raíz declarada

**🟢 resuelto en 0.96.0** · detectado en 0.95.0 · prioridad **alta** — `packageDir` recibió el mismo
candidato que `packagePath` tenía desde el 158

## Resumen

El caso **158** arregló que el motor se resolviera desde la raíz que la instancia **declara** en
`ops.config.json`, que es lo que permite el layout documentado —`npm install` en la carpeta de la empresa
y `cauce init ops` adentro—. Ese arreglo entró en `packagePath`.

**`packageDir` quedó afuera**, y es la que resuelve el catálogo de cargos y recorridos:

```js
// engine/core/ownership.js
function packagePath(root, relative) {
  const above = declaredRoot(root)
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', relative),
    path.join(root, relative),
    ...(above ? [path.join(above, 'node_modules', '@ingeniomaps', 'cauce', relative)] : []),  // ← el 158
  ]
  ...
}

function packageDir(root, name) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', name),
    path.join(root, name),
    // ← nunca mira la raíz declarada
  ]
  ...
}
```

O sea que en el mismo estado en que `check` funciona, el catálogo está vacío.

## Reproducción

Sobre el **paquete publicado 0.95.0**, con el flujo documentado:

```bash
mkdir acme && cd acme && npm init -y
npm install @ingeniomaps/cauce
npx cauce init ops --no-install      # init imprime "siguiente: cd ops && npm install"
cd ops
```

En ese estado —la instancia sin su `node_modules` propio, el paquete arriba— **verificado el 2026-09-16**:

```
check planning   exit=0  ✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
agents list      exit=0  (sin salida)
agents list --json exit=0  []
flow list        exit=0  (sin salida)
evaluate qa-engineer --cases  exit=2  no existe agents/<tipo>/qa-engineer/SKILL.md
learn qa-engineer             exit=2  no existe agents/<tipo>/qa-engineer/SKILL.md
```

Corriendo `npm install` dentro de `ops/`, los mismos comandos devuelven **53 cargos y 7 recorridos**.

## Síntoma

Tres salidas distintas y ninguna dice lo que pasa:

- `agents list` contesta **vacío con exit 0**, que es indistinguible de «esta instancia no tiene cargos».
- `flow list` igual.
- `evaluate` y `learn` culpan a un `SKILL.md` que falta. **Ése es el peor**: manda a mirar el cargo cuando
  lo que no se resuelve es el paquete, así que quien lo lea va a buscar en el lugar equivocado.

Y el contraste es lo que lo vuelve engañoso: `check` pasa en verde en ese mismo estado, porque el motor
**sí** se resuelve. La instancia se ve sana.

## Causa raíz

`engine/core/ownership.js`, las dos funciones citadas arriba. `packagePath` tiene tres candidatos desde el
158; `packageDir` tiene dos y nunca mira `declaredRoot(root)`.

Las dos contestan la misma pregunta —dónde está el paquete— sobre la misma instancia, y desde el 158
contestan distinto. Que sean dos funciones es legítimo: buscan cosas con forma distinta —un archivo y un
directorio con `system/` adentro—. Lo que no es legítimo es que difieran en **dónde buscan**.

## Fix propuesto

Darle a `packageDir` el mismo tercer candidato:

```js
 function packageDir(root, name) {
+  const above = declaredRoot(root)
   const candidates = [
     path.join(root, 'node_modules', '@ingeniomaps', 'cauce', name),
     path.join(root, name),
+    ...(above ? [path.join(above, 'node_modules', '@ingeniomaps', 'cauce', name)] : []),
   ]
   ...
 }
```

Y vale la pena mirar si el catálogo vacío debería además **decirlo** en vez de contestar una lista vacía:
son dos hechos distintos —«no hay cargos» y «no pude resolver el paquete»— y hoy se ven igual. Eso es una
decisión sobre la salida del comando y puede salir como caso propio.

## Tradeoffs

Ninguno visible: es el mismo candidato que `packagePath` ya usa, sobre la misma raíz declarada, y sólo se
consulta cuando los dos primeros fallan. Una instancia con su propio `node_modules` no cambia en nada.

## Prioridad

**Alta.** No rompe una corrida ruidosamente: la deja sin cargos. Un recorrido que elige cargo sobre un
catálogo vacío no encuentra ninguno, y el aviso que recibe quien lo mira apunta a un `SKILL.md`. Es la
misma forma del 158 —nueve errores sobre un motor que estaba instalado— vista desde el otro lado.

## Contexto de descubrimiento

2026-09-16, en la prueba de punta a punta del paquete publicado 0.95.0: instalar, `init`, y recorrer toda
la superficie del CLI. Salió en el primer barrido, antes de correr el `npm install` que `init` indica —o
sea, exactamente donde un CI o un arranque con `--no-install` lo deja—.

**Consultado para escribir esto**: `engine/core/ownership.js` (`packagePath` líneas 135-143, `packageDir`
166-173) del paquete `@ingeniomaps/cauce@0.95.0` instalado desde el registro; y las salidas de `check`,
`agents list`, `flow list`, `evaluate` y `learn` sobre esa instancia, antes y después del `npm install`
dentro de `ops/`.

## Relacionados

- **158** — arregló `packagePath` para este mismo layout. Éste es la mitad que quedó.

## Cierre

**Resuelto en 0.96.0.** El caso se escribió con el defecto ya reproducido sobre el paquete publicado, así
que no hubo diagnóstico que contrastar: la causa estaba a la vista en las dos funciones.

Recorriendo lo que enumeró:

- **`packageDir` sin el candidato de la raíz declarada → se hizo.** Recibió el mismo tercero que
  `packagePath` tiene desde el 158, sobre la misma raíz y consultado sólo cuando los dos primeros fallan.
- **«`agents list` contesta vacío con exit 0» → cerrado.** En el mismo layout devuelve los 53 cargos.
- **«`flow list` igual» → cerrado.** Devuelve los 7 recorridos. Salen del mismo `packageDir`.
- **«`evaluate` y `learn` culpan a un `SKILL.md` que falta» → cerrado por la raíz del problema.** Con el
  paquete resuelto, `evaluate qa-engineer --cases` contesta `01-risk-strategy 4 comportamiento(s)`.
- **«Vale la pena mirar si el catálogo vacío debería decirlo» → sale como caso propio, el 173.** Con esto
  arreglado el silencio deja de ocurrir por esta causa, pero un catálogo genuinamente vacío sigue
  contestando igual que uno irresoluble, y eso es una decisión sobre la salida del comando.

Y lo que apareció escribiendo la prueba, que el caso no preveía:

- **`flow list` ignora un posicional.** La primera aserción le pasó el target y midió el cwd del proceso
  de prueba. `flow` resuelve su raíz por `opsRoot()` mientras todos sus hermanos toman una, así que
  `ops flow list <raíz>` corre contra otra cosa sin decirlo. **Sale como caso propio, el 172**: es la misma
  forma que el `-h` del 0.95.0 —un argumento que parece aceptado y no lo es— y no le tocaba a este caso.

### Qué se corrió

- **La reproducción del propio caso, sobre el paquete publicado `@ingeniomaps/cauce@0.95.0` bajado del
  registro**: instalar en la carpeta de la empresa, `init ops`, y correr la superficie sin el `npm install`
  de adentro. Antes: `check` verde, `agents list` vacío con exit 0, `evaluate` culpando al `SKILL.md`.
  Después del arreglo, sobre el mismo layout: **53 cargos, 7 recorridos** y `evaluate` contestando.
- **Rojo previo** sobre la prueba del 158, que medía sólo el motor y ahora mide también el catálogo: en ese
  layout la lista llegaba vacía.
- **Mutación**: quitado el tercer candidato, la prueba vuelve a rojo.
- `npm run ci` exit 0: **908 pruebas**, 0 en rojo, 0 salteadas.

### De dónde salió

De la prueba de punta a punta del paquete publicado, pedida para validar el release: instalar desde el
registro y recorrer toda la superficie del CLI. Apareció en el primer barrido. Ninguna prueba de la suite
lo veía porque todas montan el paquete donde siempre funcionó — que es exactamente lo que el 158 ya había
dicho de sí mismo, y lo que hizo falta para encontrar su otra mitad fue instalar de cero.
