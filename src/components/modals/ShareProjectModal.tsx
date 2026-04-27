// ---------------------------------------------------------------------------
// ShareProjectModal
//
// Owner-only dialog reachable from the sidebar project kebab menu.
// Shows the current member list and lets the owner invite new members
// by email + copy the generated invite link.
//
// Layout:
//   - Title: "Share <project name>"
//   - Members list (each row: avatar initial + email + role / status
//     badge + Remove button; the owner has no Remove)
//   - Invite section: email input + Invite button
//   - After inviting: shows the generated link in a read-only input
//     with a Copy button so the owner can paste the URL into their
//     preferred messenger / mail client
//
// Members ARE shown as soon as they are invited (status='pending').
// They become 'active' once they open the link and sign in.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { inviteMember, removeMember } from '../../lib/firestore'
import { generateInviteLink } from '../../lib/inviteUtils'
import { useToast } from '../toast/ToastProvider'
import type { Project, ProjectMember } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  project: Project | null
  // Uid of the owner — used to record `invitedBy` on each new
  // membership.
  invitedByUid: string
}

export function ShareProjectModal({
  open,
  onClose,
  project,
  invitedByUid,
}: Props) {
  const [emailInput, setEmailInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  // Most recently generated invite link, shown in a read-only input
  // with a Copy button. Cleared whenever the dialog reopens.
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copyConfirm, setCopyConfirm] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setEmailInput('')
    setLocalError(null)
    setGeneratedLink(null)
    setCopyConfirm(false)
    setSubmitting(false)
  }, [open])

  if (!project) return null

  // Member entries presented in a stable order: owner first, then
  // alphabetical by email.
  const memberRows = sortMembers(project.members)

  async function handleInvite() {
    if (!project) return
    setLocalError(null)
    const trimmed = emailInput.trim().toLowerCase()
    if (!trimmed) {
      setLocalError('Enter an email address.')
      return
    }
    if (!isValidEmail(trimmed)) {
      setLocalError('That does not look like a valid email.')
      return
    }
    if (project.members[trimmed]) {
      setLocalError('That person is already a member.')
      return
    }

    setSubmitting(true)
    try {
      await inviteMember(project.id, trimmed, invitedByUid)
      // Generate the link. We do this AFTER the write so the link
      // only ever surfaces for an actually-invited email.
      setGeneratedLink(generateInviteLink(project.id))
      setEmailInput('')
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not send invite.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(email: string) {
    if (!project) return
    try {
      await removeMember(project.id, email)
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : 'Could not remove member.',
        'error',
      )
    }
  }

  async function handleCopyLink() {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopyConfirm(true)
      window.setTimeout(() => setCopyConfirm(false), 1500)
    } catch {
      toast.push('Could not copy link to clipboard.', 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share "${project.title}"`}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
        >
          Close
        </button>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Members list */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--kb-text-muted)]">
            People with access
          </h3>
          <ul className="space-y-1.5">
            {memberRows.map(({ email, member }) => (
              <li
                key={email}
                className="flex items-center gap-3 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-2"
              >
                <Avatar email={email} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--kb-text-primary)]">
                    {email}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <RoleBadge role={member.role} />
                    {member.status === 'pending' && <PendingBadge />}
                  </div>
                </div>
                {member.role !== 'owner' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(email)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Invite section */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--kb-text-muted)]">
            Invite by email
          </h3>
          <div className="flex gap-2">
            <input
              type="email"
              autoComplete="off"
              placeholder="user@example.com"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value)
                setLocalError(null)
                setGeneratedLink(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleInvite()
                }
              }}
              className="flex-1 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-3 py-1.5 text-sm text-[var(--kb-text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <button
              type="button"
              onClick={() => void handleInvite()}
              disabled={submitting}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
            >
              {submitting ? 'Inviting…' : 'Invite'}
            </button>
          </div>

          {localError && (
            <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {localError}
            </div>
          )}

          {/* Generated link surface — appears only after a successful
              invite. The owner copies it and shares via their own
              channel. */}
          {generatedLink && (
            <div className="mt-3 rounded-md border border-violet-200 bg-violet-50/60 p-3">
              <div className="mb-1.5 text-xs text-[var(--kb-text-secondary)]">
                Share this link with the invited person:
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1 text-xs text-[var(--kb-text-primary)] outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-md border border-[var(--kb-card-border)] bg-[var(--kb-card-bg)] px-2.5 py-1 text-xs font-medium text-[var(--kb-text-secondary)] hover:bg-[var(--kb-board-bg)]"
                >
                  {copyConfirm ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// Avatar showing the email's first letter on a colored disc. The
// color is hashed off the email so the same person renders the same
// way every time without any server-side avatar storage.
function Avatar({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase()
  const hue = hashHue(email)
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue}deg 55% 50%)` }}
      aria-hidden
    >
      {initial}
    </span>
  )
}

function RoleBadge({ role }: { role: ProjectMember['role'] }) {
  const label = role === 'owner' ? 'Owner' : 'Member'
  const color =
    role === 'owner'
      ? 'bg-violet-100 text-violet-700'
      : 'bg-slate-100 text-slate-700'
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
    >
      {label}
    </span>
  )
}

function PendingBadge() {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700">
      Pending
    </span>
  )
}

// ---------- helpers ----------

function sortMembers(
  members: Record<string, ProjectMember>,
): { email: string; member: ProjectMember }[] {
  const entries = Object.entries(members).map(([email, member]) => ({
    email,
    member,
  }))
  entries.sort((a, b) => {
    // Owner always first.
    if (a.member.role === 'owner' && b.member.role !== 'owner') return -1
    if (b.member.role === 'owner' && a.member.role !== 'owner') return 1
    return a.email.localeCompare(b.email)
  })
  return entries
}

function isValidEmail(s: string): boolean {
  // Permissive check — we are not doing deliverability validation,
  // just catching obvious typos like missing "@" or whitespace.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// djb2-style hash so the avatar color is stable across sessions for
// the same email. Returns a hue in 0..360.
function hashHue(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 360
}
