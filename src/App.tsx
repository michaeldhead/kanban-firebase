// ---------------------------------------------------------------------------
// App root.
//
// Top-level component responsible for:
//
//  1. Gating on authentication. Until Firebase has finished restoring the
//     signed-in session we show a neutral "Loading" message. If there is
//     no user we hand off to the SignInScreen — which now supports both
//     email/password and Google Sign-In, and shows an invite banner when
//     the user arrived via an invite link.
//
//  2. Loading the user's projects (owned + shared) and the active
//     project's cards. The active project id is kept in local state;
//     we auto-select the first project on load and re-pick when the
//     current one disappears.
//
//  3. Owning the modal layer. Every dialog in the app (new project,
//     edit project, manage columns, add card, full card dialog,
//     share project) is mounted here so it can overlay the entire UI
//     regardless of which child component triggered it.
//
//  4. Theming. The active theme key (`kanban_theme`) and the
//     light/dark `kanban_color_mode` are persisted to localStorage
//     and re-applied here on every change via `applyTheme`, which
//     writes the chosen variant's CSS variables onto the
//     `:root` element. The Settings popover surfaces both
//     controls; everything else in the app reads colors via
//     `var(--kb-*)` tokens and so picks up the swap with no
//     component-level wiring.
//
//  5. The invite-link flow. On mount we read `?invite=<projectId>`.
//     If the user is signed in we activate their membership on the
//     target project; otherwise we hand the projectId to SignInScreen
//     so it can show a banner. After activation the param is cleared
//     from the URL via `history.replaceState`.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from './types'
import { SignInScreen } from './components/auth/SignInScreen'
import { Sidebar } from './components/sidebar/Sidebar'
import { Board } from './components/board/Board'
import { CardDialog } from './components/board/CardDialog'
import { SettingsPopover } from './components/settings/SettingsPopover'
import { AddCardModal } from './components/modals/AddCardModal'
import { NewProjectModal } from './components/modals/NewProjectModal'
import { EditProjectModal } from './components/modals/EditProjectModal'
import { ManageColumnsModal } from './components/modals/ManageColumnsModal'
import { ImportModal } from './components/modals/ImportModal'
import { ShareProjectModal } from './components/modals/ShareProjectModal'
import { ArchiveDrawer } from './components/board/ArchiveDrawer'
import { useAuth } from './hooks/useAuth'
import { useProjects } from './hooks/useProjects'
import { useCards } from './hooks/useCards'
import { useLocalStorage } from './hooks/useLocalStorage'
import { applyTheme, DEFAULT_THEME_KEY, type ColorMode } from './lib/themes'
import { activateMember, countActiveCardsForProject } from './lib/firestore'
import {
  clearInviteParam,
  readInviteParam,
} from './lib/inviteUtils'
import { useToast } from './components/toast/ToastProvider'

