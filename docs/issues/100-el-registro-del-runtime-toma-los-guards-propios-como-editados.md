---
caso: 100
titulo: El registro del runtime guarda la huella de los guards propios, y editarlos los deja «editados localmente» hasta que un `--force` miente que los descartó
estado: resuelto
resuelto-en: 0.82.0
prioridad: media
version-detectada: 0.80.0
---

# 100 — Un guard propio en `automatization/hooks/` aparece como archivo del toolkit editado

**🟢 resuelto en 0.82.0** · detectado en 0.80.0, reproducido en 0.81.0 · prioridad **media** — no pisa nada; ensucia la
lista de lo que la empresa editó del molde, que es justo la lista que hay que poder creerle, y la única salida
que ofrece anuncia un descarte que no hace

## Resumen

El CHANGELOG le dice a la empresa que su guard propio va en `automatization/hooks/` y sobrevive a
`automation install` (entrada 0.55.0, `CHANGELOG.md:1359-1367`: «si moviste tu guard fuera de esa carpeta
para sortearlo, ya podés devolverlo»). Pero `upgrade` guarda en `.cauce/manifest.json` la huella de **todo**
lo que hay en esa carpeta, no sólo de lo que el paquete entrega. En cuanto la empresa edita su propio guard,
cuenta como edición del molde, y eso se ve en tres lugares:

- `upgrade --check` lo lista como «editado localmente» y **sale con código 1**, igual que con una edición real
  del molde. Un CI que use `--check` como puerta queda en rojo por un archivo que Cauce no trae.
- `check` avisa «1 archivo(s) del molde congelados por edición local».
- Cada `upgrade` sin `--force` lo «conserva» y vuelve a escribir la huella vieja, así que el aviso no se va.

La única forma de sacarlo de la lista es `upgrade --force`, y ahí el daño cambia de clase: imprime
«− descartado tu cambio en automatization/hooks/guard-propio.sh», **no descarta nada** —el archivo conserva
la edición— y registra la huella nueva. El aviso se va porque ahora la huella coincide, y vuelve con la
próxima edición. Es la misma mentira que el 048: una línea de descarte sobre un archivo que quedó intacto.

En la instancia donde se vio, 2 de los 14 «congelados» eran guards que Cauce no trae y que ningún `--force`
va a reemplazar.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable:

```bash
BANCO=$(mktemp -d); OPS=$PWD/engine/cli/ops.js; A=$BANCO/acme
node $OPS init $A --mode embedded --install >/dev/null
printf '#!/usr/bin/env bash\nexit 0\n' > $A/automatization/hooks/guard-propio.sh
node $OPS upgrade $A | tail -3
grep -c guard-propio $A/.cauce/manifest.json
ls $A/node_modules/@ingeniomaps/cauce/automatization/hooks | grep -c guard-propio
echo '# ajuste' >> $A/automatization/hooks/guard-propio.sh
node $OPS upgrade $A --check | grep -E 'editado|al día'; echo "exit=${PIPESTATUS[0]}"
node $OPS check $A/planning | grep congelados
node $OPS upgrade $A --force | grep descartado
tail -1 $A/automatization/hooks/guard-propio.sh
node $OPS upgrade $A --check | grep -cE 'editado'
```

## Síntoma

Salida real, 2026-09-11, con el checkout en 0.81.0 (`main`):

```
✓ Cauce 0.81.0 → 0.81.0
  35 ruta(s) del sistema y 1 del runtime actualizadas
  planning, organization y todo lo propio quedaron intactos
1
0
  editado localmente: automatization/hooks/guard-propio.sh
= 0.81.0: la instancia está al día con el motor instalado
exit=1
⚠ 1 archivo(s) del molde congelados por edición local; `upgrade` los conserva y no les trae mejoras
− descartado tu cambio en automatization/hooks/guard-propio.sh
# ajuste
0
```

El manifiesto registra `guard-propio.sh` (1) aunque el paquete no lo trae (0); al editarlo pasa a ser una
«edición local» de algo que Cauce nunca entregó, `--check` sale con 1 y `check` lo cuenta como congelado.
`--force` dice que lo descartó y la última línea del archivo sigue siendo `# ajuste`; el `0` final es que ya
no figura como editado, porque la corrida registró la huella del contenido que decía descartar. En una
corrida aparte se comparó esa huella con la del disco: `34b4f53e655436eb` las dos.

La primera parte ya se había visto así con el paquete publicado 0.80.0, que es donde se detectó.

## Causa raíz

- `engine/cli/instance.js:117` (adopción con `init --force`, en `scaffold`) y `:400` (en `upgrade`):
  `M.record(root, relative, O.treeFiles(dir), …)` registra en cada ruta del runtime `treeFiles(dir)` —todo
  lo que hay en disco—, no lo que el paquete tiene en esa ruta.
