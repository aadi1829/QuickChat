import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const ChatContainer = () => {
    const { messages, selectedUser, setSelectedUser, sendMessage, getMessages, sessionStartTime, users } =
        useContext(ChatContext)
    const { authUser, onlineUsers } = useContext(AuthContext)

    const scrollEnd = useRef(null)
    const fileInputRef = useRef(null)

    const [input, setInput] = useState('')
    const [imagePreview, setImagePreview] = useState(null)
    const [timeLeft, setTimeLeft] = useState(null)
    const [isSending, setIsSending] = useState(false)

    // ─── Timer ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!sessionStartTime) { setTimeLeft(null); return }
        const endTime = new Date(sessionStartTime).getTime() + 3 * 60 * 1000
        let id
        const tick = () => {
            const diff = endTime - Date.now()
            setTimeLeft(diff <= 0 ? 0 : diff)
            if (diff <= 0) clearInterval(id)
        }
        tick()
        id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [sessionStartTime])

    useEffect(() => {
        if (selectedUser) getMessages(selectedUser._id)
    }, [selectedUser])

    useEffect(() => {
        scrollEnd.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const isExpired = timeLeft === 0
    const isNotStarted = !sessionStartTime
    const isClientLocked = authUser.role === 'client' && isNotStarted
    const isDisabled = isExpired || isClientLocked || isSending

    const formatTime = (ms) => {
        if (ms === null || ms < 0) return '00:00'
        const s = Math.floor(ms / 1000)
        const m = Math.floor(s / 60)
        return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    }

    const timerColor = () => {
        if (isExpired) return 'text-red-400'
        if (timeLeft !== null && timeLeft < 30_000) return 'text-orange-400'
        return 'text-emerald-400'
    }

    const handleSendMessage = async (e) => {
        e?.preventDefault()
        if (isDisabled) return
        if (!input.trim() && !imagePreview) return
        setIsSending(true)
        try {
            const payload = {}
            if (input.trim()) payload.text = input.trim()
            if (imagePreview) payload.image = imagePreview.dataUrl
            await sendMessage(payload)
            setInput('')
            setImagePreview(null)
        } finally {
            setIsSending(false)
        }
    }

    const handleImageSelect = (e) => {
        const file = e.target.files[0]
        if (!file || !file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }
        const reader = new FileReader()
        reader.onloadend = () => setImagePreview({ dataUrl: reader.result, file })
        reader.readAsDataURL(file)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e)
    }

    const isMyMessage = (msg) => msg.senderId === authUser._id

    // ─── Empty state — "Reach Your Astrologer" ────────────────────────────────
    if (!selectedUser) {
        return (
            <div className="flex flex-col h-full bg-[#0D0902] max-md:hidden">

                {/* Astrologer avatars carousel */}
                <div className='pt-10 pb-6 px-4 overflow-x-auto'>
                    <div className='flex gap-4 justify-center'>
                        {users.slice(0, 6).map((user, i) => (
                            <div
                                key={i}
                                onClick={() => setSelectedUser(user)}
                                className='flex flex-col items-center gap-2 cursor-pointer group shrink-0'
                            >
                                <div className={`relative rounded-full p-0.5
                                    ${i === 1 || i === 3
                                        ? 'ring-4 ring-amber-500/70 ring-offset-2 ring-offset-[#0D0902] scale-110'
                                        : 'ring-2 ring-amber-800/40'
                                    }`}
                                >
                                    <img
                                        src={user.profilePic || assets.avatar_icon}
                                        alt={user.fullName}
                                        className='w-14 h-14 rounded-full object-cover'
                                    />
                                    {onlineUsers.includes(user._id) && (
                                        <span className='absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0D0902]'/>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center content */}
                <div className='flex-1 flex flex-col items-center justify-center text-center px-8 gap-6'>

                    {/* Star decorations */}
                    <div className='text-amber-600/30 text-5xl select-none tracking-widest'>✦ ✦ ✦</div>

                    <div className='flex flex-col gap-3'>
                        <h1 className='text-4xl font-bold text-white leading-tight'>
                            Reach Your<br/>Astrologer
                        </h1>
                        <p className='text-amber-200/50 text-sm leading-relaxed max-w-xs mx-auto'>
                            You will be able to contact our astrologers from this page when you receive consultancy service
                        </p>
                    </div>

                    {/* CTA Button */}
                    <div className='relative mt-4'>
                        {/* Decorative rays */}
                        <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
                            <div className='w-64 h-20 rounded-full bg-amber-600/10 blur-2xl'/>
                        </div>
                        <button
                            onClick={() => users[0] && setSelectedUser(users[0])}
                            className='relative z-10 px-10 py-4 bg-gradient-to-r from-amber-800 via-amber-600 to-amber-700
                                text-white font-semibold rounded-2xl shadow-xl shadow-amber-900/50
                                hover:from-amber-700 hover:via-amber-500 hover:to-amber-600 transition
                                border border-amber-500/30 text-sm tracking-wide'
                        >
                            Receive Consultancy Service
                        </button>
                    </div>

                </div>

                {/* Bottom ornament */}
                <div className='pb-8 text-center text-amber-900/30 text-xs tracking-widest select-none'>
                    ✦ AstroChar ✦
                </div>
            </div>
        )
    }

    const placeholderText = isExpired
        ? 'Session over'
        : isClientLocked
        ? 'Waiting for astrologer to start…'
        : 'Type a message…'

    return (
        <div className="flex flex-col h-full bg-gradient-to-b from-[#1A1208]/80 to-[#0D0902]/90 backdrop-blur-lg">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-900/20 bg-[#1C1409]/60 shrink-0">
                <div className="relative">
                    <img
                        src={selectedUser.profilePic || assets.avatar_icon}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-600/40"
                    />
                    {onlineUsers.includes(selectedUser._id) && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#1C1409]" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-amber-50 font-semibold truncate">{selectedUser.fullName}</p>
                    {sessionStartTime ? (
                        <p className={`text-xs font-mono tabular-nums ${timerColor()}`}>
                            {isExpired ? '⏱ Session expired' : `⏱ ${formatTime(timeLeft)} remaining`}
                        </p>
                    ) : (
                        <p className="text-xs text-amber-800">
                            {onlineUsers.includes(selectedUser._id) ? 'Online' : 'Offline'}
                        </p>
                    )}
                </div>

                <button
                    onClick={() => setSelectedUser(null)}
                    className="md:hidden p-1 rounded-lg hover:bg-amber-900/20 transition"
                >
                    <img src={assets.arrow_icon} alt="back" className="w-5" />
                </button>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">

                {isClientLocked && messages.length === 0 && (
                    <div className="flex justify-center mt-8">
                        <div className="text-center px-5 py-4 bg-amber-900/10 border border-amber-900/20 rounded-2xl max-w-xs">
                            <p className="text-amber-200/50 text-sm">
                                Waiting for the astrologer to start the session…
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const mine = isMyMessage(msg)
                    const showAvatar = i === 0 || messages[i - 1]?.senderId !== msg.senderId
                    const avatar = mine
                        ? authUser?.profilePic || assets.avatar_icon
                        : selectedUser?.profilePic || assets.avatar_icon

                    return (
                        <div
                            key={msg._id || i}
                            className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                            {!mine && (
                                <div className="w-7 h-7 shrink-0 self-end mb-1">
                                    {showAvatar ? (
                                        <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-7" />
                                    )}
                                </div>
                            )}

                            <div className={`flex flex-col max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
                                {msg.image && (
                                    <img
                                        src={msg.image}
                                        alt="shared"
                                        className={`max-w-[220px] rounded-2xl object-cover mb-0.5 cursor-pointer hover:opacity-90 transition
                                            ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                                        onClick={() => window.open(msg.image, '_blank')}
                                    />
                                )}
                                {msg.text && (
                                    <div
                                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                                            ${mine
                                                ? 'bg-gradient-to-br from-amber-700 to-amber-800 text-white rounded-br-sm'
                                                : 'bg-[#2A1F0A] text-amber-50/90 rounded-bl-sm border border-amber-900/20'
                                            }`}
                                    >
                                        {msg.text}
                                    </div>
                                )}
                                <span className="text-[10px] text-amber-800 mt-0.5 px-1">
                                    {formatMessageTime(msg.createdAt)}
                                    {mine && (
                                        <span className="ml-1">{msg.seen ? '✓✓' : '✓'}</span>
                                    )}
                                </span>
                            </div>

                            {mine && (
                                <div className="w-7 h-7 shrink-0 self-end mb-1">
                                    {showAvatar ? (
                                        <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-7" />
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                <div ref={scrollEnd} />
            </div>

            {/* ── Image Preview ── */}
            {imagePreview && (
                <div className="px-4 pb-2 shrink-0">
                    <div className="relative inline-block">
                        <img
                            src={imagePreview.dataUrl}
                            alt="preview"
                            className="h-24 rounded-xl object-cover border border-amber-900/30"
                        />
                        <button
                            onClick={() => setImagePreview(null)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-700 transition"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ── Input bar ── */}
            <div className="px-4 py-3 border-t border-amber-900/20 bg-[#1C1409]/60 shrink-0">
                {isExpired && (
                    <p className="text-center text-xs text-red-400/80 mb-2 uppercase tracking-widest">
                        Session closed — messaging disabled
                    </p>
                )}
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleImageSelect}
                        disabled={isDisabled}
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isDisabled}
                        className={`p-2 rounded-full transition shrink-0
                            ${isDisabled
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:bg-amber-900/20 cursor-pointer'}`}
                    >
                        <img src={assets.gallery_icon} alt="attach" className="w-5 h-5" />
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholderText}
                        disabled={isDisabled}
                        className={`flex-1 bg-[#2A1F0A] text-amber-50 text-sm px-4 py-2.5 rounded-full outline-none
                            placeholder-amber-800 transition border border-amber-900/30 focus:border-amber-600/60
                            ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    />

                    <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={isDisabled || (!input.trim() && !imagePreview)}
                        className={`p-2 shrink-0 transition rounded-full
                            ${isDisabled || (!input.trim() && !imagePreview)
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:scale-105 cursor-pointer'}`}
                    >
                        <img src={assets.send_button} alt="send" className="w-7 h-7" />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChatContainer
