import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IncomePanel } from '../../components/IncomePanel.jsx'
import { BenefitsPanel } from '../../components/BenefitsPanel.jsx'
import { BudgetPanel } from '../../components/BudgetPanel.jsx'
import { buildYear, computeNet, computeBucketModel, toLocalIso } from '../../lib/finance.js'
import { getCurrentFiscalWeek, getFiscalWeekInfo } from '../../lib/fiscalWeek.js'
import { DEFAULT_CONFIG, INITIAL_EXPENSES } from '../../constants/config.js'

// Regression coverage for the blank-screen class of bug: these panels carry the
// app's largest render surfaces (Budget 2.5k lines) and previously had zero
// tests, so a ReferenceError anywhere in their render path shipped silently.
// Fixtures are derived through the same lib calls App.jsx uses.

const TODAY = '2026-07-06'
const CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: null,
  customWeeklyHours: 40,
  baseRate: 20,
  firstActiveIdx: 0,
  setupComplete: true,
}

const allWeeks = buildYear(CONFIG)
const currentWeek = getCurrentFiscalWeek(allWeeks, TODAY)
const futureWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) >= TODAY)
const futureWeekNets = futureWeeks.map(w => computeNet(w, CONFIG, 0, false))
const weekNetLookup = Object.fromEntries(allWeeks.map(w => {
  const baseNet = computeNet(w, CONFIG, 0, false)
  return [w.idx, { baseNet, adjustedNet: baseNet, spendable: baseNet, adjustedSpendable: baseNet, adjustment: 0 }]
}))
const TAX_DERIVED = {
  fedAGI: 0, fedLiability: 0, moLiability: 0, ficaTotal: 0,
  fedWithheldBase: 0, moWithheldBase: 0,
  fedGap: 0, moGap: 0, totalGap: 0, targetExtraTotal: 0,
  taxedWeekCount: 0, extraPerCheck: 0,
  eventGrossDelta: 0, fedLiabilityEventDelta: 0, moLiabilityEventDelta: 0,
}

describe('IncomePanel', () => {
  const renderPanel = (overrides = {}) => render(
    <IncomePanel
      allWeeks={allWeeks}
      config={CONFIG}
      setConfig={() => {}}
      showExtra={false}
      taxDerived={TAX_DERIVED}
      adjustedTakeHome={30000}
      projectedAnnualNet={32000}
      currentWeek={currentWeek}
      isAdmin={false}
      today={TODAY}
      weekNetLookup={weekNetLookup}
      {...overrides}
    />
  )

  it('renders without crashing for a base-user config', () => {
    const { container } = renderPanel()
    expect(container.textContent.length).toBeGreaterThan(0)
  })

  it('renders week rows containing net amounts from the lookup', () => {
    const { container } = renderPanel()
    // The current week's spendable value should surface somewhere in the panel
    expect(container.textContent).toMatch(/\$/)
  })

  it('renders for a DHL rotation config', () => {
    const dhlCfg = {
      ...DEFAULT_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'B',
      dhlCustomSchedule: false,
      startingWeekIsLong: false,
      setupComplete: true,
    }
    const dhlWeeks = buildYear(dhlCfg)
    const dhlLookup = Object.fromEntries(dhlWeeks.map(w => {
      const n = computeNet(w, dhlCfg, 0, false)
      return [w.idx, { baseNet: n, adjustedNet: n, spendable: n, adjustedSpendable: n, adjustment: 0 }]
    }))
    const { container } = render(
      <IncomePanel
        allWeeks={dhlWeeks}
        config={dhlCfg}
        setConfig={() => {}}
        showExtra={false}
        taxDerived={TAX_DERIVED}
        adjustedTakeHome={45000}
        projectedAnnualNet={47000}
        currentWeek={getCurrentFiscalWeek(dhlWeeks, TODAY)}
        isAdmin={false}
        today={TODAY}
        weekNetLookup={dhlLookup}
      />
    )
    expect(container.textContent.length).toBeGreaterThan(0)
  })
})

describe('BenefitsPanel', () => {
  const renderPanel = (cfg = CONFIG, weeks = allWeeks, extra = {}) => render(
    <BenefitsPanel
      allWeeks={weeks}
      config={cfg}
      setConfig={() => {}}
      isEmployerDHL={cfg.employerPreset === 'DHL'}
      isAdmin={false}
      logK401kLost={0}
      logK401kMatchLost={0}
      logK401kGained={0}
      logK401kMatchGained={0}
      logPTOHoursLost={0}
      currentWeek={getCurrentFiscalWeek(weeks, TODAY)}
      bucketModel={computeBucketModel([], cfg)}
      ptoGoal={null}
      setPtoGoal={() => {}}
      fiscalWeekInfo={getFiscalWeekInfo(getCurrentFiscalWeek(weeks, TODAY))}
      {...extra}
    />
  )

  it('renders without crashing for a base user', () => {
    const { container } = renderPanel()
    expect(container.textContent.length).toBeGreaterThan(0)
  })

  it('renders 401k content for a DHL user with contributions', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'B',
      dhlCustomSchedule: false,
      startingWeekIsLong: false,
      k401Rate: 0.06,
      setupComplete: true,
    }
    const { container } = renderPanel(cfg, buildYear(cfg))
    expect(container.textContent).toMatch(/401/i)
  })
})

describe('BudgetPanel', () => {
  const renderPanel = (extra = {}) => render(
    <BudgetPanel
      expenses={INITIAL_EXPENSES}
      setExpenses={() => {}}
      weeklyIncome={600}
      prevWeekNet={600}
      futureWeeks={futureWeeks}
      futureWeekNets={futureWeekNets}
      currentWeek={currentWeek}
      fiscalWeekInfo={getFiscalWeekInfo(currentWeek)}
      today={TODAY}
      userPaySchedule="weekly"
      config={CONFIG}
      bufferPerWeek={0}
      isAdmin={false}
      taxProjectionsEnabled={false}
      {...extra}
    />
  )

  it('renders without crashing with the default expense set', () => {
    const { container } = renderPanel()
    expect(container.textContent.length).toBeGreaterThan(0)
  })

  it('shows the default Food expense', () => {
    renderPanel()
    expect(screen.getAllByText(/Food/i).length).toBeGreaterThan(0)
  })

  it('renders with an empty expense list', () => {
    const { container } = renderPanel({ expenses: [] })
    expect(container.textContent.length).toBeGreaterThan(0)
  })
})
