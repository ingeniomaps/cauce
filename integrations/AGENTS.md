# integrations/ — contrato con sistemas externos

Esta carpeta documenta el contrato reusable. La conexión y normalización viven en
`../engine/integrations/`; los workflows viven en `../automatization/workflows/integrations/`; la
configuración portable se materializa desde `../template/integrations/`.

Toda integración es de solo lectura salvo que exista un ejecutor remoto separado, probado y aprobado.
`writeback-plan` nunca autoriza ni ejecuta una escritura. No guardes tokens, headers, cookies, cuerpos de
autenticación ni identificadores secretos en configuración, staging, propuestas o pruebas.

Un proveedor nuevo implementa validación, lectura paginada completa y normalización. El núcleo conserva la
comparación a tres bandas, reconciliación, limpieza, propuestas y promoción; no dupliques esas capacidades.

Los snapshots y `sync-state.json` son administrados por el motor. La única superficie editable por una
persona es `draft.md` o `proposed/*.md`. Una lectura parcial o fallida nunca autoriza limpieza.

Antes de cerrar un cambio ejecuta las pruebas de engine, hooks y workflows, además de `integration check`
con fixtures. Las pruebas no deben requerir una cuenta, credenciales ni llamadas reales.
