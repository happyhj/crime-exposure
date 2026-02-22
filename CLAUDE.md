# US Crime Data Visualization Platform — 기획서

> Claude Code 구현용 프로젝트 명세서
> 작성일: 2026-02-22
> 작성자: Heejae + Claude (설계 세션 3회 통합)

---

## 1. 프로젝트 개요

미국 주요 도시의 범죄 데이터를 수집·표준화·시각화하는 웹 플랫폼.
도시 간 범죄 패턴 비교, 시간대별 분포, 지역별 밀도를 3D 지도 위에서 인터랙티브하게 탐색할 수 있다.

### 핵심 사용자 경험

- 시간 슬라이더로 하루를 탐색하면, 아바타가 경로를 따라 이동
- 주변 범죄 데이터가 시각화되며 건물이 3D로 솟아있음
- 시간에 따라 해가 뜨고 지며 그림자가 변함
- 도시 간 전환으로 범죄 패턴 비교 가능

---

## 2. 기술 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│  MapLibre GL JS + MapTiler tiles + Custom Layers     │
│  (2.5D 건물, 아바타 경로, 범죄 히트맵, shadow sim)     │
└────────────────────┬────────────────────────────────┘
                     │ REST API
┌────────────────────┴────────────────────────────────┐
│                  API Server                          │
│           Express 또는 Fastify (TypeScript)           │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────┐
│              PostgreSQL + PostGIS                     │
│           표준화된 11컬럼 crime_incidents              │
└────────────────────▲────────────────────────────────┘
                     │ upsert
