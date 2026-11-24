// 서버 설정. API_URL에 server/apps-script.gs 를 배포한 웹 앱 주소를 넣으면 랭킹과 플레이 기록이 서버(구글 시트)로 전송됩니다.
// 비워두면 이 브라우저에만 저장되는 개인 랭킹으로 동작하고, 서버 전송은 하지 않습니다.
window.CD_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzkVo5A13sa1J9foPM1iqWtfcSFD9ozonPOwt1-PQ7Ux4RIKyRRjh7-keOOcvju2KCDvg/exec', // 테스트용: 로컬에서만 ?api= 로 덮어쓸 수 있다
  VERSION: '2026.11.22',
  SEND_LOG: true,       // 게임이 끝나면(또는 도중에 나가면) 플레이 기록을 서버로 보낼지
};
