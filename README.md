# 🧠 ClearMyMind

> A minimal, private, keyboard-first mental offload tool.  
> Dump the names cluttering your mind. Sort them. Clear them. Move on.

**Live →** [thrishankkuntimaddi.github.io/clearmyMind](https://thrishankkuntimaddi.github.io/clearmyMind)

---

## What it does

Sometimes a name — a person, a thought, a word — keeps repeating in your head. ClearMyMind gives you a place to put it. Type it in, press Enter, and it's out of your head and into the list. That's it.

---

## Features

### 🔐 Password Protection
- **First launch** — set a password to protect your data
- **Every launch** — unlock with your password before accessing the list
- **Auto-lock** — the app locks itself 15 seconds after you switch tabs
- **3 wrong attempts** — all data (names + password) is permanently wiped and the app resets
- **Fingerprint / biometrics** — if your device supports it (Touch ID, Windows Hello), you'll get a one-tap unlock button automatically
- Passwords are hashed with SHA-256 via the Web Crypto API — never stored in plain text

### ⌨️ Keyboard-First Input
- **Just start typing** — no need to click the input. Any key press on the page automatically focuses the input field
- Press **Enter** to add a name
- Names are automatically formatted in **Title Case** (`thrishank kuntimaddi` → `Thrishank Kuntimaddi`)
- Duplicates are silently ignored (case-insensitive check)
- Empty entries are ignored

### 📋 Auto-Sorted Grid
- All 100 cells are always visible — **no scrolling ever**
- Names fill **top to bottom** within each column, then move to the next column (column-major order)
- Always sorted **A → Z** automatically
- **5 columns × 20 rows = 100 slots**, all visible at once

### ✏️ Inline Editing
- Hover any name to reveal **✎ Edit** and **× Delete** buttons
- Click **✎** to edit the name inline directly in the cell
- Press **Enter** or click away to save — title-casing is applied automatically
- Press **Escape** to cancel without saving

### 💾 Persistence
- All names stored in `localStorage` under the key `clearmind_names`
- Survives page refreshes (but requires password re-entry)
- Zero backend — runs entirely in your browser

### 📤 Copy
- **Copy** button copies all names to clipboard, one per line
- Shows a `✓ Copied!` confirmation for 2 seconds

### 🗑️ Clear All
- Instantly wipes all names from the list and localStorage
- No confirmation dialog — instant

### 🔒 Manual Lock
- Lock button (🔒) in the header locks the app immediately

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 19 (Vite) |
| Styling | CSS Modules (vanilla CSS, no Tailwind) |
| Auth | `localStorage` + SHA-256 (Web Crypto API) |
| Biometrics | WebAuthn Platform Authenticator |
| Persistence | `localStorage` |
| Deployment | GitHub Pages via `gh-pages` |

**Zero heavy dependencies.** No Redux, no router, no UI library.

---

## Project Structure

```
src/
├── hooks/
│   ├── useNames.js        # Names state, CRUD, sorting, persistence
│   └── useAuth.js         # Auth state, lock timer, login, biometric
├── components/
│   ├── AuthScreen.jsx     # Setup + login screen
│   ├── AuthScreen.module.css
│   ├── NameInput.jsx      # Add-name input with global key capture
│   ├── NameInput.module.css
│   ├── NameGrid.jsx       # 5×20 column-major grid container
│   ├── NameGrid.module.css
│   ├── NameCell.jsx       # Individual cell with edit + delete
│   └── NameCell.module.css
├── utils/
│   └── crypto.js          # SHA-256 hash, WebAuthn register + verify
├── App.jsx                # Root — auth gate, copy, lock
├── App.module.css
├── index.css              # Global design tokens + resets
└── main.jsx
```

---

## Running Locally

```bash
git clone git@github.com:thrishankkuntimaddi/clearmyMind.git
cd clearmyMind
npm install
npm run dev
```

Open [http://localhost:5173/clearmyMind/](http://localhost:5173/clearmyMind/)

---

## Deploying

```bash
npm run deploy
```

This builds the app and pushes it to the `gh-pages` branch automatically.  
The live site updates at [thrishankkuntimaddi.github.io/clearmyMind](https://thrishankkuntimaddi.github.io/clearmyMind) within a minute or two.

---

## Security Model

This is a **personal, local-only tool**. The security is designed to:

- Keep data private from casual access (shared computers, leaving a screen unlocked)
- Wipe data automatically after 3 failed login attempts
- Never transmit any data anywhere — everything stays in your browser

It is **not** designed to withstand determined attacks against a physically accessible device. For that level of security, use full-disk encryption.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Any printable key | Auto-focuses the add input |
| `Enter` (in add input) | Add name to list |
| `Enter` (in edit cell) | Save edited name |
| `Escape` (in edit cell) | Cancel edit |

---

## License

MIT — do whatever you want with it.
