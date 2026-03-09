# Timebox

Plan your day with timeboxing. Available as a web app, desktop app (macOS), and iOS app.

**Live:** [timeboxing.club](https://timeboxing.club)

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build
```

---

## Desktop App (Tauri / macOS)

The desktop app adds screen activity tracking — it auto-records which app you're working in and shows it on your calendar.

### Development

```bash
# Install Rust if you haven't
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Run the desktop app in dev mode (hot-reloads frontend + Rust)
npx tauri dev
```

### Production Build

```bash
npx tauri build      # Outputs .dmg (macOS), .msi (Windows), .deb/.AppImage (Linux)
```

The built app is at `src-tauri/target/release/bundle/`.

### "App is damaged and can't be opened"

macOS Gatekeeper blocks unsigned apps. Fix it by running:

```bash
xattr -cr "/Applications/The Timeboxing Club.app"
```

If the app is elsewhere (e.g. Downloads), adjust the path accordingly.

### Release (CI)

Releases are automated via GitHub Actions. To publish a new version:

1. Bump version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
2. Commit and tag:
   ```bash
   git tag v0.x.x
   git push origin main --tags
   ```
3. GitHub Actions builds for macOS (ARM), Linux, and Windows, then creates a draft release
4. Review and publish at [Releases](../../releases)

See [docs/DESKTOP_RELEASE.md](docs/DESKTOP_RELEASE.md) for signing keys and Apple notarization setup.

---

## iOS App (Capacitor)

The iOS app wraps the web app in a native shell for App Store distribution.

### Development

```bash
# Build web assets and sync to iOS project
npm run cap:build

# Open in Xcode
npm run cap:open
```

In Xcode:
1. Select your signing team (Signing & Capabilities)
2. Select a device or simulator
3. Hit Run (Cmd+R)

### Live Reload (optional)

For faster iteration, edit `capacitor.config.ts` and uncomment the server URL:

```ts
server: {
  url: 'http://YOUR_LOCAL_IP:5173',
  cleartext: true,
}
```

Then run `npm run dev` and rebuild in Xcode. Changes appear instantly on device.

### App Store Submission

1. In Xcode: Product > Archive
2. Distribute App > App Store Connect
3. Complete the listing in [App Store Connect](https://appstoreconnect.apple.com)

### Capacitor Commands

| Command | Description |
|---------|-------------|
| `npm run cap:build` | Build web + sync to native |
| `npm run cap:sync` | Sync web assets only (skip rebuild) |
| `npm run cap:open` | Open iOS project in Xcode |

---

## Web App (PWA)

The web app at [timeboxing.club](https://timeboxing.club) can be installed on any phone:

**iPhone / iPad (Safari)**
1. Tap the Share button
2. Tap "Add to Home Screen"
3. Tap "Add"

**Android (Chrome)**
1. Tap the menu (top right)
2. Tap "Add to Home screen"
3. Tap "Install"

---

## Tech Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Zustand
- **Backend:** Supabase (auth, database, realtime sync)
- **Desktop:** Tauri v2 (Rust) — screen activity tracking via `active-win-pos-rs`
- **Mobile:** Capacitor (iOS native shell)
- **Hosting:** Vercel

---

## Docs

All project docs live in `docs/`:

- [ONBOARDING.md](docs/ONBOARDING.md) — Read order, repo layout, run steps
- [ENGINEERING_LEAD.md](docs/ENGINEERING_LEAD.md) — Checkpoints, flowcharts, function inventory
- [TASK_LIST.md](docs/TASK_LIST.md) — Unfinished work checklist
- [SYSTEM_INTEGRATION.md](docs/SYSTEM_INTEGRATION.md) — State, persistence, API
- [UIUX_STANDARDS.md](docs/UIUX_STANDARDS.md) — Calendar interaction and UI/UX principles
- [PROJECT_STANDARDS.md](docs/PROJECT_STANDARDS.md) — Code style, testing, commits
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel setup
- [DESKTOP_RELEASE.md](docs/DESKTOP_RELEASE.md) — Tauri signing & release workflow
