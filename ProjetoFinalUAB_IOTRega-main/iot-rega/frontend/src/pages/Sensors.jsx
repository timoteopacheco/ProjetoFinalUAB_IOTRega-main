import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useFarm } from '../context/FarmContext';

const SENSOR_TYPES = ['humidity', 'temperature', 'soil_moisture', 'rainfall', 'wind_speed'];

export default function Sensors() {
  const { farmId } = useFarm();
  const [plots, setPlots] = useState([]);
  const [plotId, setPlotId] = useState('');
  const [sensors, setSensors] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'soil_moisture', unit: '', device_id: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!farmId) return;
    api.get('/plots', { params: { farm_id: farmId } }).then((res) => {
      setPlots(res.data);
      setPlotId((current) => current || (res.data[0] ? String(res.data[0].id) : ''));
    });
  }, [farmId]);

  const loadSensors = () => {
    if (!plotId) return;
    api.get('/sensors', { params: { plot_id: plotId } }).then((res) => setSensors(res.data));
  };

  useEffect(loadSensors, [plotId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/sensors', { plot_id: Number(plotId), ...form, device_id: form.device_id || undefined });
      setForm({ name: '', type: 'soil_moisture', unit: '', device_id: '' });
      loadSensors();
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível criar o sensor.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este sensor e as suas leituras?')) return;
    await api.delete(`/sensors/${id}`);
    loadSensors();
  };

  return (
    <div>
      <h1 className="page-title">Sensores</h1>

      <div className="panel">
        <label>Talhão</label>
        <select value={plotId} onChange={(e) => setPlotId(e.target.value)}>
          {plots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {plotId && (
        <div className="panel">
          <h2>Novo sensor</h2>
          <form className="inline-form" onSubmit={handleSubmit}>
            <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {SENSOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Unidade (ex: %, °C)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <input placeholder="Device ID (MQTT)" value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} />
            <button className="btn-primary" type="submit">Criar</button>
          </form>
          {error && <div className="form-error">{error}</div>}
        </div>
      )}

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Última leitura</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {sensors.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/sensors/${s.id}`}>{s.name}</Link></td>
                <td>{s.type}</td>
                <td>{s.last_value !== null ? `${s.last_value} ${s.unit || ''}` : '—'}</td>
                <td>{s.active ? 'Activo' : 'Inactivo'}</td>
                <td><button className="btn-ghost" onClick={() => handleDelete(s.id)}>Eliminar</button></td>
              </tr>
            ))}
            {sensors.length === 0 && <tr><td colSpan={5}>Sem sensores neste talhão.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
