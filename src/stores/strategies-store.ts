import { create } from 'zustand';
import { Strategy } from '@/types';
import { mockStrategies } from '@/lib/mock-data';

interface StrategiesState {
  strategies: Strategy[];
  loadStrategies: () => void;
  addStrategy: (strategy: Strategy) => void;
  removeStrategy: (id: string) => void;
}

export const useStrategiesStore = create<StrategiesState>((set) => ({
  strategies: [],
  loadStrategies: () => set({ strategies: mockStrategies }),
  addStrategy: (strategy) => set((state) => ({ strategies: [...state.strategies, strategy] })),
  removeStrategy: (id) => set((state) => ({ strategies: state.strategies.filter((s) => s.id !== id) })),
}));