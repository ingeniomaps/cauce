'use strict'

// Los guards resuelven su raíz ops mirando el entorno antes que la entrada: `OPS_ROOT`, que exporta
// `run-hook.sh` para que un guard encuentre su motor desde cualquier carpeta, y `CLAUDE_PROJECT_DIR`,
// que pone el runner. Estas pruebas crean instancias temporales y esperan que el guard resuelva esa,
// así que heredar cualquiera de las dos las hace medir este repositorio en vez de lo que montaron.
//
// No es hipotético: el guard de verify corre la suite antes de cada commit de código y exporta la
// primera, y cinco pruebas de guards fallaban sólo por estar commiteando. Se limpia una vez, antes de
// que cualquier prueba se registre, y el resto del entorno llega intacto.
delete process.env.OPS_ROOT
delete process.env.CLAUDE_PROJECT_DIR
