# KOSPI INTEL

AI 기반 한국 주식 뉴스·주가 모니터링 플랫폼

---

## 📁 폴더 구조

```
kospi-intel/
│
├── index.html                    # 프론트엔드 (단일 파일)
│
├── config/
│   └── stocks.json               # 감시 종목 마스터 목록 (여기만 수정)
│
├── scripts/
│   ├── utils.py                  # 공통 유틸리티 (로깅·저장·백업)
│   ├── collect_prices.py         # 주가·수급 수집
│   └── collect_news.py           # 뉴스·공시 수집 + AI 분석
│
├── data/
│   ├── raw/                      # ⛔ 원본 수집 데이터 (절대 수정 금지)
│   │   ├── prices_20240315_163500.json
│   │   ├── news_google_20240315_163500.json
│   │   └── ...
│   │
│   ├── processed/                # 중간 가공 데이터
│   │   └── news_merged.json
│   │
│   ├── public/                   # ✅ 프론트엔드가 읽는 최종 데이터
│   │   ├── news.json
│   │   ├── prices.json
│   │   ├── supply.json
│   │   └── index.json
│   │
│   ├── backup/                   # 자동 백업 (public 저장 전 생성)
│   │   ├── news_20240315_163500.json
│   │   └── ...
│   │
│   └── logs/                     # 실행 로그
│       ├── collect_prices_20240315.log
│       ├── collect_news_20240315.log
│       └── run_summary.json      # 실행 이력 요약
│
└── .github/
    └── workflows/
        └── update-data.yml       # GitHub Actions 자동 수집
```

---

## 🔑 데이터 흐름

```
외부 API (Yahoo/DART/구글)
        ↓
   data/raw/          ← 원본 저장 (타임스탬프 파일명, 덮어쓰기 없음)
        ↓
   data/processed/    ← 중복 제거·병합·가공
        ↓
   data/public/       ← 프론트엔드 fetch (저장 전 자동 백업)
```

---

## 🛡️ 설계 원칙

| 원칙 | 구현 방법 |
|------|-----------|
| 원본 보존 | `raw/` 에 타임스탬프 파일명으로 저장, 절대 수정 안 함 |
| 안전한 저장 | 임시 파일(.tmp) → 원자적 교체 → 실패해도 원본 유지 |
| 자동 백업 | `public/` 저장 전 `backup/` 에 이전 파일 자동 복사 |
| 로그 기록 | 모든 동작을 `logs/` 에 날짜별 파일로 기록 |
| 종목 관리 | `config/stocks.json` 하나만 수정하면 모든 스크립트에 반영 |
| 기능 분리 | `collect_prices.py` / `collect_news.py` 독립 실행 가능 |

---

## ⚙️ GitHub Secrets 설정

| Secret 이름 | 설명 | 필수 여부 |
|-------------|------|-----------|
| `DART_API_KEY` | DART 공시 API 키 | 공시 수집 시 필요 |
| `GEMINI_API_KEY` | Google Gemini AI 키 | AI 분석 시 필요 (없어도 동작) |

---

## 🚀 빠른 시작

```bash
# 1. 종목 추가/제거
# config/stocks.json 만 수정

# 2. 로컬 테스트
cd scripts
python collect_prices.py
python collect_news.py

# 3. GitHub Actions 수동 실행
# Actions 탭 → KOSPI INTEL 데이터 수집 → Run workflow
```

---

## 🔧 종목 추가 방법

`config/stocks.json` 에 항목 추가:

```json
{
  "code": "035720",
  "name": "카카오",
  "sector": "IT",
  "dart_corp_code": "00401731"
}
```

DART 기업코드는 [DART 기업코드 검색](https://dart.fss.or.kr)에서 확인.

---

## 📊 로그 확인

```
data/logs/collect_prices_YYYYMMDD.log   # 주가 수집 상세 로그
data/logs/collect_news_YYYYMMDD.log     # 뉴스 수집 상세 로그
data/logs/run_summary.json              # 최근 30회 실행 요약
```
