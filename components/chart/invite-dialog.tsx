'use client'

import { useState, useEffect, useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { OrganizationInvite } from '@/lib/types'

interface InviteDialogProps {
  open: boolean
  onClose: () => void
}

type ExpiresOption = '7' | '14' | '30' | 'never'

function buildInviteUrl(token: string): string {
  if (typeof window === 'undefined') return `/invite/${token}`
  return `${window.location.origin}/invite/${token}`
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiration'
  const d = new Date(expiresAt)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatUsage(invite: OrganizationInvite): string {
  const used = invite.used_count
  if (invite.max_uses === null) return `${used} used`
  return `${used} / ${invite.max_uses} used`
}

interface InviteRowProps {
  invite: OrganizationInvite
  onRevoke: (id: string) => void
  revoking: boolean
}

function InviteRow({ invite, onRevoke, revoking }: InviteRowProps) {
  const [copied, setCopied] = useState(false)
  const url = buildInviteUrl(invite.token)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write failed — no-op
    }
  }

  const isRevoked = Boolean(invite.revoked_at)

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs text-slate-600">{url}</span>
            {isRevoked ? (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Revoked
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex gap-3 text-xs text-slate-500">
            <span>{formatUsage(invite)}</span>
            <span>Expires: {formatExpiry(invite.expires_at)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {!isRevoked ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2.5 text-xs"
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRevoke(invite.id)}
                disabled={revoking}
                className="h-7 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Revoke
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function InviteDialog({ open, onClose }: InviteDialogProps) {
  const [invites, setInvites] = useState<OrganizationInvite[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Create form state
  const [maxUses, setMaxUses] = useState('')
  const [expiresOption, setExpiresOption] = useState<ExpiresOption>('never')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchInvites = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    try {
      const response = await fetch('/api/org/invites')
      const json = await response.json()

      if (!json.success) {
        setFetchError(json.error ?? 'Failed to load invites.')
        return
      }

      setInvites(json.data.invites)
    } catch {
      setFetchError('Failed to load invites.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void fetchInvites()
    }
  }, [open, fetchInvites])

  async function handleCreate() {
    setCreating(true)
    setCreateError(null)

    const body: { max_uses?: number; expires_in_days?: number } = {}

    if (maxUses.trim()) {
      const parsed = parseInt(maxUses.trim(), 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setCreateError('Max uses must be a positive number.')
        setCreating(false)
        return
      }
      body.max_uses = parsed
    }

    if (expiresOption !== 'never') {
      body.expires_in_days = parseInt(expiresOption, 10)
    }

    try {
      const response = await fetch('/api/org/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await response.json()

      if (!json.success) {
        setCreateError(json.error ?? 'Failed to create invite.')
        setCreating(false)
        return
      }

      setInvites((prev) => [json.data.invite, ...prev])
      setMaxUses('')
      setExpiresOption('never')
    } catch {
      setCreateError('Failed to create invite. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id)

    try {
      const response = await fetch(`/api/org/invites/${id}`, { method: 'DELETE' })
      const json = await response.json()

      if (!json.success) return

      setInvites((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? { ...inv, revoked_at: new Date().toISOString() }
            : inv,
        ),
      )
    } catch {
      // Revoke failed — no-op, user can retry
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Invite teammates</DialogTitle>
        <DialogDescription>
          Create a link to share with teammates. Anyone with the link can join
          your organization.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="max-uses" className="text-xs">
              Max uses (optional)
            </Label>
            <Input
              id="max-uses"
              type="number"
              min={1}
              placeholder="Unlimited"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="h-9 text-sm"
              disabled={creating}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expires" className="text-xs">
              Expiration
            </Label>
            <select
              id="expires"
              value={expiresOption}
              onChange={(e) => setExpiresOption(e.target.value as ExpiresOption)}
              disabled={creating}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus-visible:border-slate-900 focus-visible:ring-4 focus-visible:ring-slate-900/10 disabled:opacity-50"
            >
              <option value="never">No expiration</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
        </div>

        {createError ? (
          <p role="alert" className="text-xs text-red-600">
            {createError}
          </p>
        ) : null}

        <Button
          onClick={handleCreate}
          disabled={creating}
          className="w-full"
          size="sm"
        >
          {creating ? 'Creating...' : 'Create invite link'}
        </Button>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Existing links
        </h3>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : fetchError ? (
          <p className="text-sm text-red-600">{fetchError}</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-slate-500">No invite links yet.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                onRevoke={handleRevoke}
                revoking={revokingId === invite.id}
              />
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
