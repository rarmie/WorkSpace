import type { Metadata } from "next";
import TopBar from "@/components/ui/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const metadata: Metadata = {
  title: "Shortlist - Job Tracker",
  description: "Track your job applications with ease",
};

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Only for the top bar's avatar. There is no SessionProvider, so the client TopBar can't call
  // useSession(); the user comes in as a prop instead. Each page still does its own session check.
  const session = await getServerSession(authOptions);
  const user = session?.user
    ? { name: session.user.name, email: session.user.email, image: session.user.image }
    : null;

  return (
    <div className="min-h-full w-full flex flex-col">
      <TopBar user={user} />
      {/* Under 1024px the tab bar is fixed over the bottom of the screen (components/ui/TopBar.tsx),
          so the page is padded by its height, plus the home-indicator area on a notched phone. */}
      <main className="flex-1 bg-background overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>
      {/* Shows the "Dismissed · Undo" toast from the discovery feed. */}
      {/* Lifts toasts above the tab bar while it shows (see --toast-bottom in app/globals.css).
          Sonner has a separate offset at 600px and below, so both get the same value. */}
      <Toaster offset={{ bottom: 'var(--toast-bottom)' }} mobileOffset={{ bottom: 'var(--toast-bottom)' }} />
    </div>
  )
}
