import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getServerSession } from "next-auth";
import {authOptions} from '@/app/api/auth/[...nextauth]/route'
import { ApplicationStatus } from '@/lib/generated/prisma/enums';

const VALID_STATUSES = new Set(Object.values(ApplicationStatus))

const jobSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  status: z.enum(['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED']),
  link: z.string().optional(),
  salary: z.string().optional(),
  notes: z.string().optional(),
  requirements: z.array(z.string()).optional()
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user.id){
    return NextResponse.json(
      {error: 'Unauthorized'},
      {status: 401}
    )
  }

  const body = await req.json()
  const parsed = jobSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // A wishlist job hasn't been applied for yet, so it gets no applied date.
  const appliedAt = parsed.data.status === 'WISHLIST' ? null : new Date()

  const job = await prisma.jobApplication.create({
    data: { ...parsed.data, appliedAt, userId: session.user.id },
  })

  return NextResponse.json(job, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if(!session?.user.id){
    return NextResponse.json(
      {error: 'Unauthorized'},
      {status: 401}
    )
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  if (status && !VALID_STATUSES.has(status as ApplicationStatus)){
    return NextResponse.json({error: 'Invalid status'}, {status: 400})
  }

  const jobs = await prisma.jobApplication.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as ApplicationStatus } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(jobs)
}