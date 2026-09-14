// La raíz la completa `automation install`. No puede venir del entorno: el runtime de workflows no
// expone `process`, así que leerlo de ahí reventaba el archivo entero en su primera línea. Viaja escrita.
//
// Y viaja **absoluta**. Lo fue relativa hasta 0.89.0, anclada a la carpeta donde se abre la herramienta
// «que es el cwd de los agentes» — y esa segunda mitad es la que no se cumple: cada consigna dicta «corré
// X desde Y» con las dos rutas relativas, así que coinciden sólo si la sesión abrió exactamente donde el
// instalador supuso. Abierta en la instancia, el tramo se duplica y el comando contesta que el planning
// no existe (caso 139). Absoluta no hay dónde pararse mal.
//
// El costo de escribirla —y por qué se paga acá— lo declara `engine/automation/runners.js` junto al
// marcador.
//
// Sin instalar queda vacía y vale `.`: el toolkit no se consume a sí mismo y sus recorridos se ejercitan
// desde su propia carpeta.
const ROOT = '{{OPS_ROOT}}'.replace(/\/+$/, '') || '.'
