# Cola partida por hito

Cada hito de la cola puede vivir en su propio archivo, `backlog/<slug>.md`, en vez de en `BACKLOG.md`. Es lo
que deja trabajar con varias líneas en paralelo —una rama por persona o por frente—: cada línea escribe el
archivo de su hito, y traer la otra no choca. Es el mismo patrón de `done/` y de `roadmap/`.

```markdown
---
order: 20
---

## Hito alta-de-pedidos — Alta de pedidos

- [ ] **validar-stock** [lite] — Rechazar el pedido sin stock. _Aceptación: un pedido sin stock devuelve 409._ (service: api)
```

- **Un archivo, un hito**, y el archivo se llama como el slug del hito. `check` lo exige.
- **`order` decide el lugar en la cola**, de menor a mayor, después de lo que siga en `BACKLOG.md`. Con un solo
  archivo lo decidía la posición; partido, hay que decirlo. De a diez deja lugar para meter uno en el medio.
- **Cuando el hito se queda sin tareas, el archivo se borra**: `autobuild` lo hace al cerrar la última.

`node tools/ops.js split-backlog planning` pasa los hitos que haya en `BACKLOG.md` a sus archivos, con el orden
que tenían. No pisa nada: si un archivo de hito ya existe, no escribe ninguno.
