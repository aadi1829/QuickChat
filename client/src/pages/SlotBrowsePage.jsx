import React, { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import { ChatContext } from '../../context/ChatContext'
import toast from 'react-hot-toast'
import { TopNav } from '../components/TopNav'

/* ─── helpers ── */
const EXPERTISE_TAGS = ['Vedic', 'Nadi', 'Numerology', 'Tarot', 'KP', 'Prashna', 'Crystal', 'Palmistry', 'Astro', 'Runes']
const AVATAR_COLORS  = ['#C4A35A', '#8B7CF6', '#E07B7B', '#5BA8D0', '#D09A5B', '#5BB8A0', '#C47BAA', '#7B9DD0']

function getAvatarColor(name = '') { return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] }
function getInitials(name = '')    { return name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase() }
function escapeRegex(s = '') { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function getTagsFromBio(bio = '')  {
    const text = String(bio || '')
    return EXPERTISE_TAGS
        .filter((tag) => {
            const safe = escapeRegex(tag)
            const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${safe}([^\\p{L}\\p{N}_]|$)`, 'iu')
            return re.test(text)
        })
        .slice(0, 3)
}
function fmtRating(avg, count) {
    const a = Number(avg)
    const c = Number(count)
    if (!Number.isFinite(a) || !Number.isFinite(c) || c <= 0) return 'New'
    return a.toFixed(1)
}
function fmtTime(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }

/* ─── Booking Modal ── */
const BookingModal = ({ astrologer, slots, booking, onBook, onClose }) => {
    if (!astrologer) return null
    const mySlots = slots.filter(s => s.astrologerId?._id === astrologer._id || s.astrologerId === astrologer._id)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-up"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-md rounded-2xl overflow-hidden fade-up"
                style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>

                {/* Header */}
                <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1"
                                style={{ color: 'var(--gold)' }}>// BOOK SLOT</p>
                            <h2 className="font-black text-2xl" style={{ color: 'var(--text)' }}>
                                Slots with <span style={{ color: 'var(--gold)' }}>{astrologer.fullName?.split(' ')[0]}</span>
                            </h2>
                        </div>
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                            ✕
                        </button>
                    </div>
                </div>

                {/* Slots list */}
                <div className="px-6 py-4 space-y-3 max-h-64 overflow-y-auto">
                    {mySlots.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>No available slots right now.</p>
                    ) : mySlots.map(slot => {
                        const isFull = slot.queueCount >= slot.maxClients
                        return (
                            <div key={slot._id} className="flex items-center gap-4 p-4 rounded-xl"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm font-mono" style={{ color: 'var(--text)' }}>
                                        {fmtTime(slot.startAt)} – {fmtTime(slot.endAt)}
                                    </p>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{slot.queueCount} in queue</p>
                                </div>
                                <button
                                    onClick={() => !isFull && onBook(slot._id)}
                                    disabled={booking === slot._id || isFull}
                                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                                    style={isFull
                                        ? { background: 'var(--surface)', color: 'var(--muted)', cursor: 'not-allowed', border: '1px solid var(--border)' }
                                        : booking === slot._id
                                            ? { background: 'rgba(74,222,128,0.1)', color: 'var(--live)', cursor: 'wait', border: '1px solid rgba(74,222,128,0.3)' }
                                            : { background: 'var(--gold)', color: '#0A0A0A', border: 'none' }
                                    }>
                                    {isFull ? 'Full' : booking === slot._id ? 'Booking…' : 'Book Free →'}
                                </button>
                            </div>
                        )
                    })}
                </div>

                <div className="px-6 py-3 text-center" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-[10px] tracking-[0.15em] uppercase font-mono" style={{ color: 'var(--muted)' }}>
                        Sessions are 3 minutes · Free first session
                    </p>
                </div>
            </div>
        </div>
    )
}

/* ─── Main component ── */
const SlotBrowsePage = () => {
    const { axios } = useContext(AuthContext)
    const { joinQueue } = useContext(ChatContext)
    const navigate    = useNavigate()
    const [searchParams] = useSearchParams()

    const [slots,        setSlots]        = useState([])
    const [astrologers,  setAstrologers]  = useState([])
    const [loading,      setLoading]      = useState(true)
    const [booking,      setBooking]      = useState(null)
    const [modalAstro,   setModalAstro]   = useState(null)

    const fromSession = searchParams.get('from') === 'session'
    const [showPaid,  setShowPaid]   = useState(fromSession)

    const RATING_KEY = 'qc_pending_rating'
    const [showRating, setShowRating] = useState(false)
    const [ratingStars, setRatingStars] = useState(5)
    const [ratingBusy, setRatingBusy] = useState(false)
    const [ratingBookingId, setRatingBookingId] = useState(null)
    const [ratingAstro, setRatingAstro] = useState(null)

    const loadDiscover = async () => {
        setLoading(true)
        try {
            const [slotsRes, dirRes] = await Promise.all([
                axios.get('/api/slots'),
                axios.get('/api/auth/astrologers'),
            ])
            if (slotsRes.data.success) setSlots(slotsRes.data.slots)
            if (dirRes.data.success) setAstrologers(dirRes.data.astrologers ?? [])
        } catch {
            toast.error('Failed to load astrologers')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadDiscover() }, [])

    // Restore pending rating after refresh/navigation (only if still eligible).
    useEffect(() => {
        let cancelled = false
        const run = async () => {
            try {
                const raw = sessionStorage.getItem(RATING_KEY)
                if (!raw) return
                const saved = JSON.parse(raw)
                const bookingId = saved?.bookingId
                if (!bookingId) return

                const { data } = await axios.get(`/api/bookings/${bookingId}`)
                if (!data?.success || !data?.booking) return

                const b = data.booking
                const astro = b?.queueEntryId?.slotId?.astrologerId
                const isEligible =
                    b?.status === 'completed' &&
                    b?.ratingStars == null &&
                    astro?.isPaidUser === true

                if (!isEligible) {
                    try { sessionStorage.removeItem(RATING_KEY) } catch { /* ignore */ }
                    return
                }

                if (cancelled) return
                setRatingStars(5)
                setRatingBookingId(String(b._id))
                setRatingAstro(astro || null)
                setShowRating(true)
            } catch {
                // Ignore (best-effort restore)
            }
        }
        run()
        return () => { cancelled = true }
    }, [axios])

    const handleBook = async (slotId) => {
        setBooking(slotId)
        try {
            const { data } = await axios.post(`/api/slots/${slotId}/book`)
            if (data.success) {
                toast.success(`Booked! You are #${data.position} in the queue.`)
                setModalAstro(null)
                // Bootstrap global queue state NOW (writes sessionStorage before navigating)
                joinQueue({ queueEntryId: data.queueEntryId, slotId: data.slotId })
                navigate(`/waiting?queueEntryId=${data.queueEntryId}&slotId=${data.slotId}`)
            } else toast.error(data.message)
        } catch (err) { toast.error(err.response?.data?.message || err.message) }
        finally { setBooking(null) }
    }

    const isAstroOnline = (astroId) =>
        slots.some(s => (s.astrologerId?._id ?? s.astrologerId) === astroId && s.status === 'active')

    const getAstroSlots = (astro) =>
        slots.filter(s => (s.astrologerId?._id ?? s.astrologerId) === (astro._id ?? astro))

    const astrologersWithOpenOrActiveSlots = astrologers.filter((astro) => getAstroSlots(astro).length > 0)

    const handleNav = (r) => navigate(r === 'astrologer' ? '/manage-slots' : '/slots')

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
            <TopNav role="client" isLive={false} onNavigate={handleNav} />

            {/* ── Rating modal (paid astrologers only) ── */}
            {showRating && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-up"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
                        <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2"
                            style={{ color: 'var(--gold)' }}>// RATE SESSION</p>
                        <h3 className="font-black text-xl mb-2" style={{ color: 'var(--text)' }}>
                            Rate {ratingAstro?.fullName?.split(' ')?.[0] ?? 'your astrologer'}
                        </h3>
                        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
                            Your feedback helps improve recommendations.
                        </p>

                        <div className="flex items-center justify-center gap-2 mb-6">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    disabled={ratingBusy}
                                    onClick={() => setRatingStars(n)}
                                    className="w-11 h-11 rounded-xl flex items-center justify-center font-black transition-all"
                                    style={{
                                        background: n <= ratingStars ? 'rgba(196,163,90,0.16)' : 'var(--surface)',
                                        border: `1px solid ${n <= ratingStars ? 'var(--gold-dim)' : 'var(--border)'}`,
                                        color: n <= ratingStars ? 'var(--gold)' : 'var(--muted)',
                                    }}>
                                    ★
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={ratingBusy}
                                onClick={() => {
                                    setShowRating(false)
                                    setRatingBookingId(null)
                                    setRatingAstro(null)
                                    try { sessionStorage.removeItem(RATING_KEY) } catch { /* ignore */ }
                                }}
                                className="btn-ghost flex-1">
                                Later
                            </button>
                            <button
                                type="button"
                                disabled={ratingBusy || !ratingBookingId}
                                onClick={async () => {
                                    if (!ratingBookingId) return
                                    setRatingBusy(true)
                                    try {
                                        const { data } = await axios.post(`/api/bookings/${ratingBookingId}/rate`, { stars: ratingStars })
                                        if (data?.success) toast.success(data.message || 'Rated')
                                        else toast.error(data?.message || 'Rating failed')
                                        setShowRating(false)
                                        setRatingBookingId(null)
                                        setRatingAstro(null)
                                        try { sessionStorage.removeItem(RATING_KEY) } catch { /* ignore */ }
                                    } catch (err) {
                                        const status = err?.response?.status
                                        const msg = err.response?.data?.message || err.message || 'Rating failed'
                                        if (status === 409) {
                                            toast.success('Already rated. Thanks!')
                                            setShowRating(false)
                                            setRatingBookingId(null)
                                            setRatingAstro(null)
                                            try { sessionStorage.removeItem(RATING_KEY) } catch { /* ignore */ }
                                        } else {
                                            toast.error(msg)
                                            setShowRating(false)
                                            setRatingBookingId(null)
                                            setRatingAstro(null)
                                        }
                                    } finally {
                                        setRatingBusy(false)
                                    }
                                }}
                                className="btn-gold flex-1">
                                {ratingBusy ? 'Submitting…' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Post-session paid modal ── */}
            {showPaid && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6 fade-up"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
                        <div className="text-center mb-6">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(196,163,90,0.08)', border: '1px solid var(--gold-dim)' }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                                </svg>
                            </div>
                            <h2 className="font-black text-xl mb-1" style={{ color: 'var(--text)' }}>Session Complete!</h2>
                            <p className="text-sm" style={{ color: 'var(--muted)' }}>Continue your journey with a paid session</p>
                        </div>
                        <div className="space-y-3 mb-4">
                            {[
                                { label: '15-Min Voice Call', price: '₹299', desc: 'Live phone consultation', tag: '🎙' },
                                { label: '30-Min Chat',       price: '₹199', desc: 'In-depth text session',   tag: '💬' },
                            ].map(p => (
                                <div key={p.label}
                                    className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all"
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                                    <span className="text-2xl">{p.tag}</span>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{p.label}</p>
                                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{p.desc}</p>
                                    </div>
                                    <span className="font-black text-base" style={{ color: 'var(--gold)' }}>{p.price}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowPaid(false)} className="btn-ghost w-full">
                            Browse Other Astrologers →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Booking modal ── */}
            {modalAstro && (
                <BookingModal
                    astrologer={modalAstro}
                    slots={getAstroSlots(modalAstro)}
                    booking={booking}
                    onBook={handleBook}
                    onClose={() => setModalAstro(null)}
                />
            )}

            <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">

                {/* ── Heading ── */}
                <div className="mb-10">
                    <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-3"
                        style={{ color: 'var(--gold)' }}>// DISCOVER</p>
                    <h1 className="font-black leading-tight mb-3" style={{ fontSize: 'clamp(32px, 5vw, 52px)', color: 'var(--text)' }}>
                        Connect with an<br />
                        <span style={{ color: 'var(--gold)' }}>Astrologer.</span>
                    </h1>
                    <p className="text-base" style={{ color: 'var(--muted)' }}>
                        Pick an expert and join their next free 3-minute slot.
                    </p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-24">
                        <div className="w-8 h-8 border-2 rounded-full animate-spin"
                            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }} />
                    </div>
                ) : astrologersWithOpenOrActiveSlots.length === 0 ? (
                    <div className="text-center py-24">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
                                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                            </svg>
                        </div>
                        <p className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>No Slots Available</p>
                        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>No astrologers have an open or live slot right now. Check back soon.</p>
                        <button onClick={loadDiscover} className="btn-gold">Refresh</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {astrologersWithOpenOrActiveSlots.map(astro => {
                            const online   = isAstroOnline(astro._id ?? astro)
                            const tags     = getTagsFromBio(astro.bio)
                            const rating   = fmtRating(astro.ratingAvg, astro.ratingCount)
                            const initials = getInitials(astro.fullName)
                            const color    = getAvatarColor(astro.fullName)
                            const astroSlots = getAstroSlots(astro)

                            return (
                                <div key={astro._id ?? astro}
                                    className="rounded-2xl p-5 transition-all cursor-pointer group fade-up"
                                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                                    onMouseOver={e => e.currentTarget.style.borderColor = online ? 'var(--gold-dim)' : 'var(--border-h)'}
                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                >
                                    {/* Header */}
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                                            style={{ background: color + '22', border: `1px solid ${color}44` }}>
                                            {astro.profilePic
                                                ? <img src={astro.profilePic} alt="" className="w-full h-full object-cover rounded-2xl" />
                                                : <span className="font-black text-lg" style={{ color }}>{initials}</span>
                                            }
                                            {online && (
                                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                                                    style={{ background: 'var(--live)', borderColor: 'var(--card)' }} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{astro.fullName}</p>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span style={{ color: 'var(--gold)' }} className="text-xs">★</span>
                                                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{rating}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                        {(tags.length ? tags : ['Astrology']).map(tag => (
                                            <span key={tag}
                                                className="px-2.5 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wide"
                                                style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Slot count */}
                                    <div className="mb-4">
                                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                                            {astroSlots.length > 0
                                                ? `${astroSlots.length} open slot${astroSlots.length !== 1 ? 's' : ''} · book the free queue`
                                                : 'No open slots yet — check back after they post availability'}
                                        </p>
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-xs font-semibold"
                                            style={{ color: online ? 'var(--live)' : 'var(--muted)' }}>
                                            <span className="w-2 h-2 rounded-full"
                                                style={{ background: online ? 'var(--live)' : 'var(--border)', animation: online ? 'pulse 2s infinite' : 'none' }} />
                                            {online ? 'Available Now' : 'Offline'}
                                        </span>

                                        <button
                                            onClick={() => setModalAstro(astro)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                                            style={online
                                                ? { background: 'var(--gold)', color: '#0A0A0A' }
                                                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }
                                            }>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                                            </svg>
                                            {online ? 'Book Slot' : 'View'}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default SlotBrowsePage
