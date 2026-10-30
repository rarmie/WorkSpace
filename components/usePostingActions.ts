'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { messageFromResponse } from '@/lib/api-error'

// Save, Dismiss and Undo for one discovered posting: the fetch calls, the error handling and the
// "Dismissed · Undo" toast. Shared by the cards and rows (PostingItem) and by the details page
// (PostingDetailActions), which differ only in what happens on screen afterwards. Each of them
// says that in the three callbacks.
export function usePostingActions({
  postingId,
  label,
  onSaved,
  onDismissed,
  onUndone,
}: {
  postingId: string
  label: string // "CTE PH, Software Engineer", shown in the toast
  onSaved: (jobId: string) => void
  onDismissed: () => void
  onUndone: () => void
}): {
  busy: boolean
  error: string | null
  save: () => Promise<void>
  dismiss: () => Promise<void>
  undo: () => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(`/api/discover/${postingId}/save`, { method: 'POST' })
      const message = await messageFromResponse(res)

      if (message) {
        setError(message)
        return
      }

      const job: { id: string } = await res.json()
      onSaved(job.id)
    } catch (err) {
      console.error('Save posting failed.', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const undo = async (): Promise<void> => {
    try {
      const res = await fetch(`/api/discover/${postingId}/dismiss`, { method: 'DELETE' })
      const message = await messageFromResponse(res)

      if (message) {
        toast.error(message)
        return
      }

      onUndone()
    } catch (err) {
      console.error('Undo dismiss failed.', err)
      toast.error('Could not undo. Please try again.')
    }
  }

  const dismiss = async (): Promise<void> => {
    setBusy(true)
    setError(null)

    try {
      const res = await fetch(`/api/discover/${postingId}/dismiss`, { method: 'POST' })
      const message = await messageFromResponse(res)

      if (message) {
        setError(message)
        return
      }

      onDismissed()
      toast(`Dismissed · ${label}`, {
        duration: 6000,
        action: { label: 'Undo', onClick: undo },
      })
    } catch (err) {
      console.error('Dismiss posting failed.', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, save, dismiss, undo }
}
