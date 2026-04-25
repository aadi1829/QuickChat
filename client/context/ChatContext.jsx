import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";
import { uploadFileToCloudinary } from "../src/lib/cloudinaryUpload.js";

const QUEUE_KEY = "qc_queue"; // sessionStorage key for queue persistence across refreshes

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
    const [messages,             setMessages]             = useState([]);
    const [users,                setUsers]                = useState([]);
    const [selectedUser,         setSelectedUser]         = useState(null);
    const [unseenMessages,       setUnseenMessages]       = useState({});

    // ── Session state (server-driven) ─────────────────────────────────────────
    // remainingSeconds: null = no session, 0 = expired, >0 = active countdown
    const [remainingSeconds,     setRemainingSeconds]     = useState(null);
    const [currentQueueEntryId,  setCurrentQueueEntryId]  = useState(null);
    const [currentBookingId,     setCurrentBookingId]     = useState(null);
    const [hasMoreMessages,      setHasMoreMessages]      = useState(false);

    // ── Pre-session queue state (persists while browsing away from /waiting) ──
    // Shape: { queueEntryId, slotId, position, status, astrologer, avgSessionSeconds } | null
    // status: 'waiting' | 'active' | 'cancelled' | 'skipped'
    const [queueState, setQueueState] = useState(null);
    // Prevents double-handling the your_turn event (fires once but effect may remount)
    const didHandleYourTurnRef = useRef(false);

    const { socket, axios } = useContext(AuthContext);

    const selectedUserId = selectedUser?._id ? String(selectedUser._id) : null;
    const selectedUserIdRef = useRef(selectedUserId);
    useEffect(() => { selectedUserIdRef.current = selectedUserId; }, [selectedUserId]);

    const appendMessageDeduped = useCallback((msg) => {
        if (!msg) return;
        setMessages((prev) => {
            const id = msg?._id ? String(msg._id) : null;
            if (id && prev.some((m) => String(m._id) === id)) return prev;
            return [...prev, msg];
        });
    }, []);

    // Smooth UI countdown between server `timer_tick` (~10s); server values always win
    const isCountingDown = typeof remainingSeconds === "number" && remainingSeconds > 0;
    useEffect(() => {
        if (!isCountingDown) return undefined;
        const id = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (typeof prev !== "number" || prev <= 0) return prev;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [isCountingDown]);

    // ── Contacts / sidebar ────────────────────────────────────────────────────
    const getUsers = async () => {
        try {
            const { data } = await axios.get("/api/messages/users");
            if (data.success) {
                setUsers(data.users);
                setUnseenMessages(data.unseenMessages);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    // ── Message history (cursor pagination: newest first page, `before` for older) ──
    const getMessages = useCallback(async (userId, { append, before } = {}) => {
        if (!userId) return;
        try {
            if (!append) {
                setRemainingSeconds(null);
                setCurrentQueueEntryId(null);
                setCurrentBookingId(null);
                setHasMoreMessages(false);
                setMessages([]);
            }

            const params = new URLSearchParams();
            params.set("limit", "50");
            if (before) params.set("before", before);
            const { data } = await axios.get(`/api/messages/${userId}?${params.toString()}`);

            if (!data.success) return;

            if (append) {
                setMessages((prev) => [...data.messages, ...prev]);
            } else {
                setMessages(data.messages);
                if (data.remainingSeconds !== null && data.remainingSeconds !== undefined) {
                    setRemainingSeconds(data.remainingSeconds);
                } else {
                    setRemainingSeconds(null);
                }
                if (data.bookingId) {
                    setCurrentQueueEntryId(data.currentQueueEntryId);
                    setCurrentBookingId(data.bookingId);
                    socket?.emit("join_session_room", { bookingId: data.bookingId });
                } else {
                    setCurrentQueueEntryId(null);
                    setCurrentBookingId(null);
                }
            }
            setHasMoreMessages(!!data.hasMore);
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
        }
    }, [axios, socket]);

    const loadOlderMessages = useCallback(
        async (beforeId) => {
            if (!selectedUser?._id || !beforeId) return;
            await getMessages(selectedUser._id, { append: true, before: beforeId });
        },
        [selectedUser, getMessages]
    );

    // ── Send message (images upload to Cloudinary in the browser first) ───────
    const sendMessage = async (messageData) => {
        try {
            const payload = { ...messageData };
            if (payload.imageFile instanceof File) {
                payload.image = await uploadFileToCloudinary(payload.imageFile, axios, "messages");
                delete payload.imageFile;
            }
            // Prefer socket real-time path during an active session (room = bookingId/sessionId)
            if (socket?.connected && currentBookingId && selectedUser?._id) {
                const ack = await new Promise((resolve) => {
                    socket.emit(
                        "send_message",
                        {
                            sessionId: currentBookingId,
                            receiverId: selectedUser._id,
                            text: payload.text,
                            image: payload.image,
                        },
                        resolve
                    );
                });

                if (ack?.ok && ack?.message) {
                    appendMessageDeduped(ack.message);
                    return;
                }
                if (ack && ack.ok === false) throw new Error(ack.message || "Failed to send message.");
            }

            // Fallback: REST (still emits socket events server-side)
            const { data } = await axios.post(`/api/messages/send/${selectedUser._id}`, payload);
            if (data.success) appendMessageDeduped(data.newMessage);
            else toast.error(data.message);
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
        }
    };

    // ── Queue management ─────────────────────────────────────────────────────

    /** Call after a successful booking. Persists across navigation and page refreshes. */
    const joinQueue = useCallback(({ queueEntryId, slotId }) => {
        if (!queueEntryId) return;
        didHandleYourTurnRef.current = false;
        setQueueState({ queueEntryId, slotId: slotId ?? null, status: "waiting", position: null, astrologer: null, avgSessionSeconds: 180 });
        try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ queueEntryId, slotId: slotId ?? null })); } catch { /* ignore */ }
        socket?.emit("join_waiting_room", { queueEntryId });
    }, [socket]);

    /** Dismiss the queue banner or call after session ends. */
    const clearQueue = useCallback(() => {
        setQueueState(null);
        didHandleYourTurnRef.current = false;
        try { sessionStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
    }, []);

    // Restore queue on socket (re-)connect: handles page refresh + network reconnect
    useEffect(() => {
        if (!socket) return;
        try {
            const raw = sessionStorage.getItem(QUEUE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved?.queueEntryId) return;
            // Only restore if no active session is already running
            setQueueState((prev) => prev ?? { queueEntryId: saved.queueEntryId, slotId: saved.slotId ?? null, status: "waiting", position: null, astrologer: null, avgSessionSeconds: 180 });
            socket.emit("join_waiting_room", { queueEntryId: saved.queueEntryId });
        } catch { try { sessionStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ } }
    }, [socket]);

    // ── Voluntarily end an active session (user clicked "Leave") ─────────────
    const leaveSession = useCallback(() => {
        if (!currentBookingId || !socket) return;
        socket.emit("leave_session", { bookingId: currentBookingId });
        // State cleanup is driven by the server's resulting `session_expired` event.
    }, [currentBookingId, socket]);

    // ── Queue socket subscriptions (live across all routes) ──────────────────
    useEffect(() => {
        if (!socket) return;

        // Real-time position / status updates from the server
        const onWaitingRoomState = (payload) => {
            setQueueState((prev) => {
                if (!prev || prev.queueEntryId !== payload.queueEntryId) return prev;
                const next = { ...prev };
                if (payload.status === "waiting") {
                    next.status = "waiting";
                    next.position = payload.position ?? null;
                    if (payload.astrologer) next.astrologer = payload.astrologer;
                    if (typeof payload.avgSessionSeconds === "number") next.avgSessionSeconds = payload.avgSessionSeconds;
                } else if (payload.status === "active") {
                    next.status = "active";
                } else if (payload.status === "cancelled" || payload.status === "skipped") {
                    next.status = payload.status;
                    try { sessionStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
                }
                return next;
            });
        };

        // Fired by server when it's this client's turn
        const onYourTurn = ({ queueEntryId: qeid, bookingId, astrologer: ast, remainingSeconds: secs }) => {
            if (!qeid || !bookingId || didHandleYourTurnRef.current) return;
            didHandleYourTurnRef.current = true;

            // Transition queue state → active
            setQueueState((prev) => {
                if (!prev || prev.queueEntryId !== qeid) return prev;
                return { ...prev, status: "active" };
            });

            // Bootstrap the chat session (same actions WaitingRoomPage used to do)
            socket.emit("join_session_room", { bookingId });
            if (ast) setSelectedUser(ast);
            setCurrentQueueEntryId(qeid);
            setCurrentBookingId(bookingId);
            setRemainingSeconds(secs ?? 180);
            toast.success("It's your turn! Starting session…", { duration: 3000 });

            // Clear queue record after the "Your Turn" animation has had time to show
            setTimeout(() => {
                setQueueState(null);
                didHandleYourTurnRef.current = false;
                try { sessionStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
            }, 2500);
        };

        // Fired when slot is cancelled or this client is skipped
        const onBookingCancelled = ({ slotId: cs }) => {
            setQueueState((prev) => {
                if (!prev) return prev;
                if (cs && prev.slotId && cs !== prev.slotId) return prev;
                try { sessionStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
                return { ...prev, status: "cancelled" };
            });
        };

        socket.on("waiting_room_state", onWaitingRoomState);
        socket.on("your_turn",          onYourTurn);
        socket.on("booking_cancelled",  onBookingCancelled);

        return () => {
            socket.off("waiting_room_state", onWaitingRoomState);
            socket.off("your_turn",          onYourTurn);
            socket.off("booking_cancelled",  onBookingCancelled);
        };
    }, [socket]); // stable: setters never change, no selectedUser dependency needed

    // ── Chat message socket subscriptions ─────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        // ── Incoming chat message ─────────────────────────────────────────────
        const onNewMessage = (newMessage) => {
            const senderId = newMessage?.senderId != null ? String(newMessage.senderId) : null;
            const currentSelected = selectedUserIdRef.current;
            if (currentSelected && senderId && senderId === currentSelected) {
                const seenMsg = { ...newMessage, seen: true };
                appendMessageDeduped(seenMsg);
                if (newMessage?._id) axios.put(`/api/messages/mark/${newMessage._id}`);
            } else {
                toast.success(`New message from ${newMessage.senderName || "User"}`);
                setUnseenMessages((prev) => ({
                    ...prev,
                    [senderId || newMessage.senderId]: (prev[senderId || newMessage.senderId] || 0) + 1,
                }));
            }
        };

        const onReceiveMessage = (msg) => {
            const senderId = msg?.senderId != null ? String(msg.senderId) : null;
            const currentSelected = selectedUserIdRef.current;

            if (currentSelected && senderId && senderId === currentSelected) {
                appendMessageDeduped({ ...msg, seen: true });
                if (msg?._id) axios.put(`/api/messages/mark/${msg._id}`).catch(() => {});
                return;
            }

            // Message is for some other conversation; treat as unseen.
            if (senderId) {
                setUnseenMessages((prev) => ({
                    ...prev,
                    [senderId]: (prev[senderId] || 0) + 1,
                }));
            }
        };

        const onMissedMessages = ({ messages: batch } = {}) => {
            if (!Array.isArray(batch) || batch.length === 0) return;
            for (const m of batch) onReceiveMessage(m);
        };

        // ── Authoritative timer sync tick (every ~10 s) ───────────────────────
        const onTimerTick = ({ remainingSeconds: secs }) => {
            setRemainingSeconds(secs);
        };

        // ── Session expired (Phase 5): server emits this then evicts sockets ──
        // Navigation/reset is handled in ChatContainer (has access to useNavigate).
        const onSessionExpired = () => {
            setRemainingSeconds(0);
            setCurrentBookingId(null);
            setCurrentQueueEntryId(null);
        };

        // ── Astrologer: a new client just became active in the queue ──────────
        const onClientActivated = ({ client, queueEntryId, bookingId }) => {
            if (client) setSelectedUser(client);
            setCurrentQueueEntryId(queueEntryId);
            setCurrentBookingId(bookingId ?? null);
            setRemainingSeconds(180);
            if (bookingId) socket.emit("join_session_room", { bookingId });
            toast.success(`New client: ${client?.fullName ?? "Client"} — session starting`);
        };

        // ── Session room ready (fired when queue entry becomes active) ─────────
        const onSessionStarted = () => {
            // Server will start sending tick events; just ensure we have the right state
            setRemainingSeconds((prev) => (prev === null ? 180 : prev));
        };

        socket.on("newMessage",       onNewMessage);
        socket.on("receive_message",  onReceiveMessage);
        socket.on("missed_messages",  onMissedMessages);
        socket.on("timer_tick",       onTimerTick);
        socket.on("session_expired",  onSessionExpired);
        socket.on("client_activated", onClientActivated);
        socket.on("session_started",  onSessionStarted);

        return () => {
            socket.off("newMessage",       onNewMessage);
            socket.off("receive_message",  onReceiveMessage);
            socket.off("missed_messages",  onMissedMessages);
            socket.off("timer_tick",       onTimerTick);
            socket.off("session_expired",  onSessionExpired);
            socket.off("client_activated", onClientActivated);
            socket.off("session_started",  onSessionStarted);
        };
    }, [socket, axios, appendMessageDeduped]);

    // On connect/reconnect, re-join the active session room and ask for missed messages.
    useEffect(() => {
        if (!socket || !currentBookingId) return;
        const onConnect = () => {
            const lastId = messages.length ? messages[messages.length - 1]?._id : null;
            socket.emit("join_session_room", { bookingId: currentBookingId, lastMessageId: lastId || undefined });
        };
        socket.on("connect", onConnect);
        if (socket.connected) onConnect();
        return () => socket.off("connect", onConnect);
    }, [socket, currentBookingId, messages]);

    const value = {
        messages,
        users,
        selectedUser,
        getUsers,
        getMessages,
        loadOlderMessages,
        hasMoreMessages,
        sendMessage,
        setSelectedUser,
        unseenMessages,
        setUnseenMessages,
        remainingSeconds,
        setRemainingSeconds,
        currentQueueEntryId,
        setCurrentQueueEntryId,
        currentBookingId,
        setCurrentBookingId,
        leaveSession,
        queueState,
        joinQueue,
        clearQueue,
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
};
