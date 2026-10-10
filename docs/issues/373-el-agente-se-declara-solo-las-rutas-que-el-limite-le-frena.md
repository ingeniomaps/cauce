---
caso: 373
titulo: el agente se declara solo las rutas que el límite le frena
estado: abierto
prioridad: alta
version-detectada: 0.106.1
---

# 373 — El límite de raíces se abre editando la configuración que lo define, y esa edición no la confirma nadie: el agente agrega una ruta —o una raíz— y lo que estaba frenado pasa, para siempre y por prefijo

**🔴 abierto** · detectado en 0.106.1 · prioridad **alta**. **Decidido el 2026-10-10**: se cierra, junto con
el [370](./370-el-guard-de-limites-no-tiene-salida-por-el-chat.md).

**Prioridad alta**: el límite existe para contener al agente cuando trabaja solo, y hoy el agente lo mueve
sin que nada lo frene ni lo muestre en el momento. No es una vía rebuscada: es la que el propio bloqueo
indica, y se midió en uso.

## Resumen

Los dos guards de límites frenan lo que cae fuera de las raíces y mandan a declarar la ruta en
`writableOutsideRoots`. El archivo donde se declara lo escribe el agente como cualquier otro: `ops-config`
protege ahí las dos llaves del push y deja pasar el resto, a propósito, para que esa salida exista (caso
090). Lo que quedó sin mirar es que la salida la toma quien el límite contiene.

Y son tres puertas, no una: la lista de rutas escribibles, **la lista de raíces de producto** —que el
límite lee igual— y el archivo de la máquina, `ops.config.local.json`, que no mira ningún guard.

## Reproducción

En un banco `suelto`, preguntándoles a los guards con `executeAll` y sin ejecutar ningún comando:

```
*** escritura de ops.config.json con  "writableOutsideRoots": ["~"]
*** escritura de ops.config.json sumando a workspaceRoots la carpeta personal
*** escritura, edición por fragmento o `echo … >` de ops.config.local.json con  {"writableOutsideRoots":["~"]}
```

## Síntoma

Medido el 2026-10-10:

```
FRENA   rm -rf ~/.config/<editor>/snapshots                      (configuración de fábrica)
pasa    Write ops.config.json        con writableOutsideRoots ["~"]
pasa    Write ops.config.json        sumando como raíz la carpeta personal
pasa    Write ops.config.local.json  con writableOutsideRoots ["~"]
pasa    Edit  ops.config.local.json  (un fragmento)
pasa    echo … > ops.config.local.json
FRENA   Edit  ops.config.json        (un fragmento: no se puede comparar)
FRENA   echo … > ops.config.json
--- con cualquiera de las tres primeras en disco ---
pasa    rm -rf ~/.ssh                pasa    rm ~/.aws/credentials
pasa    rm -rf ~/Code/<otro>         pasa    echo x > ~/.bashrc
FRENA   rm -rf ~                     (lo cuida `destructive`, que no tiene salida)
```

Sobre las sesiones reales de cuatro proyectos, 129 bloqueos de este límite: en al menos 6 lo que siguió, sin
ningún mensaje de la persona en el medio, fue el agente declarando la ruta; en 2 paró y le habló a la
persona. En los seis, lo frenado era un archivo y lo declarado fue su carpeta: una memoria del runner, la
carpeta de casos de otro repositorio. El conteo es por heurística —las llamadas que siguen al bloqueo— y no
dice si la persona lo había pedido antes en la sesión.

## Causa raíz

- `engine/hooks/ops-config.js`, `PROTECTED` — sólo `allowPush` y `pushToLiveBranches`. Su encabezado dice por
  qué: proteger el archivo entero «repondría el candado que el 090 sacó».
- `engine/hooks/ops-config.js`, `target` — el único archivo que mira es `ops.config.json`.
  `ops.config.local.json` no lo mira nadie, ni por archivo ni por shell.
