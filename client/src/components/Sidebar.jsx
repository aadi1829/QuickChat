import React, { useContext, useEffect, useState } from 'react'
import assets from '../assets/assets'
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { ChatContext } from '../../context/ChatContext';

const Sidebar = () => {

    const {getUsers, users, selectedUser, setSelectedUser,
        unseenMessages, setUnseenMessages } = useContext(ChatContext);

    const {logout, onlineUsers} = useContext(AuthContext)

    const [input, setInput] = useState(false)

    const navigate = useNavigate();

    const filteredUsers = input ? users.filter((user)=>user.fullName.toLowerCase().includes(input.toLowerCase())) : users;

    useEffect(()=>{
        getUsers();
    },[])

  return (
    <div className={`bg-[#1A1208]/80 h-full p-5 rounded-r-xl overflow-y-scroll text-white border-r border-amber-900/20 ${selectedUser ? "max-md:hidden" : ''}`}>

      {/* ── Header ── */}
      <div className='pb-5'>
        <div className='flex justify-between items-center'>
          <img src={assets.logo} alt="logo" className='max-w-40' />
          <div className="relative py-2 group">
            <img src={assets.menu_icon} alt="Menu" className='max-h-5 cursor-pointer opacity-80' />
            <div className='absolute top-full right-0 z-20 w-36 p-5 rounded-xl bg-[#1C1409] border border-amber-900/40 text-amber-100 hidden group-hover:block shadow-xl shadow-black/60'>
              <p onClick={()=>navigate('/profile')} className='cursor-pointer text-sm hover:text-amber-400 transition'>Edit Profile</p>
              <hr className="my-2 border-t border-amber-900/30" />
              <p onClick={()=> logout()} className='cursor-pointer text-sm hover:text-amber-400 transition'>Logout</p>
            </div>
          </div>
        </div>

        <div className='bg-[#2A1F0A] rounded-full flex items-center gap-2 py-3 px-4 mt-5 border border-amber-900/30'>
          <img src={assets.search_icon} alt="Search" className='w-3 opacity-60'/>
          <input onChange={(e)=>setInput(e.target.value)} type="text"
            className='bg-transparent border-none outline-none text-amber-50 text-xs placeholder-amber-800 flex-1'
            placeholder='Search astrologer…'/>
        </div>
      </div>

      {/* ── User List ── */}
      <div className='flex flex-col gap-1'>
        {filteredUsers.map((user, index)=>(
          <div
            onClick={()=> {setSelectedUser(user); setUnseenMessages(prev=> ({...prev, [user._id]:0}))}}
            key={index}
            className={`relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition max-sm:text-sm
              ${selectedUser?._id === user._id
                ? 'bg-amber-900/30 border border-amber-700/40'
                : 'hover:bg-amber-900/15 border border-transparent'}`}
          >
            <div className='relative shrink-0'>
              <img
                src={user?.profilePic || assets.avatar_icon}
                alt=""
                className='w-10 h-10 rounded-full object-cover ring-2 ring-amber-700/40'
              />
              {onlineUsers.includes(user._id) && (
                <span className='absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#1A1208]'/>
              )}
            </div>
            <div className='flex flex-col leading-5 min-w-0'>
              <p className='text-amber-50 truncate'>{user.fullName}</p>
              <span className={`text-xs ${onlineUsers.includes(user._id) ? 'text-emerald-400' : 'text-amber-800'}`}>
                {onlineUsers.includes(user._id) ? 'Online' : 'Offline'}
              </span>
            </div>
            {unseenMessages[user._id] > 0 && (
              <p className='absolute top-3 right-3 text-xs h-5 w-5 flex justify-center items-center rounded-full bg-amber-600 text-white font-bold'>
                {unseenMessages[user._id]}
              </p>
            )}
          </div>
        ))}
      </div>

    </div>
  )
}

export default Sidebar
