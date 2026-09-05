import { useState } from 'react';
import api from '../api/client';
import { useFarm } from '../context/FarmContext';

export default function Farms() {
  const { farms, refreshFarms, setFarmId } = useFarm();

  const [form, setForm] = useState({
    name: '',
    description: '',
    latitude: '',
    longitude: '',
  });

  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isEditing = editingId !== null;

  const handleChange = (field) => (e) => {
    setForm((current) => ({
      ...current,
      [field]: e.target.value,
    }));
  };

  // -----------------------------
  // CRIAR / EDITAR
  // -----------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    setSubmitting(true);

    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      };

      if (isEditing) {
        // EDITAR
        await api.put(`/farms/${editingId}`, data);

        // Mantém a exploração selecionada
        setFarmId(String(editingId));

        // Sai do modo de edição
        setEditingId(null);
      } else {
        // CRIAR
        const res = await api.post('/farms', data);

        setFarmId(String(res.data.id));
      }

      // Limpar formulário
      setForm({
        name: '',
        description: '',
        latitude: '',
        longitude: '',
      });

      // Atualizar lista
      await refreshFarms();
    } catch (err) {
      setError(
        err.response?.data?.error ||
          (isEditing
            ? 'Não foi possível atualizar a exploração.'
            : 'Não foi possível criar a exploração.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------
  // COMEÇAR A EDITAR
  // -----------------------------
  const handleEdit = (farm) => {
    setError('');

    setEditingId(farm.id);

    setForm({
      name: farm.name || '',
      description: farm.description || '',
      latitude:
        farm.latitude !== null && farm.latitude !== undefined
          ? String(farm.latitude)
          : '',
      longitude:
        farm.longitude !== null && farm.longitude !== undefined
          ? String(farm.longitude)
          : '',
    });

    // Seleciona também esta exploração na aplicação
    setFarmId(String(farm.id));

    // Scroll para o formulário
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // -----------------------------
  // CANCELAR EDIÇÃO
  // -----------------------------
  const handleCancelEdit = () => {
    setEditingId(null);

    setForm({
      name: '',
      description: '',
      latitude: '',
      longitude: '',
    });

    setError('');
  };

  // -----------------------------
  // ELIMINAR
  // -----------------------------
  const handleDelete = async (id) => {
    if (
      !window.confirm(
        'Eliminar esta exploração e todos os seus dados?'
      )
    ) {
      return;
    }

    setError('');

    try {
      await api.delete(`/farms/${id}`);

      // Se estávamos a editar esta exploração, cancelar edição
      if (editingId === id) {
        handleCancelEdit();
      }

      await refreshFarms();
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Não foi possível eliminar a exploração.'
      );
    }
  };

  return (
    <div>
      <h1 className="page-title">
        Explorações Agrícolas
      </h1>

      {/* ========================= */}
      {/* FORMULÁRIO */}
      {/* ========================= */}

      <div className="panel">
        <h2>
          {isEditing
            ? 'Editar exploração'
            : 'Nova exploração'}
        </h2>

        <form
          className="inline-form"
          onSubmit={handleSubmit}
        >
          <input
            placeholder="Nome"
            value={form.name}
            onChange={handleChange('name')}
            required
          />

          <input
            placeholder="Descrição"
            value={form.description}
            onChange={handleChange('description')}
          />

          <input
            placeholder="Latitude"
            type="number"
            step="any"
            value={form.latitude}
            onChange={handleChange('latitude')}
            required
          />

          <input
            placeholder="Longitude"
            type="number"
            step="any"
            value={form.longitude}
            onChange={handleChange('longitude')}
            required
          />

          <button
            className="btn-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? 'A guardar...'
              : isEditing
                ? 'Guardar alterações'
                : 'Criar'}
          </button>

          {isEditing && (
            <button
              className="btn-ghost"
              type="button"
              onClick={handleCancelEdit}
              disabled={submitting}
            >
              Cancelar
            </button>
          )}
        </form>

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}
      </div>

      {/* ========================= */}
      {/* LISTA DE EXPLORAÇÕES */}
      {/* ========================= */}

      <div className="panel">
        <h2>Explorações</h2>

        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Talhões</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {farms.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>

                <td>
                  {f.description || '—'}
                </td>

                <td>
                  {f.latitude !== null &&
                  f.latitude !== undefined
                    ? Number(f.latitude).toFixed(6)
                    : '—'}
                </td>

                <td>
                  {f.longitude !== null &&
                  f.longitude !== undefined
                    ? Number(f.longitude).toFixed(6)
                    : '—'}
                </td>

                <td>
                  {f.plot_count ?? 0}
                </td>

                <td>
                  <button
                    className="btn-ghost"
                    onClick={() => handleEdit(f)}
                  >
                    Editar
                  </button>

                  {' '}

                  <button
                    className="btn-ghost"
                    onClick={() =>
                      handleDelete(f.id)
                    }
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}

            {farms.length === 0 && (
              <tr>
                <td colSpan={6}>
                  Ainda não existem explorações.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}