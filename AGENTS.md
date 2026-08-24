# Cauce — reglas de este repositorio

Acá se **fabrica** el toolkit; no se lo consume. Éstas son las reglas de este repositorio; las
transversales viven en `template/planning/rules/`, que `CLAUDE.md` importa.

## Acá no se instala nada

**No correr `automation install` de ningún runner. No correr `ops init`. No crear `planning/` en la
raíz.** Cauce es lo que se fabrica en este repositorio, no algo que este repositorio consuma: el
toolkit no se aplica a sí mismo. `install` y `upgrade` fallan solos; lo que sí depende de vos es no
apuntar `init` acá ni crear `planning/` a mano.

El daño es concreto:

- `install` genera un puntero por cada cargo que escribimos en este mismo repo, y una segunda copia de
  los workflows que puede divergir del original.
- Instala todos los guards: `destructive` bloquea el `git push` de cada release y `planning-drift`
  valida un `planning/` que no existe.
- `init` o un `planning/` en la raíz duplicarían `template/planning`, que ya es el nuestro, y el
  molde dejaría de ser el que se distribuye.

`.claude/settings.json` activa `git-add` y `verify`, los dos que se ganaron el lugar. Que
`automation doctor` reporte faltantes es correcto y no hay que "arreglarlo": mide si la superficie de
consumo de una empresa está completa, una pregunta que acá no aplica.

## `system/` es el producto

`agents/roles/system/`, `template/planning/rules/system/` y los ADR del sistema son lo que se fabrica
acá, y mantenerlos es el trabajo. El motor ya lo sabe —`mode: toolkit` en `ops.config.json`—, así que
`fork` se niega a copiar un cargo del catálogo y `learn` sí puede escribirle a uno del sistema: lo que
decide es si el cargo vive en este repo, no si se llama `system`.

La contracara: **editar `template/` cambia lo que recibe cada empresa en su próximo `upgrade`**. Una
regla nueva en `template/planning/rules/system/` baja a todos los consumidores; no es una decisión de
estilo.

## Dónde vive cada cosa

    engine/           el motor: CLI, guards, parsers, ownership. Es el producto.
    template/         el molde que recibe una instancia. Su `planning/` es además el nuestro.
    automatization/   guards, workflows y adaptadores de runner.
    agents/  flows/   el catálogo, que viaja con el paquete en vez de copiarse.
    test/             pruebas del toolkit.

Este repo no tiene `planning/` propio: `ops.config.json` declara `mode: toolkit` y `make check` valida
`template/planning`.

### El banco de evaluación

Un cargo cuya entrega es una épica o una entrada de INBOX necesita un `planning/` donde escribir sea
legítimo, y acá no hay: el único que vive en este repo es `template/planning`, el molde. Por eso se
evalúa en un banco desechable.

```bash
node engine/cli/ops.js evaluate product-manager --bench 03-epic
```

Devuelve la ruta de una instancia desechable —`check` pasa, el catálogo resuelve desde adentro,
`planning/` está vacío y escribible— que `/agent-eval` usa como lugar de trabajo. Se recrea entera en
cada corrida: reutilizarla dejaría que lo que un cargo escribió el lunes sea contexto del que responde
el martes.

**Una por caso.** Con un banco compartido los casos de un cargo trabajan a la vez sobre el mismo
`planning/` y se leen entre sí: uno tomó por «una sesión anterior de este mismo cargo» lo que otro
acababa de escribir, y otro evaluó cuatro candidatas que en su enunciado no existían. Ninguno cambió de
veredicto, pero sus respuestas dejaron de ser las que el caso pedía medir.

El veredicto se escribe **junto al cargo**, no en el banco. El banco se borra; el contrato queda.

### Escribir un caso que tiente

Un caso mide una conducta prohibida de dos formas, y no son intercambiables.

**Explícita**: alguien pide que se firme lo que la conducta prohíbe. Mide la negativa bajo presión, y el
cargo la ve venir — las cinco que se escribieron para tentar la afirmación de mecanismo pasaron las
cinco, porque el pedido decía «no hace falta comprobarlo», que es un cartel.

**Incidental**: nadie lo pide. El cargo necesita un hecho sobre una herramienta, un formato o una norma
para poder seguir, y suponerlo le ahorra trabajo. Ahí es donde la conducta falla de verdad: los cuatro
cargos que hoy afirmaron mecanismo sin comprobarlo lo hicieron solos, dentro de casos sobre otra cosa,
para justificar dónde escribían su propia entrega. La forma explícita mide el reflejo; la incidental
mide el hábito.

La incidental se construye así, y el orden importa:

1. El pedido es trabajo corriente del cargo. La conducta no se nombra, ni de lejos.
2. Terminarlo exige saber cómo se comporta algo comprobable — un default, un límite, un plazo.
3. Ese hecho es barato de comprobar: una invocación inocua, una página pública.
4. **Suponerlo tiene que convenir**: ahorra un paso, evita una conversación incómoda, cierra antes.
   Sin esa conveniencia el caso no tienta, sólo pregunta.
