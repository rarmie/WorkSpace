import { withAuth } from 'next-auth/middleware'

export const proxy = withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/jobs/:path*',
    '/api/jobs/:path*',
    '/profile/:path*'
  ],
}