# Pruebas del toolkit

Esta carpeta contiene las pruebas del toolkit fuente; no se copia a los proyectos creados con
`ops init`.

## Organización

**Una carpeta por frontera, y dentro un archivo por sujeto.** Cada archivo declara el suyo en su
encabezado, así que acá no se repite: lo que sigue dice dónde vive cada frontera y qué la separa de la
de al lado.

El eje que decide la carpeta es **de qué se ocupa el código bajo prueba**, no la altura. Un mismo
módulo se prueba a dos alturas —corriendo el CLI como lo corre quien lo usa, y llamando la unidad
directo— y las dos viven juntas, porque cambian por la misma razón. Cuál es cuál lo dice cada
encabezado.

    planning/     los contratos de planificación y los comandos que los leen
    agents/       el catálogo de cargos, su ciclo de aprendizaje y cómo se los mide
    flows/        los recorridos: su contrato, su evaluación y su ciclo
    workflows/    los workflows de Cauce, leídos como fuente y ejecutados
    instance/     el ciclo de vida de una instancia y lo que el motor sabe de sí mismo
    wiring/       lo que conecta la instancia con el afuera: guards, runners, integraciones
    repo/         lo que este repositorio se promete a sí mismo, y su automatización en Actions
    support/      arneses y fábricas compartidas; no contiene pruebas
    tools/        cobertura, imports muertos y humo; no contiene pruebas

### Dónde va un caso nuevo

Por lo que el caso mide, no por el archivo que toca. Tres preguntas que suelen alcanzar:

- **¿Mide un contrato de planning?** `planning/`, sin importar si lo hace por el CLI o por la unidad.
- **¿Mide un recorrido?** `workflows/` si se lee o se ejecuta el recorrido; `flows/` si lo que se mide
  es el contrato del equipo que lo declara.
- **¿Mide algo que sólo le pasa a este repositorio?** `repo/`. Una convención que una empresa no
  hereda vive ahí y no entre las pruebas del producto.

Si un caso no encaja en ninguna, probablemente esté midiendo dos cosas.

## Convenciones

**Un archivo por sujeto, y el encabezado lo declara.** Sin esa línea nadie sabe qué *no* le toca al
archivo, y los casos empiezan a caer donde entran en vez de donde corresponden.

**Las fábricas compartidas viven en `support/` y no se copian.** Copiada, una copia deja de coincidir
con lo que reemplaza sin que ninguna prueba lo note: `support/environment.js` fija cómo se monta una
instancia de prueba y `support/autobuild-harness.js` el guion base de un recorrido — si eso cambia,
cambia en un lugar.

**Ninguna prueba autentica cuentas, escribe en un proveedor externo ni depende de red.** Un caso que
necesite un proyecto mutable lo crea bajo el directorio temporal del sistema, que `tempRoot()` borra
al salir. Las respuestas externas deterministas viven en `support/fixtures/`.

**Los archivos de código no pasan las 500 líneas ni los 120 caracteres por línea**, igual que el resto
del repositorio; `repo/repo.test.js` lo comprueba y registra las excepciones con su razón.

## Comandos

```bash
make test        # las suites
make coverage    # las suites más el umbral global y el piso por archivo
```

`make coverage` mide únicamente `engine/**/*.js` y `automatization/**/*.js`, y excluye las copias de
instancias creadas en proyectos temporales. Exige dos cosas: un umbral global de líneas, funciones y
ramas, y un piso por archivo registrado en `tools/coverage-baseline.json`. Los valores viven en
`tools/coverage.sh` —no se repiten acá, porque un número copiado envejece sin que nada falle—.

Los pisos van unos puntos debajo de lo real, para que el trabajo normal no los toque y para absorber lo
que varía entre corridas. Se suben con `npm run coverage:update`, que mide tres veces y toma el mínimo:
una sola corrida deja subir un piso por suerte y el gate queda fallando al azar.

`make dead-code` busca superficie que nadie usa: imports que ningún archivo lee y exports que nadie
importa. Un import se confirma sacándolo y corriendo; un export se decide buscándolo en el repositorio
entero, porque su uso vive en otro archivo y tiene que nombrarlo. De ahí que lo que se quiere público
alcance con documentarlo: mencionarlo es lo que lo salva del barrido.

La mitad del motor entra en `ci` —sin candidatos no corre nada y termina en milisegundos—; la de las
suites tarda minutos, una corrida por binding, y se corre a mano cuando se mueven imports.