┌────────────────────┴────────────────────────────────┐
│                  ETL (Sync Layer)                     │
│         Node.js/TypeScript 스크립트 + cron            │
│      도시별 어댑터 → 표준 스키마 변환 → DB 적재         │
└─────────────────────────────────────────────────────┘
```

### 의사결정: 왜 이 구조인가

| 결정 | 선택 | 이유 |
|------|------|------|
| DB | PostgreSQL + PostGIS | 좌표 기반 데이터에 spatial index 필수. PostGIS는 PostgreSQL 전용 |
| API | REST (Express/Fastify) | 쿼리 패턴이 정해져 있음. GraphQL은 오버헤드만 늘어남 |
| ETL | Node.js 스크립트 + cron | 하루 한번 배치에 Airflow는 과함. 로컬 디버깅 용이. 프론트와 타입 공유 가능 |
| 맵 렌더러 | MapLibre GL JS | 오픈소스(BSD), 무료, 타일 서버 선택 자유, vendor lock-in 없음 |
| 타일 서버 | MapTiler | OSM 데이터 기반 벡터 타일 + terrain RGB + 건물 높이 포함. 무료 티어 충분 |
| 언어 | TypeScript 전체 | ETL, API, Frontend 모두 통일. 타입 공유 가능 |

### 의사결정: MapLibre vs Mapbox

Mapbox GL JS v2+는 프로프리어터리 라이선스로 전환됨. MapLibre는 v1 오픈소스 포크.
- Mapbox 장점 (Globe view, Standard Style 3D 랜드마크)은 우리 프로젝트에 불필요
- 우리에게 필요한 2.5D 건물, custom layer, terrain 3D는 MapLibre에서 모두 지원
- 포트폴리오에 "오픈소스 기술로 구축"이라고 말할 수 있음
- 과금 리스크 제거 (Mapbox는 월 50K map load 이후 과금)

---

## 3. 데이터 수집 (ETL)

### 3.1 Tier 1 도시 (MVP 대상)

| 도시 | API 플랫폼 | 엔드포인트 | 범죄코드 체계 | NIBRS 매핑 난이도 |
|------|-----------|-----------|-------------|-----------------|
| Seattle | Socrata | `data.seattle.gov/resource/tazs-3rd5` | NIBRS 네이티브 | 제로 |
| Chicago | Socrata | `data.cityofchicago.org/resource/ijzp-q8t2` | IUCR → fbi_code → NIBRS | 2-3일 (25 entries) |
| LA | Socrata | `data.lacity.org/resource/2nrs-mtv8` | crm_cd → NIBRS | 1-2주 |
| Dallas | Socrata | `www.dallasopendata.com/resource/qv6i-rri7` | NIBRS 네이티브 | 제로 |
| NYC | Socrata | `data.cityofnewyork.us/resource/5uac-w243` | Penal Law → NIBRS | 2-4주 |

### 의사결정: 왜 5개 도시인가

- 5개 모두 Socrata 기반 → SocrataAdapter 하나로 API 인터페이스 통일
- Seattle/Dallas는 NIBRS 네이티브 → 매핑 작업 제로
- Chicago는 fbi_code 필드 발견으로 매핑 난이도 급감 (400+ IUCR이 아닌 25개 FBI code만 매핑)
- 지리적 분산: 서부(Seattle, LA), 중부(Chicago, Dallas), 동부(NYC)

### 3.2 Chicago fbi_code → NIBRS 매핑 (핵심 발견)

Chicago 데이터에 FBI UCR code가 이미 포함되어 있음. 원래 계획은 400+ IUCR 코드를 NIBRS로 매핑하는 1-2주 작업이었으나, fbi_code를 경유하면 25개 엔트리만 매핑하면 됨.

```
01A → 09A (Homicide)
02  → 11A (Criminal Sexual Assault)
03  → 120 (Robbery)
04A/04B → 13A (Aggravated Assault/Battery)
05  → 220 (Burglary)
06  → 23H (Larceny/Theft)
07  → 240 (Motor Vehicle Theft)
08A/08B → 13B (Simple Assault/Battery)
09  → 200 (Arson)
10-26 → Property/Society crimes (각각 매핑)
```

### 3.3 표준 스키마 (11 컬럼)

```sql
CREATE TABLE crime_incidents (
    incident_id     BIGINT PRIMARY KEY,
    city            VARCHAR(50) NOT NULL,
    occurred_date   DATE NOT NULL,
    occurred_hour   SMALLINT,           -- 0-23, NULL if unknown
    nibrs_code      VARCHAR(5) NOT NULL,
    nibrs_category  VARCHAR(20) NOT NULL, -- 'Violent'|'Property'|'Society'|'Other'
    latitude        DECIMAL(10,8),      -- NULL if missing
    longitude       DECIMAL(11,8),
    district        VARCHAR(10),        -- beat/reporting district (최소 지리 단위)
    neighborhood    VARCHAR(100),       -- 이름 (Seattle) 또는 community area (Chicago)
    precinct        VARCHAR(20),        -- precinct/district (상위 지리 단위)
    coord_precision VARCHAR(10)         -- 'block' or 'beat'
);
```

### 의사결정: 스키마 설계 근거

| 결정 | 선택 | 이유 |
|------|------|------|
| 시간 정밀도 | Hour 단위 | Seattle 데이터 55%가 round number (00분). 분 단위는 false precision |
| 위치 소스 | 로컬 API 전용 | FBI CDE는 incident-level 좌표 없음 |
| 범죄 분류 | NIBRS 코드 + 4단계 카테고리 | FBI 전국 표준. 도시 간 비교 가능한 유일한 기준 |
| 지리 계층 | district + neighborhood + precinct | 도시마다 구조 다르지만 3단계로 통일 가능 |
| Raw layer | 없음 | 재수집이 쉬움 (Socrata 전량 다운로드 지원). MVP에서 오버엔지니어링 |

### 3.4 좌표 품질 & Fallback 전략

#### 도시별 좌표 현황

| 도시 | 좌표 있음 | Sentinel 값 | Fallback 필드 | Polygon 수 | Polygon 크기 | Fallback 후 |
|------|---------|------------|-------------|-----------|------------|-----------|
| Seattle | ~70% | `"REDACTED"` | beat | 50개 | ~2-3 km² | ~91% |
| Chicago | ~97% | `NULL` | beat | 280개 | ~0.8 km² | ~100% |
| LA | ~95% | `(0.0, 0.0)` | rpt_dist | 1,100개 | ~0.3 km² | ~100% |

#### 의사결정: Beat Polygon Random Point 전략

좌표가 없는 레코드도 beat/district는 항상 기록됨 (경찰 dispatch 시스템 특성).

**ETL 시점**: 좌표 NULL로 저장, `coord_precision = 'beat'` 마킹
**렌더링 시점**: beat boundary polygon 내 uniform random point 생성 (turf.js)

이유:
- 가짜 좌표를 DB에 영속시키지 않음 (데이터 무결성)
- 매 렌더링마다 자연스럽게 흩어짐
- Beat boundary GeoJSON은 모든 도시가 공개

#### Sentinel 감지 로직 (어댑터별)

```typescript
// Seattle adapter
isCoordMissing = (lat) =>
  lat === 'REDACTED' || lat === '-1.0' || lat === '-' || !lat

