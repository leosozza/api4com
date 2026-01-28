import { AppLayout } from '@/components/layout/AppLayout';
import { MetricsCards } from '@/components/dashboard/MetricsCards';
import { CallsChart } from '@/components/dashboard/CallsChart';
import { CallLogTable } from '@/components/calls/CallLogTable';
import { useCompany } from '@/hooks/useCompany';
import { useCallLogs } from '@/hooks/useCallLogs';
import { SetupWizard } from '@/components/setup/SetupWizard';
import { useCredentials } from '@/hooks/useCredentials';
import { useUserMappings } from '@/hooks/useUserMappings';
import { usePhoneLines } from '@/hooks/usePhoneLines';

export default function Dashboard() {
  const { currentCompany, isLoading: isLoadingCompany } = useCompany();
  const { api4comCredentials, bitrix24Credentials } = useCredentials(currentCompany?.id);
  const { userMappings } = useUserMappings(currentCompany?.id);
  const { phoneLines } = usePhoneLines(currentCompany?.id);
  const { callLogs, metrics, isLoading: isLoadingCalls } = useCallLogs(currentCompany?.id);

  // Check if setup is complete
  const isSetupComplete = !!(
    currentCompany &&
    api4comCredentials &&
    bitrix24Credentials &&
    userMappings.length > 0 &&
    phoneLines.length > 0
  );

  if (isLoadingCompany) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!isSetupComplete) {
    return (
      <AppLayout>
        <SetupWizard />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">
            Visão geral das suas chamadas
          </p>
        </div>

        <MetricsCards metrics={metrics} isLoading={isLoadingCalls} />

        <div className="grid gap-6 lg:grid-cols-2">
          <CallsChart callLogs={callLogs} isLoading={isLoadingCalls} />
          
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Chamadas Recentes</h3>
            <CallLogTable callLogs={callLogs.slice(0, 5)} isLoading={isLoadingCalls} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
