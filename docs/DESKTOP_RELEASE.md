# Desktop App Release Setup

## Status

### Done
- [x] Tauri updater plugin integrated (`tauri-plugin-updater` + `tauri-plugin-process`)
- [x] Update checker UI component (`src/components/UpdateChecker.tsx`) — shows toast when update available
- [x] Signing keypair generated (`~/.tauri/timebox.key` + `.key.pub`)
- [x] Public key configured in `tauri.conf.json`
- [x] Private key + password saved in local `.env`
- [x] GitHub Actions release workflow (`.github/workflows/release.yml`) — builds macOS (ARM + Intel), Linux, Windows
- [x] Updater endpoint configured to `wangshei/Timebox` GitHub Releases

### TODO (manual steps)

#### 1. Add GitHub Secrets
Go to https://github.com/wangshei/Timebox/settings/secrets/actions and add:

| Secret | Value |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/timebox.key` (run `cat ~/.tauri/timebox.key \| pbcopy`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Your signing key password |

#### 2. Apple Developer Program (for macOS notarization)
Without this, macOS users get "unidentified developer" warnings. To fix:

1. **Enroll** at https://developer.apple.com/programs/ ($99/year)
2. **Create a Developer ID Application certificate** in Xcode → Settings → Accounts → Manage Certificates
3. **Export the certificate** as a `.p12` file with a password
4. **Base64 encode it**: `base64 -i certificate.p12 | pbcopy`
5. **Add these GitHub secrets**:

| Secret | Value |
|--------|-------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password you set when exporting |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password (generate at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords) |
| `APPLE_TEAM_ID` | Your 10-character Team ID (find at https://developer.apple.com/account → Membership Details) |

6. **Update the workflow** — add these env vars to the `tauri-apps/tauri-action` step in `.github/workflows/release.yml`:
```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

#### 3. Windows Code Signing (optional)
Reduces SmartScreen warnings. Requires an EV or OV code signing certificate (~$200-400/year from providers like DigiCert, Sectigo). Skip for now — Windows users just click "Run anyway."

---

## How to Release

### First release
```bash
# Make sure version in tauri.conf.json and Cargo.toml match
# Currently both are 0.1.0

git tag v0.1.0
git push origin v0.1.0
```

### Subsequent releases
```bash
# 1. Bump version in both files:
#    - src-tauri/tauri.conf.json → "version"
#    - src-tauri/Cargo.toml → version under [package]

# 2. Commit and tag
git add -A
git commit -m "release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

### What happens after pushing a tag
1. GitHub Actions builds the app for all platforms
2. A **draft release** is created with all binaries attached
3. Go to https://github.com/wangshei/Timebox/releases
4. Review the draft, edit release notes if needed, then **Publish**
5. Existing desktop users see an update toast on next app launch

---

## Key Files
| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | App version, updater endpoint, public signing key |
| `src-tauri/Cargo.toml` | Rust dependencies including updater + process plugins |
| `src-tauri/src/lib.rs` | Plugin registration |
| `src-tauri/capabilities/default.json` | Permissions for updater + process restart |
| `src/components/UpdateChecker.tsx` | Frontend update notification UI |
| `.github/workflows/release.yml` | CI/CD build + release pipeline |
| `~/.tauri/timebox.key` | Private signing key (LOCAL ONLY — never commit) |
| `~/.tauri/timebox.key.pub` | Public signing key (embedded in tauri.conf.json) |
