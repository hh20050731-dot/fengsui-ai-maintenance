export const industrialTheme = {
  colors: {
    background: '#07131f',
    surface: '#0d2033',
    surfaceRaised: '#12293f',
    border: 'rgba(85, 213, 255, 0.16)',
    grid: '#1a354b',
    text: '#d8e3f7',
    textSecondary: '#afbecd',
    textMuted: '#7d91a5',
    primary: '#55d5ff',
    success: '#44d8ad',
    attention: '#77a8c7',
    warning: '#f0a84c',
    danger: '#e0525d',
    offline: '#6b7c8d',
  },
  chart: {
    health: '#55d5ff',
    healthFill: '#55d5ff',
    success: '#44d8ad',
    attention: '#77a8c7',
    warning: '#f0a84c',
    danger: '#e0525d',
    grid: '#1a354b',
    axis: '#547086',
    text: '#7d91a5',
    tooltipBackground: '#040f1d',
  },
} as const;

export const riskColor = (risk: string) => {
  if (risk === '健康') return industrialTheme.colors.success;
  if (risk === '关注') return industrialTheme.colors.attention;
  if (risk === '二级预警') return industrialTheme.colors.warning;
  if (risk === '高风险') return industrialTheme.colors.danger;
  return industrialTheme.colors.offline;
};
