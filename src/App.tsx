import './App.css'
import { ChatBot } from './components/ChatBot'
import { ThemeProvider } from './components/ThemeContext'

function App() {
  return <ThemeProvider>
    <ChatBot />
  </ThemeProvider>
}

export default App
