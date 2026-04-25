import React, { useContext, useState } from 'react'
import { AuthContext } from '../../context/AuthContext'

/* ── Logo mark ── */
const Logo = () => (
    <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--gold)' }}>
            <span className="font-black text-xs" style={{ color: '#0A0A0A' }}>QC</span>
        </div>
        <span className="font-black text-sm tracking-tight" style={{ color: 'var(--text)' }}>QuickChat</span>
    </div>
)

/* ── Input ── */
const Field = ({ label, type = 'text', value, onChange, placeholder, hint }) => (
    <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-[0.15em] uppercase"
            style={{ color: 'var(--muted)' }}>
            {label}
        </label>
        <input
            type={type} value={value} onChange={onChange} placeholder={placeholder} required
            className="dark-input"
        />
        {hint && <p className="text-xs" style={{ color: 'var(--muted)' }}>{hint}</p>}
    </div>
)

/* ── Role chip ── */
const RoleChip = ({ active, onClick, children }) => (
    <button
        type="button" onClick={onClick}
        className="flex-1 py-3 rounded-xl text-sm font-bold transition-all border"
        style={{
            background:   active ? 'var(--gold)'   : 'transparent',
            borderColor:  active ? 'var(--gold)'   : 'var(--border)',
            color:        active ? '#0A0A0A'        : 'var(--muted)',
        }}
    >
        {children}
    </button>
)

