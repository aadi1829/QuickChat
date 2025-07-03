import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";


export const ChatContext = createContext();

export const ChatProvider = ({ children })=>{

    const [messages, setMessages] = useState([]);//current chat user ke messages
    const [users, setUsers] = useState([]);//chat ke liye available users
    const [selectedUser, setSelectedUser] = useState(null)//currently chat opened user
    const [unseenMessages, setUnseenMessages] = useState({})//unread messages count

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
            const { data } = await axios.get(`/api/messages/${userId}`);
            if (data.success){
                setMessages(data.messages)
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
            }else{
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    }

    // function to subscribe to messages for selected user
// Jab doosra user aapko live message bhejta hai, to usse socket ke zariye turant sunna aur UI me turant dikhana ka kaam subscribeToMessages() karta hai.

// Yaani:
// Chat box me real-time me message dikhana (without refresh)
// Unseen counter badhaana (agar message kisi aur ka hai)
// Message ko "seen" mark karna (agar message screen pe hai


    const subscribeToMessages = async () =>{
        if(!socket) return; //socket ka hona zaroori hai kyunki ye real-time events sunta hai.


        //newMessage event pr listen krega jo backend se aayega
        socket.on("newMessage", (newMessage)=>{
            if(selectedUser && newMessage.senderId === selectedUser._id){
                newMessage.seen = true;
                setMessages((prevMessages)=> [...prevMessages, newMessage]);
                axios.put(`/api/messages/mark/${newMessage._id}`);
            }else{
                console.log("newMessage details ->",newMessage)
                toast.success(`New message from ${newMessage.senderName || "User"}`);
                setUnseenMessages((prevUnseenMessages)=>({
                    ...prevUnseenMessages, [newMessage.senderId] : prevUnseenMessages[newMessage.senderId] ? prevUnseenMessages[newMessage.senderId] + 1 : 1
                }))
            }
        })
    }

    // function to unsubscribe from messages
    //Jab bhi aap chat user change karte ho (ya component unmount hota hai),
// toh purane user ke messages sunna band karna zaroori hai.
    const unsubscribeFromMessages = ()=>{ //to avoid memory leak
        if(socket) socket.off("newMessage");
    }

    useEffect(()=>{
        subscribeToMessages();
        return ()=> unsubscribeFromMessages();
    },[socket, selectedUser])

    const value = {
        messages, users, selectedUser, getUsers, getMessages, sendMessage, setSelectedUser, unseenMessages, setUnseenMessages
    }

    return (
    <ChatContext.Provider value={value}>
            { children }
    </ChatContext.Provider>
    )
}