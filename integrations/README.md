# Integraciones extensibles

Este toolkit usa adaptadores. El núcleo conoce el ciclo
`sync → staging → review/reconcile → promote`; cada proveedor solo traduce su API al modelo normalizado.

Contrato de un adaptador:

- `validateConfig(config, errors)` valida sin conectarse, empujando a `errors` lo que impide correr.
- `fetchItems(config, options)` hace una lectura paginada completa, acotada por `maxPages` y cancelable
  por `timeoutMs`. `options` admite además `fetchImpl`, que es lo que permite probar el recorrido
  entero sin red ni credenciales; el núcleo llama sin `options` y los topes salen de la configuración.
- `normalizeFixture(payload, config)` usa el mismo normalizador sin red para tests/importaciones.
- El snapshot normalizado nunca contiene tokens ni headers.

Agregar un proveedor requiere `engine/integrations/providers/<nombre>.js`, registrarlo en
`engine/integrations/registry.js` y añadir su
configuración bajo `template/integrations/<nombre>/`. La promoción, staging tipado, comparación a tres
bandas, limpieza segura, propuestas y validación siguen siendo comunes.

El snapshot guarda una base reconciliada. El motor deriva `incoming`, `outgoing` y `conflict`; esas señales
no se persisten. Los borradores ausentes del remoto solo se eliminan si están intactos y no fueron promovidos.

`writeback-plan` calcula actualizaciones y altas posibles, pero no existe un ejecutor remoto. Jira es el
primer adaptador y `writeBack` permanece bloqueado en `false`.
