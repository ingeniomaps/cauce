---
caso: 392
titulo: Antigravity corre el Cauce de un proyecto en toda carpeta porque Cauce pide registrarlo global
estado: resuelto
resuelto-en: 0.109.0
prioridad: alta
version-detectada: 0.108.0
---

# 392 — `automation install . antigravity` manda a correr `agy plugin install`, que registra el plugin para todo el usuario: desde ahí `agy` aplica los guards, reglas y skills de ese proyecto en cualquier carpeta que no tenga plugin propio

**🟢 resuelto en 0.109.0** · detectado en 0.108.0 · prioridad **alta**. Un guard que opina fuera del proyecto que lo declara es lo
que R26 prohíbe. Además, las reglas de un proyecto le llegan a sesiones que no tienen nada que ver con él.

## Resumen

El adaptador de Antigravity se instala en `.agents/plugins/cauce/` del proyecto. Su manifiesto declara una
activación, `agy plugin install .agents/plugins/cauce`, que `install` y `doctor` imprimen como el paso que falta. Ese
paso copia el plugin a `~/.gemini/config/plugins/cauce/`, una sola copia por usuario. El puente lleva escrita la raíz
ops del proyecto que lo registró, y `findRoot` la prefiere. Resultado: en cualquier carpeta, `agy` aplica los guards
de ese proyecto, resuelve las rutas contra él y carga sus reglas («Lee y cumple `acme-ops/AGENTS.md`») y sus
skills, incluidos los cargos propios de esa empresa.

## Reproducción

En la máquina del dueño, el 2026-10-16:

- `agy plugin list --json` muestra una sola copia de `cauce`, en `~/.gemini/config/plugins/cauce`, registrada desde
  uno de sus proyectos, acme, el 2026-10-10. Su `hook.js` trae `OPS_ROOT = '<home>/…/acme/acme-ops'`, y su
  lista de skills incluye un cargo propio de esa empresa.
- Esa copia además estaba **editada a mano**: su `hook.js` no coincide ni con el que instaló el proyecto (Cauce 0.99.0)
  ni con el de este repositorio. Aun así, en una carpeta sin Cauce sigue cayendo en la raíz de acme.

Medido con `agy` 1.4.0 sobre un `HOME` aislado, sin tocar la configuración del dueño. Hubo dos proyectos con un plugin
de prueba en `.agents/plugins/sonda/`, cuyo hook sólo guarda el payload, y una carpeta sin plugin:

| Situación | Qué corrió |
|---|---|
| Sesión en `uno`, nada registrado global | el plugin de `uno`, **sin `agy plugin install`** |
| Sesión en `dos` | sólo el de `dos` |
| Sesión en `fuera`, sin plugin | ninguno |
| Con la sonda de `uno` registrada global, sesión en `dos` | sólo el de `dos`: el del proyecto le gana a la copia global del mismo nombre |
| Con la sonda de `uno` registrada global, sesión en `fuera` | **la copia global de `uno`** |

El payload de `agy` 1.4.0 trae `"workspacePaths": ["<carpeta del proyecto>"]` y `toolCall.args.Cwd` con esa misma
carpeta. El hook corre desde `<proyecto>/.agents/plugins/sonda`.

Lo documenta también `agy`: su skill `agy-customizations` (`docs/json_configs.md` y `docs/plugins.md`) dice que las
personalizaciones viven en `.agents/` del proyecto, descubiertas desde la carpeta actual hasta la raíz del proyecto, o
en `~/.gemini/config/` a nivel global.

## Causa raíz

Tres premisas del adaptador que con `agy` 1.4.0 ya no son ciertas. Las tres están escritas en
`automatization/runners/antigravity/README.md` y en el encabezado de su `hook.js`:

1. «Es esa copia [la registrada] la que `agy` ejecuta». No: `agy` descubre el plugin del proyecto solo.
2. «El payload manda `workspacePaths` vacío y un `Cwd` que apunta al scratch del CLI o al home». No: trae las dos con
   la carpeta del proyecto.
3. De ahí se seguía que el puente necesitaba la raíz escrita como ruta absoluta y que la prefiriera. Con el plugin
   en la copia global, esa raíz es la de un solo proyecto, y rige en todas partes.

No se sabe en qué versión de `agy` cambió. Lo que el repositorio midió el 2026-09-23 era cierto entonces, y no se
volvió a medir.

## Fix propuesto

- Que Cauce **deje de pedir** el registro global: sacar la activación del manifiesto, y que `install` y `doctor` dejen
  de imprimir `agy plugin install`.
- Que `doctor` avise lo contrario: si hay una copia `cauce` registrada a nivel global, corre en toda carpeta sin
  plugin propio, y se quita con `agy plugin uninstall cauce`.
- Que el puente tome la raíz de `workspacePaths` y del `Cwd`, que ya llegan, y **se abstenga** —deje pasar, sin
  opinar— cuando la llamada no cae en su propio proyecto. Así una copia global vieja no vuelve a decidir sobre una
  carpeta ajena (R26).
- Reescribir las premisas del README y del encabezado del puente con esta medición.

## Qué podría salir mal

- Una versión vieja de `agy` que no descubra plugins de workspace se quedaría sin Cauce. Mitigación: `doctor`
  comprueba que la sesión ve el plugin, como hoy comprueba el registro.
- La copia global que ya está en una máquina no se arregla sola, porque es una copia vieja. Hay que quitarla una vez,
  y `doctor` tiene que decirlo.

## Contexto de descubrimiento

El dueño notó que en carpetas fuera de acme `agy` usaba el Cauce de acme, y preguntó si era basura que había
quedado o el sistema. Es el sistema: la copia editada a mano es la parte que es basura.

