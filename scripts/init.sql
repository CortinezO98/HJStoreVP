-- HJStoreVP — Script de inicialización de base de datos
-- Ejecutado automáticamente por Docker al crear el contenedor

CREATE DATABASE IF NOT EXISTS hjstorevp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hjstorevp;

-- Confirmar configuración
SELECT 'Base de datos hjstorevp creada correctamente' AS status;