- `engine/hooks/input.js`, `writableRoots` — el límite sale de `workspaceRoots`, de `writableOutsideRoots`
  de los dos archivos y del scratchpad de la sesión. Las dos primeras las escribe el agente.
- `engine/hooks/input.js`, `DECLARE_IT` — el texto que manda a tomar esa salida, sin decir quién.

## Fix propuesto

1. **Agregar una ruta a cualquiera de las dos listas, en cualquiera de los dos archivos, lo confirma una
   persona.** Se compara lo que entra contra lo que hay en disco, ya resuelto: lo que la escritura **agrega**
   o **ensancha** queda frenado con la entrada a la vista —`declara <ruta resuelta>`— y pasa con la
   confirmación del bloqueo o con su línea en `planning/.ops-approval`. Es lo que `self-approval` ya hace con
   las líneas de la aprobación.
2. **Quitar o angostar no se pregunta**: una lista más corta autoriza menos.
3. **Lo que no se puede comparar se frena**, igual que hoy en `ops.config.json`: un fragmento de `Edit` o un
   comando no dicen con qué queda el archivo. Vale también para el archivo de la máquina.
4. **Sin heredar y sin orden por chat**, por las mismas dos razones medidas en el 370.
5. Reescribir `DECLARE_IT`: la declaración es cosa de la persona, y para una vez alcanza con confirmar.

Vale mirar, antes de construir, si `outsideRoots` trata bien una entrada `/`: en la sonda una raíz `/`
escrita en disco no abrió nada —la comparación le suma un separador y queda `//`—. Hoy cae del lado seguro
por accidente; si se arregla, tiene que ser con este caso ya cerrado.

## Valor

El límite vuelve a contener a quien dice contener. Y lo que una persona declara queda decidido por ella,
con la ruta a la vista, en vez de aparecer después en `check`.

## Qué podría salir mal

1. **Dejar al límite sin ninguna salida.** Si esto sale sin el 370, lo único que queda es que la persona
   edite el archivo a mano: van en la misma versión, y el 370 primero, porque esto usa su confirmación.
2. **Frenar las corridas sin persona que hoy se destraban solas.** Las seis declaraciones medidas dejarían
   de pasar: en una sesión conversada es una pregunta; en un recorrido, un bloqueo que vuelve a quien lo
   lanzó. Es el efecto buscado, y hay que medirlo sobre los mismos 129 bloqueos antes de publicar.
3. **Volver a poner el candado del 090.** Lo que el 090 arregló era que `plan-first` frenara toda edición del
   archivo. Acá se frena una clase de cambio, y el resto del archivo sigue pasando; la prueba del 090 tiene
   que seguir en verde.
4. **Comparar mal dos listas.** Una entrada reescrita con otra forma —`~/x` y su ruta absoluta— no es una
   entrada nueva, y una que cubre a otra —`~/a` donde había `~/a/b`— sí ensancha. Se compara resuelto.
5. **Que la instalación o `upgrade` queden frenados.** Escriben la configuración desde el CLI, que los guards
   ven como un comando y no como una escritura. **Hipótesis** hasta correrlo en un banco.

## Contexto de descubrimiento

Al analizar cuál de las salidas del 370 era más segura: la opción de dejarlo «estricto» resultó ser la más
abierta de las tres.

## Relacionados

- [370](./370-el-guard-de-limites-no-tiene-salida-por-el-chat.md) — la salida angosta que reemplaza a ésta.
- [090](./090-plan-first-frena-el-ops-config-donde-el-limite-manda-a-declarar.md) — por qué la configuración
  quedó editable.
- [114](./114-el-agente-se-escribe-el-permiso-de-push-en-ops-config.md) — el mismo defecto, sobre las llaves del
  push.
- [209](./209-las-rutas-escribibles-de-una-maquina-viven-en-el-archivo-compartido.md) — de donde sale el
  archivo de la máquina.
