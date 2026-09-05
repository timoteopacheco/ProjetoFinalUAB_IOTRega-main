import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';

const PERIODS = [
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

export default function SensorDetail() {
  const { id } = useParams();
  const [sensor, setSensor] = useState(null);
  const [period, setPeriod] = useState('24h');
  const [chart, setChart] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get(`/sensors/${id}`).then((res) => setSensor(res.data));
  }, [id]);

  useEffect(() => {
    api.get('/dashboard/chart', { params: { sensor_id: id, period } })
      .then((res) => setChart(res.data.map((d) => ({
        ...d,
        bucket: new Date(d.bucket).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      }))));
    api.get('/readings/stats', { params: { sensor_id: id, period } }).then((res) => setStats(res.data));
  }, [id, period]);

  if (!sensor) return <div className="page-loading">A carregar…</div>;

  return (
    <div>
      <Link to="/sensors" className="back-link">&larr; Sensores</Link>
      <h1 className="page-title">{sensor.name} <span className="muted">({sensor.type})</span></h1>
      <p className="hint-text">Talhão: {sensor.plot_name}</p>

      <div className="period-tabs">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={'tab' + (period === p.value ? ' active' : '')}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {stats && (
        <div className="stat-grid">
          <StatCard label="Leituras" value={stats.total_readings} />
          <StatCard label="Média" value={stats.avg_value ? Number(stats.avg_value).toFixed(2) : '—'} />
          <StatCard label="Mínimo" value={stats.min_value ?? '—'} />
          <StatCard label="Máximo" value={stats.max_value ?? '—'} />
        </div>
      )}

      <div className="panel">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" minTickGap={30} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="avg" stroke="#2f855a" strokeWidth={2} dot={false} name="Média" />
            <Line type="monotone" dataKey="min" stroke="#a0aec0" strokeWidth={1} dot={false} name="Mín" />
            <Line type="monotone" dataKey="max" stroke="#a0aec0" strokeWidth={1} dot={false} name="Máx" />
          </LineChart>
        </ResponsiveContainer>
        {chart.length === 0 && <p className="hint-text">Sem leituras neste período.</p>}
      </div>
    </div>
  );
}
