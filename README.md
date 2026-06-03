# UI/UX 사전

GitHub + Vercel에 바로 올릴 수 있는 정적 HTML/CSS/JavaScript 프로젝트입니다.

## 파일 구조

```text
uiux-glossary-vercel/
├─ index.html
├─ style.css
├─ script.js
├─ data.js
└─ assets/images/
```

## Vercel 배포 방법

1. GitHub에 새 Repository를 만듭니다.
2. 이 폴더 안의 파일을 모두 업로드합니다.
3. Vercel에서 `Add New Project`를 누르고 해당 Repository를 연결합니다.
4. Framework Preset은 `Other` 또는 자동 감지 상태로 둡니다.
5. Build Command는 비워두고 Deploy합니다.

## xlsx 데이터 반영 위치

현재 샘플 용어 데이터는 `data.js`의 `window.GLOSSARY_TERMS` 배열에 들어 있습니다.
나중에 xlsx를 주면 각 행을 아래 구조로 변환해서 넣으면 됩니다.

```js
{
  id: "wireframe",
  ko: "와이어프레임",
  en: "Wireframe",
  category: "UI/UX 기본",
  tags: ["화면설계", "구조"],
  summary: "검색 결과에 보이는 두 줄 요약",
  description: "상세 페이지 본문 설명",
  example: "실무 예시",
  designerNote: "개발자와 소통할 때 참고할 말",
  image: "./assets/images/wireframe.svg"
}
```
