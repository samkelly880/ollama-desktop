# Ollama Desktop

A small, dark-themed **desktop app for Linux** that gives [Ollama](https://ollama.com) a proper window:
see your models, chat with them, tweak their settings and install or remove models — without the terminal.

Ollama's own desktop app doesn't support Linux, so this fills that gap. It is **not a fork of Ollama**
and it doesn't bundle it: it simply talks to the Ollama server that's already running on your computer
(`http://127.0.0.1:11434`) through its normal HTTP API.

> Unofficial personal / learning project. Not affiliated with or endorsed by the Ollama project.

## Features

- **Model list** — every installed model with its size, parameter count and when it was last changed.
  Models currently loaded into memory get a "loaded" badge. If Ollama isn't running you get a clear
  message, the commands to start it, and a **Retry** button (it also reconnects by itself).
- **Chat with streaming replies** — words appear as the model produces them. Pick the model from a
  drop-down (or the sidebar), **Stop** a reply half-way, or **Clear chat** to start over.
- **Per-model settings that are remembered** — temperature, top P, context length and a system prompt,
  saved separately for each model and restored next time you open the app. They're sent with each chat
  request as Ollama `options`. Stored in `~/.config/ollama-desktop/settings.json`.
- **Install models by name** (e.g. `llama3.2`, `qwen2.5:7b`) — asks for confirmation first, then shows a
  live progress bar with downloaded / total size. Cancel any time; Ollama resumes where it left off.
- **Uninstall models** — with a confirmation dialog that tells you how much disk space you'll get back.

Privacy & safety: the app only ever connects to Ollama on this machine (`127.0.0.1`). It has no accounts,
no telemetry and no API keys, and it never changes how Ollama itself is exposed to your network.

## Requirements

- **Linux** (developed for Ubuntu; other distros should work).
- **Ollama installed and running.** Install it from <https://ollama.com/download/linux>:
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```
  The installer sets Ollama up as a service. If it isn't running, start it with
  `sudo systemctl start ollama` (or run `ollama serve` in a terminal).
- **Node.js 20.19 or newer** (Node 22 LTS recommended) and npm — only needed to run from source or build.
  Check with `node -v`.

## Run it from source

```bash
git clone https://github.com/samkelly880/ollama-desktop.git
cd ollama-desktop
npm install
npm run dev
```

`npm run dev` opens the app with hot reload: edits to the UI (`src/renderer`) show up immediately;
changes to `src/main` or `src/preload` need a restart (Ctrl+C, then `npm run dev` again).

### Ubuntu 23.10 / 24.04+: "SUID sandbox helper binary" error

Newer Ubuntu versions restrict the kernel feature Electron's sandbox uses, so running Electron straight
from `node_modules` can fail with _"The SUID sandbox helper binary was found, but is not configured
correctly"_. Fix it once per `npm install` with:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

or, for development only, start without Chromium's sandbox: `npm run dev:no-sandbox`.
The installed `.deb` doesn't need either: it sets up an AppArmor profile for you.

## Build an AppImage and a .deb

```bash
npm run build
```

This type-checks, builds the app, and packages it with electron-builder into `release/`:

- `release/ollama-desktop-<version>-x86_64.AppImage` — a single file you can run anywhere:
  ```bash
  chmod +x release/ollama-desktop-*.AppImage
  ./release/ollama-desktop-*.AppImage
  ```
  On Ubuntu 22.04+ AppImages need FUSE 2: `sudo apt install libfuse2` (on 24.04: `libfuse2t64`).
  If it exits with a sandbox error on Ubuntu 24.04, start it with `--no-sandbox` or use the `.deb` instead.
- `release/ollama-desktop_<version>_amd64.deb` — installs into your app menu as "Ollama Desktop":
  ```bash
  sudo apt install ./release/ollama-desktop_*_amd64.deb
  ```
  Remove it again with `sudo apt remove ollama-desktop`.

`npm run build:dir` makes just an unpacked folder (`release/linux-unpacked/`), which is quicker for testing.

## Other commands

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Start the app in development mode                                |
| `npm start`         | Build and run the production version (without packaging)         |
| `npm test`          | Run the unit tests (Vitest)                                      |
| `npm run typecheck` | TypeScript type-check                                            |
| `npm run lint`      | ESLint                                                           |
| `npm run format`    | Format everything with Prettier                                  |
| `npm run check`     | Type-check + lint + format check + tests (run before committing) |

## How it works

```
src/
  main/        Electron main process: window, IPC handlers, settings file
  preload/     Exposes a small, typed `window.api` to the UI (context isolation, sandboxed)
  renderer/    React UI
  shared/      Code used by both sides: Ollama API client, settings rules, formatting
tests/         Vitest tests (the Ollama API is mocked; no real server needed)
```

All Ollama requests are made by the main process (`src/shared/ollama.ts`), which refuses any address
that isn't this machine. The UI asks for things over IPC; streaming responses (chat tokens, download
progress) are forwarded line by line as Ollama sends them. Endpoints used: `/api/version`, `/api/tags`,
`/api/ps`, `/api/chat` (streaming), `/api/pull` (streaming) and `/api/delete`.

Built with Electron, TypeScript, Vite (via electron-vite), React, electron-builder and Vitest.

## Roadmap / ideas for later

- Render Markdown and code blocks in replies (with a copy button)
- Save chat history and keep several conversations in a sidebar
- Show tokens-per-second and other stats after each reply
- Search / browse the Ollama library from inside the app
- Show model details (`/api/show`): licence, template, parameters, capabilities
- "Unload from memory" button for loaded models (`keep_alive: 0`)
- Light theme and a theme toggle
- Optional custom Ollama port (still localhost-only)
- Keyboard shortcuts (new chat, focus input, switch model)
- Export a conversation as Markdown
- ARM64 builds and a Flatpak

## License

[MIT](LICENSE)
