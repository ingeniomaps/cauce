---
caso: 001
titulo: upgrade pisa en silencio lo que init --force conservó
estado: resuelto
prioridad: alta
version-detectada: 0.54.0
resuelto-en: 0.55.0
---

# 001 — `upgrade` pisa en silencio lo que `init --force` conservó

**🟢 resuelto en 0.55.0** · detectado en 0.54.0 · prioridad **alta** — pérdida de contenido sin señal

## Resumen

Adoptar Cauce en un repositorio que ya tiene contenido es `init --force` y después `upgrade`, en ese
orden, que es el que documenta el README. El primero conserva los archivos propios que colisionan con
una ruta del toolkit —lo dice y lo cumple—. El segundo los reemplaza sin avisar, y termina imprimiendo
que no tocó nada propio.

La protección contra esto existe y funciona: un archivo del sistema editado **después** de un `init`
limpio detiene el `upgrade`. Es ciega exactamente en el caso que `--force` está para cubrir.

## Reproducción

```bash
mkdir acme-ops && cd acme-ops
printf '# Reglas de Acme\n\n## Mapa real\nTres servicios: api, web, etl.\n' > AGENTS.md
mkdir -p planning && printf '# Protocolo propio de Acme\n' > planning/PROTOCOL.md

npx @ingeniomaps/cauce@0.54.0 init --force --install
head -1 AGENTS.md planning/PROTOCOL.md      # ambos intactos: init cumple

node tools/ops.js upgrade .                 # el paso siguiente del README
head -1 AGENTS.md planning/PROTOCOL.md      # ambos reemplazados
```

## Síntoma

```text
$ node tools/ops.js upgrade .
✓ Cauce 0.54.0 → 0.54.0
  31 ruta(s) del sistema y 1 del runtime actualizadas
  planning, organization y todo lo propio quedaron intactos

$ head -1 AGENTS.md
# Reglas de construcción            ← era "# Reglas de Acme"
$ head -1 planning/PROTOCOL.md
# Protocolo agnóstico de ejecución  ← era "# Protocolo propio de Acme"
```

El mensaje no es un detalle: es la única señal que recibe quien corre el comando, y afirma lo
contrario de lo que pasó.

## Causa raíz

`engine/cli/instance.js:140-142` — `scaffold` graba el manifiesto hasheando **el disco** después de
copiar el molde:

```js
for (const relative of O.trackedPaths()) {
  const dir = path.join(root, relative)
  if (fs.existsSync(dir)) deliveredPaths = M.record(root, relative, O.treeFiles(dir), deliveredPaths)
}
deliveredPaths = M.recordPaths(root, O.SYSTEM_FILES, deliveredPaths)
```

Un archivo que `copyTemplate` conservó (`instance.js:45`, la rama que imprime `= conservado`) tiene en
disco el contenido **del proyecto**, y ese es el digest que queda registrado como «entregado por
Cauce». Después `O.localChanges` (`engine/core/ownership.js:234`) compara disco contra manifiesto,
coinciden, y `upgrade` concluye que nadie lo editó.

El manifiesto guarda «lo que Cauce entregó y con qué contenido» —lo dice su propio encabezado—. Con
`--force` guarda contenido que Cauce nunca entregó.

## Fix propuesto

Registrar lo que el toolkit **habría escrito**, no lo que quedó en disco. Así el archivo conservado se
ve como una edición local y `upgrade` se detiene, que es el comportamiento que ya existe y ya está
probado.

```diff
 function copyTemplate(source, target, replacements, force, skip = [], quiet = false) {
+  const preserved = {}
   ...
       if (fs.existsSync(to)) {
         if (!force) fail(`El destino contiene ${to}. Usa un directorio vacío o --force.`)
         if (!quiet) console.log(`= conservado ${to}`)
+        // El manifiesto declara qué entregó Cauce. Un archivo conservado no lo entregó Cauce, así que
+        // se registra el digest de lo que el molde habría escrito: la diferencia con el disco es
+        // justamente lo que `localChanges` tiene que ver para que `upgrade` se detenga.
+        let would = fs.readFileSync(from, 'utf8')
+        for (const [key, value] of Object.entries(replacements)) would = would.replaceAll(key, value)
+        preserved[to] = M.digestText(would)
         continue
       }
   ...
+  return preserved
 }
```

`scaffold` recoge ese mapa (con las rutas relativas al root) y lo aplica encima de `deliveredPaths`
antes de `M.write`. `digestText` ya está exportado en `engine/core/manifest.js:135`.

Aparte, `instance.js:430` no debería imprimir «todo lo propio quedó intacto» como frase fija: que
enumere lo que reemplazó, o que no afirme nada.

## Tradeoffs

El primer `upgrade` tras una adopción con `--force` se detiene listando los archivos en conflicto, y
hay que resolverlos a mano o con `--force`. Es más ruidoso que hoy, y es lo correcto: hoy el silencio
se paga con contenido perdido.

Los casos que hoy pasan limpios no cambian: en una instancia creada sobre un directorio vacío no hay
archivos conservados y el mapa queda vacío.

## Contexto de descubrimiento

Migrando `venotal-ops` —un repo de planning propio de meses, con contratos parecidos a los de Cauce—
a Cauce 0.54.0 el 2026-09-02. Apareció en un ensayo sobre una copia del repo: el `upgrade` se llevó un
`AGENTS.md` de 219 líneas con el mapa de servicios, las integraciones productivas y los límites de
autonomía, mientras informaba que no había tocado nada propio.

En esa migración se sorteó copiando los archivos a un lado antes de correr `upgrade`. Alguien que siga
el README sin ensayar primero los pierde.

## Relacionados

- [002](002-automation-install-desregistra-guards-propios.md) — misma causa de fondo: el toolkit
  decide qué es suyo por la ruta en vez de por lo que efectivamente escribió.
