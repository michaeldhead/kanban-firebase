// ---------------------------------------------------------------------------
// useAuth
//
// React hook that mirrors the Firebase Auth state into component-friendly
// values. Two sign-in methods are supported:
//
//   - Google Sign-In via popup (`signInWithPopup`). The COOP warning
//     that earlier builds got from the popup closing itself is
//     resolved by setting a permissive `Cross-Origin-Opener-Policy`
//     on the hosted app in `firebase.json`
//     (`same-origin-allow-popups`) — that header lets the popup call
//     `window.close()` back to the opener without being trapped.
//
//   - Email + password (`createUserWithEmailAndPassword`,
//     `signInWithEmailAndPassword`, `sendPasswordResetEmail`,
//     `updateProfile` for the optional display name).
//
// State / behavior:
//   - `loading` starts true until the first `onAuthStateChanged`
//     callback fires, so the UI does not flash the sign-in screen
//     to an already-signed-in user on page load.
//   - All sign-in / sign-up / password-reset methods record any
//     thrown error in `state.error` so the SignInScreen can show it
//     inline. Resolved errors do not bubble to a toast.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

export function useAuth(): AuthState & {
  signIn: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => setState({ user, loading: false, error: null }),
      (err) => setState({ user: null, loading: false, error: err.message }),
    )
    return unsub
  }, [])

  function clearError() {
    setState((s) => ({ ...s, error: null }))
  }

  function recordError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback
    setState((s) => ({ ...s, error: message }))
  }

  // ---------- Google ----------

  async function signIn() {
    clearError()
    try {
      // Popup flow. The COOP warning that the popup's `window.close()`
      // would otherwise trigger is sidestepped by the
      // `Cross-Origin-Opener-Policy: same-origin-allow-popups` header
      // on Hosting (`firebase.json`). If the user closes the popup
      // before completing sign-in, Firebase throws
      // `auth/popup-closed-by-user`, which lands in the catch below
      // and becomes an inline error.
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      recordError(err, 'Sign-in failed')
    }
  }

  // ---------- Email + password ----------

  async function signInWithEmail(email: string, password: string) {
    clearError()
    try {
      await signInWithEmailAndPassword(auth, email, password)
      // `onAuthStateChanged` will fire with the new user and refresh
      // local state.
    } catch (err) {
      recordError(err, 'Could not sign in.')
    }
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    displayName?: string,
  ) {
    clearError()
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      if (displayName && displayName.trim()) {
        // `updateProfile` does NOT fire `onAuthStateChanged` on its
        // own. The state update arrives at next `onIdTokenChanged`
        // tick or when the user reloads — for our purposes the
        // display name is decorative, so we let the listener catch
        // it eventually.
        await updateProfile(cred.user, { displayName: displayName.trim() })
      }
    } catch (err) {
      recordError(err, 'Could not create account.')
    }
  }

  async function sendPasswordReset(email: string) {
    clearError()
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (err) {
      recordError(err, 'Could not send password reset email.')
      // Re-throw so the SignInScreen can know to NOT show the success
      // confirmation when the request actually failed.
      throw err
    }
  }

  // ---------- Session ----------

  async function signOut() {
    await firebaseSignOut(auth)
  }

  return {
    ...state,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOut,
    clearError,
  }
}
