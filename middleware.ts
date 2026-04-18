import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: {
    signIn: "/signin",
  },
})

// THE GATES: Explicitly lock down every single dashboard route.
// Do NOT put "/" or "/signin" or "/register" in this matcher array.
export const config = { 
  matcher: [
    "/home/:path*", 
    "/settings/:path*", 
    "/scripts/:path*", 
    "/channels/:path*", 
    "/videos/:path*", 
    "/uploads/:path*",
    "/clients/:path*",
    "/ideas/:path*",
    "/carousels/:path*",
    "/calendar/:path*",
    "/leads/:path*",
  ] 
}
