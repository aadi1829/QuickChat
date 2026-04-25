import React, { useContext } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import HomePage        from './pages/HomePage'
import LoginPage       from './pages/LoginPage'
import ProfilePage     from './pages/ProfilePage'
import SlotBrowsePage  from './pages/SlotBrowsePage'
import WaitingRoomPage from './pages/WaitingRoomPage'
import ManageSlotsPage from './pages/ManageSlotsPage'
import { Toaster } from 'react-hot-toast'
import { AuthContext } from '../context/AuthContext'
import { TopNav } from './components/TopNav'

const VALID_ROLES = new Set(['client', 'astrologer'])

function RequireAuth({ authUser, children }) {
    if (!authUser) return <Navigate to="/login" />
    return children
}

function RequireRole({ authUser, role, children }) {
    if (!authUser) return <Navigate to="/login" />
    if (!VALID_ROLES.has(authUser?.role)) return <Navigate to="/" />
    if (authUser.role !== role) return <Navigate to="/" />
    return children
}

const App = () => {
    const { authUser } = useContext(AuthContext)
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-[#0D0902]">
            <Toaster />
            {authUser && (
                <TopNav
                    role={authUser?.role}
                    onNavigate={(tab) => {
                        // Single visible tab; click can still take user "home"
                        // (kept extensible if you later add role dashboards).
                        navigate(tab?.to || '/')
                    }}
                />
            )}
            <Routes>
                {/* Common */}
                <Route path='/'        element={<RequireAuth authUser={authUser}><HomePage /></RequireAuth>} />
                <Route path='/login'   element={!authUser ? <LoginPage />      : <Navigate to="/" />} />
                <Route path='/profile' element={<RequireAuth authUser={authUser}><ProfilePage /></RequireAuth>} />

                {/* Client-only */}
                <Route path='/slots'   element={<RequireRole authUser={authUser} role="client"><SlotBrowsePage /></RequireRole>} />
                <Route path='/waiting' element={<RequireRole authUser={authUser} role="client"><WaitingRoomPage /></RequireRole>} />

                {/* Astrologer-only */}
                <Route path='/manage-slots' element={<RequireRole authUser={authUser} role="astrologer"><ManageSlotsPage /></RequireRole>} />
            </Routes>
        </div>
    )
}

export default App
