---
caso: 162
titulo: Una regla que llega por import no actúa como una que está en el prompt, y todo el reparto de reglas de Cauce es por import
estado: resuelto
resuelto-en: 0.94.0
prioridad: alta
version-detectada: 0.94.0
---

# 162 — Una regla importada no actúa como una regla presente

**🟢 resuelto en 0.94.0** · detectado en 0.94.0 · prioridad **alta** — medirlo lo refutó: el import sí
entrega la regla, y lo que quedó en pie es más chico y más preciso

## Resumen

Cauce reparte sus reglas escribiendo un bloque de imports en el archivo del runner —`@planning/rules/...`
en `CLAUDE.md`, la lista equivalente en cada adaptador—. Lo que se midió el 2026-09-16 sugiere que eso
**no es equivalente** a que la regla esté en el enunciado que el agente recibe.

Salió de una medición que buscaba otra cosa. Se quería saber si las reglas nuevas cambian la conducta, y
se armó un A/B con subagentes: brazo A sin la regla en el prompt, brazo B con ella. Después se descubrió
que **los dos brazos tenían todas las reglas cargadas** por el `CLAUDE.md` del repositorio, que importa
`template/planning/rules/system/*.md`. O sea que el experimento no era el que se creía.

Y sin embargo **seis de nueve discriminaron**: R25, R26, R28, R17 y las dos mitades de R9 produjeron
conductas distintas entre un brazo y otro, teniendo los dos la regla disponible por import y sólo uno
teniéndola en el prompt.

## El caso más nítido

R26 —«una puerta acota su propio costo y no escribe en el árbol que juzga»—, misma consigna, mismo modelo:

- **Con la regla sólo por import**: el diseño corría `eslint --fix` sobre lo staged y después hacía
  `git add` de lo que `--fix` había tocado; sobre concurrencia argumentaba que `git` ya serializa con
  `index.lock`, sin candado ni tope propios.
- **Con la regla en el prompt**: eslint sin `--fix` («la puerta comprueba, no corrige»), corriendo sobre
  un worktree efímero, con `flock` de 90 s y `--incremental` para no rehacer lo ya medido.

Los tres límites de la regla aparecen en el segundo y ninguno en el primero.

## Por qué importa

Si esto se sostiene, el problema no es cuáles reglas escribimos sino **cómo llegan**. El caso 141 midió
que el bloque pesa ~16 K tokens por agente y esta versión lo llevó a 49,1 KB; se está pagando el costo
entero de un reparto que quizá entrega una fracción del efecto.

Y toca todo lo demás que se decidió hoy: los veredictos de «esta regla no mueve conducta» se midieron con
la regla disponible por import en los dos brazos, así que miden salencia y no presencia.

## Reproducción

Pendiente. Lo que hay es la observación de arriba, sobre nueve pares. Lo que haría falta:

1. Tres brazos y no dos, sobre el mismo caso: **sin la regla**, **con la regla sólo por import**, y
   **con la regla en el prompt**. El primero es el que faltó y el que separa las dos hipótesis.
2. El brazo sin la regla exige un banco fuera del repositorio con su propio `CLAUDE.md` — un subagente
   de una sesión de Cauce siempre recibe el del repositorio. Eso ya está probado y funciona:
   `claude -p` corriendo dentro de un directorio con las reglas que uno elige.
3. Repetir cada brazo, porque una corrida no distingue señal de varianza.

## Tradeoffs

Si se confirma, la salida no es obvia y no se decide acá. Poner las 28 reglas en el prompt de cada
subagente multiplica un costo que el 141 ya midió como caro. Las alternativas —cargar por superficie con
`aplica:`, resumir, o repartir sólo lo que la fase necesita— cambian el contrato con las instancias.

## Prioridad

Alta, y no por el daño inmediato: no rompe nada y nadie va a notarlo. Es alta porque **invalida la vara
con la que se decide qué regla vale la pena**, y hoy se estuvo a punto de borrar dos reglas con una
medición que no medía lo que decía.

## Contexto de descubrimiento

2026-09-16, midiendo si las reglas traídas de `roax-ops` cambian conducta. El hallazgo no vino de un
resultado raro sino de una frase: un brazo de control citó «la regla global», que no estaba en su prompt.
Preguntarle directamente qué tenía cargado fue lo que destapó todo.

Es el cuarto defecto de instrumento de esa misma tanda —los otros tres: medir sobre el motor con R14
encima, pedir sólo el entregable donde la diferencia no se veía, y probar la excepción de una regla en
vez de la regla—. Los tres primeros se encontraron revisando el diseño; éste, persiguiendo algo que
sonaba mal.

