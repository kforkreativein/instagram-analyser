'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fullName, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      // Registration successful — redirect to signin to sign in
      router.push('/signin')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center relative overflow-hidden font-sans">
      {/* Ambient glows */}
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-[#ff4d4d]/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-150px] left-[-100px] w-80 h-80 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Glassmorphic Card */}
      <div className="w-full max-w-md bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 md:p-12 shadow-[0_0_80px_-20px_rgba(0,0,0,0.6)] z-10">

        {/* Brand Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <Image src="/branding/full-logo.png" alt="Outlier Studio Logo" width={200} height={48} className="object-contain drop-shadow-lg" priority />
          </div>
          <p className="text-white/60 text-sm">
            Join the elite of creators. Sign up to the Analyzer.
          </p>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/90">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="K for Kreative"
              required
              className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#ff4d4d]/50 focus:ring-1 focus:ring-[#ff4d4d]/50 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/90">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="krish@outlier.studio"
              required
              className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#ff4d4d]/50 focus:ring-1 focus:ring-[#ff4d4d]/50 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/90">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3.5 text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#ff4d4d]/50 focus:ring-1 focus:ring-[#ff4d4d]/50 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-semibold rounded-xl px-6 py-3.5 mt-2 hover:bg-white/90 transition-all transform active:scale-[0.98] shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="text-center mt-8 pt-6 border-t border-white/10">
          <p className="text-sm text-white/60">
            Already a member?{' '}
            <Link href="/signin" className="text-white hover:text-[#ff4d4d] font-medium transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
