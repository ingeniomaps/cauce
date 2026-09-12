---
caso: 127
titulo: Una concesión del chat no tiene alcance declarado ni procedencia, y la persona no puede fijar ninguno de los dos
estado: abierto
prioridad: baja
version-detectada: 0.86.0
---

# 127 — Lo concedido ya se ve, y sigue sin poder decirse hasta cuándo vale ni quién lo autorizó

**🔴 abierto**

## Resumen

El **117** pedía tres cosas y 0.86.0 hizo una: que lo concedido en el chat se vea en `ops check`. Las otras
dos siguen sin existir, y salen acá para no quedar archivadas dentro de un caso cerrado —que es exactamente
lo que R15 describe y lo que produjo los casos 121, 122 y 123—.

Lo que falta:

1. **Alcance declarado.** `granted` es un array plano de rutas. No se puede decir «vale mientras dure esta
   tarea» ni «vale hasta que cierre esta operación»: dura lo que dura la sesión, o hasta que alguien lo
   niegue. La forma que el 117 proponía era un archivo aparte —`planning/.ops-grants`, con ruta, guard y
   alcance— que el agente no escribe ni borra, y cuyas líneas `task:` caducan al cerrar la tarea.
2. **Procedencia.** Una línea concedida no dice de dónde salió. El 117 proponía que la escribiera el hook
   del mensaje —el único que oyó a la persona— con su marca: `# vía chat, 2026-09-12, sesión 5c17daac`. Sin
   eso, «vía chat» es una afirmación que nadie puede contrastar.

## Reproducción

No hay defecto que reproducir: es una capacidad que no existe. Lo que sí se puede mostrar es el límite.

```bash
# En una instancia, con una persona en el chat:
#   1. La persona nombra una ruta y un guard la deja pasar.
#   2. `ops check` ahora la lista  (0.86.0, caso 117).
#   3. No hay forma de escribir «esto vale sólo mientras dure t-014».
#   4. La lista no dice quién lo autorizó ni cuándo.
```

## Causa raíz

`engine/hooks/chat.js`: `granted` se guarda como un array de cadenas dentro del registro de la sesión, y
`grantedIn()` lo devuelve tal cual. No hay campo para alcance ni para procedencia, así que no hay dónde
escribirlos sin cambiar la forma del registro.

Es la misma causa que el 117 nombró para `.ops-approval` —«una línea es una ruta y nada más»— trasladada al
mecanismo que lo reemplazó.

## Fix propuesto

Los dos puntos del 117 que quedaron sin construir, tal cual estaban escritos ahí. No está decidido cuál
primero, ni si el alcance vive en un archivo nuevo o en un campo del registro.

## Tradeoffs

- **El archivo aparte es superficie nueva.** La alternativa —un campo de alcance dentro de `.ops-approval`—
  mezcla lo efímero con lo durable en el mismo lugar, que es justo la distinción que esto viene a hacer.
- **La procedencia se puede falsificar si la escribe el proceso equivocado**, así que tiene que escribirla
  el hook del mensaje y no el agente.

## Prioridad

**Baja**, y con una razón concreta: lo que sostenía al 117 en media era el agujero de auditoría —una
exención que no aparecía en ninguna corrida—, y eso se cerró en 0.86.0. Lo que queda es una capacidad que
nadie pidió todavía en trabajo real: no bloquea a nadie y no ensancha ningún permiso más allá de la sesión.

**Sube a media** el día que alguien necesite conceder algo por más de una sesión, o que una auditoría tenga
que establecer quién autorizó una ruta concreta y no pueda.

## Contexto de descubrimiento

Salió al cerrar el **117** en 0.86.0. La decisión del dueño fue «hacer visible lo concedido», que es el
punto 4 de aquel «Fix propuesto» y la mitad de auditoría del punto 1; los puntos 1 —alcance— y 2
—procedencia— no se construyeron, y cerrarlos dentro del 117 los habría dejado adentro de un caso resuelto.

## Relacionados

- **117** — de donde salió; su cierre nombra este caso como destino de lo que no se construyó.
- **116** — el que trajo `granted`, o sea el mecanismo al que le falta el alcance.
- **112** — una aprobación consumida no deja rastro; la procedencia que se pide acá es lo mismo visto desde
  la auditoría.
