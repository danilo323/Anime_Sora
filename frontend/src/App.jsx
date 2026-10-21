import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import PlayerView from './components/PlayerView'
import AddAnimeModal from './components/AddAnimeModal'
import AuthModal from './components/AuthModal'
import { Toast } from './components/ui'

import Home from './pages/Home'
import Explore from './pages/Explore'
import SearchPage from './pages/Search'
import Detail from './pages/Detail'
import Favorites from './pages/Favorites'
import Collection from './pages/Collection'
import Profile from './pages/Profile'
import Welcome from './pages/Welcome'

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col bg-surface-100 text-ink">
          <Navbar />
          <main className="wrap min-h-[75vh] flex-1 py-6 pb-24 md:py-8 md:pb-16">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explorar" element={<Explore />} />
              <Route path="/buscar" element={<SearchPage />} />
              <Route path="/anime/:id" element={<Detail />} />
              <Route path="/favoritos" element={<Favorites />} />
              <Route path="/coleccion" element={<Collection />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="/bienvenida" element={<Welcome />} />
            </Routes>
          </main>
          <Footer />

          {/* Modales y vistas overlay */}
          <PlayerView />
          <AddAnimeModal />
          <AuthModal />
          <Toast />
        </div>
      </BrowserRouter>
    </AppProvider>
  )
}
