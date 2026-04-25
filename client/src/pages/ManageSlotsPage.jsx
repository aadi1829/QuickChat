import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

/* ─── helpers ── */
const AVATAR_COLORS = ['#C4A35A','#8B7CF6','#E07B7B','#5BA8D0','#D09A5B','#5BB8A0','#C47BAA','#7B9DD0']
function getAvatarColor(n = '') { return AVATAR_COLORS[n.charCodeAt(0) % AVATAR_COLORS.length] }
function getInitials(n = '')    { return n.split(' ').slice(0, 2).map(x => x[0] ?? '').join('').toUpperCase() }

const clock12 = { hour: 'numeric', minute: '2-digit', hour12: true }

/** 12-hour time, e.g. 12:00 PM */
function fmtTime12(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString(undefined, clock12)
}

/** Short date + 12-hour range on one line */
function fmtSlotRange12(startIso, endIso) {
    if (!startIso || !endIso) return '—'
    const a = new Date(startIso)
    const b = new Date(endIso)
    return `${a.toLocaleTimeString(undefined, clock12)} – ${b.toLocaleTimeString(undefined, clock12)}`
}

/** Booked users in slot (waiting + active), prefer live queue */
function slotBookedCount(slot, queues) {
    const q = queues[slot._id]
    if (Array.isArray(q)) return q.filter((e) => e.status === 'waiting' || e.status === 'active').length
    return Number(slot.queueCount) || 0
}

/** e.g. Mon, Apr 19, 2026 */
function fmtDateLong(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Full local datetime with AM/PM */
function fmtDateTime12(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...clock12 })
}

/** e.g. 2:47 from actual Booking duration; falls back to 3:00 if unknown */
function fmtDuration(secs) {
    if (!secs || secs <= 0) return '3:00'
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/** Parse `YYYY-MM-DDTHH:mm` from datetime-local as local wall time */
function parseDatetimeLocal(str) {
    if (!str || str.length < 16) return null
    const [d, t] = str.split('T')
    const [y, mo, da] = d.split('-').map(Number)
    const [h, mi] = t.split(':').map(Number)
    if ([y, mo, da, h, mi].some((n) => Number.isNaN(n))) return null
    return new Date(y, mo - 1, da, h, mi, 0, 0)
}

/** Value for `<input type="datetime-local" />` in the user's local timezone */
function toDatetimeLocalValue(d) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Round up to next 15-minute boundary (production-friendly slot grid)
function roundUpToQuarterHour(d) {
    const t = new Date(d)
    t.setSeconds(0, 0)
    const minutes = t.getMinutes()
    const next = Math.ceil(minutes / 15) * 15
    if (next === 60) {
        t.setHours(t.getHours() + 1)
        t.setMinutes(0, 0, 0)
        return t
    }
    t.setMinutes(next, 0, 0)
    return t
}

function isEndAfterStart(startStr, endStr) {
    const s = parseDatetimeLocal(startStr)
    const e = parseDatetimeLocal(endStr)
    if (!s || !e) return true
    return e.getTime() > s.getTime()
}

/** Ignore stale HTTP queue responses (race: initial load vs socket-triggered refetch). */
function shouldApplyQueueSnapshot(ref, slotId, queueSnapshotAt) {
    if (queueSnapshotAt == null) return true
    const last = ref.current[slotId]
    if (last != null && queueSnapshotAt < last) return false
    ref.current[slotId] = queueSnapshotAt
    return true
}

/* ─── Stat Card ── */
const StatCard = ({ label, value, icon, live = false }) => (
    <div className="rounded-2xl p-5 flex items-center justify-between"
        style={{
            background:   live ? 'rgba(74,222,128,0.05)' : 'var(--card)',
            border:       `1px solid ${live ? 'rgba(74,222,128,0.2)' : 'var(--border)'}`,
        }}>
        <div>
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-1" style={{ color: 'var(--muted)' }}>{label}</p>
            <p className="font-black text-3xl tabular-nums" style={{ color: live ? 'var(--live)' : 'var(--text)' }}>{value ?? '—'}</p>
        </div>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: live ? 'rgba(74,222,128,0.08)' : 'var(--surface)', border: '1px solid var(--border)' }}>
            {icon}
        </div>
    </div>
)

