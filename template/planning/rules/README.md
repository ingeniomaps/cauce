# Reglas transversales

`system/` pertenece a Cauce y se reemplaza completo en cada actualización:

- `system/process.md` — R1..R4, R17, R25, R28: planificación, review, sincronización de estado, cómo se
  parte una unidad de trabajo y cómo se nombra y se deja escrito su estado.
- `system/runs.md` — R16, R20..R22, R26: lo que cuesta una corrida, cuándo una medición vale, cómo se
  retoma lo interrumpido, qué no se toca mientras se mide y qué le cuesta una puerta a quien la corre.
- `system/code-shape.md` — R5..R7, R11, R18, R27: simplicidad, forma del cambio y cómo se escribe una
  defensa.
- `system/commits.md` — R8..R10: historia versionada y entrega.
- `system/proof.md` — R29: cómo se ve que una prueba cuida lo que nombra y cómo se prueba una quita.
  Declara `aplica:`, así que el bloque la nombra y no la carga: se lee al escribir o revisar una aceptación,
  una prueba, o un cambio que quita o reemplaza algo (caso 440).
- `system/conduct.md` — R12..R15, R19, R23, R24: trato con sistemas externos, lo que llega de ellos, lo
  que se afirma del propio código, lo que se destruye, y la obligación de entregar al negarse.

Las de `system/runs.md` viven ahí y no en `process.md` por una razón medida. El override de una regla es por
nombre de archivo, así que una empresa que escribe su propio `process.md` —reemplazar «pensar antes de editar»
por su versión es lo primero que hace cualquiera— se llevaba puestas también éstas, que nadie reemplaza y que
`effectiveRules` dejaba de entregarle a todo agente. Una instancia real lo vivió: las declaró «adoptadas por
referencia» en una tabla de prosa que el motor no lee, y aun así dos de ellas no estaban rigiendo el día que le
costaron una sesión entera (caso 160). La nota vive acá y no en `runs.md` porque este archivo no se carga: le
sirve a quien mantiene las reglas, y cada agente pagaba leerla (caso 439).

El número es el identificador: una regla se cita por él desde un cargo, un workflow o una entrada de
DONE, y por eso no se reordena ni se reusa.

Las reglas propias del proyecto van en este directorio, junto a `system/`, y nunca se tocan al
actualizar. **Se numeran `P1..Pn`**: `R` queda reservado al sistema, y `check` rechaza un `R` definido
fuera de él para que no existan dos reglas con el mismo nombre.

Para cambiar una regla del sistema, escribí la tuya **con el mismo nombre de archivo**: ahí redefinir
sus números es la función, la del proyecto manda, y `check` reporta el override en vez de fallar.

Lo que reemplaza es **el archivo entero, no las reglas que mencionás**: las que ese archivo del sistema
definía y el tuyo no redefine dejan de regir para tu proyecto. Alguna la sigue exigiendo el motor —R17
lo hace—, y ahí queda exigida sin estar escrita en ningún lado. Por eso `check` te dice cuáles son
—«deja de regir R2, R17…»— y por eso conviene, antes de sobrescribir un archivo, mirar si lo tuyo era
una regla nueva: si lo era, va acá al lado como `P1..Pn` y no se lleva nada puesto.

Las convenciones específicas de lenguaje viven junto al servicio que usa ese lenguaje.

## Una regla que sólo rige sobre una superficie

Toda regla de este directorio se carga en el contexto de arranque de **cada** agente, y eso cuesta: lo que
trae Cauce son decenas de KB por agente, y `automation install` dice cuántos en cada instancia, junto con
cuánto de eso es propio. Una regla propia de dos páginas que importa en una tarea de cada cien se lee cien
veces.

Una regla puede declarar a qué superficie pertenece, y entonces se **nombra** sin cargarse:

```markdown
---
aplica: pagos
---

# Pagos

## P3 — Conciliar antes de cerrar
```

Qué cambia: el bloque que `automation install` escribe la lista —`- ruta (aplica: pagos)`— en vez de
importarla, así que pesa una línea y no su archivo entero. Sigue rigiendo igual: `ops context` la devuelve
entre las reglas del proyecto, el recorrido se la nombra a cada agente que toca código, y quien trabaje
sobre esa superficie la lee antes de planificar o construir.

**Sin el campo, la regla se carga siempre.** Es el default a propósito: una regla que no se leyó no existe,
así que apartarla del arranque es una decisión del proyecto y nunca algo que se deduzca. Por lo mismo el
valor es libre y lo elige quien escribe la regla —`pagos`, `infraestructura`, `el front`—: lo que tiene que
hacer es que quien lo lea sepa cuándo le toca.

Conviene para lo que es de un dominio acotado —un proveedor, un stack, una integración— y no para lo que
gobierna cómo se trabaja: esas se pagan y se cargan.

El disparador también puede ser un momento del trabajo y no una superficie: `aplica: al commitear`,
`aplica: al escribir en Jira`. Una regla de commits o de un tracker rige sólo en ese paso, y cargada pesa en
todos los demás, también en los que nunca commitean ni tocan el tracker. Se midió con la marca que una regla
así pedía en cada commit: tres agentes que commiteaban con la regla sólo nombrada la abrieron y la aplicaron
los tres (caso 381). Es una medición sobre sesiones cortas; si en tu instancia un paso la saltea, se carga.

## De dónde salió cada regla

Una regla del sistema dice qué hacer y por qué; el incidente que la originó vive acá, que no se carga en ningún
agente, porque le sirve a quien mantiene la regla y no a quien la cumple (caso 441).

- **R14** — En la sesión que originó el párrafo de «se parece a la prudencia», cuatro cargos independientes
  rotularon «hipótesis» el default de una herramienta o la base de un porcentaje que la fuente pública de esa misma
  herramienta define; ninguno afirmó nada falso, y los cuatro dejaron a quien recibía la entrega pagando con una
  sesión entera lo que costaba abrir un enlace.
- **R20** — En la sesión que originó la regla, cargos que habían pasado todos sus casos fallaron uno al día
  siguiente sin que el motivo tocara nada de lo que se había cambiado: la varianza que una re-corrida devuelve
  existe.
- **R21** — La sesión que originó la regla creyó estar reanudando desde caché y volvió a correr entero dos veces:
  siete millones de tokens para un solo veredicto, con los archivos de las etapas ya cumplidas a la vista en el
  directorio de trabajo, y con el filtro que lo evitaba escrito por quien reanudaba tres horas antes.
- **R24** — En la instancia que originó la regla, una función pasó de la línea 555 a la 733 dentro de la misma
  sesión. Y cuatro corridas seguidas se perdieron en un solo día por una premisa sin abrir —una afirmaba que un
  webhook abría acceso sobre filas terminales, y hace lo contrario—, y las cuatro se veían como un problema de
  implementación.
- **R26** — En la instancia que originó la regla, varios revisores lanzaron la misma suite: cuatro corridas en
  cuatro minutos. El sistema operativo mató la sesión entera con un pico de 24,2 GB y se llevó puesta la corrida que
  estaba a punto de terminar.
