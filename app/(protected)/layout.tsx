import type { Metadata } from "next";
import TopBar from "@/components/ui/TopBar";
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
      <main className="flex-1 bg-background overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
