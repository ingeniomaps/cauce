# Reclamos

Un archivo por tarea tomada, con el slug de la tarea como nombre: `dashboard-filtros.md` dice que esa
tarea la está haciendo alguien. Crearlo es tomarla; borrarlo es soltarla.

```bash
node tools/ops.js claim planning dashboard-filtros
node tools/ops.js release planning dashboard-filtros
```

Los dos escriben acá y sólo acá. `BACKLOG.md` no lo toca ningún comando del motor: la cola es de lo
aprobado y la escribe una persona.

## Por qué un archivo por tarea y no uno por persona

Dos personas en tareas distintas no tocan nunca el mismo archivo, así que tomar trabajo no produce
conflictos. Y dos que toman la misma sí chocan, en git, al mergear — que es exactamente donde el choque
significa algo y donde alguien lo va a ver.

Un archivo por persona invierte las dos propiedades: dos agentes de la misma persona pelean por su
archivo, y dos personas que tomaron lo mismo no chocan hasta que alguien lo nota a mano.

## Qué no va acá

El plan, los pasos tildados y las decisiones en curso viven en `WIP.md`, que es local y no viaja por
git: cambian en cada paso y no le sirven a nadie más. Acá va lo poco que el equipo necesita —qué está
tomado y por quién—, que cambia dos veces por tarea.

Son también dos exclusiones distintas: el reclamo evita que dos runners tomen la misma tarea, y el WIP
evita que un runner lleve dos.

## Un reclamo sin empujar no protege

El otro runner lee lo que hay en su copia. Tomar una tarea y no commitear el archivo se ve igual que no
haberla tomado, y por eso `ops claim` lo recuerda al terminar.

## Cuando alguien se va

Un reclamo abandonado bloquea su tarea para siempre, y `ops check` avisa a los tres días —una tarea dura
menos de cuatro horas, así que a los tres días no es que sea larga: es que pasó algo—. Soltarlo es borrar
el archivo a mano, y `ops release` se niega a hacerlo por vos: liberar el trabajo de otro es una
decisión, no un comando.
