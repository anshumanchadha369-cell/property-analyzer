import { Card } from './ui'
import { fmtCurrency } from '../lib/format'
import {
  LOAN_PRESETS,
  type DealSettings,
  type LoanType,
  type Overrides,
} from '../lib/deal-math'

interface Fetched {
  price: number | null
  rent: number | null
  units: number | null
  taxes: number | null
}

interface Props {
  settings: DealSettings
  onSettings: (s: DealSettings) => void
  overrides: Overrides
  onOverrides: (o: Overrides) => void
  fetched: Fetched
}

const INPUT_CLASSES =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600'

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-sky-500"
      />
    </div>
  )
}

function OverrideField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: number | null
  onChange: (n: number | null) => void
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        placeholder={hint}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(null)
          const n = Number(raw)
          onChange(Number.isFinite(n) && n >= 0 ? n : null)
        }}
        className={INPUT_CLASSES}
      />
    </div>
  )
}

export default function DealInputs({ settings, onSettings, overrides, onOverrides, fetched }: Props) {
  const set = (patch: Partial<DealSettings>) => onSettings({ ...settings, ...patch })
  const setOverride = (patch: Partial<Overrides>) => onOverrides({ ...overrides, ...patch })

  const applyLoanType = (t: LoanType) => {
    const p = LOAN_PRESETS[t]
    set({ loanType: t, interestRate: p.rate, loanYears: p.years, downPct: p.downPct })
  }

  const overridesActive = Object.values(overrides).some((v) => v != null)

  return (
    <Card
      title="Deal Inputs"
      right={
        overridesActive ? (
          <button
            onClick={() =>
              onOverrides({ price: null, monthlyRent: null, unitCount: null, annualTaxes: null })
            }
            className="text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
          >
            reset to fetched data
          </button>
        ) : undefined
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cash + overrides */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Available cash
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={settings.availableCash ?? ''}
              placeholder="e.g. 250000"
              onChange={(e) => {
                const raw = e.target.value
                const n = Number(raw)
                set({ availableCash: raw === '' || !Number.isFinite(n) ? null : n })
              }}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-lg font-medium text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Manual overrides{' '}
              <span className="normal-case text-slate-400 dark:text-slate-600">
                (fix AVM mismatches)
              </span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <OverrideField
                label="Purchase price"
                hint={fetched.price ? `AVM ${fmtCurrency(fetched.price)}` : 'no AVM value'}
                value={overrides.price}
                onChange={(n) => setOverride({ price: n })}
              />
              <OverrideField
                label="Rent (total /mo)"
                hint={fetched.rent ? `AVM ${fmtCurrency(fetched.rent)}` : 'no AVM rent'}
                value={overrides.monthlyRent}
                onChange={(n) => setOverride({ monthlyRent: n })}
              />
              <OverrideField
                label="Units"
                hint={fetched.units ? String(fetched.units) : 'unknown'}
                value={overrides.unitCount}
                onChange={(n) => setOverride({ unitCount: n })}
              />
              <OverrideField
                label="Taxes (annual)"
                hint={fetched.taxes ? fmtCurrency(fetched.taxes) : 'est. 1% of price'}
                value={overrides.annualTaxes}
                onChange={(n) => setOverride({ annualTaxes: n })}
              />
            </div>
          </div>
        </div>

        {/* Financing */}
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Financing
            </p>
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
              {(Object.keys(LOAN_PRESETS) as LoanType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => applyLoanType(t)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    settings.loanType === t
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {LOAN_PRESETS[t].label}
                </button>
              ))}
            </div>
          </div>
          <SliderRow
            label="Down payment"
            value={settings.downPct * 100}
            display={`${Math.round(settings.downPct * 100)}%`}
            min={5}
            max={50}
            step={1}
            onChange={(n) => set({ downPct: n / 100 })}
          />
          <SliderRow
            label="Interest rate"
            value={settings.interestRate * 100}
            display={`${(settings.interestRate * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`}
            min={3}
            max={12}
            step={0.125}
            onChange={(n) => set({ interestRate: n / 100 })}
          />
          <SliderRow
            label="Loan term"
            value={settings.loanYears}
            display={`${settings.loanYears} yr`}
            min={10}
            max={40}
            step={5}
            onChange={(n) => set({ loanYears: n })}
          />
          <SliderRow
            label="Rehab budget"
            value={settings.rehabBudget}
            display={fmtCurrency(settings.rehabBudget)}
            min={0}
            max={200000}
            step={5000}
            onChange={(n) => set({ rehabBudget: n })}
          />
        </div>

        {/* Assumptions */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Assumptions
          </p>
          <SliderRow
            label="Closing costs"
            value={settings.closingPct * 100}
            display={`${(settings.closingPct * 100).toFixed(1)}%`}
            min={0}
            max={6}
            step={0.5}
            onChange={(n) => set({ closingPct: n / 100 })}
          />
          <SliderRow
            label="Operating reserve"
            value={settings.reserveMonths}
            display={`${settings.reserveMonths} mo`}
            min={0}
            max={12}
            step={1}
            onChange={(n) => set({ reserveMonths: n })}
          />
          <SliderRow
            label="Vacancy"
            value={settings.vacancyRate * 100}
            display={`${Math.round(settings.vacancyRate * 100)}%`}
            min={0}
            max={20}
            step={1}
            onChange={(n) => set({ vacancyRate: n / 100 })}
          />
          <SliderRow
            label="Management"
            value={settings.managementRate * 100}
            display={`${Math.round(settings.managementRate * 100)}%`}
            min={0}
            max={15}
            step={1}
            onChange={(n) => set({ managementRate: n / 100 })}
          />
          <SliderRow
            label="Maintenance"
            value={settings.maintenanceRate * 100}
            display={`${Math.round(settings.maintenanceRate * 100)}%`}
            min={0}
            max={15}
            step={1}
            onChange={(n) => set({ maintenanceRate: n / 100 })}
          />
          <SliderRow
            label="HYSA benchmark"
            value={settings.hysaRate * 100}
            display={`${(settings.hysaRate * 100).toFixed(2)}%`}
            min={0}
            max={8}
            step={0.25}
            onChange={(n) => set({ hysaRate: n / 100 })}
          />
        </div>
      </div>
    </Card>
  )
}
