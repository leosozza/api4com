import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BitrixProvider } from "@/contexts/BitrixContext";
import { useBitrix } from "@/hooks/useBitrix";
import Dashboard from "./pages/Dashboard";
import Calls from "./pages/Calls";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="mt-4 text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="text-destructive text-6xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold mb-2">Erro ao carregar</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function DevModeNotice() {
  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-center text-sm text-yellow-700 dark:text-yellow-400">
      ⚠️ Modo desenvolvimento - Execute dentro do Bitrix24 para autenticação completa
    </div>
  );
}

function AppContent() {
  const { isLoading, isInitialized, isInBitrix, error } = useBitrix();

  if (isLoading || !isInitialized) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  return (
    <>
      {!isInBitrix && <DevModeNotice />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BitrixProvider>
        <AppContent />
      </BitrixProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
