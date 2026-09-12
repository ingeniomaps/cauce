---
caso: 125
titulo: Una instancia anterior al manifiesto pierde su guard propio en el primer upgrade, sin aviso y sin recuperación
estado: resuelto
resuelto-en: 0.86.0
prioridad: alta
version-detectada: 0.83.0
---

# 125 — `collisions()` se saltea el directorio entero cuando el registro no lo conoce

**🟢 resuelto en 0.86.0**

## Resumen

El caso **110** cerró que `upgrade` pisara un guard propio de la empresa cuando el paquete empieza a traer
uno con el mismo nombre. Su mitigación fue aplicar la regla **sólo si el manifiesto ya registra algo en esa
ruta**, y ese acote deja afuera justo el caso que más duele: una instancia **sin manifiesto** —creada antes
de que el mecanismo existiera—.

En esa instancia, el primer `upgrade`:

1. no avisa nada —`--check` dice «la instancia está al día»—;
2. **reemplaza el guard propio por el del paquete**, sin nombrarlo y saliendo con 0;
3. y después escribe el manifiesto registrando ese archivo como entregado por Cauce.

Los tres pasos juntos hacen que la pérdida sea silenciosa **y** irrecuperable: cuando alguien la note, el
registro dice que ese archivo siempre fue de Cauce.

Son dos daños distintos y conviene no confundirlos: se pierde trabajo de la empresa, y el mensaje afirma
lo contrario de lo que pasó —«planning, organization y todo lo propio quedaron intactos»—.

## Reproducción

```bash
cd "$(mktemp -d)"
node <ruta-al-motor>/engine/cli/ops.js init acme --name Acme --mode sidecar
# Una instancia anterior al mecanismo: sin manifiesto.
rm -f acme/.cauce/manifest.json
# Un guard propio con un nombre que el paquete hoy trae.
mkdir -p acme/automatization/hooks
printf '#!/usr/bin/env bash\n# guard-chat de ACME\nexit 0\n' > acme/automatization/hooks/guard-chat.sh

node <ruta-al-motor>/engine/cli/ops.js upgrade acme --check   # ¿avisa algo?
node <ruta-al-motor>/engine/cli/ops.js upgrade acme
head -3 acme/automatization/hooks/guard-chat.sh               # ¿de quién es ahora?
```

## Síntoma

```
--- upgrade --check ANTES ---
status: 0
= 0.83.0: la instancia está al día con el motor instalado
¿nombra guard-chat?: false

--- upgrade ---
status: 0 | ¿nombra guard-chat?: false
✓ Cauce 0.83.0 → 0.83.0
  35 ruta(s) del sistema y 1 del runtime actualizadas
  planning, organization y todo lo propio quedaron intactos

--- con qué quedó el archivo ---
es el mío        : false
lo dice ACME     : false
primeras líneas  : ["#!/usr/bin/env bash",
                   "# Shim: qué registra está en engine/hooks/run.js → guards['chat']. …"]
```

El archivo quedó siendo el shim del paquete. La última línea del `upgrade` afirma que lo propio quedó
intacto.

## Causa raíz

`engine/core/ownership.js`, en `collisions()`:

```js
for (const relative of RUNTIME_PATHS) {
  if (!Object.keys(recorded).some((key) => key.startsWith(`${relative}/`))) continue
```

Sin ninguna entrada bajo `automatization/hooks/`, el `continue` descarta **el directorio entero** y no se
evalúa ninguna colisión. El comentario de esa función lo dice y lo asume: «en una instancia anterior al
registro, "sin huella" también es "lo entregó una versión vieja"».

El acote es correcto en su intención —sin registro no se puede distinguir un archivo propio de uno que
entregó una versión vieja— y equivocado en su consecuencia: ante la duda elige **sobrescribir**, que es el
lado del que no se vuelve.

`RUNTIME_PATHS` hoy es sólo `['automatization/hooks']`, así que el alcance son los guards — que es
exactamente donde la empresa pone lo suyo.

