import { Component } from 'react';

// Apanha erros de runtime na árvore de componentes e mostra um ecrã de erro
// em vez de deixar a aplicação em branco.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erro não tratado na interface:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="empty-state">
        <div className="error-code">⚠️</div>
        <h2>Ocorreu um erro inesperado</h2>
        <p>A aplicação encontrou um problema ao mostrar esta página.</p>
        <pre className="error-detail">{this.state.error.message}</pre>
        <button className="btn-primary" onClick={() => window.location.assign('/')}>
          Voltar ao dashboard
        </button>
      </div>
    );
  }
}
