import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { RESUME_LENGTH } from '@/lib/resume'

// Mirrors resumeSchema in components/ResumeForm.tsx. The two are separate definitions, so a
// change to one needs the other. trim() runs before the length checks, like FastAPI's
// mode="before" validator on MatchRequest.resume.
const profileSchema = z.object({
  resume: z
    .string()
    .trim()
    .min(RESUME_LENGTH.min, `Resume must be at least ${RESUME_LENGTH.min} characters`)
    .max(RESUME_LENGTH.max, `Resume must be at most ${RESUME_LENGTH.max} characters`),
})

function isRecordNotFound(err: unknown): boolean{
  return(
    typeof err === 'object' && 
    err !== null && 'code' in err &&
    (err as {code?: unknown}).code === 'P2025'
  )
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {

  const session = await getServerSession(authOptions)

  if (!session?.user.id){
    return NextResponse.json(
      {error: "Unauthorized"},
      {status: 401}
    )
  }

  const body = await req.json().catch(() => null)

  if (body === null){
    return NextResponse.json(
      {error: "Invalid JSON."},
      {status: 400}
    )
  }

  const parsed = profileSchema.safeParse(body)

  if (!parsed.success){
    return NextResponse.json(
      {error: parsed.error.flatten()},
      {status: 400}
    )
  }

  try{
    const resumeUpdate = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        ...parsed.data,
        resumeUpdatedAt: new Date()
      },
      select: {resumeUpdatedAt: true}
    })

    return NextResponse.json(resumeUpdate)
  } catch(err) {
    if (isRecordNotFound(err)){
      return NextResponse.json(
        {error: "User not found."},
        {status: 404}
      )
    }

    throw err
  }
}
