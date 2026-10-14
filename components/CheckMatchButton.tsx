'use client'
import { Button } from '@/components/ui/button'
import { useMatchRunner } from '@/components/MatchRunner'

// "Check match" / "Re-check". Rendered inside JobMatchPanel's server markup, and wired to the
// nearest MatchRunner through context.
export default function CheckMatchButton({
  label,
  variant = 'default',
  disabled = false,
}: {
  label: string
  variant?: 'default' | 'outline'
  disabled?: boolean
}) {
  const { run, isChecking } = useMatchRunner()

  return (
    <Button type="button" variant={variant} onClick={run} disabled={disabled || isChecking}>
      {label}
    </Button>
  )
}
