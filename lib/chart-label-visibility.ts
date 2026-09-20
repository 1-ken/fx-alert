export type ChartLabelVisibility = {
  target: boolean;
  stop: boolean;
  center: boolean;
  entryExit: boolean;
  sweepLevel: boolean;
  sweep1h: boolean;
  entry5m: boolean;
};

export const DEFAULT_CHART_LABEL_VISIBILITY: ChartLabelVisibility = {
  target: true,
  stop: true,
  center: true,
  entryExit: true,
  sweepLevel: true,
  sweep1h: true,
  entry5m: true,
};

export const CHART_LABEL_VISIBILITY_KEY = "fx-alert:setup-chart-labels";

export function loadChartLabelVisibility(): ChartLabelVisibility {
  if (typeof window === "undefined") {
    return DEFAULT_CHART_LABEL_VISIBILITY;
  }
  try {
    const raw = localStorage.getItem(CHART_LABEL_VISIBILITY_KEY);
    if (!raw) {
      return DEFAULT_CHART_LABEL_VISIBILITY;
    }
    const parsed = JSON.parse(raw) as Partial<ChartLabelVisibility>;
    return { ...DEFAULT_CHART_LABEL_VISIBILITY, ...parsed };
  } catch {
    return DEFAULT_CHART_LABEL_VISIBILITY;
  }
}

export function saveChartLabelVisibility(value: ChartLabelVisibility): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(CHART_LABEL_VISIBILITY_KEY, JSON.stringify(value));
  } catch {
    // Ignore quota errors.
  }
}
