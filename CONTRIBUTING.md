# Contribuir a Cauce

Las reglas de este repositorio viven en [`AGENTS.md`](AGENTS.md) y no se repiten acá: una razón
escrita dos veces se pudre en una de las dos copias. Esto es lo que hace falta saber antes de abrir un
PR, con el puntero a dónde está cada cosa.

## Antes de escribir código

**Acá se fabrica el toolkit; no se lo consume.** No corras `ops init` ni `automation install` sobre
este repositorio: `AGENTS.md` explica qué rompe cada uno. Que `automation doctor` reporte faltantes es
correcto y no hay que arreglarlo.

**Cero dependencias**, de runtime y de desarrollo. Node >= 24 y nada más. Por eso no hay linter ni
formateador, y agregar una dependencia es una decisión que se discute en un issue antes de un PR, no un
detalle de implementación.

**Código en inglés, prosa en español.** Identificadores y nombres de archivo en inglés; comentarios,
documentación y todo lo que lee una persona —salida del CLI, errores, plantillas— en español. Los
mensajes de commit van en inglés, Conventional Commits.

## La puerta

```bash
npm run ci
```

Corre `check`, automatización, integraciones y cobertura. Es lo mismo que corre en el CI y lo que
`prepublishOnly` exige antes de publicar, así que si pasa local pasa allá. Las pruebas usan
`node --test` y viven en `test/`.

Un PR con la puerta en rojo no se revisa: no es rigor, es que el rojo ya dice qué mirar.

## Qué hace que un cambio se acepte

- **Una prueba que se vio fallar.** No alcanza con que la suite quede verde: hay que haber visto el
  rojo con el código puesto, rompiendo exactamente lo que el caso dice cuidar. Una prueba que nunca se
  vio fallar no muestra que su aserción funcione.
- **Un commit por naturaleza**, con rutas explícitas. Nada de `git add .`, ni amend, ni force.
- **Sin trailers de IA** en el mensaje.
- **Comentarios con destinatario**: el porqué, la restricción, lo que se probó antes. Si nadie lo
  preguntaría, sobra.

## Lo que baja a todas las empresas

Editar `template/` cambia lo que recibe cada instalación en su próximo `upgrade`, y `upgrade` reemplaza
`system/` sin pedir confirmación. Por eso un cambio ahí lleva su entrada en
[`CHANGELOG.md`](CHANGELOG.md), escrita para quien la va a leer: qué le cambia y qué tiene que hacer.
Un cambio en el protocolo, en las reglas del sistema o en un guard **sube minor aunque no toque una
sola línea de código**.

## Cómo sale una versión

El número se lee, no se calcula: sale del encabezado más nuevo del `CHANGELOG.md`, que es donde se
decide. Un workflow abre solo el PR que sincroniza `package.json`; al mergearlo, el tag dispara la
publicación. Nadie publica a mano.

## Reportar un problema

Un bug o una idea, en los [issues](https://github.com/ingeniomaps/cauce/issues). Una vulnerabilidad
**no**: eso va por [`SECURITY.md`](SECURITY.md), en privado.
