'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HolidaysRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/calendar?tab=holidays') }, [])
  return null
}
