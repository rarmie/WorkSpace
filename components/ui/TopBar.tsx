"use client"
import { Briefcase, CircleQuestionMark, Compass, LayoutDashboard, Plus } from "lucide-react";
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

// The icon is for the tab bar at the bottom of a phone screen; the top bar shows only the name.
const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Discover', href: '/discover', icon: Compass },
  { name: 'Jobs', href: '/jobs', icon: Briefcase },
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
    <>
    {/* Below the lg breakpoint (1024px) the page links move to the tab bar at the bottom, and the
        header is compact. The full bar needs 836px, so it can't be used any lower: at the old
        640px switch point it overflowed anywhere up to 836px. Mockup:
        docs/mockups/2026-10-31-phone-topbar.html. */}
    <header className="relative z-10 flex items-center gap-2 px-3 py-2.5 lg:gap-5 lg:px-5 lg:py-3 border-b border-divider bg-topbar shadow-[0_1px_3px_rgb(15_23_42/0.06)] dark:shadow-[0_1px_0_rgb(0_0_0/0.35)]">
      {/* The bar is the raised layer: lighter than the page in both themes, with a clear line under it. */}
      <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm">
          <svg viewBox="0 0 1024 1024" className="size-4.5 fill-primary-foreground" xmlns="http://www.w3.org/2000/svg">
            <path d="M813.7 210.3l-60.3 60.3c64.5 64.5 100 150.2 100 241.4 0 188.2-153.1 341.3-341.3 341.3S170.7 700.2 170.7 512c0-173.8 130.5-317.6 298.7-338.7v86.2C348.4 279.9 256 385.4 256 512c0 141.2 114.8 256 256 256s256-114.8 256-256c0-68.4-26.6-132.7-75-181l-60.3 60.3c32.2 32.2 50 75.1 50 120.7 0 94.1-76.5 170.7-170.7 170.7S341.3 606.1 341.3 512c0-79.4 54.5-146.3 128-165.3v91.4c-25.5 14.8-42.7 42.3-42.7 73.9 0 47.1 38.2 85.3 85.3 85.3s85.3-38.2 85.3-85.3c0-31.6-17.2-59.1-42.7-73.9V85.3h-85.3v2.1C254 108.9 85.3 291.1 85.3 512c0 235.3 191.4 426.7 426.7 426.7S938.7 747.2 938.7 512c0-113.9-44.4-221.1-125-301.7z" />
          </svg>
        </div>
        <span className="font-semibold text-sm text-foreground hidden sm:inline">Shortlist</span>
      </Link>

      <nav className="hidden lg:flex items-center gap-1">
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

    {/* The tab bar for screens under 1024px. Fixed to the bottom, under dialogs (z-50) and over the
        page. The layout pads the page by the same height so nothing is hidden behind it. */}
    <nav
      aria-label="Pages"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-divider bg-topbar px-1.5 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <item.icon className="size-5" />
            {item.name}
          </Link>
        )
      })}
    </nav>
    </>
  )
}
