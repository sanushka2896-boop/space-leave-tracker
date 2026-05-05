'use client'
import { supabase } from './lib/supabase'

export default function Home() {
  async function signInWithSlack() {
    await supabase.auth.signInWithOAuth({
      provider: 'slack_oidc',
      options: {
        redirectTo: window.location.origin + '/dashboard'
      }
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F5F2EE]">
      <div className="text-center space-y-8">
        <img src="/logo.svg" alt="The Space At 9/2" className="h-12 mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl tracking-[0.2em] uppercase font-light text-[#1a1a1a]">
            Leave Tracker
          </h1>
          <p className="text-sm tracking-widest text-[#888] uppercase">
            The Space At 9/2
          </p>
        </div>
        <button
          onClick={signInWithSlack}
          className="px-10 py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300"
        >
          Sign in with Slack
        </button>
      </div>
    </main>
  )
}