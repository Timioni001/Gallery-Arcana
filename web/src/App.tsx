import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/lib/session'
import { VaultProvider } from '@/components/vault'
import Landing from '@/pages/Landing'
const Market = lazy(() => import('@/pages/Market'))
const ListingPage = lazy(() => import('@/pages/ListingPage'))
const Auth = lazy(() => import('@/pages/Auth'))
const Studio = lazy(() => import('@/pages/Studio'))
const NewListing = lazy(() => import('@/pages/NewListing'))
const Order = lazy(() => import('@/pages/Order'))
const Observer = lazy(() => import('@/pages/Observer'))
const Verify = lazy(() => import('@/pages/Verify'))
const InvitePage = lazy(() => import('@/pages/Invite'))
const Review = lazy(() => import('@/pages/Review'))
const Auctions = lazy(() => import('@/pages/Auctions'))
const TermsPage = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.PrivacyPage })))
import { PageShell } from '@/components/page-shell'
import { DotText } from '@/components/brand'
import { MobileTabbar } from '@/components/mobile-tabbar'

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
        <VaultProvider>
        <ScrollManager />
        <Suspense fallback={<div className="min-h-svh" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/market" element={<Market />} />
          <Route path="/auctions" element={<Auctions />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/listing/:id" element={<ListingPage />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/studio/new" element={<NewListing />} />
          <Route path="/orders/:id" element={<Order />} />
          <Route path="/observer" element={<Observer />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/invite/:id" element={<InvitePage />} />
          <Route path="/review/:orderId" element={<Review />} />
          <Route path="*" element={<PageShell><p className="dot-display py-32 text-center text-5xl text-fg"><DotText>404. Not here.</DotText></p></PageShell>} />
        </Routes>
        </Suspense>
        <MobileTabbar />
        <Toaster position="bottom-right" mobileOffset={{ bottom: 92 }} toastOptions={{ classNames: { description: "!text-fg/70" } }} />
        </VaultProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}
