# Changelog

All notable changes to **FCC Studio** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Multi-chat panel** — run several Claude conversations side by side, each with
  its own subprocess, Plan/Act mode, Stop, and input.
- **Activity panel** — agent telemetry per finished turn: timeline, file
  influence heatmap, ordered tool flow, with read-only snapshot preview and
  one-click restore.
- **Syntax highlighting for every Monaco language** — the editor picks up any
  grammar Monaco ships by extension (no per-language bookkeeping).
- **Explorer context menu** — right-click rename / copy / cut / paste /
  duplicate / delete, plus inline new file/folder.
- **Raw HTML in markdown** — rendered with DOMPurify sanitization (untrusted
  agent output is never injected verbatim).

### Changed
- Upgraded the toolchain: Electron 43, Vite 8, TypeScript 7, vitest 4,
  Monaco 0.56, xterm 6, electron-builder 26.

## [0.1.0] - 2026-08-06

### Added
- Initial release: file explorer + Monaco editor, Claude chat through the FCC
  proxy, integrated xterm terminal, FCC server health, source control,
  subagent live view, warm-dark design system.
