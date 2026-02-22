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

---

## 11. Ralph Loop 작업 프로토콜

> 이 섹션은 Claude Code (Ralph loop)가 자율적으로 작업할 때 따라야 할 규칙이다.

### 11.1 작업 흐름

```
1. gh issue list --label "priority:critical-path" --state open 으로 다음 작업 확인
2. 가장 낮은 번호(= 가장 높은 우선순위)의 open issue를 선택
3. 해당 issue에 🚧 작업 시작 코멘트
4. 구현
5. 중간 의사결정이 있으면 issue에 💡 의사결정 코멘트
6. 구현 완료 → 테스트 통과 확인
7. git commit (issue 번호 참조)
8. issue에 ✅ 완료 코멘트 → issue close
9. 다음 issue로 이동
```

### 11.2 GitHub Issue 코멘트 규칙

**작업 시작 시:**
```bash
gh issue comment <NUMBER> --body "🚧 **작업 시작**

**접근 방식**: [어떻게 구현할 것인지 1-3줄 요약]
**예상 파일**: [생성/수정할 주요 파일 목록]"
```

**의사결정 발생 시:**
```bash
gh issue comment <NUMBER> --body "💡 **의사결정**

**상황**: [무엇을 결정해야 했는지]
**선택지**: 
- A: [옵션 A 설명]
- B: [옵션 B 설명]
**결정**: [선택한 옵션]
**이유**: [왜 이걸 선택했는지]"
```

**구현 중 문제 발견 시:**
```bash
gh issue comment <NUMBER> --body "⚠️ **이슈 발견**

**문제**: [무엇이 예상과 달랐는지]
**영향**: [다른 작업에 미치는 영향]
**대응**: [어떻게 해결했는지 / 할 것인지]"
```

**작업 완료 시:**
```bash
gh issue comment <NUMBER> --body "✅ **구현 완료**

**변경 사항**:
- [주요 변경 1]
- [주요 변경 2]

**테스트 결과**: [테스트 통과 여부, 커버리지 등]
**커밋**: [커밋 해시 또는 요약]
**다음 작업에 참고할 점**: [있으면 기록]"

gh issue close <NUMBER>
```

### 11.3 Git Commit 규칙

```
feat(etl): implement Seattle adapter (#6)
fix(api): handle null coordinates in spatial query (#14)
chore(setup): add Docker Compose for PostgreSQL (#2)
```

- 항상 issue 번호를 `(#N)` 형태로 포함
- conventional commits 형식: `feat|fix|chore|docs|refactor|test`
- scope: `etl|api|frontend|setup`

### 11.4 critical-path 이슈 소진 시

`priority:critical-path` 이슈가 모두 닫히면, 같은 phase의 나머지 이슈를 처리한다.
Phase 순서: P0 → P1 → P2 → P3 → P4 → P5.

```bash
# critical-path 소진 후
gh issue list --label "phase:1-etl" --state open
# 남은 이슈 중 가장 낮은 번호부터 처리
```

### 11.5 블로커 대응

구현 중 다른 이슈가 선행되어야 한다고 판단되면:

```bash
gh issue comment <CURRENT> --body "🔒 **블로커**

이 작업은 #<BLOCKER_NUMBER> 완료 후 진행 가능.
**이유**: [왜 선행되어야 하는지]

→ #<BLOCKER_NUMBER> 먼저 진행합니다."
```

그리고 blocker 이슈를 먼저 처리한다.

### 11.6 하지 말아야 할 것

- ❌ 기획서(섹션 1~10)의 기술 결정을 변경하지 마라 (MapLibre→Mapbox 변경 금지 등)
- ❌ 새로운 의존성을 추가할 때 이유 없이 추가하지 마라 (issue 코멘트에 근거 필수)
- ❌ 기획서에 없는 기능을 임의로 추가하지 마라
- ❌ 테스트 없이 issue를 닫지 마라
- ❌ 한 커밋에 여러 이슈의 작업을 섞지 마라

