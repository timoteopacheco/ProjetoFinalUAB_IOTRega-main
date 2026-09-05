import { useEffect, useState } from 'react';
import api from '../api/client';

const SENSOR_TYPES = ['humidity', 'temperature', 'soil_moisture', 'rainfall', 'wind_speed'];
const CONDITIONS = ['>', '<', '>=', '<=', '='];
const SEVERITIES = ['info', 'warning', 'critical'];

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({ name: '', sensor_type: 'soil_moisture', threshold: '', condition: '<', severity: 'warning' });
  const [error, setError] = useState('');

  const load = () => api.get('/rules').then((res) => setRules(res.data));
  useEffect(() => {
    load();
}, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/rules', { ...form, threshold: parseFloat(form.threshold) });
      setForm({ name: '', sensor_type: 'soil_moisture', threshold: '', condition: '<', severity: 'warning' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar a regra.');
    }
  };

  const toggleActive = async (rule) => {
    await api.put(`/rules/${rule.id}`, { active: !rule.active });
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar esta regra?')) return;
    await api.delete(`/rules/${id}`);
    load();
  };

  return (
    <div>
      <h1 className="page-title">Regras de Alerta</h1>

      <div className="panel">
        <h2>Nova regra</h2>
        <form className="inline-form" onSubmit={handleSubmit}>
          <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.sensor_type} onChange={(e) => setForm({ ...form, sensor_type: e.target.value })}>
            {SENSOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Valor limite" type="number" step="any" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} required />
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn-primary" type="submit">Criar</button>
        </form>
        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Condição</th><th>Severidade</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{r.name || '—'}</td>
                <td>{r.sensor_type}</td>
                <td>{r.condition} {r.threshold}</td>
                <td><span className={`badge badge-${r.severity}`}>{r.severity}</span></td>
                <td>{r.active ? 'Activa' : 'Inactiva'}</td>
                <td>
                  <button className="btn-ghost" onClick={() => toggleActive(r)}>{r.active ? 'Desactivar' : 'Activar'}</button>
                  <button className="btn-ghost" onClick={() => handleDelete(r.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={6}>Sem regras definidas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
