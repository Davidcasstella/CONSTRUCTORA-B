import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(authService.getUser());
  const [token, setToken] = useState(authService.getToken());
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!token;

  async function login(username, password) {
    setLoading(true);
    try {
      const data = await authService.login(username, password);
      if (data.success) {
        authService.saveAuth(data.token, data.user);
        setToken(data.token);
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || 'Error al iniciar sesión' };
    } catch {
      return { success: false, error: 'Error de conexión. Intenta nuevamente.' };
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    authService.clearAuth();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
