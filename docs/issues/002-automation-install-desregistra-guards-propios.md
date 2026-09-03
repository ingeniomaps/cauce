---
caso: 002
titulo: automation install borra el registro de un guard propio y lo llama obsoleto
estado: resuelto
prioridad: alta
version-detectada: 0.54.0
resuelto-en: 0.55.0
---

# 002 — `automation install` desregistra los guards propios

**🟢 resuelto en 0.55.0** · detectado en 0.54.0 · prioridad **alta** — apaga una protección sin que se note

## Resumen

`template/AGENTS.md:100` le dice a cada proyecto que su guard propio va en
`automatization/hooks/guard-<nombre>.sh` y que **sobrevive a cada actualización**. Sobrevive al
`upgrade`, sí. No sobrevive al `automation install`, que el README manda a correr justo después de
cada `upgrade` y llama «el tercero, que tampoco se puede saltear».

El archivo queda en disco; su registro en la configuración del runner desaparece. El guard deja de
correr y en disco todo se ve igual que antes.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.54.0 init ops --mode sidecar --install --runner claude

printf '#!/usr/bin/env bash\nexit 0\n' > ops/automatization/hooks/guard-mio.sh
chmod +x ops/automatization/hooks/guard-mio.sh
# registrarlo a mano en .claude/settings.json, como indica AGENTS.md
grep -c guard-mio .claude/settings.json      # → 1

cd ops && node tools/ops.js automation install . claude
grep -c guard-mio ../.claude/settings.json   # → 0
ls automatization/hooks/guard-mio.sh         # el archivo sigue ahí
```

## Síntoma

```text
$ node tools/ops.js automation install . claude
− claude: quitada una entrada obsoleta ($CLAUDE_PROJECT_DIR/ops/automatization/hooks/guard-mio.sh)
```

No es una entrada obsoleta: es el guard del proyecto, puesto donde la documentación dice que se ponga.
La línea se imprime, así que no es del todo silencioso — pero va mezclada con el resto de la salida de
la instalación y afirma que lo quitado ya no servía.

## Causa raíz

`engine/automation/config.js:38`:

```js
const DELIVERED = /automatization\/hooks\/guard-[a-z-]+\.sh/
```

El comentario de arriba dice: *«Una entrada de hook que puso Cauce se reconoce por el guard al que
apunta: `automatization/hooks/` es nuestro y ninguna empresa escribe ahí»*. La premisa es la que
falla — `template/AGENTS.md` invita explícitamente a escribir ahí. Y el reconocimiento es por
**directorio**, no por identidad: cualquier `guard-<lo-que-sea>.sh` en esa carpeta entra en el patrón y
`withoutDeliveredHooks` lo saca antes de fusionar.

## Fix propuesto

El motor ya sabe con exactitud qué guards entrega: `expectedHooks()` en
`engine/automation/hooks.js:31` compone `run-hook.sh`, los wrappers de grupo y un `guard-<name>.sh`
por cada `GUARD_NAMES`. Reconocer por esa lista en vez de por la ruta:

```diff
-const DELIVERED = /automatization\/hooks\/guard-[a-z-]+\.sh/
+// Lo nuestro es lo que efectivamente entregamos, no todo lo que vive en nuestra carpeta: el AGENTS.md
+// del molde invita a poner un guard propio ahí, y reconocer por directorio lo desregistraba en cada
+// reinstalación — el archivo quedaba y el guard dejaba de correr.
+const DELIVERED_PATH = /automatization\/hooks\/([a-z0-9-]+\.sh)(?:\s|$)/
+
+function isDelivered(command) {
+  const hit = String(command).match(DELIVERED_PATH)
+  return Boolean(hit) && expectedHooks().includes(hit[1])
+}
```

y en `withoutDeliveredHooks`, `if (!isDelivered(command)) return true`.

`reportRemoved` (`config.js:68`) debería además distinguir los dos casos que hoy colapsa en «entrada
obsoleta»: un guard del toolkit que ahora cubre un grupo, y una ruta que dejó de existir.

## Tradeoffs

Ninguno funcional: lo que hoy se quita a propósito —los guards sueltos del toolkit reemplazados por su
wrapper de grupo— sigue quitándose, porque esos nombres sí están en `expectedHooks()`.

El único efecto es que una instancia que arrastre el registro de un guard del toolkit **retirado** en
una versión vieja ya no se limpia sola, porque su nombre ya no está en la lista. Se cubre nombrando esa
entrada en la salida en vez de borrarla, que además es lo que corresponde: no es nuestra decisión.

## Contexto de descubrimiento

Migrando `venotal-ops` a Cauce 0.54.0 el 2026-09-02. El proyecto tenía un guard propio que Cauce no
cubre —drift entre `prisma/schema.prisma` y `prisma/migrations/`: el build queda verde y la base de
producción se queda atrás— y era la única protección local que el toolkit no reemplazaba.

Se sorteó sacándolo de `automatization/hooks/`: vive en `automatization/venotal/guard-prisma-drift.sh`,
con un README al lado explicando por qué no está donde la documentación dice. Funciona, pero es
justamente el lugar que `AGENTS.md` desaconseja.

## Resolución

**Resuelto en 0.55.0.** Lo entregado se reconoce por lo que el motor efectivamente trae, no por la
carpeta. La implementación va más allá de lo propuesto acá: el manifiesto suma una entrada por runner
con el wiring que dejó puesto, así que una entrada nuestra se sigue retirando el día que el motor deje
de traer ese guard — el borde que quedaba abierto en «Tradeoffs».

Verificado el 2026-09-03: `guard-mio.sh` sobrevive a `automation install`, y un `guard-destructive.sh`
registrado suelto se sigue retirando con el mensaje correcto (`reemplazado guard-destructive.sh por
guard-shell.sh`, ya no «entrada obsoleta»).

En `venotal-ops`, `guard-prisma-drift.sh` volvió de `automatization/venotal/` a
`automatization/hooks/`, y sobrevive a la reinstalación de los dos runners.

## Relacionados

- [001](001-upgrade-pisa-lo-que-init-force-conservo.md) — misma causa de fondo: decidir qué es del
  toolkit por la ruta en vez de por lo que efectivamente escribió.
- [003](003-doctor-reporta-divergente-por-un-hook-propio.md) — el otro lado del mismo problema: cómo
  reacciona el diagnóstico ante un hook que el toolkit no puso.
