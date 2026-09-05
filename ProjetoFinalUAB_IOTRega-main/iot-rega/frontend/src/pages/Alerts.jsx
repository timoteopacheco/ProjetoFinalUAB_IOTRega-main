import { useEffect, useState } from 'react';
import api from '../api/client';

const SEVERITY_LABEL = { info: 'Info', warning: 'Aviso', critical: 'Crítico' };

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [showResolved, setShowResolved] = useState(false);

  const load = () => {
    api.get('/alerts', { params: { resolved: showResolved ? 'true' : 'false', limit: 100 } })
      .then((res) => setAlerts(res.data));
  };

  useEffect(load, [showResolved]);

  const handleResolve = async (id) => {
    await api.patch(`/alerts/${id}/resolve`);
    load();
  };

  return (
    <div>
      <h1 className="page-title">Alertas</h1>

      <div className="panel-header">
        <label className="checkbox-label">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Mostrar resolvidos
        </label>
      </div>

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Severidade</th><th>Mensagem</th><th>Sensor</th><th>Talhão</th><th>Data</th><th></th></tr></thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td><span className={`badge badge-${a.severity}`}>{SEVERITY_LABEL[a.severity] || a.severity}</span></td>
                <td>{a.message}</td>
                <td>{a.sensor_name || '—'}</td>
                <td>{a.plot_name || '—'}</td>
                <td>{new Date(a.created_at).toLocaleString('pt-PT')}</td>
                <td>
                  {!a.resolved && <button className="btn-ghost" onClick={() => handleResolve(a.id)}>Resolver</button>}
                </td>
              </tr>
            ))}
            {alerts.length === 0 && <tr><td colSpan={6}>Sem alertas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
