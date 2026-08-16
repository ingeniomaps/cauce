# integrations/ — reglas para sistemas externos

`config.json` registra proveedores y cada subcarpeta contiene configuración no secreta, staging y
propuestas. La conexión y normalización viven en el motor; no implementes clientes de API
dentro de esta carpeta.

Toda integración se considera de solo lectura. `writeback-plan` solo calcula intención y nunca autoriza ni
ejecuta una escritura. No guardes tokens, headers, cookies ni credenciales en configuración o staging.

No edites `remote.json` ni `sync-state.json`: pertenecen al sincronizador. Cura `draft.md` y
`proposed/*.md`, valida y usa las operaciones explícitas de reconciliación. Una lectura parcial o fallida no
autoriza limpieza de staging.

Las promociones son locales y llegan únicamente a `planning/roadmap/`; nunca modifican BACKLOG, WIP o DONE.
