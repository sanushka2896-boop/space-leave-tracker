'use client'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function Home() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark')
      setDark(true)
    }
  }, [])

  async function signInWithSlack() {
    await supabase.auth.signInWithOAuth({
      provider: 'slack_oidc',
      options: {
        redirectTo: window.location.origin + '/dashboard'
      }
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F5F2EE] dark:bg-[#0f0f0f]">
      <div className="text-center space-y-8">
        <img src={dark ? '/logo-dark.svg' : '/logo-light.svg'} alt="The Space At 9/2" className="h-12 mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl tracking-[0.2em] uppercase font-light text-[#1a1a1a] dark:text-[#f0ede8]">
            Leave Tracker
          </h1>
          <p className="text-sm tracking-widest text-[#888] dark:text-[#aaa] uppercase">
            The Space At 9/2
          </p>
        </div>
        <button
          onClick={signInWithSlack}
          className="px-10 py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] dark:border-[#f0ede8] dark:text-[#f0ede8] dark:hover:bg-[#f0ede8] dark:hover:text-[#0f0f0f] transition-all duration-300"
        >
          Sign in with Slack
        </button>
      </div>
    </main>
  )
}
