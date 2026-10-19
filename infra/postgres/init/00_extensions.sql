-- =====================================================================
-- MaintainPredict AI — Extensiones PostgreSQL
-- =====================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Fase A.1 — extensiones añadidas para la spec §3.
-- `btree_gin` permite índices GIN sobre columnas escalares (combinables con pg_trgm).
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- `pg_stat_statements` exige estar en `shared_preload_libraries` ANTES de crearse.
-- Los dos compose pasan `-c shared_preload_libraries=pg_stat_statements` al arrancar
-- Postgres (docker-compose.yml y docker-compose.prod.yml). Sin ese preload, este
-- CREATE falla con «pg_stat_statements must be loaded via shared_preload_libraries».
-- En una base ya en marcha, tras añadir el preload hay que recrear el contenedor:
--   docker compose up -d --force-recreate postgres
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- DB separada para n8n
SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec
