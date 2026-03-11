"""
utils.py  ─  공통 유틸리티
──────────────────────────────────────────────────────────────────────────────
모든 스크립트가 import해서 사용하는 공통 기능:
  - 로거 설정 (파일 + 콘솔 동시 출력)
  - 안전한 JSON 저장 (임시 파일 → 원자적 교체, 원본 보호)
  - 백업 생성 (최근 N개만 보존)
  - 설정 파일 로드
  - 에러 발생 시 기존 데이터 손상 방지

원칙:
  - 원본 데이터는 절대 직접 덮어쓰지 않는다
  - 임시 파일에 먼저 쓰고 성공 시에만 교체한다
  - 모든 작업은 로그에 기록한다
──────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path


# ── 경로 상수 ─────────────────────────────────────────────────────────────────
ROOT_DIR      = Path(__file__).parent.parent          # 프로젝트 루트
CONFIG_DIR    = ROOT_DIR / "config"
DATA_DIR      = ROOT_DIR / "data"
RAW_DIR       = DATA_DIR / "raw"        # 원본 수집 데이터 (절대 수정 금지)
PROCESSED_DIR = DATA_DIR / "processed"  # 가공·병합 데이터
PUBLIC_DIR    = DATA_DIR / "public"     # 프론트엔드가 읽는 최종 데이터
LOG_DIR       = DATA_DIR / "logs"       # 실행 로그
BACKUP_DIR    = DATA_DIR / "backup"     # 백업 파일

KST = timezone(timedelta(hours=9))


# ── 폴더 초기화 ───────────────────────────────────────────────────────────────
def ensure_dirs():
    """필요한 폴더가 없으면 생성한다"""
    for d in [RAW_DIR, PROCESSED_DIR, PUBLIC_DIR, LOG_DIR, BACKUP_DIR]:
        d.mkdir(parents=True, exist_ok=True)


# ── 로거 ──────────────────────────────────────────────────────────────────────
def get_logger(name: str) -> logging.Logger:
    """
    파일 + 콘솔에 동시 출력하는 로거를 반환한다.
    로그 파일: data/logs/{name}_YYYYMMDD.log
    """
    ensure_dirs()
    logger = logging.getLogger(name)
    if logger.handlers:          # 중복 핸들러 방지
        return logger

    logger.setLevel(logging.DEBUG)
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 파일 핸들러
    today = datetime.now(KST).strftime("%Y%m%d")
    log_file = LOG_DIR / f"{name}_{today}.log"
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    # 콘솔 핸들러
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


# ── 설정 로드 ─────────────────────────────────────────────────────────────────
def load_config(filename: str) -> dict:
    """config/ 폴더의 JSON 설정 파일을 로드한다"""
    path = CONFIG_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"설정 파일 없음: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_stocks() -> list[dict]:
    """stocks.json에서 감시 종목 목록을 반환한다"""
    return load_config("stocks.json")["stocks"]


# ── 안전한 JSON 저장 ──────────────────────────────────────────────────────────
def safe_write_json(path: Path, data, logger=None) -> bool:
    """
    원자적 JSON 저장:
      1. 임시 파일(.tmp)에 먼저 쓴다
      2. 성공하면 원본과 교체한다
      3. 실패해도 원본은 손상되지 않는다

    Returns:
        True  = 저장 성공
        False = 저장 실패 (원본 유지됨)
    """
    path = Path(path)
    tmp_path = path.with_suffix(".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        # 원자적 교체 (tmp → 원본)
        shutil.move(str(tmp_path), str(path))
        if logger:
            logger.debug(f"저장 완료: {path}")
        return True
    except Exception as e:
        if logger:
            logger.error(f"저장 실패: {path} → {e}")
        if tmp_path.exists():
            tmp_path.unlink()   # 임시 파일 정리
        return False


# ── 원본(raw) 저장 ────────────────────────────────────────────────────────────
def save_raw(filename: str, data, logger=None) -> bool:
    """
    원본 수집 데이터를 raw/ 폴더에 저장한다.
    파일명에 타임스탬프를 포함시켜 덮어쓰지 않는다.
    예: prices_20240315_163500.json
    """
    ts = datetime.now(KST).strftime("%Y%m%d_%H%M%S")
    stem = Path(filename).stem
    raw_path = RAW_DIR / f"{stem}_{ts}.json"
    return safe_write_json(raw_path, data, logger)


# ── 가공 데이터 저장 ──────────────────────────────────────────────────────────
def save_processed(filename: str, data, logger=None) -> bool:
    """가공된 데이터를 processed/ 폴더에 저장한다 (덮어쓰기 허용)"""
    path = PROCESSED_DIR / filename
    return safe_write_json(path, data, logger)


# ── 공개 데이터 저장 (프론트엔드용) ──────────────────────────────────────────
def save_public(filename: str, data, logger=None) -> bool:
    """
    프론트엔드가 읽는 public/ 폴더에 저장한다.
    저장 전 기존 파일을 backup/ 폴더에 백업한다.
    """
    path = PUBLIC_DIR / filename
    # 기존 파일 백업
    if path.exists():
        _backup_file(path, logger)
    return safe_write_json(path, data, logger)


# ── 백업 ──────────────────────────────────────────────────────────────────────
def _backup_file(path: Path, logger=None, keep: int = 7):
    """
    파일을 backup/ 폴더에 복사한다.
    같은 이름의 백업이 keep개를 초과하면 오래된 것부터 삭제한다.
    """
    try:
        ts = datetime.now(KST).strftime("%Y%m%d_%H%M%S")
        stem = path.stem
        backup_path = BACKUP_DIR / f"{stem}_{ts}.json"
        shutil.copy2(str(path), str(backup_path))
        if logger:
            logger.debug(f"백업 생성: {backup_path.name}")

        # 오래된 백업 정리
        old_backups = sorted(BACKUP_DIR.glob(f"{stem}_*.json"))
        while len(old_backups) > keep:
            old_backups[0].unlink()
            if logger:
                logger.debug(f"오래된 백업 삭제: {old_backups[0].name}")
            old_backups = old_backups[1:]
    except Exception as e:
        if logger:
            logger.warning(f"백업 실패 (무시): {e}")


# ── 기존 데이터 로드 (fallback용) ────────────────────────────────────────────
def load_public_json(filename: str, default=None):
    """
    public/ 폴더의 JSON을 로드한다.
    파일이 없거나 손상된 경우 default를 반환한다.
    """
    path = PUBLIC_DIR / filename
    if not path.exists():
        return default if default is not None else []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default if default is not None else []


def load_processed_json(filename: str, default=None):
    """processed/ 폴더의 JSON을 로드한다"""
    path = PROCESSED_DIR / filename
    if not path.exists():
        return default if default is not None else []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default if default is not None else []


# ── 실행 요약 로그 ────────────────────────────────────────────────────────────
def write_run_summary(script_name: str, stats: dict, logger=None):
    """
    스크립트 실행 결과를 data/logs/run_summary.json에 누적 기록한다.
    최근 30개 실행 결과만 보존한다.
    """
    summary_path = LOG_DIR / "run_summary.json"
    try:
        records = []
        if summary_path.exists():
            records = json.loads(summary_path.read_text(encoding="utf-8"))
    except Exception:
        records = []

    records.append({
        "script":    script_name,
        "timestamp": datetime.now(KST).isoformat(),
        "stats":     stats,
    })
    records = records[-30:]   # 최근 30개만 보존

    safe_write_json(summary_path, records, logger)