// Chicago adapter
isCoordMissing = (lat) =>
  lat === null || lat === undefined || lat === ''

// LA adapter
isCoordMissing = (lat, lon) =>
  (lat === 0.0 && lon === 0.0) || !lat || !lon
```

### 3.5 ETL 어댑터 구조

```
/etl
  /adapters
    seattle.ts      ← Socrata + NIBRS 직접
    chicago.ts      ← Socrata + fbi_code→NIBRS
    la.ts           ← Socrata + crm_cd→NIBRS
    dallas.ts       ← Socrata + NIBRS 직접
    nyc.ts          ← Socrata + PL→NIBRS
  /mappings
    fbi-to-nibrs.json       (25 entries)
    community-areas.json    (77 entries, Chicago 번호→이름)
    la-crm-to-nibrs.json    (~140 entries)
    nyc-pl-to-nibrs.json    (~200 entries, Phase 2)
  sync.ts           ← 메인 엔트리포인트
```

```bash
# 사용법
$ node etl/sync.ts --city=seattle --mode=incremental
$ node etl/sync.ts --city=all --mode=full
```

### 3.6 MVP 데이터 범위

**결정**: 최근 3년 (2023-2025)

| 도시 | 예상 행 수 |
|------|----------|
| Seattle | ~200K |
| Chicago | ~780K |
| LA | ~660K |
| Dallas | ~300K |
| NYC | ~1.2M |
| **합계** | **~3.1M rows** |

저장 공간: ~470MB raw + 인덱스 → ~800MB-1GB. 로컬 PostgreSQL에서 문제없는 규모.
Sync 주기: 일 1회, 10일 lookback (7-day reporting lag + buffer).

### 의사결정: 스키마 마이그레이션 전략

- 변환된 11컬럼만 저장 (raw layer 없음)
- 어댑터에 `--full` 모드 구현 (전량 재수집)
- 매핑 테이블은 git 버전 관리
- Breaking change 시: 어댑터 수정 → truncate → full re-sync

---

## 4. API Server

### 4.1 REST 엔드포인트

```
GET /api/crimes?city=seattle&from=2023-01&to=2025-12
GET /api/crimes?lat=47.6&lon=-122.3&radius=2km
GET /api/crimes/stats?city=seattle&groupBy=hour
GET /api/crimes/stats?city=seattle&groupBy=nibrs_category
```

### 의사결정: REST vs GraphQL

REST를 선택. 이유:
- 쿼리 패턴이 정해져 있음 (위 4개면 MVP 충분)
- 프론트엔드도 우리가 만들어서 쿼리 형태를 통제 가능
- GraphQL 세팅 오버헤드 불필요

### 4.2 DB 인덱싱 (MVP 최소)

```sql
CREATE INDEX idx_city_date ON crime_incidents (city, occurred_date);
CREATE INDEX idx_nibrs ON crime_incidents (nibrs_code, nibrs_category);
CREATE INDEX idx_geo ON crime_incidents (latitude, longitude) WHERE latitude IS NOT NULL;
```

추가 인덱스 (spatial index, 파티셔닝)는 쿼리 패턴 확정 후 결정.

---

## 5. Frontend

### 5.1 기술스택

```
MapLibre GL JS          ← 베이스맵 + 2.5D 건물 + 카메라 컨트롤
  + MapTiler tiles      ← 벡터 타일 (OSM 건물 높이 포함)
  + terrain RGB         ← 지형 고도 (DEM)
  + shadow simulator    ← 건물 그림자 (mapbox-gl-shadow-simulator)
  + custom layers       ← 범죄 히트맵, 아바타 경로, 데이터 포인트
