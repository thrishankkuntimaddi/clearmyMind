# 🧠 ClearMyMind

> **Get it out of your head. Then let it go.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Deployed on GitHub Pages](https://img.shields.io/badge/Deployed-GitHub%20Pages-24292e?logo=github)](https://thrishankkuntimaddi.github.io/clearmyMind)

🔗 **Live:** https://thrishankkuntimaddi.github.io/clearmyMind

---

## Why this app exists

When too many people, tasks or loose thoughts are circling in your head, you
can't think clearly. Writing them down helps, but most note apps are too
heavy for that: folders, formatting, sync settings. By the time the app is
ready, the thought is gone.

ClearMyMind does one job. **Type a name, press Enter, and it's out of your head.**
You can see everything on one grid, mark what matters with a colour, and split
contexts into sheets. When you're done, press **Clear my mind**. The names blow
apart on screen and you start fresh. That last step matters: the point is to
let go, not to build an archive.

### What's in it, and why each feature earns its place

| Feature | Why it's here |
|---|---|
| **Smart bar** | One input for both search and add, and you can start typing from anywhere on the page. Zero friction is the whole product. |
| **Name grid** | See everything at once. Click to copy a name, double-click to colour it, ✎ to edit, × to remove. |
| **Colour tags** | The lightest possible way to sort things (urgent, waiting, done) without adding structure. |
| **Sheets** | Separate contexts (work, personal, a meeting). Drag a name onto a tab to move it. On mobile, long-press and drag. |
| **Clear my mind** | Two-tap confirm, then the blast animation and a calm finish screen. **Undo** is offered for 8 seconds afterwards. |
| **Copy / Load** | A plain-text snapshot of every sheet that you can keep or move between accounts. Pasting a list adds all the names at once. |
| **Cmd/Ctrl + Z** | Takes back the last name you added and puts it back in the bar. |

### What was removed, and why

| Removed | Reason |
|---|---|
| App Lock, biometric unlock, NoLock, the "3 wrong PINs wipe" | It only looked secure. The PIN was an unsalted SHA-256 hash in `localStorage`, the biometric check was never verified anywhere, and your data was already sitting unencrypted in the browser's IndexedDB. Real protection is now your account plus nothing stored on the device (see below). |
| Auto-wipe timer at 80/90 names, NoClear | Confusing: clicking **Wait** actually *started* the countdown, and it was off by default for everyone. Clearing is now a deliberate action you can undo. |
| Memory Sheets (trash, versions, icons, export, tabs) | A second copy of Sheets that only existed to protect names from the auto-wipe. With the auto-wipe gone, regular sheets already keep your names. |
| Groups, Bag | Two more ways to organise that overlapped with colours and sheets. |
| Pick 3 random | A gimmick that didn't fit the purpose. |
| Express server (`server/`) | Never called by the app. It also exposed unauthenticated endpoints. |

**Existing data is kept.** The first time a v1 account loads, Memory Sheets and
the Bag are copied into ordinary sheets ("Bag", plus one sheet per memory sheet).
The old documents are left untouched until you use *Delete all my data*.

---

## 🔒 Data security

- **Per-user isolation.** Data lives under `users/{uid}/…` in Firestore. Security
  rules only allow the signed-in owner to read or write it.
- **Verified email required.** Your data isn't loaded until your email address is verified.
- **Nothing stored on the device.** Firestore runs with an in-memory cache, so
  your names never touch the device's disk, and the IndexedDB cache from older
  versions is cleared on startup. Leftover App Lock keys are removed from `localStorage`.
- **Never overwrites data after a failed load.** Writes are blocked until the
  first server read succeeds. If loading fails, you see an error screen instead
  of an empty sheet that could overwrite your real data.
- **No cross-account leaks.** All in-memory state is reset whenever the signed-in user changes.
- **Untrusted input is validated.** Pasted lists and snapshots are cleaned:
  length limits, control characters stripped, sheet ids allow-listed (blocks
  `__proto__` and reserved Firestore keys), colours allow-listed, and per-sheet
  and per-account limits keep documents under Firestore's 1 MiB cap. Pasting a
  snapshot opens a confirmation dialog instead of silently merging.
- **Content-Security-Policy** in production: scripts can only load from the app's
  own origin, and network connections are limited to Google/Firebase APIs.
- **Safer account actions.** Password reset is available, and its response doesn't
  reveal whether an account exists. Deleting your account requires re-entering
  your password *before* anything is deleted, so you can't end up with your
  data gone but the account still alive.

> ⚠️ **Firestore rules are shared.** This Firebase project (`nistha-passi-core`)
> serves several PASSI apps, and one ruleset covers all of them. The single source
> of truth is `../ExpenseTracker/firestore.rules`. **Don't deploy rules from this
> repo.** Doing so would overwrite the rules for the other apps.

---

## 🏗️ Tech stack

React 19 · Vite 8 · CSS Modules · Firebase Auth (email/password) · Cloud Firestore · GitHub Pages + GitHub Actions

```
client/
├── src/
│   ├── App.jsx                     ← screens + main layout
│   ├── hooks/
│   │   ├── useFirebaseAuth.js      ← sign in/up, verify, reset, delete account
│   │   └── useFirestoreData.js     ← sheets, names, colours, migration, sync
│   ├── lib/
│   │   ├── firebase.js             ← init (memory-only Firestore cache)
│   │   ├── auth.js                 ← Firebase Auth wrappers
│   │   └── db.js                   ← the only file that talks to Firestore
│   ├── utils/
│   │   ├── validate.js             ← input limits + sanitising
│   │   └── snapshot.js             ← Copy/Load text format
│   └── components/                 ← grid, cells, sheet bar, modals, screens
└── public/                         ← PWA manifest, icons, service worker
```

### Data model

```
users/{uid}/data/sheets  { sheets: [{ id, name }], schema: 2 }
users/{uid}/data/names   { [sheetId]: string[] }
users/{uid}/data/tags    { [sheetId]: { [name]: "red" | "orange" | … } }
```

The sheet that's currently open is stored per device, so switching sheets on
your phone doesn't change the sheet open on your laptop.

---

## ⚙️ Run locally

```bash
git clone https://github.com/thrishankkuntimaddi/clearmyMind.git
cd clearmyMind/client
npm install
cp .env.example .env      # fill in your Firebase web config
npm run dev               # http://localhost:5173/clearmyMind/
```

`npm run lint` and `npm run build` are also run in CI.

## 🚀 Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which lints and
builds the app, then publishes `client/dist` to the `gh-pages` branch, where
GitHub Pages serves it. The Firebase web config comes from repository secrets
`VITE_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`,
`…_MESSAGING_SENDER_ID` and `…_APP_ID`.

---

## 📜 License

MIT © Thrishank Kuntimaddi. Part of the PASSI personal productivity ecosystem.
