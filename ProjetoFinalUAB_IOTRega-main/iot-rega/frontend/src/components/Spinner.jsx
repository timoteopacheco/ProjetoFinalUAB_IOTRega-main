export default function Spinner({ label = 'A carregar…', inline = false }) {
  if (inline) return <span className="spinner spinner-inline" role="status" aria-label={label} />;

  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="spinner" />
      <div>{label}</div>
    </div>
  );
}
