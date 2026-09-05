import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { useFarm } from '../context/FarmContext';
import StatCard from '../components/StatCard';

const SENSOR_ICON = {
  temperature: '🌡️',
  humidity: '💧',
  soil_moisture: '🌱',
  rainfall: '🌧️',
  wind_speed: '💨',
};

export default function Dashboard() {
  const { farmId, farms } = useFarm();
  const [summary, setSummary] = useState(null);
  const [chart, setChart] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!farmId) { setSummary(null); return; }
    setLoading(true);
    setError('');
    api.get('/dashboard/summary', { params: { farm_id: farmId } })
      .then((res) => {
        setSummary(res.data);
        const firstWithReading = res.data.latestReadings?.find((r) => r.value !== null);
        setSelectedSensor(firstWithReading ? String(firstWithReading.id) : '');
      })
      .catch(() => setError('Não foi possível carregar o resumo do dashboard.'))
      .finally(() => setLoading(false));
  }, [farmId]);

  useEffect(() => {
    if (!selectedSensor) { setChart([]); return; }
    api.get('/dashboard/chart', { params: { sensor_id: selectedSensor, period: '24h' } })
      .then((res) => setChart(res.data.map((d) => ({ ...d, bucket: new Date(d.bucket).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) }))))
      .catch(() => setChart([]));
  }, [selectedSensor]);

  if (farms.length === 0) {
    return (
      <div className="empty-state">
        <h2>Ainda não tens nenhuma exploração</h2>
        <p>Cria a tua primeira exploração agrícola para começares a monitorizar sensores.</p>
        <a className="btn-primary" href="/farms">Criar exploração</a>
      </div>
    );
  }

  if (loading) return <div className="page-loading">A carregar dashboard…</div>;
  if (error) return <div className="form-error">{error}</div>;
  if (!summary) return null;

  const alertsTotal = summary.alerts.reduce((acc, a) => acc + a.total, 0);
  const criticalAlerts = summary.alerts.find((a) => a.severity === 'critical')?.total || 0;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="stat-grid">
        <StatCard
          label="Sensores activos"
          value={`${summary.sensors?.active ?? 0} / ${summary.sensors?.total ?? 0}`}
        />
        <StatCard
          label="Alertas não resolvidos"
          value={alertsTotal}
          tone={criticalAlerts > 0 ? 'danger' : alertsTotal > 0 ? 'warning' : 'ok'}
          hint={criticalAlerts > 0 ? `${criticalAlerts} crítico(s)` : undefined}
        />
        <StatCard
          label="Custo este mês"
          value={`${summary.costThisMonth.toFixed(2)} €`}
        />
        <StatCard
          label="Talhões"
          value={summary.plots.length}
        />
      </div>

      {summary.weather && (
        <div className="panel">
          <h2>Clima actual</h2>
          <div className="weather-row">
            <span>🌡️ {summary.weather.temperature}°C</span>
            <span>💧 {summary.weather.humidity}%</span>
            <span>🌧️ {summary.weather.rainfall} mm</span>
            <span>💨 {summary.weather.wind_speed} km/h</span>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>Últimas leituras</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>Sensor</th><th>Tipo</th><th>Valor</th><th>Hora</th></tr>
          </thead>
          <tbody>
            {summary.latestReadings.map((r) => (
              <tr
                key={r.id}
                className={String(r.id) === selectedSensor ? 'row-selected' : ''}
                onClick={() => setSelectedSensor(String(r.id))}
              >
                <td>{r.name}</td>
                <td>{SENSOR_ICON[r.type] || ''} {r.type}</td>
                <td>{r.value !== null ? `${r.value} ${r.unit || ''}` : '—'}</td>
                <td>{r.time ? new Date(r.time).toLocaleString('pt-PT') : '—'}</td>
              </tr>
            ))}
            {summary.latestReadings.length === 0 && (
              <tr><td colSpan={4}>Sem sensores registados neste talhão.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedSensor && (
        <div className="panel">
          <h2>Gráfico (últimas 24h)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="avg" stroke="#2f855a" strokeWidth={2} dot={false} name="Média" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
