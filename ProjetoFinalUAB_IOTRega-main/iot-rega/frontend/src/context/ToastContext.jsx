import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, type = 'info') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const success = useCallback((msg) => notify(msg, 'success'), [notify]);
  const error = useCallback((msg) => notify(msg, 'error'), [notify]);

  // Identidade estável: sem isto, cada toast mostrado recriaria o valor do
  // contexto e voltaria a disparar os efeitos que dependem de `toast`.
  const value = useMemo(() => ({ notify, success, error }), [notify, success, error]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}
