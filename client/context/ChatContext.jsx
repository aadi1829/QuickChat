import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";


export const ChatContext = createContext();

export const ChatProvider = ({ children })=>{

    const [messages, setMessages] = useState([]);//current chat user ke messages
    const [users, setUsers] = useState([]);//chat ke liye available users
    const [selectedUser, setSelectedUser] = useState(null)//currently chat opened user
    const [unseenMessages, setUnseenMessages] = useState({})//unread messages count
    const [sessionStartTime, setSessionStartTime] = useState(null);//chat start time for timer

    const {socket, axios} = useContext(AuthContext); //axios me token already set hota hai from AuthContext

    // function to get all users for sidebar
    const getUsers = async () =>{
        try {
            const { data } = await axios.get("/api/messages/users");
            if (data.success) {
                setUsers(data.users)
                setUnseenMessages(data.unseenMessages)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // function to get messages for selected user
    const getMessages = async (userId)=>{//userId -> kis user ke liye message chahiye
        try {
            setSessionStartTime(null); // Reset when fetching new user messages
            const { data } = await axios.get(`/api/messages/${userId}`);
            if (data.success){
                setMessages(data.messages)
                setSessionStartTime(data.sessionStartTime)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    // function to send message to selected user
    const sendMessage = async (messageData)=>{
        try {
            const {data} = await axios.post(`/api/messages/send/${selectedUser._id}`, messageData);
            if(data.success){
                setMessages((prevMessages)=>[...prevMessages, data.newMessage])
                if(data.sessionStartTime) setSessionStartTime(data.sessionStartTime)
            }else{
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    }

    // Subscribe to real-time messages and session events
    const subscribeToMessages = () => {
        if (!socket) return;

        socket.on("newMessage", (newMessage) => {
            if (selectedUser && newMessage.senderId === selectedUser._id) {
                newMessage.seen = true;
                setMessages((prev) => [...prev, newMessage]);
                axios.put(`/api/messages/mark/${newMessage._id}`);
            } else {
                toast.success(`New message from ${newMessage.senderName || "User"}`);
                setUnseenMessages((prev) => ({
                    ...prev,
                    [newMessage.senderId]: (prev[newMessage.senderId] || 0) + 1,
                }));
            }
        });

        // Bug fix: client receives this event when astrologer sends the first message.
        // Updates sessionStartTime instantly so the timer starts and chat unlocks
        // without any manual refresh.
        socket.on("sessionStarted", ({ startTime }) => {
            setSessionStartTime(startTime);
        });
    };

    const unsubscribeFromMessages = () => {
        if (!socket) return;
        socket.off("newMessage");
        socket.off("sessionStarted");
    };

    useEffect(() => {
        subscribeToMessages();
        return () => unsubscribeFromMessages();
    }, [socket, selectedUser])

    const value = {
        messages, users, selectedUser, getUsers, getMessages, sendMessage, setSelectedUser, unseenMessages, setUnseenMessages, sessionStartTime
    }

    return (
    <ChatContext.Provider value={value}>
            { children }
    </ChatContext.Provider>
    )
}