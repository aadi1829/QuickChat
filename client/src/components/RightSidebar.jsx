import React, { useContext, useEffect, useState } from 'react'
import assets from '../assets/assets'
import { ChatContext } from '../../context/ChatContext'
import { AuthContext } from '../../context/AuthContext'

const RightSidebar = () => {

    const {selectedUser, messages} = useContext(ChatContext)
    const {logout, onlineUsers, authUser} = useContext(AuthContext)
    const [msgImages, setMsgImages] = useState([])

    useEffect(()=>{
        setMsgImages(
            messages.filter(msg => msg.image).map(msg=>msg.image)
        )
    },[messages])

  return authUser && (
    <div className={`bg-[#1A1208]/80 text-white w-full relative overflow-y-scroll border-l border-amber-900/20 ${selectedUser ? "max-md:hidden" : ""}`}>

        <div className='pt-12 flex flex-col items-center gap-3 text-xs font-light mx-auto'>
            <div className='relative'>
                <img
                    src={authUser?.profilePic || assets.avatar_icon}
                    alt=""
                    className='w-20 h-20 rounded-full object-cover ring-4 ring-amber-700/40'
                />
                <span className='absolute bottom-1 right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#1A1208]'/>
            </div>
            <h1 className='px-10 text-lg font-semibold text-amber-50 mx-auto text-center'>
                {authUser?.fullName}
            </h1>
            <p className='px-10 mx-auto text-amber-700/80 text-center leading-relaxed'>{authUser?.bio}</p>
        </div>

        <hr className="border-amber-900/30 my-5"/>

        <div className="px-5 text-xs">
            <p className='text-amber-600 uppercase tracking-widest mb-3'>Media</p>
            <div className='max-h-[200px] overflow-y-scroll grid grid-cols-2 gap-3'>
                {msgImages.map((url, index)=>(
                    <div key={index} onClick={()=> window.open(url)} className='cursor-pointer rounded-xl overflow-hidden hover:opacity-80 transition'>
                        <img src={url} alt="" className='w-full h-full object-cover rounded-xl'/>
                    </div>
                ))}
                {msgImages.length === 0 && (
                    <p className='text-amber-900 col-span-2 text-center py-4'>No media shared yet</p>
                )}
            </div>
        </div>

        <div className='absolute bottom-5 left-0 right-0 flex justify-center'>
            <button
                onClick={()=> logout()}
                className='bg-gradient-to-r from-amber-800 to-amber-600 text-white text-sm font-medium py-2.5 px-16 rounded-full cursor-pointer hover:from-amber-700 hover:to-amber-500 transition shadow-lg shadow-amber-900/30'>
                Logout
            </button>
        </div>
    </div>
  )
}

export default RightSidebar
