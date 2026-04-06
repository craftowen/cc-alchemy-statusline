# cc-alchemy-statusline

[![npm downloads](https://img.shields.io/npm/dm/cc-alchemy-statusline.svg?style=flat-square)](https://www.npmjs.com/package/cc-alchemy-statusline)
[![npm version](https://img.shields.io/npm/v/cc-alchemy-statusline.svg?style=flat-square)](https://www.npmjs.com/package/cc-alchemy-statusline)

Claude Code statusline — 구독 사용량, Git 브랜치, 컨텍스트 윈도우, 마지막 프롬프트를 표시합니다.

![preview](./preview.svg)

### npm 다운로드 수

[![NPM Downloads Chart](https://npm-stat.com/charts.svg?package=cc-alchemy-statusline&from=2025-03-01)](https://npm-stat.com/charts.html?package=cc-alchemy-statusline)

```
Sonnet 4.5 | main | 24k/200k | 5h 2% (3h51m) | 7d 9% (3d9h)
▸ 마지막으로 입력한 프롬프트가 여기에 표시됩니다
```

- **모델명** — 현재 사용 중인 Claude 모델
- **Git 브랜치** — 현재 브랜치 (dirty면 `*` 표시, 클릭하면 GitHub 이동)
- **컨텍스트** — 사용량/전체 (예: `24k/200k`)
- **5h / 7d** — 구독 사용률 및 리셋까지 남은 시간
- **마지막 프롬프트** — 현재 세션에서 마지막으로 입력한 메시지 (최대 2줄)

## 설치

아무 PC에서나 아래 명령어 한 줄이면 자동 설정됩니다.

```bash
npx -y cc-alchemy-statusline
```

Claude Code를 재시작하면 바로 적용됩니다.

## 요구사항

- Node.js 18+
- Claude Code CLI (로그인 상태)

## 지원 플랫폼

- macOS
- Linux
- Windows
