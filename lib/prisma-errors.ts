// P2025: an update/delete `where` matched no row. With `userId` in the where clause, that means
// the row is missing or belongs to someone else, and both should be a 404.
export function isRecordNotFound(err: unknown): boolean{
  return(
    typeof err === 'object' && 
    err !== null && 'code' in err &&
    (err as {code?: unknown}).code === 'P2025'
  )
}