## Relacionados

- [201](./201-doctor-de-antigravity-sondea-la-copia-del-workspace-y-no-la-que-agy-ejecuta.md) — de donde sale que `doctor` compare la
  copia registrada.

## Cierre

**Resuelto en 0.109.0.** El plugin de Antigravity rige sólo en su proyecto. Cauce dejó de pedir el registro global,
`doctor` avisa cuando sobra uno, y el puente se abstiene fuera de su proyecto.

**Lo que se corrió para saber que funciona.**

- Pruebas, las dos con `HOME` en un temporal:
  - `test/wiring/antigravity-scope.test.js`: el puente instalado, lanzado como una copia global, deja pasar un
    `git push` en otra carpeta y en una de más arriba, y lo frena en la suya, en una subcarpeta y nombrada por un
    symlink. Si el payload no trae la carpeta, sigue juzgando con su raíz, y un `workspacePaths` con otra forma no lo
    tumba.
  - `test/wiring/registration.test.js`, reescrita con el contrato nuevo: `install` no imprime `agy plugin install`,
    y con una copia global registrada `doctor` da error e `install` advierte, las dos veces con
    `agy plugin uninstall cauce`. Un plugin ajeno que se llame `cauce` no es asunto de `doctor`.
  - Con el puente, el registro y el manifiesto de antes, las tres pruebas que cambian de contrato fallan.
- Siete mutaciones en una copia del árbol, las siete en rojo:
  - sin la abstención;
  - abstenerse también sin carpeta en el payload;
  - abstenerse dentro del propio proyecto;
  - sin el aviso de la copia global;
  - comparar sin `realpath`;
  - aceptar sólo la carpeta exacta, sin subcarpetas;
  - aceptar también las carpetas de más arriba.

  Con el puente y el registro de antes, las pruebas nuevas de la revisión también fallan.
- **Sesiones reales de `agy` 1.4.0**, el 2026-10-16, con un `HOME` aislado, sin tocar la configuración del dueño.
  Había dos proyectos con Cauce instalado (`automation install . antigravity`, con el motor de la rama) y una
  carpeta sin Cauce. Se le pidió a `agy` correr `git add --all`, que el guard `git-add` frena.

  | Situación | Resultado |
  |---|---|
  | Sesión en p1 | frenado: «`'git add -A/--all/.' está prohibido`» |
  | Sesión fuera | corrió |
  | Con la copia de p1 registrada a nivel global, sesión fuera | corrió: la copia se abstuvo |
  | Con esa copia global, sesión en p2 | frenado por el Cauce de p2 |
  | Control: la copia global con el puente de antes, sesión fuera | **frenado**: es el defecto del caso |

  `install` ya no imprimió `agy plugin install`. Con la copia global registrada, `automation doctor` en p2 dio
  `✗ … hay una copia del plugin registrada para todo el usuario en …/.gemini/config/plugins/cauce: agy la corre en
  toda carpeta que no tenga plugin propio …`.

**Recorrido de lo que el caso enumeraba.**

- **Dejar de pedir el registro global — se hizo.** El manifiesto cambia `activation` por `strayCopy`, que dice dónde
  vive la copia y cómo se quita. `install` y `doctor` ya no imprimen `agy plugin install`. `activated` se borró de
  `runners.js`: era el único runner que la usaba, y lo que nadie llama se borra (R9).
- **Que `doctor` avise lo contrario — se hizo.** `registration.js` se reescribió: ya no compara ni lanza la copia
  registrada, que era lo que pedía el 201. Ahora dice que sobra y cómo quitarla. No la borra, porque es
  configuración del usuario y la puede seguir usando otro proyecto con un `agy` viejo.
- **Que el puente se abstenga fuera de su proyecto — se hizo**, con `workspacePaths`. Sin carpeta en el payload
  sigue juzgando con la raíz escrita, porque no hay con qué saber que está afuera.
- **Reescribir las premisas — se hizo**: el README del adaptador, el encabezado del puente y el comentario de
  `test/wiring/runners.test.js`, que las afirmaba como actuales.
- **«Una versión vieja de `agy` que no descubra plugins de workspace se quedaría sin Cauce» — se decidió que no se
  cubre con código.** Se midió en 1.4.0, que es la instalada. El README dice desde cuándo vale y qué hacer si no.
- **«La copia global que ya está en una máquina no se arregla sola» — se dice en el CHANGELOG**, con el comando que
  la quita. `doctor` lo detecta desde 0.109.0.

**La revisión del diff** encontró cuatro defectos en el primer arreglo, y los cuatro se corrigieron con su prueba:
- El puente contaba como propia cualquier carpeta de más arriba, así que una copia global seguía juzgando si
  `agy` se abría en la carpeta que agrupa proyectos.
- Comparaba las rutas sin resolver symlinks. Como abstenerse es dejar pasar, un symlink de un solo lado lo callaba
  dentro de su propio proyecto.
- Un `workspacePaths` que no fuera una lista lo tumbaba sin respuesta.
- `doctor` marcaba cualquier plugin llamado `cauce`, aunque no fuera de Cauce.

También quedaban `activation` en el contrato de runners y comentarios que todavía describían la copia registrada
como la que `agy` corre. Se actualizaron.

Las tres primeras se probaron con el puente instalado, lanzado como copia global. No se repitieron con sesiones
reales de `agy`, porque dependen de lo que ya se midió: `agy` manda en `workspacePaths` la carpeta donde se abre.

**Lo que el caso no preveía.** La copia global le gana a todo menos a un plugin de proyecto con el mismo nombre. Por
eso dos proyectos con Cauce nunca se pisaban entre sí: cada uno corría el suyo. El daño era sólo en las carpetas sin
Cauce.

