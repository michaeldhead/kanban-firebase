// ---------------------------------------------------------------------------
// Firebase SDK initialization.
//
// Exposes three singletons used across the app:
//   - `auth`: Firebase Auth instance (used by the sign-in hook)
//   - `db`:   Firestore instance (used by the data hooks)
//   - `googleProvider`: the Google Sign-In provider handed to `signInWithPopup`
//
// The config values come from Vite environment variables, which Vite inlines
// at build time. The `VITE_` prefix is required for Vite to expose a variable
// to client code. These values are not secrets — Firestore security rules
// are what actually protects user data.
// ---------------------------------------------------------------------------

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// `initializeApp` is safe to call exactly once per page load. Because this
// module is imported by many others, ES module caching guarantees that
// happens — the call does not run a second time even when `db` or `auth`
// is imported from multiple entry points.
export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// A single reusable Google Sign-In provider instance. The auth flow
// uses `signInWithPopup` (see `useAuth.ts`), which accepts either a
// fresh or a reused provider; reusing this one instance avoids a
// little garbage-collection churn. We are intentionally NOT on
// `signInWithRedirect` — Firebase's redirect flow is COOP-fragile
// and the popup path with `Cross-Origin-Opener-Policy:
// same-origin-allow-popups` (set in `firebase.json`) is the
// combination this app is verified against.
export const googleProvider = new GoogleAuthProvider()
