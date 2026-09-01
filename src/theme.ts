export const C = { ink: '#090B0C', coal: '#111518', panel: '#171C1F', raised: '#20272B', line: '#30383C', parchment: '#E9E2D2', muted: '#A7AAA4', gold: '#C6A25A', goldSoft: '#6F5D38', red: '#A24C48', green: '#688B76', white: '#F7F3E9' };

export type AppTheme = 'midnight' | 'high-contrast' | 'sepia';
const palettes: Record<AppTheme, typeof C> = {
  midnight: { ink: '#090B0C', coal: '#111518', panel: '#171C1F', raised: '#20272B', line: '#30383C', parchment: '#E9E2D2', muted: '#A7AAA4', gold: '#C6A25A', goldSoft: '#6F5D38', red: '#A24C48', green: '#688B76', white: '#F7F3E9' },
  'high-contrast': { ink: '#000000', coal: '#080808', panel: '#101010', raised: '#1B1B1B', line: '#F2F2F2', parchment: '#FFFFFF', muted: '#E2E2E2', gold: '#FFD75A', goldSoft: '#B99A35', red: '#FF6B66', green: '#7FE0A5', white: '#FFFFFF' },
  sepia: { ink: '#17120C', coal: '#211A11', panel: '#2A2116', raised: '#382C1E', line: '#66523A', parchment: '#F1DFC1', muted: '#C8B696', gold: '#D0A652', goldSoft: '#806936', red: '#B65E50', green: '#789268', white: '#FFF2D8' },
};
export function applyAppTheme(theme: AppTheme) { Object.assign(C, palettes[theme]); }
