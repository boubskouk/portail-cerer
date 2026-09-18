import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/auth/RequireAuth';
import { AuthProvider } from './context/AuthContext';
import { useRole } from './context/RoleContext';
import { DEFAULT_SCREEN } from './data/nav';
import { AbsencesPage } from './pages/AbsencesPage';
import { AccueilPage } from './pages/AccueilPage';
import { AnnuairePage } from './pages/AnnuairePage';
import { ComptesPage } from './pages/ComptesPage/ComptesPage';
import { CongeForm } from './pages/CongeForm/CongeForm';
import { DemandeAccesPage } from './pages/DemandeAccesPage';
import { DrhPage } from './pages/DrhPage/DrhPage';
import { LoginPage } from './pages/LoginPage';
import { MaterielPage } from './pages/MaterielPage/MaterielPage';
import { MissionsPage } from './pages/MissionsPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { StatsPage } from './pages/StatsPage/StatsPage';
import { StockPage } from './pages/StockPage/StockPage';
import { StubPage } from './pages/StubPage';
import type { ScreenKey } from './types';

const STUB_TITLES: Partial<Record<ScreenKey, string>> = {};

function IndexRedirect() {
  const { role } = useRole();
  return <Navigate to={`/${DEFAULT_SCREEN[role]}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Publiques — hors coquille authentifiée, accessibles sans compte. */}
      <Route path="login" element={<LoginPage />} />
      <Route path="demande-acces" element={<DemandeAccesPage />} />
      <Route path="set-password" element={<SetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<IndexRedirect />} />
          <Route path="accueil" element={<AccueilPage />} />
          <Route path="conge" element={<CongeForm />} />
          <Route path="drh" element={<DrhPage />} />
          <Route path="annuaire" element={<AnnuairePage />} />
          <Route path="missions" element={<MissionsPage />} />
          <Route path="absences" element={<AbsencesPage />} />
          <Route path="materiel" element={<MaterielPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="comptes" element={<ComptesPage />} />
          {Object.entries(STUB_TITLES).map(([screen, titre]) => (
            <Route key={screen} path={screen} element={<StubPage titre={titre!} />} />
          ))}
          <Route path="*" element={<IndexRedirect />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
