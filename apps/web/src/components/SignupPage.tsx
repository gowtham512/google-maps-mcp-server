import { useState } from "react"
import { Eye, EyeOff, Loader2, Lock, Mail, Plane, Sparkles } from "lucide-react"
import { register } from "@/lib/api"

interface SignupPageProps {
  onSuccess: () => void
  onSwitchToLogin: () => void
}

const LANDMARKS = [
  { emoji: "🏝️", label: "Maldives", top: "10%",  left: "8%",   size: 56, delay: "0s",    duration: "7s"  },
  { emoji: "🎡", label: "London",   top: "62%",  left: "4%",   size: 52, delay: "1.2s",  duration: "6s"  },
  { emoji: "🏛️", label: "Rome",    top: "18%",  right: "7%",  size: 54, delay: "0.6s",  duration: "8s"  },
  { emoji: "🌺", label: "Hawaii",   top: "72%",  right: "5%",  size: 50, delay: "2.2s",  duration: "6.5s"},
  { emoji: "🦁", label: "Safari",   top: "40%",  left: "2%",   size: 48, delay: "0.9s",  duration: "9s"  },
  { emoji: "🌸", label: "Kyoto",    top: "83%",  left: "38%",  size: 46, delay: "2.8s",  duration: "7.5s"},
]

const FEATURES = [
  { icon: "🗺️", text: "AI-powered itinerary builder" },
  { icon: "📍", text: "Real-time Google Maps data" },
  { icon: "🌤️", text: "Live weather & air quality" },
  { icon: "✈️", text: "Instant route calculations" },
]

export function SignupPage({ onSuccess, onSwitchToLogin }: SignupPageProps) {
  const [email, setEmail]     = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm]   = useState("")
  const [showPw, setShowPw]     = useState(false)
  const [showCf, setShowCf]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const strength = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
    : 3

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength]
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"][strength]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords do not match"); return }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return }
    setLoading(true)
    setError(null)
    try {
      await register(email.trim(), password)
      onSuccess()
    } catch (err) {
      setError((err as Error).message || "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full">

      {/* ── Left hero panel ── */}
      <div className="auth-hero hidden lg:flex lg:w-[55%] xl:w-[60%] flex-col justify-between p-12 relative">
        <div className="auth-hero-orb auth-hero-orb-1" />
        <div className="auth-hero-orb auth-hero-orb-2" />
        <div className="auth-hero-orb auth-hero-orb-3" />

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
            <span className="text-white font-bold text-xl tracking-tight">Voyager AI</span>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 animate-fade-up anim-delay-200">
          <p className="text-white/60 uppercase tracking-widest text-xs font-semibold mb-3">
            Start your journey
          </p>
          <h1 className="text-white font-bold text-5xl xl:text-6xl leading-[1.1] mb-6">
            Every trip starts<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-emerald-300">
              with a dream
            </span>
          </h1>
          <p className="text-white/70 text-lg max-w-md leading-relaxed mb-8">
            Join thousands of travellers who plan smarter, travel better,
            and discover more with AI-powered guidance.
          </p>
          {/* Feature list */}
          <div className="grid grid-cols-1 gap-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.text}
                className="flex items-center gap-3 animate-fade-up"
                style={{ animationDelay: `${400 + i * 100}ms` }}
              >
                <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/15 text-lg backdrop-blur shrink-0">
                  {f.icon}
                </span>
                <span className="text-white/80 text-sm font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <div className="relative z-10 animate-fade-up anim-delay-600">
          <p className="text-white/40 text-xs italic">
            "The world is a book, and those who do not travel read only one page."
          </p>
          <p className="text-white/30 text-xs mt-1">— Saint Augustine</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12 min-h-screen">

        {/* Mobile brand */}
        <div className="lg:hidden flex items-center gap-2 mb-8 animate-fade-in">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
            <Plane className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Voyager AI</span>
        </div>

        <div className="w-full max-w-[400px] animate-slide-right">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-5 animate-pulse-glow">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Create account</h2>
            <p className="text-muted-foreground mt-1.5">Start planning your first adventure today</p>
          </div>

          {/* Form card */}
          <div className="auth-form-card rounded-2xl p-8">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="text-sm font-semibold text-foreground">
                  Email address
                </label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="signup-email"
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
                <label htmlFor="signup-password" className="text-sm font-semibold text-foreground">
                  Password
                </label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="signup-password"
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Strength bar */}
                {password.length > 0 && (
                  <div className="space-y-1 animate-fade-in">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColor : "bg-muted"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{strengthLabel} password</p>
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <label htmlFor="signup-confirm" className="text-sm font-semibold text-foreground">
                  Confirm password
                </label>
                <div className="relative input-glow rounded-xl transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="signup-confirm"
                    type={showCf ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                    className={`w-full pl-10 pr-11 py-3 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50 ${
                      confirm && password !== confirm ? "border-destructive/60" : "border-input"
                    }`}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowCf(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirm && password !== confirm && (
                  <p className="text-xs text-destructive animate-fade-in">Passwords don't match</p>
                )}
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
                disabled={loading || !email || !password || !confirm}
                className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/25 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Start your journey
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Switch */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-primary font-semibold hover:underline underline-offset-4 transition-colors"
            >
              Sign in →
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
