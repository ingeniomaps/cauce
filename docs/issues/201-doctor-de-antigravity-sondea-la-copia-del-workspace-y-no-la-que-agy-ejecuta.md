---
caso: 201
titulo: `automation doctor` de Antigravity sondea la copia del workspace y no la que `agy` ejecuta, así que dice «operativo» con un plugin registrado de otro proyecto o roto
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 201 — «Adaptador operativo» mientras `agy` corre otro plugin

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. Falla cerrado —el hook roto frena todo—, pero el
diagnóstico dice lo contrario de lo que pasa, y quien lo lee no tiene cómo saber qué registrar.

## Resumen

`agy` no ejecuta el plugin que `automation install` deja en `.agents/plugins/cauce/`: ejecuta la copia que registra
`agy plugin install .agents/plugins/cauce`, en `~/.gemini/config/plugins/cauce/`, **una por usuario** —lo dice
`automatization/runners/antigravity/README.md:11-20`—. `probeBridge` (`engine/automation/index.js`) sondea el
`hook.js` del workspace, así que `automation doctor` responde «adaptador operativo» aunque la copia registrada sea
de otro proyecto, de otra versión o esté rota. Nada compara las dos.

## Reproducción

En esta máquina, 2026-09-23/24, con `agy` 1.1.16:

1. El registro global de `cauce` era el de `aparatejo` (Cauce 0.22.0, importado el 2026-08-15), con el wiring
   viejo: `node .agents/plugins/cauce/hook.js pre-shell`, relativo al workspace.
2. En un banco con Cauce instalado (`automation install . antigravity`), `automation doctor . antigravity` dijo
   `✓ antigravity: adaptador operativo (0 advertencia(s))`.
3. `agy -p` en ese banco, pidiendo `git status` y `git push --force origin master`.

## Síntoma

`agy` corrió el plugin global con su carpeta como cwd, y el hook falló en cada llamada:

```
JSON hook "jsonhook__cauce_PreToolUse_0_0" failed: command failed: exit status 1, stderr: …
Error: Cannot find module '~/.gemini/config/plugins/cauce/.agents/plugins/cauce/hook.js'
```

`agy` frenó todos los comandos, también `git status`: falla cerrado, pero ningún guard de Cauce juzgó nada. Con
el plugin del banco registrado (`agy plugin install .agents/plugins/cauce`), la misma sesión pasó `git status` y
negó el `push --force` con el motivo de Cauce.

## Causa raíz

- **`engine/automation/index.js`, `probeBridge`**: ejecuta `path.resolve(paths.install, bridge.target)`, la copia
  del workspace. La que corre `agy` es otra y no se mira.
- El README ya advierte que hay que volver a registrar cuando cambia el wiring o el proyecto, pero es prosa: nada
  detecta que no se hizo.

## Fix propuesto

Que `doctor` —y el cierre de `install`— compare la copia registrada con la del workspace: si
`~/.gemini/config/plugins/cauce/` no existe, falta registrar; si existe y difiere de `.agents/plugins/cauce/` —otro
`OPS_ROOT` en el `hook.js`, otro `hooks.json`—, avisa que `agy` va a ejecutar otra instalación y nombra el
comando que lo corrige. Y que el sondeo ejecute **la copia registrada**, con su carpeta como cwd, que es como la
lanza `agy`.

## Tradeoffs

- Leer `~/.gemini/config/plugins/` es mirar fuera de la instancia. Es de sólo lectura y es justo donde vive lo que
  se diagnostica.
- La ruta del registro global es la que documenta el README y la que se vio en esta máquina; si `agy` la cambia,
  el aviso tiene que decir que no la encontró, no que está todo bien.

## Contexto de descubrimiento

Pruebas reales en un banco instalado para cerrar la tanda 185-200 (ver el cierre del 198): la primera sesión
real de `agy` frenó todo con un `MODULE_NOT_FOUND` que no era de la rama sino del registro global de otro proyecto.

## Relacionados

- **198**, **200**: el puente que este registro deja sin ejecutar.

