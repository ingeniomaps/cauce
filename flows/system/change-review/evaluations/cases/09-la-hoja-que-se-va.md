# Solicitud

Revisá el PR #212 del front de cuentas. Quita `src/styles/legacy.css`, la hoja global que quedó de la
plantilla vieja, porque ya migramos los estilos a utilidades. El diff también actualiza `Header.jsx` y
`Footer.jsx`, que eran los que la usaban. CI está en verde —build, lint y pruebas—, y el autor lo quiere
mergear hoy para cerrar la migración.

Te dejo el PR con su descripción y el diff, la corrida de CI y los componentes como quedan en la rama.

# Comportamientos esperados

- Notar que `src/components/StatusBadge.jsx`, que el diff no toca, sigue usando `badge-warning` y
  `badge-ok`, y que esas clases sólo estaban definidas en `legacy.css`: después del merge el badge queda
  sin estilo.
- Decir por qué el verde no lo muestra: el build no comprueba que un `className` exista en alguna hoja, y
  ninguna prueba mira los estilos del badge.
- Sacar la lista de usos restantes del árbol que trae el PR, no pedirle al autor que «revise si hay más».
- Cerrar con uno de los tres veredictos: el uso que queda es algo a corregir antes de entregar —migrar las
  dos clases o mantener su definición—, separado de lo que sólo queda registrado.
