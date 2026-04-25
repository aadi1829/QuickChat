import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../../context/AuthContext'
import { ChatContext } from '../../context/ChatContext'
import assets from '../assets/assets'

const clock12 = { hour: 'numeric', minute: '2-digit', hour12: true }
function fmtTime12(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString(undefined, clock12)
}
function estWaitLabel(pos, avgSecs = 180) {
    if (!pos || pos <= 1) return null
    const mins = Math.ceil(((pos - 1) * (avgSecs > 0 ? avgSecs : 180)) / 60)
    return `~${mins} min`
}

/* ─── Queue Banner widget (client-only) ── */
const QueueBanner = ({ queueState, onView, onJoin, onDismiss }) => {
    const { status, position, astrologer, avgSessionSeconds, queueEntryId, slotId } = queueState

    if (status === 'active') {
        return (
            <div className="mx-3 mb-2 p-3 rounded-2xl fade-up shrink-0"
                style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)' }}>
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--live)' }} />
                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase flex-1"
                        style={{ color: 'var(--live)' }}>Your Turn!</span>
                </div>
                <p className="text-xs mb-2.5" style={{ color: 'var(--muted)' }}>
                    {astrologer?.fullName
                        ? `${astrologer.fullName.split(' ')[0]} is ready for you`
                        : 'Your session is starting now'}
                </p>
                <button onClick={onJoin}
                    className="w-full py-2 rounded-xl text-xs font-black transition-all"
                    style={{ background: 'var(--live)', color: '#0A0A0A' }}>
                    Join Chat →
                </button>
            </div>
        )
    }

    if (status === 'waiting') {
        const wait = estWaitLabel(position, avgSessionSeconds)
        return (
            <div className="mx-3 mb-2 p-3 rounded-2xl shrink-0"
                style={{ background: 'rgba(196,163,90,0.06)', border: '1px solid var(--gold-dim)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--gold)' }} />
                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase flex-1"
                        style={{ color: 'var(--gold)' }}>In Queue</span>
                    {position !== null && (
                        <span className="font-black text-sm tabular-nums" style={{ color: 'var(--text)' }}>
                            #{position}
                        </span>
                    )}
                    <button onClick={onDismiss}
                        className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] transition-colors shrink-0"
                        style={{ color: 'var(--muted)', background: 'var(--surface)' }}>
                        ✕
                    </button>
                </div>
                <p className="text-xs mb-2.5" style={{ color: 'var(--muted)' }}>
                    {astrologer?.fullName
                        ? `Waiting for ${astrologer.fullName.split(' ')[0]}`
                        : 'Waiting for astrologer'}
                    {wait ? ` · ${wait}` : ''}
                </p>
                <button onClick={onView}
                    className="w-full py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: 'rgba(196,163,90,0.1)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(196,163,90,0.18)'}
                    onMouseOut={e => e.currentTarget.style.background = 'rgba(196,163,90,0.1)'}>
                    View Queue Position
                </button>
            </div>
        )
    }

    // cancelled / skipped — minimal dismissible notice
    return (
        <div className="mx-3 mb-2 p-3 rounded-2xl shrink-0"
            style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)' }}>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold flex-1" style={{ color: 'var(--danger)' }}>
                    {status === 'cancelled' ? 'Booking cancelled' : 'Turn was skipped'}
                </span>
                <button onClick={onDismiss}
                    className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] transition-colors shrink-0"
                    style={{ color: 'var(--muted)', background: 'var(--surface)' }}>
                    ✕
                </button>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                <button onClick={() => { onDismiss(); }}
                    className="underline underline-offset-2 transition-colors"
                    style={{ color: 'var(--muted)' }}>
                    Browse slots again →
                </button>
            </p>
        </div>
    )
}