- `engine/cli/instance.js:279`, `O.localChanges(root)`: compara cada huella registrada contra el disco
  (`engine/core/ownership.js:299-311`), así que un archivo propio registrado y después editado cuenta como
  edición del molde. De ahí salen las tres señales: el código 1 de `--check`
  (`engine/cli/upgrade-report.js:158`, `return changed.length ? 1 : 0`) y el aviso de `check`
  (`engine/cli/planning.js:185-187`, que llama a la misma función).
- `engine/cli/instance.js:403`: lo conservado vuelve a tomar la huella de lo «entregado» antes de
  re-registrar. Para un archivo del molde es lo correcto —es lo que impide pisarlo dos upgrades después—;
  para un guard propio perpetúa la huella vieja, y por eso el aviso no se va sin `--force`.
- `engine/cli/instance.js:421`, `descartados: force ? changed : []`: con `--force`, todo lo que
  `localChanges` listó se anuncia descartado (`upgrade-report.js:84`), pero `copyRuntime` (`instance.js:71`)
  sólo escribe lo que el paquete trae. Un archivo que el paquete no tiene no se toca, y la línea miente.

Que `copyRuntime` sólo escriba lo del paquete es también por qué no hay pérdida: el guard propio no se pisa,
ni con `--force`. Salvo cuando el paquete empieza a traer uno con el mismo nombre, que es el 110.

## Fix propuesto

Registrar, en las rutas del runtime, sólo los archivos que existen en la ruta equivalente del paquete: la
intersección entre `treeFiles(dir)` de la instancia y `treeFiles` del origen. Un archivo que el paquete no
trae es de la empresa y no entra al manifiesto. Van las **dos** llamadas, `instance.js:117` y `:400`: con
sólo la segunda, una adopción con `init --force` de una carpeta que ya tenía guards propios los registra
igual, y el defecto vuelve por la puerta de `init`.

Y `localChanges` tiene que filtrar contra lo que trae el paquete, no sólo el registro. La migración no llega
sola: `localChanges` corre en `:279`, **antes** de re-registrar en `:400`, así que en el primer `upgrade` con
el arreglo las huellas viejas siguen ahí, el guard propio se lista como editado y se conserva, y `:403` le
devuelve la huella vieja al registro recién podado. Leído en el código y no corrido: con el arreglo sólo en
el registro, la entrada vieja no se poda nunca. Filtrando en `localChanges` se cortan las tres cosas a la
vez —el aviso, el código 1 y el «descartado» falso—, y el registro podado de `:400` ya no recibe nada de
vuelta en `:403`.

## Tradeoffs

- **Un archivo que el paquete deja de traer** en una versión nueva pasa a contar como de la empresa: sin
  huella, no se retira ni se avisa. Hoy no tiene casos —`git log --diff-filter=DR -- automatization/hooks`
  no devuelve ningún commit: el paquete nunca retiró ni renombró un guard—, y `retired` ya cubre las rutas
  retiradas enteras. Si un día se retira uno, conviene que la corrida lo nombre en vez de adoptarlo en
  silencio.
- **Se va la protección accidental del 110.** Hoy un guard propio registrado y después editado es lo único
  que `upgrade` conserva cuando el paquete empieza a traer uno con su nombre. Con este arreglo ningún guard
  propio queda registrado, así que esa colisión pasa a pisarlo siempre y sin aviso. Este caso no se cierra
  sin que el 110 tenga su decisión tomada.
- Ninguno en el borrado: el registro no decide qué se escribe, sólo qué se reporta.

## Qué tiene que probar el cierre

- La reproducción de arriba no lista `guard-propio.sh` como editado, el manifiesto no lo registra,
  `--check` sale con 0 y `check` no avisa congelados. Aserción de ausencia, vista en rojo con el registro
  de hoy.
- `upgrade --force` no imprime «descartado» sobre un archivo que el paquete no trae. Aserción de ausencia,
  vista en rojo.
- Una adopción con `init --force` sobre una carpeta que ya tenía un guard propio no lo registra.
- Una instancia con huellas viejas de guards propios —las que deja el registro de hoy— queda limpia después
  de **un** `upgrade` sin `--force`: el guard no se lista como editado en esa misma corrida y el manifiesto
  deja de registrarlo. Es el ítem que el arreglo sólo en el registro no pasa.
- Un guard **del paquete** editado sigue apareciendo como «editado localmente» y conservado: el arreglo no
  puede apagar el aviso que sí sirve.

## Contexto de descubrimiento

Instancia real (sidecar, 0.80.0), 2026-09-11. Al analizar los 14 archivos que `upgrade --check` daba por
congelados para decidir cuáles adoptar, dos resultaron ser guards propios (`guard-load.sh`,
`guard-roax-verify.sh`) que el paquete no trae; se habían editado el 2026-09-10 después de un `upgrade` que
ya los había registrado.

