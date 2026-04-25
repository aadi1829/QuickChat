import React from 'react'
import { useContext } from 'react'
import Sidebar from '../components/Sidebar'
import ChatContainer from '../components/ChatContainer'
import RightSidebar from '../components/RightSidebar'
import { ChatContext } from '../../context/ChatContext'

const HomePage = () => {
    const { selectedUser } = useContext(ChatContext)

    return (
        <div className="w-full h-[calc(100vh-72px)]" style={{ background: 'var(--bg)' }}>
            <div className={`h-full grid overflow-hidden
                md:grid-cols-[260px_1fr_220px] lg:grid-cols-[272px_1fr_232px]`}>
                <Sidebar />
                <ChatContainer />
                <RightSidebar />
            </div>
        </div>
    )
}

export default HomePage
