import React, { useContext, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import { ChatContext } from '../../context/ChatContext'
import toast from 'react-hot-toast'

/* ─── helpers ── */
function getInitials(name = '') { return name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase() }
function estWait(pos, avgSessionSecs = 180) {
    if (!pos || pos <= 1) return null
    const secs = typeof avgSessionSecs === 'number' && avgSessionSecs > 0 ? avgSessionSecs : 180
    return `~${Math.ceil(((pos - 1) * secs) / 60)} min`
}

/* ─── Steps ── */
const STEPS = [
    { key: 'booked',   label: 'BOOKED',    icon: 'check'     },
    { key: 'waiting',  label: 'WAITING',   icon: 'hourglass' },
    { key: 'yourturn', label: 'YOUR TURN', icon: 'clock'     },
    { key: 'chatting', label: 'CHATTING',  icon: 'chat'      },
]

const StepIcon = ({ type, active, done }) => {
    const borderColor = done ? 'var(--gold)' : active ? 'var(--gold)' : 'var(--border)'
    const bg          = done ? 'var(--gold)' : active ? 'rgba(196,163,90,0.1)' : 'transparent'
    const stroke      = done ? '#0A0A0A'     : active ? 'var(--gold)'          : 'var(--muted)'

    const icons = {
        check:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>,
        hourglass: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><path d="M5 22h14M5 2h14M17 22v-4l-5-4 5-4V2M7 22v-4l5-4-5-4V2"/></svg>,
        clock:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
        chat:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    }

    return (
        <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all"
            style={{ borderColor, background: bg, boxShadow: active ? '0 0 0 4px rgba(196,163,90,0.08)' : 'none' }}>
            {icons[type]}
        </div>
    )
}

/* ─── Component ── */
const WaitingRoomPage = () => {
    const navigate       = useNavigate()
    const [searchParams] = useSearchParams()
    const { socket }     = useContext(AuthContext)
    const { queueState, joinQueue, clearQueue, currentBookingId } = useContext(ChatContext)

    const queueEntryId = searchParams.get('queueEntryId')
    const slotId       = searchParams.get('slotId')

    // ── Bootstrap: join the queue room (idempotent — safe to call on re-mount) ──
    useEffect(() => {
        if (!queueEntryId) { navigate('/slots', { replace: true }); return }
        if (!socket) return
        // If ChatContext already has matching state (e.g., navigated back here),
        // just re-emit to rejoin the server room without resetting position.
        if (queueState?.queueEntryId === queueEntryId) {
            socket.emit('join_waiting_room', { queueEntryId })
        } else {
            joinQueue({ queueEntryId, slotId })
        }
    }, [queueEntryId, slotId, socket]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Navigate to chat when turn is ready ──
    useEffect(() => {
        if (queueState?.status === 'active') {
            setTimeout(() => navigate('/'), 1500)
        }
    }, [queueState?.status, navigate])

    // Fallback: if sessionStorage was cleared on refresh, queueState stays null but
    // ChatContext still bootstraps the session via `your_turn` → sets currentBookingId.
    // Watch it as a secondary trigger so the page navigates regardless.
    useEffect(() => {
        if (currentBookingId && !queueState) {
            setTimeout(() => navigate('/'), 1500)
        }
    }, [currentBookingId, queueState, navigate])

    // ── Page-specific: server-side errors redirect back ──
    useEffect(() => {
        if (!socket) return
        const onError = ({ message }) => {
            toast.error(message)
            navigate('/slots', { replace: true })
        }
        socket.on('waiting_room_error', onError)
        return () => socket.off('waiting_room_error', onError)
    }, [socket, navigate])

    // Derive display values from global queue state
    const status          = queueState?.status ?? 'waiting'
    const position        = queueState?.position ?? null
    const astrologer      = queueState?.astrologer ?? null
    const avgSessionSecs  = queueState?.avgSessionSeconds ?? 180

    const stepIndex  = status === 'cancelled' || status === 'skipped' ? -1 : status === 'active' ? 2 : 1
    const isTerminal = status === 'cancelled' || status === 'skipped'
    const wait       = estWait(position, avgSessionSecs)

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
            style={{ background: 'var(--bg)' }}>

            {/* Card */}
            <div className="w-full max-w-sm rounded-3xl p-8 fade-up"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>

                {/* Astrologer chip */}
                {astrologer && (
                    <div className="flex items-center gap-3 mb-6 p-3 rounded-xl"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {astrologer.profilePic
                            ? <img src={astrologer.profilePic} alt="" className="w-9 h-9 rounded-xl object-cover" />
                            : <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black"
                                style={{ background: 'var(--gold)', color: '#0A0A0A' }}>
                                {getInitials(astrologer.fullName)}
                              </div>
                        }
                        <div>
                            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{astrologer.fullName}</p>
                            <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--live)' }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--live)' }} />
                                Online
                            </span>
                        </div>
                    </div>
                )}

                {/* ── Waiting ── */}
                {status === 'waiting' && (
                    <>
                        <h2 className="font-black text-xl text-center mb-1" style={{ color: 'var(--text)' }}>
                            Your Position in Queue
                        </h2>
                        <p className="text-sm text-center mb-8 leading-relaxed" style={{ color: 'var(--muted)' }}>
                            Hang tight. We'll notify you when the astrologer is ready.
                        </p>

                        {/* Position ring */}
                        <div className="flex justify-center mb-8">
                            <div className="relative w-44 h-44">
                                <div className="absolute inset-0 rounded-full border-2 glow-ring"
                                    style={{ borderColor: 'var(--gold-dim)' }} />
                                <div className="absolute inset-4 rounded-full border"
                                    style={{ borderColor: 'rgba(196,163,90,0.12)' }} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase mb-1"
                                        style={{ color: 'var(--gold)' }}>POSITION</span>
                                    <span className="font-black text-6xl tabular-nums leading-none"
                                        style={{ color: 'var(--text)' }}>
                                        {position !== null ? `#${position}` : '—'}
                                    </span>
                                    {wait && (
                                        <span className="text-[10px] font-bold tracking-[0.12em] uppercase mt-2"
                                            style={{ color: 'var(--muted)' }}>EST. {wait}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Step progress */}
                        <div className="flex items-center justify-center gap-2 mb-8">
                            {STEPS.map((step, i) => {
                                const done   = i < stepIndex
                                const active = i === stepIndex
                                return (
                                    <React.Fragment key={step.key}>
                                        <div className="flex flex-col items-center gap-1.5">
                                            <StepIcon type={step.icon} done={done} active={active} />
                                            <span className="text-[9px] font-bold tracking-wider"
                                                style={{ color: done || active ? 'var(--gold)' : 'var(--muted)' }}>
                                                {step.label}
                                            </span>
                                        </div>
                                        {i < STEPS.length - 1 && (
                                            <div className={`prog-line mb-4 ${done ? 'done' : ''}`} />
                                        )}
                                    </React.Fragment>
                                )
                            })}
                        </div>

                        <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                            You can browse freely — we'll notify you automatically
                        </p>

                        {/* Navigation freedom CTA */}
                        <button onClick={() => navigate('/')}
                            className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                            style={{ background: 'rgba(196,163,90,0.08)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(196,163,90,0.14)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(196,163,90,0.08)'}>
                            Continue Browsing →
                        </button>
                    </>
                )}

                {/* ── Your turn ── */}
                {status === 'active' && (
                    <div className="text-center fade-up">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 glow-live"
                            style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--live)" strokeWidth="2.5">
                                <path d="M20 6L9 17l-5-5"/>
                            </svg>
                        </div>
                        <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--text)' }}>It's Your Turn!</h2>
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>Opening your consultation session…</p>
                        <div className="mt-4 flex justify-center">
                            <div className="w-6 h-6 border-2 rounded-full animate-spin"
                                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }} />
                        </div>
                    </div>
                )}

                {/* ── Terminal (cancelled / skipped) ── */}
                {isTerminal && (
                    <div className="text-center fade-up">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </div>
                        <h2 className="font-black text-xl mb-2" style={{ color: 'var(--text)' }}>
                            {status === 'cancelled' ? 'Booking Cancelled' : 'Turn Skipped'}
                        </h2>
                        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--muted)' }}>
                            {status === 'cancelled'
                                ? 'Your booking was cancelled by the astrologer.'
                                : 'You were skipped because you were offline when your turn came.'}
                        </p>
                        <button onClick={() => { clearQueue(); navigate('/slots') }} className="btn-gold">
                            Browse Other Slots
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default WaitingRoomPage
