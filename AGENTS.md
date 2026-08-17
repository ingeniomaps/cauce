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
    agents/  teams/   el catálogo, que viaja con el paquete en vez de copiarse.
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

## Convenciones

- **Cero dependencias**, de runtime y de desarrollo: Node >= 24 y nada más. Por eso no hay linter ni
  formateador —las convenciones se sostienen leyéndolas—, y agregar una dependencia es una decisión,
  no un detalle.
- **120 caracteres por línea en archivos de código** —`.js` y `.sh`—. El markdown y los `.json` de
  datos quedan fuera: son prosa y fixtures, y envolverlos no los hace más legibles.
- **Comentarios y documentación en español; mensajes de commit en inglés**, Conventional Commits.
- Las pruebas corren con `node --test`. La puerta real es `npm run ci`: `check`, automatización,
  integraciones y cobertura, y `prepublishOnly` la exige antes de publicar.
- El CLI se invoca con `node engine/cli/ops.js` o `npm run ops -- <comando>`; `make help` lista los
  atajos frecuentes.
- **Publicar necesita `NPM_TOKEN` exportado**: `.npmrc` lo expande desde el entorno, no desde `.env`.
  Corré `set -a; . ./.env; set +a` antes de `npm publish`. `git push` no lo necesita —su helper lee
  `.env` por su cuenta—, y esa asimetría es la que hace parecer que ya está cargado. Los nombres de las
  credenciales están en `.env.example`.
- **Nada de `exports` en `package.json`.** Una instancia resuelve el motor por subpath —
  `require.resolve('@ingeniomaps/cauce/engine/cli/ops.js')` en `template/tools/ops.js`—, y un mapa
  `exports` lo dejaría fuera. Agregarlo parece higiene y rompe toda instancia instalada.
