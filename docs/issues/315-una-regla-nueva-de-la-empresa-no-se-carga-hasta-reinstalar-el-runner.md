---
caso: 315
titulo: una regla nueva de la empresa no se carga hasta reinstalar el runner
estado: resuelto
resuelto-en: 0.103.6
prioridad: alta
version-detectada: 0.103.5
---

# 315 — La empresa escribe su regla y, en el chat, sigue rigiendo la del sistema hasta reinstalar

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **alta**.

**Prioridad alta**: es la otra mitad de «lo de la empresa gana»: una regla que no se cargó no se cumple, y sólo lo dice una advertencia.

## Resumen

Las reglas llegan a cada sesión por el bloque que `automation install` escribe en `CLAUDE.md`. Cuando una
empresa agrega o reemplaza una regla, ese bloque queda viejo hasta que alguien reinstala el runner. Mientras
tanto la sesión carga la regla anterior.

## Reproducción

Banco con una regla de commits propia recién escrita, sin reinstalar:

```
⚠ planning/rules/commits.md sobrescribe commits.md (override explícito); deja de regir R9, R10
⚠ claude: CLAUDE.md no carga planning/rules/commits.md y carga planning/rules/system/commits.md, que ya no
  rige; reinstalá el adaptador (make install-claude)
✓ planning válido
```

`check` pasa y `/autobuild` corre.

## Lo medido, antes de tocar código

La misma regla propia —asunto en español, cuerpo, pie `Equipo: ACME`, ramas con prefijo `acme/`— en los
cuatro estados posibles, con el motor de 0.103.5:

| | Runner reinstalado | Regla escrita, **sin** reinstalar |
|---|---|---|
| Dentro de `autobuild` | La regla rige entera | La regla rige entera |
| En una sesión de chat | La regla rige entera | **Rige la del sistema**: `docs: add notes file`, sin cuerpo ni pie, rama `docs/notas` |

En el chat sin reinstalar, la sesión dijo qué había seguido: la regla global del usuario y «R8 de
`planning/rules/system/commits.md`». La de la empresa no la tenía cargada. Con el runner reinstalado, la misma
sesión siguió la de la empresa también por encima de la regla global del usuario.

Dentro de `autobuild` no hay defecto: cada agente recibe en su preámbulo la lista de reglas vigentes, que el
motor calcula al momento.

## Causa raíz

Las reglas llegan a una sesión por el bloque que `automation install` escribe en `CLAUDE.md`. Entre que la
empresa escribe una regla y alguien reinstala, ese bloque nombra la regla anterior. `check` lo detecta
(`engine/automation/rules.js`, `staleLines`) y lo reporta como advertencia.

## Fix propuesto

**La parada de `autobuild` que este caso proponía no hace falta**: la medición mostró que ahí la regla ya
rige. Lo que hay que arreglar es el chat. Tres formas, de menor a mayor fricción:

1. **Nombrarle a la sesión las reglas que no cargó, en cada mensaje.** El runner ya engancha el evento de
   cada mensaje del usuario. Cuando hay una regla vigente sin cargar, ese gancho le dice a la sesión cuáles
   son y que las lea antes de actuar. Es lo mismo que hace `autobuild` con su preámbulo. No frena a nadie.
2. **Que el guard de planning frene el cierre del turno** cuando hay una regla sin cargar, con el comando
   para reinstalar. Es de sesión y no toca el CI. Frena después de que el trabajo ya se hizo con la regla
   vieja.
3. **Subir la advertencia de `check` a error.** Lo ve también el CI de cada instancia.

## Por qué hacerlo

Una empresa que escribe una regla espera que rija desde que la escribe. Medido: en el chat no rige hasta que
alguien reinstala, y lo único que lo dice es una línea amarilla.

## Riesgos y regresiones

- **Opción 1**: depende de que la sesión lea lo que se le nombra. Dentro de `autobuild` ese mismo mecanismo
  funcionó en la medición. Suma una línea por mensaje sólo mientras dure el desfase; sin desfase, nada.
- **Opción 2**: un freno nuevo al cerrar cada turno hasta reinstalar y abrir otra sesión, y llega tarde.
- **Opción 3**: pone en rojo el CI de toda instancia que tenga un desfase hoy. Es la regresión más probable
  de las tres, y no se puede medir desde acá cuántas lo tienen.
- **En las tres**: el propio toolkit no instala nada y no puede quedar afectado.

## Qué podría salir mal, con la opción 1

1. La sesión recibe el aviso y no lee la regla.
2. El aviso aparece en una instancia sin desfase.
3. El aviso se repite en cada mensaje y molesta, o le gana en volumen al pedido de la persona.
4. El gancho de cada mensaje se vuelve lento: corre en todos los mensajes de todas las sesiones.
5. El aviso llega también a los subagentes de `autobuild`, que ya reciben la lista por otro lado.