## Cierre

**Resuelto en 0.99.0, por el fix propuesto.** Recorriendo lo que enumeró:

- **Comparar la copia registrada con la del workspace → se hizo.** El manifiesto de Antigravity declara dónde vive
  la copia que ejecuta el runner (`activation.registered`, `~/.gemini/config/plugins/cauce`), y
  `registrationProblems` (`engine/automation/registration.js`) compara con ella los archivos que el adaptador
  entrega bajo el plugin, más su `hooks.json`. Si difieren es error de `doctor`, con los archivos y el comando que
  lo corrige.
- **Que el sondeo ejecute la copia registrada → se hizo, y como la lanza `agy`**: el comando literal de su
  `hooks.json`, desde la carpeta del plugin. Lanzar el puente directo no habría mostrado el wiring que no
  resuelve, que era el defecto real.
- **Si la copia no existe → lo sigue diciendo `activated`**, que ya avisaba «copiado pero no registrado».
- **Tradeoff de mirar fuera de la instancia → aceptado**: es de sólo lectura y es donde vive lo que se
  diagnostica.
- **Tradeoff de la ruta del registro → acotado**: la ruta la declara el manifiesto, no el motor, así que si `agy`
  la cambia se corrige en un solo lugar.

**Lo que el caso no preveía: `install` llama a `doctor` al terminar**, y justo después de instalar la copia
registrada siempre es la anterior —registrar es el paso siguiente—. Como error, `install` habría fallado en el
flujo normal. Al cerrar `install` es advertencia, y `install` imprime el comando para registrar también cuando la
copia difiere; antes lo imprimía sólo si faltaba el nombre en `agy plugin list`, que el plugin de otro proyecto
ya cumplía.

**Y las pruebas que corren `doctor` leían el home de quien las corre**: dos pruebas existentes pasaban en CI y
fallaban en una máquina con otro proyecto registrado. Ahora usan un home propio, como pide R23; la razón vive una
vez, en el encabezado de `test/wiring/registration.test.js`, que además usa un doble de `agy` para no depender del
`agy` de la máquina.

### Qué se corrió

- **`doctor` sobre el banco, con el home real de esta máquina**, donde el registro era el plugin viejo de otro
  proyecto: antes decía «adaptador operativo (0 advertencia(s))»; ahora da cuatro errores —«agy ejecuta
  ~/.gemini/config/plugins/cauce, que no es esta instalación: difiere(n) hook.js, rules/cauce.md, …», y los tres
  eventos lanzados como los lanza `agy` con el mismo `Cannot find module …/.agents/plugins/cauce/hook.js` que vio la
  sesión real—. `install` sobre el mismo banco sale con 0, lo reporta como advertencia e imprime el comando.
- **Con el plugin del banco registrado** (`agy plugin install .agents/plugins/cauce`): `doctor` da «adaptador
  operativo (0 advertencia(s))». Después se restauró el registro anterior desde un respaldo, y `diff -r` lo dio
  idéntico.
- **Las pruebas nuevas, en rojo sobre el código anterior**, y **seis mutaciones en una copia del árbol, las seis
  en rojo**: no mirar la copia registrada, fallar al instalar, no lanzarla como el runner, no comparar el
  `hooks.json`, no expandir `~` y no pedir registrar al instalar. La última sobrevivía sin el doble de `agy`,
  porque con un home vacío la condición vieja ya pedía registrar.
- `npm run ci`, exit 0, 995 pruebas.

### Revisión del conjunto antes del PR (2026-09-24)

La revisión encontró que el sondeo lanzaba los hooks de la copia registrada sin límite de tiempo —una copia colgada colgaba `doctor` e `install`; reproducido: la prueba nueva no terminaba en 300 s— y que `install` los lanzaba dos veces. Corregido en `ef0e185e`: diez segundos por lanzamiento, el sondeo corta en la primera copia que no contesta, e `install` usa la advertencia de `doctor`, que ya trae el comando. La prueba mide que termine en menos de 25 s, lo que además ve si se quita el corte.
