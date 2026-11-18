# 개발 안내

## 구조

- `com.ulanzi.orcanavigation.ulanziPlugin/`: Studio 런타임, 4개 언어 카탈로그, 아이콘, 테스트
- `navigation.cjs`: OS별 탐색·단축키 전달, Orca CLI 경로
- `wheel.cjs`: macOS 스크롤 헬퍼의 수명·연속 입력 관리
- `native/`: Apple Silicon 실행 파일과 Swift 원본, Windows PowerShell 휠 스크립트
- `presets/`: 기기 UUID를 영(0) UUID로 정리한 macOS D200X 배치와 상대 이미지
- `tools/`: 런타임 ZIP·프리셋·묶음 빌드, 아이콘 렌더링
- `marketplace/`: 제출용 배너·표지·4개 언어 소개

## 빌드

README의 `npm ci` 후 빌드합니다. `ws`만 런타임 의존성으로 포함하며 node_modules와 생성된 dist는 Git에서 제외합니다. 배포 ZIP에는 THIRD_PARTY_NOTICES.txt와 ws/LICENSE가 들어갑니다.

프로젝트의 MIT LICENSE는 플러그인 ZIP과 배포 묶음에 포함됩니다. Orca 아이콘·외부 의존성의 라이선스 고지는 그대로 유지합니다.

Swift 헬퍼 수정 시 Apple Silicon Mac에서 다시 빌드합니다.

```sh
xcrun swiftc -O com.ulanzi.orcanavigation.ulanziPlugin/native/mac-navigation.swift -o com.ulanzi.orcanavigation.ulanziPlugin/native/mac-navigation
```

기존 arm64 실행 파일도 소스에 포함합니다. Windows는 `native/windows-navigation.cs`를 .NET Framework 4 컴파일러로 빌드한 `windows-navigation.exe`를 사용합니다. 플러그인이 `serve` 모드로 상주시키고, 한 줄 명령(`범위 방향`)에 JSON 한 줄로 답합니다(호출당 약 60ms). 키 입력은 SendInput, 휠은 UI Automation으로 읽은 키보드 포커스 위치로 보내는 WM_MOUSEWHEEL입니다. 분할 창 이동·닫기는 이 헬퍼에만 있고 macOS에는 없습니다. 수정 후 PowerShell에서 다시 빌드합니다.

```powershell
$f = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
& "$f\csc.exe" -nologo -target:exe -optimize -r:"$f\WPF\UIAutomationClient.dll" -r:"$f\WPF\UIAutomationTypes.dll" -r:"$f\WPF\WindowsBase.dll" -out:windows-navigation.exe windows-navigation.cs
```

Orca CLI 경로는 헬퍼가 없을 때의 대체 경로로만 남아 있습니다. 서명·공증·자동 권한 변경은 제공하지 않습니다.

아이콘 도형을 다시 그릴 때만 Pillow를 설치하고 `python3 tools/render-icons.py`를 실행합니다. 체크인된 Orca 앱 아이콘은 유지하며 미리보기는 dist/icons-preview.png에 저장합니다.

프리셋은 ZIP 앞에 13바이트 `#Version: 2\n\n`이 필요합니다. `build-preset.py`가 헤더·14개 플러그인 동작·상대 이미지·버전·기기 UUID·ZIP 무결성을 검사합니다. 헤더 없는 일반 ZIP은 Studio에서 사용자 플러그인 버튼이 누락될 수 있습니다. manifest의 Profiles 자동 설치는 사용하지 않습니다.

## 버튼 배치 규칙

- 공용 배치의 원본은 `presets/` 하나뿐입니다. 바꿀 때는 `tools/build-preset.py`와 `presets/README.md`의 표를 함께 고치고 도구로 재생성합니다.
- 본인 Ulanzi Studio 프로필(Windows `%APPDATA%\Ulanzi\UlanziDeck\ProfilesV2`, macOS `Application Support`)에서 버튼을 옮긴 것은 개인 설정입니다. 저장소에 반영되지 않으며 커밋하지 않습니다. 개인 프로필 파일을 `presets/`에 복사하지 마세요.
- 공용 프리셋의 배치를 바꾸는 PR은 이유와 사용 환경(OS·기기)을 적고 유지보수자 검토를 받습니다.
- 새 액션을 추가하면 manifest·4개 언어 카탈로그·아이콘을 함께 갱신합니다. 한 OS에서만 지원하는 액션은 `build-preset.py`의 `OPTIONAL`에 넣어 macOS 공용 프리셋 검증과 분리합니다.

## 검증 범위

자동 테스트는 키·노브 이벤트, 연결 해제·취소, 오류 처리, 번역 연결, Windows 호출 인자를 검사합니다. 기기 입력을 재현하는 실기 시험은 아닙니다. macOS D200X에서 이동 버튼·탐색 노브와 휠 사용 피드백을 확인했습니다. Studio 3.4.8 재가져오기·재시작 후 버튼 11개·노브 3개 보존을 확인했습니다.

빈 설치 폴더에 ZIP을 풀어 Studio의 0.0.1 인식을 확인했습니다. Studio GUI의 ZIP 설치 흐름, 기존 개발판 덮어쓰기, Windows 실기, 전체 물리 입력·정량 지연은 별도 확인 대상입니다.

2026-11-13에는 실행 중인 플러그인 프로세스의 시작 시각보다 설치 파일의 교체 시각이 늦은 상태에서, Orca 열기 외 동작에 경고가 나타났습니다. Studio 완전 종료·재실행 후 사용자가 정상 동작을 확인했습니다. 설치 파일 비교만으로 실행 중 코드의 최신 여부를 판단하지 말고, 파일 교체 후 Studio를 재시작하세요.

## 공개 저장소 관리

- `main`: 공개 배포 기준. `dev`: 다음 변경을 준비하는 개발 브랜치.
- 사용자 안내를 바꾸면 `README.md`(영어), `README.ko-KR.md`, `README.zh-CN.md`, `README.ja-JP.md`를 함께 갱신합니다.
- 배너 원본은 `marketplace/banner.png`, 플러그인에 포함되는 배너는 `com.ulanzi.orcanavigation.ulanziPlugin/assets/marketplace/banner.png`입니다. 변경할 때 두 파일을 함께 갱신합니다.
- 배포 버전은 manifest·package.json·package-lock.json·프리셋·4개 언어 README에 일치시킵니다. 마켓 소개는 `marketplace/listing.json`과 런타임 언어 카탈로그를 함께 갱신합니다.
- 테스트와 두 빌드 명령을 통과한 뒤 배포합니다. `dist/` 결과물은 Git 소스에 넣지 않고 필요하면 GitHub Release에 첨부합니다.

## 원문

- [Ulanzi SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK)
- [manifest 명세](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/manifest.md)
- [Orca 공식 저장소](https://github.com/stablyai/orca)
- [Orca 변경 이력](https://orca.dev/changelog)

Orca와 Studio 업데이트 후 단축키와 SDK 호환성을 다시 확인하세요.
