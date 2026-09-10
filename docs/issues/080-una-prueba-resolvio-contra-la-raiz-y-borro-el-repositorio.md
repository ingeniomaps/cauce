---
caso: 080
titulo: Una prueba resolvió una salida vacía contra la raíz del toolkit y borró el repositorio entero
estado: resuelto
resuelto-en: 0.77.0
prioridad: alta
version-detectada: 0.76.0
---

# 080 — El repositorio desapareció de la máquina dos veces en una tarde, y la línea que lo borró era correcta

**🟢 resuelto en 0.77.0** · detectado en 0.76.0 · prioridad **alta** — no rompe una corrida: se lleva el
trabajo, y con él la posibilidad de revisarlo

## Resumen

`test/agents/bench.test.js` derivaba la ruta de un banco así:

```js
const dir = path.resolve(toolkit, run(['evaluate', …]).stdout.trim())
fs.chmodSync(dir, 0o500)
try { … } finally {
  fs.chmodSync(dir, 0o755)
  fs.rmSync(dir, { recursive: true, force: true })
}
```

Con el comando fallando, `stdout` viene vacío. Y `path.resolve(toolkit, '')` **es** `toolkit`: la raíz del
repositorio. El `finally` le quitaba permisos y la borraba recursivamente con `force`.

O sea que **cualquier cambio que hiciera fallar `evaluate --bench` convertía la suite en un borrador del
repositorio** — y hacer fallar el comando bajo prueba es exactamente lo que un cambio del motor hace
mientras se lo valida.

## Reproducción

Ocurrió dos veces el 2026-09-10, sobre este repositorio, con distinto disparador:

1. Un cambio del motor a medio validar hizo fallar `evaluate --bench`. La suite corrió y el repositorio
   desapareció.
2. Ya con la comprobación de destino escrita, **una mutación que la apagaba**. La prueba que la ejercía le
   pasaba la raíz del repositorio a la función que borra, y con la comprobación apagada la borró.

La segunda es la más instructiva: la defensa estaba escrita y la prueba que la cuidaba era el arma.

```
$ node -e 'console.log(path.resolve("/ruta/al/repo", ""))'
/ruta/al/repo
```

## Síntoma

Ninguno antes, y total después. Lo que sobrevive es lo que estaba empujado. Lo gitignoreado —credenciales
locales, notas, lo que no se commiteó— no vuelve: acá se perdió el `.env` las dos veces.

## Causa raíz

Tres, y hay que nombrarlas separadas porque se arreglan distinto.

1. **Una ruta peligrosa que se construye sola.** Nadie escribió «borrá el repositorio»: escribió «borrá el
   banco», y el banco resultó ser la raíz porque la salida vino en blanco. La línea del borrado se lee
   perfecta; el defecto está tres líneas más arriba.
2. **Decidir y destruir en la misma función.** Mientras la comprobación vive adentro del borrado, la única
   forma de probarla es pasarle rutas reales y peligrosas a la función que borra. Ahí apagar la
   comprobación no es un fallo de aserción: es el desastre.
3. **Un banco de pruebas bajo `$HOME`.** `outsideTempRoot` colgaba de `~/.cache`, así que la carpeta
   personal de quien corre las pruebas estaba dentro del alcance de todo lo que la suite borra.

## Fix propuesto

Ninguno especulativo: está hecho. Ver el cierre.

## Tradeoffs

- **La comprobación de destino no es gratis en expresividad**: una prueba que quisiera borrar algo fuera
  de lo desechable ahora tiene que declararlo. Es el punto.
- **`/var/tmp` no existe en todas las plataformas.** Hoy la suite corre en Linux y macOS, donde sí. Lo que
  lo reabriría es alguien corriéndola en Windows.
- **Los dos barridos exceptúan dos archivos** —el que implementa el borrado y el que implementa los
  barridos—, así que un borrado peligroso escrito ahí no se vería. Es nulo hoy y está medido: ninguno de
  los dos hace una sola llamada real que escriba o borre.

## Contexto de descubrimiento

