---
caso: 040
titulo: Verify corre los gates sobre el árbol de trabajo y el commit graba el índice
estado: resuelto
resuelto-en: 0.65.0
prioridad: alta
version-detectada: 0.65.0
---

# 040 — El gate mide un código y el commit guarda otro

**🟢 resuelto en 0.65.0** · detectado en 0.65.0 · prioridad **alta** — falla abierto y el verde queda escrito

## Resumen

`verify` decide qué correr mirando el índice —`stagedForCommit`— y después corre `npm test`, `make ci` o
`go test` **en el directorio de trabajo**. Son dos cosas distintas: el commit graba lo que está en el
índice, y el gate mide lo que está en disco.

Cuando difieren, el veredicto es sobre un código que nadie va a commitear. Y falla en los dos sentidos,
uno ruidoso y otro silencioso:

- **Silencioso, el que importa**: se stagea una versión rota y después se arregla el archivo en disco.
  El índice tiene lo roto, el árbol tiene lo bueno, el gate pasa y el commit graba lo roto. Queda un
  commit verde con código que nunca pasó ningún gate.
- **Ruidoso**: el índice tiene algo sano y el árbol tiene un archivo a medio escribir. El gate falla y
  frena un commit que era correcto.

Es el mismo enunciado que [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md)
—decidir mirando un estado que no es el objeto de la decisión— por una vía que aquel fix no toca: ahí el
índice se leía antes de que el comando lo llenara; acá se lee bien y lo que no coincide es el disco.

## Reproducción

```bash
S=$(mktemp -d) && cd "$S" && git init -q .
cat > package.json <<'EOF'
{"scripts":{"test":"node -e \"process.exit(/ROTO/.test(require('fs').readFileSync('app.js','utf8'))?1:0)\""}}
EOF
echo '// sano' > app.js
git add package.json app.js
git commit -qm base

# A — el índice queda roto y el árbol sano
echo '// ROTO' > app.js
git add app.js
echo '// arreglado' > app.js

git show :app.js          # → // ROTO      (lo que se va a commitear)
cat app.js                # → // arreglado (lo que el gate va a medir)
# el hook de verify sobre `git commit -m x` → exit 0
```

*Verificado* el 2026-09-07 sobre 0.65.0, con los tres casos corridos en la misma sonda:

| caso | índice | árbol | verify |
|---|---|---|---|
| A | roto | arreglado | **pasa** — y el commit graba lo roto |
| B (control) | roto | roto | bloquea |
| C′ | sano y distinto de HEAD | roto | bloquea — y el commit era correcto |

Una cuarta forma no mide nada y conviene decirlo, porque es fácil escribirla sin darse cuenta: stagear
contenido **idéntico** a HEAD deja el índice vacío —`git diff --cached --name-only` no devuelve nada— y
`verify` sale antes de correr ningún gate. La primera versión de esta sonda cayó ahí y pareció que el
guard no frenaba nada.

## Causa raíz

`engine/hooks/shell.js`, en `verify`: `stagedForCommit` da el conjunto correcto y se usa para decidir
**si** hay que correr el gate; el gate se corre con `cwd: dir`, o sea sobre el árbol. Las dos mitades de
la función responden a preguntas distintas sin que nada lo diga.

No es un descuido de lectura: correr un gate sobre el índice exige materializarlo en algún lado, y eso
no existe hoy en el motor.

## Fix propuesto

Hay tres salidas y no son equivalentes. La primera es la correcta y la más cara.

**1. Materializar el índice y correr ahí.** `git worktree add --detach` sobre un directorio temporal más
`git checkout-index -a --prefix=`, o `git stash push --keep-index` antes y `git stash pop` después. La
segunda es más barata y es la que **no** hay que elegir: manipula el árbol de quien está trabajando, y un
gate que falla a la mitad deja el stash puesto. La primera no toca nada de lo que hay abierto.

El costo real es que instalar dependencias en el worktree puede ser más caro que el gate mismo. Se acota
enlazando `node_modules` en vez de copiarlo, y midiéndolo antes de decidir: si el gate pasa de correr en
segundos a correr en minutos, la regla se va a apagar.

