import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainPage from './pages/MainPage'
import DataManagementPage from './pages/DataManagementPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/data" element={<DataManagementPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
