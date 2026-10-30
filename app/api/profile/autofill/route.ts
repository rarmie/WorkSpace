import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// POST /api/profile/autofill
// No request body: the resume comes from the database. FastAPI reads it and suggests the six
// profile attributes. The result is returned WITHOUT saving, so the user can review it in the
// form and press Save.
//
// Outside proxy.ts's matcher like /api/profile, so an expired session gets the JSON 401 below.

// FastAPI's own timeout for this call is 45s (backend/profile_attributes.py). This one is
// longer so FastAPI's 504 arrives first, with its message, instead of ours.
const AUTOFILL_TIMEOUT_MS = 60_000

// Mirrors FastAPI's ProfileAttributes. Every field is nullable: null means the resume didn't say.
// FastAPI already drops codes that aren't on the lists, so strings are enough here.
const autofillSchema = z.object({
  targetRoles: z.array(z.string()).nullable(),
  country: z.string().nullable(),
  workArrangements: z.array(z.string()).nullable(),
  remoteRegions: z.array(z.string()).nullable(),
  seniority: z.string().nullable(),
  skills: z.array(z.string()).nullable(),
})

type BackendError = { detail?: unknown }

export async function POST(): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { resume: true },
  })

  // Checked before FastAPI, so a request that can't succeed costs no model call.
  if (!user?.resume) {
    return NextResponse.json({ error: 'Save your resume first.' }, { status: 400 })
  }

  let backendRes: Response

  try {
    backendRes = await fetch(`${process.env.BACKEND_URL}/profile-attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume: user.resume }),
      signal: AbortSignal.timeout(AUTOFILL_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Reading your resume took too long. Try again.' }, { status: 504 })
    }

    return NextResponse.json({ error: 'Autofill failed. Try again.' }, { status: 502 })
  }

  if (!backendRes.ok) {
    const data: BackendError | null = await backendRes.json().catch(() => null)

    // A string detail is a message meant for the user. Anything else (FastAPI's list of schema
    // errors, for example) is a bug on our side, so show a generic message instead.
    if (typeof data?.detail === 'string') {
      return NextResponse.json({ error: data.detail }, { status: backendRes.status })
    }

    return NextResponse.json({ error: 'Autofill failed. Try again later.' }, { status: 502 })
  }

  const parsed = autofillSchema.safeParse(await backendRes.json().catch(() => null))

  if (!parsed.success) {
    console.error('Bad /profile-attributes reply: ', parsed.error.flatten())
    return NextResponse.json({ error: 'Autofill failed. Try again.' }, { status: 502 })
  }

  return NextResponse.json(parsed.data)
}
