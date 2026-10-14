// Turns a fetch Response from our /api routes into an error message, or null on success.
//
// The 307 trap: proxy.ts answers an unauthenticated /api/jobs request with a redirect to
// /login, not a JSON 401. fetch follows it, so the client sees status 200 and res.ok === true
// with the login page's HTML. res.redirected is the reliable sign of an expired session.
export async function messageFromResponse(res: Response): Promise<string | null> {
  if (res.redirected) return 'Your session expired. Please sign in again.'
  if (res.ok) return null

  const data = await res.json().catch(() => null)
  const error: unknown = data?.error

  if (typeof error === 'string') return error

  // Zod 400s arrive as { error: parsed.error.flatten() }: { formErrors, fieldErrors }.
  if (error && typeof error === 'object') {
    const { formErrors, fieldErrors } = error as {
      formErrors?: string[]
      fieldErrors?: Record<string, string[] | undefined>
    }
    if (formErrors?.[0]) return formErrors[0]
    const [field, messages] = Object.entries(fieldErrors ?? {}).find(([, m]) => m?.length) ?? []
    if (field && messages) return `${field}: ${messages[0]}`
  }

  return 'Something went wrong. Please try again.'
}
