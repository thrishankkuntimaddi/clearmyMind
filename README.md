# 🧠 ClearMyMind

> A minimal, private, keyboard-first mental offload tool.  
> Dump the names cluttering your mind. Sort them. Clear them. Move on.

**Live →** [thrishankkuntimaddi.github.io/clearmyMind](https://thrishankkuntimaddi.github.io/clearmyMind)

---

## What it does

Sometimes a name — a person, a thought, a word — keeps repeating in your head. ClearMyMind gives you a place to put it. Type it in, press Enter, and it's out of your head and into the list. That's it.

---

## Features

### 🔐 Two-Layer Security
- **Firebase Auth** — cloud identity (email + password), email verification required
- **App Lock** — device-level PIN/password with auto-lock on tab switch
- **Biometrics** — Touch ID / Windows Hello support via WebAuthn
- Passwords are hashed with SHA-256 via the Web Crypto API — never stored in plain text
- 3 wrong attempts wipe all local data and reset the app

### ☁️ Real-Time Cloud Sync (Firestore)
- Data lives in **Firestore** under `users/{uid}/data/clearmind`
- Real-time listener — changes sync instantly across all logged-in devices
- Works offline (Firestore offline persistence)

### ⌨️ Keyboard-First Input
- **Just start typing** — any key press auto-focuses the input
- Press **Enter** to add a name
- Names are auto-formatted in **Title Case**
- Duplicates are silently ignored (case-insensitive)

### 📋 Always-Visible Grid
- All 100 cells visible — no scrolling ever
- Column-major order, always sorted A → Z
- 5 columns × 20 rows = 100 slots

### ✏️ Inline Editing & Organization
- Hover a name → **✎ Edit** / **× Delete**
- **Tags** — colour-code any name
- **Groups** — organize names into named buckets
- **Sheets** — multiple independent lists
- **Bag** — park names without deleting them

### 📤 Copy / Load / Snapshot
- **Copy** — all names to clipboard (one per line)
- **Load** — paste a name list or a full snapshot
- **Snapshot** — exports names + tags + groups + bag as a versioned block

### 💣 Auto-Wipe Timer
- When 10+ names are active, a countdown starts
- On expiry → blast animation → congrats screen → list clears
- **NoClear** toggle disables the timer

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 (Vite) |
| Styling | CSS Modules (vanilla CSS) |
| Auth | Firebase Auth + WebAuthn biometrics |
| Persistence | Firestore (real-time, cross-device) |
| CI/CD | GitHub Actions → GitHub Pages |

**Zero heavy dependencies.** No Redux, no router, no UI library.

---

## Repository Structure

```
clearmyMind/
├── client/                     ← React/Vite frontend
│   ├── src/
│   │   ├── components/         ← UI components (JSX + CSS Modules)
│   │   ├── hooks/              ← Custom React hooks (auth, Firestore, etc.)
│   │   ├── lib/                ← Firebase init (firebase.js, auth.js, db.js)
│   │   ├── utils/              ← Crypto helpers, snapshot serialization
│   │   ├── App.jsx             ← Root component + auth gate
│   │   ├── App.module.css
│   │   ├── index.css           ← Global tokens + resets
│   │   └── main.jsx            ← React entry + SW registration
│   ├── public/                 ← Static assets, PWA manifest, service worker
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example            ← Copy to .env and fill in Firebase credentials
├── server/                     ← Placeholder for future backend (Firebase Admin, API)
│   └── README.md
├── .github/
│   └── workflows/
│       └── deploy.yml          ← CI: build client/ → deploy to gh-pages
├── firestore.rules             ← Firestore security rules
├── .gitignore
├── package.json                ← Root convenience scripts (proxies to client/)
└── README.md
```

---

## Running Locally

```bash
git clone git@github.com:thrishankkuntimaddi/clearmyMind.git
cd clearmyMind

# Copy and fill in Firebase credentials
cp client/.env.example client/.env
# Edit client/.env with your VITE_FIREBASE_* values

# Install and run (from repo root — proxies into client/)
npm install --prefix client
npm run dev
```

Open [http://localhost:5173/clearmyMind/](http://localhost:5173/clearmyMind/)

---

## Environment Variables

Create `client/.env` (never commit this):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

For production (GitHub Actions), add these as **repository secrets** in  
`GitHub → Settings → Secrets and variables → Actions`.

---

## Deploying

Deployment is fully automated via GitHub Actions:

1. Push to `main`
2. The workflow installs deps, builds `client/`, and pushes `client/dist/` to the `gh-pages` branch
3. The live site updates at [thrishankkuntimaddi.github.io/clearmyMind](https://thrishankkuntimaddi.github.io/clearmyMind) within ~1 minute

---

## Security Model

- **Cloud layer** — Firebase Auth (email + password, email verification)
- **Device layer** — Local PIN with SHA-256 hashing via Web Crypto API
- **Data layer** — Firestore rules enforce per-user access (`request.auth.uid == userId`)
- **3 failed attempts** — wipes all local state and resets the device lock

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Any printable key | Auto-focuses the smart search/add bar |
| `Enter` (in bar) | Add name (if not a duplicate) |
| `Enter` (in cell) | Save edited name |
| `Escape` (in cell) | Cancel edit |
| `Escape` (in bar) | Clear search query |
| `⌘Z` / `Ctrl+Z` | Undo last add |

---

## License

MIT — do whatever you want with it.
