import React, { useContext, useEffect, useRef, useState } from 'react'
import assets from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const ChatContainer = () => {
    const { messages, selectedUser, setSelectedUser, sendMessage, getMessages, sessionStartTime } =
        useContext(ChatContext)
    const { authUser, onlineUsers } = useContext(AuthContext)

    const scrollEnd = useRef(null)
    const fileInputRef = useRef(null)

    const [input, setInput] = useState('')
    const [imagePreview, setImagePreview] = useState(null) // { dataUrl, file }
    const [timeLeft, setTimeLeft] = useState(null)
    const [isSending, setIsSending] = useState(false)

    // ─── Timer ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!sessionStartTime) { setTimeLeft(null); return }

        const endTime = new Date(sessionStartTime).getTime() + 3 * 60 * 1000

        // Declare `id` with `let` BEFORE calling `tick()` so the closure never
        // hits a temporal dead zone error (which caused the white-screen crash
        // when selecting a user whose session had already expired).
        let id

        const tick = () => {
            const diff = endTime - Date.now()
            setTimeLeft(diff <= 0 ? 0 : diff)
            if (diff <= 0) clearInterval(id)
        }

        tick() // run immediately so there's no 1-second blank gap
        id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [sessionStartTime])

    // ─── Load messages when user selected ────────────────────────────────────
    useEffect(() => {
        if (selectedUser) getMessages(selectedUser._id)
    }, [selectedUser])

    // ─── Auto-scroll ─────────────────────────────────────────────────────────
    useEffect(() => {
        scrollEnd.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // ─── Derived state ────────────────────────────────────────────────────────
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
        if (isExpired) return 'text-red-500'
        if (timeLeft !== null && timeLeft < 30_000) return 'text-orange-400'
        return 'text-emerald-400'
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────
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
        if (fileInputRef.current) fileInputRef.current.value = '' // reset so the same file can be reselected
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e)
    }

    const isMyMessage = (msg) => msg.senderId === authUser._id

    // ─── Render ───────────────────────────────────────────────────────────────
    if (!selectedUser) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 text-gray-500 bg-white/5 max-md:hidden h-full">
                <img src={assets.logo_icon} className="w-16 opacity-60" alt="" />
                <p className="text-lg font-medium text-white/70">Select a conversation</p>
                <p className="text-sm text-white/30">Your messages will appear here</p>
            </div>
        )
    }

    const placeholderText = isExpired
        ? 'Session over'
        : isClientLocked
        ? 'Waiting for astrologer to start…'
        : 'Type a message…'

    return (
        <div className="flex flex-col h-full bg-gradient-to-b from-stone-900/60 to-stone-950/80 backdrop-blur-lg">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5 shrink-0">
                <div className="relative">
                    <img
                        src={selectedUser.profilePic || assets.avatar_icon}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-violet-500/40"
                    />
                    {onlineUsers.includes(selectedUser._id) && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-stone-900" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{selectedUser.fullName}</p>
                    {sessionStartTime ? (
                        <p className={`text-xs font-mono tabular-nums ${timerColor()}`}>
                            {isExpired ? '⏱ Session expired' : `⏱ ${formatTime(timeLeft)} remaining`}
                        </p>
                    ) : (
                        <p className="text-xs text-white/40">
                            {onlineUsers.includes(selectedUser._id) ? 'Online' : 'Offline'}
                        </p>
                    )}
                </div>

                <button
                    onClick={() => setSelectedUser(null)}
                    className="md:hidden p-1 rounded-lg hover:bg-white/10 transition"
                >
                    <img src={assets.arrow_icon} alt="back" className="w-5" />
                </button>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">

                {isClientLocked && messages.length === 0 && (
                    <div className="flex justify-center mt-8">
                        <div className="text-center px-5 py-4 bg-white/5 border border-white/10 rounded-2xl max-w-xs">
                            <p className="text-white/50 text-sm">
                                Waiting for the astrologer to start the session…
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const mine = isMyMessage(msg)
                    const showAvatar =
                        i === 0 || messages[i - 1]?.senderId !== msg.senderId
                    const avatar = mine
                        ? authUser?.profilePic || assets.avatar_icon
                        : selectedUser?.profilePic || assets.avatar_icon

                    return (
                        <div
                            key={msg._id || i}
                            className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                            {/* Avatar — other side */}
                            {!mine && (
                                <div className="w-7 h-7 shrink-0 self-end mb-1">
                                    {showAvatar ? (
                                        <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-7" />
                                    )}
                                </div>
                            )}

                            {/* Bubble */}
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
                                                ? 'bg-violet-600 text-white rounded-br-sm'
                                                : 'bg-white/10 text-white/90 rounded-bl-sm'
                                            }`}
                                    >
                                        {msg.text}
                                    </div>
                                )}
                                <span className="text-[10px] text-white/30 mt-0.5 px-1">
                                    {formatMessageTime(msg.createdAt)}
                                    {mine && (
                                        <span className="ml-1">{msg.seen ? '✓✓' : '✓'}</span>
                                    )}
                                </span>
                            </div>

                            {/* Avatar — my side */}
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
                            className="h-24 rounded-xl object-cover border border-white/20"
                        />
                        <button
                            onClick={() => setImagePreview(null)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-600 transition"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ── Input bar ── */}
            <div className="px-4 py-3 border-t border-white/10 bg-white/5 shrink-0">
                {isExpired && (
                    <p className="text-center text-xs text-red-400/80 mb-2 uppercase tracking-widest">
                        Session closed — messaging disabled
                    </p>
                )}
                <div className="flex items-center gap-2">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleImageSelect}
                        disabled={isDisabled}
                    />

                    {/* Image attach button */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isDisabled}
                        className={`p-2 rounded-full transition shrink-0
                            ${isDisabled
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:bg-white/10 cursor-pointer'}`}
                    >
                        <img src={assets.gallery_icon} alt="attach" className="w-5 h-5" />
                    </button>

                    {/* Text input */}
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholderText}
                        disabled={isDisabled}
                        className={`flex-1 bg-white/8 text-white text-sm px-4 py-2.5 rounded-full outline-none
                            placeholder-white/30 transition border border-white/10 focus:border-violet-500/60
                            ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    />

                    {/* Send button */}
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
