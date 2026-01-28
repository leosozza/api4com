import { useState } from 'react';
import { Check, Building2, Key, Users, Phone, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CompanySetup } from './steps/CompanySetup';
import { CredentialsSetup } from './steps/CredentialsSetup';
import { UserMappingSetup } from './steps/UserMappingSetup';
import { PhoneLinesSetup } from './steps/PhoneLinesSetup';
import { useCompany } from '@/hooks/useCompany';
import { useCredentials } from '@/hooks/useCredentials';
import { useUserMappings } from '@/hooks/useUserMappings';
import { usePhoneLines } from '@/hooks/usePhoneLines';

const steps = [
  { id: 'company', title: 'Empresa', description: 'Configure sua empresa', icon: Building2 },
  { id: 'credentials', title: 'Credenciais', description: 'Tokens de API', icon: Key },
  { id: 'users', title: 'Usuários', description: 'Mapear ramais', icon: Users },
  { id: 'lines', title: 'Linhas', description: 'Telefones externos', icon: Phone },
];

export function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const { currentCompany } = useCompany();
  const { api4comCredentials, bitrix24Credentials } = useCredentials(currentCompany?.id);
  const { userMappings } = useUserMappings(currentCompany?.id);
  const { phoneLines } = usePhoneLines(currentCompany?.id);

  const getStepStatus = (index: number) => {
    if (index === 0) return !!currentCompany;
    if (index === 1) return !!api4comCredentials && !!bitrix24Credentials;
    if (index === 2) return userMappings.length > 0;
    if (index === 3) return phoneLines.length > 0;
    return false;
  };

  const isSetupComplete = steps.every((_, index) => getStepStatus(index));

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <CompanySetup onComplete={() => setCurrentStep(1)} />;
      case 1:
        return <CredentialsSetup onComplete={() => setCurrentStep(2)} />;
      case 2:
        return <UserMappingSetup onComplete={() => setCurrentStep(3)} />;
      case 3:
        return <PhoneLinesSetup onComplete={() => {}} />;
      default:
        return null;
    }
  };

  if (isSetupComplete) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Configuração Completa!</CardTitle>
          <CardDescription>
            Sua integração Api4Com + Bitrix24 está pronta para uso.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button onClick={() => window.location.href = '/dashboard'}>
            Ir para Dashboard
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Steps indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = getStepStatus(index);
          const isCurrent = index === currentStep;
          
          return (
            <div key={step.id} className="flex flex-1 items-center">
              <button
                onClick={() => setCurrentStep(index)}
                className={cn(
                  'flex flex-col items-center gap-2',
                  isCurrent && 'text-primary',
                  isCompleted && !isCurrent && 'text-primary/60',
                  !isCompleted && !isCurrent && 'text-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                    isCurrent && 'border-primary bg-primary text-primary-foreground',
                    isCompleted && !isCurrent && 'border-primary/60 bg-primary/10',
                    !isCompleted && !isCurrent && 'border-muted'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="hidden text-center sm:block">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-0.5 flex-1',
                    getStepStatus(index) ? 'bg-primary/60' : 'bg-muted'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep].title}</CardTitle>
          <CardDescription>{steps[currentStep].description}</CardDescription>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
      </Card>
    </div>
  );
}