### 11.7 커밋 전 필수 검증 (verify gate)

**모든 커밋 전에 반드시 실행:**

```bash
npm run verify   # = tsc --noEmit && eslint . && npm run test:all
```

이 명령이 실패하면:
1. 커밋하지 마라
2. 실패 원인을 수정하라
3. 수정 후 다시 `npm run verify`
4. 3회 시도 후에도 실패 → issue에 ⚠️ 코멘트 + 블로커 기록 → 다음 이슈로 이동

**이전에 통과했던 테스트가 깨지면 = regression**. 새 코드가 기존 기능을 깨트린 것이므로 반드시 수정 후 커밋하라.


---

## 12. 테스트 전략

> 모든 코드 변경은 테스트를 동반해야 한다. Ralph loop은 매 이슈 완료 시 **전체 테스트 스위트**를 실행하여 기존 기능이 깨지지 않았음을 확인한다.

### 12.1 테스트 프레임워크

| 영역 | 프레임워크 | 이유 |
|------|-----------|------|
| ETL (unit + integ) | Vitest | TypeScript 네이티브, 빠른 실행, ESM 지원 |
| API (unit + integ) | Vitest + Supertest | HTTP 엔드포인트 테스트에 Supertest 표준 |
| Frontend | Vitest + React Testing Library | MapLibre 로직은 unit, UI는 RTL |
| E2E pipeline | Vitest | ETL→DB→API 전체 흐름 |

**왜 Vitest**: Jest 대비 TypeScript/ESM 설정이 단순하고, 모든 패키지에서 통일 가능. monorepo에서 `vitest --workspace` 한 번으로 전체 실행.

### 12.2 테스트 3 레이어

#### Layer 1: Unit Test (외부 의존성 없음, 모킹)

빠르고 격리된 테스트. DB, 네트워크, 파일시스템 접근 없음.

**ETL unit 테스트 예시:**
```typescript
// etl/__tests__/unit/seattle-adapter.test.ts
describe('SeattleAdapter', () => {
  describe('detectSentinel', () => {
    it('REDACTED를 missing으로 감지', () => {
      expect(adapter.isCoordMissing('REDACTED')).toBe(true);
    });
    it('-1.0을 missing으로 감지', () => {
      expect(adapter.isCoordMissing('-1.0')).toBe(true);
    });
    it('정상 좌표는 통과', () => {
      expect(adapter.isCoordMissing('47.6062')).toBe(false);
    });
  });

  describe('transform', () => {
    it('Seattle raw record → StandardCrimeRecord 변환', () => {
      const raw = { /* Seattle API 응답 샘플 */ };
      const result = adapter.transform(raw);
      expect(result.city).toBe('seattle');
      expect(result.nibrs_code).toMatch(/^\d{2,3}[A-Z]?$/);
      expect(result.nibrs_category).toBeOneOf(['Violent','Property','Society','Other']);
      expect(result.coord_precision).toBeOneOf(['block','beat']);
    });
    it('좌표 REDACTED 시 coord_precision=beat', () => {
      const raw = { latitude: 'REDACTED', beat: 'F3', /* ... */ };
      const result = adapter.transform(raw);
      expect(result.latitude).toBeNull();
      expect(result.coord_precision).toBe('beat');
    });
  });
});

// etl/__tests__/unit/chicago-adapter.test.ts
describe('ChicagoAdapter', () => {
  describe('fbi_code → NIBRS 매핑', () => {
    it('01A → 09A (Murder)', () => {
      expect(mapFbiToNibrs('01A')).toEqual({ code: '09A', category: 'Violent' });
    });
    it('알 수 없는 코드 → Other', () => {
      expect(mapFbiToNibrs('99Z')).toEqual({ code: '99Z', category: 'Other' });
    });
  });

  describe('날짜 파싱', () => {
    it('MM/DD/YYYY HH:MI:SS AM 형식 파싱', () => {
      const result = parseChicagoDate('01/15/2024 02:30:00 PM');
      expect(result.date).toBe('2024-01-15');
      expect(result.hour).toBe(14);
    });
  });
});
```

