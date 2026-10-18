import { DashboardContent } from "./components/dashboard/dashboard-content";
import { FlexibilityDashboard } from "./components/dashboard/flexibility-dashboard";
import { ModellingDashboard } from "./components/dashboard/modelling-dashboard";
import { DashboardShell } from "./components/layout/dashboard-shell";
import {
  DashboardNavigationProvider,
  useDashboardNavigation,
} from "./components/navigation";

import { DiagnosticsTerminalView } from "@/components/views/DiagnosticsTerminalView";
import { VisualIntelligenceView } from "@/components/views/VisualIntelligenceView";
import { TroubleshootingView } from "@/components/views/TroubleshootingView";
import { SopExecutionView } from "@/components/views/SopExecutionView";
import { TechnicalManualsView } from "@/components/views/TechnicalManualsView";
import { AssetDirectoryView } from "@/components/views/AssetDirectoryView";
import { SystemHealthView } from "@/components/views/SystemHealthView";
import { SettingsView } from "@/components/views/SettingsView";

function DashboardRoute() {
  const { pathname, navigate } = useDashboardNavigation();

  return (
    <DashboardShell>
      {pathname === "/modelling" ? (
        <ModellingDashboard />
      ) : pathname === "/flexibility" ? (
        <FlexibilityDashboard />
      ) : pathname === "/copilot" ? (
        <div className="h-full w-full overflow-hidden">
          <DiagnosticsTerminalView />
        </div>
      ) : pathname === "/visual" ? (
        <div className="h-full w-full overflow-hidden">
          <VisualIntelligenceView />
        </div>
      ) : pathname === "/troubleshooting" ? (
        <div className="h-full w-full overflow-hidden">
          <TroubleshootingView onNavigateToSop={() => navigate("/maintenance")} />
        </div>
      ) : pathname === "/maintenance" ? (
        <div className="h-full w-full overflow-hidden">
          <SopExecutionView />
        </div>
      ) : pathname === "/manuals" ? (
        <div className="h-full w-full overflow-hidden">
          <TechnicalManualsView />
        </div>
      ) : pathname === "/assets" ? (
        <div className="h-full w-full overflow-hidden">
          <AssetDirectoryView />
        </div>
      ) : pathname === "/health" ? (
        <div className="h-full w-full overflow-y-auto p-6 max-w-6xl mx-auto">
          <SystemHealthView />
        </div>
      ) : pathname === "/settings" ? (
        <div className="h-full w-full overflow-y-auto p-6 max-w-6xl mx-auto">
          <SettingsView />
        </div>
      ) : (
        <DashboardContent />
      )}
    </DashboardShell>
  );
}

export default function DashboardView() {
  return (
    <DashboardNavigationProvider>
      <DashboardRoute />
    </DashboardNavigationProvider>
  );
}
