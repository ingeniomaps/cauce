---
caso: 546
titulo: instalar Codex blanquea la edición del AGENTS.md de la empresa, y el upgrade siguiente lo reemplaza entero
estado: resuelto
resuelto-en: 0.124.0
prioridad: alta
version-detectada: 0.124.0
---

# 546 — instalar Codex blanquea la edición del AGENTS.md de la empresa, y el upgrade siguiente lo reemplaza entero

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **alta**: se pierde texto de la empresa. El `upgrade` lo reporta como
el reemplazo de un bloque de runner, y lo que se pierde es lo único del archivo que no se puede regenerar.

## Resumen

En una instancia embebida, `init --force` conserva el `AGENTS.md` que la empresa ya tenía, y el manifiesto lo marca como
editado. Desde ahí `upgrade` lo conserva. Pero `automation install <dir> codex` mete su bloque en ese archivo y vuelve a
anotar su digest **sin mirar si ya estaba editado**. Con eso la edición desaparece del manifiesto, y el `upgrade`
siguiente cree que el archivo es el del molde sin tocar y lo reemplaza entero.

## Reproducción

```bash
# Banco desechable: un repo con su AGENTS.md propio, HOME y CODEX_HOME falsos.
printf '# Nuestro AGENTS.md\n\nTEXTO-DE-LA-EMPRESA\n' > "$REPO/AGENTS.md"
node engine/cli/ops.js init "$REPO" --name P --mode embedded --no-install --force
node engine/cli/ops.js automation install "$REPO" claude
node engine/cli/ops.js automation install "$REPO" codex
node engine/cli/ops.js upgrade "$REPO"
```

El script que lo corre midiendo cada paso está en el scratchpad de la sesión que lo encontró (`repro-546.js`).

## Síntoma

```
init --force: 0
tras init: empresa=true editado=1
tras install claude: empresa=true editado=1
tras install codex: empresa=true editado=0
upgrade: 0 − AGENTS.md: se reemplazó entero y con él las instrucciones de codex
tras upgrade: empresa=false editado=0
```

`empresa` dice si el texto de la empresa sigue en el archivo; `editado`, si el manifiesto lo ve editado. Sin
`install codex`, el mismo `upgrade` conserva el archivo («= conservado AGENTS.md (editado localmente)»).

## Causa raíz

`engine/automation/index.js:384`: después de fusionar el bloque del runner en un archivo compartido que está en
`SYSTEM_FILES`, `install` lo vuelve a anotar con `M.recordPaths`. El comentario de arriba (`:378-382`) explica por qué
existe: sin eso, el `upgrade` siguiente le echaba a la empresa la edición que había hecho el bloque. Pero anota siempre,
también cuando el archivo ya estaba editado antes del bloque, y ahí blanquea una edición de verdad. La línea es del
2026-09-03.

## Fix propuesto

Volver a anotar sólo si el archivo no estaba editado antes de fusionar el bloque: `M.editedPaths(root, [own])` vacío
antes de escribir. Si estaba editado, se deja el digest anotado como está, y el archivo sigue viéndose editado.

## Tradeoffs

- **Es una quita** (R29): deja de anotar en un caso. Se sostiene con la reproducción de arriba lado a lado, antes y
  después, y con el control sin Codex.
- El caso inverso, un archivo sin editar al que el bloque cambia el digest, tiene que seguir anotándose: es la razón
  por la que existe la línea, y su prueba ya está (el comentario la nombra).
- Puede haber instancias que ya perdieron el texto así. No hay cómo recuperarlo desde Cauce; el historial de git de la
  empresa lo tiene, y el CHANGELOG debería decirlo.

## Contexto de descubrimiento

Revisión independiente del caso 532 (la cuenta de instrucciones que carga una sesión), el 2026-11-22: con la empresa
dueña de `AGENTS.md`, después de `install codex` su contenido se contaba como de Cauce. Buscando por qué apareció esto.

## Relacionados

- 532: cuenta lo de la empresa como de Cauce en este mismo estado. Se arregla solo con este caso.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, volver a anotar sólo si no estaba editado**: se hizo como decía el caso, en
  `engine/automation/index.js`. `install` mira si el archivo estaba editado antes de fusionar el bloque, y si lo
  estaba, deja el digest anotado como está. El comentario que daba por cierta la premisa («lo que la empresa escriba
  alrededor cambia el digest igual») se corrigió.
