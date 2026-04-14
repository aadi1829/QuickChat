import React, { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import assets from '../assets/assets';
import { AuthContext } from '../../context/AuthContext';

const ProfilePage = () => {

  const {authUser, updateProfile} = useContext(AuthContext)

  const [selectedImg, setSelectedImg] = useState(null)
  const navigate = useNavigate();
  const [name, setName] = useState(authUser?.fullName || '')
  const [bio, setBio] = useState(authUser?.bio || '')

  const handleSubmit = async (e)=>{
    e.preventDefault();
    if(!selectedImg){
      await updateProfile({fullName: name, bio});
      navigate('/');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(selectedImg);
    reader.onload = async ()=>{
      const base64Image = reader.result;
      await updateProfile({profilePic: base64Image, fullName: name, bio});
      navigate('/');
    }
  }

  return (
    <div className='min-h-screen bg-[#0D0902] flex items-center justify-center px-4'>
      <div className='w-5/6 max-w-2xl bg-[#1C1409]/80 backdrop-blur-xl text-amber-50 border border-amber-900/30 flex items-center justify-between max-sm:flex-col-reverse rounded-2xl shadow-2xl shadow-black/60 overflow-hidden'>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-10 flex-1">
          <h3 className="text-xl font-semibold text-amber-200">Profile Details</h3>

          <label htmlFor="avatar" className='flex items-center gap-4 cursor-pointer group'>
            <input onChange={(e)=>setSelectedImg(e.target.files[0])} type="file" id='avatar' accept='.png, .jpg, .jpeg' hidden/>
            <img
              src={selectedImg ? URL.createObjectURL(selectedImg) : assets.avatar_icon}
              alt=""
              className={`w-14 h-14 ring-2 ring-amber-700/50 ${selectedImg ? 'rounded-full object-cover' : ''}`}
            />
            <span className='text-sm text-amber-600 group-hover:text-amber-400 transition'>Upload profile image</span>
          </label>

          <input
            onChange={(e)=>setName(e.target.value)} value={name}
            type="text" required placeholder='Your name'
            className='p-3 bg-[#2A1F0A] border border-amber-900/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-50 placeholder-amber-800'/>

          <textarea
            onChange={(e)=>setBio(e.target.value)} value={bio}
            placeholder="Write profile bio" required
            className="p-3 bg-[#2A1F0A] border border-amber-900/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-50 placeholder-amber-800"
            rows={4}/>

          <button type="submit"
            className="bg-gradient-to-r from-amber-800 to-amber-600 text-white p-3 rounded-xl text-base font-semibold cursor-pointer hover:from-amber-700 hover:to-amber-500 transition shadow-lg shadow-amber-900/30">
            Save Changes
          </button>
        </form>

        <div className='flex items-center justify-center p-10 max-sm:pt-10'>
          <img
            className='w-40 h-40 rounded-full object-cover ring-4 ring-amber-700/40'
            src={selectedImg ? URL.createObjectURL(selectedImg) : authUser?.profilePic || assets.logo_icon}
            alt=""
          />
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