**API unit 테스트 예시:**
```typescript
// api/__tests__/unit/query-builder.test.ts
describe('QueryBuilder', () => {
  it('city + date range 쿼리 생성', () => {
    const sql = buildCrimeQuery({ city: 'seattle', from: '2024-01', to: '2024-12' });
    expect(sql).toContain("city = 'seattle'");
    expect(sql).toContain("occurred_date >= '2024-01-01'");
  });
  it('radius 파라미터를 meters로 변환', () => {
    expect(parseRadius('2km')).toBe(2000);
    expect(parseRadius('500m')).toBe(500);
  });
});
```

#### Layer 2: Integration Test (실제 DB 연동)

Docker의 PostgreSQL에 연결하여 실제 쿼리 결과를 검증.

```typescript
// etl/__tests__/integration/db-upsert.test.ts
describe('DB Upsert (integration)', () => {
  beforeAll(async () => {
    // 테스트용 DB 연결 (docker-compose.test.yml)
    await db.connect();
    await db.query('TRUNCATE crime_incidents');
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('StandardCrimeRecord 배치 upsert 성공', async () => {
    const records = generateTestRecords(100);
    await upsertBatch(records);
    const { rows } = await db.query('SELECT COUNT(*) FROM crime_incidents');
    expect(Number(rows[0].count)).toBe(100);
  });

  it('동일 데이터 재실행 시 중복 없음', async () => {
    const records = generateTestRecords(100); // 같은 incident_id
    await upsertBatch(records);
    const { rows } = await db.query('SELECT COUNT(*) FROM crime_incidents');
    expect(Number(rows[0].count)).toBe(100); // 여전히 100
  });

  it('coord_precision=beat 레코드 좌표 NULL 확인', async () => {
    const record = generateTestRecord({ coordPrecision: 'beat' });
    await upsertBatch([record]);
    const { rows } = await db.query(
      'SELECT latitude, longitude, coord_precision FROM crime_incidents WHERE incident_id = $1',
      [record.incident_id]
    );
    expect(rows[0].latitude).toBeNull();
    expect(rows[0].coord_precision).toBe('beat');
  });
});

// api/__tests__/integration/crimes-endpoint.test.ts
describe('GET /api/crimes (integration)', () => {
  beforeAll(async () => {
    // 시드 데이터 적재
    await seedTestData();
    app = await createApp();
  });

  it('도시별 범죄 목록 반환', async () => {
    const res = await supertest(app)
      .get('/api/crimes?city=seattle&from=2024-01&to=2024-12')
      .expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('nibrs_code');
    expect(res.body.meta).toHaveProperty('total');
  });

  it('반경 검색 PostGIS 동작', async () => {
    const res = await supertest(app)
      .get('/api/crimes?lat=47.6062&lon=-122.3321&radius=1km')
      .expect(200);
    // 모든 결과가 1km 이내인지 검증
    res.body.data.forEach(crime => {
      const dist = haversine(47.6062, -122.3321, crime.latitude, crime.longitude);
      expect(dist).toBeLessThanOrEqual(1000);
    });
  });

  it('잘못된 city → 400', async () => {
    await supertest(app)
      .get('/api/crimes?city=invalid&from=2024-01&to=2024-12')
      .expect(400);
  });
});
```

#### Layer 3: Socrata API 스키마 검증 (외부 API 계약 테스트)

실제 Socrata API를 호출해서 응답 스키마가 바뀌지 않았는지 확인.
이 테스트가 깨지면 = 데이터 소스가 변경된 것 → 어댑터 수정 필요.