- **Tradeoffs, es una quita y se sostiene lado a lado**: hecho, abajo.
- **Tradeoffs, el caso inverso tiene que seguir anotándose**: hecho. La prueba que ya existía («el bloque que install
  escribe en AGENTS.md no queda como edición de la empresa») sigue en verde, y la mutación que nunca anota la pone roja.
- **Tradeoffs, instancias que ya perdieron el texto**: el CHANGELOG lo dice y manda al historial de git.
- **Lo que el enunciado no preveía**:
  - Con el arreglo, el `upgrade` conserva el archivo, pero seguía diciendo que se había llevado el bloque del runner.
    El aviso recorría todos los `SYSTEM_FILES`, también los conservados. Ahora salta los conservados
    (`engine/cli/instance.js`). Con `--force` no hay conservados, y el aviso sale como debe.
  - **Anotado sin caso propio**, porque falla hacia el lado seguro (conserva, no borra):
    - Si la empresa devuelve su archivo al texto exacto del molde más el bloque, queda editado para siempre, y el
      `upgrade` lo conserva hasta un `--force`.
    - `automation uninstall` quita el bloque y no vuelve a anotar el archivo. Así un `AGENTS.md` sin editar queda como
      editado después de desinstalar Codex. Esto ya pasaba antes de este cambio.

Lo que se corrió:

- `repro-546.js` en un banco, antes y después, lado a lado:

  ```
  antes:   tras install codex: empresa=true editado=0
           upgrade: − AGENTS.md: se reemplazó entero y con él las instrucciones de codex
           tras upgrade: empresa=false editado=0
  después: tras install codex: empresa=true editado=1
           upgrade: = conservado AGENTS.md (editado localmente)
           tras upgrade: empresa=true editado=1
  ```
- La prueba nueva en `test/wiring/ownership.test.js`, en rojo contra el código de antes («sigue editado») y en verde
  después.
- 3 mutaciones en una copia, las 3 rojas: anotar aunque estuviera editado, no anotar nunca, y avisar el bloque de un
  archivo conservado.
- La revisión corrió ocho bancos: sin editar y editado, con dos instalaciones, Claude después de Codex, `uninstall` y
  `upgrade --force`.

**Lo que se cerró después** (2026-11-22, a pedido de Manuel): los dos bordes que el arreglo dejaba del lado seguro.

- La regla «volver a anotar sólo si no estaba editado» pasó a `engine/automation/shared-record.js`, y la usan `install` y
  `uninstall`. Así `uninstall` también vuelve a anotar un archivo sin editar al que le quita el bloque. Antes lo dejaba
  como edición de la empresa.
- «Editado» se mide también sin los bloques de los runners. Un archivo que la empresa devolvió al molde, con el bloque
  adentro, vuelve a ser del molde en la instalación siguiente.
- La prueba nueva de `test/wiring/ownership.test.js` cubre los dos. 4 mutaciones, las 4 rojas. La que daba por del molde
  un archivo sin anotar sobrevivió, y mostró que esa línea sobraba: sin digest anotado, ninguna comparación coincide.
  Se quitó.

**Sin probar:** fuera del modo embebido; y una edición de la empresa dentro de los marcadores de un bloque, que no cuenta como
edición porque esa parte la reescribe `install`.

### Lista de cierre

1. hecho: la reproducción en un banco, antes en «Síntoma» y después en `repro-546-after.log`.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: la prueba nueva en rojo contra el código de antes y en verde después.
4. hecho: 3 mutaciones en una copia, las 3 rojas.
5. hecho: deja de anotar en un caso; la salida de antes y la de después van lado a lado arriba, y la prueba asierta que el `upgrade` ya no dice «se reemplazó entero».
6. hecho: banco con la CLI real, sin dobles; se midió que el texto de la empresa ya no se pierde.
7. no aplica: no depende de un modelo ni de un runner en vivo; `install` es el del motor.
8. hecho: la reproducción y las mutaciones se repitieron sobre la versión final.
9. hecho: dos runners (Claude y Codex), dos estados del archivo (editado y sin editar) y dos `upgrade` seguidos.
10. hecho: dependían el aviso del bloque en `upgrade`, que se corrigió, y los demás `recordPaths`, que la revisión recorrió sin hallar otro blanqueo.
11. hecho: una pasada de revisión independiente sobre la versión final, sin nada que impida entregar.
12. hecho: pasada de comentarios: el de `install` se reescribió porque afirmaba una premisa falsa, y el de `instance.js` es nuevo.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1936 de 1936, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
