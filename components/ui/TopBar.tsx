"use client"
import { CircleQuestionMark, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation"
import { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import AddJobForm from "../AddFormJob";
import SendConcernForm from '@/components/ui/SendConcernsForm'
import LogoutButton from "../LogoutButton";
import ThemeToggle from "./ThemeToggle";
import UserAvatar from "../UserAvatar";

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Jobs', href: '/jobs' },
]

export type TopBarUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

export default function TopBar({ user }: { user: TopBarUser | null }) {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path

  const [isModalActive, updateModal] = useState(false);
  const [isAddJobOpen, setAddJobOpen] = useState(false)

  return (
    <header className="relative z-10 flex items-center gap-5 px-5 py-3 border-b border-divider bg-topbar shadow-[0_1px_3px_rgb(15_23_42/0.06)] dark:shadow-[0_1px_0_rgb(0_0_0/0.35)]">
      {/* The bar is the raised layer: lighter than the page in both themes, with a clear line under it. */}
      <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm">
          <svg viewBox="0 0 1024 1024" className="size-4.5 fill-primary-foreground" xmlns="http://www.w3.org/2000/svg">
            <path d="M813.7 210.3l-60.3 60.3c64.5 64.5 100 150.2 100 241.4 0 188.2-153.1 341.3-341.3 341.3S170.7 700.2 170.7 512c0-173.8 130.5-317.6 298.7-338.7v86.2C348.4 279.9 256 385.4 256 512c0 141.2 114.8 256 256 256s256-114.8 256-256c0-68.4-26.6-132.7-75-181l-60.3 60.3c32.2 32.2 50 75.1 50 120.7 0 94.1-76.5 170.7-170.7 170.7S341.3 606.1 341.3 512c0-79.4 54.5-146.3 128-165.3v91.4c-25.5 14.8-42.7 42.3-42.7 73.9 0 47.1 38.2 85.3 85.3 85.3s85.3-38.2 85.3-85.3c0-31.6-17.2-59.1-42.7-73.9V85.3h-85.3v2.1C254 108.9 85.3 291.1 85.3 512c0 235.3 191.4 426.7 426.7 426.7S938.7 747.2 938.7 512c0-113.9-44.4-221.1-125-301.7z" />
          </svg>
        </div>
        <span className="font-semibold text-sm text-foreground hidden sm:inline">WorkSpace</span>
      </Link>

      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <Dialog open={isAddJobOpen} onOpenChange={setAddJobOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" /> <span className="hidden sm:inline">Add Application</span>
          </Button>
        </DialogTrigger>
        {/* A stray click on the backdrop would throw away a half-filled form, so only
            Cancel, the X and Escape close it. */}
        <DialogContent
          className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Add application</DialogTitle>
            <DialogDescription>Fill in the details, or paste a posting to fill them for you.</DialogDescription>
          </DialogHeader>
          <AddJobForm onClose={() => setAddJobOpen(false)} />
        </DialogContent>
      </Dialog>

      <ThemeToggle />

      <Dialog open={isModalActive} onOpenChange={updateModal}>
        <DialogTrigger asChild>
          <Button variant="ghost" className="px-2.5" aria-label="Help">
            <CircleQuestionMark className="size-4" />
          </Button>
        </DialogTrigger>
        {/* Same as the job dialogs: a backdrop click won't discard a half-written message. */}
        <DialogContent
          className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Send us your concerns</DialogTitle>
            <DialogDescription>Found a bug or have a suggestion? Tell us and we&apos;ll get back to you.</DialogDescription>
          </DialogHeader>
          <SendConcernForm onClose={() => updateModal(false)} />
        </DialogContent>
      </Dialog>

      <LogoutButton />

      {/* The way into /profile. Ringed in the accent colour while on that page. */}
      {user && (
        <Link
          href="/profile"
          aria-label="Profile"
          title="Profile"
          className={`rounded-full outline-offset-2 transition-[outline-color] ${
            isActive('/profile') ? "outline-2 outline-primary" : "outline-2 outline-transparent hover:outline-border"
          }`}
        >
          <UserAvatar name={user.name} email={user.email} image={user.image} size={28} className="text-[11px]" />
        </Link>
      )}
    </header>
  )
}
