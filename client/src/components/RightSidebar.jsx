import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import assets from '../assets/assets'

const PLANS = [
    { label: '15-Min Call', price: '₹299', desc: 'Live phone consultation', icon: '🎙' },
    { label: '30-Min Chat', price: '₹199', desc: 'Extended text session',   icon: '💬' },
]

const RightSidebar = () => {
    const { selectedUser, messages, remainingSeconds } = useContext(ChatContext)
    const { authUser, logout } = useContext(AuthContext)
    const navigate = useNavigate()

    const [imgList, setImgList] = useState([])
    useEffect(() => { setImgList(messages.filter(m => m.image).map(m => m.image)) }, [messages])

    const isExpired   = remainingSeconds === 0
    const isInSession = remainingSeconds !== null && remainingSeconds > 0
    const showPricing = authUser?.role === 'client' && isExpired

    if (!authUser) return null

    return (
        <div
            className={`h-full flex flex-col overflow-y-auto ${selectedUser ? 'max-md:hidden' : ''}`}
            style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
        >
            {/* ── Profile ── */}
            <div className="px-5 pt-8 pb-6 shrink-0 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="relative w-16 h-16 mx-auto mb-3">
                    <img src={authUser?.profilePic || assets.avatar_icon} alt=""
                        className="w-16 h-16 rounded-2xl object-cover"
                        style={{ border: '1px solid var(--border)' }} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2"
                        style={{ background: 'var(--live)', borderColor: 'var(--surface)' }} />
                </div>
                <h2 className="font-black text-sm" style={{ color: 'var(--text)' }}>{authUser?.fullName}</h2>
                <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--muted)' }}>{authUser?.role}</p>
                {authUser?.bio && (
                    <p className="text-xs mt-2 leading-relaxed line-clamp-3" style={{ color: 'var(--muted)' }}>{authUser.bio}</p>
                )}
            </div>

            {/* ── In-session pill ── */}
            {isInSession && selectedUser && (
                <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2" style={{ color: 'var(--muted)' }}>Live Session</p>
                    <div className="flex items-center gap-3 p-3 rounded-xl glow-live"
                        style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)' }}>
                        <img src={selectedUser.profilePic || assets.avatar_icon} alt=""
                            className="w-9 h-9 rounded-xl object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{selectedUser.fullName}</p>
                            <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--live)' }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--live)' }} />
                                Connected
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Client pricing (post-session) ── */}
            {showPricing && (
                <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-3" style={{ color: 'var(--gold)' }}>
                        Continue Your Journey
                    </p>
                    <div className="space-y-2">
                        {PLANS.map(p => (
                            <div key={p.label}
                                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
                                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                            >
                                <span className="text-xl">{p.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{p.label}</p>
                                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{p.desc}</p>
                                </div>
                                <span className="font-black text-sm shrink-0" style={{ color: 'var(--gold)' }}>{p.price}</span>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => navigate('/slots?from=session')}
                        className="btn-ghost w-full mt-3">
                        Browse Astrologers
                    </button>
                </div>
            )}

            {/* ── Astrologer post-session ── */}
            {authUser?.role === 'astrologer' && isExpired && (
                <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-3" style={{ color: 'var(--muted)' }}>Session Complete</p>
                    <button onClick={() => navigate('/manage-slots')}
                        className="w-full py-3 rounded-xl text-sm font-black transition-colors glow-live"
                        style={{ background: 'rgba(74,222,128,0.12)', color: 'var(--live)', border: '1px solid rgba(74,222,128,0.3)' }}>
                        ⚡ Fetch Next Client
                    </button>
                </div>
            )}

            {/* ── Quick nav ── */}
            {!isInSession && !isExpired && (
                <div className="px-4 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-2" style={{ color: 'var(--muted)' }}>Quick Links</p>
                    {authUser?.role === 'client' ? (
                        <button onClick={() => navigate('/slots')}
                            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                            style={{ background: 'rgba(196,163,90,0.08)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
                            Book a Session →
                        </button>
                    ) : (
                        <button onClick={() => navigate('/manage-slots')}
                            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                            style={{ background: 'rgba(196,163,90,0.08)', color: 'var(--gold)', border: '1px solid var(--gold-dim)' }}>
                            My Workspace →
                        </button>
                    )}
                </div>
            )}

            {/* ── Media gallery ── */}
            <div className="px-4 py-4 flex-1">
                <p className="text-[10px] font-bold tracking-[0.15em] uppercase mb-3" style={{ color: 'var(--muted)' }}>Shared Media</p>
                {imgList.length === 0 ? (
                    <div className="text-center py-6">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2"
                            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="3"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="M21 15l-5-5L5 21"/>
                            </svg>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>No media yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {imgList.map((url, i) => (
                            <div key={i} onClick={() => window.open(url)}
                                className="cursor-pointer rounded-xl overflow-hidden aspect-square hover:opacity-75 transition-opacity"
                                style={{ border: '1px solid var(--border)' }}>
                                <img src={url} alt="" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Logout ── */}
            <div className="px-4 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                <button onClick={() => logout()}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
                    onMouseOver={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)' }}
                    onMouseOut={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                    Logout
                </button>
            </div>
        </div>
    )
}

export default RightSidebar
