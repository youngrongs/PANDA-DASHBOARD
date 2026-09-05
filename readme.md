# 팬오션 AI 연구·활용 동호회 PANDA 대시보드

업무 활용, 개인 투자용, 흥미·자기계발, 최근 AI 트렌드, 직원 창작물 자료를 한곳에서 제공하는 정적 웹 대시보드입니다.

## 운영 데이터 원본

프로덕션 대시보드는 PANDA-DASHBOARD GitHub Pages의 [`resources.json`](https://youngrongs.github.io/PANDA-DASHBOARD/data/resources.json)을 읽기 전용 운영 원본(source of truth)으로 사용합니다. 자료를 갱신하려면 PANDA-DASHBOARD 저장소에서 JSON을 수정하고 commit/push한 뒤 GitHub Pages 배포가 완료되었는지 확인합니다.

이 프로젝트의 로컬 `data/resources.json`은 테스트와 계약 검증용이며 프로덕션 데이터 원본이나 런타임 fallback이 아닙니다.

## 폴더 구조

```text
ai-club-dashboard/
├─ index.html
├─ readme.md
├─ css/
│  └─ style.css
├─ js/
│  └─ app.js
└─ data/
   └─ resources.json
```
