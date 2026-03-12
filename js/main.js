/* 앱 시작 - 모든 JS 로드 완료 후 실행 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
