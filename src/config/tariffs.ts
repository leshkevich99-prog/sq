export const TARIFFS = {
  telemetry: {
    name: 'TELEMETRY',
    cars: 1,
    logistics: 1,
    wash: 2,
    price: 1400
  },
  pitstop: {
    name: 'PIT STOP',
    cars: 1,
    logistics: 2,
    wash: 4,
    price: 2400
  },
  family: {
    name: 'SQUADRA FAMILY',
    cars: 2,
    logistics: 4,
    wash: 8,
    price: 4000
  }
} as const;

export type TariffType = keyof typeof TARIFFS;
