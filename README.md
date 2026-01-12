# cland

Local task planner that turns tasks into a calendar you can actually follow.

## Architecture
- UI: React + Vite
- Planner: deterministic scheduler (TypeScript)
- AI: OpenAI/Anthropic compatible endpoints (task parsing + plan explanation)
- Storage: localStorage (browser/webview)
- Packaging: Tauri (Windows exe)

## Highlights
- Task form + natural language input
- Deterministic scheduling with conflict warnings
- 7-day / 3-day calendar view, drag-to-move blocks
- In-progress indicator based on current time
- Memo + knowledge base + AI Q&A
- Custom planning notes to guide task parsing

## Download
- Release exe: https://github.com/1sh1ro/cland/releases/tag/v0.1.0

## Build from source
Requirements:
- Node.js 18+
- Rust toolchain (stable)
- MSVC build tools (Windows)

Steps:
```bash
git clone https://github.com/1sh1ro/cland.git
cd cland
npm install
copy .env.example .env
```
Edit `.env` if you want AI features, then build:
```bash
npm run build
npm run tauri build -- --bundles none
```
Output exe:
```
src-tauri/target/release/Cland Planner.exe
```

## Run (dev)
```bash
npm run dev
# or
npm run tauri dev
```