Trabajando el caso 078. El operador lo dijo mejor que este resumen: «donde esto pase en una empresa que
decidió no tener repo o no commitear, nos metemos en problemas graves». Y después: «nunca uses home para
probar; donde llegue a pasar un borrado de todo el disco destrozarías absolutamente todo mi sistema».

## Relacionados

- **R23** — la regla que sale de acá, en `template/planning/rules/system/conduct.md`. Baja a cada
  instancia en su próximo `upgrade`.
- [078](078-por-que-rmsync-vuelve-sin-lanzar-sigue-sin-establecerse.md) — el caso que se estaba
  trabajando cuando ocurrió. Sigue abierto.

## Cierre

**Resuelto en 0.77.0**, con tres cambios de mecanismo y una regla. Lo que los ordena es una propiedad que
antes no se cumplía y ahora sí: **ninguna prueba le pasa a la función que borra una ruta que no quiera
perder.**

### Decidir se separó de destruir

`undeletable(target, roots)` recibe cadenas y devuelve un motivo; **no toca el disco**. `discard(target)`
la consulta y borra. Con eso, la prueba que ejerce el rechazo trabaja sobre rutas **fabricadas** —`/`, una
casa inventada, la raíz de un proyecto inventado— y no puede destruir nada ni con el decisor apagado.

Es la diferencia exacta entre la primera versión de este arreglo y la segunda: la primera tenía la
comprobación adentro del borrado, y su prueba —la que le pasaba la raíz real— fue la que borró el
repositorio la segunda vez.

### La ruta de un banco ya no puede ser la raíz

`benchDir(result, toolkit)` exige salida no vacía y que la ruta cuelgue de `.cauce-eval/`. Las seis
derivaciones del archivo pasan por ahí. Antes cada una hacía `path.resolve(toolkit, …trim())` a mano.

### Dos barridos, para que no vuelva a entrar de a uno

- **Ninguna prueba borra recursivamente por su cuenta**: `discard` es el único, y se comprueba sobre el
  fuente. Encontró siete borrados sueltos.
- **Ninguna prueba crea su banco bajo el home.** Nombrar la casa no es escribir en ella —cuatro pruebas se
  la pasan a un guard para que decida sobre esa ruta—, así que la condición mira la casa **y** una función
  que crea, en vez de prohibir la palabra.

Y los dos detectores tienen su propia prueba, sobre líneas fabricadas, porque ya fallaron: la primera
versión del que busca borrados cortaba en el primer paréntesis y veía **tres de siete**.

### El banco de pruebas salió del home

`outsideTempRoot` cuelga de `/var/tmp` y no de `~/.cache`. Cumple lo único que hacía falta —no ser
`os.tmpdir()`, que `shell-boundary` exime— sin quedar en ninguna ruta que a alguien le importe.

### Qué se corrió

- **El decisor, con rutas fabricadas**: `/`, una casa, una raíz de proyecto y su subdirectorio se rechazan
  nombrando la ruta y las raíces desechables; una raíz desechable no se borra a sí misma; y un vecino con
  el mismo prefijo —`/desechableX/otro`— tampoco se cuela.
- **Seis mutaciones, las seis en rojo**: el decisor aceptando todo, el decisor sin el separador, la ruta
  del banco saliendo de una salida vacía, la ruta sin exigir ser un banco, y cada uno de los dos
  detectores dejando de ver.
- **Y las seis se corrieron en un clon desechable bajo `/tmp`, no acá.** El repositorio de trabajo quedó
  intacto durante todas — comprobado después de cada una. Eso es la mitad del arreglo: la otra vez, la
  primera mutación fue la que lo borró.
- **La puerta entera**: 656 pruebas, 0 fallos.

### Lo que este caso deja además del arreglo

La regla **R23**, que es lo que viaja a cada instancia: leer la ruta resuelta antes de destruir, exigir que
cuelgue de algo desechable, no montar bancos bajo el home, y separar decidir de destruir para que probar la
defensa no pueda ser el desastre.
