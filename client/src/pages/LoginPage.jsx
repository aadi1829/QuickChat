import React, { useContext, useState } from 'react'
import assets from '../assets/assets'
import { AuthContext } from '../../context/AuthContext'

const LoginPage = () => {

  const [currState, setCurrState] = useState("Sign up")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [bio, setBio] = useState("")
  const [role, setRole] = useState("client")
  const [isDataSubmitted, setIsDataSubmitted] = useState(false);

  const {login, isLoading} = useContext(AuthContext)

  const onSubmitHandler = (event)=>{
    event.preventDefault();
    if(currState === 'Sign up' && !isDataSubmitted){
      setIsDataSubmitted(true)
      return;
    }
    const credentials = currState === "Sign up"
      ? {fullName, email, password, bio, role}
      : {email, password};
    login(currState === "Sign up" ? 'signup' : 'login', credentials)
  }

  return (
    <div className='min-h-screen bg-[#0D0902] flex items-center justify-center gap-8 sm:justify-evenly max-sm:flex-col px-4'>

      {/* ── left ── */}
      <div className='flex flex-col items-center gap-3'>
        <img src={assets.logo_big} alt="" className='w-[min(30vw,220px)] opacity-90'/>
        <p className='text-amber-400/60 text-sm tracking-widest uppercase'>Astrology Consultation</p>
      </div>

      {/* ── right ── */}
      <form onSubmit={onSubmitHandler} className='border border-amber-900/40 bg-[#1C1409]/80 backdrop-blur-xl text-white p-7 flex flex-col gap-5 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-[400px]'>

        <h2 className='font-semibold text-2xl flex justify-between items-center text-amber-100'>
          {currState}
          {isDataSubmitted && (
            <img onClick={()=> setIsDataSubmitted(false)} src={assets.arrow_icon} alt="" className='w-5 cursor-pointer rotate-180 opacity-70'/>
          )}
        </h2>

        {currState === "Sign up" && !isDataSubmitted && (
          <>
            <input onChange={(e)=>setFullName(e.target.value)} value={fullName}
              type="text"
              className='p-3 bg-[#2A1F0A] border border-amber-900/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-50 placeholder-amber-900/80'
              placeholder="Full Name" required/>

            <div className='flex flex-col gap-2'>
              <p className='text-sm text-amber-700'>I am a:</p>
              <div className='flex gap-6'>
                <label className='flex items-center gap-2 cursor-pointer text-sm text-amber-200'>
                  <input type="radio" name="role" value="client" checked={role === "client"} onChange={(e)=> setRole(e.target.value)} className='accent-amber-500'/>
                  Client
                </label>
                <label className='flex items-center gap-2 cursor-pointer text-sm text-amber-200'>
                  <input type="radio" name="role" value="astrologer" checked={role === "astrologer"} onChange={(e)=> setRole(e.target.value)} className='accent-amber-500'/>
                  Astrologer
                </label>
              </div>
            </div>
          </>
        )}

        {!isDataSubmitted && (
          <>
            <input onChange={(e)=>setEmail(e.target.value)} value={email}
              type="email" placeholder='Email Address' required
              className='p-3 bg-[#2A1F0A] border border-amber-900/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-50 placeholder-amber-900/80'/>
            <input onChange={(e)=>setPassword(e.target.value)} value={password}
              type="password" placeholder='Password' required
              className='p-3 bg-[#2A1F0A] border border-amber-900/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-50 placeholder-amber-900/80'/>
            {currState === "Sign up" && (
              <p className='text-xs text-amber-800/70'>Min 8 characters, 1 uppercase letter, 1 number</p>
            )}
          </>
        )}

        {currState === "Sign up" && isDataSubmitted && (
          <textarea onChange={(e)=>setBio(e.target.value)} value={bio}
            rows={4}
            className='p-3 bg-[#2A1F0A] border border-amber-900/40 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-50 placeholder-amber-900/80'
            placeholder='Write a short bio…' required/>
        )}

        <button type='submit' disabled={isLoading}
          className='py-3 bg-gradient-to-r from-amber-700 to-amber-500 text-white rounded-xl font-semibold cursor-pointer hover:from-amber-600 hover:to-amber-400 transition shadow-lg shadow-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed'>
          {isLoading ? "Please wait..." : currState === "Sign up" ? "Create Account" : "Login Now"}
        </button>

        <div className='flex items-center gap-2 text-sm text-amber-800/70'>
          <input type="checkbox" className='accent-amber-500'/>
          <p>Agree to the terms of use &amp; privacy policy.</p>
        </div>

        <div className='flex flex-col gap-1'>
          {currState === "Sign up" ? (
            <p className='text-sm text-amber-800'>Already have an account?{' '}
              <span onClick={()=>{setCurrState("Login"); setIsDataSubmitted(false)}}
                className='font-medium text-amber-400 cursor-pointer hover:text-amber-300'>Login here</span>
            </p>
          ) : (
            <p className='text-sm text-amber-800'>New here?{' '}
              <span onClick={()=> setCurrState("Sign up")}
                className='font-medium text-amber-400 cursor-pointer hover:text-amber-300'>Create an account</span>
            </p>
          )}
        </div>

      </form>
    </div>
  )
}

export default LoginPage
