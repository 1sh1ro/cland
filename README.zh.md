# cland

本地任务规划器，把任务变成可执行日程。

## 架构
- UI：React + Vite
- 排程：确定性调度（TypeScript）
- AI：OpenAI/Anthropic 兼容接口（任务解析 + 计划解释）
- 存储：localStorage（浏览器/内嵌 WebView）
- 打包：Tauri（Windows exe）

## 亮点
- 任务表单 + 自然语言输入
- 确定性排程 + 冲突提示
- 7 天 / 3 天视图，拖拽调整日程块
- 当前时间进行中标记
- 备忘录 + 知识库 + AI 问答
- 可自定义解析提示词

## 下载
- Release exe: https://github.com/1sh1ro/cland/releases/tag/v0.1.0

## 源码构建
环境：
- Node.js 18+
- Rust 工具链（stable）
- Windows 的 MSVC Build Tools

步骤：
```bash
git clone https://github.com/1sh1ro/cland.git
cd cland
npm install
copy .env.example .env
```
如需 AI 功能，请在 `.env` 中配置 API Key，再构建：
```bash
npm run build
npm run tauri build -- --bundles none
```
生成的 exe：
```
src-tauri/target/release/Cland Planner.exe
```

## 运行（开发）
```bash
npm run dev
# 或
npm run tauri dev
```
