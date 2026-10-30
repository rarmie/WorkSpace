import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isRecordNotFound } from '@/lib/prisma-errors'
import { RESUME_LENGTH } from '@/lib/resume'
import { Seniority, WorkArrangement } from '@/lib/generated/prisma/enums'
import { ATTRIBUTE_LIMITS, COUNTRY_CODES, REGION_CODES } from '@/lib/profile-attributes'

// Mirrors resumeSchema in components/ResumeForm.tsx and attributesSchema in
// components/AttributesForm.tsx. They are separate definitions, so a change to one needs the
// others. trim() runs before the length checks, like FastAPI's mode="before" validator on
// MatchRequest.resume.
//
// Two forms share this route, so every field is optional: ResumeForm sends only `resume`, and
// AttributesForm sends all six attributes. A body with neither is rejected below.
const profileSchema = z
  .object({
    resume: z
      .string()
      .trim()
      .min(RESUME_LENGTH.min, `Resume must be at least ${RESUME_LENGTH.min} characters`)
      .max(RESUME_LENGTH.max, `Resume must be at most ${RESUME_LENGTH.max} characters`)
      .optional(),
    targetRoles: z
      .array(z.string().trim().min(1).max(ATTRIBUTE_LIMITS.roleLength))
      .max(ATTRIBUTE_LIMITS.roles)
      .optional(),
    // null clears it ("no preference").
    country: z.enum(COUNTRY_CODES).nullable().optional(),
    workArrangements: z.array(z.enum(WorkArrangement)).optional(),
    remoteRegions: z.array(z.enum(REGION_CODES)).optional(),
    seniority: z.enum(Seniority).nullable().optional(),
    skills: z
      .array(z.string().trim().min(1).max(ATTRIBUTE_LIMITS.skillLength))
      .max(ATTRIBUTE_LIMITS.skills)
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Send a resume or profile attributes.',
  })

const ATTRIBUTE_KEYS = ['targetRoles', 'country', 'workArrangements', 'remoteRegions', 'seniority', 'skills'] as const

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

  // Each timestamp moves only when its own group was sent, so saving attributes never makes the
  // resume look newer (and the "resume changed since these were saved" hint stays honest).
  const now = new Date()
  const hasAttributes = ATTRIBUTE_KEYS.some((key) => parsed.data[key] !== undefined)

  try{
    const updated = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        ...parsed.data,
        ...(parsed.data.resume !== undefined ? { resumeUpdatedAt: now } : {}),
        ...(hasAttributes ? { attributesUpdatedAt: now } : {}),
      },
      select: {resumeUpdatedAt: true, attributesUpdatedAt: true}
    })

    return NextResponse.json(updated)
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
