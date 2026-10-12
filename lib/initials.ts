// Up to two letters for an avatar with no photo: "Reginald Masangya" -> "RM", "Cher" -> "C".
// Falls back to the email's first letter when there is no name, and to "?" when there is
// neither. Used by the top bar and the Profile page, so it has no imports (safe in a client
// component).
export function userInitials(name: string | null | undefined, email: string | null | undefined): string {
    const trimmedName = name?.trim() ?? ''

    if (trimmedName === ''){
        if (email){
            return email[0].toUpperCase()
        }

        return "?"
    }

    const splitName = trimmedName.split(/\s+/).map((w) => w[0])

    const initials = splitName.length > 1 ? [splitName[0], splitName.at(-1)].join('').toUpperCase() : splitName[0].toUpperCase()

    return initials
}
