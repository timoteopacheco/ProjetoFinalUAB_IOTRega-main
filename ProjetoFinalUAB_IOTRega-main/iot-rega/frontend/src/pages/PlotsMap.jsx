import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from 'react-leaflet';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import api from '../api/client';
import { useFarm } from '../context/FarmContext';
import DrawControl from '../components/DrawControl';


const CROP_TYPES = [
  'vinha',
  'olival',
  'pomar',
  'hortícolas',
  'outro',
];


// Centro usado apenas se não existir localização da exploração
const DEFAULT_CENTER = [38.5714, -7.9135];


// ============================================================
// ATUALIZAR CENTRO DO MAPA
// ============================================================

function MapCenterUpdater({ center, zoom = 15 }) {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(center) || center.length !== 2) {
      return;
    }

    const latitude = Number(center[0]);
    const longitude = Number(center[1]);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    map.setView(
      [latitude, longitude],
      zoom,
      {
        animate: false,
      }
    );
  }, [center, zoom, map]);

  return null;
}


// ============================================================
// ENQUADRAR O MAPA NOS TALHÕES
// ============================================================

function FitGeoJson({ geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson?.features?.length) {
      return;
    }

    const bounds = [];

    geojson.features.forEach((feature) => {
      const geometry = feature?.geometry;

      if (!geometry) {
        return;
      }

      // Polygon
      if (geometry.type === 'Polygon') {
        geometry.coordinates?.forEach((ring) => {
          ring?.forEach(([lng, lat]) => {
            if (
              Number.isFinite(Number(lat)) &&
              Number.isFinite(Number(lng))
            ) {
              bounds.push([
                Number(lat),
                Number(lng),
              ]);
            }
          });
        });
      }

      // MultiPolygon
      if (geometry.type === 'MultiPolygon') {
        geometry.coordinates?.forEach((polygon) => {
          polygon?.forEach((ring) => {
            ring?.forEach(([lng, lat]) => {
              if (
                Number.isFinite(Number(lat)) &&
                Number.isFinite(Number(lng))
              ) {
                bounds.push([
                  Number(lat),
                  Number(lng),
                ]);
              }
            });
          });
        });
      }
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 17,
      });
    }
  }, [geojson, map]);

  return null;
}


// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function PlotsMap() {
  const {
    farmId,
    farms,
  } = useFarm();


  // ----------------------------------------------------------
  // DADOS
  // ----------------------------------------------------------

  const [geojson, setGeojson] = useState(null);

  const [plots, setPlots] = useState([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);


  // ----------------------------------------------------------
  // SELEÇÃO
  // ----------------------------------------------------------

  const [selectedPlotId, setSelectedPlotId] =
    useState(null);


  // ----------------------------------------------------------
  // NOVO TALHÃO
  // ----------------------------------------------------------

  const [pending, setPending] = useState(null);


  // ----------------------------------------------------------
  // EDIÇÃO
  // ----------------------------------------------------------

  const [editingPlot, setEditingPlot] =
    useState(null);


  // ----------------------------------------------------------
  // FORMULÁRIO
  // ----------------------------------------------------------

  const [form, setForm] = useState({
    name: '',
    crop_type: 'vinha',
    area: '',
  });


  // ==========================================================
  // EXPLORAÇÃO SELECIONADA
  // ==========================================================

  const farm = farms.find(
    (item) =>
      String(item.id) === String(farmId)
  );


  // ==========================================================
  // CALCULAR CENTRO DA EXPLORAÇÃO
  // ==========================================================

  const center = useMemo(() => {
    if (!farm?.location_geojson) {
      return DEFAULT_CENTER;
    }

    try {
      const location =
        typeof farm.location_geojson === 'string'
          ? JSON.parse(farm.location_geojson)
          : farm.location_geojson;

      if (
        !location?.coordinates ||
        location.coordinates.length < 2
      ) {
        return DEFAULT_CENTER;
      }

      const [
        longitude,
        latitude,
      ] = location.coordinates;

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return DEFAULT_CENTER;
      }

      return [lat, lng];

    } catch (err) {
      console.error(
        'Erro ao interpretar localização da exploração:',
        err
      );

      return DEFAULT_CENTER;
    }
  }, [farm]);


  // ==========================================================
  // CARREGAR TALHÕES
  // ==========================================================

  useEffect(() => {
    if (!farmId) {
      setGeojson(null);
      setPlots([]);
      setSelectedPlotId(null);
      setEditingPlot(null);
      setLoading(false);
      return;
    }

    let cancelled = false;


    async function loadPlots() {
      /*
       * Muito importante:
       *
       * assim que mudamos de exploração,
       * eliminamos os dados da exploração anterior.
       */
      setGeojson(null);
      setPlots([]);
      setSelectedPlotId(null);
      setEditingPlot(null);

      setLoading(true);
      setError('');

      try {
        const [
          geojsonResponse,
          plotsResponse,
        ] = await Promise.all([
          api.get('/plots/geojson', {
            params: {
              farm_id: farmId,
            },
          }),

          api.get('/plots', {
            params: {
              farm_id: farmId,
            },
          }),
        ]);


        /*
         * Se entretanto mudámos de exploração,
         * ignoramos esta resposta.
         */
        if (cancelled) {
          return;
        }


        /*
         * Garantir estrutura GeoJSON válida.
         */
        const receivedGeojson =
          geojsonResponse.data;


        if (
          receivedGeojson?.type ===
            'FeatureCollection' &&
          Array.isArray(
            receivedGeojson.features
          )
        ) {
          setGeojson(receivedGeojson);
        } else {
          setGeojson({
            type: 'FeatureCollection',
            features: [],
          });
        }


        /*
         * Garantir que plots é sempre array.
         */
        setPlots(
          Array.isArray(plotsResponse.data)
            ? plotsResponse.data
            : []
        );

      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          'Erro ao carregar talhões:',
          err
        );

        setGeojson(null);
        setPlots([]);

        setError(
          err.response?.data?.error ||
          'Não foi possível carregar os talhões.'
        );

      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }


    loadPlots();


    /*
     * Cleanup.
     *
     * Se farmId mudar enquanto o pedido anterior
     * está em curso, a resposta anterior é ignorada.
     */
    return () => {
      cancelled = true;
    };

  }, [
    farmId,
    refreshKey,
  ]);


  // ==========================================================
  // ALTERAR FORMULÁRIO
  // ==========================================================

  const handleFormChange = (
    field,
    value
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };


  // ==========================================================
  // DESENHOU NOVO TALHÃO
  // ==========================================================

  const handleCreated = (
    geometry,
    layer
  ) => {
    setEditingPlot(null);

    setPending({
      geometry,
      layer,
    });

    setForm({
      name: '',
      crop_type: 'vinha',
      area: '',
    });

    setError('');
  };


  // ==========================================================
  // CANCELAR NOVO TALHÃO
  // ==========================================================

  const handleCancel = () => {
    pending?.layer?.remove();

    setPending(null);

    setForm({
      name: '',
      crop_type: 'vinha',
      area: '',
    });

    setError('');
  };


  // ==========================================================
  // GUARDAR NOVO TALHÃO
  // ==========================================================

  const handleSave = async (e) => {
    e.preventDefault();

    setError('');

    if (!pending?.geometry) {
      setError(
        'Desenha primeiro o polígono do talhão.'
      );

      return;
    }

    try {
      await api.post('/plots', {
        farm_id: Number(farmId),

        name: form.name.trim(),

        crop_type:
          form.crop_type,

        area:
          form.area !== ''
            ? parseFloat(form.area)
            : undefined,

        geojson:
          pending.geometry,
      });


      /*
       * Remover camada temporária desenhada.
       */
      pending.layer?.remove();


      setPending(null);


      setForm({
        name: '',
        crop_type: 'vinha',
        area: '',
      });


      /*
       * Forçar novo GET dos talhões e GeoJSON.
       */
      setRefreshKey(
        (current) => current + 1
      );

    } catch (err) {
      console.error(
        'Erro ao guardar talhão:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Não foi possível guardar o talhão.'
      );
    }
  };


  // ==========================================================
  // SELECIONAR TALHÃO
  // ==========================================================

  const handleSelectPlot = (
    plotId
  ) => {
    setSelectedPlotId(plotId);
  };


  // ==========================================================
  // EDITAR TALHÃO
  // ==========================================================

  const handleEdit = (
    plot
  ) => {
    /*
     * Se existir um polígono novo ainda não guardado,
     * removemo-lo.
     */
    pending?.layer?.remove();

    setPending(null);

    setEditingPlot(plot);

    setSelectedPlotId(plot.id);

    setForm({
      name:
        plot.name || '',

      crop_type:
        plot.crop_type ||
        'vinha',

      area:
        plot.area !== null &&
        plot.area !== undefined
          ? String(plot.area)
          : '',
    });

    setError('');
  };


  // ==========================================================
  // CANCELAR EDIÇÃO
  // ==========================================================

  const handleCancelEdit = () => {
    setEditingPlot(null);

    setForm({
      name: '',
      crop_type: 'vinha',
      area: '',
    });

    setError('');
  };


  // ==========================================================
  // GUARDAR ALTERAÇÕES DO TALHÃO
  // ==========================================================

  const handleUpdate = async (
    e
  ) => {
    e.preventDefault();

    if (!editingPlot) {
      return;
    }

    setError('');

    try {
      await api.put(
        `/plots/${editingPlot.id}`,
        {
          name:
            form.name.trim(),

          crop_type:
            form.crop_type,

          area:
            form.area !== ''
              ? parseFloat(form.area)
              : null,
        }
      );


      setEditingPlot(null);


      setForm({
        name: '',
        crop_type: 'vinha',
        area: '',
      });


      /*
       * Mantemos selectedPlotId.
       * Assim o talhão continua destacado
       * depois de ser atualizado.
       */


      setRefreshKey(
        (current) => current + 1
      );

    } catch (err) {
      console.error(
        'Erro ao editar talhão:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Não foi possível atualizar o talhão.'
      );
    }
  };


  // ==========================================================
  // ELIMINAR TALHÃO
  // ==========================================================

  const handleDelete = async (
    plot
  ) => {
    const confirmed =
      window.confirm(
        `Eliminar o talhão "${plot.name}"?\n\nEsta ação não pode ser desfeita.`
      );


    if (!confirmed) {
      return;
    }


    setError('');


    try {
      await api.delete(
        `/plots/${plot.id}`
      );


      if (
        String(selectedPlotId) ===
        String(plot.id)
      ) {
        setSelectedPlotId(null);
      }


      if (
        editingPlot &&
        String(editingPlot.id) ===
        String(plot.id)
      ) {
        setEditingPlot(null);
      }


      /*
       * Recarregar lista e GeoJSON.
       */
      setRefreshKey(
        (current) => current + 1
      );

    } catch (err) {
      console.error(
        'Erro ao eliminar talhão:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Não foi possível eliminar o talhão.'
      );
    }
  };


  // ==========================================================
  // SEM EXPLORAÇÕES
  // ==========================================================

  if (farms.length === 0) {
    return (
      <div className="empty-state">
        <h2>
          Sem explorações
        </h2>

        <p>
          Cria primeiro uma exploração agrícola.
        </p>
      </div>
    );
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div>

      <h1 className="page-title">
        Talhões — Mapa (WebSIG)
      </h1>


      <p className="hint-text">
        Usa a ferramenta de polígono no mapa
        (canto superior direito) para desenhar
        um novo talhão.
      </p>


      {/* =====================================================
          MAPA
          ===================================================== */}

      <div className="map-wrapper">

        <MapContainer
          key={String(farmId)}
          center={center}
          zoom={15}
          style={{
            height: '520px',
            width: '100%',
          }}
        >

          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />


          {/* Reposiciona quando muda a exploração */}

          <MapCenterUpdater
            center={center}
            zoom={15}
          />


          {/* Quando chegam os talhões,
              enquadra os polígonos */}

          <FitGeoJson
            geojson={geojson}
          />


          {/* =================================================
              GEOJSON DOS TALHÕES
              ================================================= */}

          {geojson?.features?.length > 0 && (

            <GeoJSON
              /*
               * Esta key é importante.
               *
               * Obriga o React-Leaflet a reconstruir
               * a camada quando:
               *
               * - muda a exploração;
               * - fazemos refresh;
               * - selecionamos outro talhão.
               */
              key={
                `${farmId}-${refreshKey}-${selectedPlotId ?? 'none'}`
              }

              data={geojson}


              style={(feature) => {
                const plotId =
                  feature?.properties?.id;


                const isSelected =
                  String(plotId) ===
                  String(selectedPlotId);


                return {
                  color:
                    isSelected
                      ? '#e53e3e'
                      : '#2f855a',

                  weight:
                    isSelected
                      ? 4
                      : 2,

                  fillColor:
                    isSelected
                      ? '#e53e3e'
                      : '#2f855a',

                  fillOpacity:
                    isSelected
                      ? 0.45
                      : 0.25,
                };
              }}


              onEachFeature={(
                feature,
                layer
              ) => {
                const p =
                  feature.properties || {};


                // Clique no polígono

                layer.on(
                  'click',
                  () => {
                    handleSelectPlot(
                      p.id
                    );
                  }
                );


                // Popup

                layer.bindPopup(`
                  <div>
                    <strong>
                      ${p.name || ''}
                    </strong>

                    <br/>

                    ${p.crop_type || ''}

                    ${
                      p.area !== null &&
                      p.area !== undefined
                        ? `<br/>Área: ${p.area} ha`
                        : ''
                    }
                  </div>
                `);
              }}
            />

          )}


          {/* Ferramenta de desenho */}

          <DrawControl
            onCreated={
              handleCreated
            }
          />

        </MapContainer>

      </div>


      {/* =====================================================
          NOVO TALHÃO
          ===================================================== */}

      {pending && (

        <div className="panel">

          <h2>
            Novo talhão
          </h2>


          <form
            className="inline-form"
            onSubmit={handleSave}
          >

            <input
              placeholder="Nome do talhão"
              value={form.name}
              onChange={(e) =>
                handleFormChange(
                  'name',
                  e.target.value
                )
              }
              required
            />


            <select
              value={form.crop_type}
              onChange={(e) =>
                handleFormChange(
                  'crop_type',
                  e.target.value
                )
              }
            >

              {CROP_TYPES.map(
                (crop) => (
                  <option
                    key={crop}
                    value={crop}
                  >
                    {crop}
                  </option>
                )
              )}

            </select>


            <input
              placeholder="Área (ha)"
              type="number"
              min="0"
              step="any"
              value={form.area}
              onChange={(e) =>
                handleFormChange(
                  'area',
                  e.target.value
                )
              }
            />


            <button
              className="btn-primary"
              type="submit"
            >
              Guardar
            </button>


            <button
              className="btn-ghost"
              type="button"
              onClick={handleCancel}
            >
              Cancelar
            </button>

          </form>


          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

        </div>

      )}


      {/* =====================================================
          EDITAR TALHÃO
          ===================================================== */}

      {editingPlot && (

        <div className="panel">

          <h2>
            Editar talhão
          </h2>


          <form
            className="inline-form"
            onSubmit={handleUpdate}
          >

            <input
              placeholder="Nome do talhão"
              value={form.name}
              onChange={(e) =>
                handleFormChange(
                  'name',
                  e.target.value
                )
              }
              required
            />


            <select
              value={form.crop_type}
              onChange={(e) =>
                handleFormChange(
                  'crop_type',
                  e.target.value
                )
              }
            >

              {CROP_TYPES.map(
                (crop) => (
                  <option
                    key={crop}
                    value={crop}
                  >
                    {crop}
                  </option>
                )
              )}

            </select>


            <input
              placeholder="Área (ha)"
              type="number"
              min="0"
              step="any"
              value={form.area}
              onChange={(e) =>
                handleFormChange(
                  'area',
                  e.target.value
                )
              }
            />


            <button
              className="btn-primary"
              type="submit"
            >
              Guardar alterações
            </button>


            <button
              className="btn-ghost"
              type="button"
              onClick={
                handleCancelEdit
              }
            >
              Cancelar
            </button>

          </form>


          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

        </div>

      )}


      {/* =====================================================
          ERRO GERAL
          ===================================================== */}

      {error &&
        !pending &&
        !editingPlot && (

          <div className="form-error">
            {error}
          </div>

        )}


      {/* =====================================================
          LISTA DE TALHÕES
          ===================================================== */}

      <div className="panel">

        <h2>
          Talhões desta exploração
        </h2>


        {loading ? (

          <p>
            A carregar talhões...
          </p>

        ) : (

          <table className="data-table">

            <thead>

              <tr>
                <th>Nome</th>
                <th>Cultura</th>
                <th>Área (ha)</th>
                <th>Sensores</th>
                <th>Ações</th>
              </tr>

            </thead>


            <tbody>

              {plots.map((plot) => {
                const selected =
                  String(
                    selectedPlotId
                  ) ===
                  String(
                    plot.id
                  );


                return (

                  <tr
                    key={plot.id}

                    onClick={() =>
                      handleSelectPlot(
                        plot.id
                      )
                    }

                    style={{
                      cursor: 'pointer',

                      backgroundColor:
                        selected
                          ? '#fff5f5'
                          : undefined,
                    }}
                  >

                    <td>
                      {plot.name}
                    </td>


                    <td>
                      {plot.crop_type}
                    </td>


                    <td>
                      {plot.area ?? '—'}
                    </td>


                    <td>
                      {plot.sensor_count ?? 0}
                    </td>


                    <td>

                      <button
                        className="btn-ghost"
                        type="button"

                        onClick={(e) => {
                          e.stopPropagation();

                          handleEdit(
                            plot
                          );
                        }}

                        style={{
                          marginRight:
                            '8px',
                        }}
                      >
                        Editar
                      </button>


                      <button
                        className="btn-ghost"
                        type="button"

                        onClick={(e) => {
                          e.stopPropagation();

                          handleDelete(
                            plot
                          );
                        }}
                      >
                        Eliminar
                      </button>

                    </td>

                  </tr>

                );
              })}


              {plots.length === 0 && (

                <tr>
                  <td colSpan={5}>
                    Sem talhões ainda.
                  </td>
                </tr>

              )}

            </tbody>

          </table>

        )}

      </div>

    </div>
  );
}