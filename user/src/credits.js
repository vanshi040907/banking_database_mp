const formatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const credits = value => `${formatter.format(Number(value ?? 0))} demo credits`;
