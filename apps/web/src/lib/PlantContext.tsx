import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch } from './api';
import { clearTransientSessionState } from '../utils/tenantStorage';

export interface PlantOption {
  id: string;
  code: string;
  name: string;
  sub?: string;
  key?: string;
  label?: string;
}

export const DEFAULT_HEADER_PLANTS: PlantOption[] = [];

export interface PlantContextType {
  activePlant: string;
  setActivePlant: (plantCodeOrId: string) => void;
  plantSite: string;
  setPlantSite: (plantCodeOrId: string) => void;
  plants: PlantOption[];
  refreshPlants: () => Promise<void>;
  isLoading: boolean;
}

const PlantContext = createContext<PlantContextType | undefined>(undefined);

const PLANT_STORAGE_KEY = 'forgex_active_plant';
const INVALID_LEGACY_PLANTS = ['RIVERSIDE', 'GULF', 'MIDWEST', 'ALL'];

export const PlantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, organization } = useAuth();
  const [activePlant, setActivePlantState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PLANT_STORAGE_KEY);
      if (stored && !INVALID_LEGACY_PLANTS.includes(stored.toUpperCase())) {
        return stored;
      }
    }
    return '';
  });

  const [plants, setPlants] = useState<PlantOption[]>(DEFAULT_HEADER_PLANTS);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const setActivePlant = useCallback((site: string) => {
    setActivePlantState(site);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PLANT_STORAGE_KEY, site);
      clearTransientSessionState();
      window.dispatchEvent(
        new CustomEvent('forgex:tenant_changed', {
          detail: { plantId: site },
        })
      );
    }
  }, []);

  const refreshPlants = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/v1/plants');
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        if (json.data.length > 0) {
          const loadedPlants: PlantOption[] = json.data.map((p: any) => ({
            id: p.id,
            code: p.code || p.id,
            name: p.name || p.code || p.id,
            label: p.name || p.code || p.id,
            sub: p.location || undefined,
            key: p.code || p.id,
          }));

          setPlants(loadedPlants);

          // Auto-heal activePlant if it's currently pointing to a non-existent or legacy dummy plant
          setActivePlantState((current) => {
            const match = loadedPlants.some(
              (p) =>
                p.id === current ||
                p.code?.toUpperCase() === current?.toUpperCase()
            );
            if (match && !INVALID_LEGACY_PLANTS.includes(current?.toUpperCase())) {
              return current;
            }

            const defaultPlant = loadedPlants[0]?.id || loadedPlants[0]?.code || '';
            if (typeof window !== 'undefined' && defaultPlant) {
              localStorage.setItem(PLANT_STORAGE_KEY, defaultPlant);
              clearTransientSessionState();
              window.dispatchEvent(
                new CustomEvent('forgex:tenant_changed', {
                  detail: { plantId: defaultPlant },
                })
              );
            }
            return defaultPlant;
          });
        } else {
          setPlants([]);
          setActivePlantState('');
        }
      }
    } catch (err) {
      console.warn('Could not load plant list from API:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, organization?.id]);

  useEffect(() => {
    refreshPlants();
  }, [refreshPlants]);

  return (
    <PlantContext.Provider
      value={{
        activePlant,
        setActivePlant,
        plantSite: activePlant,
        setPlantSite: setActivePlant,
        plants,
        refreshPlants,
        isLoading,
      }}
    >
      {children}
    </PlantContext.Provider>
  );
};

export const usePlant = (): PlantContextType => {
  const context = useContext(PlantContext);
  if (!context) {
    return {
      activePlant: '',
      setActivePlant: () => {},
      plantSite: '',
      setPlantSite: () => {},
      plants: [],
      refreshPlants: async () => {},
      isLoading: false,
    };
  }
  return context;
};
