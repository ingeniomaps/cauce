# Volumen 2025 por concepto — `history_wallets`, Colombia

Consulta corrida el 2026-10-06 sobre la réplica de lectura. Montos en pesos colombianos.

```sql
SELECT identification_code, type, COUNT(*) AS movimientos, SUM(amount) AS total
FROM history_wallets
WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'
  AND deleted_at IS NULL
  AND identification_code IN (1030, 1031)
GROUP BY 1, 2;
```

| identification_code | type | movimientos | total |
|---------------------|------|-------------|-------|
| 1030 | SALIDA | 412.906 | 181.420.733.118 |
| 1031 | ENTRADA | 412.906 | 181.420.733.118 |