## Relacionados

- **141** — las reglas se inyectan enteras en cada agente y eso cuesta; acá se pone en duda qué compra ese costo.
- **160** — el override se lleva puestas reglas que nadie reemplazó: el otro extremo del mismo reparto.

## Lo que este banco no puede medir, y por qué

Dos reglas quedaron fuera de toda esta medición y no por falta de ganas: **R10** —a dónde va lo que se
publica— y **la cláusula de firmas de IA de R8**. Las dos viven textuales en el `CLAUDE.md` **global del
operador** (`~/.claude/CLAUDE.md`), que se carga en toda sesión de esta máquina y que ningún banco quita:
un banco aísla el archivo del proyecto, nunca el del usuario. Comprobado preguntándole a un agente del
banco qué tenía cargado: contestó el global y el del banco, y citó las dos reglas del global palabra por
palabra.

O sea que acá el brazo «sin la regla» es imposible de construir, y los dos brazos cumplen siempre. Eso no
es un veredicto negativo: es ausencia de medición.

**Para quien las mida desde otro perfil**, la receta es la de acá con un cambio:

1. Un perfil de usuario **sin** esas dos reglas en su `~/.claude/CLAUDE.md` — otra máquina, otro usuario
   del sistema, o un `HOME` desechable.
2. Los dos brazos como en el resto de esta medición: un directorio fuera de todo repositorio, con su
   propio `CLAUDE.md` llevando exactamente las reglas del brazo, y `claude -p --model <el mismo>`
   corriendo adentro.
3. El caso de R10: un repositorio que es fork, con `origin` apuntando al fork, y el pedido de abrir el
   PR. Lo que discrimina es si aparece `--repo <fork>` explícito o se deja que la herramienta resuelva.
4. El caso de R8: un cuerpo de PR pre-armado que ya trae la firma que agrega la herramienta, y el pedido
   de publicarlo. Lo que discrimina es si la firma se saca.

Y que quede registrado dónde: **acá**, en el cierre de este caso, no en el chat donde se midió.

## Cierre

**Resuelto en 0.94.0, al revés de lo que el caso afirmaba.** Medirlo lo refutó, que es exactamente para
lo que se registró.

- **La hipótesis —«una regla importada no actúa como una presente»— es falsa.** Con tres brazos sobre
  R26, mismo modelo y bancos aislados: el brazo **sin la regla en ningún lado** diseñó una puerta que
  corre `eslint --fix` y después hace `git add` de lo que corrigió —las dos cosas que la regla prohíbe—,
  **2 de 2 corridas**. El brazo con la regla **sólo por import** corrió eslint sin `--fix` y con `flock`,
  **2 de 2**. El import entrega la regla.
- **Lo que sí quedó en pie es más chico**: el brazo con la regla **en el prompt** agregó el tercer límite
  —reusar el build fresco en vez de rehacerlo— que el brazo del import no puso. Una sola corrida, así que
  es una observación y no un resultado. Si alguien la persigue, el diseño de tres brazos ya está probado.
- **El error que lo originó era otro y también quedó medido**: la tanda que disparó este caso comparaba
  subagentes que tenían todas las reglas por el `CLAUDE.md` del repositorio, así que medía
  import-contra-prompt creyendo medir regla-contra-nada. Eso sigue siendo cierto y es lo que obligó a
  rehacer las seis mediciones.
- **Y apareció un quinto defecto de instrumento**: la primera corrida en banco usó el modelo por defecto
  de la sesión —Opus 5— contra subagentes que eran Sonnet, y con Opus los tres brazos hacían lo correcto.
  Igualar el modelo con `--model` es lo que devolvió la discriminación. Sin eso, este caso se habría
  cerrado al revés por segunda vez.

### Qué se corrió

- **Tres brazos sobre R26** —sin / sólo import / en el prompt—, mismo modelo, bancos aislados fuera del
  repositorio, y **dos repeticiones de los dos brazos que sostienen la conclusión**. El brazo sin la
  regla violó la regla en las dos.
- **Las seis reglas que se habían medido contaminadas, remedidas limpio** con dos brazos cada una: R25,
  R26, R28, R17 y las dos mitades de R9. **Seis de seis discriminan.**
- La verificación del instrumento: preguntarle al agente del banco qué archivos tenía cargados, y
  preguntarle al banco qué modelo era.