const Sidebar = () => {
    const { getUsers, users, selectedUser, setSelectedUser, unseenMessages, setUnseenMessages, queueState, clearQueue } = useContext(ChatContext)
    const { logout, onlineUsers, authUser, axios } = useContext(AuthContext)
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [menuOpen, setMenuOpen] = useState(false)
    const [slotGroups, setSlotGroups] = useState([])
    const isAstrologer = authUser?.role === 'astrologer'

    useEffect(() => { getUsers() }, [getUsers])

    useEffect(() => {
        if (!isAstrologer) return
        let cancelled = false
        ;(async () => {
            try {
                const { data } = await axios.get('/api/slots/astrologer/slots-with-clients')
                if (cancelled) return
                setSlotGroups(Array.isArray(data?.slots) ? data.slots : [])
            } catch {
                if (!cancelled) setSlotGroups([])
            }
        })()
        return () => { cancelled = true }
    }, [isAstrologer, axios])

    const filtered = query
        ? users.filter(u => u.fullName.toLowerCase().includes(query.toLowerCase()))
        : users

    const filteredGroups = !isAstrologer
        ? []
        : (query
            ? slotGroups
                .map((g) => ({
                    ...g,
                    clients: (g.clients || []).filter((c) => (c?.fullName || '').toLowerCase().includes(query.toLowerCase())),
                }))
                .filter((g) => (g.clients || []).length > 0)
            : slotGroups
        )

    return (
        <div
            className={`h-full flex flex-col ${selectedUser ? 'max-md:hidden' : ''}`}
            style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
        >
            {/* ── Header ── */}
            <div className="px-4 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'var(--gold)' }}>
                            <span className="font-black text-xs" style={{ color: '#0A0A0A' }}>QC</span>
                        </div>
                        <span className="font-black text-sm" style={{ color: 'var(--text)' }}>QuickChat</span>
                    </div>

                    {/* Menu button */}
                    <div className="relative">
                        <button
                            onClick={() => setMenuOpen(v => !v)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
                            style={{ background: menuOpen ? 'var(--card)' : 'transparent', border: '1px solid var(--border)' }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                            </svg>
                        </button>

                        {menuOpen && (
                            <div
                                className="absolute top-full right-0 mt-2 w-48 rounded-2xl py-1.5 z-20 fade-up"
                                style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}
                            >
                                {[
                                    { label: 'Edit Profile', action: () => { navigate('/profile'); setMenuOpen(false) } },
                                    authUser?.role === 'client'
                                        ? { label: 'Book a Session', action: () => { navigate('/slots'); setMenuOpen(false) } }
                                        : { label: 'My Workspace', action: () => { navigate('/manage-slots'); setMenuOpen(false) } },
                                ].map(item => (
                                    <button key={item.label} onClick={item.action}
                                        className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                                        style={{ color: 'var(--muted)' }}
                                        onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
                                        onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}>
                                        {item.label}
                                    </button>
                                ))}
                                <div className="h-px mx-3 my-1" style={{ background: 'var(--border)' }} />
                                <button onClick={() => { logout(); setMenuOpen(false) }}
                                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                                    style={{ color: 'var(--danger)' }}>
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" className="shrink-0">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input
                        type="text" value={query} onChange={e => setQuery(e.target.value)}
                        placeholder={authUser?.role === 'astrologer' ? 'Search clients…' : 'Search astrologers…'}
                        className="bg-transparent text-sm flex-1 outline-none"
                        style={{ color: 'var(--text)' }}
                    />
                </div>
            </div>

            {/* ── Queue banner (client-only, shown while in queue or when turn arrives) ── */}
            {authUser?.role === 'client' && queueState && (
                <QueueBanner
                    queueState={queueState}
                    onView={() => navigate(`/waiting?queueEntryId=${queueState.queueEntryId}&slotId=${queueState.slotId ?? ''}`)}
                    onJoin={() => navigate('/')}
                    onDismiss={clearQueue}
                />
            )}

            {/* ── Section label ── */}
            <div className="px-4 py-3 shrink-0">
                <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--muted)' }}>
                    {authUser?.role === 'astrologer' ? 'Your Clients' : 'Astrologers'}
                </span>
            </div>

            {/* ── Contact list ── */}
            <div className="flex-1 overflow-y-auto px-2">
                {isAstrologer ? (
                    filteredGroups.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-sm" style={{ color: 'var(--muted)' }}>
                                {slotGroups.length === 0 ? 'No active slots available' : 'No results'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 pb-2">
                            {filteredGroups.map((g) => (
                                <div key={g.slotId} className="rounded-2xl p-2"
                                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                                    <div className="px-2 py-2 flex items-center justify-between">
                                        <p className="text-[10px] font-bold tracking-[0.15em] uppercase"
                                            style={{ color: 'var(--muted)' }}>
                                            Slot · {fmtTime12(g.startAt || g.time)}
                                        </p>
                                        <span className="text-[10px] font-bold"
                                            style={{ color: 'var(--muted)' }}>
                                            {(g.clients || []).length}
                                        </span>
                                    </div>
                                    <div className="space-y-0.5">
                                        {(g.clients || []).map((user) => {
                                            const isSelected = selectedUser?._id === user._id
                                            const isOnline   = onlineUsers.includes(user._id)
                                            const unseen     = unseenMessages[user._id] || 0

                                            return (
                                                <button
                                                    key={user._id}
                                                    onClick={() => { setSelectedUser(user); setUnseenMessages(p => ({ ...p, [user._id]: 0 })) }}
                                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                                                    style={{
                                                        background:  isSelected ? 'var(--card)' : 'transparent',
                                                        border:      isSelected ? '1px solid var(--border)' : '1px solid transparent',
                                                    }}
                                                >
                                                    <div className="relative shrink-0">
                                                        <img src={user?.profilePic || assets.avatar_icon} alt=""
                                                            className="w-10 h-10 rounded-xl object-cover"
                                                            style={{ border: '1px solid var(--border)' }} />
                                                        {isOnline && (
                                                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                                                                style={{ background: 'var(--live)', borderColor: 'var(--surface)' }} />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold truncate"
                                                            style={{ color: isSelected ? 'var(--text)' : '#C0BDB8' }}>
                                                            {user.fullName}
                                                        </p>
                                                        <p className="text-xs font-medium"
                                                            style={{ color: isOnline ? 'var(--live)' : 'var(--muted)' }}>
                                                            {isOnline ? 'Online' : 'Offline'}
                                                        </p>
                                                    </div>
                                                    {unseen > 0 && (
                                                        <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black shrink-0"
                                                            style={{ background: 'var(--gold)', color: '#0A0A0A' }}>
                                                            {unseen}
                                                        </span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    filtered.length === 0 ? (
                        <div className="text-center py-10">
                            <p className="text-sm" style={{ color: 'var(--muted)' }}>No results</p>
                        </div>
                    ) : filtered.map(user => {
                        const isSelected = selectedUser?._id === user._id
                        const isOnline   = onlineUsers.includes(user._id)
                        const unseen     = unseenMessages[user._id] || 0

                        return (
                            <button
                                key={user._id}
                                onClick={() => { setSelectedUser(user); setUnseenMessages(p => ({ ...p, [user._id]: 0 })) }}
                                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 text-left transition-all"
                                style={{
                                    background:  isSelected ? 'var(--card)' : 'transparent',
                                    border:      isSelected ? '1px solid var(--border)' : '1px solid transparent',
                                }}
                            >
                                <div className="relative shrink-0">
                                    <img src={user?.profilePic || assets.avatar_icon} alt=""
                                        className="w-10 h-10 rounded-xl object-cover"
                                        style={{ border: '1px solid var(--border)' }} />
                                    {isOnline && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                                            style={{ background: 'var(--live)', borderColor: 'var(--surface)' }} />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate"
                                        style={{ color: isSelected ? 'var(--text)' : '#C0BDB8' }}>
                                        {user.fullName}
                                    </p>
                                    <p className="text-xs font-medium"
                                        style={{ color: isOnline ? 'var(--live)' : 'var(--muted)' }}>
                                        {isOnline ? 'Online' : 'Offline'}
                                    </p>
                                </div>
                                {unseen > 0 && (
                                    <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black shrink-0"
                                        style={{ background: 'var(--gold)', color: '#0A0A0A' }}>
                                        {unseen}
                                    </span>
                                )}
                            </button>
                        )
                    })
                )}
            </div>

            {/* ── Profile strip ── */}
            <div className="px-4 py-4 shrink-0 flex items-center gap-3"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                <img src={authUser?.profilePic || assets.avatar_icon} alt=""
                    className="w-9 h-9 rounded-xl object-cover shrink-0"
                    style={{ border: '1px solid var(--border)' }} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{authUser?.fullName}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{authUser?.role}</p>
                </div>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'var(--live)' }} />
            </div>
        </div>
    )
}

export default Sidebar
