---
caso: 442
titulo: planning/delivery/teamwork.md del molde tiene 321 líneas y 9 secciones sin índice, y la instancia no puede agregárselo sin separarse del molde
estado: resuelto
resuelto-en: 0.115.0
prioridad: baja
version-detectada: 0.114.0
---

# 442 — `teamwork.md` del molde pasa las 300 líneas sin índice

**🟢 resuelto en 0.115.0** · detectado en 0.114.0 · prioridad **baja**.

## Resumen

`template/planning/delivery/teamwork.md` tiene 321 líneas y 9 secciones `##` sin un `## Contenido`. Una instancia que
mide la higiene de sus documentos largos (en una instancia de una empresa, Acme, una regla propia: más de 300 líneas y
4 o más secciones piden índice interno) recibe un aviso permanente sobre un archivo que no escribió. Agregarle el índice en la instancia lo separa del
molde, que es justo lo que la instancia no quiere hacer con un archivo del molde.

## Reproducción

Desde la raíz de Cauce:

```bash
grep -c "" template/planning/delivery/teamwork.md          # 321
grep -c "^## " template/planning/delivery/teamwork.md      # 9
grep -c "^## Contenido" template/planning/delivery/teamwork.md  # 0
```

## Síntoma

En la instancia de Acme, con su propio `node planning/check.js`, el 2026-10-23:

```
⚠ planning/delivery/teamwork.md: 321 líneas y 9 secciones sin índice interno (R12)
```

La copia de la instancia es idéntica byte a byte a la del molde (`cmp` sin diferencias contra
`node_modules/@ingeniomaps/cauce/template/planning/delivery/teamwork.md`).

## Causa raíz

El archivo creció hasta 321 líneas; la sección «Varios agentes en una misma máquina» sola tiene 129
(`template/planning/delivery/teamwork.md:77-205`). Nadie le agregó navegación al crecer.

## Fix propuesto

Agregar un `## Contenido` con enlaces a las 9 secciones, debajo del párrafo de entrada (`:5-6`). Alternativa, si se
prefiere no tener índice: partir «Varios agentes en una misma máquina» en su propio archivo de `planning/delivery/`,
que deja `teamwork.md` en unas 190 líneas.

## Tradeoffs

- El índice agrega unas 12 líneas a un archivo que ya es largo; partir la sección grande lo achica, pero suma un
  archivo que el resto del molde tiene que enlazar.

## Contexto de descubrimiento

En la instancia de Acme, al revisar los avisos de su `check` antes de retomar trabajo. Se descartó corregirlo en la instancia porque
la copia es la del molde.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23, que eligió entre tres caminos: índice y una prueba que
lo sostenga. Va en la misma versión que el 437 al 441.

Revisado contra el fuente antes de arreglarlo:

- Los conteos se sostienen: 321 líneas, 9 secciones, ningún `## Contenido`; «Varios agentes en una misma máquina» va de
  la línea 77 a la 205, y el párrafo de entrada es el de las líneas 5-6.
- **El aviso no sale de Cauce**: lo da una regla propia de la instancia, y `grep` no encuentra ninguna convención de
  índice en `engine/`, `test/` ni `template/`. El caso pedía adoptarla, y por eso se preguntó.
- **El caso no nombraba `template/AGENTS.md`**, que también pasa de 300 líneas (314) con 8 secciones sin índice.
- El caso nombraba a la empresa; se saneó.

El caso, sección por sección:

- **Fix propuesto, el índice.** Se hizo, en los dos documentos y no sólo en `teamwork.md`: un `## Contenido` debajo
  del párrafo de entrada, con un enlace por sección. Los anclas se generan como las arma GitHub, comprobado contra su
  render de los dos archivos: minúsculas, sin signos, guiones por espacios y acentos intactos
  (`#qué-sabe-este-proyecto-y-no-este-archivo`).
- **Fix propuesto, la alternativa de partir «Varios agentes».** Se decidió que no: el índice resuelve la navegación sin
  sumar un archivo que el resto del molde tenga que enlazar.
- **Lo que el caso no pedía, y se agregó**: `test/repo/template-docs.test.js` falla cuando cualquier documento del
  molde pasa de 300 líneas con cuatro secciones o más sin un índice que enlace cada una. Sin eso, el próximo archivo que
  crezca abre otra vez el mismo caso, desde una empresa.
- **Tradeoffs, las líneas de más.** 12 en `teamwork.md` y 11 en `AGENTS.md`. El costo que el caso no nombraba es que
  `AGENTS.md` lo lee cada agente al arrancar: son 453 bytes más por agente.
- `contract.js` lee la sección `## Autonomía` de `AGENTS.md` con `P.section`, que corta sólo en líneas que empiezan
  con `## `: la entrada «- [Autonomía](#autonomía)» del índice no la confunde. La suite de contrato sigue en verde.

**Lo que se corrió para saber que funciona.**

- La prueba nueva, en rojo antes del índice: las 17 secciones de los dos documentos sin entrada.
- **Su primera versión pasaba sin mirar nada**: listaba los documentos con `git ls-files`, y en una copia sin git la
  lista salía vacía. La mutación —sacar la entrada de «Autonomía»— sobrevivió así, y eso la delató. Ahora recorre
  `template/` en el disco y exige haber leído más de veinte documentos; con eso, la misma mutación la pone en rojo:
  `'template/AGENTS.md: Autonomía'`.
- **El render de GitHub sobre la rama empujada** (`gh api … contents/<archivo>?ref=fix/437-443` con
  `Accept: application/vnd.github.html`): 21 enlaces internos en cada documento, y ninguno sin su `id`.
- `npm run ci`: exit 0, 1591/1591, con la cobertura en su piso.
- La regla de la instancia que lo marcó no se pudo correr acá: vive en su repositorio. Lo que ella mide —más de 300
  líneas y cuatro secciones sin índice— es lo que la prueba nueva comprueba.

**Revisión final de la rama.** `/code-review high` sobre `origin/main...fix/437-443` entero, ya con los cuatro commits
reagrupados y el 442 y el 443 adentro: diez hallazgos. Uno es de este caso.

1. **La prueba contaba los `##` de dentro de un bloque de código** y no conocía el sufijo `-1` con que GitHub separa un
   título repetido: un documento con un ejemplo así habría pedido enlaces a anclas que no existen. Ahora los bloques de
   código no cuentan y el repetido lleva su sufijo; una prueba de la función lo fija, y la mutación que vuelve a contar
   los bloques la pone en rojo.

`npm run ci` después de esta revisión: exit 0, 1592/1592, con la cobertura en su piso.
