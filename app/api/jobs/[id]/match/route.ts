import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isRecordNotFound } from '@/lib/prisma-errors'

// POST /api/jobs/[id]/match
// No request body: everything comes from the database. The job gives `role` and
// `requirements`, the user gives `resume`. FastAPI judges each requirement, and the result is
// saved onto the job's match* columns.
//
// This path is inside proxy.ts's matcher, so an expired session gets a 307 to /login, not
// this route's 401. The client must read the response with messageFromResponse (lib/api-error.ts).

// FastAPI's MatchRequest limits (backend/schemas.py, MatchRequest). Keep these in step with it.
const MAX_REQUIREMENTS = 30
const MAX_REQUIREMENT_LENGTH = 500

// Matching makes one Gemini call with a longer reply than /extract (a reason per requirement),
// so it gets more time than extract's 30s.
const MATCH_TIMEOUT_MS = 60_000

// Mirrors FastAPI's MatchResponse. FastAPI already validates Gemini's reply, so this check guards
// the contract between our two services: if either side changes shape, it fails here as a 502
// instead of saving a broken row.
const verdictSchema = z.object({
    requirement: z.string(),
    verdict: z.enum(['met', 'partial', 'missing']),
    reason: z.string(),
})

const matchResponseSchema = z.object({
    verdicts: z.array(verdictSchema).min(1),
    summary: z.string(),
    score: z.int().min(0).max(100),
})

export type MatchVerdict = z.infer<typeof verdictSchema>

type BackendError = { detail?: unknown }

// Turns a job's saved requirements into the list FastAPI accepts, or returns an error message
// for the user. FastAPI rejects blank items, items over 500 chars, and lists over 30 with a 422,
// which would otherwise reach the user as a generic 502.
function prepareRequirements(requirements: string[]): { ok: true; value: string[] } | { ok: false; error: string } {
    // Fit rather than reject: blanks are dropped, long items are cut to the length cap,
    // and only the first MAX_REQUIREMENTS are kept. Fails only when nothing is left,
    // which is also how jobs saved before requirements existed are caught.
    const cleanedReqs = requirements.map((r) => r.trim()).filter((r) => {if (r != "") return r})
    
    const acceptedReqs = cleanedReqs.map((r) => r.slice(0, MAX_REQUIREMENT_LENGTH)).slice(0, MAX_REQUIREMENTS)

    if (acceptedReqs.length === 0){
        return { ok: false, error: "This job has no requirements. Add some before checking the match."}
    }

    return {ok: true, value: acceptedReqs}
}

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const session = await getServerSession(authOptions)

    if (!session?.user.id){
        return NextResponse.json(
            {error: "Unauthorized."},
            {status: 401}
        )
    }

    const {id} = await params 

    const job = await prisma.jobApplication.findFirst({
        where: {
            id,
            userId: session.user.id
        },
        select: {
            role: true,
            requirements: true
        }
    })

    if (!job){
        return NextResponse.json(
            {error: "Job not found."},
            {status: 404}
        )
    }

    // The resume and requirements checks run before FastAPI, so a request that can't succeed
    // costs no Gemini call.
    const user = await prisma.user.findUnique({
        where: {
            id: session.user.id
        },
        select: {resume: true}
    })

    if (!user?.resume){
        return NextResponse.json(
            {error: "Add your resume in the profile page first."},
            {status: 400}
        )
    }

    const reqs = prepareRequirements(job.requirements)

    if (!reqs.ok) {
        return NextResponse.json(
            {error: reqs.error},
            {status: 400}
        )
    }
    
    let backendRes: Response;

    try{
        backendRes = await fetch(`${process.env.BACKEND_URL}/match`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({resume: user.resume, role: job.role, requirements: reqs.value}),
            signal: AbortSignal.timeout(MATCH_TIMEOUT_MS)
        })
    } catch(err){
        if (err instanceof Error && err.name === "TimeoutError"){
            return NextResponse.json(
                {error: "The matching took too long. Try again."},
                {status: 504}
            )
        }

        return NextResponse.json(
            {error: "Matching failed. Try again."},
            {status: 502}
        )
    }
    
    if (!backendRes.ok){
        const data: BackendError | null = await backendRes.json().catch(() => null)

        if (typeof data?.detail === "string"){
            return NextResponse.json(
                {error: data.detail},
                {status: backendRes.status}
            )
        }

        return NextResponse.json(
            {error: "Matching failed. Try again later."},
            {status: 502}
        )
    }

    const responseParsed = matchResponseSchema.safeParse(await backendRes.json().catch(() => null))

    if (!responseParsed.success){
        console.error("Bad /match reply: ", responseParsed.error.flatten())
        return NextResponse.json(
            {error: "Matching failed. Try again."},
            {status: 502}
        )
    }

    try{
        const updateMatch = await prisma.jobApplication.update({
            where: {
                id,
                userId: session.user.id
            },
            data: {
                matchScore: responseParsed.data.score,
                matchVerdicts: responseParsed.data.verdicts,
                matchSummary: responseParsed.data.summary,
                matchedAt: new Date()
            },
            select: {
                matchScore: true,
                matchVerdicts: true,
                matchSummary: true,
                matchedAt: true
            }
        })

        return NextResponse.json(updateMatch)
    } catch (err){
        if (isRecordNotFound(err)){
            return NextResponse.json(
                {error: "Job not found."},
                {status: 404}
            )
        }

        throw err
    }
}
