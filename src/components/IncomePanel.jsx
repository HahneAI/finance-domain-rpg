import { useState, useEffect } from "react";
import { MONTH_FULL, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { STATE_TAX_TABLE } from "../constants/stateTaxTable.js";
import { computeNet, toLocalIso } from "../lib/finance.js";
import { deriveRollingIncomeWeeks, progressiveScale } from "../lib/rollingTimeline.js";
import { getFiscalWeekNumber } from "../lib/fiscalWeek.js";
import { formatRotationDisplay } from "../lib/rotation.js";
import { Card, iS, lS, ScrollSnapRow } from "./ui.jsx";

export function IncomePanel({ allWeeks, config, setConfig, showExtra, taxDerived, missedEventDayNetLost = 0, adjustedTakeHome, projectedAnnualNet, currentWeek, isAdmin, today, weekNetLookup = {} }) {
  const [showSharpener, setShowSharpener] = useState(false);
  const [showWeekDetail, setShowWeekDetail] = useState(false);
  const [showEventLossInfo, setShowEventLossInfo] = useState(false);

  // ── Sharpen Rates modal state ──────────────────────────────────────────────
  const [sg1, setSg1] = useState("");
  const [sf1, setSf1] = useState("");
  const [ss1, setSs1] = useState("");
  const [sg2, setSg2] = useState("");
  const [sf2, setSf2] = useState("");
  const [ss2, setSs2] = useState("");
  function sharpenDr(gross, withheld) {
    const g = parseFloat(gross) || 0;
    if (!g) return null;
    return +((parseFloat(withheld) || 0) / g).toFixed(4);
  }
  const isVariable = config.scheduleIsVariable;
  const stateConfig = config.userState ? STATE_TAX_TABLE[config.userState] : null;
  const isNoTax = stateConfig?.model === "NONE";
  const sFed1 = sharpenDr(sg1, sf1);
  const sSta1 = sharpenDr(sg1, ss1);
  const sFed2 = isVariable ? sharpenDr(sg2, sf2) : null;
  const sSta2 = isVariable ? sharpenDr(sg2, ss2) : null;
  const canSharpenerApply = sFed1 !== null;
  function applySharpener() {
    if (!canSharpenerApply) return;
    setConfig(prev => ({
      ...prev,
      fedRateLow:    sFed1,
      stateRateLow:  sSta1 ?? 0,
      fedRateHigh:   isVariable && sFed2 != null ? sFed2 : sFed1,
      stateRateHigh: isVariable && sSta2 != null ? sSta2 : (sSta1 ?? 0),
      // Keep legacy fields in sync
      w1FedRate: sFed1, w1StateRate: sSta1 ?? 0,
      w2FedRate: isVariable && sFed2 != null ? sFed2 : sFed1,
      w2StateRate: isVariable && sSta2 != null ? sSta2 : (sSta1 ?? 0),
      taxRatesEstimated: false,
    }));
    setShowSharpener(false);
    setSg1(""); setSf1(""); setSs1("");
    setSg2(""); setSf2(""); setSs2("");
  }
  const sPct = n => n != null ? (n * 100).toFixed(2) + "%" : "—";
  const { extraPerCheck } = taxDerived;
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gN = w => computeNet(w, config, extraPerCheck, showExtra);
  const resolveWeekNet = (week) => {
    const meta = weekNetLookup?.[week.idx];
    if (meta) return meta.adjustedNet;
    return gN(week);
  };

  // Pay-schedule-aware display factors
  const userPaySchedule = config?.userPaySchedule ?? "weekly";
  const firstActiveIdx = config?.firstActiveIdx ?? 0;
  const checksPerYear = PAYCHECKS_PER_YEAR[userPaySchedule] ?? 52;
  const perCheckFactor = 52 / checksPerYear;
  const isWeekly = checksPerYear === 52;
  const isBiweekly = userPaySchedule === "biweekly" || userPaySchedule === "salary";
  const isMonthlyPay = userPaySchedule === "monthly";
  // For biweekly users: even-offset weeks from firstActiveIdx are paycheck weeks
  const isPaycheckWeek = (w) => isBiweekly && ((w.idx - firstActiveIdx) % 2 + 2) % 2 === 0;

  const mo = MONTH_FULL.map((name, mi) => {
    const wks = allWeeks.filter(w => w.active && w.weekEnd.getFullYear() === 2026 && w.weekEnd.getMonth() === mi);
    return {
      name,
      gross: wks.reduce((s, w) => s + w.grossPay, 0),
      net: wks.reduce((s, w) => s + resolveWeekNet(w), 0),
      wks, n: wks.length, tx: wks.filter(w => w.taxedBySchedule).length, ex: wks.filter(w => !w.taxedBySchedule).length
    };
  });
  const yG = allWeeks.filter(w => w.active).reduce((s, w) => s + w.grossPay, 0);
  const yN = adjustedTakeHome;
  const sc = t => t ? "#7a8bbf" : "var(--color-green)", sb = t => t ? "#1e1e3a" : "#1e4a30", sbd = t => t ? "#7a8bbf" : "var(--color-green)";
  const todayIso = today ?? toLocalIso(new Date());
  const rollingWeekly = deriveRollingIncomeWeeks(allWeeks, todayIso, 4);
  const weeklyRows = rollingWeekly.visibleWeeks;
  const archivedWeeklyRows = rollingWeekly.hiddenWeeks;
  const weeklyDensityScale = progressiveScale(rollingWeekly.scaleProgress, 0.15);

  const currentMonthIdx = new Date(`${todayIso}T12:00:00`).getMonth();
  const prevMonthIdx = currentMonthIdx > 0 ? currentMonthIdx - 1 : null;
  const rollingMonthCards = mo
    .map((m, mi) => ({ ...m, mi, isCurrentMonth: mi === currentMonthIdx }))
    .filter(m => m.n > 0 && m.mi >= (prevMonthIdx !== null ? prevMonthIdx : currentMonthIdx));

  const [isDesktopWeekly, setIsDesktopWeekly] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 768 : true));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsDesktopWeekly(window.innerWidth >= 768);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);


  return (<div>

    {/* ── Sharpen Rates modal ─────────────────────────────────────────────────── */}
    {showSharpener && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}>
        <div style={{
          width: "100%", maxWidth: "440px",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "16px", padding: "24px",
          display: "flex", flexDirection: "column", gap: "20px",
        }}>
          <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Sharpen Your Tax Rates
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            Enter values from your paycheck stub to replace the estimated rates with exact figures.
          </div>

          {/* Week 1 */}
          <div style={{ background: "var(--color-bg-raised)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
              {isVariable ? "Shorter Week Paystub" : "Typical Paycheck"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lS}>Gross Pay ($)</label>
                <input style={iS} type="number" min="0" step="0.01" value={sg1} onChange={e => setSg1(e.target.value)} placeholder="e.g. 1050" />
              </div>
              <div>
                <label style={lS}>Fed Income Tax Withheld ($)</label>
                <input style={iS} type="number" min="0" step="0.01" value={sf1} onChange={e => setSf1(e.target.value)} placeholder="e.g. 82" />
              </div>
            </div>
            {!isNoTax && (
              <div>
                <label style={lS}>State Income Tax Withheld ($)</label>
                <input style={iS} type="number" min="0" step="0.01" value={ss1} onChange={e => setSs1(e.target.value)} placeholder="e.g. 35" />
              </div>
            )}
            {sFed1 !== null && (
              <div style={{ fontSize: "11px", color: "var(--color-green)" }}>
                → Fed {sPct(sFed1)}{!isNoTax && sSta1 != null ? `  ·  State ${sPct(sSta1)}` : ""}
              </div>
            )}
          </div>

          {/* Week 2 — variable only */}
          {isVariable && (
            <div style={{ background: "var(--color-bg-raised)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
                Longer Week Paystub
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={lS}>Gross Pay ($)</label>
                  <input style={iS} type="number" min="0" step="0.01" value={sg2} onChange={e => setSg2(e.target.value)} placeholder="e.g. 1450" />
                </div>
                <div>
                  <label style={lS}>Fed Income Tax Withheld ($)</label>
                  <input style={iS} type="number" min="0" step="0.01" value={sf2} onChange={e => setSf2(e.target.value)} placeholder="e.g. 186" />
                </div>
              </div>
              {!isNoTax && (
                <div>
                  <label style={lS}>State Income Tax Withheld ($)</label>
                  <input style={iS} type="number" min="0" step="0.01" value={ss2} onChange={e => setSs2(e.target.value)} placeholder="e.g. 58" />
                </div>
              )}
              {sFed2 !== null && (
                <div style={{ fontSize: "11px", color: "var(--color-green)" }}>
                  → Fed {sPct(sFed2)}{!isNoTax && sSta2 != null ? `  ·  State ${sPct(sSta2)}` : ""}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setShowSharpener(false)} style={{
              background: "var(--color-bg-raised)", color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
              padding: "8px 16px", fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", cursor: "pointer",
            }}>
              Cancel
            </button>
            <button onClick={applySharpener} disabled={!canSharpenerApply} style={{
              background: canSharpenerApply ? "var(--color-green)" : "var(--color-bg-raised)",
              color: canSharpenerApply ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 18px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold", cursor: canSharpenerApply ? "pointer" : "not-allowed",
            }}>
              Confirm Rates
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Missed event day take-home modal ───────────────────────────────────── */}
    {showEventLossInfo && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 210,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }} onClick={() => setShowEventLossInfo(false)}>
        <div style={{
          width: "100%", maxWidth: "420px",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "16px", padding: "20px",
          display: "flex", flexDirection: "column", gap: "12px",
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Missed Event Day Impact
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            Breakdown includes only take-home loss from missed event day logs.
          </div>
          <div style={{ background: "var(--color-bg-raised)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Projected net (before events)</span>
              <strong>{f(projectedAnnualNet)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Missed event day take-home loss</span>
              <strong style={{ color: "var(--color-deduction)" }}>-{f(missedEventDayNetLost)}</strong>
            </div>
            <div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: "8px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Adjusted net shown on card</span>
              <strong style={{ color: "var(--color-gold)" }}>{f(adjustedTakeHome)}</strong>
            </div>
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
            Card and modal both use the same adjusted net event-impact source.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowEventLossInfo(false)} style={{
              background: "var(--color-bg-raised)", color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
              padding: "8px 16px", fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", cursor: "pointer",
            }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Estimated rates banner ──────────────────────────────────────────────── */}
    {config.taxRatesEstimated && (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "12px", padding: "10px 14px", marginBottom: "16px",
        background: "rgba(0,200,150,0.06)",
        border: "1px solid rgba(0,200,150,0.18)",
        borderRadius: "8px",
      }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
          Tax rates are <strong style={{ color: "var(--color-gold)" }}>estimated</strong> — net figures are approximate until you confirm from a paystub.
        </div>
        <button onClick={() => setShowSharpener(true)} style={{
          fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
          background: "transparent", color: "var(--color-gold)",
          border: "1px solid rgba(0,200,150,0.28)", borderRadius: "10px",
          padding: "5px 12px", cursor: "pointer", flexShrink: 0,
        }}>
          Sharpen Rates
        </button>
      </div>
    )}

    <div style={{ marginBottom: "24px", textAlign: "center" }}>
      <div style={{ fontSize: "9px", letterSpacing: "4px", textTransform: "uppercase", color: "var(--color-text-disabled)", marginBottom: "12px" }}>
        Income Overview
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "14px" }}>
        <div style={{ fontSize: "32px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-accent-primary)", letterSpacing: "-1px", lineHeight: 1 }}>
          Year Summary
        </div>
        <button
          onClick={() => setShowEventLossInfo(true)}
          aria-label="Show missed event day loss details"
          style={{
            width: "24px", height: "24px", borderRadius: "999px", border: "1px solid var(--color-border-subtle)",
            background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", lineHeight: 1,
            flexShrink: 0,
          }}
        >i</button>
      </div>
      <div style={{ width: "28px", height: "2px", background: "var(--color-accent-primary)", margin: "0 auto", borderRadius: "1px", opacity: 0.45 }} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "28px" }}>
      <Card label="Gross (Year)" val={f(yG)} rawVal={yG}
        sub={currentWeek ? `Wk ${getFiscalWeekNumber(currentWeek.idx)} projection` : undefined}
        insight={yG > 0 && yN > 0 ? { arrow: "flat", delta: `${Math.round((yN / yG) * 100)}%`, label: "kept after tax", variant: "blue" } : undefined}
      />
      <Card label="Adjusted Net" val={f(yN)} rawVal={yN} color="var(--color-green)"
        sub={missedEventDayNetLost > 0 ? `${f(missedEventDayNetLost)} missed-day loss` : currentWeek ? `Wk ${getFiscalWeekNumber(currentWeek.idx)} · on pace` : undefined}
        insight={missedEventDayNetLost > 0 && projectedAnnualNet > 0 ? { arrow: "down", delta: `-${Math.round((missedEventDayNetLost / projectedAnnualNet) * 100)}%`, label: "of net to missed events", variant: "purple" } : undefined}
      />
    </div>
    <div>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, var(--color-accent-primary), transparent)", marginBottom: "20px", opacity: 0.35 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: "6px" }}>
              {isDesktopWeekly ? "Rolling Window" : "Monthly Rolling"}
            </div>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              {isDesktopWeekly
                ? isBiweekly
                  ? `${weeklyRows.filter(isPaycheckWeek).length} paychecks · rolling window`
                  : `${weeklyRows.length} visible · rolling window`
                : `${rollingMonthCards.length} months`}
            </div>
          </div>
          <button onClick={() => setShowWeekDetail(true)} style={{ fontSize: "10px", letterSpacing: "1px", padding: "4px 10px", borderRadius: "12px", cursor: "pointer", background: "transparent", color: "var(--color-gold)", border: "1px solid rgba(0,200,150,0.25)", textTransform: "uppercase", flexShrink: 0 }}>⊞ Full Detail</button>
        </div>
      </div>

      {!isDesktopWeekly ? (
        <ScrollSnapRow itemWidth="min(92vw, 340px)">
          {rollingMonthCards.map(m => {
            const isPastMonth = m.mi < currentMonthIdx;
            return (
              <div
                key={m.name}
                style={{
                  background: "var(--color-bg-surface)",
                  border: `1px solid ${m.isCurrentMonth ? "var(--color-accent-primary)" : "var(--color-border-subtle)"}`,
                  borderRadius: "14px",
                  padding: "14px",
                  opacity: isPastMonth ? 0.75 : 1,
                }}
              >
                {/* Month header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--color-gold)" }}>{m.name}</span>
                    {m.isCurrentMonth && <span style={{ fontSize: "8px", color: "var(--color-green)", letterSpacing: "1px" }}>← now</span>}
                  </div>
                  <span style={{
                    fontSize: "9px", padding: "2px 7px", borderRadius: "12px",
                    background: m.ex === m.n ? "#1e4a30" : m.tx === m.n ? "#1e1e3a" : "rgba(0,200,150,0.10)",
                    color: m.ex === m.n ? "var(--color-green)" : m.tx === m.n ? "#7a8bbf" : "var(--color-gold)",
                    border: "1px solid " + (m.ex === m.n ? "var(--color-green)" : m.tx === m.n ? "#7a8bbf" : "var(--color-gold)"),
                  }}>
                    {m.ex === m.n ? "EXEMPT" : m.tx === m.n ? "TAXED" : "MIXED"}
                  </span>
                </div>

                <div style={{ borderTop: "1px solid var(--color-border-subtle)", marginBottom: "8px" }} />

                {/* Week rows — paycheck-aware */}
                {(isMonthlyPay ? [] : isBiweekly ? m.wks.filter(isPaycheckWeek) : m.wks).map(w => {
                  const isCurrent = currentWeek && w.idx === currentWeek.idx;
                  const isPast = toLocalIso(w.weekEnd) < todayIso;
                  const netColor = isPast ? "var(--color-text-disabled)" : (w.taxedBySchedule ? "var(--color-accent-primary)" : "var(--color-green)");
                  const rotationDisplay = formatRotationDisplay(w, { isAdmin });
                  const rotationColor = w.rotation === "6-Day" ? "var(--color-gold)" : w.rotation === "4-Day" ? "#7a8bbf" : "var(--color-text-secondary)";
                  const displayNet = resolveWeekNet(w) * perCheckFactor;
                  return (
                    <div key={w.idx} style={{ marginBottom: "8px", opacity: isPastMonth ? 1 : (isPast ? 0.65 : 1) }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: "11px", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-primary)" }}>
                          {isBiweekly ? "Pay Period ending " : "Ends "}{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {isCurrent && <span style={{ marginLeft: "6px", fontSize: "8px", color: "var(--color-green)", letterSpacing: "1px" }}>← now</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "bold", color: netColor, fontVariantNumeric: "tabular-nums" }}>
                            {w.active ? f2(displayNet) : "—"}
                          </span>
                          {w.active && (
                            <span style={{ fontSize: "8px", padding: "2px 5px", borderRadius: "2px", background: sb(w.taxedBySchedule), color: sc(w.taxedBySchedule), border: "1px solid " + sbd(w.taxedBySchedule), letterSpacing: "0.5px" }}>
                              {w.taxedBySchedule ? "TX" : "EX"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: "9px", color: isBiweekly ? "var(--color-text-secondary)" : rotationColor, marginTop: "2px" }}>
                        {!isBiweekly && `${rotationDisplay} · `}{isPast ? "ACTUAL" : "PROJECTED"}
                      </div>
                    </div>
                  );
                })}

                {/* Month total */}
                <div style={{ borderTop: "1px solid var(--color-border-subtle)", marginTop: "4px", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
                    {isMonthlyPay ? "1 Paycheck" :
                     isBiweekly ? (() => { const n = m.wks.filter(isPaycheckWeek).length; return `${n} Paycheck${n !== 1 ? "s" : ""}`; })() :
                     (m.wks.some(w => toLocalIso(w.weekEnd) >= todayIso) ? "Est. Take Home" : "Take Home")}
                  </span>
                  <span style={{ fontSize: "16px", fontWeight: "bold", color: m.isCurrentMonth ? "var(--color-accent-primary)" : "var(--color-green)", fontVariantNumeric: "tabular-nums" }}>
                    {f2(m.net)}
                  </span>
                </div>
              </div>
            );
          })}
        </ScrollSnapRow>
      ) : (
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: `${12 * weeklyDensityScale}px` }}>
          <thead><tr style={{ borderBottom: "1px solid var(--color-accent-primary)", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
            <th style={{ textAlign: "left", padding: "8px 4px", position: "sticky", top: 0, zIndex: 4, background: "var(--color-bg-base)", boxShadow: "0 6px 10px rgba(0,0,0,0.18)" }}>{isBiweekly ? "Pay Period End" : "Wk End"}</th>
            <th style={{ textAlign: "right", padding: "8px 4px", position: "sticky", top: 0, zIndex: 4, background: "var(--color-bg-base)", boxShadow: "0 6px 10px rgba(0,0,0,0.18)" }}>Gross</th>
            <th style={{ textAlign: "right", padding: "8px 4px", position: "sticky", top: 0, zIndex: 4, background: "var(--color-bg-base)", boxShadow: "0 6px 10px rgba(0,0,0,0.18)" }}>Take Home</th>
            <th style={{ textAlign: "center", padding: "8px 4px", position: "sticky", top: 0, zIndex: 4, background: "var(--color-bg-base)", boxShadow: "0 6px 10px rgba(0,0,0,0.18)" }}>Status</th>
          </tr></thead>
            <tbody>{(isBiweekly ? weeklyRows.filter(isPaycheckWeek) : weeklyRows).map(w => {
              const isCurrent = currentWeek && w.idx === currentWeek.idx;
              const isPast = toLocalIso(w.weekEnd) < todayIso;
              const baseBg = isCurrent ? "#1a2a14" : isPast ? "#111111" : "transparent";
              const hoverBg = isCurrent ? "#1e3018" : isPast ? "#1a1a1a" : "var(--color-bg-surface)";
              const netColor = isPast ? "var(--color-text-disabled)" : (w.taxedBySchedule ? "var(--color-text-primary)" : "var(--color-green)");
              const displayNet = w.active ? f2(resolveWeekNet(w) * perCheckFactor) : "—";
              const displayGross = w.active ? f2(w.grossPay * perCheckFactor) : "—";
              const rotationDisplay = formatRotationDisplay(w, { isAdmin });
              const rotationColor = w.rotation === "6-Day" ? "var(--color-gold)" : w.rotation === "4-Day" ? "#7a8bbf" : "var(--color-text-disabled)";
              return (
                <tr
                  key={w.idx}
                  style={{ borderBottom: "1px solid #161616", background: baseBg }}
                  onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = baseBg; }}
              >
                <td style={{ padding: `${Math.round(7 * weeklyDensityScale)}px 4px`, color: isPast ? "var(--color-text-disabled)" : "var(--color-text-primary)" }}>
                  <span>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  {isCurrent && <span style={{ marginLeft: "6px", fontSize: "8px", color: "var(--color-green)", letterSpacing: "1px" }}>← now</span>}
                </td>
                <td style={{ padding: "7px 4px", textAlign: "right", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-primary)" }}>{displayGross}</td>
                <td style={{ padding: "7px 4px", textAlign: "right", color: netColor }}>{displayNet}</td>
                <td style={{ padding: "7px 4px", textAlign: "center", color: rotationColor, fontWeight: "bold" }}>{rotationDisplay}</td>
                <td style={{ padding: "7px 4px", textAlign: "center" }}>
                  {w.active && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "8px", padding: "2px 6px", borderRadius: "2px", background: sb(w.taxedBySchedule), color: sc(w.taxedBySchedule), border: "1px solid " + sbd(w.taxedBySchedule) }}>
                        {w.taxedBySchedule ? "TX" : "EX"}
                      </span>
                      <span style={{ fontSize: "8px", letterSpacing: "0.5px", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-secondary)" }}>
                        {isPast ? "ACTUAL" : "PROJECTED"}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}

      {isDesktopWeekly && archivedWeeklyRows.length > 0 && (
        <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--color-text-disabled)" }}>
          {archivedWeeklyRows.length} older active week(s) hidden (view keeps last 4 completed weeks + rest of year; archived for future full-year review).
        </div>
      )}
    </div>

    {/* FULL-DETAIL WEEKLY MODAL */}
    {showWeekDetail && <div onClick={() => setShowWeekDetail(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, overflowY: "auto", padding: "16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-bg-surface)", borderRadius: "8px", maxWidth: "860px", margin: "0 auto", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <span style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase" }}>{isBiweekly ? "Pay Period Breakdown" : isMonthlyPay ? "Monthly Breakdown" : "Weekly Breakdown"} — Active Window Detail</span>
          <button onClick={() => setShowWeekDetail(false)} style={{ background: "transparent", border: "none", color: "var(--color-text-primary)", fontSize: "16px", cursor: "pointer", padding: "4px 8px" }}>✕</button>
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}><table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "680px" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--color-accent-primary)", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>{isBiweekly ? "Period End" : "Wk End"}</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Rot</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Hrs</th><th style={{ textAlign: "center", padding: "8px 4px" }}>OT</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Wknd</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Take Home</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Status</th>
          </tr></thead>
          <tbody>{(isBiweekly ? weeklyRows.filter(isPaycheckWeek) : weeklyRows).map(w => {
            const isCurrent = currentWeek && w.idx === currentWeek.idx;
            const isPast = toLocalIso(w.weekEnd) < todayIso;
            const baseBg = isCurrent ? "#1a2a14" : isPast ? "#111111" : "transparent";
            const hoverBg = isCurrent ? "#1e3018" : isPast ? "#1a1a1a" : "var(--color-bg-surface)";
            const netColor = isPast ? "var(--color-text-disabled)" : (w.taxedBySchedule ? "var(--color-text-primary)" : "var(--color-green)");
            const rotationDisplay = formatRotationDisplay(w, { isAdmin });
            const rotationColor = w.rotation === "6-Day" ? "var(--color-gold)" : w.rotation === "4-Day" ? "#7a8bbf" : "var(--color-text-disabled)";
            return (
              <tr
                key={w.idx}
                style={{ borderBottom: "1px solid #161616", background: baseBg }}
                onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={e => { e.currentTarget.style.background = baseBg; }}
              >
                <td style={{ padding: "7px 4px", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-primary)" }}>
                  <span>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  {isCurrent && <span style={{ marginLeft: "6px", fontSize: "8px", color: "var(--color-green)", letterSpacing: "1px" }}>← now</span>}
                </td>
                <td style={{ padding: "7px 4px", textAlign: "center", fontSize: "10px", color: rotationColor }}>{rotationDisplay}</td>
                <td style={{ padding: "7px 4px", textAlign: "center", color: "var(--color-text-secondary)" }}>{w.active ? w.totalHours : "—"}</td>
                <td style={{ padding: "7px 4px", textAlign: "center", color: w.active && w.overtimeHours > 0 ? "var(--color-deduction)" : "var(--color-text-primary)" }}>{w.active && w.overtimeHours > 0 ? w.overtimeHours : "—"}</td>
                <td style={{ padding: "7px 4px", textAlign: "center", color: w.active && w.weekendHours > 0 ? "var(--color-gold)" : "var(--color-text-primary)" }}>{w.active && w.weekendHours > 0 ? w.weekendHours : "—"}</td>
                <td style={{ padding: "7px 4px", textAlign: "right", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-primary)" }}>{w.active ? f2(w.grossPay * perCheckFactor) : "—"}</td>
                <td style={{ padding: "7px 4px", textAlign: "right", color: netColor }}>{w.active ? f2(resolveWeekNet(w) * perCheckFactor) : "—"}</td>
                <td style={{ padding: "7px 4px", textAlign: "center" }}>
                  {w.active && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "8px", padding: "2px 6px", borderRadius: "2px", background: sb(w.taxedBySchedule), color: sc(w.taxedBySchedule), border: "1px solid " + sbd(w.taxedBySchedule) }}>
                        {w.taxedBySchedule ? "TX" : "EX"}
                      </span>
                      <span style={{ fontSize: "8px", letterSpacing: "0.5px", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-secondary)" }}>
                        {isPast ? "ACTUAL" : "PROJECTED"}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>
    </div>}
  </div>);
}