React                   ← UI 컴포넌트 (패널, 슬라이더, 필터)
TypeScript              ← 전체
turf.js                 ← beat polygon random point (coord fallback)
```

### 5.2 핵심 인터랙션

**시간 슬라이더** → 하나의 입력이 4가지를 동시에 업데이트:
1. 아바타 위치 (경로 상의 현재 지점)
2. 주변 범죄 필터링 (해당 시간대 ± N시간)
3. 맵 lighting 색상 변경 (낮↔밤)
4. 그림자 방향 변경 (태양 위치)

### 5.3 시각화 구현 난이도별 로드맵

**Phase 1 (MVP — MapLibre만으로 가능)**:
- 2.5D 건물 extrusion (OSM 데이터, fill-extrusion)
- 아바타 마커가 route를 따라 이동 (시간 슬라이더)
- 주변 범죄 포인트/히트맵
- 낮/밤 맵 스타일 전환

**Phase 2 (MapLibre + 플러그인)**:
- 시간대별 lighting color interpolation
- 건물 그림자 방향 변화 (shadow-simulator 라이브러리)
- 범죄 데이터 시간 기반 fade in/out 애니메이션

**Phase 3 (Three.js 커스텀, 선택적 확장)**:
- 실제 태양 위치 기반 realtime shadow mapping
- 건물 ambient occlusion
- 3D 아바타 모델

MapLibre의 custom layer API로 Three.js를 같은 WebGL context에 주입 가능 → Phase 3으로의 확장 경로 열려있음.

---

## 6. Beat Boundary 데이터 소스

| 도시 | 소스 | 형식 | Polygon 수 |
|------|------|------|-----------|
| Seattle | `data.seattle.gov` (SPD Beats 2015-2017) | GeoJSON | ~50 |
| Chicago | `data.cityofchicago.org/d/aerh-rz74` | GeoJSON | ~280 |
| LA | `geohub.lacity.org` (LAPD Reporting District) | GeoJSON | ~1,100 |

이 GeoJSON은 프론트엔드에서 직접 로드하여 coord fallback 및 지역 하이라이트에 사용.

---

## 7. 도시별 데이터 특성 요약

### Seattle (검증 완료)
- 22컬럼, NIBRS 네이티브, 매핑 작업 제로
- 좌표 손실 30% (REDACTED 21%, missing 9%)
- Beat(F3 등), Precinct(Southwest 등), Neighborhood(HIGHLAND PARK 등) 모두 제공
- Date format: ISO 8601

### Chicago (검증 완료)
- 22컬럼, IUCR 체계이지만 fbi_code 필드로 매핑 단축
- 좌표 97-99% 존재 (sentinel: NULL만)
- 지리 계층: Community Area(77) → District(22) → Beat(~280)
- Community Area는 번호→이름 lookup 필요 (77 entries)
- Date format: MM/DD/YYYY HH:MI:SS AM
- 전체 8M+ rows (2001~현재), 7-day reporting lag

### LA (부분 검증)
- 좌표 ~95%이지만 (0.0, 0.0) sentinel 존재
- Reporting District 1,100개 = 가장 작은 polygon = 최고 fallback 정밀도
- crm_cd → NIBRS 매핑 필요 (~140 entries)

### Dallas, NYC
- 미검증. Tier 1 완성을 위해 추후 검증 필요.

---

## 8. 구현 순서

```
Phase 0: 프로젝트 셋업
  ├── TypeScript monorepo 구조 (etl / api / frontend)
  ├── PostgreSQL + PostGIS 로컬 셋업
  └── 스키마 생성 (11컬럼 테이블)

