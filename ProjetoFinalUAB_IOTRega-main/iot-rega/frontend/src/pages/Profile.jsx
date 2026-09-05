import { useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ROLE_LABEL = { admin: 'Administrador', user: 'Utilizador', viewer: 'Consulta' };

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.new_password !== form.confirm_password) {
      setError('A confirmação não coincide com a nova password.');
      return;
    }
    if (form.new_password.length < 6) {
      setError('A nova password deve ter pelo menos 6 caracteres.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      toast.success('Password alterada com sucesso.');
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível alterar a password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Perfil</h1>

      <div className="panel">
        <h2>Dados da conta</h2>
        <dl className="detail-list">
          <div><dt>Nome</dt><dd>{user?.name || '—'}</dd></div>
          <div><dt>Email</dt><dd>{user?.email || '—'}</dd></div>
          <div><dt>Perfil</dt><dd>{ROLE_LABEL[user?.role] || user?.role || '—'}</dd></div>
          <div>
            <dt>Conta criada em</dt>
            <dd>{user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-PT') : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="panel">
        <h2>Alterar password</h2>
        <form className="stacked-form" onSubmit={handleSubmit}>
          <label htmlFor="current_password">Password actual</label>
          <input
            id="current_password"
            type="password"
            autoComplete="current-password"
            value={form.current_password}
            onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            required
          />

          <label htmlFor="new_password">Nova password</label>
          <input
            id="new_password"
            type="password"
            autoComplete="new-password"
            value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            required
          />

          <label htmlFor="confirm_password">Confirmar nova password</label>
          <input
            id="confirm_password"
            type="password"
            autoComplete="new-password"
            value={form.confirm_password}
            onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
            required
          />

          {error && <div className="form-error">{error}</div>}

          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'A guardar…' : 'Alterar password'}
          </button>
        </form>
      </div>
    </div>
  );
}
