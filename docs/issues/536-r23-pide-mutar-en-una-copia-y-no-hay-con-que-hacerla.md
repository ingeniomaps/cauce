---
caso: 536
titulo: R23 pide mutar en una copia y Cauce no da con qué hacerla; las dos formas improvisadas fallan en silencio
estado: abierto
prioridad: media
version-detectada: 0.123.1
---

# 536 — R23 pide mutar en una copia y Cauce no da con qué hacerla; las dos formas improvisadas fallan en silencio

**🔴 abierto** · detectado en 0.123.1 · prioridad **media**: la regla baja a todas las empresas y cada agente arma la
copia a mano. Las dos formas que salen solas ya costaron: una dejó sin memoria una máquina en una instancia real, la
otra registró mutaciones que nunca corrieron en este mismo repositorio.

## Resumen

R23 (`template/planning/rules/system/conduct.md:71-74`) exige que una mutación que apaga una defensa corra «en una
copia **siempre**», y R29 pide ver esa mutación en rojo. Cauce no trae ningún comando para armar la copia, así que cada
agente improvisa, y las dos formas que salen solas fallan sin avisar:

- **`git ls-files | tar`** copia sólo lo trackeado: la prueba recién escrita —que todavía es `??`— no viaja, la
  mutación corre sin ella y la salida vacía se lee como un comando que anduvo.
- **`cp -r` o `tar` del árbol** arrastra lo ignorado: cachés, `node_modules`, artefactos. En una instancia, la caché de
  Go de un servicio pesaba ~11 GB, y copiarla a `/tmp` (un tmpfs) dejó la máquina sin memoria en cada mutación.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto) && cd "$BANCO"
node tools/ops.js help | grep -iE 'cop(y|ia)|mutac'         # nada
mkdir -p .cache && head -c 50000000 /dev/zero > .cache/big.bin && echo '.cache/' >> .gitignore
echo 'test("nuevo", () => {})' > nuevo.test.js              # prueba nueva, sin trackear
git ls-files -z | tar --null -T - -cf - | tar -C ../c1 -xf -                       # forma 1
cp -r . ../c2                                                                      # forma 2
git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -C ../c3 -xf -  # la que hace falta
```

## Síntoma

```
ops help: 64 líneas          (ninguna nombra copia ni mutación)
c1: 584K, nuevo.test.js=NO
c2: 49M, nuevo.test.js=sí
c3: 592K, nuevo.test.js=sí
```

La primera pierde la prueba; la segunda trae los 49 MB ignorados (11 GB en el caso real); la tercera —tracked más
untracked no ignorado— es la correcta, y nadie la escribe de memoria.

## Causa raíz

No hay mecanismo: la regla existe sólo como prosa. `engine/` usa `ls-files` y `checkout-index` para sus propios fines
(`engine/hooks/verify.js:68` materializa el índice para el gate), pero no expone nada para una copia de trabajo. El
`ops bench` del toolkit arma un banco de Cauce, no una copia del repositorio de producto de una empresa.

## Fix propuesto

`ops copy <repo> [destino]`:

- copia `git ls-files -co --exclude-standard`, es decir lo trackeado más lo nuevo no ignorado;
- mide antes y se niega pasado un tope configurable, nombrando el tamaño;
- el destino, por defecto, va bajo el temporal del sistema, y tiene que no existir o estar vacío: el comando no borra
  nada (R23: decidir y destruir se separan);
- imprime la ruta sola por `stdout`, para usarla en el comando siguiente.

R23 lo nombra como la forma de armar la copia.

## Tradeoffs

- **Lo ignorado que la suite necesita no viaja**: un `.env` local o un `node_modules`. Para Node hay que instalar en la
  copia o enlazar las dependencias, y eso es justamente lo que trae la caché pesada. El comando no puede resolverlo en
  general; tiene que decirlo al terminar, no esconderlo.
- Copiar el `.git` o no: sin él, la suite que usa git dentro de las pruebas no corre; con él (un `rsync -a` del árbol),
  la memoria del proyecto registra que un `git add` en la copia stagea en el repo de verdad. La forma segura es sin `.git`
  y, si hace falta, un `git init` propio en la copia.
- El tope por tmpfs (un cuarto de la memoria disponible) es de Linux. En otro sistema queda sólo el tope fijo.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real, que escribió su propio script de copia y un guard que frena el
`tar` del árbol entero después de quedarse sin memoria (2026-11-11). La forma 1 es la que falló en este repositorio el
2026-09-12, al mutar con una prueba sin trackear.

## Relacionados

- R23 y R29: la regla que pide la copia y la mutación vista en rojo.
