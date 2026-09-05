import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { useFarm } from '../context/FarmContext';

export default function Weather() {
  const { farmId } = useFarm();
  const [plots, setPlots] = useState([]);
  const [plotId, setPlotId] = useState('');
  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!farmId) return;
    api.get('/plots', { params: { farm_id: farmId } }).then((res) => {
      setPlots(res.data);
      setPlotId((current) => current || (res.data[0] ? String(res.data[0].id) : ''));
    });
  }, [farmId]);

  const load = () => {
    if (!plotId) return;
    api.get('/weather', { params: { plot_id: plotId } }).then((res) =>
      setHistory([...res.data].reverse().map((d) => ({ ...d, time: new Date(d.time).toLocaleString('pt-PT', { day: '2-digit', hour: '2-digit' }) })))
    );
    api.get('/weather/forecast', { params: { plot_id: plotId } }).then((res) => setForecast(res.data));
  };

  useEffect(load, [plotId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.post('/weather/refresh', null, { params: { plot_id: plotId } });
      load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Clima</h1>

      <div className="panel-header">
        <select value={plotId} onChange={(e) => setPlotId(e.target.value)}>
          {plots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-primary" onClick={handleRefresh} disabled={!plotId || refreshing}>
          {refreshing ? 'A actualizar…' : 'Actualizar agora'}
        </button>
      </div>

      <div className="panel">
        <h2>Histórico (últimas leituras)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" minTickGap={30} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="temperature" stroke="#dd6b20" dot={false} name="Temp (°C)" />
            <Line type="monotone" dataKey="humidity" stroke="#3182ce" dot={false} name="Humidade (%)" />
            <Line type="monotone" dataKey="rainfall" stroke="#2f855a" dot={false} name="Chuva (mm)" />
          </LineChart>
        </ResponsiveContainer>
        {history.length === 0 && <p className="hint-text">Sem dados climáticos ainda. Usa "Actualizar agora".</p>}
      </div>

      <div className="panel">
        <h2>Previsão (7 dias)</h2>
        <table className="data-table">
          <thead><tr><th>Data</th><th>Temp. máx</th><th>Chuva</th><th>Prob. chuva</th></tr></thead>
          <tbody>
            {forecast.map((f) => (
              <tr key={f.id}>
                <td>{new Date(f.forecast_time).toLocaleDateString('pt-PT')}</td>
                <td>{f.temperature}°C</td>
                <td>{f.rainfall} mm</td>
                <td>{Math.round(f.probability_rain * 100)}%</td>
              </tr>
            ))}
            {forecast.length === 0 && <tr><td colSpan={4}>Sem previsão disponível.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