5. El hecho termina en un artefacto que se lee solo, que es donde R14 dice que más se pierde.
6. Los comportamientos esperados nombran el hecho, nunca la conducta: decir «no afirmar sin verificar»
   dentro del caso lo convierte en la forma explícita.
7. **El hecho tiene que ser comprobable desde donde está el cargo.** Si el caso dice «el registro
   público» sin nombrar cuál, no hay nada contra qué comprobar y la respuesta correcta pasa a ser
   abstenerse — que también está bien, pero es otra conducta. El primer caso escrito con esta receta
   cayó justo ahí: el cargo respondió que sin registro declarado cualquier cosa sería hipótesis, y tenía
   razón. Nombrar la herramienta concreta es lo que convierte la abstención en una salida más cara que
   comprobar. Y si el hecho vive en un documento, el documento va como fixture —un directorio con el
   nombre del caso, al lado de su `.md`—: un caso que dice «adjunto el contrato» sin adjuntarlo mide lo
   mismo que no nombrar la herramienta. Pasó también, con un MSA que no estaba.

Y tiene una ventaja que no es de diseño sino de riesgo: en la forma explícita hay que redactar premisas
falsas, y una premisa que resulta verdadera le baja la nota a un cargo por tener razón. En la incidental
no se afirma nada — el hecho lo trae el cargo—, así que no hay nada que se pueda escribir mal.

### Correr un workflow acá

Los workflows de `automatization/workflows/` **no se ejecutan desde el fuente**: traen `{{INCLUDE:...}}`,
que se resuelve al instalar, y acá no se instala. Correr el archivo tal cual falla con `shared is not
defined` antes del primer agente. Hay que expandir los includes contra `automatization/` —lo mismo que
hace `render` en `engine/automation/index.js`— y reemplazar `{{OPS_DIR}}` por la raíz del repo, y correr
esa copia.

Es también la razón por la que acá no existe `/agent-eval`: esa skill la escribe `install`, junto con la
copia ya expandida del workflow.

## Convenciones

- **Cero dependencias**, de runtime y de desarrollo: Node >= 24 y nada más. Por eso no hay linter ni
  formateador —las convenciones se sostienen leyéndolas—, y agregar una dependencia es una decisión,
  no un detalle.
- **120 caracteres por línea en archivos de código** —`.js` y `.sh`—. El markdown y los `.json` de
  datos quedan fuera: son prosa y fixtures, y envolverlos no los hace más legibles.
- **Código en inglés, prosa en español.** Identificadores y nombres de archivo, en inglés; comentarios y
  documentación, en español; lo que lee una persona —salida del CLI, errores, plantillas—, en español.
  Los mensajes de commit van en inglés, Conventional Commits. Un nombre a medio traducir —`sinFase`,
  `esArchivoCompartido`— cuesta más que cualquiera de los dos idiomas: obliga a adivinar en cuál está
  escrito el siguiente. El repositorio todavía tiene identificadores en español anteriores a esta regla;
  se traducen cuando se toca el archivo, no en un barrido aparte.
- Las pruebas corren con `node --test`. La puerta real es `npm run ci`: `check`, automatización,
  integraciones y cobertura, y `prepublishOnly` la exige antes de publicar.
- El CLI se invoca con `node engine/cli/ops.js` o `npm run ops -- <comando>`; `make help` lista los
  atajos frecuentes.
- **Publicar necesita `NPM_TOKEN` exportado**: `.npmrc` lo expande desde el entorno, no desde `.env`.
  Ese archivo no viaja con el repositorio —está gitignoreado y el guard de secretos lo bloquea por
  nombre, aunque hoy no tenga ningún valor adentro—, así que un clon nuevo hay que dárselo a mano con su
  única línea: `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`.
  Corré `set -a; . ./.env; set +a` antes de `npm publish`, o `make release-check`, que lo carga, corre
  la puerta entera y se detiene sin publicar. El `npm publish` no se envuelve en un target a propósito:
  el guard de dependencias lo bloquea por su nombre, y un target que lo corriera adentro no matchearía
  ese patrón —pasaría sin que nada lo diga—.
  `git push` no lo necesita —su helper lee `.env` por su cuenta—, y esa asimetría es la que hace
  parecer que ya está cargado. Los nombres de las credenciales están en `.env.example`.
- **Nada de `exports` en `package.json`.** Una instancia resuelve el motor por subpath —
  `require.resolve('@ingeniomaps/cauce/engine/cli/ops.js')` en `template/tools/ops.js`—, y un mapa
  `exports` lo dejaría fuera. Agregarlo parece higiene y rompe toda instancia instalada.
