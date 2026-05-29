import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/guards/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ActivePage } from './pages/ActivePage';
import { ArchivePage } from './pages/ArchivePage';
import { DonePage } from './pages/DonePage';
import { ReportedPage } from './pages/ReportedPage';
import { SnoozedPage } from './pages/SnoozedPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuditLogPage } from './pages/settings/AuditLogPage';
import { SourceThresholdsPage } from './pages/settings/SourceThresholdsPage';
import { EntityManagementPage } from './pages/settings/EntityManagementPage';
import { MetricsPage } from './pages/settings/MetricsPage';
import { PromptsPage } from './pages/settings/PromptsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/active" replace />} />
            <Route path="/active" element={<ActivePage />} />
            <Route path="/done" element={<DonePage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/reported" element={<ReportedPage />} />
            <Route path="/snoozed" element={<SnoozedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/audit" element={<AuditLogPage />} />
            <Route path="/settings/thresholds" element={<SourceThresholdsPage />} />
            <Route path="/settings/entities" element={<EntityManagementPage />} />
            <Route path="/settings/metrics" element={<MetricsPage />} />
            <Route path="/settings/prompts" element={<PromptsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