## Cierre

**Resuelto en 0.103.6**, con la opción 1, que eligió el dueño.

### El recorrido de lo que este caso enumeró

- **La parada de `autobuild` — se decidió que no.** La medición mostró que ahí la regla ya rige.
- **Opción 1, nombrarle a la sesión las reglas que no cargó — se hizo.** Un gancho nuevo sobre cada mensaje
  de la persona, `rules-notice`. Con una regla vigente sin cargar le dice a la sesión cuál es, que rige igual
  y que la lea; cuál quedó cargada y ya no rige; y que reinstalar lo hace la persona. Sin desfase no imprime
  nada.
- **Opciones 2 y 3 — no se hicieron.** No frena nada ni cambia `check`.
- **Sólo para Claude.** Codex y Gemini enganchan el mismo evento, pero qué hace cada uno con lo que el gancho
  imprime no se comprobó. Queda sin hacer para ellos, y dicho.

### Qué pasó con cada cosa que podía salir mal

1. **La sesión recibe el aviso y no lee la regla — no ocurrió.** En la corrida real la leyó y la siguió.
   Sigue siendo un aviso y no una carga: lo dice el encabezado del gancho.
2. **Aparece sin desfase — ocurría, y lo encontró la revisión.** Recién instalado y después de reinstalar
   no imprimía nada, pero había dos estados en que avisaba en cada mensaje sin que reinstalar lo apagara. Con
   un archivo de instrucciones propio, sin el bloque, listaba todas las reglas vigentes: reinstalar conserva
   ese archivo. Y una regla que la empresa importó a mano fuera del bloque salía como no cargada, aunque lo
   está. Ninguno de los dos avisa ya. El primero lo sigue diciendo `check`, con lo que hay que hacer.
3. **Molesta o tapa el pedido — acotado.** Son unos 780 caracteres, y sólo mientras dure el desfase.
4. **Vuelve lento cada mensaje — no.** 52 milisegundos, medido con el gancho instalado.
5. **Llega a los subagentes de `autobuild` — no se comprobó.** El evento es el del mensaje de la persona, y
  un subagente no lo dispara: **documentado**, no verificado en una corrida.

### Qué se corrió

- **La misma sesión de chat, antes y después**, con la regla propia escrita y el runner sin reinstalar, y el
  mismo pedido: crear un archivo y commitearlo en una rama nueva.

  | | Rama | Commit |
  |---|---|---|
  | Antes | `docs/notas` | `docs: add notes file`, sin cuerpo ni pie |
  | Después | `acme/docs/notas` | Asunto en español, con cuerpo y `Equipo: ACME` |

  Se repitió después de corregir lo que encontró la revisión, y dio lo mismo. La sesión dijo que el gancho
  le había avisado qué regla regía, y no reinstaló: la instancia quedó sin un archivo tocado.
- **El gancho instalado, como lo corre el runner**: sin desfase no imprime; con desfase imprime el aviso y sale
  con 0; llamado por un runner que la instancia no instaló, calla.
- **Doce mutaciones en rojo, en una copia**, sobre el código ya corregido. Entre ellas: avisar un archivo
  propio sin bloque, ignorar el import hecho a mano, quitar el `exit 0` del shim, dejar pasar su `stderr` y
  suponer un runner cuando el shim no lo dice.
- **Una revisión independiente del diff**, antes de commitear. Además de los dos estados del punto 2 encontró
  que nada probaba que el shim saliera con 0 con el motor fallando, que el aviso no decía quién reinstala
  —una sesión diligente podía correrlo— y que el changelog prometía que la sesión lee las reglas. Los tres
  se corrigieron. También revisó sin hallazgos cómo llega el gancho a una instancia ya instalada: `upgrade`
  trae el shim y pide reinstalar, e `install` sin `upgrade` se niega sin tocar la configuración.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: Codex y Gemini, y una instancia real.

### Lo que queda como está, y dicho

- **Una regla nombrada en prosa cuenta como cargada.** El gancho mira si el archivo de instrucciones menciona
  la ruta, no si la importa. Es el mismo criterio con que el bloque nombra las reglas por superficie.
- **El aviso no le pide a la sesión que le cuente a la persona.** Llegaría en cada mensaje y la sesión no
  sabe si ya lo dijo. Que hay que reinstalar lo sigue diciendo `check`.

## Relacionados

- 308 — el adaptador que quedó atrás.
- 105 y 160 — reglas vigentes y reglas que no estaban rigiendo.
