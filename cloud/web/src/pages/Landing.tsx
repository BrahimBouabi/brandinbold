import { BrandLogo } from '../components/Logo'

const FEATURES = [
  {
    title: 'Native C++ Fingerprint Spoofing',
    desc: 'Fingerprints are applied inside the patched browser itself — invisible to page JavaScript, unlike JS-injection approaches.'
  },
  {
    title: 'Cloud Session Sync',
    desc: 'Cookies, logins and open tabs roam across machines. Stop a profile on your Mac, resume it anywhere.'
  },
  {
    title: 'Team Collaboration',
    desc: 'Share profiles and proxies with your team. Session locks prevent two people driving the same identity.'
  },
  {
    title: 'Local API Automation',
    desc: 'A loopback REST API drives profiles from Puppeteer, Playwright or any script — Incogniton-compatible surface.'
  }
]

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    profiles: '3 profiles',
    features: ['Full native fingerprint engine', 'Unlimited browsing', 'Local automation API', 'Community support']
  },
  {
    name: 'Pro',
    price: '$19/mo',
    profiles: '100 profiles',
    features: ['Everything in Free', 'Cloud session sync', 'Proxy library sharing', 'Priority support'],
    highlight: true
  },
  {
    name: 'Team',
    price: '$49/mo',
    profiles: 'Unlimited profiles',
    features: ['Everything in Pro', 'Team management & roles', 'Profile sharing & transfer', 'Centralized billing']
  }
]

export function Landing({ onNav }: { onNav: (route: string) => void }) {
  return (
    <div style={{ background: '#0d0f13', color: '#d7dbe2', minHeight: '100vh', fontFamily: '-apple-system, system-ui' }}>
      {/* nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 40px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <BrandLogo size={26} color="#8952ef" />
        <span style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>Brandinbold</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={() => onNav('login')} style={navBtn}>Sign In</button>
          <button onClick={() => onNav('register')} style={primaryBtn}>Create Account</button>
        </div>
      </nav>

      {/* hero */}
      <div style={{ textAlign: 'center', padding: '90px 24px 70px', background: 'radial-gradient(ellipse at top, rgba(137,82,239,0.18), transparent 60%)' }}>
        <h1 style={{ fontSize: 54, margin: '0 0 18px', color: '#fff', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Brandinbold
        </h1>
        <p style={{ fontSize: 22, color: '#9aa3af', margin: '0 0 12px' }}>Next-Gen Antidetect Browser</p>
        <p style={{ fontSize: 15, color: '#6b7280', maxWidth: 640, margin: '0 auto 34px' }}>
          Native C++ fingerprint spoofing, per-profile browser identities and a local automation API —
          packaged in a clean Electron manager that never leaks what it protects.
        </p>
        <button onClick={() => onNav('register')} style={primaryBigBtn}>Create free account</button>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Free plan · 3 profiles · no credit card</div>
      </div>

      {/* features */}
      <div style={{ padding: '50px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 26, marginBottom: 36 }}>Everything an operator needs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#8952ef', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#9aa3af', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* pricing */}
      <div style={{ padding: '40px 40px 70px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 26, marginBottom: 36 }}>Plans</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18 }}>
          {PLANS.map((p) => (
            <div
              key={p.name}
              style={{
                background: p.highlight ? 'rgba(137,82,239,0.09)' : '#15171d',
                border: p.highlight ? '1px solid #8952ef' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14,
                padding: '26px 22px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: '#9aa3af' }}>{p.name}</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: p.highlight ? '#8952ef' : '#fff', margin: '10px 0' }}>{p.price}</div>
              <div style={{ fontSize: 13, color: '#9aa3af', marginBottom: 16 }}>{p.profiles}</div>
              {p.features.map((f) => (
                <div key={f} style={{ fontSize: 12.5, padding: '4px 0', color: '#c3c9d2' }}>✓ {f}</div>
              ))}
              <button onClick={() => onNav('register')} style={{ ...ghostBtn, width: '100%', marginTop: 18 }}>
                {p.name === 'Free' ? 'Start free' : `Choose ${p.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* download */}
      <div style={{ padding: '30px 40px 90px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, marginBottom: 8 }}>Download</h2>
        <p style={{ color: '#9aa3af', fontSize: 13, marginBottom: 22 }}>
          macOS arm64 · Windows and Linux builds follow the desktop engine work
        </p>
        <button style={primaryBigBtn} onClick={() => alert('The macOS arm64 DMG is published with each release.')}>
          ⬇ macOS (Apple Silicon) — DMG
        </button>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Windows / Linux — coming with the Chromium engine</div>
      </div>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '24px 40px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
        Brandinbold — local-first antidetect manager. Use responsibly and comply with the terms of every site you automate.
      </footer>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#d7dbe2',
  borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13
}
const primaryBtn: React.CSSProperties = {
  background: '#8952ef', border: 'none', color: '#fff',
  borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600
}
const primaryBigBtn: React.CSSProperties = {
  background: '#8952ef', border: 'none', color: '#fff',
  borderRadius: 10, padding: '13px 30px', cursor: 'pointer', fontSize: 15, fontWeight: 700
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(137,82,239,0.5)', color: '#8952ef',
  borderRadius: 8, padding: '8px 0', cursor: 'pointer', fontSize: 13, fontWeight: 600
}
