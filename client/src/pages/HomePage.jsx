import React, { useState } from 'react'
import Sidebar from '../components/Sidebar'
import ChatContainer from '../components/ChatContainer'
import RightSidebar from '../components/RightSidebar'
import { useContext } from 'react'
import { ChatContext } from '../../context/ChatContext'

const HomePage = () => {
 
    const {selectedUser} = useContext(ChatContext)

  return (
    <div className='w-full h-screen sm:px-[10%] sm:py-[4%]'>
      <div className={`border border-amber-900/25 rounded-2xl overflow-hidden h-[100%] grid grid-cols-1 relative bg-[#0D0902] shadow-2xl shadow-black/80 ${selectedUser ? 'md:grid-cols-[1fr_1.5fr_1fr] xl:grid-cols-[1fr_2fr_1fr]' : 'md:grid-cols-2'}`}>
        <Sidebar />
        <ChatContainer />
        <RightSidebar/>
      </div>
    </div>
  )
}

export default HomePage
