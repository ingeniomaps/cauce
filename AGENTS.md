# Cauce — reglas de este repositorio

Acá se **fabrica** el toolkit; no se lo consume. Las reglas que Cauce distribuye
—`template/AGENTS.md` y `template/planning/rules/`— también rigen este repo, con una inversión que
hay que tener presente antes de tocar nada.

## Acá no se instala nada

**No correr `automation install` de ningún runner. No correr `ops init`. No crear `planning/` en la
raíz.** Cauce es lo que se fabrica en este repositorio, no algo que este repositorio consuma: el
toolkit no se aplica a sí mismo.

Esto se sugiere una y otra vez —sesión tras sesión, con buena intención— y siempre está mal. Lo que
esos comandos producen acá es daño concreto:

- `install` genera 47 punteros a cargos que escribimos en este mismo repo, y una segunda copia de los
  workflows que puede divergir del original.
- Instala doce guards: `destructive` bloquea el `git push` de cada release y `planning-drift` valida
  un `planning/` que no existe.
- `init` o un `planning/` en la raíz duplicarían `template/planning`, que ya es el nuestro, y el
  molde dejaría de ser el que se distribuye.

El wiring de acá es a mano: `.claude/settings.json` activa un solo guard y explica por qué en su
`$comment`. Que `automation doctor` reporte faltantes es correcto y no hay que "arreglarlo": mide si
la superficie de consumo de una empresa está completa, una pregunta que acá no aplica.

## La inversión de `system/`

`template/AGENTS.md` dice «nunca editar nada dentro de `system/`». En una empresa es correcto: ese
directorio lo reemplaza el próximo `upgrade`. Acá es al revés —`agents/roles/system/`,
`template/planning/rules/system/` y los ADR del sistema son el producto, y mantenerlos es el trabajo.

Lo que sí se hereda es la consecuencia: **editar `template/` cambia lo que recibe cada empresa en su
próximo `upgrade`**. Una regla nueva en `template/planning/rules/system/` baja a todos los
consumidores; no es una decisión de estilo.

## Dónde vive cada cosa

    engine/           el motor: CLI, guards, parsers, ownership. Es el producto.
    template/         el molde que recibe una instancia. Su `planning/` es además el nuestro.
    automatization/   guards, workflows y adaptadores de runner.
    agents/  teams/   el catálogo, que viaja con el paquete en vez de copiarse.
    test/             pruebas del toolkit.

Este repo no tiene `planning/` propio: `ops.config.json` declara `mode: toolkit` y `make check` valida
`template/planning`. Por eso un cargo que necesita escribir se evalúa en un banco desechable
(`evaluate <cargo> --bench`).

## Convenciones

- **Cero dependencias**, de runtime y de desarrollo: Node >= 24 y nada más. Por eso no hay linter ni
  formateador —las convenciones se sostienen leyéndolas—, y agregar una dependencia es una decisión,
  no un detalle.
- **120 caracteres por línea.**
- **Comentarios y documentación en español; mensajes de commit en inglés**, Conventional Commits.
- Las pruebas corren con `node --test`. La puerta real es `npm run ci`: `check`, automatización,
  integraciones y cobertura.
