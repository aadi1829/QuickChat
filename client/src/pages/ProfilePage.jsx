import React, { useContext, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import assets from '../assets/assets';
import { AuthContext } from '../../context/AuthContext';
import { uploadFileToCloudinary } from '../lib/cloudinaryUpload.js'
import toast from 'react-hot-toast'
import { TopNav } from '../components/TopNav'

const ProfilePage = () => {

  const { authUser, updateProfile, axios } = useContext(AuthContext)

  const fileInputRef = useRef(null)
  const [imagePreview, setImagePreview] = useState(null) // { dataUrl, file }
  const navigate = useNavigate();
  const [name, setName] = useState(authUser?.fullName || '')
  const [bio, setBio] = useState(authUser?.bio || '')

  const handleImage = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type?.startsWith('image/')) {
      toast.error('Select an image file')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const r = new FileReader()
    r.onloadend = () => setImagePreview({ dataUrl: r.result, file: f })
    r.readAsDataURL(f)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (!imagePreview?.file) {
        await updateProfile({ fullName: name, bio })
        navigate('/')
        return
      }
      const profilePic = await uploadFileToCloudinary(imagePreview.file, axios, 'profiles')
      await updateProfile({ profilePic, fullName: name, bio })
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Save failed')
    }
  }

  const fmtRating = (avg, count) => {
    const a = Number(avg)
    const c = Number(count)
    if (!Number.isFinite(a) || !Number.isFinite(c) || c <= 0) return 'New'
    return a.toFixed(1)
  }
  const fmtAvgSession = (secs) => {
    const s = Number(secs)
    if (!Number.isFinite(s) || s <= 0) return '—'
    return `${Math.round(s)}s`
  }

  const handleNav = (r) => navigate(r === 'astrologer' ? '/manage-slots' : '/slots')

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <TopNav role={authUser?.role ?? 'client'} isLive={false} onNavigate={handleNav} />

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 rounded-2xl p-6 fade-up"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2"
              style={{ color: 'var(--gold)' }}>// PROFILE</p>
            <h1 className="font-black text-2xl" style={{ color: 'var(--text)' }}>Your identity</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
              Update your avatar, name, and bio. Changes apply across chat and discover.
            </p>

            <div className="mt-6 flex items-center gap-4">
              <div className="relative">
                <img
                  className="w-24 h-24 rounded-2xl object-cover"
                  style={{ border: '1px solid var(--border)' }}
                  src={imagePreview?.dataUrl || authUser?.profilePic || assets.avatar_icon}
                  alt=""
                />
                {!!imagePreview && (
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs flex items-center justify-center"
                    style={{ background: 'var(--danger)', color: 'white' }}
                    title="Remove selected image"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex-1">
                <input ref={fileInputRef} onChange={handleImage} type="file" accept="image/*" className="hidden" />
                <button type="button" className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
                  Upload avatar
                </button>
                <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                  JPG/PNG recommended. Non-image files are rejected.
                </p>
              </div>
            </div>

            {authUser?.role === 'astrologer' && (
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  ★ {fmtRating(authUser?.ratingAvg, authUser?.ratingCount)} ({authUser?.ratingCount ?? 0})
                </span>
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  Avg session: {fmtAvgSession(authUser?.avgSessionSeconds)}
                </span>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 rounded-2xl p-6 fade-up"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase mb-2"
              style={{ color: 'var(--gold)' }}>// EDIT</p>
            <h2 className="font-black text-xl" style={{ color: 'var(--text)' }}>Profile details</h2>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold tracking-[0.15em] uppercase"
                  style={{ color: 'var(--muted)' }}>Full name</label>
                <input
                  onChange={(e) => setName(e.target.value)} value={name}
                  type="text" required placeholder="Your name"
                  className="dark-input mt-2"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold tracking-[0.15em] uppercase"
                  style={{ color: 'var(--muted)' }}>Bio</label>
                <textarea
                  onChange={(e) => setBio(e.target.value)} value={bio}
                  placeholder="Write profile bio" required rows={5}
                  className="dark-input mt-2 resize-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" className="btn-gold">Save changes</button>
                <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
