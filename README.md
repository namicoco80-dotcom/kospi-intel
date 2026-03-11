# KOSPI INTEL — 자동화 스크립트

## 파일 구조
```
.github/workflows/update-data.yml   ← GitHub Actions 자동 실행
scripts/fetch_news.py               ← 뉴스/공시 수집 + AI 분석
scripts/update_prices.py            ← 주가/수급 수집
data/
  news.json       ← 뉴스 + DART 공시 (자동 생성)
  prices.json     ← 주가 데이터 (자동 생성)
  supply.json     ← 수급 데이터 (자동 생성)
  analysis.json   ← Gemini AI 분석 결과 (자동 생성)
  index.json      ← KOSPI/KOSDAQ 지수 (자동 생성)
```

## GitHub Secrets 설정

저장소 → Settings → Secrets and variables → Actions → New repository secret

| Secret 이름       | 값                        | 필수 여부 |
|------------------|--------------------------|---------|
| `DART_API_KEY`   | DART Open API 키          | 필수     |
| `GEMINI_API_KEY` | Google Gemini API 키      | 선택     |

### DART API 키 발급
1. https://opendart.fss.or.kr 접속
2. 로그인 → API 신청 → 즉시 발급

### Gemini API 키 발급 (선택)
1. https://aistudio.google.com 접속
2. Get API Key → 무료 발급

## 실행 스케줄

- **자동**: 평일 16:35 KST (장 마감 후)
- **수동**: GitHub → Actions → 워크플로우 → Run workflow

## 뉴스 소스

| 소스 | 내용 | 신뢰도 |
|------|------|--------|
| 구글 뉴스 RSS | 종목별 최신 뉴스 | B |
| DART 공시 API | 금감원 공식 공시 | A |

## data/ 폴더 초기 생성

처음 실행 전, data/ 폴더에 빈 파일 4개 커밋 필요:
```bash
mkdir data
echo "[]" > data/news.json
echo "[]" > data/prices.json
echo "[]" > data/supply.json
echo "{}" > data/analysis.json
```
