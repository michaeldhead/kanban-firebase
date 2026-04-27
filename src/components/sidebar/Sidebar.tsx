// ---------------------------------------------------------------------------
// Sidebar
//
// The left-hand navigation panel. Responsible for:
//   - Showing the app logo / wordmark at the top
//   - Listing all of the user's projects, grouped by their `group` field
//   - Highlighting the currently active project
//   - A "Settings & more" button at the bottom (settings popover lives in
//     App.tsx; this component just fires the toggle callback)
//
// Two UI behaviors that are worth reading carefully:
//
//  1. Collapsible. The user can shrink the sidebar to a narrow rail that
//     shows only colored group dots. Hovering a dot surfaces the project
//     name as a native tooltip. State persists to localStorage so the
//     sidebar reopens in whichever state the user left it.
//
//  2. Resizable. When expanded the user can drag the right edge to resize
//     between MIN_WIDTH and MAX_WIDTH. Resize is implemented with manual
//     mouse events (not CSS `resize`) so we have full control over the
//     clamping, cursor, and persistence to localStorage.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Project, ProjectGroup } from '../../types'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { ProjectItem } from './ProjectItem'
import { groupLabel } from './groupColor'

// Width in pixels used when the sidebar is collapsed to its icon-only rail.
const COLLAPSED_WIDTH = 48

// Default expanded width on first use (before the user has dragged it).
const DEFAULT_WIDTH = 220

// Lower and upper bounds for drag resize, matching the spec.
const MIN_WIDTH = 160
const MAX_WIDTH = 320

interface Props {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (id: string) => void
  onEditProject: (id: string) => void
  onShareProject: (id: string) => void
  onToggleSettings: () => void
}

export function Sidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onEditProject,
  onShareProject,
  onToggleSettings,
}: Props) {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(
    'kanban_sidebar_collapsed',
    false,
  )
  const [width, setWidth] = useLocalStorage<number>(
    'kanban_sidebar_width',
    DEFAULT_WIDTH,
  )

  // Ref-not-state: we do not need the drag lifecycle to re-render this
  // component on every mouse move — only `width` updates through
  // `setWidth` matter for layout.
  const dragging = useRef(false)

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return
      e.preventDefault()
      dragging.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [collapsed],
  )

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
      setWidth(next)
    }
    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [setWidth])

  // Owned projects keep the existing per-group structure. Shared
  // projects are listed as a single flat section under a "Shared
  // with me" heading — they typically come from different owners
  // with their own group taxonomies, so blending them into the
  // owner's groups would be confusing.
  const ownedProjects = useMemo(
    () => projects.filter((p) => p.isOwner === true),
    [projects],
  )
  const sharedProjects = useMemo(
    () =>
      projects
        .filter((p) => p.isOwner !== true)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [projects],
  )
  const grouped = useMemo(() => groupProjects(ownedProjects), [ownedProjects])

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col bg-[var(--kb-sidebar-bg)] text-[var(--kb-sidebar-text)]"
      style={{ width: effectiveWidth }}
    >
      {/* Collapse toggle straddling the right edge. The button's
          ring is the only chrome that lives ON the sidebar's right
          edge, so its border color is what reads as the "seam"
          between the sidebar and the board behind it. Drives the
          border off `--kb-card-border` rather than a hardcoded
          `white/10` so the seam follows the active theme — themes
          like amber / rose with strong color-cast surfaces no
          longer show a stale white-tinted ring. */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--kb-card-border)] bg-[var(--kb-sidebar-bg)] text-white/70 shadow hover:text-white"
      >
        <Chevron direction={collapsed ? 'right' : 'left'} />
      </button>

      {/* Logo / wordmark. Wordmark hides when collapsed. */}
      <div className="flex h-14 items-center px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-600 text-sm font-bold text-white">
          K
        </div>
        {!collapsed && (
          <span className="ml-2.5 text-sm font-semibold tracking-tight">
            Kanban
          </span>
        )}
      </div>

      {/* Project list. Scrolls independently if there are many projects.
          Owned and shared sections are stacked, separated by a small
          gap. Either section is hidden when empty. */}
      <nav className="kb-scroll flex-1 overflow-y-auto px-2 pb-2">
        {ownedProjects.length === 0 && sharedProjects.length === 0 ? (
          !collapsed && (
            <div className="px-2 py-6 text-xs text-white/50">
              No projects yet. Create one from the Settings menu, or
              wait for someone to share a board with you.
            </div>
          )
        ) : (
          <div className="space-y-5">
            {/* Owned (grouped) */}
            {grouped.length > 0 && (
              <div className="space-y-4">
                {grouped.map(([group, list]) => (
                  <div key={group ?? '__none__'}>
                    {!collapsed && (
                      <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        {groupLabel(group)}
                      </div>
                    )}
                    <div
                      className={
                        collapsed ? 'space-y-1 py-1' : 'space-y-0.5'
                      }
                    >
                      {list.map((p) => (
                        <ProjectItem
                          key={p.id}
                          project={p}
                          active={p.id === activeProjectId}
                          collapsed={collapsed}
                          onSelect={() => onSelectProject(p.id)}
                          onEdit={() => onEditProject(p.id)}
                          onShare={() => onShareProject(p.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Shared with me */}
            {sharedProjects.length > 0 && (
              <div>
                {!collapsed && (
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Shared with me
                  </div>
                )}
                <div className={collapsed ? 'space-y-1 py-1' : 'space-y-0.5'}>
                  {sharedProjects.map((p) => (
                    <ProjectItem
                      key={p.id}
                      project={p}
                      active={p.id === activeProjectId}
                      collapsed={collapsed}
                      // Shared projects expose no kebab menu —
                      // members cannot edit, delete, or share. The
                      // ProjectItem component branches on
                      // `project.isOwner` to decide whether to
                      // render the kebab; the handlers we pass
                      // here are never invoked for shared rows.
                      onSelect={() => onSelectProject(p.id)}
                      onEdit={() => onEditProject(p.id)}
                      onShare={() => onShareProject(p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Settings & more. Fires the toggle callback; the popover itself
          is mounted by App.tsx so it can overlay the whole viewport. */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onToggleSettings}
          title="Settings & more"
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white ${
            collapsed ? 'w-8 justify-center' : 'w-full'
          }`}
        >
          <GearIcon />
          {!collapsed && <span>Settings &amp; more</span>}
        </button>
      </div>

      {/* Resize handle — only meaningful when expanded. */}
      {!collapsed && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-white/10"
          aria-hidden
        />
      )}
    </aside>
  )
}

/**
 * Bucket projects by group and return a stable-order list of
 * `[groupKey, projects[]]` pairs. Group names sort alphabetically; the
 * bucket of projects with no group is always placed last, under an "Other"
 * heading. Input order of `projects` is preserved within each group.
 */
function groupProjects(projects: Project[]): [ProjectGroup, Project[]][] {
  const buckets = new Map<string, Project[]>()
  for (const p of projects) {
    const key = p.group ?? '__none__'
    const arr = buckets.get(key) ?? []
    arr.push(p)
    buckets.set(key, arr)
  }

  const named: string[] = []
  let hasNone = false
  for (const k of buckets.keys()) {
    if (k === '__none__') hasNone = true
    else named.push(k)
  }
  named.sort((a, b) => a.localeCompare(b))

  const order: string[] = [...named]
  if (hasNone) order.push('__none__')

  return order.map((k) => [k === '__none__' ? null : k, buckets.get(k)!])
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-3 w-3 transition-transform ${
        direction === 'right' ? 'rotate-180' : ''
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="12 6 8 10 12 14" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}