**2. Exigir que no haya diferencia.** Si el árbol y el índice difieren en algún archivo staged, bloquear
pidiendo stagear lo que falta. Es barato y honesto —el gate vuelve a medir lo que se commitea—, y el
precio es que prohíbe un flujo legítimo: `git add -p` para partir un cambio en dos commits deja
justamente esa diferencia. Antes de elegirla hay que decidir si ese flujo se sacrifica.

**3. Decir en el mensaje que el gate midió el árbol.** No arregla nada y no alcanza solo, pero
acompaña a cualquiera de las dos: hoy el verde no dice sobre qué se calculó.

Lo que **no** sirve es comparar las fechas de los archivos: `git add` no toca el mtime —*verificado* el
2026-09-07, idéntico antes y después—, así que un índice viejo y un árbol nuevo se ven iguales por ahí.

## Tradeoffs

La opción 1 es correcta y cambia el costo del guard, que es lo que decide si sobrevive: un gate lento se
apaga, y apagado no protege nada. La opción 2 es correcta y barata a cambio de prohibir el staging
parcial. La 3 no cierra el agujero.

Y hay un tradeoff que no es técnico: mientras esto exista, el verde de `verify` en un commit no prueba
que ese commit pase los gates. Conviene que quien lo lea lo sepa aunque el arreglo tarde.

## Prioridad

**Alta.** El sentido silencioso deja pasar código que nunca pasó un gate y encima escribe la evidencia
de lo contrario, que es peor que no tener el guard: R9 dice que una prueba que nunca se vio fallar no
muestra nada, y acá el verde se calculó sobre otro archivo.

Se llega sin ninguna intención de rodear nada: stagear, seguir editando y commitear es el flujo de
cualquier sesión larga.

## Contexto de descubrimiento

El [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md) cerraba su fix
con una línea que no era decorativa: «vale la pena mirar si algún otro guard depende de estado que su
propio comando cambia; el patrón —preguntar por lo que todavía no pasó— no tiene por qué ser exclusivo
del índice». Esa revisión no se hizo al arreglarlo, y al preguntarse si los casos habían quedado
cerrados de verdad, se hizo: `verify` es el otro.

`dependencies` tiene la misma forma en chico y por eso no lleva caso aparte: mira con `existsSync` qué
lockfiles hay en el árbol para juzgar un manifiesto staged. Es menos grave —lo que decide es si existe
un lockfile, no su contenido— y se arregla junto con esto o no se arregla.

## Cierre

**🟢 resuelto en 0.65.0.** Lo que este caso enumeró, ítem por ítem:

- **Opción 1, materializar el índice** → elegida, con `checkout-index` sobre un temporal y sin
  `git stash`, por lo que este caso ya decía. El costo medido acá —157 ms para 1500 rutas— resultó
  chico al lado de cualquier gate, y sólo se paga cuando el árbol y el índice difieren.
- **Opción 2, exigir que no haya diferencia** → descartada: prohíbe el staging parcial, que es un flujo
  legítimo.
- **Opción 3, decirlo en el mensaje** → incluida igual, porque un fallo que no se reproduce a mano se
  lee como que el guard miente.
- **Lo que no sirve, comparar fechas** → verificado que `git add` no toca el mtime, así que se descartó.
- **Lo que apareció al implementarlo**: un índice materializado no trae `.git`, y un gate que llama a
  git falla ahí. La suite de este repositorio pasa de dos fallos a ninguno con `GIT_DIR` y
  `GIT_WORK_TREE` apuntados al repositorio real. Sin eso el arreglo frenaba commits correctos.
- **`dependencies`, la misma forma en chico** → este caso decía «se arregla junto con esto o no se
  arregla», y se arregló: un lock cuenta si está en disco **o** si el commit lo va a llevar. La regla de
  «varios lockfiles» se quedó mirando sólo el disco, que es lo correcto y estaba documentado.

## Relacionados

- [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md) — el mismo
  enunciado, y el caso que mandó a buscar éste. Aquel cerró «el índice todavía no tiene nada»; éste es
  «el índice está bien y el gate miró otra cosa».
- [031](031-el-guard-que-no-puede-leer-el-indice-deja-pasar.md) — el primero de la familia: «no pude
  leer el índice».
