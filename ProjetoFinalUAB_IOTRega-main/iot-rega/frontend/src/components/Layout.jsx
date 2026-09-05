import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFarm } from '../context/FarmContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/farms', label: 'Explorações' },
  { to: '/plots', label: 'Talhões (Mapa)' },
  { to: '/sensors', label: 'Sensores' },
  { to: '/alerts', label: 'Alertas' },
  { to: '/rules', label: 'Regras' },
  { to: '/costs', label: 'Custos' },
  { to: '/weather', label: 'Clima' },
  { to: '/profile', label: 'Perfil' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { farms, farmId, setFarmId } = useFarm();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Fecha o menu lateral ao mudar de página (relevante em ecrãs pequenos)
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <div className="brand">🌿 IoT Rega</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Alternar menu de navegação"
            aria-expanded={menuOpen}
          >
            ☰
          </button>

          <select
            className="farm-select"
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
          >
            {farms.length === 0 && <option value="">Sem explorações</option>}
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <div className="user-box">
            <Link to="/profile" className="user-name">{user?.name}</Link>
            <button className="btn-ghost" onClick={logout}>Sair</button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