/* ── Component ── */
const LoginPage = () => {
    const [mode,     setMode]     = useState('signup')
    const [step,     setStep]     = useState(1)
    const [fullName, setFullName] = useState('')
    const [email,    setEmail]    = useState('')
    const [password, setPassword] = useState('')
    const [bio,      setBio]      = useState('')
    const [role,     setRole]     = useState('client')
    const [agreed,   setAgreed]   = useState(false)

    const { login, isLoading } = useContext(AuthContext)

    const switchMode = (m) => { setMode(m); setStep(1) }

    const onSubmit = (e) => {
        e.preventDefault()
        if (mode === 'signup' && step === 1) { setStep(2); return }
        const creds = mode === 'signup'
            ? { fullName, email, password, bio, role }
            : { email, password }
        login(mode === 'signup' ? 'signup' : 'login', creds)
    }

    return (
        <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>

            {/* ── Left panel — hero ── */}
            <div className="hidden lg:flex flex-col justify-between w-[520px] shrink-0 px-14 py-12"
                style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

                <Logo />

                <div>
                    <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-6"
                        style={{ color: 'var(--gold)' }}>
                        // ASTRO · TECH · SESSIONS
                    </p>
                    <h1 className="font-black leading-[1.05] mb-6"
                        style={{ fontSize: 'clamp(42px, 5vw, 64px)', color: 'var(--text)' }}>
                        Cosmic wisdom,<br />
                        <span style={{ color: 'var(--gold)' }}>on demand.</span>
                    </h1>
                    <p className="text-base leading-relaxed max-w-sm" style={{ color: 'var(--muted)' }}>
                        Book a free 3-minute consultation with expert astrologers.
                        Vedic, Tarot, Numerology, and more — join a live slot, join the queue, and connect instantly.
                    </p>
                </div>

                {/* Stat row */}
                <div className="flex gap-8 pt-8"
                    style={{ borderTop: '1px solid var(--border)' }}>
                    {[['3 min', 'Free sessions'], ['FIFO', 'Fair queue order'], ['Live', 'Real-time sync']].map(([val, lbl]) => (
                        <div key={lbl}>
                            <p className="font-black text-2xl" style={{ color: 'var(--text)' }}>{val}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{lbl}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Right panel — form ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

                {/* Mobile logo */}
                <div className="lg:hidden mb-10">
                    <Logo />
                </div>

                <div className="w-full max-w-[400px] fade-up">

                    {/* Tab toggle */}
                    <div className="flex rounded-2xl p-1 mb-8"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {[['signup', 'Create Account'], ['login', 'Sign In']].map(([m, lbl]) => (
                            <button
                                key={m} type="button" onClick={() => switchMode(m)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                                style={{
                                    background: mode === m ? 'var(--card)' : 'transparent',
                                    color:      mode === m ? 'var(--text)' : 'var(--muted)',
                                    border:     mode === m ? '1px solid var(--border)' : '1px solid transparent',
                                }}
                            >
                                {lbl}
                            </button>
                        ))}
                    </div>

                    {/* Heading */}
                    <div className="mb-8">
                        <h2 className="font-black text-3xl leading-tight mb-1" style={{ color: 'var(--text)' }}>
                            {mode === 'signup'
                                ? step === 1 ? 'Create your account' : 'One more thing'
                                : 'Welcome back'}
                        </h2>
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                            {mode === 'signup'
                                ? step === 1 ? 'Start your cosmic journey today.' : 'Tell us a little about yourself.'
                                : 'Sign in to your workspace.'}
                        </p>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-4">

                        {/* Step 1 */}
                        {!(mode === 'signup' && step === 2) && (
                            <>
                                {mode === 'signup' && (
                                    <>
                                        <Field label="Full Name" value={fullName}
                                            onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
                                        <div>
                                            <label className="text-[10px] font-bold tracking-[0.15em] uppercase block mb-2"
                                                style={{ color: 'var(--muted)' }}>I am a</label>
                                            <div className="flex gap-2">
                                                <RoleChip active={role === 'client'} onClick={() => setRole('client')}>Client</RoleChip>
                                                <RoleChip active={role === 'astrologer'} onClick={() => setRole('astrologer')}>Astrologer</RoleChip>
                                            </div>
                                        </div>
                                    </>
                                )}
                                <Field label="Email Address" type="email" value={email}
                                    onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                                <Field
                                    label="Password" type="password" value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Min 8 chars · 1 uppercase · 1 number"
                                    hint={mode === 'signup' ? 'Minimum 8 characters, 1 uppercase, 1 number' : null}
                                />
                            </>
                        )}

                        {/* Step 2 — bio */}
                        {mode === 'signup' && step === 2 && (
                            <div className="fade-up space-y-4">
                                <button type="button" onClick={() => setStep(1)}
                                    className="flex items-center gap-2 text-xs font-bold transition-colors"
                                    style={{ color: 'var(--muted)' }}
                                    onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
                                    onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
                                    </svg>
                                    Back
                                </button>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-bold tracking-[0.15em] uppercase"
                                        style={{ color: 'var(--muted)' }}>Short Bio</label>
                                    <textarea
                                        value={bio} onChange={e => setBio(e.target.value)} rows={4} required
                                        placeholder={role === 'astrologer'
                                            ? 'Your expertise — e.g. Vedic astrologer specialised in Nadi & Tarot…'
                                            : 'Tell us a little about yourself…'}
                                        className="dark-input resize-none"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Terms */}
                        {!(mode === 'signup' && step === 2) && (
                            <label className="flex items-start gap-3 cursor-pointer">
                                <div
                                    onClick={() => setAgreed(v => !v)}
                                    className="w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors"
                                    style={{
                                        borderColor: agreed ? 'var(--gold)' : 'var(--border)',
                                        background:  agreed ? 'var(--gold)' : 'transparent',
                                    }}
                                >
                                    {agreed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="3.5"><path d="M20 6L9 17l-5-5"/></svg>}
                                </div>
                                <span className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                                    I agree to the{' '}
                                    <span className="font-semibold cursor-pointer" style={{ color: 'var(--gold)' }}>Terms of Service</span>
                                    {' '}&amp; Privacy Policy
                                </span>
                            </label>
                        )}

                        <button
                            type="submit" disabled={isLoading}
                            className="btn-gold w-full mt-2"
                        >
                            {isLoading
                                ? 'Please wait…'
                                : mode === 'signup' && step === 1
                                    ? 'Continue →'
                                    : mode === 'signup'
                                        ? 'Create Account'
                                        : 'Sign In Now'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default LoginPage
