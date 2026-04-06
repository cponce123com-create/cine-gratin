import { Link } from "wouter";
import { Film } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <Film className="w-20 h-20 text-primary/30 mx-auto mb-6" />
        <h1 className="text-8xl font-heading text-primary mb-4">404</h1>
        <h2 className="text-2xl font-heading text-muted-foreground mb-4">
          Página No Encontrada
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-8">
          La página que buscas no existe o fue movida.
        </p>
        <Link
          href="/"
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-lg font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
        >
          Volver al Inicio
        </Link>
      </div>
    </div>
  );
}