Al correr el caso sobre 0.81.0 aparecieron el código 1 de `--check`, el aviso de `check` y el «descartado»
de `--force`, que la versión original no nombraba y decía que el aviso «no se va nunca».

## Relacionados

- **110** — la otra mitad del mismo registro: un guard propio que **no** está registrado se pisa sin aviso
  cuando el paquete empieza a traer su nombre. El arreglo de éste deja a todos los guards propios sin
  registrar, así que el 110 se decide antes o junto con éste.
- **048** — `upgrade` diciendo «descartado tu cambio» sobre lo que conservó; acá es la misma línea sobre lo
  que ni siquiera podía tocar.
- **044** — `upgrade` sin resolución por archivo; el mismo registro decide qué se conserva.
- El CHANGELOG (entrada 0.55.0, `CHANGELOG.md:1359-1367`) que manda los guards propios a esa carpeta: este
  caso es lo que le falta para que la recomendación no tenga costo.

## Cierre

**🟢 resuelto en 0.82.0** · `engine/core/ownership.js`, `engine/cli/instance.js`, cerrado junto con el 110

### Contra lo que el caso enumeró

- **Registrar sólo lo que trae el paquete, en las dos llamadas** — hecho: `deliveredFiles` (`ownership.js`)
  cuenta del runtime sólo lo que el paquete que corre trae en esa ruta, y la usan el registro de `scaffold`
  —la adopción con `init --force`— y el de `upgrade`.
- **`localChanges` filtra contra el paquete** — hecho con la misma función, así que la migración ocurre en el
  primer `upgrade`: el guard propio con huella vieja no se lista, no se conserva y no le vuelve la huella en
  `:403`. Además `upgrade` suelta del registro las entradas del runtime que el paquete no trae.
- **El «descartado» falso de `--force`** — se va con el mismo filtro: `descartados` sale de `changed`, y un
  guard propio ya no está ahí.
- **Tradeoff «un archivo que el paquete deja de traer»** — se cumple como estaba descrito: pasa a contar como
  de la empresa. Hoy no hay casos; el día que se retire un guard, va a `RETIRED` con su nombre.
- **Tradeoff «se va la protección accidental del 110»** — no se va: el 110 se cierra en el mismo cambio, y un
  guard propio que el paquete empieza a traer se conserva y se nombra, registrado o no.
- **Cada ítem de «Qué tiene que probar el cierre»** — hechos los cinco: la reproducción sin «editado», con
  `--check` en 0 y sin congelados; `--force` sin «descartado»; la adopción con `init --force`; la huella vieja
  limpia en un solo `upgrade`; y un guard del paquete editado sigue conservado —la prueba `upgrade conserva lo
  editado, actualiza el resto y lo dice`, que sigue en verde—.

### Lo que el caso no preveía

- **La prueba nueva llevaba `upgrade.test.js` a 554 líneas**, arriba del límite de 500. Fue a su propio
  archivo, `test/instance/upgrade-own-guards.test.js`: lo que no es de Cauce es otro sujeto que lo que el
  toolkit reemplaza.

### Qué se corrió

- **El rojo previo**: la prueba nueva sobre la base, 0 de 1 —el registro traía el guard propio,
  `d5caa92a1cad4f05`—.
- **Una instancia real**, hecha con el 0.80.0 publicado y actualizada con el paquete empaquetado de la rama.
  El `upgrade` de 0.80.0 había registrado el guard propio (`true`); después de editarlo:

  ```
  --- upgrade --check
    choca con uno tuyo: automatization/hooks/guard-chat.sh      ← del 110; guard-propio no aparece
  --- después de upgrade
  guard-propio conserva su ajuste: 1
  registro guard-propio: false
  ```
- **Mutaciones, en una copia desechable (R23)**: registrar todo lo que hay en el runtime y no soltar lo
  registrado de más, las dos rojas. Las otras seis de la tanda son del 110.
- **La pasada de comentarios** en 0.22 contra la base: ningún par nuevo.
- `npm run ci`, con los archivos nuevos ya en el índice: código 0, 702 de 702, cobertura de 61 archivos en su
  piso o por encima, ningún export sin uso.

### Recorrido de la auditoría (2026-09-12)

- **El camino sin `--force`, que este caso marcó como el discriminante, sí tiene prueba propia**: es
  `test/instance/upgrade-own-guards.test.js:98`, que escribe la huella vieja en el manifiesto y corre
  `run(['upgrade', target])` **pelado** —sin `--force`—, afirmando que el guard se conserva y que lo sigue
  conservando en la corrida siguiente. La auditoría lo señaló como hueco porque el cierre no la citaba y la
  prueba vecina usa `--force`; el hueco era de la cita, no de la cobertura.
