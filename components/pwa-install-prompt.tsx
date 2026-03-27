"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [environment] = useState(() => {
    if (typeof window === 'undefined') {
      return { isIOS: false, isStandalone: false }
    }

    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent)
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    return { isIOS: isIOSDevice, isStandalone: standaloneMode }
  })

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(
    environment.isIOS && !environment.isStandalone
  )

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowInstallPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    
    if (outcome === 'accepted') {
      setShowInstallPrompt(false)
    }
    
    setDeferredPrompt(null)
  }

  if (!showInstallPrompt || environment.isStandalone) return null

  const isManualIOSInstall = environment.isIOS && !deferredPrompt

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-sm shadow-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Install App</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {isManualIOSInstall
              ? 'On iPhone/iPad, tap Share then Add to Home Screen'
              : 'Get quick access to your dashboard'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isManualIOSInstall && (
            <Button size="sm" onClick={handleInstall}>
              Install
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowInstallPrompt(false)}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
