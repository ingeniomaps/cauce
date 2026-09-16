---
caso: 170
titulo: El «dale» no dice hasta dónde llega, así que una carpeta ya aprobada vuelve a frenar con cada archivo nuevo y parece un defecto
estado: resuelto
resuelto-en: 0.95.0
prioridad: baja
version-detectada: 0.95.0
---

# 170 — El «dale» no dice hasta dónde llega

**🟢 resuelto en 0.95.0** · detectado en 0.95.0 · prioridad **baja** — eran **dos** mitades y no una, y la
que faltaba en la dirección permisiva no era la que el caso nombraba

## Resumen

El bloqueo ofrece dos salidas y sólo una dice hasta dónde vale. Comprobado imprimiendo el mensaje entero:

```
Decile a la persona qué se frenó y por qué, y esperá: si contesta «dale», reintentá el mismo cambio y
pasa. Si prefiere aprobarlo a mano, que pegue ella tal cual en planning/.ops-approval estas líneas:
  Write /d/a.md
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_X=1 sigue existiendo y apaga
el guard para toda la sesión, que es por lo que no es la vía recomendada.
```

«Valen para ese conjunto y dejan de valer en cuanto cambie» está en la rama del **pegado** y describe las
líneas pegadas. La del **chat** dice sólo «reintentá el mismo cambio y pasa», sin decir qué queda cubierto
— y es la que se ofrece primero, porque es la barata.

El alcance del «dale» es el mismo y es correcto: aprueba exactamente lo que había quedado frenado.
Verificado — tras un «dale», el registro de la sesión queda con
`approved: ["Write /d/a.md"]` y `granted: []`.

Lo que se lee mal es la consecuencia. En una carpeta donde se itera —crear un archivo, editarlo, crear
otro— cada archivo nuevo es un bloqueo nuevo, y desde afuera parece que la carpeta ya había quedado
autorizada y el guard se olvidó. En la sesión que originó el 166 fueron tres bloqueos sobre la misma
carpeta, ya aprobada dos veces.

## Lo que este caso **no** propone

Ampliar el alcance a un directorio. Eso es exactamente la clase de permiso más ancho que el propio
`approval.js` desaconseja —«ofrecer el permiso más ancho cuando alcanza el más angosto es lo que hizo que
la variable fuera la vía que quedaba a mano», caso 089— y cambiarlo es una decisión de producto, no una
corrección.

## Las salidas posibles, sin elegir

1. **Decirlo en la rama del chat**, una cláusula: que el «dale» cubre lo que se frenó y no lo que venga
   después. Es la más barata y no cambia ningún permiso; el precio es una línea más en un mensaje que ya
   es largo, y el largo de ese mensaje lo lee un agente en cada bloqueo.
2. **Decirlo sólo cuando ya hubo un «dale» en la sesión**, que es cuando la sorpresa ocurre. Más preciso y
   más código: hay que saber que este bloqueo no es el primero.
3. **No decir nada y dejarlo así.** Defendible: el alcance es correcto, el mensaje del pegado ya lo
   explica, y quien itera sobre una carpeta va a aprender el patrón en dos bloqueos. Lo que se paga es la
   fricción de esos dos.

## Reproducción

Sobre el motor, sin sesión de Claude Code: registrar un mensaje humano, imprimir `AP.HOW(...)` y leer las
dos ramas. Después registrar un «dale» y leer `approved` y `granted` del registro. Las dos salidas están
pegadas arriba.

## Prioridad

**Baja.** No deja pasar nada ni frena nada que debiera pasar: el mecanismo hace lo correcto. Lo que cuesta
es una lectura equivocada del mensaje, y cuesta poco — dos bloqueos y se entiende.

## Contexto de descubrimiento

2026-09-16, arreglando el caso 166. Venía adentro de él, en la sección «Lo relacionado, que no se pide
arreglar acá», como una pregunta abierta: si el alcance por conjunto es deliberado, que el mensaje lo diga.
Sale como caso propio porque la pregunta que dejaba abierta ya está contestada —el alcance es deliberado y
correcto— y lo que queda es una decisión de redacción que no le tocaba al arreglo del 166.

**Consultado para escribir esto**: `engine/hooks/approval.js` (la función `HOW`, líneas 96-122),
`engine/hooks/chat.js` (`record`, y cómo se calcula `approved`), y la salida real de `HOW` y del registro
de sesión impresas desde node.

## Relacionados

- **166** (resuelto en 0.95.0) — el caso del que sale. Ahí el problema era **qué vía se ofrecía**; acá es
  qué dice la que se ofrece.
- **089** — por qué no se ofrece el permiso más ancho cuando alcanza el más angosto.
- **116** — el circuito del «dale», que es el que define este alcance.

## Cierre

**Resuelto en 0.95.0.** El caso acertó en qué faltaba —la rama del chat no decía su alcance— y se
equivocó en cuál era ese alcance. Medirlo antes de escribir una línea es lo que lo mostró, que es lo que
no hice al escribir el 169.

Recorriendo lo que enumeró:

- **«Sólo una de las dos salidas dice hasta dónde vale» → cierto, y es lo que se arregló.**
- **«El alcance del “dale” es el mismo y es correcto» → impreciso, y la imprecisión importa.** El
  **conjunto** sí es el mismo: aprueba lo que se frenó y nada más. La **duración** no: lo pegado «deja de
  valer en cuanto cambie» y lo que concede un «dale» **sigue valiendo en los mensajes siguientes** hasta
  que la persona lo niegue. Comprobado contra el mecanismo: tras un «dale», el mismo archivo pasa en los
  dos mensajes siguientes sin repetir el pedido, y otra credencial sigue frenada.
- **Y de ahí sale lo que el caso no vio: faltaban dos mitades, no una.** La que enumeró —que un archivo
  nuevo vuelve a frenar— explica una fricción que se nota. La otra —que lo concedido persiste— es la
  **dirección permisiva**, y es la que nadie extraña, porque lo que no ocurre es un bloqueo. `check` la
  muestra al final de la corrida —«N ruta(s) concedidas en el chat de esta sesión», que trajo el 117— y al
  concederla no la decía nadie.
- **Las tres salidas → se tomó la primera, con las dos mitades.** La 2 —decirlo sólo a partir del segundo
  bloqueo— se descartó: la mitad de la duración hay que decirla la primera vez, justo cuando se concede. Y
  la 3 —no decir nada— se cae sola una vez que se ve que lo que falta es la mitad permisiva: es lo mismo
  que el 117 ya había decidido para las exenciones, que una que no se ve es un límite que ya no existe.
- **«No ampliar el alcance a un directorio» → sigue sin ampliarse.** No se tocó ningún permiso: el diff
  es texto.

### Qué se corrió

- **El mensaje entero impreso antes y después**, con persona y sin ella. Sin persona no gana nada: ahí el
  alcance que corresponde es el del pegado, y anunciar el de una salida que no se ofreció sería peor.
- **Las dos mitades comprobadas contra el mecanismo en su propio caso**, porque un mensaje que describe un
  alcance que el código no tiene es peor que no decir nada: el «dale» aprueba lo frenado, otra credencial
  sigue bloqueada, y lo concedido pasa en el mensaje siguiente sin repetir el pedido.
- **Rojo previo** en la aserción de cada mitad.
- `npm run ci` exit 0: **903 pruebas**, 0 en rojo, 0 salteadas.
