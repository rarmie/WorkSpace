import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isRecordNotFound } from '@/lib/prisma-errors'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import {authOptions} from '@/app/api/auth/[...nextauth]/route'

const emptyToNull = (v: string | null | undefined) => (v === ''? null:v)

const updateSchema = z.object({
  company: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  status: z.enum(['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED']).optional(),
  link: z.union([z.url(), z.literal('')]).optional().transform(emptyToNull),
  salary: z.string().optional().transform(emptyToNull),
  notes: z.string().optional().transform(emptyToNull),
  appliedAt: z.coerce.date().optional(),
  requirements: z.array(z.string()).optional()
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const {id} = await params

  if (!session?.user.id){
    return NextResponse.json(
      {error: 'Unauthorized'},
      {status: 401}
    )
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const job = await prisma.jobApplication.update({
    where: { 
      id: id,
      userId: session.user.id
     },
    data: parsed.data,
    })

    return NextResponse.json(job)
  } catch (err) {
    if (isRecordNotFound(err)){
      return NextResponse.json({error: "Job not found"}, {status: 404})
    }

    throw err
  }
  

  
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const {id} = await params

  if (!session?.user.id){
    return NextResponse.json(
      {error: 'Unauthorized'},
      {status: 401}
    )
  }

  try {
    await prisma.jobApplication.delete({
      where: { 
        id: id,
        userId: session.user.id 
      },
    })

    return NextResponse.json({ message: 'Job deleted successfully' })
  } catch (err) {
    if (isRecordNotFound(err)){
      return NextResponse.json({error: "Job not found"}, {status: 404})
    }

    throw err
  }
}