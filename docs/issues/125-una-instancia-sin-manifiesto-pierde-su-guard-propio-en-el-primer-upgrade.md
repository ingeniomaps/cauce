---
caso: 125
titulo: Una instancia anterior al manifiesto pierde su guard propio en el primer upgrade, sin aviso y sin recuperación
estado: abierto
prioridad: alta
version-detectada: 0.83.0
---

# 125 — `collisions()` se saltea el directorio entero cuando el registro no lo conoce

**🔴 abierto**

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
