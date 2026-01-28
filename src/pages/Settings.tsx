import { AppLayout } from '@/components/layout/AppLayout';
import { SetupWizard } from '@/components/setup/SetupWizard';

export default function Settings() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Configurações</h2>
          <p className="text-muted-foreground">
            Gerencie as configurações da sua integração
          </p>
        </div>

        <SetupWizard />
      </div>
    </AppLayout>
  );
}
