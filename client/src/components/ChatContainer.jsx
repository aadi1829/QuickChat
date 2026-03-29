import React, { useContext, useEffect, useRef, useState } from 'react'
import assets, { messagesDummyData } from '../assets/assets'
import { formatMessageTime } from '../lib/utils'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const ChatContainer = () => {

    const { messages, selectedUser, setSelectedUser, sendMessage, 
        getMessages, sessionStartTime} = useContext(ChatContext)

    const { authUser, onlineUsers } = useContext(AuthContext)

    const scrollEnd = useRef()

    const [input, setInput] = useState('');
    const [timeLeft, setLeftTime] = useState(null)

    // Handle sending a message
    const handleSendMessage = async (e)=>{
        e.preventDefault();
        if(input.trim() === "") return null;
        await sendMessage({text: input.trim()});
        setInput("")
    }

    // Timer logic
    useEffect(()=>{
        let interval;
        if(sessionStartTime){
            const startTime = new Date(sessionStartTime).getTime();
            const endTime = startTime + 3 * 60 * 1000;

            interval = setInterval(()=>{
                const now = new Date().getTime();
                const diff = endTime - now;

                if(diff <= 0){
                    setLeftTime(0);
                    clearInterval(interval)
                }else{
                    setLeftTime(diff)
                }
            }, 1000)
        }else{
            setLeftTime(null)
        }

        return ()=> clearInterval(interval)
    },[sessionStartTime])

    const formatTime = (ms) => {
        if (ms === null || ms < 0) return "00:00";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const isExpired = timeLeft === 0;
    const isNotStarted = !sessionStartTime;
    const isDisabled = isExpired || (authUser.role === "client" && isNotStarted);

    // Handle sending an image
    const handleSendImage = async (e) =>{
        const file = e.target.files[0];
        if(!file || !file.type.startsWith("image/")){
            toast.error("select an image file")
            return;
        }
        const reader = new FileReader();

        reader.onloadend = async ()=>{
            await sendMessage({image: reader.result})
            e.target.value = ""
        }
        reader.readAsDataURL(file)
    }

    useEffect(()=>{
        if(selectedUser){
            getMessages(selectedUser._id)
        }
    },[selectedUser])

    useEffect(()=>{
        if(scrollEnd.current && messages){
            scrollEnd.current.scrollIntoView({ behavior: "smooth"})
        }
    },[messages])

  return selectedUser ? (
    <div className='h-full overflow-scroll relative backdrop-blur-lg'>
      {/* ------- header ------- */}
      <div className='flex items-center gap-3 py-3 mx-4 border-b border-stone-500'>
        <img src={selectedUser.profilePic || assets.avatar_icon} alt="" className="w-8 rounded-full"/>
        <div className='flex-1'>
            <p className='text-lg text-white flex items-center gap-2'>
                {selectedUser.fullName}
                {onlineUsers.includes(selectedUser._id) && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
            </p>
            {sessionStartTime && (
                <p className={`text-xs ${isExpired ? 'text-red-500' : 'text-yellow-500'}`}>
                    {isExpired ? "Session Expired" : `Time Remaining: ${formatTime(timeLeft)}`}
                </p>
            )}
        </div>
        <img onClick={()=> setSelectedUser(null)} src={assets.arrow_icon} alt="" className='md:hidden max-w-7'/>
        <img src={assets.help_icon} alt="" className='max-md:hidden max-w-5'/>
      </div>
      {/* ------- chat area ------- */}
      <div className='flex flex-col h-[calc(100%-140px)] overflow-y-scroll p-3 pb-6'>
        {messages.map((msg, index)=>(
            <div key={index} className={`flex items-end gap-2 justify-end ${msg.senderId !== authUser._id && 'flex-row-reverse'}`}>
                {msg.image ? (
                    <img src={msg.image} alt="" className='max-w-[230px] border border-gray-700 rounded-lg overflow-hidden mb-8'/>
                ):(
                    <p className={`p-2 max-w-[200px] md:text-sm font-light rounded-lg mb-8 break-all bg-violet-500/30 text-white ${msg.senderId === authUser._id ? 'rounded-br-none' : 'rounded-bl-none'}`}>{msg.text}</p>
                )}
                <div className="text-center text-xs">
                    <img src={msg.senderId === authUser._id ? authUser?.profilePic || assets.avatar_icon : selectedUser?.profilePic || assets.avatar_icon} alt="" className='w-7 rounded-full' />
                    <p className='text-gray-500'>{formatMessageTime(msg.createdAt)}</p>
                </div>
            </div>
        ))}

        {authUser.role === "client" && isNotStarted && (
            <div className='text-center p-4 bg-white/5 rounded-lg text-stone-400 text-sm italic mx-auto max-w-[80%]'>
                Waiting for the astrologer to start the session...
            </div>
        )}

        <div ref={scrollEnd}></div>
      </div>

{/* ------- bottom area ------- */}
    <div className='absolute bottom-0 left-0 right-0 p-3 bg-stone-900/40 backdrop-blur-md'>
        <div className='flex items-center gap-3'>
            <div className={`flex-1 flex items-center bg-gray-100/12 px-3 rounded-full ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <input 
                    onChange={(e)=> setInput(e.target.value)} 
                    value={input} 
                    onKeyDown={(e)=> e.key === "Enter" && !isDisabled ? handleSendMessage(e) : null} 
                    type="text" 
                    placeholder={isDisabled ? (isExpired ? "Session Over" : "Locked") : "Send a message"} 
                    disabled={isDisabled}
                    className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400'/>
                
                <input onChange={handleSendImage} type="file" id='image' accept='image/png, image/jpeg' hidden disabled={isDisabled}/>
                <label htmlFor="image">
                    <img src={assets.gallery_icon} alt="" className={`w-5 mr-2 ${isDisabled ? 'grayscale' : 'cursor-pointer'}`}/>
                </label>
            </div>
            <img 
                onClick={!isDisabled ? handleSendMessage : null} 
                src={assets.send_button} 
                alt="" 
                className={`w-7 ${isDisabled ? 'opacity-50 grayscale' : 'cursor-pointer'}`} 
            />
        </div>
        {isExpired && <p className='text-[10px] text-center text-red-400 mt-2 uppercase tracking-widest'>Encryption expired / Session Closed</p>}
    </div>


    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
        <img src={assets.logo_icon} className='max-w-16' alt="" />
        <p className='text-lg font-medium text-white'>Chat anytime, anywhere</p>
    </div>
  )
}

export default ChatContainer
