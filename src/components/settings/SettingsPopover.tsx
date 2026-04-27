// ---------------------------------------------------------------------------
// SettingsPopover
//
// The "Settings & more" popover triggered from the sidebar. Lives as a
// small fixed panel anchored to the bottom-left of the viewport so it
// sits just above the Settings button regardless of whether the sidebar
// is collapsed or expanded.
//
// The popover owns none of its state — every item calls a prop the
// parent provides, and the parent also passes in the current theme /
// color mode so the UI reflects them.
//
// Items follow the order in the spec:
//   1. Import cards
//   2. Manage columns
//   3. New project
//   --- divider ---
//   4. Dark / Light mode toggle (fully wired — swaps CSS variables via
//      the active theme's light/dark variant)
//   5. Color theme swatches (click one to apply immediately)
//   6. Sign out
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'
import { THEMES, type ColorMode } from '../../lib/themes'

interface Props {
  open: boolean
  onClose: () => void

  onOpenImportCards: () => void
  onOpenManageColumns: () => void
  onOpenNewProject: () => void
  // Open the archive drawer for the active project. Available to
  // any signed-in user when there is an active project; the drawer
  // itself filters to cards the user can read.
  onOpenArchive: () => void

  colorMode: ColorMode
  onToggleColorMode: () => void

  activeThemeKey: string
  onChangeTheme: (key: string) => void

  onSignOut: () => Promise<void> | void

  // True when no project is active. Manage columns and Import cards
  // have nothing to operate on in that case, so we disable them.
  hasActiveProject: boolean

  // True when the active project is owned by the current user. Members
  // viewing a shared board do not get the project-restructuring
  // option (Manage columns), which is hidden when this is false.
  isActiveProjectOwner: boolean

  // True when the signed-in user is allowed to create a new project
  // from this menu. The caller resolves this as "owns at least one
  // existing project, OR has no projects at all" — in other words,
  // members who only ever see shared boards do not get the action,
  // but a brand-new account with zero projects still gets to create
  // their first one. New projects always belong to the creator, so
  // the action is fundamentally an owner-side capability.
  canCreateProject: boolean
}

export function SettingsPopover({
  open,
  onClose,
  onOpenImportCards,
  onOpenManageColumns,
  onOpenNewProject,
  onOpenArchive,
  colorMode,
  onToggleColorMode,
  activeThemeKey,
  onChangeTheme,
  onSignOut,
  hasActiveProject,
  isActiveProjectOwner,
  canCreateProject,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Outside-click + Escape dismiss. Delay attaching the outside-click
  // handler by a tick so the click that opened the popover does not
  // immediately close it.
  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (target && panelRef.current && !panelRef.current.contains(target)) {
        onClose()
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown)
    }, 0)
    document.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  function fire(cb: () => void) {
    return () => {
      cb()
      onClose()
    }
  }

  return (
    <div
      ref={panelRef}
      className="fixed bottom-14 left-2 z-30 w-64 rounded-lg border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] p-1 shadow-xl"
      role="menu"
    >
      <Item
        label="Import cards"
        onClick={fire(onOpenImportCards)}
        disabled={!hasActiveProject}
        disabledHint="Select a project first"
      />
      {/* "View archived" sits below "Import cards" so the two
          card-data actions are grouped. Hidden when there is no
          active project — the drawer needs a project to scope its
          query against. */}
      {hasActiveProject && (
        <Item label="View archived" onClick={fire(onOpenArchive)} />
      )}
      {/* "Manage columns" restructures the board — owner-only. Members
          on a shared board cannot rename / reorder / delete columns
          (Firestore rules also enforce this). The item is hidden
          rather than disabled because there is no useful tooltip to
          show: the option simply does not apply. */}
      {isActiveProjectOwner && (
        <Item
          label="Manage columns"
          onClick={fire(onOpenManageColumns)}
          disabled={!hasActiveProject}
          disabledHint="Select a project first"
        />
      )}
      {/* "New project" is hidden for member-only users (those who see
          only shared boards). A signed-in user with no projects still
          sees it so they can create their first one. */}
      {canCreateProject && (
        <Item label="New project" onClick={fire(onOpenNewProject)} />
      )}

      <Divider />

      <Item
        label={colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        onClick={fire(onToggleColorMode)}
      />

      {/* Theme swatches. Clicking a swatch applies the theme immediately
          and closes the popover so the user sees the result on a full,
          unobstructed view of the board. */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--kb-text-muted)]">
          Color theme
        </div>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => {
            const active = t.key === activeThemeKey
            return (
              <button
                key={t.key}
                type="button"
                title={t.name}
                onClick={fire(() => onChangeTheme(t.key))}
                className={`relative h-6 w-6 rounded-full border transition ${
                  active
                    ? 'border-[var(--kb-text-primary)] ring-2 ring-offset-1 ring-[var(--kb-text-primary)]'
                    : 'border-[var(--kb-card-border)] hover:border-[var(--kb-text-muted)]'
                }`}
                style={{ backgroundColor: t.swatch }}
                aria-label={t.name}
                aria-pressed={active}
              />
            )
          })}
        </div>
      </div>

      <Divider />

      <Item label="Sign out" onClick={fire(() => void onSignOut())} danger />
    </div>
  )
}

function Item({
  label,
  onClick,
  disabled,
  disabledHint,
  danger,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  disabledHint?: string
  danger?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
        disabled
          ? 'cursor-not-allowed text-[var(--kb-text-muted)]'
          : danger
            ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
            : 'text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]'
      }`}
    >
      {label}
    </button>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-[var(--kb-card-border)]" />
}
