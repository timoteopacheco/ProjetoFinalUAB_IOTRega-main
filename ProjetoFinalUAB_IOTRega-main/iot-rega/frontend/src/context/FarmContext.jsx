import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const FarmContext = createContext(null);

export function FarmProvider({ children }) {
  const { user } = useAuth();
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(() => localStorage.getItem('farmId') || '');
  const [loading, setLoading] = useState(false);

  const refreshFarms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/farms');
      setFarms(res.data);
      setFarmId((current) => {
        if (current && res.data.some((f) => String(f.id) === String(current))) {
          return current;
        }
        return res.data[0] ? String(res.data[0].id) : '';
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) refreshFarms();
    else {
      setFarms([]);
      setFarmId('');
    }
  }, [user, refreshFarms]);

  useEffect(() => {
    if (farmId) localStorage.setItem('farmId', farmId);
  }, [farmId]);

  return (
    <FarmContext.Provider value={{ farms, farmId, setFarmId, loading, refreshFarms }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm() {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm deve ser usado dentro de FarmProvider');
  return ctx;
}
