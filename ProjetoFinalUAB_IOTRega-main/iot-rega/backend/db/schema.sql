-- ============================================================
-- IoT Rega Platform - Schema PostgreSQL + PostGIS + TimescaleDB
-- Autor: António Pacheco | nº 2100357 | Susana Pedro | nº 2202973 | UAB
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
--CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_user (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin','user','viewer')),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- PASSWORD RESET (tokens de recuperação de password)
-- Guarda apenas o hash SHA-256 do token, nunca o token em claro.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset(token_hash);

-- ------------------------------------------------------------
-- FARMS (Explorações)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farm (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  location    GEOGRAPHY(Point, 4326),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- USER_FARM (relação N:M utilizador <-> exploração)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_farm (
  user_id  INT REFERENCES app_user(id) ON DELETE CASCADE,
  farm_id  INT REFERENCES farm(id) ON DELETE CASCADE,
  role     VARCHAR(50) DEFAULT 'member',
  PRIMARY KEY (user_id, farm_id)
);

-- ------------------------------------------------------------
-- PLOTS (Talhões)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plot (
  id          SERIAL PRIMARY KEY,
  farm_id     INT NOT NULL REFERENCES farm(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  area        FLOAT,
  geometry    GEOMETRY(POLYGON, 4326),
  position    GEOGRAPHY(Point, 4326),
  crop_type   VARCHAR(50) DEFAULT 'vinha',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migração para bases de dados criadas antes de existir a coluna position
ALTER TABLE plot ADD COLUMN IF NOT EXISTS position GEOGRAPHY(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_plot_farm ON plot(farm_id);
CREATE INDEX IF NOT EXISTS idx_plot_geom ON plot USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_plot_position ON plot USING GIST (position);

-- Preenche a posição a partir do centróide do polígono quando não definida
UPDATE plot
SET position = ST_SetSRID(ST_Centroid(geometry), 4326)::geography
WHERE position IS NULL AND geometry IS NOT NULL;

-- ------------------------------------------------------------
-- IRRIGATION SYSTEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irrigation_system (
  id       SERIAL PRIMARY KEY,
  plot_id  INT REFERENCES plot(id) ON DELETE CASCADE,
  type     VARCHAR(50) CHECK (type IN ('drip','sprinkler','surface')),
  capacity DOUBLE PRECISION,
  status   VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance'))
);

-- ------------------------------------------------------------
-- SENSORS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor (
  id           SERIAL PRIMARY KEY,
  plot_id      INT NOT NULL REFERENCES plot(id) ON DELETE CASCADE,
  name         VARCHAR(100),
  type         VARCHAR(50) NOT NULL CHECK (type IN ('humidity','temperature','soil_moisture','rainfall','wind_speed')),
  unit         VARCHAR(20),
  device_id    VARCHAR(100) UNIQUE,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  installed_at TIMESTAMP,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_plot ON sensor(plot_id);
CREATE INDEX IF NOT EXISTS idx_sensor_type ON sensor(type);

-- ------------------------------------------------------------
-- SENSOR READINGS (TimescaleDB hypertable)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_reading (
  time       TIMESTAMPTZ NOT NULL,
  sensor_id  INT NOT NULL REFERENCES sensor(id) ON DELETE CASCADE,
  value      DOUBLE PRECISION NOT NULL,
  quality    SMALLINT DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_reading_sensor_time
ON sensor_reading(sensor_id, time DESC);
--SELECT create_hypertable('sensor_reading','time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_reading_sensor_time ON sensor_reading(sensor_id, time DESC);

-- ------------------------------------------------------------
-- WEATHER DATA (dados reais/observados)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_data (
  id           SERIAL PRIMARY KEY,
  plot_id      INT REFERENCES plot(id) ON DELETE CASCADE,
  time         TIMESTAMPTZ NOT NULL,
  temperature  DOUBLE PRECISION,
  humidity     DOUBLE PRECISION,
  rainfall     DOUBLE PRECISION,
  wind_speed   DOUBLE PRECISION,
  source       VARCHAR(50) DEFAULT 'openmeteo'
);

CREATE INDEX IF NOT EXISTS idx_weather_plot_time ON weather_data(plot_id, time DESC);

-- ------------------------------------------------------------
-- WEATHER FORECAST (previsão)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_forecast (
  id               SERIAL PRIMARY KEY,
  plot_id          INT REFERENCES plot(id) ON DELETE CASCADE,
  forecast_time    TIMESTAMPTZ NOT NULL,
  temperature      DOUBLE PRECISION,
  rainfall         DOUBLE PRECISION,
  probability_rain DOUBLE PRECISION,
  fetched_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- RULES (Regras de alerta)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rule (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100),
  sensor_type  VARCHAR(50) NOT NULL,
  threshold    DOUBLE PRECISION NOT NULL,
  condition    VARCHAR(10) CHECK (condition IN ('>','<','=','>=','<=')),
  severity     VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- ALERTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert (
  id          SERIAL PRIMARY KEY,
  sensor_id   INT REFERENCES sensor(id) ON DELETE SET NULL,
  rule_id     INT REFERENCES rule(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  value       DOUBLE PRECISION,
  severity    VARCHAR(20) DEFAULT 'warning',
  resolved    BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_sensor  ON alert(sensor_id);
CREATE INDEX IF NOT EXISTS idx_alert_created ON alert(created_at DESC);

-- ------------------------------------------------------------
-- COST RECORDS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_record (
  id          SERIAL PRIMARY KEY,
  plot_id     INT REFERENCES plot(id) ON DELETE CASCADE,
  category    VARCHAR(50) DEFAULT 'water',
  description TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  date        DATE NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_plot ON cost_record(plot_id);

-- ------------------------------------------------------------
-- SEED DATA (demo)
-- Password do utilizador Admin: "admin123"
-- ------------------------------------------------------------
INSERT INTO app_user (name, email, password, role)
VALUES ('Admin', 'admin@iotrega.pt',
        '$2a$10$DcNOoALDFw7ODgNNSwgcrOGhw1krQ0G.PEEllcRE4lvwJWn.EMGRG', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO farm (name, description, location)
VALUES ('Quinta do Demo', 'Exploração vitivinícola de demonstração',
        ST_GeographyFromText('SRID=4326;POINT(-8.6291 41.1579)'))
ON CONFLICT DO NOTHING;

INSERT INTO user_farm (user_id, farm_id, role)
SELECT u.id, f.id, 'owner'
FROM app_user u, farm f
WHERE u.email = 'admin@iotrega.pt' AND f.name = 'Quinta do Demo'
ON CONFLICT DO NOTHING;

INSERT INTO plot (farm_id, name, area, geometry, crop_type)
SELECT f.id, 'Talhão 1', 2.4,
       ST_SetSRID(ST_GeomFromText(
         'POLYGON((-8.6305 41.1585, -8.6285 41.1585, -8.6285 41.1572, -8.6305 41.1572, -8.6305 41.1585))'
       ), 4326),
       'vinha'
FROM farm f WHERE f.name = 'Quinta do Demo'
ON CONFLICT DO NOTHING;

INSERT INTO sensor (plot_id, name, type, unit, device_id, active)
SELECT p.id, v.name, v.type, v.unit, v.device_id, TRUE
FROM plot p, (VALUES
  ('Temperatura T1', 'temperature',   '°C', 'sim-temp-01'),
  ('Humidade T1',    'humidity',      '%',  'sim-hum-01'),
  ('Hum. Solo T1',   'soil_moisture', '%',  'sim-soil-01')
) AS v(name, type, unit, device_id)
WHERE p.name = 'Talhão 1'
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO rule (name, sensor_type, threshold, condition, severity)
VALUES
  ('Humidade do solo baixa', 'soil_moisture', 20, '<', 'warning'),
  ('Temperatura crítica',    'temperature',   35, '>', 'critical')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- LEITURAS ESTÁTICAS DE DEMONSTRAÇÃO
--
-- O MVP usa dados estáticos em vez de sensores físicos ou MQTT. Este bloco
-- gera 7 dias de leituras (de 30 em 30 minutos) para os três sensores de
-- demonstração, a partir de funções determinísticas — os mesmos dados são
-- reproduzidos em qualquer instalação, o que é essencial para a demonstração
-- e para as evidências do relatório.
--
-- Os perfis reproduzem comportamentos realistas:
--   temperature   : ciclo diurno entre ~8 e ~36 °C (ultrapassa o limiar
--                   crítico de 35 °C nas horas de maior calor)
--   humidity      : inverso da temperatura, entre ~40 e ~90 %
--   soil_moisture : secagem progressiva com ciclos de rega, descendo
--                   abaixo do limiar de aviso de 20 %
-- ------------------------------------------------------------
INSERT INTO sensor_reading (time, sensor_id, value, quality)
SELECT
  t,
  s.id,
  CASE s.type
    WHEN 'temperature' THEN
      ROUND((22 + 12 * SIN(2 * PI() * (EXTRACT(EPOCH FROM t) / 3600 - 9) / 24)
                + 2 * SIN(EXTRACT(EPOCH FROM t) / 86400.0))::numeric, 1)
    WHEN 'humidity' THEN
      ROUND((65 - 20 * SIN(2 * PI() * (EXTRACT(EPOCH FROM t) / 3600 - 9) / 24)
                + 5 * COS(EXTRACT(EPOCH FROM t) / 43200.0))::numeric, 1)
    WHEN 'soil_moisture' THEN
      ROUND((32 - 14 * COS(2 * PI() * EXTRACT(EPOCH FROM t) / (86400 * 3.5)))::numeric, 1)
  END,
  1
FROM sensor s
CROSS JOIN generate_series(
  date_trunc('hour', NOW()) - INTERVAL '7 days',
  date_trunc('hour', NOW()),
  INTERVAL '30 minutes'
) AS t
WHERE s.device_id IN ('sim-temp-01', 'sim-hum-01', 'sim-soil-01')
  AND NOT EXISTS (SELECT 1 FROM sensor_reading r WHERE r.sensor_id = s.id);

-- ------------------------------------------------------------
-- ALERTAS DE DEMONSTRAÇÃO
--
-- Gerados a partir das leituras acima que efectivamente violam as regras
-- definidas — não são valores inventados. Regista-se no máximo um alerta por
-- sensor, regra e dia, replicando o comportamento do motor de alertas
-- (alertService), que evita duplicar alertas por resolver.
--
-- Os alertas com mais de dois dias aparecem como resolvidos; os restantes
-- ficam activos, para que o dashboard e a página de alertas tenham conteúdo.
-- ------------------------------------------------------------
INSERT INTO alert (sensor_id, rule_id, message, value, severity, resolved, resolved_at, created_at)
SELECT DISTINCT ON (r.sensor_id, ru.id, date_trunc('day', r.time))
  r.sensor_id,
  ru.id,
  ru.name || ': valor ' || r.value || ' ' || ru.condition || ' ' || ru.threshold,
  r.value,
  ru.severity,
  (r.time < NOW() - INTERVAL '2 days'),
  CASE WHEN r.time < NOW() - INTERVAL '2 days' THEN r.time + INTERVAL '3 hours' END,
  r.time
FROM sensor_reading r
JOIN sensor s  ON s.id = r.sensor_id
JOIN rule   ru ON ru.sensor_type = s.type AND ru.active
WHERE ((ru.condition = '>' AND r.value > ru.threshold)
    OR (ru.condition = '<' AND r.value < ru.threshold))
  AND NOT EXISTS (SELECT 1 FROM alert a)
ORDER BY r.sensor_id, ru.id, date_trunc('day', r.time), r.time DESC;

-- ------------------------------------------------------------
-- CUSTOS OPERACIONAIS DE DEMONSTRAÇÃO
-- Três meses de custos por categoria, para o resumo mensal do dashboard
-- de custos ter conteúdo.
-- ------------------------------------------------------------
INSERT INTO cost_record (plot_id, category, description, amount, date)
SELECT p.id, v.category, v.description, v.amount,
       (date_trunc('month', CURRENT_DATE) - (v.months_ago || ' months')::INTERVAL + (v.day || ' days')::INTERVAL)::date
FROM plot p, (VALUES
  ('water',         'Consumo de água - rega gotejamento', 340.50, 2, 4),
  ('energy',        'Electricidade da bomba',             182.30, 2, 9),
  ('maintenance',   'Substituição de gotejadores',         95.00, 2, 18),
  ('water',         'Consumo de água - rega gotejamento', 402.75, 1, 3),
  ('energy',        'Electricidade da bomba',             210.40, 1, 11),
  ('fertilization', 'Fertilizante foliar',                156.80, 1, 20),
  ('water',         'Consumo de água - rega gotejamento', 388.20, 0, 5),
  ('energy',        'Electricidade da bomba',             198.60, 0, 12),
  ('maintenance',   'Manutenção do sistema de filtragem',  74.90, 0, 15)
) AS v(category, description, amount, months_ago, day)
WHERE p.name = 'Talhão 1'
  AND NOT EXISTS (SELECT 1 FROM cost_record c);
