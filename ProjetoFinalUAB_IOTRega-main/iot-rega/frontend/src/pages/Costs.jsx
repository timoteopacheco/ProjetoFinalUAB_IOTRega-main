import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { useFarm } from '../context/FarmContext';
import { useToast } from '../context/ToastContext';
import Spinner from '../components/Spinner';

const CATEGORIES = ['water', 'energy', 'maintenance', 'fertilization'];
const CATEGORY_LABEL = {
  water: 'Água',
  energy: 'Energia',
  maintenance: 'Manutenção',
  fertilization: 'Fertilização',
};

const emptyForm = { plot_id: '', description: '', amount: '', date: '', category: 'water' };

export default function Costs() {
  const { farmId } = useFarm();
  const toast = useToast();
  const [plots, setPlots] = useState([]);
  const [costs, setCosts] = useState([]);
  const [summary, setSummary] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCosts = useCallback(
    () => api.get('/costs').then((res) => setCosts(res.data)),
    []
  );

  const loadSummary = useCallback(
    () => api.get('/costs/summary', { params: { farm_id: farmId } }).then((res) => setSummary(res.data)),
    [farmId]
  );

  useEffect(() => {
    if (!farmId) {
      setPlots([]);
      setCosts([]);
      setSummary([]);
      return;
    }

    setLoading(true);
    Promise.all([
      api.get('/plots', { params: { farm_id: farmId } }).then((res) => {
        setPlots(res.data);
        setForm((f) => ({ ...f, plot_id: f.plot_id || (res.data[0] ? String(res.data[0].id) : '') }));
      }),
      loadCosts(),
      loadSummary(),
    ])
      .catch(() => toast.error('Não foi possível carregar os custos.'))
      .finally(() => setLoading(false));
  }, [farmId, loadCosts, loadSummary, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.plot_id) {
      setError('Cria primeiro um talhão nesta exploração para poderes registar custos.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/costs', {
        ...form,
        plot_id: Number(form.plot_id),
        amount: parseFloat(form.amount),
      });
      setForm({ ...form, description: '', amount: '', date: '' });
      await Promise.all([loadCosts(), loadSummary()]);
      toast.success('Custo registado.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Não foi possível registar o custo.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (cost) => {
    setEditingId(cost.id);
    setEditForm({
      plot_id: String(cost.plot_id),
      description: cost.description || '',
      amount: String(cost.amount),
      date: cost.date ? new Date(cost.date).toISOString().slice(0, 10) : '',
      category: cost.category,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/costs/${id}`, {
        description: editForm.description,
        amount: parseFloat(editForm.amount),
        date: editForm.date,
        category: editForm.category,
      });
      cancelEdit();
      await Promise.all([loadCosts(), loadSummary()]);
      toast.success('Custo actualizado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível actualizar o custo.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este registo de custo?')) return;
    try {
      await api.delete(`/costs/${id}`);
      await Promise.all([loadCosts(), loadSummary()]);
      toast.success('Registo eliminado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível eliminar o registo.');
    }
  };

  const plotIds = new Set(plots.map((p) => p.id));
  const farmCosts = costs.filter((c) => plotIds.has(c.plot_id));

  const chartData = Object.values(
    summary.reduce((acc, row) => {
      acc[row.month] = acc[row.month] || { month: row.month };
      acc[row.month][row.category] = Number(row.total);
      return acc;
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month));

  if (loading) return <Spinner label="A carregar custos…" />;

  return (
    <div>
      <h1 className="page-title">Custos Operacionais</h1>

      <div className="panel">
        <h2>Novo registo</h2>
        {plots.length === 0 ? (
          <p className="hint-text">
            Esta exploração ainda não tem talhões. Cria um talhão no mapa antes de registares custos.
          </p>
        ) : (
          <form className="inline-form" onSubmit={handleSubmit}>
            <select value={form.plot_id} onChange={(e) => setForm({ ...form, plot_id: e.target.value })} required>
              {plots.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder="Valor (€)" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'A guardar…' : 'Registar'}
            </button>
          </form>
        )}
        {error && <div className="form-error">{error}</div>}
      </div>

      {chartData.length > 0 && (
        <div className="panel">
          <h2>Resumo mensal</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              {CATEGORIES.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="a" name={CATEGORY_LABEL[c]} fill={['#2f855a', '#3182ce', '#dd6b20', '#805ad5'][i]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="panel">
        <table className="data-table">
          <thead><tr><th>Talhão</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Data</th><th></th></tr></thead>
          <tbody>
            {farmCosts.map((c) => (
              editingId === c.id ? (
                <tr key={c.id}>
                  <td>{c.plot_name}</td>
                  <td>
                    <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
                      {CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABEL[cat]}</option>)}
                    </select>
                  </td>
                  <td>
                    <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                  </td>
                  <td>
                    <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                  </td>
                  <td>
                    <button className="btn-ghost" onClick={() => saveEdit(c.id)}>Guardar</button>
                    <button className="btn-ghost" onClick={cancelEdit}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.plot_name}</td>
                  <td>{CATEGORY_LABEL[c.category] || c.category}</td>
                  <td>{c.description || '—'}</td>
                  <td>{Number(c.amount).toFixed(2)} €</td>
                  <td>{new Date(c.date).toLocaleDateString('pt-PT')}</td>
                  <td>
                    <button className="btn-ghost" onClick={() => startEdit(c)}>Editar</button>
                    <button className="btn-ghost" onClick={() => handleDelete(c.id)}>Eliminar</button>
                  </td>
                </tr>
              )
            ))}
            {farmCosts.length === 0 && <tr><td colSpan={6}>Sem registos de custos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
