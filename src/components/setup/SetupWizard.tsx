import { useState, useEffect, useMemo } from 'react';
import { Check, Building2, Key, Phone, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CompanySetup } from './steps/CompanySetup';
import { CredentialsSetup } from './steps/CredentialsSetup';
import { PhoneLinesSetup } from './steps/PhoneLinesSetup';
import { TelephonyDiagnostics } from './TelephonyDiagnostics';
import { useCompany } from '@/hooks/useCompany';
import { useCredentials } from '@/hooks/useCredentials';
import { usePhoneLines } from '@/hooks/usePhoneLines';
import { useBitrix } from '@/hooks/useBitrix';

// Simplified steps - user mapping is done in Bitrix24 Contact Center
const allSteps = [
  { id: 'company', title: 'Empresa', description: 'Configure sua empresa', icon: Building2, showOutsideBitrix: true },
  { id: 'credentials', title: 'Credenciais', description: 'Tokens de API', icon: Key, showOutsideBitrix: true },
  { id: 'lines', title: 'Linhas', description: 'Telefones externos', icon: Phone, showOutsideBitrix: true },
];

export function SetupWizard() {
  const { linkedCompany, isInBitrix } = useBitrix();
  const [currentStep, setCurrentStep] = useState(0);
  const { currentCompany } = useCompany(linkedCompany?.id);
  const { api4comCredentials, bitrix24Credentials } = useCredentials(currentCompany?.id || linkedCompany?.id);
  const { phoneLines } = usePhoneLines(currentCompany?.id || linkedCompany?.id);

  // Filter steps based on context
  const steps = useMemo(() => {
    if (isInBitrix && linkedCompany) {
      // Skip company step when inside Bitrix
      return allSteps.filter(s => s.id !== 'company');
    }
    return allSteps;
  }, [isInBitrix, linkedCompany]);

  // Auto-skip company step if linked via Bitrix
  useEffect(() => {
    if (isInBitrix && linkedCompany && currentStep === 0 && steps[0]?.id === 'credentials') {
      console.log('[SetupWizard] Company already linked via Bitrix');
    }
  }, [isInBitrix, linkedCompany, currentStep, steps]);

  const getStepStatus = (stepId: string) => {
    if (stepId === 'company') return !!currentCompany || !!linkedCompany;
    if (stepId === 'credentials') return !!api4comCredentials && !!bitrix24Credentials;
    if (stepId === 'lines') return phoneLines.length > 0;
    return false;
  };

  const isSetupComplete = steps.every((step) => getStepStatus(step.id));

  const effectiveCompany = currentCompany || linkedCompany;

  const renderStepContent = () => {
    const step = steps[currentStep];
    if (!step) return null;

    switch (step.id) {
      case 'company':
        return <CompanySetup linkedCompany={effectiveCompany} onComplete={() => setCurrentStep(currentStep + 1)} />;
      case 'credentials':
        return <CredentialsSetup onComplete={() => setCurrentStep(currentStep + 1)} />;
      case 'lines':
        return <PhoneLinesSetup onComplete={() => {}} />;
      default:
        return null;
    }
  };

  if (isSetupComplete) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Configuração Completa!</CardTitle>
            <CardDescription>
              Sua integração Api4Com + Bitrix24 está pronta para uso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Para mapear usuários aos ramais, utilize o Contact Center do Bitrix24.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => window.location.href = '/dashboard'}>
                Ir para Dashboard
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.open('https://chromewebstore.google.com/detail/api4com-extens%C3%A3o-para-nav/nmihkcakhpccmdhoifppbgeoapjaanno', '_blank')}
              >
                Extensão Chrome
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Telephony Diagnostics */}
        {effectiveCompany?.id && (
          <TelephonyDiagnostics companyId={effectiveCompany.id} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Steps indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = getStepStatus(step.id);
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
                    getStepStatus(step.id) ? 'bg-primary/60' : 'bg-muted'
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
          <CardTitle>{steps[currentStep]?.title}</CardTitle>
          <CardDescription>{steps[currentStep]?.description}</CardDescription>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
      </Card>
    </div>
  );
}
