import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from './types';
import { defaultWorld } from './defaultWorld';

const KEY = '@sable-crown/data/v1';
const NARRATION_CONFIRM_KEY = '@sable-crown/narration-confirm/v1';
const PASSWORD_RECOVERY_PENDING_KEY = '@sable-crown/password-recovery-pending/v1';
const ACCESSIBILITY_KEY = '@sable-crown/accessibility/v1';
export type AccessibilityPreferences = {
  textSize: 'default' | 'large' | 'extra-large';
  theme: 'midnight' | 'high-contrast' | 'sepia';
  font: 'system' | 'serif';
};
export const defaultAccessibilityPreferences: AccessibilityPreferences = { textSize: 'default', theme: 'midnight', font: 'system' };
export const initialData: AppData = { user: null, packs: [defaultWorld], campaigns: [] };

export async function loadData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return initialData;
    const parsed = JSON.parse(raw) as AppData & { user: (AppData['user'] & { turnsRemaining?: number }) | null };
    if (parsed.user && typeof parsed.user.creditsRemaining !== 'number') {
      parsed.user.creditsRemaining = parsed.user.turnsRemaining ?? 0;
      delete parsed.user.turnsRemaining;
    }
    if (!parsed.packs.some(p => p.id === defaultWorld.id)) parsed.packs.unshift(defaultWorld);
    return parsed;
  } catch { return initialData; }
}

export async function saveData(data: AppData) { await AsyncStorage.setItem(KEY, JSON.stringify(data)); }
export async function clearData() { await AsyncStorage.removeItem(KEY); }
export async function loadNarrationConfirmationPreference() { return (await AsyncStorage.getItem(NARRATION_CONFIRM_KEY)) === 'skip'; }
export async function saveNarrationConfirmationPreference(skip: boolean) { await AsyncStorage.setItem(NARRATION_CONFIRM_KEY, skip ? 'skip' : 'ask'); }
export async function loadPasswordRecoveryPending() { return (await AsyncStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY)) === 'true'; }
export async function setPasswordRecoveryPending(pending: boolean) {
  if (pending) await AsyncStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, 'true');
  else await AsyncStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY);
}
export async function loadAccessibilityPreferences(): Promise<AccessibilityPreferences> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(ACCESSIBILITY_KEY)) || '{}');
    if (saved.theme === 'light') saved.theme = 'midnight';
    if (saved.textSize === 'small') saved.textSize = 'default';
    if (saved.font === 'readable') saved.font = 'system';
    return { ...defaultAccessibilityPreferences, ...saved };
  }
  catch { return defaultAccessibilityPreferences; }
}
export async function saveAccessibilityPreferences(value: AccessibilityPreferences) { await AsyncStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(value)); }
