import { useEffect } from 'react';
import { useOnboarding, OnboardingModule } from '@/contexts/OnboardingContext';

/**
 * Hook to set the current onboarding module context
 * Use this in page components to ensure the help panel shows relevant content
 */
export function useOnboardingModule(module: OnboardingModule) {
  const { setCurrentModule } = useOnboarding();

  useEffect(() => {
    setCurrentModule(module);
  }, [module, setCurrentModule]);
}
