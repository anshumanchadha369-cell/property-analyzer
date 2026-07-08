export interface SourceStatus {
  status: 'ok' | 'no_data' | 'error'
  freshness: string | null
  detail: string | null
}

export interface Comparable {
  formattedAddress: string | null
  price: number | null
  correlation: number | null
  distance: number | null
  squareFootage: number | null
  bedrooms: number | null
}

export interface PropertyInfo {
  formattedAddress: string | null
  propertyType: string | null
  bedrooms: number | null
  bathrooms: number | null
  squareFootage: number | null
  lotSize: number | null
  yearBuilt: number | null
  unitCount: number | null
  lastSalePrice: number | null
  lastSaleDate: string | null
  county: string | null
  latitude: number | null
  longitude: number | null
}

export interface Valuation {
  value: number | null
  valueRangeLow: number | null
  valueRangeHigh: number | null
  comparables: Comparable[]
}

export interface Rental {
  rent: number | null
  rentRangeLow: number | null
  rentRangeHigh: number | null
  comparables: Comparable[]
}

export interface OperatingExpenses {
  propertyTaxes: number
  taxesEstimated: boolean
  insurance: number
  insuranceEstimated: boolean
  management: number
  maintenance: number
  hoa: number
  total: number
}

export interface Metrics {
  price: number
  monthlyRent: number
  grossScheduledIncome: number
  vacancyRate: number
  effectiveGrossIncome: number
  operatingExpenses: OperatingExpenses
  noi: number
  capRate: number | null
  grm: number | null
  onePercentRule: { ratio: number | null; passes: boolean }
  pricePerSqft: number | null
  pricePerUnit: number | null
}

export interface UsageInfo {
  periodStart: string
  callsThisPeriod: number
  quota: number
  overagePerCall: number
  tallySource: string
  callsThisRequest?: number
  mockMode?: boolean
}

export interface AnalysisMeta {
  address: string
  fetchedAt: string
  sources: Record<string, SourceStatus>
  metricsAvailable: boolean
  metricsUnavailableReason: string | null
  usage?: UsageInfo
}

export interface AnalysisResult {
  property: PropertyInfo | null
  valuation: Valuation | null
  rental: Rental | null
  metrics: Metrics | null
  meta: AnalysisMeta
}
