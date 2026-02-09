import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type OnboardingModule = 'driver' | 'fleet' | 'client' | 'home' | 'marketplace' | 'realestate' | 'services';

export interface TourStep {
  id: string;
  target: string; // CSS selector
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  action?: string; // Optional action hint
}

export interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnailUrl?: string;
  videoUrl: string;
  category: string;
}

export interface OnboardingConfig {
  module: OnboardingModule;
  tours: {
    id: string;
    name: string;
    description: string;
    steps: TourStep[];
  }[];
  videos: VideoTutorial[];
}

interface OnboardingContextType {
  // State
  isHelpOpen: boolean;
  currentModule: OnboardingModule;
  activeTour: string | null;
  currentTourStep: number;
  completedTours: string[];
  
  // Actions
  openHelp: () => void;
  closeHelp: () => void;
  setCurrentModule: (module: OnboardingModule) => void;
  startTour: (tourId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  endTour: () => void;
  markTourComplete: (tourId: string) => void;
  
  // Config
  getModuleConfig: () => OnboardingConfig | undefined;
  getCurrentTour: () => OnboardingConfig['tours'][0] | undefined;
  getCurrentStep: () => TourStep | undefined;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

// Tour configurations for each module
const onboardingConfigs: OnboardingConfig[] = [
  {
    module: 'driver',
    tours: [
      {
        id: 'driver-settlements',
        name: 'Rozliczenia kierowcy',
        description: 'Dowiedz się jak przeglądać i rozumieć swoje rozliczenia',
        steps: [
          {
            id: 'settlements-list',
            target: '[data-tour="settlements-list"]',
            title: 'Lista rozliczeń',
            content: 'Tutaj znajdziesz wszystkie swoje rozliczenia tygodniowe. Kliknij na dowolne rozliczenie, aby zobaczyć szczegóły.',
            placement: 'bottom'
          },
          {
            id: 'settlement-status',
            target: '[data-tour="settlement-status"]',
            title: 'Status rozliczenia',
            content: 'Status pokazuje czy rozliczenie jest w trakcie, zatwierdzone lub wypłacone.',
            placement: 'left'
          },
          {
            id: 'settlement-amount',
            target: '[data-tour="settlement-amount"]',
            title: 'Kwota do wypłaty',
            content: 'To jest Twoja końcowa kwota do wypłaty po odliczeniu wszystkich opłat.',
            placement: 'left'
          }
        ]
      },
      {
        id: 'driver-documents',
        name: 'Dokumenty',
        description: 'Zarządzanie dokumentami kierowcy',
        steps: [
          {
            id: 'documents-tab',
            target: '[data-tour="documents-tab"]',
            title: 'Zakładka dokumenty',
            content: 'Kliknij tutaj, aby przejść do swoich dokumentów.',
            placement: 'bottom'
          },
          {
            id: 'documents-upload',
            target: '[data-tour="documents-upload"]',
            title: 'Dodawanie dokumentów',
            content: 'Możesz dodać nowe dokumenty klikając przycisk "Dodaj dokument".',
            placement: 'right'
          }
        ]
      },
      {
        id: 'driver-fuel',
        name: 'Paliwo',
        description: 'Sprawdzanie historii tankowań',
        steps: [
          {
            id: 'fuel-tab',
            target: '[data-tour="fuel-tab"]',
            title: 'Zakładka paliwo',
            content: 'Tutaj znajdziesz historię swoich tankowań i rozliczeń paliwowych.',
            placement: 'bottom'
          }
        ]
      }
    ],
    videos: [
      {
        id: 'driver-intro',
        title: 'Wprowadzenie do panelu kierowcy',
        description: 'Poznaj podstawowe funkcje panelu kierowcy',
        duration: '3:45',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Podstawy'
      },
      {
        id: 'driver-settlements-video',
        title: 'Jak czytać rozliczenia',
        description: 'Szczegółowe omówienie struktury rozliczenia',
        duration: '5:20',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Rozliczenia'
      }
    ]
  },
  {
    module: 'fleet',
    tours: [
      {
        id: 'fleet-settlements',
        name: 'Dodawanie rozliczeń',
        description: 'Naucz się jak dodawać i zarządzać rozliczeniami kierowców',
        steps: [
          {
            id: 'settlements-tab',
            target: '[data-tour="settlements-tab"]',
            title: 'Zakładka rozliczenia',
            content: 'To jest główna zakładka do zarządzania rozliczeniami kierowców.',
            placement: 'bottom'
          },
          {
            id: 'add-settlement',
            target: '[data-tour="add-settlement"]',
            title: 'Dodaj rozliczenie',
            content: 'Kliknij ten przycisk, aby dodać nowe rozliczenie dla kierowcy.',
            placement: 'left'
          },
          {
            id: 'import-csv',
            target: '[data-tour="import-csv"]',
            title: 'Import CSV',
            content: 'Możesz też zaimportować wiele rozliczeń jednocześnie z pliku CSV.',
            placement: 'bottom'
          },
          {
            id: 'settlement-filters',
            target: '[data-tour="settlement-filters"]',
            title: 'Filtry',
            content: 'Użyj filtrów, aby szybko znaleźć konkretne rozliczenia.',
            placement: 'bottom'
          }
        ]
      },
      {
        id: 'fleet-drivers',
        name: 'Zarządzanie kierowcami',
        description: 'Dodawanie i edycja kierowców w flocie',
        steps: [
          {
            id: 'drivers-tab',
            target: '[data-tour="drivers-tab"]',
            title: 'Lista kierowców',
            content: 'Tutaj znajdziesz wszystkich kierowców przypisanych do Twojej floty.',
            placement: 'bottom'
          },
          {
            id: 'add-driver',
            target: '[data-tour="add-driver"]',
            title: 'Dodaj kierowcę',
            content: 'Kliknij, aby dodać nowego kierowcę do floty.',
            placement: 'left'
          },
          {
            id: 'driver-card',
            target: '[data-tour="driver-card"]',
            title: 'Karta kierowcy',
            content: 'Kliknij na kartę kierowcy, aby zobaczyć szczegóły i historię.',
            placement: 'right'
          }
        ]
      },
      {
        id: 'fleet-vehicles',
        name: 'Zarządzanie flotą',
        description: 'Dodawanie i przypisywanie pojazdów',
        steps: [
          {
            id: 'fleet-tab',
            target: '[data-tour="fleet-tab"]',
            title: 'Zakładka flota',
            content: 'Tutaj zarządzasz wszystkimi pojazdami w flocie.',
            placement: 'bottom'
          },
          {
            id: 'add-vehicle',
            target: '[data-tour="add-vehicle"]',
            title: 'Dodaj pojazd',
            content: 'Dodaj nowy pojazd do swojej floty.',
            placement: 'left'
          },
          {
            id: 'assign-driver',
            target: '[data-tour="assign-driver"]',
            title: 'Przypisz kierowcę',
            content: 'Przypisz kierowcę do pojazdu klikając przycisk "Przypisz".',
            placement: 'bottom'
          }
        ]
      },
      {
        id: 'fleet-invoices',
        name: 'Faktury',
        description: 'Generowanie faktur dla kierowców',
        steps: [
          {
            id: 'invoices-section',
            target: '[data-tour="invoices-section"]',
            title: 'Sekcja faktur',
            content: 'Tutaj możesz generować i zarządzać fakturami.',
            placement: 'bottom'
          },
          {
            id: 'generate-invoice',
            target: '[data-tour="generate-invoice"]',
            title: 'Generuj fakturę',
            content: 'Wygeneruj fakturę automatycznie na podstawie rozliczenia.',
            placement: 'left'
          }
        ]
      }
    ],
    videos: [
      {
        id: 'fleet-intro',
        title: 'Wprowadzenie do panelu floty',
        description: 'Podstawowa nawigacja po panelu zarządzania flotą',
        duration: '4:30',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Podstawy'
      },
      {
        id: 'fleet-settlements-video',
        title: 'Rozliczenia kierowców krok po kroku',
        description: 'Jak dodawać, edytować i zatwierdzać rozliczenia',
        duration: '8:15',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Rozliczenia'
      },
      {
        id: 'fleet-csv-import',
        title: 'Import CSV z platform',
        description: 'Jak importować dane z Bolt, Uber, FreeNow',
        duration: '6:00',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Import danych'
      },
      {
        id: 'fleet-drivers-video',
        title: 'Zarządzanie kierowcami',
        description: 'Dodawanie kierowców i przypisywanie do pojazdów',
        duration: '5:45',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Kierowcy'
      }
    ]
  },
  {
    module: 'client',
    tours: [
      {
        id: 'client-profile',
        name: 'Profil klienta',
        description: 'Zarządzanie danymi firmy',
        steps: [
          {
            id: 'profile-section',
            target: '[data-tour="profile-section"]',
            title: 'Twój profil',
            content: 'Tutaj możesz edytować dane swojej firmy.',
            placement: 'bottom'
          },
          {
            id: 'company-data',
            target: '[data-tour="company-data"]',
            title: 'Dane firmy',
            content: 'Upewnij się, że dane NIP i adres są aktualne - są używane na fakturach.',
            placement: 'right'
          }
        ]
      },
      {
        id: 'client-invoices',
        name: 'Faktury',
        description: 'Przeglądanie faktur',
        steps: [
          {
            id: 'invoices-list',
            target: '[data-tour="invoices-list"]',
            title: 'Lista faktur',
            content: 'Wszystkie Twoje faktury są dostępne tutaj.',
            placement: 'bottom'
          },
          {
            id: 'download-invoice',
            target: '[data-tour="download-invoice"]',
            title: 'Pobierz fakturę',
            content: 'Kliknij, aby pobrać fakturę w formacie PDF.',
            placement: 'left'
          }
        ]
      }
    ],
    videos: [
      {
        id: 'client-intro',
        title: 'Portal klienta - wprowadzenie',
        description: 'Jak korzystać z portalu klienta',
        duration: '3:00',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Podstawy'
      }
    ]
  },
  {
    module: 'home',
    tours: [
      {
        id: 'home-navigation',
        name: 'Nawigacja po portalu',
        description: 'Poznaj główne sekcje GetRido',
        steps: [
          {
            id: 'module-switcher',
            target: '[data-tour="module-switcher"]',
            title: 'Wybór modułu',
            content: 'Kliknij tutaj, aby przełączać się między różnymi modułami portalu.',
            placement: 'bottom'
          },
          {
            id: 'search-bar',
            target: '[data-tour="search-bar"]',
            title: 'Wyszukiwarka',
            content: 'Użyj wyszukiwarki, aby szybko znaleźć to czego szukasz.',
            placement: 'bottom'
          },
          {
            id: 'user-menu',
            target: '[data-tour="user-menu"]',
            title: 'Menu użytkownika',
            content: 'Tutaj znajdziesz ustawienia konta i opcję wylogowania.',
            placement: 'left'
          }
        ]
      }
    ],
    videos: [
      {
        id: 'home-intro',
        title: 'Witaj w GetRido!',
        description: 'Szybki przegląd możliwości platformy',
        duration: '2:30',
        videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        category: 'Wprowadzenie'
      }
    ]
  }
];

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [currentModule, setCurrentModule] = useState<OnboardingModule>('home');
  const [activeTour, setActiveTour] = useState<string | null>(null);
  const [currentTourStep, setCurrentTourStep] = useState(0);
  const [completedTours, setCompletedTours] = useState<string[]>(() => {
    const saved = localStorage.getItem('rido-completed-tours');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist completed tours
  useEffect(() => {
    localStorage.setItem('rido-completed-tours', JSON.stringify(completedTours));
  }, [completedTours]);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  const getModuleConfig = useCallback(() => {
    return onboardingConfigs.find(c => c.module === currentModule);
  }, [currentModule]);

  const getCurrentTour = useCallback(() => {
    const config = getModuleConfig();
    return config?.tours.find(t => t.id === activeTour);
  }, [getModuleConfig, activeTour]);

  const getCurrentStep = useCallback(() => {
    const tour = getCurrentTour();
    return tour?.steps[currentTourStep];
  }, [getCurrentTour, currentTourStep]);

  const startTour = useCallback((tourId: string) => {
    setActiveTour(tourId);
    setCurrentTourStep(0);
    setIsHelpOpen(false);
  }, []);

  const nextStep = useCallback(() => {
    const tour = getCurrentTour();
    if (tour && currentTourStep < tour.steps.length - 1) {
      setCurrentTourStep(prev => prev + 1);
    } else {
      // Tour completed
      if (activeTour) {
        markTourComplete(activeTour);
      }
      endTour();
    }
  }, [getCurrentTour, currentTourStep, activeTour]);

  const prevStep = useCallback(() => {
    if (currentTourStep > 0) {
      setCurrentTourStep(prev => prev - 1);
    }
  }, [currentTourStep]);

  const endTour = useCallback(() => {
    setActiveTour(null);
    setCurrentTourStep(0);
  }, []);

  const markTourComplete = useCallback((tourId: string) => {
    setCompletedTours(prev => {
      if (prev.includes(tourId)) return prev;
      return [...prev, tourId];
    });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        isHelpOpen,
        currentModule,
        activeTour,
        currentTourStep,
        completedTours,
        openHelp,
        closeHelp,
        setCurrentModule,
        startTour,
        nextStep,
        prevStep,
        endTour,
        markTourComplete,
        getModuleConfig,
        getCurrentTour,
        getCurrentStep,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
