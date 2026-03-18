# my-hundred-million

React + Vite + Biome + Tailwind + shadcn 기반 개인 자산관리 프론트입니다.

## 현재 구현 범위

- 월급 입력/저장
- 지출 항목 입력/저장 (고정/비고정, 다중 항목 추가/수정/삭제)
- 주식 보유 입력/저장 (토스증권, 삼성증권)
- 주식 모으기 스케줄 입력/수정/저장
  - 모으기 여부(`isAccumulating`)
  - 모으기 시작 시각(`accumulationStartedAt`)
  - 주기(`WEEKLY` / `MONTHLY`)
  - 실행일(`runDay`)
  - 회차 금액/회차 수량 (미국 주식 금액은 USD/KRW 선택 입력)
- 스케줄 기준 자동 반영 로그(`stock_accumulation_logs`) 생성
  - 입력(또는 스케줄 변경)한 시점 이후 회차만 자동 반영
- 현재가/평가손익 자동 계산 (국내: Supabase Edge Function 기반 KRX OpenAPI 프록시, 해외 fallback: EODHD → FMP → Alpha Vantage → Twelve Data)
- 현재가 캐시(30분) + 수동 갱신 버튼
- API 크레딧/Rate limit 감지 시 해당 공급자 1분 쿨다운 후 자동 fallback
- 주식 검색: 국내/해외 분리 검색창 + 티커/영문명 + 주요 한글 종목명 별칭 지원
- USD/KRW 현재 환율 연동(Frankfurter 우선, 실패 시 주식 API fallback) 및 미국 주식 USD/KRW 동시 표시
- 적금 입력/수정/저장 (월 납입액, 시작일, 만기일(선택), 만기 혜택 선택: 이율/만기금액)
- 적금 정기 납입 규칙 (기존 누적 납입액 + 주기/실행일/회차금액 + 오늘부터/다음회차부터)
- 적금 정기 납입 자동 반영 로그(`installment_contribution_logs`) 생성
- 적금 기간 진행률 프로그레스바 표시
- 월 잔액 계산
  - `월급 - (고정지출 + 비고정지출 + 적금 월 고정지출 + 주식 모으기 월 고정지출)`
  - 매주 규칙은 월 4회 기준으로 계산
  - 만기 지난 적금은 월 고정지출에서 제외

## 1) 환경변수

`.env.example` 기준으로 `.env` 파일을 만드세요.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_EODHD_API_KEY=
VITE_TWELVE_DATA_API_KEY=
VITE_FMP_API_KEY=
VITE_ALPHA_VANTAGE_API_KEY=
```

- 국내 주식 검색/현재가는 Supabase Edge Function(`krx-proxy`)을 사용합니다.
- 한국 ETF/ETN/ELW 보유 시 KRX에서 `ETF 일별매매정보(etf_bydd_trd)`, `ETN 일별매매정보(etn_bydd_trd)`, `ELW 일별매매정보(elw_bydd_trd)`도 추가 승인되어야 현재가가 표시됩니다.
- 해외 주식 API 키는 1개 이상만 설정하면 됩니다.
- 환율은 Frankfurter를 우선 사용하므로 별도 키 없이도 동작합니다.

### KRX Edge Function 배포

```bash
npx supabase secrets set KRX_API_KEY=발급받은_키 --project-ref 프로젝트_REF
npx supabase functions deploy krx-proxy --project-ref 프로젝트_REF
```

- 함수 경로: `supabase/functions/krx-proxy/index.ts`
- 함수 설정: `supabase/functions/krx-proxy/config.toml` (`verify_jwt = false`)

## 2) Supabase 테이블 생성

Supabase SQL Editor에서 아래 파일을 실행하세요.

- `supabase/schema.sql`

## 3) 실행

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev
npm run lint
npm run format
npm run build
npm run preview
```

## 구조

- `src/App.tsx`: 섹션 UI + 계산 + CRUD 연결
- `src/lib/repository.ts`: Supabase CRUD
- `src/lib/stocks.ts`: 종목 검색/현재가 API
- `src/lib/format.ts`: 원화 포맷/파싱
- `src/types/finance.ts`: 도메인 타입
- `supabase/schema.sql`: DB 스키마