## Fix propuesto

No está decidido. Tres formas, de menos a más ambiciosa:

1. **Invertir la duda.** Sin registro para esa ruta, tratar todo archivo local que coincida en nombre con
   uno del paquete y difiera en contenido como colisión: se conserva y se avisa. Cuesta que una instancia
   vieja vea avisos por archivos que sí eran de Cauce; el precio de equivocarse es un mensaje de más, no un
   archivo perdido.
2. **Sembrar el manifiesto antes de comparar.** Si no hay registro, escribirlo con lo que hay en disco
   *antes* de decidir, y recién entonces aplicar la regla del 110. Convierte la primera corrida en la que
   establece la línea de base.
3. **Frenar y pedirlo.** Con instancia sin manifiesto y colisiones posibles, no actualizar el runtime y
   decir qué hacer. Es la más segura y la que más interrumpe.

Lo que **no** es el fix: dejarlo como está porque la población es chica. El daño es irreversible y no se
nota.

## Tradeoffs

- La opción 1 puede volverse ruidosa en instancias viejas con muchos guards del paquete editados, y **no
  está medido** cuántos avisos serían. Se puede acotar comparando sólo contra los nombres que el paquete
  trae hoy, que es lo que `shippedFiles()` ya devuelve.
- La opción 2 escribe en la instancia antes de que nadie lo pida, que es un efecto que hoy `--check` no
  tiene. Habría que decidir si `--check` también lo haría, o si quedaría midiendo distinto que `upgrade`.

## Prioridad

**Alta**, y no por la cantidad: la población es angosta —una instancia sólo puede perderlo una vez, en su
primer `upgrade`— pero el daño es **silencioso, irreversible y contradicho por el mensaje**. Baja a media
el día que se establezca que no quedan instancias sin manifiesto.

## Contexto de descubrimiento

Salió cerrando el último hueco de la auditoría de 0.79→0.83. El ítem era un Tradeoff del **110** —«no
medido cuántas instancias así quedan»— que se había declarado como no medible desde este repositorio.

Contarlas efectivamente no se puede. Lo que sí se pudo fue medir **si importa**, que era la pregunta
debajo: se montaron tres instancias y se corrió el `upgrade` real en cada una.

| Escenario | Entradas bajo `automatization/hooks/` | ¿El upgrade lo nombra? | ¿Sobrevivió el guard propio? |
|---|---|---|---|
| Sin manifiesto | (sin manifiesto) | no | **no** |
| Con manifiesto de `init` | 24 | sí | sí |
| Con huella vieja (lo que el 110 cubre) | 24 | sí | sí |

`init` registra 24 entradas de hooks, así que «con manifiesto pero sin entradas» no ocurre: la población
afectada es exactamente la que el 110 describía. La hipótesis con la que se empezó —que el manifiesto se
rellena y el problema converge solo— resultó falsa: se rellena, pero **después** de pisar el archivo.

## Relacionados

- **110** — de donde salió; su mitigación es la causa de este caso, y su cierre ahora lo nombra.
- **100** — el otro caso del registro del runtime; su arreglo no alcanza a esta rama.

## Cierre

**🟢 resuelto en 0.86.0** · `engine/core/ownership.js`, `test/instance/upgrade-own-guards.test.js`

### Contra lo que el caso enumeró

**Opción 1, «invertir la duda» — elegida por el dueño del producto y hecha tal cual.** El arreglo resultó
ser **retirar** una línea, no escribir lógica nueva: el bucle interno de `collisions()` ya comparaba contra
`shippedFiles()` y ya exigía que el contenido difiriera. Lo único que impedía que se ejecutara era el
`continue` de afuera, que descartaba el directorio entero. El acote que el propio caso proponía para
limitar el ruido —«comparar sólo contra los nombres que el paquete trae hoy»— ya estaba puesto.

