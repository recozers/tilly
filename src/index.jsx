import React from 'react'
import ReactDOM from 'react-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'

console.log('index.jsx loaded')

ReactDOM.render(
  <AuthProvider>
    <App />
  </AuthProvider>, 
  document.getElementById('root')
)
