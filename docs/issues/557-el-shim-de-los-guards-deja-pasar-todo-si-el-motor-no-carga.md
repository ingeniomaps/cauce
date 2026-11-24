---
caso: 557
titulo: el shim de los guards deja pasar todo si el motor no carga
estado: resuelto
resuelto-en: 0.125.0
prioridad: alta
version-detectada: 0.124.0
---

# 557 — `run-hook.sh` deja pasar la llamada cuando el motor de hooks no carga

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **alta**: una instancia con el paquete a medio actualizar o un `node_modules` roto queda sin ningún guard, y nada lo avisa.

## Resumen

`automatization/hooks/run-hook.sh` terminaba con `exec node "$runner" "$@"`. Si `run.js` tira al cargar —un `require` de un módulo que se movió, un error de sintaxis— node sale con 1, y Claude Code sólo bloquea con 2 (documentado en su guía de hooks: un código distinto de 0 y de 2 es un error que no bloquea). El `.catch` de `engine/hooks/run.js` (`exitCodeOf`) sólo cubre lo que falla una vez cargado. R27: lo que no contesta no autoriza.

## Reproducción

El shim real, al lado de un `engine/hooks/run.js` que sólo hace `require('./moved-module')`, con cada nombre que un shim le pasa:

```bash
P=$(mktemp -d); mkdir -p $P/automatization/hooks $P/engine/hooks
cp automatization/hooks/run-hook.sh $P/automatization/hooks/
echo "require('./moved-module')" > $P/engine/hooks/run.js
for g in pre-shell pre-files planning-drift stop chat; do echo '{}' | bash $P/automatization/hooks/run-hook.sh $g; echo "$g exit=$?"; done
```

## Síntoma

Con el motor de 0.124.0:

```
pre-shell exit=1
pre-files exit=1
planning-drift exit=1
stop exit=1
chat exit=1
```

Los cinco salen con 1: en `pre-shell` y `pre-files` eso es dejar pasar el comando y la escritura sin juzgar.

## Causa raíz

`automatization/hooks/run-hook.sh:34` (antes del arreglo): `exec node "$runner" "$@"`. El shim ya bloquea cuando no encuentra el motor, pero no cuando lo encuentra y no carga.

## Fix propuesto

El shim corre node sin `exec`, mira el código, y uno que no es 0 ni 2 pasa a 2 con un mensaje que lo dice. Se exime lo que no puede frenar por un defecto propio —`prompt`, `prompt-notice`, `stop` y sus guards—, que es `CANNOT_STOP` de `run.js` (caso 467); una prueba compara la lista del shim con ese conjunto.

## Tradeoffs

- Sin node en la máquina el shim sale con 127, y ahora frena: cada herramienta pide algo que no se puede dar hasta instalar node. Es la dirección de R27, y Cauce no corre sin node.
- La lista de lo que no frena vive en dos lugares, shell y JavaScript; la prueba los compara (R27, el comparador).
- Antigravity carga el motor en su propio proceso (`automatization/runners/antigravity/hook.js`) y no pasa por el shim; no cambia.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia. La instancia lo había resuelto con un envoltorio propio para sus guards; los del motor seguían igual.

## Relacionados

- 467 — por qué `stop` y `prompt` no frenan por un defecto propio.

## Cierre

- **Fix, el shim convierte en 2 lo que no es 0 ni 2**: se hizo distinto. La primera forma corría node sin `exec`; la
  revisión mostró que así un `SIGKILL` del runner mataba sólo a bash y dejaba a node huérfano. Quedó con `exec` y un
  arranque en línea (`node -e`) que atrapa el error de carga y después corre `run.js` como programa principal con
  `Module.runMain` (`automatization/hooks/run-hook.sh`). Si eso dejara de funcionar, `test/tools/hooks-smoke.sh` lo ve:
  exige que `guard-git-add.sh` frene con 2.
- **Se exime `CANNOT_STOP`**: se hizo; en esos grupos sale 1 y el mensaje dice «Aviso», no «BLOQUEADO». Una prueba
  compara la lista del shim con `CANNOT_STOP`, que `run.js` ahora exporta.
- **Tradeoff, sin node frena todo**: es así, en la dirección de R27.
- **Antigravity**: no cambia; carga el motor en su proceso.
- **Lo que el enunciado no preveía**: el reenvío de señales —un shim sin `exec` deja huérfano a node— y que el mensaje
  de los grupos que no frenan no puede decir «BLOQUEADO».

Lo que se corrió: la reproducción del caso con el shim real y un `run.js` que no carga. Antes, los cinco nombres
`exit=1`; después, `pre-shell` y `pre-files` `exit=2` con «BLOQUEADO … el motor de hooks falló sin decidir (Cannot
find module './moved-module')», y `planning-drift`, `stop` y `chat` `exit=1`. Las pruebas de `test/hooks/registry.test.js`
(motor que no carga, lista contra `CANNOT_STOP`, entrada y corte llegan a node) en rojo antes y en verde después. Cinco
mutaciones en una copia, las cinco rojas: salir con el código del motor, sacar `stop` de la lista, quitar el atajador,
quitar el `exec` y frenar en `stop`.

**Sin probar:** una sesión real de Claude Code con el paquete roto; que un 1 no frene lo dice la guía de hooks de Claude
Code, no una corrida. Codex y Gemini, que pasan por el mismo shim.

### Lista de cierre

1. hecho: la reproducción con el motor de 0.124.0, los cinco nombres en `exit=1`.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: las pruebas nuevas en rojo antes del arreglo y en verde después.
4. hecho: cinco mutaciones en una copia, las cinco rojas.
5. hecho: cambia cómo termina el shim; antes y después de la reproducción lado a lado, y la prueba de la lista de lo que no frena.
6. hecho: el shim real y un proceso node real, sin dobles; lo viejo (`exit=1` en `pre-shell`) se fue.
7. no aplica: lo que depende del runner es que sólo el 2 frena, y eso está documentado en la guía de hooks de Claude Code; no se corrió una sesión con el paquete roto.
8. hecho: la reproducción y las pruebas corrieron con el shim final (con `exec`).
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: dependían los shims `guard-*.sh` (no cambian), `hooks-smoke.sh` (pasa) y `run.js`, que exporta `CANNOT_STOP`.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
