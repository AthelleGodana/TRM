import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight, BellRing, Building2, CreditCard, Fuel, GraduationCap, LogIn, MapPin, Route, School,
  ShieldCheck, Smartphone, UserCheck, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../config/roles';
import Brand from '../components/layout/Brand';
import ThemeToggle from '../components/common/ThemeToggle';

const AUDIENCES = [
  {
    icon: GraduationCap, title: 'Universities',
    text: 'Students register their route and pickup stop, pay with M-Pesa and follow the shuttle live.',
  },
  {
    icon: School, title: 'Schools',
    text: 'Parents see where their child’s bus is. Pupils need no account; the school links them to their parents.',
  },
  {
    icon: Building2, title: 'Companies',
    text: 'Run staff transport with clear routes, assigned drivers, and fuel spend you can account for.',
  },
];

const FEATURES = [
  { icon: MapPin, title: 'Live bus tracking', text: 'Drivers share their location from their phone; passengers see the bus move on the map.' },
  { icon: Route, title: 'Routes and stops', text: 'Build routes, pin pickup points on the map and set arrival and departure times.' },
  { icon: CreditCard, title: 'M-Pesa payments', text: 'Passengers pay their transport fee with an STK push. Admins see revenue by month and tier.' },
  { icon: Fuel, title: 'Fuel Hub', text: 'Record fill-ups and fuel cards, and keep an eye on consumption per vehicle.' },
  { icon: BellRing, title: 'Delay and emergency alerts', text: 'Passengers are told straight away when a bus is late or a driver reports an emergency.' },
  { icon: Smartphone, title: 'Works on any phone', text: 'Install it to the home screen like an app. No app store, no download fees.' },
];

const STEPS = [
  { icon: LogIn, title: 'Sign in with Google', text: 'Use the Google account your organisation knows you by. No new password to remember.' },
  { icon: Users, title: 'Get invited or ask for access', text: 'Your transport office invites you, or you request access with your organisation’s code.' },
  { icon: UserCheck, title: 'An administrator approves', text: 'You get in once your organisation approves you, with the role they choose for you.' },
];

// Static illustration of the live tracking card (decorative).
function ProductPreview() {
  const stops = ['Town Stage', 'Lavington Mall', 'Adams Arcade'];
  return (
    <div className="glass-card shadow-lg p-5 w-full max-w-md" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-primary-600 text-white flex items-center justify-center">
            <MapPin size={20} />
          </span>
          <div>
            <p className="font-bold text-foreground tabular-nums">KDA 123X</p>
            <p className="text-xs text-muted-foreground">Route A · Westlands</p>
          </div>
        </div>
        <span className="badge-success"><span className="w-1.5 h-1.5 rounded-full bg-current" />Live</span>
      </div>
      <ol className="mt-5 relative">
        <span className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
        {stops.map((stop, i) => (
          <li key={stop} className="relative flex items-center gap-3 py-2">
            <span className={`relative z-10 w-5 h-5 rounded-full border-2 ${
              i === 0 ? 'bg-primary-600 border-primary-600' : i === 1 ? 'bg-card border-primary-600' : 'bg-card border-border'
            }`} />
            <span className="flex-1 text-sm text-foreground">{stop}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{['Passed', '4 min', '11 min'][i]}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[['Seats', '21/33'], ['Speed', '32 km/h'], ['Driver', 'On duty']].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted p-2">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, text }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-link">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h2>
      {text && <p className="mt-3 text-muted-foreground">{text}</p>}
    </div>
  );
}

// Public home page. Signed-in people go straight to their own area.
export default function Landing() {
  const { session } = useAuth();
  if (session) return <Navigate to={homeForRole(session.role)} replace />;

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] btn-primary">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-6xl flex items-center gap-2 h-16 px-4 sm:px-6">
          <Link to="/" aria-label="Transtrack Kenya home" className="mr-auto rounded-lg"><Brand /></Link>
          <nav aria-label="Page sections" className="hidden md:flex items-center gap-1">
            <a href="#features" className="btn-ghost">Features</a>
            <a href="#access" className="btn-ghost">How access works</a>
          </nav>
          <ThemeToggle />
          <Link to="/login" className="btn-primary">Sign in</Link>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-12 items-center" aria-labelledby="hero-title">
          <div>
            <p className="badge-info">Transport management for Kenyan institutions</p>
            <h1 id="hero-title" className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
              Know where every bus is, and who should be on it.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Transtrack Kenya brings routes, live tracking, M-Pesa payments and fuel records into one place for
              universities, schools and companies. Only people your organisation approves can get in.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/login" className="btn-primary px-6">
                Sign in <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#access" className="btn-secondary px-6">How access works</a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ProductPreview />
          </div>
        </section>

        {/* ── Who it is for ────────────────────────────────────────── */}
        <section className="border-y border-border bg-card" aria-labelledby="audiences-title">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
            <SectionHeading id="audiences-title" eyebrow="Who it is for" title="One platform, set up for how you run transport" />
            <ul className="mt-8 grid md:grid-cols-3 gap-4">
              {AUDIENCES.map((a) => (
                <li key={a.title} className="rounded-xl border border-border p-5">
                  <a.icon size={24} className="text-link" aria-hidden="true" />
                  <h3 className="mt-3 font-semibold text-foreground">{a.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20" aria-labelledby="features-title">
          <SectionHeading id="features-title" eyebrow="Features" title="Everything the transport office needs"
            text="Built for daily operations: clear screens on a phone or a desk, and nothing extra to pay for." />
          <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="w-10 h-10 shrink-0 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 flex items-center justify-center">
                  <f.icon size={20} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Access ───────────────────────────────────────────────── */}
        <section id="access" className="border-y border-border bg-card" aria-labelledby="access-title">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
            <SectionHeading id="access-title" eyebrow="How access works" title="Your organisation decides who gets in"
              text="There is no open sign-up. Every person is approved by an administrator, and each organisation only ever sees its own data." />
            <ol className="mt-10 grid md:grid-cols-3 gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-border bg-background p-5">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center justify-center tabular-nums">
                      {i + 1}
                    </span>
                    <s.icon size={20} className="text-muted-foreground" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck size={18} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              New organisations are reviewed by the Transtrack team before anyone can sign in to them.
            </p>
          </div>
        </section>

        {/* ── Call to action ───────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20" aria-labelledby="cta-title">
          <div className="rounded-2xl bg-primary-700 px-6 py-10 sm:px-10 flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex-1">
              <h2 id="cta-title" className="text-2xl font-bold tracking-tight text-white">Bring Transtrack to your organisation</h2>
              <p className="mt-2 text-primary-100 max-w-xl">
                Sign in with Google and register your university, school or company. We review it, then you invite your team.
              </p>
            </div>
            <Link to="/login" className="btn bg-white text-primary-800 hover:bg-primary-50 px-6 shrink-0">
              Get started <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-4 sm:items-center justify-between text-sm text-muted-foreground">
          <Brand />
          <p>© {new Date().getFullYear()} Transtrack Kenya · Built by Athelle Godana</p>
        </div>
      </footer>
    </div>
  );
}
