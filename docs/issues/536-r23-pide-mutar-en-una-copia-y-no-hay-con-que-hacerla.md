---
caso: 536
titulo: R23 pide mutar en una copia y Cauce no da con qué hacerla; las dos formas improvisadas fallan en silencio
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.1
---

# 536 — R23 pide mutar en una copia y Cauce no da con qué hacerla; las dos formas improvisadas fallan en silencio

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **media**: la regla baja a todas las empresas y cada agente arma la
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

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, `ops copy <repo> [destino]`**: se hizo en `engine/cli/copy.js`.
  - Copia `git ls-files -co --exclude-standard --deduplicate`, sin el `.git`.
  - Mide antes y se niega pasado un tope: 500 MB, `--max-mb` o `CAUCE_COPY_MAX_MB`, y un cuarto de `MemAvailable` si el
    destino está en un tmpfs.
  - El destino va por defecto bajo el temporal del sistema, y tiene que no existir o estar vacío: el comando no borra nada.
  - Imprime la ruta sola por `stdout`.
- **R23 lo nombra**: hecho, en `template/planning/rules/system/conduct.md`.
- **Tradeoffs, lo ignorado que la suite necesita**: se dice al terminar, por `stderr`, como pedía el caso.
- **Tradeoffs, el `.git`**: sin él, y el aviso dice que, si la suite usa git, se haga `git init` adentro de la copia.
- **Tradeoffs, el tope de tmpfs es de Linux**: así quedó; en otro sistema rige sólo el tope fijo.
- **Lo que el enunciado no preveía**, encontrado por la revisión y arreglado, con su prueba:
  - un destino dentro del repositorio, también por un enlace con un destino hondo, se niega;
  - un enlace que apunta fuera de la copia se avisa, porque escribir por él toca el árbol vivo;
  - un submódulo o un repo anidado se avisa y no se cuenta;
  - una copia a medias se nombra;
  - un destino que no se puede crear o un enlace colgante dan el mensaje del comando, no el error crudo.

Lo que se corrió:

- Línea de base, en «Síntoma»: `ops help` no nombraba ninguna copia.
- Después, `repro-536.sh` en un banco (`repro-536-final.log`), con una prueba sin trackear y una caché ignorada de 50 MB:
  la copia trae `nuevo.test.js` y no trae `.cache` ni `.git` (604 K), el destino ocupado se niega con exit 1, y el tope
  también.
- `test/tools/copy.test.js`, 3 pruebas, en rojo sin el comando y en verde después.
- 14 mutaciones en una copia, las 14 rojas.

**Sin probar:** un git anterior a 2.31, sin `--deduplicate`, donde el comando se niega con el error de git (la revisión
lo simuló); el tope de tmpfs con un destino que pasa por un enlace hacia un tmpfs; y macOS y Windows.

### Lista de cierre

1. hecho: la línea de base en «Síntoma» y el después en `repro-536-final.log`.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas en rojo sin el comando y en verde después.
4. hecho: 14 mutaciones en una copia, las 14 rojas.
5. no aplica: no quita ni reemplaza nada; agrega un comando.
6. hecho: banco con la CLI real, sin dobles; se midió que la prueba nueva viaja y que lo ignorado no.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: la reproducción y las mutaciones se repitieron sobre la versión final.
9. hecho: destino propio y destino por defecto, vacío y ocupado, y un repositorio alcanzado por un enlace.
10. hecho: nadie dependía de él; lo nombran R23, `ops help` y el CHANGELOG.
11. hecho: seis pasadas de revisión independiente sobre la tanda (530, 531, 533, 534, 535 y 536); ninguna halló nada que impida entregar, sus hallazgos baratos se arreglaron, y cada arreglo se revisó en la pasada siguiente. El último, que tapa los `span` al buscar comentarios en `links.js`, se cerró con su prueba y su mutación en rojo, sin otra pasada.
12. hecho: pasada de comentarios sobre el diff entero en la cuarta revisión; se quitaron los ocho que repetían o sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1926 de 1926, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
