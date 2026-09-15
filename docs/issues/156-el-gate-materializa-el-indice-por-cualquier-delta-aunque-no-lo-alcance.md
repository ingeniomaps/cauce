---
caso: 156
titulo: verify materializa el índice ante cualquier archivo sucio, incluso uno que el gate no va a leer, y nada declara qué rutas alcanza un gate
estado: abierto
prioridad: media
version-detectada: 0.91.0
---

# 156 — Un archivo ajeno al commit fuerza la copia, y con ella todo lo que la copia arrastra

**🔴 abierto** · detectado en 0.91.0 · prioridad **media** — por sí solo cuesta tiempo; lo que lo vuelve
bloqueante es lo que la copia arrastra, que es el **153**

## Resumen

`commitTree` corre los gates sobre el árbol cuando árbol e índice coinciden, y materializa el índice en un
temporal cuando difieren. Lo que decide cuál de los dos es esta línea:

```js
if (!lines.some((line) => !line.startsWith('!!') && line[1] !== ' ')) {
  return { root: dir, temp: null, env: {} }
}
```

O sea: materializa ante **cualquier** entrada de `git status` que no sea ignorada y tenga algo en la segunda
columna — un archivo sin trackear, uno modificado y sin stagear, cualquiera. **No mira si ese archivo entra
en lo que el gate va a leer.**

Eso es deliberado y es la mitad correcta del diseño: lo que atrapa es el olvido de `git add`, que es
exactamente el caso en que el verde del árbol no vale para el commit. Lo que no está previsto es el otro
lado: un `tsconfig.json` que dejó otra sesión, un README a medio escribir o la basura de una sonda fuerzan
la copia aunque el gate no los vaya a abrir nunca.

Y **nada en el contrato declara qué rutas alcanza un gate**. Una raíz de `workspaceRoots` admite hoy
`name`, `path` y `verify` —el comando de la puerta—, validado en `engine/config/validate.js`. El comando
está declarado; su alcance, no.

## Reproducción

Desde un directorio vacío:

```bash
mkdir -p repro/planning/wip repro/src && cd repro
git init -q . && git config user.email t@t && git config user.name t
printf '{ "project": "x", "mode": "embedded", "workspaceRoots": [ { "name": "main", "path": "." } ] }\n' \
  > ops.config.json
printf '{ "name": "x", "version": "1.0.0", "scripts": { "test": "node -e \\"process.exit(0)\\"" } }\n' \
  > package.json
printf -- '---\ntask: t\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Paso\n' > planning/wip/w-prueba.md
echo 'module.exports = 1' > src/app.js
git add ops.config.json package.json src/app.js
git commit -qm base

# El commit que se quiere hacer: un cambio de código, staged.
echo 'module.exports = 2' > src/app.js
git add src/app.js

# Y un archivo que el gate no va a leer jamás.
echo 'nota para mí' > NOTAS.md

# El gate corre sobre una copia materializada, no sobre el árbol.
CAUCE_RUNNER=/w/prueba node <ruta-a-cauce>/engine/hooks/run.js verify <<'JSON'
{"cwd":"<ruta-a-repro>","tool_input":{"command":"git commit -m x"}}
JSON
```

Que materializó se ve en que el bloqueo —cuando el gate falla— agrega «Corrió sobre el índice». Con
`NOTAS.md` borrado y todo lo demás igual, corre sobre el árbol.

## Síntoma

No hay mensaje: el efecto es que la copia se arma. Por sí solo cuesta el tiempo de `checkout-index` —medido
en 157 ms para las mil quinientas rutas de este repositorio, según el propio comentario de `commitTree`— y
nada más.

Lo caro es lo que la copia arrastra. En la copia, `node_modules` viaja por **enlace** al proyecto, y eso es
lo que rompe `next build` con Turbopack (**153**), sin salida del lado del proyecto. Ahí un archivo ajeno al
commit deja de ser un costo y pasa a ser un bloqueo: el gate no puede pasar hasta que el árbol esté limpio,
y quien commitea no tiene por qué saber que un README suelto es lo que lo frena.

## Causa raíz

`engine/hooks/shell.js`, `commitTree`: la condición de arriba mide **si hay** delta, no **qué** delta. La
pieza que permitiría medir lo segundo no existe: `workspaceRoots[].verify` declara el comando del gate y no
las rutas que lee.

## Fix propuesto

1. **Declarar el alcance del gate por raíz.** Un campo junto a `verify` —`scope`, con globs— y materializar
   sólo cuando alguna ruta del delta cae adentro. Determinista y explícito: no adivina, y quien lo declara
   es quien sabe. Cuesta un campo nuevo en `ops.config.json`, su validación, el molde y la documentación, y
   **baja a todos los consumidores en su próximo `upgrade`**.
2. **Acotar sin contrato nuevo**: materializar sólo si el delta toca archivos que el commit también toca, o
   que cuelgan de la raíz del servicio de la tarea. No pide campo nuevo y cubre el caso real del 153
   —basura ajena al commit—, pero es una heurística, y una heurística que decide cuándo se confía en el
   árbol envejece mal.
3. **No cambiar cuándo se materializa y atacar lo que la copia arrastra** — o sea resolver el 153 por el
   lado del enlace. Queda registrado porque es la alternativa honesta, y porque su vía más prometida ya se
   midió y no sirve: un enlace relativo resuelve al mismo destino de afuera.

## Tradeoffs

- **La 1 y la 2 aflojan la garantía que `commitTree` fue a construir**: que el gate corra sobre lo que el
  commit graba y no sobre el árbol. Hoy cualquier delta fuerza la copia justamente para que esa garantía no
  dependa de un juicio; acotarla es decidir que algunos deltas «no cuentan», y equivocarse ahí devuelve el
  defecto que `commitTree` vino a cerrar: un verde calculado sobre código que nadie va a commitear.
- **La 1 agrega superficie al contrato que cada empresa recibe.** Un campo que se declara mal —demasiado
  angosto— apaga el aislamiento sin que nada lo diga, que es la forma cara del error.
- **La 2 es exactamente lo que el 153 desaconseja** en su propio tradeoff: «lo honesto es por ruta declarada
  en `ops.config.json` y no por heurística».
- **No medido: con qué frecuencia el delta es ajeno al gate.** Es el número que decide si esto vale un campo
  nuevo o si alcanza con no hacer nada, y no se puede sacar de este repositorio —donde no hay `build` ni
  `lint`—: sale de instancias reales.

## Prioridad

**Media.** Sube a **alta** si el 153 se resuelve por esta vía en lugar de por el enlace, porque ahí este
caso pasa a ser el único camino; y baja a **baja** si la medición que falta muestra que el delta ajeno es
raro en instancias reales.

## Contexto de descubrimiento

2026-09-15, mejorando el **153** antes de arreglarlo. Las tres opciones que ese caso proponía se midieron:
la del enlace relativo no sirve, la del mensaje del guard ya existe desde 0.74.0, y la que quedaba
—«no materializar cuando el delta no puede cambiar el veredicto»— resultó ser un cambio de contrato y no
un arreglo, así que sale como caso propio en vez de entrar de contrabando en el cierre de aquél.

## Relacionados

- **153** — el bloqueo real que esto destrabaría. Mientras `node_modules` viaje por enlace, un delta ajeno
  al commit deja sin gate a un proyecto Next.
- **069**, **045**, **095** — las decisiones de `commitTree` que sí funcionan; esto no propone tocarlas.
- **151** — el otro fallo del mismo mecanismo, ya resuelto.
