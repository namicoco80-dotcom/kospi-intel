/* 앱 시작 - 모든 JS 로드 완료 후 실행 */

// 새로고침 시 마지막 탭 복원
const savedTab = sessionStorage.getItem('ki_lastTab');
if (savedTab) S.tab = savedTab;

// 탭 전환 시 sessionStorage에 저장
const _origSwitchTab = switchTab;
window.switchTab = function(tab) {
  sessionStorage.setItem('ki_lastTab', tab);
  _origSwitchTab(tab);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
