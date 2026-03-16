'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/home')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-[50%] translate-x-[-50%] w-[800px] h-[600px] bg-red-500/10 blur-[120px] rounded-full pointer-events-none" />

      <main className="flex-grow flex items-center justify-center z-10 px-4">
        <div className="w-full max-w-[420px] bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-3xl p-10 shadow-[0_0_80px_-20px_rgba(0,0,0,0.5)]">
          <div className="text-center mb-10 flex flex-col items-center">
            {/* Logo temporarily replaced with text while debugging */}
            <div className="mb-6 flex justify-center">
              <Image src="/branding/full-logo.png" alt="Outlier Studio Logo" width={200} height={50} priority className="object-contain" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Welcome Back</h1>
            <p className="text-white/50 text-sm">Sign in to your analyzer.</p>
          </div>

          {error && <p className="text-red-500 text-center text-sm mb-4">{error}</p>}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-semibold rounded-xl px-6 py-3.5 mt-4 hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center mt-8">
            <p className="text-sm text-white/50">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-white hover:text-red-400 font-medium transition-colors">
                Sign Up
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}