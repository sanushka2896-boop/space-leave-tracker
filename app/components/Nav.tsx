'use client'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/holidays', label: 'Holidays' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/profile', label: 'Profile' },
]

export default function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()

  const links = isAdmin ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS

  return (
    <header className="border-b border-[#ddd] px-12 py-5 flex items-center justify-between bg-white sticky top-0 z-10">
      <img src="/logo.svg" alt="The Space At 9/2" className="h-20 cursor-pointer" onClick={() => router.push('/dashboard')} />
      <nav className="flex items-center gap-10">
        {links.map(link => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className={`text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer ${
              pathname === link.href ? 'text-[#1a1a1a]' : 'text-[#aaa] hover:text-[#1a1a1a]'
            }`}
          >
            {link.label}
          </button>
        ))}
      </nav>
      <button
        onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
        className="text-xs tracking-widest uppercase text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer"
      >
        Sign Out
      </button>
    </header>
  )
}
