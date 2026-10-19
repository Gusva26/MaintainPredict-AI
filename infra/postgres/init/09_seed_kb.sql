-- =====================================================================
-- MaintainPredict AI — SEED KB: base de conocimiento para el RAG (Fase B.1)
-- =====================================================================
-- Objetivo (spec §10): 30 documentos — 12 manuales + 10 históricos de falla + 8 normas.
--
-- Los documentos se insertan con `embedding` NULL a propósito: los vectoriza después
-- `apps/web/scripts/seed-kb-embeddings.ts` (pnpm db:seed:kb) con Gemini. Así este fichero
-- es SQL puro, sin depender de red ni de claves.

INSERT INTO kb_maintenance (title, category, content, metadata)
SELECT v.title, v.category, v.content, v.metadata
FROM (VALUES

-- ─── MANUALES (12) ───────────────────────────────────────────────────
('Manual rodamiento SKF 6205 — síntoma vibración', 'manual',
 'Si la vibración supera 7 mm/s en el rodamiento 6205, verificar alineación, lubricación y desgaste. Reemplazar si > 11 mm/s. Inspección cada 2000h de operación.',
 '{"equipment_type":"Pump","component":"bearing","manufacturer":"SKF","standard":"ISO 10816"}'::jsonb),

('Manual mantenimiento de motores eléctricos ABB', 'manual',
 'Inspección trimestral: aislamiento, rodamientos, ventilación. Cambio de grasa cada 4000h. Verificar corriente nominal ±10%. Si temperatura > 85°C, detener y revisar.',
 '{"equipment_type":"Motor","manufacturer":"ABB"}'::jsonb),

('Manual de bombas centrífugas Grundfos', 'manual',
 'Verificar presión de succión y descarga cada 500h. Sustituir sellos mecánicos cada 8000h. Vibración máxima admisible 7 mm/s. Caudal mínimo 30% del nominal.',
 '{"equipment_type":"Pump","manufacturer":"Grundfos"}'::jsonb),

('Manual compresores de tornillo Atlas Copco', 'manual',
 'Cambio de aceite cada 4000h. Revisar separador de aire-aceite cada 2000h. Temperatura de descarga óptima 75-90°C. Presión máxima 13 bar.',
 '{"equipment_type":"Compressor","manufacturer":"Atlas Copco"}'::jsonb),

('Manual bandas transportadoras Interroll', 'manual',
 'Tensión de banda: verificar cada 500h. Alineación de rodillos cada 1000h. Sustituir bandas con desgaste > 30%. Velocidad máxima 2 m/s.',
 '{"equipment_type":"Conveyor","manufacturer":"Interroll"}'::jsonb),

('Manual CNC Haas — mantenimiento preventivo', 'manual',
 'Cambio de filtros de refrigerante cada 500h. Verificar husillo cada 1000h. Lubricación de guías cada 250h. Calibración anual obligatoria.',
 '{"equipment_type":"CNC","manufacturer":"Haas"}'::jsonb),

('Manual de válvulas de control Fisher', 'manual',
 'Inspección de actuador cada 2000h. Sustituir empaques cada 5 años. Verificar carrera completa trimestralmente. Presión de aire 4-6 bar.',
 '{"equipment_type":"Valve","manufacturer":"Fisher"}'::jsonb),

('Manual de lubricantes industriales Mobil', 'manual',
 'Grasa EP2 para rodamientos de alta carga. Aceite ISO VG 46 para hidráulicos. Reengrase cada 400h o según temperatura. Verificar compatibilidad antes de mezclar.',
 '{"category":"lubrication"}'::jsonb),

('Manual sistemas de refrigeración industrial', 'manual',
 'Verificar presión de refrigerante mensualmente. Limpiar condensadores cada 3 meses. Temperatura de salida 8-12°C. Registro de fugas obligatorio.',
 '{"equipment_type":"HVAC"}'::jsonb),

('Manual de variadores de frecuencia Siemens', 'manual',
 'Revisar ventiladores cada 6 meses. Verificar parámetros anualmente. Temperatura ambiente máxima 40°C. Protección IP20 mínimo.',
 '{"equipment_type":"VFD","manufacturer":"Siemens"}'::jsonb),

('Manual de sensores de vibración SKF', 'manual',
 'Montaje con par de apriete 5 Nm. Rango de frecuencia 10 Hz - 10 kHz. Calibración anual. Si la señal es errática, verificar cableado y conexión.',
 '{"component":"sensor","manufacturer":"SKF"}'::jsonb),

('Manual de PLC Allen-Bradley', 'manual',
 'Backup de programa mensual. Verificar batería cada 2 años. Revisar I/O cada 6 meses. Registro de alarmas semanal.',
 '{"equipment_type":"PLC","manufacturer":"Rockwell"}'::jsonb),

-- ─── HISTÓRICOS DE FALLA (10) ────────────────────────────────────────
('Histórico falla bomba centrífuga 2023', 'historico_falla',
 'En 12 casos de falla, 9 mostraron incremento de temperatura > 80°C y vibración > 8 mm/s en las 72h previas. Causa raíz: cavitación por succión insuficiente. Acción: instalar manómetro en succión.',
 '{"equipment_type":"Pump","year":2023,"failures":12}'::jsonb),

('Histórico falla motor eléctrico 2022', 'historico_falla',
 '8 fallas registradas por sobrecalentamiento de bobinado. Temperatura > 95°C durante > 4h. Causa: filtros de ventilación obstruidos. Acción: limpieza trimestral.',
 '{"equipment_type":"Motor","year":2022,"failures":8}'::jsonb),

('Histórico falla rodamiento conveyor 2023', 'historico_falla',
 '15 fallas de rodamiento en transportador principal. Vibración > 9 mm/s detectada 5-7 días antes. Causa: falta de lubricación. Acción: reengrase cada 400h.',
 '{"equipment_type":"Conveyor","year":2023,"failures":15}'::jsonb),

('Histórico falla compresor 2023', 'historico_falla',
 '6 fallas por alta temperatura de descarga (> 105°C). Detectadas con 3-4 días de antelación por sensor de temperatura. Causa: obstrucción en intercambiador.',
 '{"equipment_type":"Compressor","year":2023,"failures":6}'::jsonb),

('Histórico falla CNC husillo 2022', 'historico_falla',
 '4 fallas de husillo. Vibración > 6 mm/s y corriente pico > 55 A. Causa: desgaste de rodamientos de precisión. Acción: sustitución cada 8000h.',
 '{"equipment_type":"CNC","year":2022,"failures":4}'::jsonb),

('Histórico falla válvulas neumáticas 2023', 'historico_falla',
 '9 fallas por pérdida de aire. Detección por caída de presión > 15%. Causa: desgaste de sellos. Acción: sustitución cada 3 años.',
 '{"equipment_type":"Valve","year":2023,"failures":9}'::jsonb),

('Histórico falsos positivos en bombas 2024', 'historico_falla',
 'Análisis de 40 predicciones > 0.7 en bombas. Solo 22 fueron fallas reales (55% precisión). Causa probable: sensibilidad a transitorios de arranque. Mejora: filtro de 30s antes de evaluar.',
 '{"equipment_type":"Pump","year":2024,"analysis":"false_positives"}'::jsonb),

('Histórico éxito predicción rodamientos', 'historico_falla',
 '87% de precisión en predicción de fallas de rodamiento en 2024. Media de 6.5 días de anticipación. Componentes: SKF 6205, 6206 y 6305. Vibración umbral óptimo: 7.5 mm/s.',
 '{"component":"bearing","year":2024,"precision":0.87}'::jsonb),

('Histórico falla por corrosión en tuberías', 'historico_falla',
 '3 incidentes por corrosión en sistema de refrigeración. Detectado por incremento de presión > 20%. Causa: agua con pH < 6.5. Acción: tratamiento químico.',
 '{"component":"piping","year":2023,"failures":3}'::jsonb),

('Histórico vibración anómala post-mantenimiento', 'historico_falla',
 'En 5 casos, vibración elevada tras mantenimiento por montaje incorrecto. Detectado en las primeras 24h. Acción: checklist de montaje obligatorio.',
 '{"category":"post_maintenance","year":2023}'::jsonb),

-- ─── NORMATIVA (8) ───────────────────────────────────────────────────
('Norma ISO 10816 — vibración mecánica', 'normativa',
 'Clasificación de severidad vibratoria en máquinas rotativas. Zona A: < 2.8 mm/s (bueno). Zona B: 2.8-7.1 mm/s (aceptable). Zona C: 7.1-11 mm/s (alerta). Zona D: > 11 mm/s (requiere acción inmediata).',
 '{"standard":"ISO 10816","scope":"vibration"}'::jsonb),

('Norma ISO 13374 — monitoreo de condición', 'normativa',
 'Arquitectura para el monitoreo de condición y diagnóstico de máquinas. Define 6 bloques funcionales: adquisición, manipulación, detección, evaluación, prognosis y presentación.',
 '{"standard":"ISO 13374","scope":"condition_monitoring"}'::jsonb),

('Norma ISO 17359 — guía de monitoreo', 'normativa',
 'Guía general para el monitoreo de condición de máquinas. Establece parámetros a medir, frecuencia de muestreo y criterios de decisión.',
 '{"standard":"ISO 17359","scope":"monitoring"}'::jsonb),

('Norma ISO 55000 — gestión de activos', 'normativa',
 'Sistema de gestión de activos físicos. Define política, objetivos, planificación y control. Alineada con ISO 9001 y ISO 14001.',
 '{"standard":"ISO 55000","scope":"asset_management"}'::jsonb),

('Norma ISO 9001 — sistemas de calidad', 'normativa',
 'Requisitos para un sistema de gestión de calidad. Aplicable a mantenimiento como proceso de soporte. Requiere acciones correctivas y mejora continua.',
 '{"standard":"ISO 9001","scope":"quality"}'::jsonb),

('Norma ISO 45001 — seguridad y salud laboral', 'normativa',
 'Sistema de gestión de seguridad y salud en el trabajo. Obligatorio aplicar LOTO (Lockout/Tagout) antes de intervenir equipos energizados.',
 '{"standard":"ISO 45001","scope":"safety","keyword":"LOTO"}'::jsonb),

('Norma IEC 60034 — máquinas eléctricas rotativas', 'normativa',
 'Define características y ensayos de motores eléctricos. Temperatura máxima de bobinado clase F: 155°C. Clase H: 180°C.',
 '{"standard":"IEC 60034","scope":"motors"}'::jsonb),

('Norma NFPA 70E — seguridad eléctrica', 'normativa',
 'Estándar para seguridad eléctrica en el lugar de trabajo. Define EPP según categoría de riesgo. Distancias de aproximación segura.',
 '{"standard":"NFPA 70E","scope":"electrical_safety"}'::jsonb)

) AS v(title, category, content, metadata)
WHERE NOT EXISTS (SELECT 1 FROM kb_maintenance);

-- ─── Verificación ────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Seed KB → documentos: % (manuales: %, históricos: %, normativa: %)',
    (SELECT count(*) FROM kb_maintenance),
    (SELECT count(*) FROM kb_maintenance WHERE category = 'manual'),
    (SELECT count(*) FROM kb_maintenance WHERE category = 'historico_falla'),
    (SELECT count(*) FROM kb_maintenance WHERE category = 'normativa');
END $$;
