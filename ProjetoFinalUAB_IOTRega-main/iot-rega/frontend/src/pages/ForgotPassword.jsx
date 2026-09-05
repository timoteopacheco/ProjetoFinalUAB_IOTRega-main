import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDevToken('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
      // Fora de produção o backend devolve o token para permitir a demonstração
      if (res.data.token) setDevToken(res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível processar o pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>🌿 IoT Rega</h1>
        <p className="auth-subtitle">Recuperar password</p>

        <label htmlFor="email">Email da conta</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && <div className="form-error">{error}</div>}
        {message && <div className="form-success">{message}</div>}

        {devToken && (
          <div className="dev-token">
            <strong>Modo de demonstração</strong>
            <p>Não há serviço de email configurado. Usa este token para redefinir a password:</p>
            <code>{devToken}</code>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => navigate(`/reset-password?token=${devToken}`)}
            >
              Continuar
            </button>
          </div>
        )}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'A enviar…' : 'Enviar link de recuperação'}
        </button>

        <p className="auth-switch">
          <Link to="/login">Voltar ao início de sessão</Link>
        </p>
      </form>
    </div>
  );
}
