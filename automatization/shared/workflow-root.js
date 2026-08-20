// El prefijo lo completa `automation install`. No puede venir del entorno: el runtime de workflows no
// expone `process`, así que leerlo de ahí reventaba el archivo entero en su primera línea. Viaja
// escrito, relativo a la carpeta donde se abre la herramienta, que es el cwd de los agentes.
const ROOT = '{{OPS_DIR}}'.replace(/\/+$/, '') || '.'
