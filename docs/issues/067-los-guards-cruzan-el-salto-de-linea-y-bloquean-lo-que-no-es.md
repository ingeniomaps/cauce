---
caso: 067
titulo: Siete reglas de guard tratan el salto de línea como si no separara comandos, y bloquean trabajo legítimo
estado: resuelto
resuelto-en: 0.73.0
prioridad: media
version-detectada: 0.72.0
---

# 067 — Un guard que frena lo que no es, y nombra una violación que no está

**🟢 resuelto en 0.73.0** · detectado en 0.72.0 · prioridad **media** — es el defecto simétrico del 035
y el 036: aquéllos dejaban pasar de más, éste frena de menos

## Resumen

Los guards de `engine/hooks/shell.js` acotan sus reglas a «dentro de este comando» con `[^;&|]`, que
excluye los tres separadores que se escriben en una línea. **El salto de línea también separa comandos**
y no está excluido, así que cualquier bandera escrita más abajo en la misma invocación se lee como parte
del comando de arriba.

Son **siete reglas con una sola causa**: force push, `--amend`, `checkout --`, `dd of=/dev/`, `git add
-A`, `git commit -a` e instalación global.

Lo peor no es que frene: es **qué dice cuando frena**. `git push origin main` seguido de
`rm -f /tmp/x.log` se bloqueaba anunciando «`git push --force` reescribe historia ya publicada», que es
una violación que no está en el comando. Un guard que nombra mal lo que vio enseña a esquivarlo.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

node -e '
const { spawnSync } = require("child_process")
const casos = [
  ["git-add",    "commit legítimo y después ls -a",  `git commit -m "x"\nls -a`],
  ["git-add",    "add por nombre y después ls .",    `git add uno.js\nls .`],
  ["destructive","push legítimo y después rm -f",    `git push origin main\nrm -f /tmp/x.log`],
  ["dependencies","install y una bandera -g ajena",  `npm install\ngrep -g x archivo`],
  ["git-add",    "el mismo, separado por ;",         `git commit -m "x"; ls -a`],
]
for (const [guard, nombre, command] of casos) {
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } })
  const r = spawnSync("bash", [`automatization/hooks/guard-${guard}.sh`], { input, encoding: "utf8" })
  console.log(`${r.status === 2 ? "BLOQUEA" : "pasa   "}  ${nombre}`)
}'
```

## Síntoma

```
BLOQUEA  commit legítimo y después ls -a
BLOQUEA  add por nombre y después ls .
BLOQUEA  push legítimo y después rm -f
BLOQUEA  install y una bandera -g ajena
pasa     el mismo, separado por ;
```

La última fila es el diagnóstico entero: **el mismo comando pasa si el separador es `;` y se bloquea si
es un salto de línea.** Eso descarta cualquier explicación sobre las banderas y deja una sola.

## Causa raíz

`engine/hooks/shell.js`. Siete reglas con la misma forma:

```js
/\bgit\s+commit\b[^;&|]*\s(?:-[a-z]*a[a-z]*|--all)\b/
```

`[^;&|]*` existe para no salirse del comando, y funciona con los tres separadores que nombra. El `\n`
no está en la lista y también separa, así que el `.*` cruza a la línea siguiente.

No es un descuido de una regla: la forma se copió siete veces, que es lo que la vuelve una causa y no
siete defectos.

## Fix propuesto

Un solo lugar, no siete parches:

```diff
+const MISMO = String.raw`[^;&|\n]`
-/\bgit\s+commit\b[^;&|]*\s(?:-[a-z]*a[a-z]*|--all)\b/
+new RegExp(String.raw`\bgit\s+commit\b${MISMO}*\s(?:-[a-z]*a[a-z]*|--all)\b`)
```

## Tradeoffs

- **Sigue siendo una aproximación con regex, no un parser de shell.** Cierra este hueco y no los que no
  se conocen; el guard de identidad ya declara esa misma limitación y la política es que lo que aparezca
  se agregue como caso.
- **Acotar más puede dejar pasar algo que antes frenaba**, si alguien escribía la bandera peligrosa en
  una línea aparte del comando. No es una forma real: `git push` en una línea y `--force` en otra no es
  el mismo comando para el shell tampoco.
- **No medido cuántas veces frenó trabajo legítimo.** Lo observado son dos en una sesión, las dos
  rodeadas cambiando cómo se escribía el comando — que es el costo que no se ve.

## Contexto de descubrimiento

Trabajando en el caso 054 y otra vez commiteando el 065: el guard bloqueó dos comandos correctos y las
dos veces lo rodeé reescribiéndolos, sin registrar por qué. Se abrió al preguntarme si quedaba algo sin
anotar de la sesión.

## Relacionados

- [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md) y
  [036](036-git-c-ruta-add-a-esquiva-la-prohibicion-de-stagear-todo.md) — los dos anteriores sobre estas
  mismas reglas, los dos por dejar pasar de más. Éste es el simétrico.

## Cierre

**Resuelto en 0.73.0.** El recorrido de lo que enumeró:

- **Se arregló en un solo lugar y cubre las siete.** `MISMO` reemplaza al `[^;&|]` copiado, y con eso
  cuatro expresiones literales pasaron a `new RegExp` para poder interpolarlo. La razón queda escrita
  una vez, donde está la constante.
- **Se midió en las dos direcciones, y hace falta.** Sólo lo que debe bloquear pasaría con las reglas
  apagadas; sólo lo que debe pasar pasaría con el corte viejo. Es el par lo que fija el corte donde va.
- **Uno de los cinco «falsos positivos» no lo era, y decirlo importa.** `git push origin main` seguido
  de `rm -f` **sigue bloqueado**, y está bien: publicar pide una acción humana (R10). Lo que cambió es
  que dejó de anunciarlo como force push. La prueba fija las dos mitades: que frene, y que ya no mienta
  sobre por qué.
- **Tradeoff «sigue siendo una aproximación» — se paga, y es la política declarada** de estos guards:
  lo que aparezca se agrega como caso, que es de donde salió éste.
- **Tradeoff «acotar más puede dejar pasar algo» — comprobado y no ocurre.** Las cinco formas peligrosas
  escritas en una línea siguen bloqueadas: `commit -am`, `add -A`, `push --force`, `--amend` e
  `install -g`.
- **Tradeoff «no medido cuántas veces frenó trabajo legítimo» — sigue sin medirse.** Lo observado son
  dos veces en una sesión y no hay registro de las anteriores: rodear un guard no deja rastro, que es
  justamente por qué este defecto duró.

**Lo que apareció y el enunciado no preveía: eran siete reglas, no dos.** El caso se abrió con las dos
que me habían frenado. Buscando la forma `[^;&|]` en el archivo aparecieron cinco más, y dos de ellas
—force push e instalación global— también producen falsos positivos comprobados. Arreglar sólo las dos
observadas habría dejado cinco iguales esperando, cada una con su propio descubrimiento por delante.

Dos mutaciones comprobadas: devolver el corte a `[^;&|]`, y desacotar sólo la regla de `commit -a`. Las
dos ponen la prueba en rojo.
