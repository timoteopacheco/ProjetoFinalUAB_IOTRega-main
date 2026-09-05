import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [token, setToken] = useState(searchParams.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('A confirmação não coincide com a nova password.');
      return;
    }
    if (password.length < 6) {
      setError('A password deve ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      toast.success('Password redefinida. Já podes iniciar sessão.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível redefinir a password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>🌿 IoT Rega</h1>
        <p className="auth-subtitle">Definir nova password</p>

        <label htmlFor="token">Token de recuperação</label>
        <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />

        <label htmlFor="password">Nova password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label htmlFor="confirm">Confirmar password</label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        {error && <div className="form-error">{error}</div>}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'A guardar…' : 'Redefinir password'}
        </button>

        <p className="auth-switch">
          <Link to="/login">Voltar ao início de sessão</Link>
        </p>
      </form>
    </div>
  );
}
