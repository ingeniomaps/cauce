---
caso: 091
titulo: Un proveedor de integraciones sólo existe si su adaptador vive en el motor
estado: abierto
prioridad: baja
version-detectada: 0.79.0
---

# 091 — `adapter()` conoce un solo nombre, y conectar otra herramienta exige cambiar Cauce

**🔴 abierto** · detectado en 0.79.0 · prioridad **baja** — hoy la única integración es Jira y funciona.
Sube a **media** el día que una empresa necesite un proveedor que Cauce no trae, o que se decida el 088,
que depende de este punto de extensión

## Resumen

La instancia es dueña de la **configuración** de sus integraciones (`integrations/config.json` y
`integrations/<proveedor>/config.json`), pero no del **adaptador**: `adapter()` resuelve el nombre contra
una lista fija dentro del motor, y esa lista tiene un solo elemento. Una empresa que quiera conectar su
herramienta —otro gestor de tareas, un tablero interno— no puede hacerlo desde su instancia: tiene que
cambiar Cauce, que es justo lo que un toolkit agnóstico no debería pedir.

## Reproducción

Desde un checkout de Cauce:

```bash
ls engine/integrations/providers
node -e "try { require('./engine/integrations/registry').adapter('infisical') } catch (e) { console.log(e.message) }"
```

## Síntoma

Salida real, 2026-09-10, sobre 0.79.0:

```
jira.js
No existe adaptador para infisical
```

## Causa raíz

`engine/integrations/registry.js:40-43`:

```js
function adapter(name) {
  if (name === 'jira') return require('./providers/jira')
  throw new Error(`No existe adaptador para ${name}`)
}
```

`providerConfig()` (`registry.js:29-38`) ya resuelve la configuración desde la instancia y la acota con
`F.assertWithin` a `integrations/`. El adaptador no pasa por ese camino.

## Fix propuesto

El registro de la instancia puede nombrar un adaptador propio, que el motor carga con la misma
contención que ya aplica a la configuración:

```diff
- function adapter(name) {
-   if (name === 'jira') return require('./providers/jira')
+ function adapter(root, name, entry = {}) {
+   if (entry.adapter) {
+     const file = path.resolve(root, 'integrations', entry.adapter)
+     F.assertWithin(path.join(root, 'integrations'), file, `${name}: adaptador`)
+     return require(file)
+   }
+   if (name === 'jira') return require('./providers/jira')
    throw new Error(`No existe adaptador para ${name}`)
  }
```

Lo que falta definir antes del diff es **la interfaz**: qué funciones le pide el ciclo común a un
adaptador. Hoy es implícita —lo que `registry.js` le llama a `providers/jira.js`—, y enumerarla es el
primer paso del fix: un adaptador de la empresa sólo se puede escribir contra una interfaz escrita.

## Tradeoffs

- **El motor ejecuta código de la instancia.** Es el repositorio de la empresa y corre con los mismos
  permisos que el CLI; la contención es de ruta —dentro de `integrations/`—, no de capacidad. Vale
  decirlo en el `README` de integraciones, no esconderlo detrás de la palabra «adaptador».
- **Jira pasa a ser un caso particular** de un mecanismo general. Si la interfaz se escribe mirando sólo
  a Jira, el segundo adaptador la va a encontrar estrecha; conviene que el 088 —o el primer proveedor
  real que aparezca— la valide antes de fijarla.
- **`upgrade` no toca los adaptadores propios**: viven en `integrations/<proveedor>/`, que es del
  proyecto. Eso es lo que se busca, y también quiere decir que un cambio de interfaz en el motor los
  rompe sin aviso. La interfaz necesita versión.

## Contexto de descubrimiento

2026-09-10, al revisar el 088: su propuesta de un adaptador de secretos propio de la empresa se apoyaba
en un punto de extensión que no existe tampoco para las integraciones de trabajo. Estaba adentro del 088
como una de sus causas; se separó porque se arregla, se prueba y se cierra sin decidir nada de secretos.

## Relacionados

- **088** — depende de este punto de extensión, o de uno hermano; decidir si es el mismo es parte de
  cerrar cualquiera de los dos.
- **`OPS-003`** — fija el ciclo de las integraciones de contenido de trabajo; un adaptador propio tiene
  que respetarlo (sólo lectura, staging tipado), y el motor lo sigue haciendo cumplir fuera del
  adaptador.
