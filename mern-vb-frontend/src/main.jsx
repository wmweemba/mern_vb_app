import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './store/auth.jsx'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkMissingKeyError() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', backgroundColor: '#f9f5f0' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
        <h2 style={{ color: '#b45309', marginBottom: '0.5rem' }}>Configuration Error</h2>
        <p style={{ color: '#57534e' }}>
          The authentication service could not start. The <code>VITE_CLERK_PUBLISHABLE_KEY</code> environment variable is missing from this deployment.
        </p>
        <p style={{ color: '#78716c', fontSize: '0.875rem', marginTop: '1rem' }}>
          Set the production Clerk key in Coolify build environment variables and redeploy.
        </p>
      </div>
    </div>
  );
}

function ClerkLoadError() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', backgroundColor: '#f9f5f0' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
        <h2 style={{ color: '#b45309', marginBottom: '0.5rem' }}>Authentication Service Unavailable</h2>
        <p style={{ color: '#57534e' }}>
          Chama360 could not connect to the authentication service. This may be a network issue or a misconfigured API key.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function Root() {
  const [clerkError, setClerkError] = useState(false);

  if (!clerkKey) return <ClerkMissingKeyError />;
  if (clerkError) return <ClerkLoadError />;

  return (
    <ClerkProvider publishableKey={clerkKey} onLoadError={() => setClerkError(true)}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
