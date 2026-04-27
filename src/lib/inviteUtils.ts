// ---------------------------------------------------------------------------
// Invite link helpers.
//
// An invite link is a regular app URL with a single query parameter:
//
//   https://<host>/?invite=<projectId>
//
// The owner generates one from ShareProjectModal after entering an
// invitee's email. The invitee opens the link, which:
//
//   1. Lands them on the app at the sign-in screen (if not signed in)
//      with an "invited to collaborate" banner — see SignInScreen.
//   2. Once signed in, App.tsx detects the `?invite` parameter and
//      calls `activateMember(projectId, user.email)` to flip their
//      membership to `'active'`. The query param is then cleared
//      from the URL via `history.replaceState` so a refresh does
//      not re-run the activation.
//
// The link is essentially a bearer token: anyone who possesses it can
// join the project. That matches the design — the owner controls
// distribution. Removing a member through ShareProjectModal revokes
// access immediately.
// ---------------------------------------------------------------------------

const INVITE_PARAM = 'invite'

/**
 * Build an invite URL for the given project. Uses the current
 * window's origin so it works in dev (localhost) and production
 * (Firebase Hosting domain) without configuration.
 */
export function generateInviteLink(projectId: string): string {
  return `${window.location.origin}/?${INVITE_PARAM}=${encodeURIComponent(projectId)}`
}

/**
 * Read the `?invite=…` parameter from the current URL. Returns the
 * decoded project id, or null if the parameter is absent or empty.
 * Defensive against URLs with multiple query separators.
 */
export function readInviteParam(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const id = params.get(INVITE_PARAM)
    if (!id) return null
    const trimmed = id.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/**
 * Strip the `?invite=…` parameter from the current URL without
 * triggering a navigation or a page reload. Used after the App-level
 * effect has consumed the invite (called `activateMember`), so a
 * page refresh does not retry an already-completed activation.
 */
export function clearInviteParam(): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete(INVITE_PARAM)
    const newSearch = url.searchParams.toString()
    const newUrl =
      url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash
    window.history.replaceState({}, '', newUrl)
  } catch {
    // No-op: a failure here is purely cosmetic.
  }
}
