import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ERROR_CODES } from './shared/constants';
import { setAuthToken, clearAuthToken, getAuthToken } from './api';
import LoginPage from './LoginPage';
import PasswordChangePage from './PasswordChangePage';
import Dashboard from './components/Dashboard';
import SystemAdminPage from './components/SystemAdminPage';
import FamilyAdminPage from './components/FamilyAdminPage';
import Layout from './components/Layout';
import PackingListPage from './components/PackingListPage';
import CategoryManagementPage from './components/CategoryManagementPage';
import ItemManagementPage from './components/ItemManagementPage';
import TemplateManagerPage from './components/TemplateManagerPage';

interface User {
  username?: string;
  token?: string;
  role?: string;
}

interface LoginData {
  error?: string;
  username?: string;
  token?: string;
  role?: string;
}

export default function AppRoutes(): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Check for existing token on app initialization
  useEffect(() => {
    const existingToken = getAuthToken();
    if (existingToken) {
      try {
        // Decode the JWT token to get user information
        const payload = JSON.parse(atob(existingToken.split('.')[1]));
        
        // Check if token is still valid
        if (Date.now() < payload.exp * 1000) {
          console.log('🔄 Restoring user session from existing token');
          setUser({
            username: payload.username,
            token: existingToken,
            role: payload.role
          });
        } else {
          console.log('🔒 Existing token has expired, clearing it');
          clearAuthToken();
        }
      } catch (error) {
        console.error('❌ Error decoding existing token:', error);
        clearAuthToken();
      }
    }
    setIsInitializing(false);
  }, []);
  
  function handleLogin(data: LoginData): void {
    console.log('🚀 handleLogin called with:', data);
    
    if (data.error === ERROR_CODES.PASSWORD_CHANGE_REQUIRED) {
      console.log('🔄 Setting password change required for user:', data.username);
      setUser({ username: data.username });
      setMustChangePassword(true);
    } else if (data.token) {
      console.log('✅ Login successful, setting user with token');
      setAuthToken(data.token);
      setUser(data);
      setMustChangePassword(false);
    } else {
      console.log('❌ Login failed or no token received');
    }
  }

  function handleLogout(): void {
    clearAuthToken();
    setUser(null);
    setMustChangePassword(false);
  }

  // Show password change page
  if (mustChangePassword && user && user.username) {
    return (
      <PasswordChangePage
        username={user.username}
        onChange={() => setMustChangePassword(false)}
      />
    );
  }

  // Show loading state while checking for existing authentication
  if (isInitializing) {
    return <div>Loading...</div>;
  }

  // Show login page if not authenticated
  if (!user || !user.token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Show main app with routing
  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard user={user} />} />
        <Route 
          path="/admin/system" 
          element={
            user.role === 'SystemAdmin' ? (
              <SystemAdminPage />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />
        <Route 
          path="/admin/family" 
          element={
            user.role === 'SystemAdmin' || user.role === 'FamilyAdmin' ? (
              <FamilyAdminPage />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />
        <Route 
          path="/packing-lists" 
          element={<PackingListPage />} 
        />
        <Route 
          path="/categories" 
          element={<CategoryManagementPage />} 
        />
        <Route 
          path="/items" 
          element={<ItemManagementPage />} 
        />
          <Route 
            path="/templates" 
            element={<TemplateManagerPage />} 
          />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}