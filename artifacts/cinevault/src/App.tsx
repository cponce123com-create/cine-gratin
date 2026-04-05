import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";

import { Navbar } from "@/components/layout/Navbar";
import { BackToTop } from "@/components/layout/BackToTop";
import { KonamiEasterEgg } from "@/components/layout/KonamiEasterEgg";
import { Toaster as SonnerToaster } from "sonner";

import Home from "@/pages/home";
import Browse from "@/pages/browse";
import SearchPage from "@/pages/search";
import MovieDetail from "@/pages/movie-detail";
import Favorites from "@/pages/favorites";
import Series from "@/pages/series";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Switch location={location} key={location}>
        <Route path="/" component={Home} />
        <Route path="/browse" component={Browse} />
        <Route path="/search/:query" component={SearchPage} />
        <Route path="/movie/:id" component={MovieDetail} />
        <Route path="/favorites" component={Favorites} />
        <Route path="/series" component={Series} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="min-h-[100dvh] bg-background text-foreground flex flex-col relative font-sans">
            <Navbar />
            <main className="flex-1 w-full relative">
              <Router />
            </main>

            <footer className="border-t border-border bg-card py-8 mt-auto">
              <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-muted-foreground text-sm font-medium">
                  © {new Date().getFullYear()} CineVault. Powered by YTS API.
                </p>
                <div className="flex items-center gap-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  <a href="#" className="hover:text-primary transition-colors">Terms</a>
                  <a href="#" className="hover:text-primary transition-colors">Privacy</a>
                  <a href="#" className="hover:text-primary transition-colors">DMCA</a>
                </div>
              </div>
            </footer>

            <BackToTop />
            <KonamiEasterEgg />
          </div>
        </WouterRouter>
        <Toaster />
        <SonnerToaster theme="dark" position="bottom-right" className="font-sans" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
