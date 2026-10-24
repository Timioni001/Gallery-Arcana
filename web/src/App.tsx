import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/lib/session'
import Landing from '@/pages/Landing'
import Market from '@/pages/Market'
import ListingPage from '@/pages/ListingPage'
import Auth from '@/pages/Auth'
import Studio from '@/pages/Studio'
import NewListing from '@/pages/NewListing'
import Order from '@/pages/Order'
import Observer from '@/pages/Observer'
import { PageShell } from '@/components/page-shell'
import { DotText } from '@/components/brand'

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ScrollManager />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/market" element={<Market />} />
          <Route path="/listing/:id" element={<ListingPage />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/studio/new" element={<NewListing />} />
          <Route path="/orders/:id" element={<Order />} />
          <Route path="/observer" element={<Observer />} />
          <Route path="*" element={<PageShell><p className="dot-display py-32 text-center text-5xl text-fg"><DotText>404. Not here.</DotText></p></PageShell>} />
        </Routes>
        <Toaster position="bottom-right" />
      </SessionProvider>
    </BrowserRouter>
  )
}