export default function App() {
  const {
    user,
    loading: authLoading,
    error: authError,
    signIn,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOut,
  } = useAuth()

  const { projects } = useProjects(user?.uid ?? null, user?.email ?? null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const { cards, loading: cardsLoading, error: cardsError } = useCards(
    user?.uid ?? null,
    user?.email ?? null,
    activeProjectId,
  )

  // ---- Invite link handling ----
  // Read the invite param exactly once, on mount. It is then
  // consumed by the post-auth effect below.
  const [pendingInviteProjectId, setPendingInviteProjectId] = useState<
    string | null
  >(() => readInviteParam())
  const toast = useToast()

  // ---- Modal state ----
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false)
  const [addCardOpen, setAddCardOpen] = useState(false)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  // ShareProjectModal accepts a project id (rather than a boolean)
  // so the same modal can be reused for any project the user is
  // sharing (currently the kebab on each owned project).
  const [shareProjectId, setShareProjectId] = useState<string | null>(null)
  // Archive drawer is scoped to whatever project is currently
  // active — re-opening with a different project simply rebinds
  // the drawer's `useArchivedCards` subscription, so we only need
  // a boolean here.
  const [archiveDrawerOpen, setArchiveDrawerOpen] = useState(false)

  // Stable callback references for CardDialog. Keeps Modal's
  // [open, onClose] effect from re-running on every App render.
  const handleOpenCard = useCallback((id: string) => setOpenCardId(id), [])
  const handleCardDialogClose = useCallback(() => setOpenCardId(null), [])

  // ---- Theming ----
  const [colorMode, setColorMode] = useLocalStorage<ColorMode>(
    'kanban_color_mode',
    'light',
  )
  const [themeKey, setThemeKey] = useLocalStorage<string>(
    'kanban_theme',
    DEFAULT_THEME_KEY,
  )
  useEffect(() => {
    applyTheme(themeKey, colorMode)
    const root = document.documentElement
    if (colorMode === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [themeKey, colorMode])

  // ---- Active project sync ----
  useEffect(() => {
    if (projects.length === 0) {
      if (activeProjectId !== null) setActiveProjectId(null)
      return
    }
    if (!activeProjectId || !projects.find((p) => p.id === activeProjectId)) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId])

  // ---- Invite consumption ----
  // Once the user is signed in AND we have a pending invite, call
  // activateMember and clear the param. We use a ref to make sure
  // each invite is consumed at most once — useEffect can re-run if
  // any dep reference flips, and we do not want to fire repeated
  // writes for the same invite.
  const consumedInviteRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user || !user.email || !pendingInviteProjectId) return
    if (consumedInviteRef.current === pendingInviteProjectId) return

    consumedInviteRef.current = pendingInviteProjectId
    const projectIdToActivate = pendingInviteProjectId

    activateMember(projectIdToActivate, user.email)
      .then(() => {
        clearInviteParam()
        setPendingInviteProjectId(null)
        // Snap the user to the project they just accepted so they
        // see the shared board immediately.
        setActiveProjectId(projectIdToActivate)
        toast.push('Invitation accepted.', 'success')
      })
      .catch((err) => {
        toast.push(
          err instanceof Error ? err.message : 'Could not accept invite.',
          'error',
        )
        // Keep the param around so the user can retry by reloading.
        consumedInviteRef.current = null
      })
  }, [user, pendingInviteProjectId, toast])

  // ---- Derived data ----
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )

  // True ONLY for projects the current user owns. Members see the
  // same board but with restricted UI affordances (no Manage Columns,
  // no Share, no project edit/delete, no New project from a shared
  // board's settings popover).
  const isActiveOwner = activeProject?.isOwner === true

  // Permission to create a new project from the settings popover.
  // Members-only accounts (those who appear in shared projects but
  // own none of them) do not get the action. A brand-new account
  // with zero projects still gets it so they can create their first.
  const hasAnyOwnedProject = projects.some((p) => p.isOwner === true)
  const canCreateProject = hasAnyOwnedProject || projects.length === 0

  const editingProject = useMemo(
    () =>
      editProjectId ? projects.find((p) => p.id === editProjectId) ?? null : null,
    [editProjectId, projects],
  )

  const sharingProject = useMemo(
    () =>
      shareProjectId
        ? projects.find((p) => p.id === shareProjectId) ?? null
        : null,
    [shareProjectId, projects],
  )

  // Card dialog plumbing. Cached `openCard` ref pattern protects
  // against transient `cards.find()` returning undefined during
  // snapshot resubscription.
  const lastOpenCardRef = useRef<Card | null>(null)
  const openCard = useMemo(() => {
    if (!openCardId) {
      lastOpenCardRef.current = null
      return null
    }
    const found = cards.find((c) => c.id === openCardId)
    if (found) {
      lastOpenCardRef.current = found
      return found
    }
    return lastOpenCardRef.current
  }, [openCardId, cards])

  // Active-card count for the project being edited. Used by
  // EditProjectModal as a delete blocker.
  //
  // Two source paths:
  //   - Editing the ACTIVE project: read directly from the live
  //     `cards` array (already filtered to non-archived by useCards).
  //     This avoids a redundant network read whenever the dialog
  //     opens for the project the user is currently looking at.
  //   - Editing any OTHER project: fetch via
  //     `countActiveCardsForProject(userId, projectId)`. The helper
  //     filters by `userId` so the rules evaluator can prove the
  //     query is owner-scoped; we pass the project's owner uid so
  //     it counts owner-authored cards (the dialog itself is
  //     owner-only — members cannot edit/delete a shared project —
  //     which makes "owner-authored cards" the right denominator
  //     for the delete blocker).
  const [editingProjectActiveCardCount, setEditingProjectActiveCardCount] =
    useState(0)
  useEffect(() => {
    if (!editingProject) {
      setEditingProjectActiveCardCount(0)
      return
    }
    if (editingProject.id === activeProjectId) {
      setEditingProjectActiveCardCount(cards.length)
      return
    }
    let cancelled = false
    setEditingProjectActiveCardCount(0)
    countActiveCardsForProject(editingProject.userId, editingProject.id)
      .then((n) => {
        if (!cancelled) setEditingProjectActiveCardCount(n)
      })
      .catch(() => {
        // On error, fall back to 0 so the delete blocker disappears
        // and any actual permission failure surfaces when the user
        // attempts the delete write itself.
        if (!cancelled) setEditingProjectActiveCardCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [editingProject, activeProjectId, cards])

  // ---- Render branches ----

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--kb-text-muted)]">
        Loading…
      </div>
    )
  }

  if (!user) {
    return (
      <SignInScreen
        onSignInGoogle={signIn}
        onSignInEmail={signInWithEmail}
        onSignUpEmail={signUpWithEmail}
        onPasswordReset={sendPasswordReset}
        error={authError}
        inviteProjectId={pendingInviteProjectId}
      />
    )
  }

  return (
    <div className="flex h-full w-full">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
        onEditProject={(id) => setEditProjectId(id)}
        onShareProject={(id) => setShareProjectId(id)}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
      />

      {activeProject ? (
        <Board
          project={activeProject}
          isOwner={isActiveOwner}
          cards={cards}
          cardsLoading={cardsLoading}
          cardsError={cardsError}
          uid={user.uid}
          userEmail={user.email ?? null}
          onAddCard={() => setAddCardOpen(true)}
          onOpenCard={handleOpenCard}
          onOpenArchive={() => setArchiveDrawerOpen(true)}
        />
      ) : (
        <EmptyDashboard
          userEmail={user.email}
          onSignOut={signOut}
          onOpenNewProject={() => setNewProjectOpen(true)}
        />
      )}

      {/* ---------- Overlays ---------- */}

      <SettingsPopover
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenImportCards={() => setImportOpen(true)}
        onOpenManageColumns={() => setManageColumnsOpen(true)}
        onOpenNewProject={() => setNewProjectOpen(true)}
        onOpenArchive={() => setArchiveDrawerOpen(true)}
        colorMode={colorMode}
        onToggleColorMode={() =>
          setColorMode((m) => (m === 'light' ? 'dark' : 'light'))
        }
        activeThemeKey={themeKey}
        onChangeTheme={setThemeKey}
        onSignOut={signOut}
        hasActiveProject={!!activeProject}
        // When the active project is a shared one (not owned by us)
        // hide owner-only options. Members can still access import
        // and add card via the board.
        isActiveProjectOwner={isActiveOwner}
        canCreateProject={canCreateProject}
      />

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        userId={user.uid}
        userEmail={user.email ?? ''}
        existingProjects={projects}
        onCreated={(id) => setActiveProjectId(id)}
      />

      <EditProjectModal
        open={!!editingProject}
        onClose={() => setEditProjectId(null)}
        project={editingProject}
        allProjects={projects}
        activeCardCount={editingProjectActiveCardCount}
        onDeleted={() => setEditProjectId(null)}
      />

      <ManageColumnsModal
        open={manageColumnsOpen}
        onClose={() => setManageColumnsOpen(false)}
        project={activeProject}
        cards={cards}
      />

      <AddCardModal
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        userId={user.uid}
        project={activeProject}
        cards={cards}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        userId={user.uid}
        project={activeProject}
      />

      <ShareProjectModal
        open={!!sharingProject}
        onClose={() => setShareProjectId(null)}
        project={sharingProject}
        invitedByUid={user.uid}
      />

      <CardDialog
        key={openCardId ?? 'closed'}
        open={!!openCardId}
        onClose={handleCardDialogClose}
        card={openCard}
        project={activeProject}
        allCards={cards}
        currentUid={user.uid}
      />

      {/* Archive drawer. Mounted last so its overlay stacks above
          every other modal — opening the drawer from inside another
          dialog is not currently a flow, but the z-index ordering
          here keeps the option open. The drawer subscribes its own
          archived-cards stream from the active project. */}
      <ArchiveDrawer
        open={archiveDrawerOpen}
        onClose={() => setArchiveDrawerOpen(false)}
        project={activeProject}
        uid={user.uid}
        userEmail={user.email ?? ''}
      />
    </div>
  )
}

function EmptyDashboard({
  userEmail,
  onSignOut,
  onOpenNewProject,
}: {
  userEmail: string | null
  onSignOut: () => void
  onOpenNewProject: () => void
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[var(--kb-board-bg)] p-8 text-center">
      <h2 className="text-lg font-semibold text-[var(--kb-text-primary)]">
        No projects yet
      </h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--kb-text-muted)]">
        Create your first project to get started, or wait for someone to
        share a board with you.
      </p>
      <button
        onClick={onOpenNewProject}
        className="mt-4 rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
      >
        New project
      </button>
      <p className="mt-8 text-xs text-[var(--kb-text-muted)]">
        Signed in as {userEmail ?? 'unknown'} ·{' '}
        <button
          onClick={onSignOut}
          className="underline hover:text-[var(--kb-text-secondary)]"
        >
          sign out
        </button>
      </p>
    </main>
  )
}
