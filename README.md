# VelogImg

<img width="400" alt="image" src="https://github.com/user-attachments/assets/3627ee6b-f589-4c77-9cbe-6c882ad18b73" />

**VelogImg**는 Velog 글 작성 중 이미지를 더 쉽고 직관적으로 다룰 수 있도록 도와주는 **Chrome 확장 프로그램**입니다.  
기존의 마크다운 이미지 문법 `![]()`을 HTML `<img>` 태그 기반으로 변환하여,  
**이미지 정렬, 크기, 테두리(border)** 를 UI로 간편하게 조절할 수 있습니다.


## 주요 기능

### 🖼 이미지 정렬
- **Left / Center** 정렬 지원

---

### 📐 이미지 크기 조절
- 버튼으로 빠르게 선택: **25 / 50 / 75 / 100 (%)**
- 직접 퍼센트 입력 가능 (1 ~ 100)

---

### 🧩 다중 이미지 레이아웃
- HTML <table> 태그를 활용한 2열 / 3열 이미지 **row 배치** 지원
- 이미지들을 깔끔한 그리드 형태로 구성 가능


## 사용 방법
1. Velog 글 작성 페이지에서 이미지를 삽입합니다.
2. 또는 좌측 마크다운 기반 이미지 텍스트를 클릭하거나 우측 실제 보이는 이미지를 클릭합니다.
3. 이미지 위에 나타나는 **VelogImg UI**에서
- 정렬
- 크기
- 레이아웃 간편 배치
옵션을 원하는 대로 설정합니다.

설정 내용은 즉시 반영됩니다.

---

## 사용 예시

<img width="1000"  alt="1" src="https://github.com/user-attachments/assets/0885ccfe-2e6e-4221-97b6-3c02aa78f796" />

---

<img width="1000"  alt="2" src="https://github.com/user-attachments/assets/180df8f1-0e00-436b-8a11-009329ac44c7" />

---

<img width="1000"  alt="3" src="https://github.com/user-attachments/assets/2f339797-d547-45b9-8ba7-79ce62d1801c" />

---

<img width="1000"  alt="4" src="https://github.com/user-attachments/assets/b28f0a8d-3025-46af-bf1c-b449419b558a" />

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
v1.0.0
- Right 정렬 및 Border 기능 제거 (실제 글 게시시에 기능 발현하지 않아 제거하였습니다.) 
- Table 태그 기반 다중 이미지 배치 기능 구현
- UI 단순화 및 핵심 기능 중심 재구성

v0.1.1
- 이미지 Border ON / OFF 기능 추가
- px 단위 테두리 두께 직접 입력 지원
- 버튼 active 상태 UI 개선

v0.1.0
- 이미지 정렬(left / center / right) 기능
- 이미지 크기 조절 UI 제공
- left / right 정렬 시 자동 <br clear="all"> 처리
