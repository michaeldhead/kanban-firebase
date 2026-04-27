// ---------------------------------------------------------------------------
// ProjectItem
//
// A single row in the sidebar's project list. Two visual modes:
//
//  - Collapsed: just the group-colored dot centered in a small tappable
//    area. The project title becomes a native tooltip via `title` so
//    users can still identify projects in the narrow rail.
//
//  - Expanded: the dot plus the project title. The active project shows
//    a subtle accent bar on the right edge so the current selection is
//    obvious even without reading the text.
//
// Editing affordances (expanded mode only, AND only on projects the
// current user owns):
//  - A kebab (···) button shown on hover or when the row is active.
//    Click opens a tiny popover with "Edit project" and "Share". Right-
//    clicking the row also opens the popover at the cursor — standard
//    desktop context-menu gesture.
//
// For SHARED projects (isOwner === false), the row has no kebab and no
// context menu. Members can switch to the project but cannot rename,
// delete, or share it.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../types'
import { groupColor } from './groupColor'

interface Props {
  project: Project
  active: boolean
  collapsed: boolean
  onSelect: () => void
  onEdit: () => void
  onShare: () => void
}

export function ProjectItem({
  project,
  active,
  collapsed,
  onSelect,
  onEdit,
  onShare,
}: Props) {
  const color = groupColor(project.group)
  const isOwner = project.isOwner === true
  const [menuOpen, setMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)

  // Outside-click + Escape dismiss for the kebab popover. The same
  // pattern used by SettingsPopover — delay attaching the
  // pointerdown handler so the click that opened the menu does not
  // immediately close it.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (target && rowRef.current && !rowRef.current.contains(target)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
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
  }, [menuOpen])

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        onContextMenu={(e) => {
          // Right-click context menu only on owned projects.
          if (!isOwner) return
          e.preventDefault()
          onEdit()
        }}
        title={project.title}
        className={`group relative mx-auto flex h-8 w-8 items-center justify-center rounded-md transition ${
          active ? 'bg-white/10' : 'hover:bg-white/5'
        }`}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        {active && (
          <span className="absolute right-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--kb-sidebar-accent)]" />
        )}
      </button>
    )
  }

  return (
    <div
      ref={rowRef}
      onContextMenu={(e) => {
        if (!isOwner) return
        e.preventDefault()
        setMenuOpen(true)
      }}
      className={`group relative flex items-center rounded-md transition ${
        active
          ? 'bg-white/10 text-white'
          : 'text-white/75 hover:bg-white/5 hover:text-white'
      }`}
    >
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left text-sm"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="truncate">{project.title}</span>
      </button>

      {/* Kebab — owner only. Hidden visually with opacity rather than
          display so it stays keyboard-focusable. */}
      {isOwner && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          title="Project options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`mr-1 flex h-6 w-6 items-center justify-center rounded transition focus:opacity-100 ${
            active || menuOpen
              ? 'opacity-70 hover:opacity-100'
              : 'opacity-0 group-hover:opacity-70 hover:!opacity-100'
          } hover:bg-white/10`}
        >
          <KebabIcon />
        </button>
      )}

      {/* Inline kebab menu — Edit / Share. Owner only. Positioned
          absolutely so it floats above siblings without affecting the
          row's layout height. */}
      {isOwner && menuOpen && (
        <div
          className="absolute right-1 top-full z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-xl"
          role="menu"
        >
          <MenuItem
            onClick={() => {
              setMenuOpen(false)
              onEdit()
            }}
          >
            Edit project
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuOpen(false)
              onShare()
            }}
          >
            Share…
          </MenuItem>
        </div>
      )}

      {active && (
        <span className="absolute right-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--kb-sidebar-accent)]" />
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  )
}

function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}
