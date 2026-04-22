# 🧠 ClearMyMind — Mental Offload Tool

> **Declutter your mind, one name at a time.**
> A minimal, secure, cloud-synced mental offloading tool — built for clarity under pressure.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-a855f7)](LICENSE)
[![Deployed on GitHub Pages](https://img.shields.io/badge/Deployed-GitHub%20Pages-24292e?logo=github)](https://thrishankkuntimaddi.github.io/clearmyMind)

---

## 📌 Description

**ClearMyMind** is a focused, distraction-free **mental offloading tool** that lets you rapidly capture names, tasks, or thoughts into an organized visual grid. It is designed for people who need to clear mental clutter quickly — whether that's brainstorming a shortlist, tracking people in a meeting, or externalizing thoughts to think more clearly.

**The problem it solves:**  
Cognitive overload is real. When you have too many things occupying your mental space, thinking clearly becomes hard. ClearMyMind gives you a fast, frictionless place to dump those thoughts, organize them, and then — literally — blast them away when you're done.

**Why it exists:**  
Most note-taking apps are too heavy. ClearMyMind is purpose-built to be instantly usable: open the app, type a name, press Enter. That's it. Everything else — sheets, groups, bags, color tags, snapshots — is additive power for when you need it.

---

## 🚀 Live Demo

🔗 **[https://thrishankkuntimaddi.github.io/clearmyMind](https://thrishankkuntimaddi.github.io/clearmyMind)**

> Deployed on **GitHub Pages** (client) with an **Express API server** handling transactional operations (email verification).

---

## 🔐 Login / Demo Credentials

ClearMyMind uses **Firebase Authentication** with email/password.

| Step | Action |
|------|--------|
| 1 | Navigate to the live demo |
| 2 | Click **Sign Up** and register with your email |
| 3 | Verify your email via the confirmation link |
| 4 | Log in and start offloading |

> ⚠️ There are no shared guest credentials — each user gets their own secure, isolated Firestore data tree. Registration is free and instant.

---

## 🧩 Features

### ✨ Core Features

| Feature | Description |
|---------|-------------|
| **Smart Bar** | A single input that doubles as a search box and an add-name field. Type to search; if no match exists, press `Enter` to add instantly. |
| **Name Grid** | Visual card grid of all captured names with context menus for edit, delete, and color tagging. |
| **Sheets** | Organize names across multiple named sheets (tabs). Drag names between sheets. |
| **Groups** | Create named groups and assign names to them. Group members are highlighted in the grid. |
| **Bag** | A holding area — drag a name to the Bag to remove it from the active sheet without deleting it. Restore it later. |
| **Color Tags** | Color-code individual name cards using a tag picker for visual categorization. |
| **Random Pick 3** | Click 🎲 to randomly highlight 3 names from the current sheet — great for decision-making or delegation. |
| **Copy / Load / Snapshot** | Export all data as a portable snapshot (clipboard). Paste it back anywhere to fully restore. |

### 🔒 Security Features

| Feature | Description |
|---------|-------------|
| **App Lock** | Optional device-level PIN/password lock, separate from Firebase login. Prevents shoulder-surfing. |
| **Biometric Unlock** | Register a fingerprint/Face ID on supported devices to unlock the app instantly. |
| **Security Wipe** | 3 consecutive wrong passwords trigger an automatic wipe: Firestore listeners torn down, all local keys cleared, Firebase sign-out, and hard page reload. |
| **Auto-Lock** | App automatically locks 15 seconds after the tab is hidden (configurable via NoLock mode). |
| **NoLock Mode** | 30-minute unlock window — stay unlocked across tabs without re-entering your PIN. |

### ⏱️ Auto-Wipe System

| Threshold | Behavior |
|-----------|----------|
| **80 names** | A ⏸ **Wait** button appears — warning that an auto-wipe is approaching. |
| **Click Wait** | Starts a **5-minute countdown** giving you time to copy or process names. |
| **90 names during countdown** | Escalates to a **10-second urgent countdown**. |
| **Countdown hits 0** | Triggers the **Blast Animation** — all names explode off the screen. A confetti Congrats screen follows. |
| **NoClear Mode** | Disable auto-wipe entirely when you need the list to persist indefinitely. |

### 🌐 Cloud & Sync

- **Firestore real-time sync** — all data persists and syncs across devices instantly.
- **Per-user data isolation** — Firestore rules enforce strict `uid`-based access.
- **Email verification** — Brevo SMTP email sent on sign-up to confirm identity.
- **Offline-capable** — Firebase SDK caches data locally; reads work offline.

### 📱 Mobile Experience

- **Bottom tab bar** — Navigate Names, Groups, and Bag via swipeable tabs on mobile.
- **Long-press drag** — Long-press a name card on mobile to drag it to the Bag, a Group, or another Sheet.
- **Mobile drag overlay** — A floating ghost card follows your finger during a drag operation.
- **Responsive layout** — Full desktop and mobile layouts with CSS Modules.

### ⌨️ Power User Shortcuts

| Shortcut | Action |
|----------|--------|
| `Any key` | Focuses the Smart Bar instantly |
| `Enter` | Adds the typed name (if not already in list) |
| `Esc` | Clears the search query |
| `Cmd+Z` / `Ctrl+Z` | Undoes the last added name and returns it to the input bar |
| `Paste` | Pastes a newline-separated name list or a full snapshot to restore |

---

## 🏗️ Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19 | UI framework |
| **Vite** | 8 | Build tool & dev server |
| **CSS Modules** | — | Scoped component styling |
| **Inter** (Google Fonts) | — | Typography |
| **Firebase SDK** | 12 | Firestore + Auth client |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | — | Runtime |
| **Express** | 4 | REST API framework |
| **Nodemailer** | 8 | SMTP email sending |
| **Brevo SMTP** | — | Transactional email provider |
| **uuid** | 9 | Verification token generation |
| **dotenv** | — | Environment variable management |
| **Nodemon** | — | Dev server auto-reload |

### Database & Auth

| Technology | Purpose |
|-----------|---------|
| **Firebase Firestore** | Real-time NoSQL database (primary data store) |
| **Firebase Authentication** | Email/password user auth with email verification |
| **Firestore Security Rules** | Per-user data isolation enforced at the DB layer |

### Deployment & Tooling

| Tool | Purpose |
|------|---------|
| **GitHub Pages** | Frontend hosting |
| **gh-pages** | Automated deploy script |
| **GitHub Actions** | CI/CD pipeline (build + deploy on push) |
| **Concurrently** | Run client + server dev servers simultaneously |
| **Web Crypto API** | Client-side password hashing (SHA-256) |
| **WebAuthn API** | Biometric registration and verification |

---

## 📂 Project Structure

```
ClearMyMind/                        ← Monorepo root
├── package.json                    ← Root scripts (dev, build, deploy)
├── firestore.rules                 ← Firestore security rules
│
├── client/                         ← React + Vite frontend (PWA)
│   ├── index.html                  ← HTML shell + PWA meta tags
│   ├── vite.config.js              ← Vite config (base path for GitHub Pages)
│   ├── .env.example                ← Firebase env template
│   └── src/
│       ├── App.jsx                 ← Root component, all state orchestration
│       ├── App.module.css          ← Global layout & header styles
│       ├── main.jsx                ← React entry point
│       ├── index.css               ← Global CSS reset & tokens
│       │
│       ├── components/
│       │   ├── AuthScreen.jsx          ← App Lock PIN/password screen
│       │   ├── FirebaseLoginScreen.jsx ← Firebase email/password login/signup
│       │   ├── VerifyEmailScreen.jsx   ← Post-signup email verification gate
│       │   ├── NameGrid.jsx            ← Grid of name cards
│       │   ├── NameCell.jsx            ← Individual name card (edit, tag, delete)
│       │   ├── NameInput.jsx           ← Legacy name input (now replaced by Smart Bar)
│       │   ├── Bag.jsx                 ← Holding bag for parked names
│       │   ├── Groups.jsx              ← Group management panel
│       │   ├── SheetBar.jsx            ← Sheet tabs (bottom strip)
│       │   ├── SettingsPanel.jsx       ← Settings drawer (lock, account, data)
│       │   ├── BlastAnimation.jsx      ← Auto-wipe explosion animation
│       │   ├── CongratsScreen.jsx      ← Post-wipe celebration screen
│       │   ├── LoadModal.jsx           ← Paste/load names modal
│       │   ├── MobileDragOverlay.jsx   ← Mobile long-press drag ghost
│       │   └── TagPicker.jsx           ← Color picker for name cards
│       │
│       ├── hooks/
│       │   ├── useFirebaseAuth.js      ← Firebase sign in/up/out/verify lifecycle
│       │   ├── useFirestoreData.js     ← All Firestore CRUD (sheets, names, tags, groups, bag)
│       │   ├── useAuth.js              ← Device-level App Lock (PIN, biometric, wipe)
│       │   ├── useAutoWipe.js          ← Auto-wipe timer state machine
│       │   └── useTags.js              ← Tag/color helpers
│       │
│       ├── lib/
│       │   ├── firebase.js             ← Firebase app initialization
│       │   ├── auth.js                 ← Firebase Auth instance export
│       │   └── db.js                   ← Firestore instance + listener management
│       │
│       └── utils/
│           ├── crypto.js               ← SHA-256 password hashing + WebAuthn biometric utils
│           └── snapshot.js             ← Snapshot serialization/deserialization (v1 + v2)
│
└── server/                         ← Express API server
    ├── index.js                    ← Express app entry point
    ├── .env                        ← Server secrets (SMTP, URLs)
    └── src/
        ├── routes/
        │   ├── auth.routes.js          ← /api/auth/* (email verification)
        │   ├── data.routes.js          ← /api/data/* (export, reset)
        │   └── settings.routes.js      ← /api/settings (profile/prefs)
        │
        ├── controllers/
        │   ├── auth.controller.js
        │   ├── data.controller.js
        │   └── settings.controller.js
        │
        ├── services/
        │   └── mailer.js               ← Brevo SMTP email sender
        │
        ├── db/
        │   └── store.js                ← Local JSON persistence (dev cache)
        ├── middleware/
        │   └── errorHandler.js         ← Global 404 + error middleware
        └── utils/                      ← Shared server utilities
```

---

## ⚙️ Installation & Setup

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A **Firebase project** (Firestore + Authentication enabled)
- A **Brevo** account (free tier works) for SMTP email

---

### 1. Clone the Repository

```bash
git clone https://github.com/thrishankkuntimaddi/clearmyMind.git
cd clearmyMind
```

### 2. Install All Dependencies

```bash
# Install root tooling (concurrently)
npm install

# Install client dependencies
npm install --prefix client

# Install server dependencies
npm install --prefix server
```

### 3. Configure the Client (Firebase)

```bash
cp client/.env.example client/.env
```

Edit `client/.env` and fill in your Firebase project credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### 4. Configure the Server (Brevo SMTP)

```bash
cp server/.env.example server/.env   # or create manually
```

Edit `server/.env`:

```env
PORT=3001
CLIENT_URL=http://localhost:5173

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_smtp_user
SMTP_PASS=your_brevo_smtp_password
EMAIL_FROM=your_verified_sender@email.com
```

### 5. Deploy Firestore Security Rules

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

firebase login
firebase deploy --only firestore:rules
```

### 6. Run Locally

```bash
# Run both client and server simultaneously
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend API | http://localhost:3001/api |
| Health Check | http://localhost:3001/api/health |

---

## 🔑 Environment Variables

### Client (`client/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | ⬜ | Google Analytics measurement ID |

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | ⬜ | Express server port (default: `3001`) |
| `CLIENT_URL` | ✅ | Frontend URL used to build verification email links |
| `SMTP_HOST` | ✅ | SMTP relay host (e.g., `smtp-relay.brevo.com`) |
| `SMTP_PORT` | ✅ | SMTP port (typically `587` for STARTTLS) |
| `SMTP_USER` | ✅ | Brevo SMTP username |
| `SMTP_PASS` | ✅ | Brevo SMTP password/key |
| `EMAIL_FROM` | ✅ | Verified sender email address |

---

## 🧠 How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Client)                    │
│                                                         │
│  React 19 + Vite                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Firebase │  │ App Lock │  │AutoWipe  │  │Snapshot│  │
│  │   Auth   │  │  (PIN /  │  │State     │  │ (Copy/ │  │
│  │          │  │ Biometric│  │Machine   │  │ Paste) │  │
│  └────┬─────┘  └──────────┘  └──────────┘  └────────┘  │
│       │                                                 │
│  ┌────▼────────────────────────────────────────────┐    │
│  │           useFirestoreData (primary data hook)  │    │
│  │    sheets · names · tags · groups · bag         │    │
│  └────┬────────────────────────────────────────────┘    │
└───────┼─────────────────────────────────────────────────┘
        │ Firestore SDK (real-time listeners)
        ▼
┌───────────────────────┐        ┌────────────────────────┐
│   Google Firestore    │        │  Express API Server    │
│   (Primary Database)  │        │  (Transactional only)  │
│                       │        │                        │
│  /users/{uid}/        │        │  POST /api/auth/       │
│    sheets             │        │    send-verification   │
│    names              │        │  POST /api/auth/       │
│    tags               │        │    resend-verification │
│    groups             │        │                        │
│    bag                │        │  → Nodemailer + Brevo  │
└───────────────────────┘        └────────────────────────┘
```

### Data Flow

1. **Authentication Gate:** Firebase Auth state is checked first. Unauthenticated users see the login screen; unverified users see the email verification screen.

2. **App Lock Gate (optional):** If the user has enabled App Lock (opt-in), they must pass PIN or biometric auth before the app loads. This is device-local and separate from Firebase.

3. **Firestore Sync:** Once authenticated, `useFirestoreData` opens real-time listeners on the user's Firestore document tree. All name operations (add, edit, remove, move, tag) write directly to Firestore — no local-first queue.

4. **Smart Bar Dual Mode:** The input bar detects whether the typed query matches an existing name (→ search/highlight mode) or is new (→ add mode, `Enter` to confirm).

5. **Auto-Wipe State Machine:** `useAutoWipe` watches the name count and progresses through `idle → pending → counting → critical → blasting → congrats`, triggering the Blast Animation when the countdown expires.

6. **Snapshot System:** The `snapshot.js` utility serializes the entire app state (all sheets, names, colors, groups, bag) into a portable text format (v2). Pasting this text back into any browser session fully restores all data.

### Key Design Decisions

- **Client-direct Firestore:** The client writes directly to Firestore (not through the Express server). The API server is in the "transactional only" lane — email, admin tasks — keeping latency near zero for normal operations.
- **App Lock ≠ Firebase Auth:** Two independent security layers: Firebase handles identity; App Lock handles device-level privacy. They can be used independently.
- **Security Wipe via hard reload:** Rather than clearing React state (which can be inconsistent), a wrong-password wipe forces `window.location.replace('/')` — guaranteeing zero state survives, including Firestore's IndexedDB cache.
- **CSS Modules everywhere:** No CSS-in-JS, no Tailwind. Pure scoped CSS modules keep bundle size minimal and styles predictable.

---

## 🚧 Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Security wipe race condition** — React state updates are async; a reload could happen before cleanup | Synchronously clear localStorage keys first, then call `signOutUser()` asynchronously, then `window.location.replace('/')` — the reload is the true safety net |
| **Biometric (WebAuthn) on iOS Safari** — WebAuthn `create()` must be called in a direct user gesture handler, not after `await` chains | Separated biometric "offer" (post-password-setup) from biometric "enroll" (direct button `onClick`) with no async code between the click and the WebAuthn call |
| **App Lock migration** — Old users had a lock hash that would lock them out after the lock became opt-in | One-time `migrateIfNeeded()` function runs synchronously on first render of v2, clearing old state and writing a version stamp |
| **Mobile drag-and-drop** — HTML5 drag events don't work well on touch devices | Built a custom long-press → pointer tracking → overlay ghost card system using `pointermove` events and `MobileDragOverlay` |
| **Cross-sheet name moves** — Moving a name must atomically update names + tags + groups across two sheets | `moveNameToSheet` in `useFirestoreData` performs all Firestore writes in a single batched operation |
| **Auto-wipe timer drift** — `setInterval` in React can drift or fire stale closures | Used `useRef` for the live countdown value (so the interval closure always reads fresh data) alongside `useState` for rendering |

---

## 🔮 Future Improvements

- **Offline-first write queue** — Buffer writes locally when offline and sync when reconnected, rather than failing silently.
- **Collaborative sheets** — Allow multiple users to share a sheet in real-time (Firestore already supports this with minimal rule changes).
- **PWA full offline support** — Add a Service Worker for asset caching so the app loads fully offline.
- **Keyboard shortcuts panel** — A dedicated `?` help overlay listing all keyboard shortcuts.
- **Export to CSV / Markdown** — Export a sheet's names as a formatted list for use outside the app.
- **Drag reorder in grid** — Allow dragging name cards to reorder them within a sheet.
- **Dark/light theme toggle** — Currently dark-only; add a light theme for daytime use.
- **Recurring auto-wipe schedule** — Let users set a daily auto-wipe time rather than relying solely on the count threshold.
- **Name search across all sheets** — Current search is per-sheet; extend it to search globally.

---

## 📸 UI Overview

### App Screens

| Screen | Description |
|--------|-------------|
| **Login / Sign Up** | Dark-themed Firebase email auth screen with sign in / create account toggle |
| **Email Verification** | Holding screen with a "Resend Email" button while waiting for inbox confirmation |
| **App Lock (PIN)** | Full-screen lock gate with attempt counter, biometric button, and 3-strike wipe |
| **Main App** | Header (Smart Bar + action buttons) · Name Grid · Right panel (Groups + Bag) · Sheet Bar |
| **Blast Animation** | Names scatter and explode off the screen in a particle animation when auto-wipe fires |
| **Congrats Screen** | Post-wipe celebration view before returning to the empty grid |
| **Settings Panel** | Slide-in drawer: account info, App Lock controls, data reset, sign out, delete account |
| **Load Modal** | Full-screen paste area to load a name list or full snapshot |

---

## 🤝 Contributing

Contributions are welcome! Follow these steps:

1. **Fork** the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes with clear, focused commits
4. Run the linter: `npm run lint`
5. Test both the client and server locally: `npm run dev`
6. Open a **Pull Request** with a clear description of your changes

### Development Guidelines

- Follow existing CSS Modules patterns — no inline styles except for dynamic values
- Keep hooks focused on a single concern
- All Firestore writes should go through `useFirestoreData` — never call Firestore directly from components
- Do not commit `.env` files or Firebase credentials

---

## 📜 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2024 Thrishank Kuntimaddi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**Built with 🧠 by [Thrishank Kuntimaddi](https://github.com/thrishankkuntimaddi)**

*Part of the PASSI personal productivity ecosystem*

</div>
