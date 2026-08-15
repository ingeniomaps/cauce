# Solicitud

Conserva una compra a medio completar aunque la app pase a background, rote la pantalla o el sistema termine el proceso.

# Comportamientos esperados

- Modelar lifecycle y restauración sin duplicar el efecto.
- Persistir sólo el estado necesario y proteger datos sensibles.
- Cancelar o reanudar trabajo de forma segura.
- Probar background, recreación, terminación y recuperación.