**Opción 2, «sembrar el manifiesto antes de comparar» — decidida que no.** Escribe en la instancia antes de
que nadie lo pida, y el propio caso marcaba el problema: `--check` tendría que hacerlo también o pasaría a
medir distinto que `upgrade`. La opción 1 consigue lo mismo sin efectos.

**Opción 3, «frenar y pedirlo» — decidida que no.** `upgrade` ya conserva y avisa archivo por archivo, que
es el mecanismo del 110; frenar la corrida entera por esto la haría más cara sin proteger más, y el 001 ya
había establecido que abortar entero es una forma cara de conseguirlo.

**Los tres pasos del daño, uno por uno.** Los tres quedaron cubiertos por aserciones:

1. «no avisa nada, `--check` dice que está al día» → `--check` ahora sale **1** y nombra el archivo.
2. «reemplaza el guard propio sin nombrarlo» → ahora imprime `conservado …: ya existía` y el contenido de
   la empresa sigue en disco.
3. «después lo registra como entregado por Cauce» → aserciado que la entrada **no** queda en el manifiesto,
   que es lo que volvía irrecuperable la pérdida.

**Tradeoff «puede volverse ruidosa, y no está medido cuántos avisos serían»** — medido acá: **cero avisos
nuevos** en las 94 pruebas de instancia y ownership. La razón es la que el propio caso dejó anotada en su
tabla: `init` registra 24 entradas de hooks, así que una instancia normal nunca cae en esta rama. El ruido
sólo alcanza a la instancia sin manifiesto, que es exactamente la que el caso quería proteger.

**Tradeoff de la opción 2** — no aplica: no se eligió.

**Prioridad «baja a media el día que se establezca que no quedan instancias sin manifiesto»** — no se
estableció y no se tocó. Contarlas sigue sin poder hacerse desde este repositorio; lo que este arreglo
cambia es que ya no importa cuántas sean, porque ninguna pierde el archivo.

### Lo que apareció y el caso no preveía

**Había una prueba que aseveraba el defecto como si fuera lo correcto.**
`test/instance/upgrade-own-guards.test.js` terminaba con «En una instancia anterior al registro, "sin
huella" no dice nada: se actualiza como antes», y aserciaba que el guard propio quedaba pisado
(`assert.equal(fs.readFileSync(chat, 'utf8'), shipped)`). O sea que el comportamiento estaba fijado por
contrato, no sólo tolerado. Se invirtió esa aserción y se le escribió el porqué al lado.

Vale decir cómo casi se pasa por alto: buscar `collisions` en `test/` no devuelve **nada**: ese archivo
habla de «sin huella» y de «conservado», nunca de la función. Es la misma clase de contrato cruzado que
hizo fallar CI entre el 114 y el 116, y la misma que el 126 encontró contra el 119.

### Qué se corrió

- **Rojo previo**, con el motor sin tocar: `tests 5, pass 3, fail 2`. Las dos fallas, por su motivo:
  - el caso 110 devolvía `✓ Cauce 0.84.0 → 0.84.0 … planning, organization y todo lo propio quedaron
    intactos` mientras pisaba el guard — la afirmación falsa que el caso denuncia, capturada literal;
  - el caso 125 fallaba en su **primera** aserción: `upgrade --check` salía `0` en vez de `1`, que es el
    paso 1 del daño.
- **Verde**: `tests 94, pass 94, fail 0` sobre `test/instance/*.test.js` más `test/wiring/ownership.test.js`
  —las dos pruebas antes rojas incluidas—. Se corrió el radio entero y no sólo el archivo tocado porque
  `collisions()` lo consumen además `engine/automation/index.js:57` y `engine/cli/instance.js:283`.
- **Mutación** (en copia desechable bajo el scratchpad de la sesión, R23): devolver el `continue` retirado
  —una sola ocurrencia, verificada— deja `tests 5, pass 3, fail 2`, las mismas dos. Sin eso, el verde sólo
  diría que las pruebas corren.
