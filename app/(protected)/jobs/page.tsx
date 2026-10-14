import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import JobList from "@/components/JobList";
import JobDetail from "@/components/JobDetail";
import { Prisma } from "@/lib/generated/prisma/client";
import { ApplicationStatus } from "@/lib/generated/prisma/enums";
import { STATUS_ORDER } from "@/lib/job-status";

const VALID_STATUSES = new Set(Object.values(ApplicationStatus));

// A repeated key (?job=a&job=b) arrives as an array. Only a single plain value is meaningful;
// anything else is treated as absent instead of reaching Prisma and causing a 500.
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[]; status?: string | string[]; job?: string | string[] }>
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user.id) {
    redirect("/login");
  }

  const { search: rawSearch, status: rawStatus, job: rawJob } = await searchParams;
  const search = single(rawSearch);
  const status = single(rawStatus);
  const job = single(rawJob);
  const validStatus = status && VALID_STATUSES.has(status as ApplicationStatus) ? (status as ApplicationStatus) : undefined;

  const where: Prisma.JobApplicationWhereInput = {
    userId: session.user.id,
    ...(search ? { company: { contains: search, mode: "insensitive" } } : {}),
    ...(validStatus ? { status: validStatus } : {}),
  };

  // The list only needs what a row shows. Contacts and documents load for the selected job only.
  const jobs = await prisma.jobApplication.findMany({
    where,
    select: { id: true, company: true, role: true, status: true, salary: true },
    orderBy: { createdAt: "desc" },
  });

  // With no ?job, select the top row on screen. The list is grouped by STATUS_ORDER,
  // so that is the first job in status order, not jobs[0] (the newest).
  const selectedId =
    job ?? STATUS_ORDER.flatMap((s) => jobs.filter((j) => j.status === s))[0]?.id;

  // Loaded separately because ?job may point at a job the current filters hide.
  // userId keeps another user's id from loading their job.
  const selected = selectedId
    ? await prisma.jobApplication.findUnique({
        where: { id: selectedId, userId: session.user.id },
        include: { contacts: true, documents: true },
      })
    : null;

  // The match panel needs to know whether a resume exists and when it last changed. Only loaded
  // when a job is open. Selecting `resume` pulls up to 15k characters just to test for null;
  // Prisma can't select "is not null" on its own, and one row of text is cheap here.
  const resumeInfo = selected
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { resume: true, resumeUpdatedAt: true },
      })
    : null;
  const resume = {
    hasResume: Boolean(resumeInfo?.resume),
    updatedAt: resumeInfo?.resumeUpdatedAt ?? null,
  };

  // "Back to jobs" on a phone: same filters, no ?job.
  const backParams = new URLSearchParams();
  if (search) backParams.set("search", search);
  if (validStatus) backParams.set("status", validStatus);
  const backHref = backParams.size ? `/jobs?${backParams.toString()}` : "/jobs";

  // A phone has room for one pane: the list without ?job, the detail with it.
  const hasJobParam = Boolean(job);

  return (
    <div>
      {/* Title left, search right, on one row. No box around the panes below: they sit
          straight on the page background, under the top bar. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 pt-5 pb-3">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Job Applications</h1>
        <SearchBar />
      </div>

      {/* From md up the panes have a fixed height (the window minus the top bar and title row),
          so the list's open group can fill the space between the group headers, and each pane
          scrolls on its own. */}
      <div className="flex min-h-[60vh] md:h-[calc(100vh-8rem)] md:min-h-[28rem]">
        {/* The list/detail divider is drawn by ::after rather than border-r, so it can fade in
            from transparent at the top instead of touching the title row. */}
        <div
          className={`relative w-full md:w-88 shrink-0 md:h-full md:after:absolute md:after:inset-y-0 md:after:right-0 md:after:w-px md:after:bg-[linear-gradient(to_bottom,transparent,var(--divider)_48px)] ${
            hasJobParam ? "hidden md:block" : ""
          }`}
        >
          <JobList jobs={jobs} selectedId={selected?.id} search={search} status={validStatus} />
        </div>

        <div className={`flex-1 min-w-0 md:h-full md:overflow-y-auto ${hasJobParam ? "" : "hidden md:block"}`}>
          {selected ? (
            <JobDetail job={selected} backHref={backHref} resume={resume} />
          ) : (
            <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
              {selectedId ? "Job not found." : "Add an application to see its details here."}
              {/* On a phone the list is hidden while ?job is set, so this is the only way back. */}
              {hasJobParam && (
                <Link
                  href={backHref}
                  className="md:hidden inline-flex items-center gap-1.5 text-foreground hover:underline"
                >
                  <ArrowLeft className="size-4" />
                  Back to jobs
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
