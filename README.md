# VelogImg
**VelogImg**는 Velog 글 작성 중 이미지를 더 쉽고 직관적으로 다룰 수 있도록 도와주는 **Chrome 확장 프로그램**입니다.  
기존의 마크다운 이미지 문법 `![]()`을 HTML `<img>` 태그 기반으로 변환하여,  
**이미지 정렬, 크기, 테두리(border)** 를 UI로 간편하게 조절할 수 있습니다.


## 주요 기능

### 🖼 이미지 정렬
- **Left / Center / Right** 정렬 지원
- Center 정렬 시 `<p align="center">` 구조 사용
- Left / Right 정렬 시 자동으로  
  `<br clear="all">` 을 추가하여 이후 텍스트 흐름 문제를 방지

---

### 📐 이미지 크기 조절
- 버튼으로 빠르게 선택: **25 / 50 / 75 / 100 (%)**
- 직접 퍼센트 입력 가능 (1 ~ 100)
- 현재 선택된 크기는 버튼 상태로 즉시 표시

---

### 🖊 이미지 테두리(Border) 설정
- **Border ON / OFF 버튼**
  - ON 시 기본 **1px 테두리**가 즉시 적용
- **px 단위 자유 입력**
  - 원하는 테두리 두께를 숫자로 직접 입력
- UI 상태가 항상 동기화되어  
  **현재 이미지에 적용된 옵션을 한눈에 확인 가능**


## 사용 방법
1. Velog 글 작성 페이지에서 이미지를 삽입합니다.
2. 또는 좌측 마크다운 기반 이미지 텍스트를 클릭하거나 우측 실제 보이는 이미지를 클릭합니다.
3. 이미지 위에 나타나는 **VelogImg UI**에서
- 정렬
- 크기
- 테두리(Border)
를 원하는 대로 설정합니다.

---

### 사용 전
<img width="1080" height="720" alt="VelogImg1" src="https://github.com/user-attachments/assets/98533b59-68d3-4c86-912a-1adad2d6fef8" />

---
### 사용 후
<img width="1080" height="720" alt="VelogImg2" src="https://github.com/user-attachments/assets/0287c16e-050c-4c17-911e-af94d6ad1f9a" />


---

## 🔐 개인정보 및 보안
VelogImg는 어떠한 개인정보도 수집하지 않습니다.
모든 동작은 브라우저 로컬 환경에서만 이루어집니다.
외부 서버로 데이터가 전송되지 않습니다.

### 📄 Privacy Policy
👉 https://github.com/BalancingLife/VelogImg/blob/main/PRIVACY.md


주의 사항
- 본 확장프로그램은 Velog(https://velog.io)에서만 동작합니다.
- 다른 Markdown 플랫폼(GitHub, Notion 등)은 지원하지 않습니다.
- Velog 에디터 정책 변경에 따라 동작이 달라질 수 있습니다.

---

### 🧪 버전 히스토리
#### v0.1.1
- 이미지 Border ON/OFF 기능 추가
- px 단위 테두리 두께 직접 입력 지원
- 버튼 active 상태 UI 개선

#### v0.1.0
- 이미지 정렬(left / center / right)
- 이미지 크기 조절 UI
- 자동 <br clear="all"> 처리
