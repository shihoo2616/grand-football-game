# Grand Football Stadium

Three.js와 Rapier로 제작한 브라우저용 3D 축구 게임입니다.

## 기능

- Three.js 3D 렌더링
- Rapier 물리 엔진
- 플레이어 및 CPU 드리블
- CPU 필드 플레이어 AI
- 양쪽 골키퍼 AI
- 골키퍼 위치 선정, 캐칭, 펀칭, 다이빙
- 대형 3단 관중석
- 인스턴스 방식 관중
- 경기장 지붕과 철골 아치
- LED 광고판 및 조명탑
- Vercel 배포 지원

## 조작법

| 키 | 기능 |
|---|---|
| WASD | 이동 및 드리블 |
| M | 대시 |
| Space 길게 | 슛 충전 |
| Space 떼기 | 슛 |
| J | 태클 |

## 로컬 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run dev