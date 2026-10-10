// Dónde y cómo registra un recorrido una acción humana: un archivo por cada una (caso 351). El porqué está
// junto al lector, en `engine/planning/human-actions.js`; acá va lo que se le dicta a quien la escribe, para
// que no tenga que abrir ningún archivo para saber la forma.
const humanWhere = (planning) => `${planning}/human/`
// `status: pendiente` va escrito entero: con una tabla el vocabulario estaba en el encabezado, y un campo
// sin él invita a inventar uno. Y un bloqueo anterior de la misma tarea, ya resuelto, no se pisa: es el
// registro de lo que se decidió.
const humanForm = (planning) => `Cada fila va en su propio archivo en ${humanWhere(planning)}, terminado en `
  + '.md, con un frontmatter de tres campos, uno por renglón —"task:" con lo que el bloqueo detiene, "status: '
  + 'pendiente" y "origin:" con la fase o el recorrido que la registra— y, como cuerpo, la acción concreta con '
  + 'su condición de desbloqueo. El nombre del archivo es corto, en minúsculas y con guiones; si ya existe uno '
  + 'con ese nombre no lo toques: al nuevo agregale -2. No edites HUMAN_ACTIONS.md.'