/* ─── Queue Row ── */
const QueueRow = ({ entry, index, isNextUp, onFetch, onSkip, fetching, skipping }) => {
    const color    = getAvatarColor(entry.clientId?.fullName ?? '')
    const initials = getInitials(entry.clientId?.fullName ?? '')

    if (isNextUp) {
        return (
            <div className="rounded-2xl p-4 flex items-center gap-4 glow-live"
                style={{ background: 'rgba(74,222,128,0.05)', border: '2px solid rgba(74,222,128,0.25)' }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: color + '22', border: `1px solid ${color}44` }}>
                    {entry.clientId?.profilePic
                        ? <img src={entry.clientId.profilePic} alt="" className="w-full h-full object-cover rounded-2xl" />
                        : <span className="font-black text-lg" style={{ color }}>{initials}</span>
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-0.5" style={{ color: 'var(--live)' }}>
                        NEXT UP #{index + 1}
                    </p>
                    <p className="font-black text-base truncate" style={{ color: 'var(--text)' }}>
                        {entry.clientId?.fullName ?? 'Client'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        Joined {entry.createdAt ? fmtTime12(entry.createdAt) : '—'}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onFetch} disabled={fetching || skipping}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all"
                        style={fetching || skipping
                            ? { background: 'rgba(74,222,128,0.08)', color: 'var(--live)', cursor: 'wait', border: '1px solid rgba(74,222,128,0.3)' }
                            : { background: 'var(--live)', color: '#0A0A0A', border: 'none' }
                        }>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                        {fetching ? 'Connecting…' : 'FETCH CLIENT'}
                    </button>
                    <button
                        onClick={onSkip} disabled={skipping || fetching}
                        className="px-4 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all"
                        style={skipping || fetching
                            ? { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'wait' }
                            : { background: 'rgba(248,113,113,0.10)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.25)' }
                        }>
                        {skipping ? 'Skipping…' : 'SKIP'}
                    </button>
                </div>
            </div>
        )
    }

    const statusColors = {
        active:    { bg: 'rgba(74,222,128,0.06)',  text: 'var(--live)',   label: 'ACTIVE' },
        completed: { bg: 'var(--surface)',          text: 'var(--muted)',  label: 'DONE'   },
        skipped:   { bg: 'rgba(248,113,113,0.06)', text: 'var(--danger)', label: 'SKIPPED'},
        waiting:   { bg: 'var(--surface)',          text: 'var(--muted)',  label: 'WAITING'},
    }
    const sc = statusColors[entry.status] ?? statusColors.waiting

    return (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-sm font-bold w-6 text-right shrink-0" style={{ color: 'var(--muted)' }}>#{index + 1}</span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: color + '22', border: `1px solid ${color}44` }}>
                {entry.clientId?.profilePic
                    ? <img src={entry.clientId.profilePic} alt="" className="w-full h-full object-cover rounded-xl" />
                    : <span className="font-bold text-xs" style={{ color }}>{initials}</span>
                }
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                    {entry.clientId?.fullName ?? 'Client'}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{entry.createdAt ? fmtTime12(entry.createdAt) : ''}</p>
            </div>
            <span className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-lg"
                style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.bg}` }}>
                {sc.label}
            </span>
        </div>
    )
}

/* ─── Main ── */
const ManageSlotsPage = () => {
    const { axios, socket } = useContext(AuthContext)
    const navigate = useNavigate()

    const [slots,      setSlots]      = useState([])
    const [loading,    setLoading]    = useState(true)
    const [creating,   setCreating]   = useState(false)
    const [showForm,   setShowForm]   = useState(false)
    const [fetching,   setFetching]   = useState(false)
    const [skipping,   setSkipping]   = useState(false)
    const [queues,     setQueues]     = useState({})
    const [extendMins, setExtendMins] = useState({})
    const [form,       setForm]       = useState({ startAt: '', endAt: '', maxClients: 10 })
    const queueSnapshotAppliedRef = useRef({})

    const applyQueueSnapshot = useCallback((slotId, queue, queueSnapshotAt) => {
        if (!shouldApplyQueueSnapshot(queueSnapshotAppliedRef, slotId, queueSnapshotAt)) return
        setQueues((p) => ({ ...p, [slotId]: queue }))
    }, [])

    const fetchSlots = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/slots')
            if (!data.success) return
            setSlots(data.slots)
            const rel = data.slots.filter((s) => s.status === 'active' || s.status === 'open')
            const pairs = await Promise.all(
                rel.map(async (s) => {
                    try {
                        const r = await axios.get(`/api/slots/${s._id}/queue`)
                        return r.data.success
                            ? [s._id, r.data.queue, r.data.queueSnapshotAt]
                            : null
                    } catch {
                        return null
                    }
                })
            )
            for (const p of pairs) {
                if (!p) continue
                const [slotId, queue, queueSnapshotAt] = p
                applyQueueSnapshot(slotId, queue, queueSnapshotAt)
            }
        } catch {
            toast.error('Failed to load slots')
        } finally {
            setLoading(false)
        }
    }, [axios, applyQueueSnapshot])

    const applySlotPreset = (startInMin, durationMin) => {
        const start = roundUpToQuarterHour(new Date(Date.now() + startInMin * 60_000))
        const end = new Date(start.getTime() + durationMin * 60_000)
        setForm((f) => ({
            ...f,
            startAt: toDatetimeLocalValue(start),
            endAt:   toDatetimeLocalValue(end),
        }))
        setShowForm(true)
    }

    /** Start at the next full hour (local), lasting `durationMin` minutes */
    const applyNextHourSlot = (durationMin) => {
        const now = new Date()
        const start = new Date(now)
        start.setMinutes(0, 0, 0)
        start.setHours(start.getHours() + 1)
        const end = new Date(start.getTime() + durationMin * 60_000)
        setForm((f) => ({
            ...f,
            startAt: toDatetimeLocalValue(start),
            endAt:   toDatetimeLocalValue(end),
        }))
        setShowForm(true)
    }

    const handleStartChange = (nextStartAt) => {
        setForm((f) => {
            const next = { ...f, startAt: nextStartAt }
            if (next.endAt && !isEndAfterStart(next.startAt, next.endAt)) {
                const s = parseDatetimeLocal(next.startAt)
                if (s) next.endAt = toDatetimeLocalValue(new Date(s.getTime() + 45 * 60_000))
            }
            return next
        })
    }

    const handleEndChange = (nextEndAt) => {
        setForm((f) => ({ ...f, endAt: nextEndAt }))
    }
    const fetchQueue = useCallback(async (slotId) => {
        if (!slotId) return
        try {
            const { data } = await axios.get(`/api/slots/${slotId}/queue`)
            if (data.success) applyQueueSnapshot(slotId, data.queue, data.queueSnapshotAt)
        } catch { toast.error('Failed to load queue') }
    }, [axios, applyQueueSnapshot])

    useEffect(() => { fetchSlots() }, [fetchSlots])

    /* ── socket ── */
    useEffect(() => {
        if (!socket) return
        const onQueueUpdated = ({ slotId: sid }) => {
            if (sid) fetchQueue(sid)
        }
        const onFetchResult = ({ success, message }) => {
            setFetching(false)
            if (success) {
                toast.success('Client fetched — navigating to chat…', { duration: 2000 })
            } else {
                toast.error(message || 'Could not fetch next client.')
            }
        }
        const onSkipResult = ({ success, message }) => {
            setSkipping(false)
            if (!success) toast.error(message || 'Could not skip client.')
            else toast.success('Client skipped — queue advanced')
        }
        socket.on('queue_updated',          onQueueUpdated)
        socket.on('slot_closed',            fetchSlots)
        socket.on('astrologer_fetch_result', onFetchResult)
        socket.on('astrologer_skip_result',  onSkipResult)
        socket.on('slot_ending_soon', ({ minutesLeft }) => toast(`Slot ends in ${minutesLeft} min`, { icon: '⏱' }))
        return () => {
            socket.off('queue_updated',          onQueueUpdated)
            socket.off('slot_closed',            fetchSlots)
            socket.off('astrologer_fetch_result', onFetchResult)
            socket.off('astrologer_skip_result',  onSkipResult)
            socket.off('slot_ending_soon')
        }
    }, [socket, fetchQueue, fetchSlots])

    useEffect(() => {
        if (!socket) return
        const onActivated = () => navigate('/')
        socket.on('client_activated', onActivated)
        return () => socket.off('client_activated', onActivated)
    }, [socket, navigate])

    /* ── actions ── */
    const handleFetchNext = async (slotId) => {
        if (fetching) return
        setFetching(true)
        if (socket?.connected) {
            // Primary path: socket gives real-time result + server pushes events to both parties
            socket.emit('astrologer_fetch_client', { slotId })
            // Clear spinner after 8s if astrologer_fetch_result never arrives (safety net)
            setTimeout(() => setFetching(false), 8000)
        } else {
            // HTTP fallback: socket offline, use REST endpoint; events still delivered via socket to client
            try {
                const { data } = await axios.post(`/api/slots/${slotId}/fetch-next`)
                setFetching(false)
                if (data.success) {
                    toast.success('Client fetched — navigating to chat…', { duration: 2000 })
                    // client_activated fires via socket; navigate as backup in case socket handler missed
                    setTimeout(() => navigate('/'), 1500)
                } else {
                    toast.error(data.message || 'Could not fetch next client.')
                }
            } catch (err) {
                setFetching(false)
                toast.error(err.response?.data?.message || err.message || 'Could not fetch next client.')
            }
        }
    }

    const handleSkipNext = (slotId) => {
        if (!window.confirm('Skip this client? They will be moved to the end of their queue and notified.')) return
        setSkipping(true)
        socket?.emit('astrologer_skip_next', { slotId })
        setTimeout(() => setSkipping(false), 8000)
    }
    const handleCreateSlot = async (e) => {
        e.preventDefault(); setCreating(true)
        try {
            if (!form.startAt || !form.endAt) {
                toast.error('Please select start and end time')
                return
            }
            if (!isEndAfterStart(form.startAt, form.endAt)) {
                toast.error('End time must be after start time')
                return
            }
            const { data } = await axios.post('/api/slots', { startAt: form.startAt, endAt: form.endAt, maxClients: Number(form.maxClients) })
            if (data.success) { toast.success('Slot created!'); setShowForm(false); setForm({ startAt: '', endAt: '', maxClients: 10 }); fetchSlots() }
            else toast.error(data.message)
        } catch (err) { toast.error(err.response?.data?.message || err.message) }
        finally { setCreating(false) }
    }
    const handleExtend = async (slotId) => {
        const mins = Number(extendMins[slotId])
        if (!mins || mins <= 0) return toast.error('Enter positive minutes')
        try {
            const { data } = await axios.post(`/api/slots/${slotId}/extend`, { minutes: mins })
            if (data.success) { toast.success(`Extended by ${mins} min`); fetchSlots(); setExtendMins(p => ({ ...p, [slotId]: '' })) }
        } catch (err) { toast.error(err.response?.data?.message || err.message) }
    }
    const handleCancelRemaining = async (slotId) => {
        if (!confirm('Cancel all waiting clients?')) return
        try {
            const { data } = await axios.post(`/api/slots/${slotId}/cancel-remaining`)
            if (data.success) { toast.success('Queue cancelled'); fetchSlots() }
        } catch (err) { toast.error(err.response?.data?.message || err.message) }
    }

    /* ── derived ── */
    const todaySlots = slots
        .filter((s) => {
            const d = new Date(s.startAt)
            const n = new Date()
            return d.toDateString() === n.toDateString() || s.status === 'active' || s.status === 'open'
        })
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    const activeSlot  = slots.find(s => s.status === 'active')
    const openSlot    = !activeSlot ? slots.find(s => s.status === 'open') : null
    const currentSlot = activeSlot ?? openSlot
    const inQueueCount = currentSlot ? (queues[currentSlot._id] ?? []).filter(e => e.status === 'waiting').length : 0
    const doneToday    = Object.values(queues).flat().filter(e => e.status === 'completed').length
    const activeQueue  = currentSlot ? (queues[currentSlot._id] ?? []).filter(e => e.status === 'waiting' || e.status === 'active') : []
    const allHistory   = Object.values(queues).flat().filter(e => e.status === 'completed').slice(0, 10)

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

            <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">

                {/* ── Heading ── */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                    <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2"
                        style={{ color: 'var(--gold)' }}>// DASHBOARD</p>
                    <h1 className="font-black text-3xl" style={{ color: 'var(--text)' }}>Your Workspace</h1>
                    <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--muted)' }}>
                        Create a time window with start and end times. Clients see you on Discover as soon as you have an open or live slot in that window.
                    </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {currentSlot && (
                            <div
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                                style={
                                    activeSlot
                                        ? { background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)" }
                                        : { background: "rgba(196,163,90,0.08)", border: "1px solid var(--gold-dim)" }
                                }
                            >
                                <span
                                    className="w-2 h-2 rounded-full animate-pulse"
                                    style={{ background: activeSlot ? "var(--live)" : "var(--gold)" }}
                                />
                                <span
                                    className="text-xs font-bold tracking-widest"
                                    style={{ color: activeSlot ? "var(--live)" : "var(--gold)" }}
                                >
                                    {activeSlot ? "LIVE" : "UPCOMING"}
                                </span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setShowForm((v) => !v)}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all"
                            style={{ background: showForm ? "var(--gold-dim)" : "var(--gold)", color: "#0A0A0A" }}
                        >
                            <span className="text-base leading-none">+</span>
                            New Slot
                        </button>
                    </div>
                </div>

                {!loading && slots.length === 0 && (
                    <div className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 fade-up"
                        style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid var(--gold-dim)' }}>
                        <div>
                            <p className="font-bold text-sm mb-1" style={{ color: 'var(--gold)' }}>Clients cannot book until you add availability</p>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                                Use a quick preset below or set custom times, then create your first slot.
                            </p>
                        </div>
                        <button type="button" onClick={() => { setShowForm(true); applySlotPreset(2, 45) }}
                            className="btn-gold whitespace-nowrap shrink-0">
                            Open slot wizard →
                        </button>
                    </div>
                )}

                {/* ── Stats ── */}
                <div className="grid grid-cols-3 gap-4">
                    <StatCard
                        label="In Queue" value={inQueueCount}
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                    />
                    <StatCard
                        label="Done Today" value={doneToday} live
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--live)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>}
                    />
                    <StatCard
                        label={activeSlot ? 'Active Slot' : 'Next Slot'} value={currentSlot ? fmtTime12(currentSlot.startAt) : '—'}
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>}
                    />
                </div>

                {/* ── Create Slot Form ── */}
                {showForm && (
                    <div className="rounded-2xl p-6 fade-up"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1"
                            style={{ color: 'var(--gold)' }}>// NEW SLOT</p>
                        <h2 className="font-black text-xl mb-2" style={{ color: 'var(--text)' }}>Create availability</h2>
                        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                            Pick start and end below. Preview shows 12-hour time in your timezone. The slot goes live automatically when start time is reached.
                        </p>

                        <div className="flex flex-wrap gap-2 mb-5">
                            {[
                                { label: 'Soon · 45m', start: 2,  dur: 45 },
                                { label: 'Soon · 1h',  start: 5,  dur: 60 },
                                { label: 'Soon · 90m', start: 10, dur: 90 },
                            ].map((p) => (
                                <button
                                    key={p.label}
                                    type="button"
                                    onClick={() => applySlotPreset(p.start, p.dur)}
                                    className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                    onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
                                    onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}>
                                    {p.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => applyNextHourSlot(60)}
                                className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--gold-dim)' }}
                                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}>
                                Next hour · 1h
                            </button>
                        </div>

                        <form onSubmit={handleCreateSlot} className="grid sm:grid-cols-3 gap-4">
                            {[{ label: 'Start', key: 'startAt' }, { label: 'End', key: 'endAt' }].map(({ label, key }) => {
                                const parsed = parseDatetimeLocal(form[key])
                                const minEnd = key === 'endAt' && form.startAt ? form.startAt : undefined
                                return (
                                    <div key={key} className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold tracking-[0.15em] uppercase"
                                            style={{ color: 'var(--muted)' }}>{label}</label>
                                        <input type="datetime-local" value={form[key]}
                                            step={900}
                                            min={minEnd}
                                            onChange={e => (key === 'startAt' ? handleStartChange(e.target.value) : handleEndChange(e.target.value))}
                                            required
                                            className="dark-input" />
                                        {parsed && (
                                            <p className="text-[11px] leading-snug" style={{ color: 'var(--gold)' }}>
                                                {fmtDateLong(parsed)} · <span className="font-bold">{fmtTime12(parsed)}</span>
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold tracking-[0.15em] uppercase"
                                    style={{ color: 'var(--muted)' }}>Max clients in queue</label>
                                <input type="number" min="1" max="100" value={form.maxClients}
                                    onChange={e => setForm(f => ({ ...f, maxClients: e.target.value }))} required
                                    className="dark-input" />
                                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Tip: Slots work best in 15-min increments.</p>
                            </div>
                            <button type="submit" disabled={creating}
                                className="btn-gold sm:col-span-3">
                                {creating ? 'Creating…' : 'Create Slot →'}
                            </button>
                        </form>
                    </div>
                )}

                {/* ── Today's Slots ── */}
                <div className="rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1"
                        style={{ color: 'var(--gold)' }}>// SLOTS</p>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="font-black text-xl" style={{ color: 'var(--text)' }}>Your slots</h2>
                            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Today and any live or upcoming windows · times in 12-hour format</p>
                        </div>
                        <button type="button" onClick={() => { setLoading(true); fetchSlots() }}
                            title="Reload slots and queue counts"
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                            </svg>
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-6 h-6 border-2 rounded-full animate-spin"
                                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }} />
                        </div>
                    ) : todaySlots.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm" style={{ color: 'var(--muted)' }}>No slots today. Create one above.</p>
                        </div>
                    ) : (
                        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                            {todaySlots.map((slot) => {
                                const isActive = slot.status === 'active'
                                const q = queues[slot._id] ?? null
                                const booked = slotBookedCount(slot, queues)
                                const maxC = slot.maxClients ?? 10
                                const hasLiveSession = Array.isArray(q) && q.some((e) => e.status === 'active')
                                const waitingCount = Array.isArray(q) ? q.filter((e) => e.status === 'waiting').length : 0
                                const canFetchHere = isActive && !hasLiveSession && waitingCount > 0

                                return (
                                    <div key={slot._id}
                                        className={`shrink-0 w-[min(100%,13.5rem)] sm:w-56 rounded-2xl border-2 p-4 transition-all ${isActive ? 'glow-live' : ''}`}
                                        style={{
                                            background:   isActive ? 'rgba(74,222,128,0.05)' : 'var(--surface)',
                                            borderColor:  isActive ? 'rgba(74,222,128,0.3)'  : 'var(--border)',
                                        }}>
                                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                                            style={{ color: 'var(--muted)' }}>{fmtDateLong(slot.startAt)}</p>
                                        <p className="font-black text-base leading-tight mb-2" style={{ color: 'var(--text)' }}>
                                            {fmtSlotRange12(slot.startAt, slot.endAt)}
                                        </p>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            {isActive && <span className="w-2 h-2 rounded-full animate-pulse"
                                                style={{ background: 'var(--live)' }} />}
                                            <span className="text-[10px] font-bold tracking-widest uppercase"
                                                style={{ color: isActive ? 'var(--live)' : 'var(--muted)' }}>
                                                {isActive ? 'LIVE' : slot.status === 'open' ? 'UPCOMING' : slot.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text)' }}>
                                            {booked} / {maxC} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>users in slot</span>
                                        </p>
                                        <p className="text-[11px] mb-3" style={{ color: 'var(--muted)' }}>
                                            {waitingCount > 0 ? `${waitingCount} waiting` : 'No one waiting'}
                                            {hasLiveSession ? ' · Session in progress' : ''}
                                        </p>

                                        {isActive && (
                                            <button
                                                type="button"
                                                onClick={() => handleFetchNext(slot._id)}
                                                disabled={fetching || !canFetchHere}
                                                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black transition-all mb-2"
                                                style={fetching || !canFetchHere
                                                    ? { background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'not-allowed' }
                                                    : { background: 'var(--live)', color: '#0A0A0A', border: 'none' }
                                                }>
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                                                </svg>
                                                {fetching
                                                    ? 'Connecting…'
                                                    : hasLiveSession
                                                        ? 'Session in progress'
                                                        : waitingCount === 0
                                                            ? 'No clients waiting'
                                                            : 'Fetch next client'}
                                            </button>
                                        )}

                                        {/* Extend controls */}
                                        {isActive && slot.status !== 'closed' && (
                                            <div className="mt-1 flex gap-1 items-center">
                                                <span className="text-[10px] uppercase font-bold shrink-0" style={{ color: 'var(--muted)' }}>Extend</span>
                                                <input
                                                    type="number" min="1" placeholder="min"
                                                    value={extendMins[slot._id] || ''}
                                                    onChange={e => setExtendMins(p => ({ ...p, [slot._id]: e.target.value }))}
                                                    className="w-14 rounded-lg px-2 py-1 text-xs outline-none"
                                                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
                                                />
                                                <button type="button" onClick={() => handleExtend(slot._id)}
                                                    className="px-2 py-1 rounded-lg text-xs transition-colors"
                                                    style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                                                    +
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ── Queue Control ── */}
                {currentSlot && (
                    <div className="rounded-2xl p-6 fade-up"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1"
                            style={{ color: 'var(--gold)' }}>// QUEUE CONTROL</p>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-black text-xl" style={{ color: 'var(--text)' }}>Session Queue</h2>
                            <span className="px-3 py-1.5 rounded-xl text-xs font-bold"
                                style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                                {inQueueCount} waiting
                            </span>
                        </div>

                        {openSlot && (
                            <div className="mb-4 px-4 py-3 rounded-xl text-sm"
                                style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid var(--gold-dim)', color: 'var(--gold)' }}>
                                Slot starts at {fmtTime12(openSlot.startAt)} — activates automatically. You can fetch clients once it goes live.
                            </div>
                        )}

                        {activeQueue.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                                    No clients in queue yet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {activeQueue.map((entry, idx) => (
                                    <QueueRow
                                        key={entry._id}
                                        entry={entry}
                                        index={idx}
                                        isNextUp={idx === 0 && entry.status === 'waiting' && !!activeSlot}
                                        onFetch={() => handleFetchNext(currentSlot._id)}
                                        onSkip={() => handleSkipNext(currentSlot._id)}
                                        fetching={fetching}
                                        skipping={skipping}
                                    />
                                ))}
                            </div>
                        )}

                        {activeSlot && (
                            <div className="mt-5 pt-5 flex justify-end" style={{ borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => handleCancelRemaining(activeSlot._id)}
                                    className="text-xs font-semibold transition-colors"
                                    style={{ color: 'var(--muted)' }}
                                    onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
                                    onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}>
                                    Cancel Remaining Clients
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── History ── */}
                <div className="rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1"
                        style={{ color: 'var(--gold)' }}>// HISTORY</p>
                    <h2 className="font-black text-xl mb-5" style={{ color: 'var(--text)' }}>Recent Sessions</h2>

                    {allHistory.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>No completed sessions yet.</p>
                    ) : (
                        <div>
                            {allHistory.map((entry, idx) => {
                                const color    = getAvatarColor(entry.clientId?.fullName ?? '')
                                const initials = getInitials(entry.clientId?.fullName ?? '')
                                return (
                                    <div key={entry._id ?? idx}
                                        className="flex items-center gap-3 py-3.5"
                                        style={{ borderBottom: idx < allHistory.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ background: color + '22', border: `1px solid ${color}44` }}>
                                            {entry.clientId?.profilePic
                                                ? <img src={entry.clientId.profilePic} alt="" className="w-full h-full object-cover rounded-xl" />
                                                : <span className="font-bold text-sm" style={{ color }}>{initials}</span>
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                                                {entry.clientId?.fullName ?? 'Client'}
                                            </p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                                {entry.createdAt ? fmtDateTime12(entry.createdAt) : '—'}
                                            </p>
                                        </div>
                                        <span className="font-black text-sm tabular-nums" style={{ color: 'var(--live)' }}>
                                            {fmtDuration(entry.sessionDurationSecs)}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ── Footer shortcut ── */}
                <div className="flex items-center justify-between py-2">
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        Session complete? Open your next availability window.
                    </p>
                    <button onClick={() => setShowForm(true)}
                        className="btn-ghost text-xs px-4 py-2">
                        + Create New Slot
                    </button>
                </div>

            </div>
        </div>
    )
}

export default ManageSlotsPage
