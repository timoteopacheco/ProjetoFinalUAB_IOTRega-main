import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="empty-state">
      <div className="error-code">404</div>
      <h2>Página não encontrada</h2>
      <p>O endereço que tentaste abrir não existe ou foi movido.</p>
      <Link className="btn-primary" to="/">Voltar ao dashboard</Link>
    </div>
  );
}