```typescript
// etl/__tests__/contract/socrata-schema.test.ts
describe('Socrata API Contract', () => {
  it('Seattle 엔드포인트 스키마 검증', async () => {
    const res = await fetch(
      'https://data.seattle.gov/resource/tazs-3rd5.json?$limit=1'
    );
    const [row] = await res.json();
    // 우리가 의존하는 필드들이 존재하는지
    expect(row).toHaveProperty('offense_id');
    expect(row).toHaveProperty('offense_start_datetime');
    expect(row).toHaveProperty('nibrs_offense_code');  // NIBRS 네이티브
    expect(row).toHaveProperty('latitude');
    expect(row).toHaveProperty('beat');
    expect(row).toHaveProperty('mcpp');        // neighborhood
    expect(row).toHaveProperty('precinct');
  });

  it('Chicago 엔드포인트 스키마 검증', async () => {
    const res = await fetch(
      'https://data.cityofchicago.org/resource/ijzp-q8t2.json?$limit=1'
    );
    const [row] = await res.json();
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('date');
    expect(row).toHaveProperty('fbi_code');    // 핵심: 이 필드가 사라지면 매핑 전략 변경 필요
    expect(row).toHaveProperty('latitude');
    expect(row).toHaveProperty('beat');
    expect(row).toHaveProperty('community_area');
    expect(row).toHaveProperty('district');
  });
});
```

### 12.3 테스트 실행 구조

```
/package.json (root)
  scripts:
    "test":        "vitest run --workspace"          # unit만 (빠름, <10초)
    "test:watch":  "vitest --workspace"               # watch 모드
    "test:integ":  "vitest run --workspace --project integ"  # integration (DB 필요)
    "test:contract": "vitest run --workspace --project contract"  # Socrata API 확인
    "test:all":    "vitest run --workspace"            # 전체
    "verify":      "tsc --noEmit && eslint . && vitest run --workspace"  # CI 풀 검증
```

### 12.4 테스트용 Docker 환경

```yaml
# docker-compose.test.yml
services:
  test-db:
    image: postgis/postgis:15-3.4
    ports: ["5433:5432"]    # 개발 DB(5432)와 분리
    environment:
      POSTGRES_DB: crime_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    tmpfs: /var/lib/postgresql/data  # RAM에서 실행 = 빠름
```

Integration 테스트는 이 test DB를 사용. 매 테스트 전 TRUNCATE로 깨끗한 상태에서 시작.

### 12.5 Ralph Loop 테스트 규칙 (섹션 11 보충)

Ralph는 매 이슈 완료 시 반드시 아래를 실행한다:

```bash
# 1. 타입 체크
tsc --noEmit

# 2. 린트
eslint .

# 3. 전체 테스트 (unit + integration)
npm run test:all

# 4. 모두 통과해야만 커밋 + issue close
```

**테스트가 실패하면:**
- issue에 ⚠️ 코멘트로 실패 내용 기록
- 수정 시도
- 3번 시도 후에도 실패 시 → issue에 블로커 기록하고 다음 이슈로 이동

**새 기능 추가 시 최소 테스트:**
- ETL 어댑터: sentinel 감지, transform 변환, 매핑 커버리지 100%
- API 엔드포인트: 정상 응답, 400/404 에러 케이스, 빈 결과
- Frontend 로직: 데이터 변환, 필터링 로직

### 12.6 Fixture / Seed 데이터

```
/etl/__tests__/fixtures/
  seattle-raw-sample.json     # Seattle API 응답 5건 (정상/REDACTED/missing 포함)
  chicago-raw-sample.json     # Chicago API 응답 5건 (각 fbi_code 타입 포함)
  seed-crime-records.json     # StandardCrimeRecord 50건 (API integration 테스트용)
```

Fixture는 실제 API 응답을 캡처하여 저장. 테스트 안정성을 위해 실제 API가 아닌 fixture 사용 (contract 테스트 제외).

### 12.7 CI 고려사항 (MVP 이후)

현재 MVP는 로컬 실행이지만, GitHub Actions 추가 시:

```yaml
# .github/workflows/test.yml (참고용, MVP에서는 미구현)
jobs:
  test:
    services:
      postgres:
        image: postgis/postgis:15-3.4
    steps:
      - run: npm run verify
```
