import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@iotrega.pt');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível iniciar sessão.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>🌿 IoT Rega</h1>
        <p className="auth-subtitle">Plataforma de gestão de rega vitivinícola</p>

        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="form-error">{error}</div>}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'A entrar…' : 'Entrar'}
        </button>

        <p className="auth-switch">
          <Link to="/forgot-password">Esqueceste-te da password?</Link>
        </p>

        <p className="auth-switch">
          Ainda não tens conta? <Link to="/register">Regista-te</Link>
        </p>
      </form>
    </div>
  );
}
