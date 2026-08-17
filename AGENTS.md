# Cauce — reglas de este repositorio

Acá se **fabrica** el toolkit; no se lo consume. Las reglas que Cauce distribuye
—`template/AGENTS.md` y `template/planning/rules/`— también rigen este repo, con una inversión que
hay que tener presente antes de tocar nada.

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

## El wiring de acá es a mano

`.claude/settings.json` está escrito a mano y activa un solo guard. No correr `automation install` en
este repo: arma la superficie de consumo de una empresa, que acá no aplica. El razonamiento está en el
`$comment` de ese archivo, y es también por qué `automation doctor` reporta faltantes que son
correctos.
