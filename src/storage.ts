import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from './types';
import { defaultWorld } from './defaultWorld';

const KEY = '@sable-crown/data/v1';
export const initialData: AppData = { user: null, packs: [defaultWorld], campaigns: [] };

export async function loadData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return initialData;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed.packs.some(p => p.id === defaultWorld.id)) parsed.packs.unshift(defaultWorld);
    return parsed;
  } catch { return initialData; }
}

export async function saveData(data: AppData) { await AsyncStorage.setItem(KEY, JSON.stringify(data)); }
export async function clearData() { await AsyncStorage.removeItem(KEY); }
