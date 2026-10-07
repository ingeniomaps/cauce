---
caso: 325
titulo: el changelog de 0.103.5 da un costo que una instancia real no ve
estado: abierto
prioridad: baja
version-detectada: 0.103.5
---

# 325 — Dice que el agente de escritura arranca en «unos 60.000» tokens; en una instancia son 76.000 a 86.000

**🔴 abierto** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: es un número publicado que no coincide con lo que una empresa mide.

## Resumen

El changelog de 0.103.5 dice que cada paso de escritura «arranca en unos 60.000 tokens». Se midió en bancos,
que no tienen nada propio. Una instancia real carga además sus instrucciones y sus reglas.

## Lo medido

| | Agente de escritura | Agente completo |
|---|---|---|
| Banco | 54.000 a 65.000 | 72.000 a 77.000 |
| Instancia real | 76.000 a 86.000 | 92.000 a 97.000 |

En la instancia, el agente de escritura ahorra entre un 10 % y un 18 % contra el completo. La sesión que lo
midió lo dijo: «más de lo dicho».

## Causa raíz

El número salió de una sola clase de entorno y se publicó sin decirlo. Es una afirmación de mecanismo sin su
alcance, que es lo que R14 pide evitar.

## Fix propuesto

- Corregir la entrada en la próxima versión: decir el rango de un banco y el de una instancia.
- **Y decidir si el agente de escritura sigue valiendo la pena.** Es un tipo de agente más que mantener y
  que reinstalar, por un 10 % a 18 % en cuatro pasos de una tarea.

## Por qué mantenerlo, y por qué no

- **A favor**: tiene menos herramientas que el agente completo, y ya está probado en real.
- **En contra**: volver esos pasos al agente de siempre es el comportamiento de 0.103.3, sin ningún riesgo, y
  saca una pieza que puede quedar vieja al actualizar.

## Riesgos y regresiones

- Corregir el número no tiene riesgo.
- Sacar el agente es **otra vez cambiar quién escribe**: pide la misma comparación de salidas.

## Recomendación

**Corregir el número, y mantener el agente por ahora.** Reabrir la pregunta si la medición de una instancia
con más reglas propias lo deja sin ahorro.

## Relacionados

- 301 y 302.
