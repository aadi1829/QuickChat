import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import assets from '../assets/assets'
import toast from 'react-hot-toast'

const ChatContainer = () => {
    const {
        messages, selectedUser, setSelectedUser, sendMessage, getMessages,
        loadOlderMessages, hasMoreMessages,
        remainingSeconds, setRemainingSeconds, users,
        leaveSession,
    } = useContext(ChatContext)
    const { authUser, onlineUsers, socket, axios } = useContext(AuthContext)

    const navigate     = useNavigate()
    const scrollEnd    = useRef(null)
    const lastMsgIdRef = useRef(null)
    const fileInputRef = useRef(null)

    const [input,              setInput]              = useState('')
    const [loadingOlder,       setLoadingOlder]       = useState(false)
    const [imagePreview,       setImagePreview]       = useState(null)
    const [isSending,          setIsSending]          = useState(false)
    const [showRating,         setShowRating]         = useState(false)
    const [ratingStars,        setRatingStars]        = useState(5)
    const [ratingBusy,         setRatingBusy]         = useState(false)
    const [lastBookingIdToRate, setLastBookingIdToRate] = useState(null)
    const [showLeaveConfirm,   setShowLeaveConfirm]   = useState(false)
    const RATING_KEY = 'qc_pending_rating'

    // Set to true right before a voluntary leave so session_expired skips the rating modal
    const isManualLeaveRef = useRef(false)

    /* ── session expiry handler ── */
    useEffect(() => {
        if (!socket) return
        const onExpired = ({ bookingId } = {}) => {
            // Voluntary leaves are already handled in confirmLeave — skip modal/toast.
            if (isManualLeaveRef.current) {
                isManualLeaveRef.current = false
                return
            }
            if (authUser?.role === 'client') {
                toast('⏱ Session ended', { duration: 3000 })
                const canRate = !!bookingId && selectedUser?.isPaidUser === true
                if (canRate) {
                    try { sessionStorage.setItem(RATING_KEY, JSON.stringify({ bookingId })) } catch { /* ignore */ }
                    setRatingStars(5)
                    setLastBookingIdToRate(bookingId)
                    setShowRating(true)
                }
                setTimeout(() => {
                    setSelectedUser(null); setRemainingSeconds(null)
                    navigate('/slots?from=session')
                }, 1800)
            } else {
                toast('⏱ Session ended — ready for next client', { duration: 3000 })
                setSelectedUser(null); setRemainingSeconds(null)
            }
        }
        socket.on('session_expired', onExpired)
        return () => socket.off('session_expired', onExpired)
    }, [socket, authUser, navigate, setSelectedUser, setRemainingSeconds, selectedUser])

    useEffect(() => { if (selectedUser) getMessages(selectedUser._id) }, [selectedUser, getMessages])

    useEffect(() => {
        if (!messages.length) {
            lastMsgIdRef.current = null;
            return;
        }
        const lastId = messages[messages.length - 1]?._id;
        if (lastMsgIdRef.current === lastId) return;
        lastMsgIdRef.current = lastId;
        scrollEnd.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages])

    const isExpired      = remainingSeconds === 0
    const isNotStarted   = remainingSeconds === null
    const isClientLocked = authUser?.role === 'client' && isNotStarted
    const isDisabled     = isExpired || isClientLocked || isSending
    const sessionActive  = remainingSeconds !== null && remainingSeconds > 0

    /* ── Browser-back guard: push a sentinel history entry while session is live,
       then intercept popstate so users can't accidentally lose their session.     ── */
    useEffect(() => {
        if (!sessionActive || !selectedUser) return
        window.history.pushState({ __qcGuard: true }, '')
        const onPop = () => {
            // Re-push so the URL / history stack stays intact
            window.history.pushState({ __qcGuard: true }, '')
            setShowLeaveConfirm(true)
        }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [sessionActive, selectedUser])

    /* ── Back-button action ── */
    const handleBack = () => {
        if (sessionActive) {
            setShowLeaveConfirm(true)
        } else {
            setSelectedUser(null)
        }
    }

    /* ── Confirmed leave: emit leave_session → server ends booking → session_expired fires ── */
    const confirmLeave = () => {
        setShowLeaveConfirm(false)
        isManualLeaveRef.current = true
        leaveSession()              // tells server to end booking and notify other party
        setSelectedUser(null)       // immediately close chat on this side
        setRemainingSeconds(null)
    }

    const formatTime = (secs) => {
        if (secs === null || secs < 0) return '00:00'
        return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
    }

    const handleSend = async (e) => {
        e?.preventDefault()
        if (isDisabled || (!input.trim() && !imagePreview)) return
        setIsSending(true)
        try {
            const p = {}
            if (input.trim()) p.text = input.trim()
            if (imagePreview?.file) p.imageFile = imagePreview.file
            await sendMessage(p)
            setInput(''); setImagePreview(null)
        } finally { setIsSending(false) }
    }
    const handleImage = (e) => {
        const f = e.target.files[0]
        if (!f?.type.startsWith('image/')) { toast.error('Select an image file'); return }
        const r = new FileReader()
        r.onloadend = () => setImagePreview({ dataUrl: r.result, file: f })
        r.readAsDataURL(f)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }
    const onKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) handleSend(e) }
    const isMyMsg   = (msg) => String(msg?.senderId) === String(authUser?._id)

    /* ── Timer color ── */
    const timerStyle = isExpired
        ? { color: 'var(--danger)', borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)' }
        : remainingSeconds !== null && remainingSeconds < 30
            ? { color: '#FBBF24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }
            : { color: 'var(--gold)', borderColor: 'var(--gold-dim)', background: 'rgba(196,163,90,0.06)' }

    /* ── Empty state ── */
    if (!selectedUser) {
        return (
            <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
                {/* User chips strip */}
                <div className="pt-6 pb-4 px-4 shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex gap-4 justify-center min-w-max mx-auto">
                        {users.slice(0, 7).map((user, i) => (
                            <button key={i} onClick={() => setSelectedUser(user)}
                                className="flex flex-col items-center gap-2 group shrink-0">
                                <div className="relative w-12 h-12 rounded-2xl overflow-hidden transition-all"
                                    style={{ border: '1px solid var(--border)' }}
                                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                                    <img src={user.profilePic || assets.avatar_icon} alt="" className="w-full h-full object-cover" />
                                    {onlineUsers.includes(user._id) && (
                                        <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2"
                                            style={{ background: 'var(--live)', borderColor: 'var(--surface)' }} />
                                    )}
                                </div>
                                <span className="text-[10px] truncate max-w-[52px] text-center font-medium" style={{ color: 'var(--muted)' }}>
                                    {user.fullName?.split(' ')[0]}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Center */}
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                    </div>
                    <div>
                        <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--text)' }}>
                            {authUser?.role === 'astrologer' ? 'Your Workspace' : 'Reach Your Astrologer'}
                        </h2>
                        <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
                            {authUser?.role === 'astrologer'
                                ? 'Fetch the next client from your queue to begin a consultation.'
                                : 'Select an astrologer from the list to browse their available slots.'}
                        </p>
                    </div>
                    {authUser?.role === 'astrologer' ? (
                        <button onClick={() => navigate('/manage-slots')} className="btn-gold">
                            Open Workspace →
                        </button>
                    ) : (
                        <button onClick={() => navigate('/slots')} className="btn-gold">
                            Browse Astrologers →
                        </button>
                    )}
                </div>

                <div className="py-4 text-center text-[10px] select-none tracking-[0.2em] uppercase"
                    style={{ color: 'var(--muted)' }}>QuickChat · Astro</div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full relative" style={{ background: 'var(--bg)' }}>

            {/* ── Rating modal (client) ── */}
            {showRating && authUser?.role === 'client' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 fade-up"
                    style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
                        <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2"
                            style={{ color: 'var(--gold)' }}>// RATE SESSION</p>
                        <h3 className="font-black text-xl mb-2" style={{ color: 'var(--text)' }}>
                            Rate {selectedUser?.fullName?.split(' ')?.[0] ?? 'your astrologer'}
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
                                onClick={() => setShowRating(false)}
                                className="btn-ghost flex-1">
                                Later
                            </button>
                            <button
                                type="button"
                                disabled={ratingBusy}
                                onClick={async () => {
                                    setRatingBusy(true)
                                    try {
                                        if (!lastBookingIdToRate) throw new Error('Missing booking id')
                                        const { data } = await axios.post(`/api/bookings/${lastBookingIdToRate}/rate`, { stars: ratingStars })
                                        if (data.success) toast.success(data.message || 'Rated')
                                        else toast.error(data.message || 'Rating failed')
                                        setShowRating(false)
                                        try { sessionStorage.removeItem(RATING_KEY) } catch { /* ignore */ }
                                    } catch (err) {
                                        const status = err?.response?.status
                                        const msg = err.response?.data?.message || err.message || 'Rating failed'
                                        // If already rated (multi-submit / multi-tab), treat as success UX
                                        if (status === 409) {
                                            toast.success('Already rated. Thanks!')
                                            setShowRating(false)
                                            try { sessionStorage.removeItem(RATING_KEY) } catch { /* ignore */ }
                                        } else {
                                            toast.error(msg)
                                            setShowRating(false)
                                        }
                                    } finally {
                                        setRatingBusy(false)
                                        setLastBookingIdToRate(null)
                                    }
                                }}
                                className="btn-gold flex-1">
                                {ratingBusy ? 'Submitting…' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Leave-session confirmation modal ── */}
            {showLeaveConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 fade-up"
                    style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(10px)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                            </svg>
                        </div>

                        <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-1"
                            style={{ color: 'var(--danger)' }}>// ACTIVE SESSION</p>
                        <h3 className="font-black text-xl mb-2" style={{ color: 'var(--text)' }}>
                            Leave session?
                        </h3>
                        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                            Your session is still active. Leaving now will end it immediately for both parties
                            and the remaining time will be lost.
                        </p>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowLeaveConfirm(false)}
                                className="btn-ghost flex-1">
                                Stay
                            </button>
                            <button
                                type="button"
                                onClick={confirmLeave}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black transition-all"
                                style={{ background: 'rgba(248,113,113,0.14)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.35)' }}>
                                Leave Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Session Expired Overlay ── */}
            {isExpired && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center fade-up"
                    style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(8px)' }}>
                    <div className="text-center space-y-5">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                            </svg>
                        </div>
                        <div>
                            <p className="font-black text-lg" style={{ color: 'var(--text)' }}>Session Expired</p>
                            <p className="text-sm mt-1 tracking-wider uppercase font-medium" style={{ color: 'var(--muted)' }}>
                                Messaging Disabled
                            </p>
                        </div>
                        {authUser?.role === 'client' ? (
                            <button onClick={() => { setSelectedUser(null); setRemainingSeconds(null); navigate('/slots?from=session') }}
                                className="btn-gold">
                                View Paid Options →
                            </button>
                        ) : (
                            <button onClick={() => { setSelectedUser(null); setRemainingSeconds(null); navigate('/manage-slots') }}
                                className="w-full px-6 py-3 rounded-xl text-sm font-black transition-colors"
                                style={{ background: 'rgba(74,222,128,0.12)', color: 'var(--live)', border: '1px solid rgba(74,222,128,0.3)' }}>
                                ⚡ Fetch Next Client
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3.5 shrink-0 z-10"
                style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="relative">
                    <img src={selectedUser.profilePic || assets.avatar_icon} alt=""
                        className="w-10 h-10 rounded-xl object-cover"
                        style={{ border: '1px solid var(--border)' }} />
                    {onlineUsers.includes(selectedUser._id) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                            style={{ background: 'var(--live)', borderColor: 'var(--surface)' }} />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{selectedUser.fullName}</p>
                    <p className="text-xs font-medium"
                        style={{ color: remainingSeconds !== null ? 'var(--live)' : onlineUsers.includes(selectedUser._id) ? 'var(--live)' : 'var(--muted)' }}>
                        {remainingSeconds !== null ? 'Live Session' : onlineUsers.includes(selectedUser._id) ? 'Online' : 'Offline'}
                    </p>
                </div>

                {/* Countdown timer */}
                {remainingSeconds !== null && (
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono font-black text-sm tabular-nums
                        ${isExpired ? 'timer-urgent' : remainingSeconds < 30 ? 'timer-urgent' : ''}`}
                        style={timerStyle}>
                        {!isExpired && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'currentColor' }} />}
                        {formatTime(remainingSeconds)}
                    </div>
                )}

                <button onClick={handleBack}
                    className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5">
                        <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
                    </svg>
                </button>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1" style={{ background: 'var(--bg)' }}>
                {hasMoreMessages && (
                    <div className="flex justify-center pb-3">
                        <button
                            type="button"
                            disabled={loadingOlder || !messages[0]?._id}
                            onClick={async () => {
                                const before = messages[0]?._id;
                                if (!before) return;
                                setLoadingOlder(true);
                                try {
                                    await loadOlderMessages(before);
                                } finally {
                                    setLoadingOlder(false);
                                }
                            }}
                            className="text-xs font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                            style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                color: "var(--muted)",
                            }}>
                            {loadingOlder ? "Loading…" : "Load earlier messages"}
                        </button>
                    </div>
                )}
                {isClientLocked && messages.length === 0 && (
                    <div className="flex justify-center mt-8">
                        <div className="px-5 py-4 rounded-2xl max-w-xs text-center"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <p className="text-sm" style={{ color: 'var(--muted)' }}>
                                Waiting for the astrologer to start your session…
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const mine       = isMyMsg(msg)
                    const showAvatar = i === 0 || messages[i - 1]?.senderId !== msg.senderId
                    const avatar     = mine
                        ? authUser?.profilePic || assets.avatar_icon
                        : selectedUser?.profilePic || assets.avatar_icon

                    return (
                        <div key={msg._id || i} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                            {!mine && (
                                <div className="w-7 h-7 shrink-0 mb-1">
                                    {showAvatar
                                        ? <img src={avatar} alt="" className="w-7 h-7 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} />
                                        : <div className="w-7" />}
                                </div>
                            )}
                            <div className={`flex flex-col max-w-[68%] ${mine ? 'items-end' : 'items-start'}`}>
                                {msg.image && (
                                    <img src={msg.image} alt="shared"
                                        className={`max-w-[200px] rounded-2xl cursor-pointer hover:opacity-80 transition mb-0.5
                                            ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                                        style={{ border: '1px solid var(--border)' }}
                                        onClick={() => window.open(msg.image, '_blank')} />
                                )}
                                {msg.text && (
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                                        ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                                        style={mine
                                            ? { background: 'var(--gold)', color: '#0A0A0A' }
                                            : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }
                                        }>
                                        {msg.text}
                                    </div>
                                )}
                                <span className="text-[10px] mt-1 px-1" style={{ color: 'var(--muted)' }}>
                                    {formatMessageTime(msg.createdAt)}
                                    {mine && <span className="ml-1">{msg.seen ? '✓✓' : '✓'}</span>}
                                </span>
                            </div>
                            {mine && (
                                <div className="w-7 h-7 shrink-0 mb-1">
                                    {showAvatar
                                        ? <img src={avatar} alt="" className="w-7 h-7 rounded-lg object-cover" style={{ border: '1px solid var(--border)' }} />
                                        : <div className="w-7" />}
                                </div>
                            )}
                        </div>
                    )
                })}
                <div ref={scrollEnd} />
            </div>

            {/* ── Image preview ── */}
            {imagePreview && (
                <div className="px-4 pb-2 shrink-0" style={{ background: 'var(--surface)' }}>
                    <div className="relative inline-block">
                        <img src={imagePreview.dataUrl} alt=""
                            className="h-16 rounded-xl object-cover"
                            style={{ border: '1px solid var(--border)' }} />
                        <button onClick={() => setImagePreview(null)}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs flex items-center justify-center transition-colors"
                            style={{ background: 'var(--danger)', color: 'white' }}>
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ── Input ── */}
            <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-center gap-2 rounded-2xl px-3 py-2 transition-all"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={isDisabled} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isDisabled}
                        className="p-1.5 rounded-xl transition-colors shrink-0"
                        style={{ opacity: isDisabled ? 0.3 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer', color: 'var(--muted)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                        </svg>
                    </button>
                    <input
                        type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown}
                        placeholder={isExpired ? 'Session expired' : isClientLocked ? 'Waiting for your session…' : 'Type a message'}
                        disabled={isDisabled}
                        className="flex-1 bg-transparent text-sm outline-none"
                        style={{ color: 'var(--text)', opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'text' }}
                    />
                    <button type="button" onClick={handleSend}
                        disabled={isDisabled || (!input.trim() && !imagePreview)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0"
                        style={isDisabled || (!input.trim() && !imagePreview)
                            ? { opacity: 0.25, cursor: 'not-allowed', background: 'transparent' }
                            : { background: 'var(--gold)', color: '#0A0A0A' }
                        }>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChatContainer
