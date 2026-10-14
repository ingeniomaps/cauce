-- Datos del informante y catálogos oficiales DIAN (tipos de documento, países, municipios DANE).
CREATE TABLE tax_report_informant_settings (
    white_brand_id INT PRIMARY KEY, nit VARCHAR(20) NOT NULL, dv VARCHAR(1) NOT NULL,
    business_name VARCHAR(450) NOT NULL, dian_department_code VARCHAR(2), dian_municipality_code VARCHAR(3)
);
CREATE TABLE dian_catalog_items (
    id BIGSERIAL PRIMARY KEY, catalog VARCHAR(40) NOT NULL, internal_id INT NOT NULL,
    dian_code VARCHAR(10) NOT NULL, label VARCHAR(120) NOT NULL, UNIQUE (catalog, internal_id)
);
-- Permisos: el rol del worker no tenía GRANT sobre las tablas nuevas ni USAGE sobre las secuencias
-- (incidente del 2026-10-01, generación en PROCESSING durante tres horas).
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO reports_worker;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO reports_worker;
