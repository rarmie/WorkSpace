'use client'
import { Input } from '@/components/ui/input'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

// `path` is the page the search belongs to, so the same box serves /jobs and /discover.
export default function SearchBar({
  path = '/jobs',
  placeholder = 'Search by company...',
}: {
  path?: string
  placeholder?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  const handleSearch = (value: string) => {
    setSearch(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('search', value)
    else params.delete('search')
    // A new search selects the new top row, not a job the search may now hide.
    params.delete('job')
    // Page 3 of the old results may not exist for the new ones.
    params.delete('page')
    router.push(`${path}?${params.toString()}`)
  }

  return (
    <div className="flex gap-3 w-full sm:w-72">
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="bg-card"
      />
    </div>
  )
}
