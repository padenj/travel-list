import React, { useState, FormEvent } from 'react';
import { ERROR_CODES } from './shared/constants';
import { login } from './api';

interface LoginPageProps {
  onLogin: (data: any) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps): React.ReactElement {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    console.log('🎯 Login form submitted with username:', username);
    setLoading(true);
    setError('');
    
    try {
      console.log('📡 Calling login API...');
      const { response: res, data } = await login(username, password);
      console.log('📨 Login API response status:', res.status, 'data:', data);
      
      if (!res.ok) {
        console.log('❌ Login error response:', data);
        
        if (data.error === ERROR_CODES.PASSWORD_CHANGE_REQUIRED) {
          console.log('🔄 Password change required, calling onLogin with:', {
            error: data.error,
            username: data.username
          });
          onLogin({ error: data.error, username: data.username });
          return; // Don't set error message, let parent handle redirect
        } else {
          console.log('🚫 Setting error:', data.error || 'Login failed');
          setError(data.error || 'Login failed');
          onLogin(data);
        }
      } else {
        console.log('✅ Login successful, calling onLogin with data');
        onLogin(data);
      }
    } catch (err) {
      console.log('🔥 Network error caught:', err);
      setError('Network error');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
      console.log('🏁 Login process completed');
    }
  }

  return (
    <div style={{ 
      maxWidth: 400, 
      margin: '4rem auto', 
      padding: 24, 
      border: '1px solid #eee', 
      borderRadius: 8 
    }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{ width: '100%', padding: 8 }}
            required
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8 }}
            required
          />
        </div>
        {error && (
          <div style={{ color: 'red', marginBottom: 16 }}>
            {error}
          </div>
        )}
        <button 
          type="submit" 
          style={{ width: '100%', padding: 10 }} 
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}