import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
      <div className="text-center px-4">
        <p className="text-brand-red font-black text-8xl mb-4">404</p>
        <h1 className="text-white text-2xl font-bold mb-2">Pagina no encontrada</h1>
        <p className="text-gray-400 text-sm mb-8">
          La pagina que buscas no existe o fue movida.
        </p>
        <Link
          to="/"
          className="inline-block bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