Phase 1: ETL (데이터 수집)
  ├── SocrataAdapter 기본 구현 (pagination, rate limit)
  ├── Seattle 어댑터 (NIBRS 직접) → 첫 데이터 적재
  ├── Chicago 어댑터 (fbi_code→NIBRS 매핑)
  ├── 매핑 테이블 JSON 작성 (fbi-to-nibrs, community-areas)
  ├── coord_precision 마킹 로직
  └── --full / --incremental 모드

Phase 2: API Server
  ├── Express/Fastify 기본 셋업
  ├── 4개 REST 엔드포인트
  └── PostGIS spatial query (반경 검색)

Phase 3: Frontend (MVP)
  ├── MapLibre + MapTiler 셋업
  ├── 2.5D 건물 extrusion
  ├── 범죄 데이터 포인트 렌더링
  ├── 시간 슬라이더 + 필터링
  ├── Beat polygon 로드 + coord fallback (turf.js)
  └── 낮/밤 스타일 전환

Phase 4: Frontend (Enhanced)
  ├── 아바타 경로 이동 애니메이션
  ├── Shadow simulator 통합
  ├── 도시 전환 UI
  └── 범죄 유형별 필터/통계 패널

Phase 5: 추가 도시 + 확장
  ├── LA, Dallas, NYC 어댑터
  ├── Historical mode (20년 데이터)
  └── Phase 3 Three.js 커스텀 (선택)
```

---

## 9. 미결 사항

| 항목 | 상태 | 메모 |
|------|------|------|
| DB 호스팅 | 미결정 | 로컬 vs Supabase/Neon/RDS. MVP는 로컬로 시작 |
| Dallas 데이터 검증 | 미완료 | NIBRS 네이티브 예상이지만 실제 확인 필요 |
| NYC 데이터 검증 | 미완료 | Penal Law→NIBRS 매핑이 가장 큰 작업 |
| LA crm_cd 매핑 | 미완료 | ~140 entries, NIBRS 전환 후 데이터와 대조 필요 |
| 프론트엔드 상세 설계 | 미완료 | 컴포넌트 구조, 상태 관리 등 |
| 아바타 경로 데이터 | 미결정 | 사용자 입력? 프리셋 경로? Google Directions API? |
| 인증/배포 | 미결정 | MVP 단계에서는 불필요 |

---

## 10. 기술 참고

### SODA (Socrata Open Data API)
- SoQL(SQL-like 쿼리 언어) 지원
- 엔드포인트: `/resource/{8자리_ID}.json`
- Pagination: `$limit` + `$offset` 또는 `$order` + cursor
- Rate limit: 토큰 없이 throttle, 토큰 있으면 여유

### NIBRS (National Incident-Based Reporting System)
- FBI 전국 표준 범죄 분류 체계
- 71개 Group A 범죄 코드
- 2024년 기준 50개 주 전체 NIBRS 인증 완료
- 계층: Violent/Property/Society/Other → 15개 중분류 → 71개 코드

### Beat/District 체계
- 경찰 dispatch의 최소 지리 단위
- 모든 신고는 beat에 할당됨 (좌표 geocoding 실패와 무관)
- Boundary polygon은 각 도시 오픈 데이터 포털에서 GeoJSON으로 공개
