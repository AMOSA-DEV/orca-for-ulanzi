# Contributing

[English](#english) · [한국어](#한국어) · [简体中文](#简体中文) · [日本語](#日本語)

## English

Contributions to this independent community plugin are welcome: bug fixes, translations, documentation, and real-device testing, especially Windows D200X testing. Issues and PRs may use any of the four languages above. Keep communication respectful and focused on the work.

1. Search existing [issues](https://github.com/AMOSA-DEV/orca-for-ulanzi/issues) and PRs first. Discuss large changes in an issue before implementation; small fixes can go straight to a PR.
2. Fork the repository and create a descriptive branch from `dev`. Open PRs against `dev`; maintainers promote releases to `main`.
3. Follow the setup and checks below. Include reproduction steps, the reason for the change, checks run, and remaining limitations. Clearly separate automated checks from real hardware tests.
4. Update all four README files for user-facing documentation changes. For UI translations update all four language catalogs. Preserve third-party license notices. Do not include `node_modules/`, `dist/`, local paths, or personal device identifiers.
5. Keep changes focused. Version bumps, tags, marketplace submissions and releases are handled by maintainers. Contributions are provided under the project's [MIT License](LICENSE); submit only material you have the right to contribute.

## 한국어

버그 수정·번역·문서·실기 테스트 기여를 환영합니다. 특히 Windows D200X 검증이 필요합니다. 이슈와 PR은 위 4개 언어로 작성할 수 있습니다. 서로 존중하며 작업에 집중해 주세요.

1. 기존 이슈·PR을 먼저 확인하세요. 큰 변경은 이슈로 먼저 논의하고, 작은 수정은 바로 PR을 보내도 됩니다.
2. 포크한 뒤 `dev`에서 설명이 분명한 작업 브랜치를 만들고 PR 대상도 `dev`로 설정하세요. 관리자가 `main`에 배포 변경을 반영합니다.
3. 아래 설치·검증을 실행하고 재현 방법, 변경 이유, 검증 결과와 남은 한계를 적어 주세요. 자동 테스트와 실기 확인을 구분하세요.
4. 사용자 안내 변경은 README 4종에, UI 번역 변경은 언어 카탈로그 4종에 반영하세요. 외부 라이선스 고지를 보존하고 `node_modules/`, `dist/`, 로컬 경로와 개인 기기 식별자는 커밋하지 마세요.
5. 버전·태그·마켓 제출·릴리즈는 관리자가 처리합니다. 기여는 프로젝트의 MIT 라이선스로 제공되며, 기여 권한이 있는 자료만 제출하세요.

## 简体中文

欢迎修复问题、翻译、完善文档和实机测试，尤其是 Windows D200X 测试。Issue 和 PR 可使用上述四种语言。请保持尊重并围绕工作交流。

1. 先搜索现有 Issue 和 PR。较大改动请先讨论，小修复可直接提交 PR。
2. Fork 后从 `dev` 创建名称清晰的分支，PR 目标也设为 `dev`。维护者将发布改动合入 `main`。
3. 执行下方安装和检查命令，说明复现步骤、修改原因、验证结果及限制。区分自动测试和实机测试。
4. 用户文档改动同步四份 README，界面翻译同步四种语言目录。保留第三方许可声明；不要提交 `node_modules/`、`dist/`、本地路径或个人设备标识。
5. 版本、标签、市场提交和发布由维护者处理。贡献采用项目的 MIT 许可证；只提交有权贡献的内容。

## 日本語

不具合修正、翻訳、文書、実機テストを歓迎します。特に Windows D200X の検証が必要です。Issue・PR は上記4言語で投稿できます。互いを尊重し、作業に沿って議論してください。

1. 既存の Issue・PR を検索してください。大きな変更は先に相談し、小さな修正は直接 PR を送れます。
2. Fork し、`dev` から内容の分かるブランチを作成します。PR の対象も `dev` にしてください。管理者がリリース変更を `main` に反映します。
3. 下記のセットアップ・検証を実行し、再現手順、変更理由、確認結果と制限を記載してください。自動テストと実機確認を区別してください。
4. 利用案内の変更は README 4種、UI 翻訳は言語カタログ4種に反映してください。第三者のライセンス表記を維持し、`node_modules/`、`dist/`、ローカルパス、個人の機器識別子を含めないでください。
5. バージョン、タグ、マーケット申請、リリースは管理者が行います。貢献にはプロジェクトの MIT ライセンスが適用されます。貢献する権利のある資料だけを提出してください。

## Setup and checks / 설치·검증 / 安装与检查 / セットアップ・検証

Node.js >= 20.12.2 and Python 3:

```sh
npm ci --prefix com.ulanzi.orcanavigation.ulanziPlugin
npm test --prefix com.ulanzi.orcanavigation.ulanziPlugin
python3 tools/build-plugin.py
python3 tools/build-preset.py
```

See [development notes](docs/development.md) (Korean) for structure, native-helper compilation and packaging requirements. Native helper changes require the matching platform toolchain and real-device checks; passing CI does not prove hardware compatibility. Windows hardware testing is still pending, and Intel Mac wheel input and Linux are unsupported.
