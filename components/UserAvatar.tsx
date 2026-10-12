import Image from 'next/image'
import { cn } from '@/lib/utils'
import { userInitials } from '@/lib/initials'

// A round avatar: the account photo when there is one (Google sign-ins), initials otherwise
// (email and password sign-ups have no photo). Presentational only, so both the client top bar
// and the server Profile page can render it. Remote photos need their host listed under
// images.remotePatterns in next.config.ts.
export default function UserAvatar({
  name,
  email,
  image,
  size,
  className,
}: {
  name: string | null | undefined
  email: string | null | undefined
  image: string | null | undefined
  size: number // px, for next/image's width and height
  className?: string
}): React.JSX.Element {
  const base = cn(
    'shrink-0 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold select-none overflow-hidden',
    className,
  )

  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        className={base}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span className={base} style={{ width: size, height: size }} aria-hidden="true">
      {userInitials(name, email)}
    </span>
  )
}
