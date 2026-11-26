# Orbweave

A private, offline map for anything you want to understand and connect: people, ideas, projects, courses, tools, terms, tasks. Students, workers, researchers, writers: if it has parts and the parts relate, Orbweave can map it.

- **Starts empty.** No built-in categories. You create the kinds of things you need.
- **Connect in plain words.** Define your own connection types ("teaches / is taught by", "depends on / is needed by", "works with") and read them as sentences. No arrows or symbols to type.
- **Automatic links.** Write another entry's name in a description and the two connect on their own.
- **Views you design.** Save which categories, connection types and entries to show, and switch between views in one click.
- **Follow what moves.** Mark a connection type as carrying something (work, information, money) to see moving dots and follow it forward or back along the chain.
- **One-time tutorial.** A short guided tour on a practice map the first time the app opens. Replay it any time from Settings, in a new file or one full of entries. It never touches your data.
- **Local only.** One file on your computer. No account, no cloud, no AI, no telemetry. The app blocks all network requests.
- **Optional password.** Encrypts the whole file (scrypt + AES-256-GCM). There is no reset.

## Download or build

Windows: a single portable `.exe` (no installer). macOS: a `.dmg`. Build instructions are in [`BUILD GUIDE.txt`](BUILD%20GUIDE.txt).

Quick start for developers:

```
npm install
npm start          # run it
npm test           # save-file format and file-handling tests
npm run dist:win   # Windows portable exe (run on Windows)
npm run dist:mac   # macOS dmg (run on a Mac)
```

The builds are **unsigned**. Windows SmartScreen and macOS Gatekeeper warn on first launch; the build guide explains how to proceed.

## Your data

Everything, including pictures, lives in one `.orbweave` file. It saves automatically, keeps dated backups in a `<name>.backups` folder beside it (at most one per 10 minutes, newest 40), reloads if the file changes on disk, and refuses to overwrite a newer copy without asking. Keep the file in a synced folder (OneDrive, iCloud Drive, Dropbox) to use it on several computers, one at a time.

The format is Orbweave's own binary container (signature, version, flags, deflate-compressed typed values, CRC-32). It is documented at the top of [`src/orbfile.js`](src/orbfile.js).

## Layout

```
src/        Electron main process, save-file format (orbfile.js), file session (session.js)
renderer/   the interface (plain HTML, CSS and JavaScript; no framework, no build step)
build/      app icons
test/       unit tests for the file format and the file session
```

Security posture: sandboxed renderer, context isolation, no Node access in the page, a Content-Security-Policy that forbids all network connections, a main-process filter that cancels any non-local request, denied permission requests, and navigation blocked (links open in the default browser).

## Status

Automated tests (unit tests plus a scripted run of the real Electron app) run on Linux. The Windows and macOS packages are produced by the same configuration, but their file dialogs, menus and first-run security prompts have not been tested as thoroughly. Issues are welcome.

## License

MIT. See [`LICENSE`](LICENSE). Orbweave bundles Electron, which is also MIT licensed.
