import { useState } from "react"
import { Eye, EyeOff, Loader2, Lock, Mail, MapPin, Plane } from "lucide-react"
import { login } from "@/lib/api"

interface LoginPageProps {
  onSuccess: () => void
  onSwitchToSignup: () => void
}

const LANDMARKS = [
  { emoji: "🗼", label: "Paris",    top: "12%",  left: "10%",  size: 56, delay: "0s",    duration: "6s"  },
  { emoji: "🗽", label: "New York", top: "65%",  left: "5%",   size: 52, delay: "1.5s",  duration: "7s"  },
  { emoji: "🏯", label: "Tokyo",    top: "20%",  right: "8%",  size: 54, delay: "0.8s",  duration: "8s"  },
  { emoji: "🕌", label: "Istanbul", top: "70%",  right: "6%",  size: 50, delay: "2s",    duration: "6.5s"},
  { emoji: "🌉", label: "SF",       top: "42%",  left: "3%",   size: 48, delay: "1s",    duration: "9s"  },
  { emoji: "🏔️", label: "Alps",    top: "82%",  left: "40%",  size: 46, delay: "3s",    duration: "7.5s"},
]

const STATS = [
  { value: "190+", label: "Countries" },
  { value: "50K+", label: "Trips planned" },
  { value: "AI",   label: "Powered" },
]

export function LoginPage({ onSuccess, onSwitchToSignup }: LoginPageProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email.trim(), password)
      onSuccess()
    } catch (err) {
      setError((err as Error).message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full">

      {/* ── Left hero panel (hidden on mobile) ── */}
      <div className="auth-hero hidden lg:flex lg:w-[55%] xl:w-[60%] flex-col justify-between p-12 relative">

        {/* Animated orbs */}
        <div className="auth-hero-orb auth-hero-orb-1" />
        <div className="auth-hero-orb auth-hero-orb-2" />
        <div className="auth-hero-orb auth-hero-orb-3" />

        {/* Floating landmark icons */}
        {LANDMARKS.map((lm) => (
          <div
            key={lm.label}
            className="landmark"
            style={{
              top: lm.top,
              left: "left" in lm ? lm.left : undefined,
              right: "right" in lm ? (lm as any).right : undefined,
              width: lm.size,
              height: lm.size,
              animation: `float ${lm.duration} ease-in-out ${lm.delay} infinite`,
            }}
            title={lm.label}
          >
            {lm.emoji}
          </div>
        ))}

        {/* Brand */}
        <div className="relative z-10 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Plane className="h-5 w-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">TripGenius</span>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 animate-fade-up anim-delay-200">
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold mb-3">
            Plan smarter, travel better
          </p>
          <h1 className="text-white font-bold text-5xl xl:text-6xl leading-[1.1] mb-6">
            Explore the<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-purple-300">
              world smarter
            </span>
          </h1>
          <p className="text-white/70 text-lg max-w-md leading-relaxed">
            Plan multi-day itineraries, discover hidden gems, and get real-time
            routes in seconds.
          </p>
        </div>

        {/* Stats row */}
        <div className="relative z-10 flex gap-8 animate-fade-up anim-delay-400">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-white font-bold text-2xl">{s.value}</p>
              <p className="text-white/55 text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12 min-h-screen">

        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-2 mb-8 animate-fade-in">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
            <Plane className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">TripGenius</span>
        </div>

        <div className="w-full max-w-[400px] animate-slide-right">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-5 animate-pulse-glow">
              <MapPin className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-1.5">Sign in to continue planning your trips</p>
          </div>

          {/* Form card */}
          <div className="auth-form-card rounded-2xl p-8">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-semibold text-foreground">
                  Email address
                </label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-semibold text-foreground">
                  Password
                </label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/8 border border-destructive/20 px-4 py-3 text-sm text-destructive animate-fade-in">
                  <span className="shrink-0">⚠</span>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/25"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <span className="text-white/70">→</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Switch */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="text-primary font-semibold hover:underline underline-offset-4 transition-colors"
            >
              Create one free →
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
