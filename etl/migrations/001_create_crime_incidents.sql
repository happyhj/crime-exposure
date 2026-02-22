-- 001: Create crime_incidents table (11-column standard schema)
-- See CLAUDE.md section 3.3

CREATE TABLE IF NOT EXISTS crime_incidents (
    incident_id     BIGINT PRIMARY KEY,
    city            VARCHAR(50) NOT NULL,
    occurred_date   DATE NOT NULL,
    occurred_hour   SMALLINT,
    nibrs_code      VARCHAR(5) NOT NULL,
    nibrs_category  VARCHAR(20) NOT NULL,
    latitude        DECIMAL(10,8),
    longitude       DECIMAL(11,8),
    district        VARCHAR(10),
    neighborhood    VARCHAR(100),
    precinct        VARCHAR(50),
    coord_precision VARCHAR(10)
);

-- MVP indexes (CLAUDE.md section 4.2)
CREATE INDEX IF NOT EXISTS idx_city_date ON crime_incidents (city, occurred_date);
CREATE INDEX IF NOT EXISTS idx_nibrs ON crime_incidents (nibrs_code, nibrs_category);
CREATE INDEX IF NOT EXISTS idx_geo ON crime_incidents (latitude, longitude) WHERE latitude IS NOT NULL;
