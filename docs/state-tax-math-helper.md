# State Tax Math Helper (Audit Update)

## Tax Calculation Method

The app supports three state tax models and computes them data-first from `STATE_TAX_TABLE`:

- `NONE`: tax = `0`
- `FLAT`: tax = `income * flatRate`
- `PROGRESSIVE`: marginal brackets, where each bracket taxes only its own slice of income

Marginal bracket pseudocode:

```ts
let tax = 0
let prev = 0
for (const { max, rate } of brackets) {
  if (income <= prev) break
  tax += (Math.min(income, max) - prev) * rate
  prev = max
}
```

## Missouri Deep Audit (2025)

Missouri is **progressive**, not flat.

- For tax year 2025, Missouri's top individual income tax rate is **4.7%**.
- That 4.7% is a **top marginal rate** and must not be applied to all taxable income.
- The app now models Missouri with marginal brackets ending at `Infinity` with rate `0.047`.

Missouri brackets currently encoded in app data:

- $0–$1,273: 0.0%
- $1,273–$2,546: 2.0%
- $2,546–$3,819: 2.5%
- $3,819–$5,092: 3.0%
- $5,092–$6,365: 3.5%
- $6,365–$7,638: 4.0%
- $7,638–$8,911: 4.5%
- $8,911+: 4.7%

Source: Missouri Department of Revenue (top rate reduction announcement):
https://dor.mo.gov/news/newsitem/uuid/15044650-59dd-48f4-975a-01988d485255

## 50-State Classification Chart (Wage Income)

> Note: This chart is scoped to each state's broad wage-income treatment as modeled by the app. Some states have special surtaxes, local taxes, or non-wage exceptions.

| State | Tax type | Rate / bracket note |
|---|---|---|
| Alabama | Progressive | Bracketed marginal rates |
| Alaska | No tax | No state wage income tax |
| Arizona | Flat | 2.5% flat |
| Arkansas | Progressive | Bracketed marginal rates |
| California | Progressive | Bracketed marginal rates |
| Colorado | Flat | 4.4% flat |
| Connecticut | Progressive | Bracketed marginal rates |
| Delaware | Progressive | Bracketed marginal rates |
| Florida | No tax | No state wage income tax |
| Georgia | Flat | 5.5% flat |
| Hawaii | Progressive | Bracketed marginal rates |
| Idaho | Flat | 5.8% flat |
| Illinois | Flat | 4.95% flat |
| Indiana | Flat | 3.05% flat |
| Iowa | Flat | 3.8% flat |
| Kansas | Progressive | Bracketed marginal rates |
| Kentucky | Flat | 4.0% flat |
| Louisiana | Flat | 3.0% flat |
| Maine | Progressive | Bracketed marginal rates |
| Maryland | Progressive | Bracketed marginal rates (county taxes separate) |
| Massachusetts | Progressive | 5% base + 4% surtax above $1M |
| Michigan | Flat | 4.25% flat |
| Minnesota | Progressive | Bracketed marginal rates |
| Mississippi | Flat | Flat model in current table |
| Missouri | Progressive | 2025 top marginal rate 4.7% |
| Montana | Progressive | Bracketed marginal rates |
| Nebraska | Progressive | Bracketed marginal rates |
| Nevada | No tax | No state wage income tax |
| New Hampshire | No tax | No state wage income tax |
| New Jersey | Progressive | Bracketed marginal rates |
| New Mexico | Progressive | Bracketed marginal rates |
| New York | Progressive | Bracketed marginal rates |
| North Carolina | Flat | 4.5% flat |
| North Dakota | Progressive | Bracketed marginal rates |
| Ohio | Progressive | Bracketed marginal rates |
| Oklahoma | Progressive | Bracketed marginal rates |
| Oregon | Progressive | Bracketed marginal rates |
| Pennsylvania | Flat | 3.07% flat |
| Rhode Island | Progressive | Bracketed marginal rates |
| South Carolina | Progressive | Bracketed marginal rates |
| South Dakota | No tax | No state wage income tax |
| Tennessee | No tax | No state wage income tax |
| Texas | No tax | No state wage income tax |
| Utah | Flat | 4.65% flat |
| Vermont | Progressive | Bracketed marginal rates |
| Virginia | Progressive | Bracketed marginal rates |
| Washington | No tax | No state wage income tax (capital gains tax exists) |
| West Virginia | Progressive | Bracketed marginal rates |
| Wisconsin | Progressive | Bracketed marginal rates |
| Wyoming | No tax | No state wage income tax |

## District of Columbia (Included in App Table)

The app table also includes **DC**, modeled as `PROGRESSIVE` with marginal brackets.

## Remaining Edge Cases To Track

- Local add-on income taxes are not represented in this table (e.g., many OH/PA localities, MD counties).
- State-specific deductions, exemptions, credits, and filing-status differences are not embedded in these simple bracket/flat records.
- Non-wage taxes (e.g., capital-gains-specific regimes) may differ from wage treatment.
