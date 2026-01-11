# cland

Local planner app built with Tauri + React. It turns tasks into calendar blocks, shows a 7-day or 3-day view, and includes a memo + knowledge base with AI support.

## Requirements
- Node.js 18+
- Rust toolchain (stable)
- MSVC build tools (Windows)

## Setup
1. Install dependencies:
   ```
   npm install
   ```

2. Configure API (optional for AI features):
   ```
   copy .env.example .env
   ```
   Edit `.env` and set `VITE_API_KEY`, `VITE_API_BASE_URL`, and `VITE_API_MODEL` as needed.

3. Start dev UI:
   ```
   npm run dev
   ```

4. Or run the desktop app:
   ```
   npm run tauri dev
   ```

## Build
```
npm run build
npm run tauri build -- --bundles none
```

The Windows exe will be at:
`src-tauri/target/release/Cland Planner.exe`

## Release
1. Build the exe.
2. Create a GitHub release and upload `Cland Planner.exe` as a release asset.

## Notes
- API settings are stored locally in the app.
- If no API key is set, AI parsing/classification will be disabled.
