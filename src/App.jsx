import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useScrollDirection } from "./hooks/useScrollDirection.js";
import { DEFAULT_CONFIG, INITIAL_EXPENSES, INITIAL_GOALS, INITIAL_LOGS, PAYCHECKS_PER_YEAR, EVENT_TYPES } from "./constants/config.js";
import { buildYear, computeNet, fedTax, stateTax, getStateConfig, calcEventImpact, resolveEventWeekMeta, computeRemainingSpend, computeBucketModel, toLocalIso, isFutureWeek, getPayPeriodEndDate, resolvePrevWeekNet } from "./lib/finance.js";
import { getFundedGoalSpend } from "./lib/goalFunding.js";
import { getCurrentFiscalWeek, getFiscalWeekInfo, formatFiscalWeekLabel, formatPayPeriodLabel, resolveActiveWeeksThisYear } from "./lib/fiscalWeek.js";
import { loadUserData, saveUserData, syncUserProfile, createInvestorAccount, saveInvestorActiveAccount, saveConfigSnapshot, fetchConfigHistoryMeta, checkRevival, flushUserDataKeepalive, ensureInitialFoodExpense, logBetaEvent } from "./lib/db.js";
import { diffSensitiveFields } from "./lib/configHistory.js";
import { getEntitlement } from "./lib/subscription.js";
import { supabase, onAuthChange } from "./lib/supabase.js";
import { IncomePanel } from "./components/IncomePanel.jsx";
import { BudgetPanel } from "./components/BudgetPanel.jsx";
import { LogPanel } from "./components/LogPanel.jsx";
import { WeekConfirmModal } from "./components/WeekConfirmModal.jsx";
import { HomePanel } from "./components/HomePanel.jsx";
import { SetupWizard } from "./components/SetupWizard.jsx";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { ReviveScreen } from "./components/ReviveScreen.jsx";
import { TrialExplainerScreen } from "./components/TrialExplainerScreen.jsx";
import { InvestorRegister } from "./components/InvestorRegister.jsx";
import { DemoAccountTree } from "./components/DemoAccountTree.jsx";
import { ProfilePanel } from "./components/ProfilePanel.jsx";
import { UpgradeModal } from "./components/UpgradeModal.jsx";
import { UpgradePanel } from "./components/UpgradePanel.jsx";
import { TrialBanner } from "./components/TrialBanner.jsx";
import { UpdateAvailableBanner } from "./components/UpdateAvailableBanner.jsx";
import { SaveFailedBanner } from "./components/SaveFailedBanner.jsx";
import { LiquidGlass } from "./components/LiquidGlass.jsx";
import { Pressable, FoldSwitch } from "./components/ui.jsx";
import { LifeEventMenu } from "./components/LifeEventMenu.jsx";
import { JobLossEntry } from "./components/JobLossEntry.jsx";
import { RateUpdateModal } from "./components/RateUpdateModal.jsx";
import { JobLossHomePanel } from "./components/JobLossHomePanel.jsx";
import { JobLossBudgetPanel } from "./components/JobLossBudgetPanel.jsx";
import { PwaInstallModal } from "./components/PwaInstallModal.jsx";
import { isStandaloneDisplayMode } from "./lib/pwa.js";
import { AskCoachPanel } from "./components/AskCoachPanel.jsx";
import { isTrackedBetaTester, canAccessAskCoachGeneral } from "./lib/entitlements.js";
import { computeJobLossRunway, resolvePrimaryRunwayDays, sumJobHuntIncome } from "./lib/jobLossRunway.js";

const NAV_ITEMS = [
  { key: "income",   label: "Income" },
  { key: "budget",   label: "Budget" },
  { key: "log",      label: "Log" },
  { key: "profile",  label: "Account" },
];

// Bottom nav items with SVG icons — Chime-style icon+label layout
const BOTTOM_NAV = [
  {
    key: "home",
    label: "Home",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
    ),
  },
  {
    key: "income",
    label: "Income",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 20h2v-8H5v8zm4 0h2V4H9v16zm4 0h2v-4h-2v4zm4 0h2v-12h-2v12z"/>
      </svg>
    ),
  },
  {
    key: "budget",
    label: "Budget",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      </svg>
    ),
  },
  {
    key: "log",
    label: "Log",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Account",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    ),
  },
];

function SidebarNavItem({ item, active, onClick }) {
  return (
    <Pressable
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 20px",
        fontSize: "11px",
        letterSpacing: "2px",
        textTransform: "uppercase",
       
        background: active ? "var(--color-bg-surface)" : "transparent",
        color: active ? "var(--color-teal)" : "var(--color-text-primary)",
        borderLeft: active ? "3px solid #c8a84b" : "3px solid transparent",
        border: "none",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {item.label}
    </Pressable>
  );
}

function FullScreenLoadingState({ label = "Loading your dashboard" }) {
  return (
    <div style={{
      background: "var(--color-bg-gradient)",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "32px",
    }}>
      <style>{`
        @keyframes afPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.85); }
          50%       { opacity: 1;    transform: scale(1);    }
        }
        @keyframes afBar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%);  }
        }
      `}</style>

      {/* Brand label */}
      <div style={{
        fontSize: "10px",
        letterSpacing: "4px",
        textTransform: "uppercase",
        color: "var(--color-text-disabled)",
      }}>
        Authority Finance
      </div>

      {/* Three breathing dots */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--color-accent-primary)",
            animation: `afPulse 1.4s ease-in-out ${i * 0.22}s infinite`,
          }} />
        ))}
      </div>

      {/* Progress bar track */}
      <div style={{
        width: "160px",
        height: "2px",
        background: "var(--color-border-subtle)",
        borderRadius: "2px",
        overflow: "hidden",
      }}>
        <div style={{
          width: "40%",
          height: "100%",
          background: "var(--color-accent-primary)",
          borderRadius: "2px",
          animation: "afBar 1.6s ease-in-out infinite",
          opacity: 0.8,
        }} />
      </div>

      {/* Status label */}
      <div style={{
        fontSize: "11px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: "var(--color-text-disabled)",
      }}>
        {label}
      </div>
    </div>
  );
}

export default function App() {
  // ── Auth state ─────────────────────────────────────────────────────────────
  // authChecked: true once the initial getSession() call resolves.
  // Without this flag, there's a flash of the login screen on every page reload
  // even when a valid session already exists in localStorage.
  const [authedUser, setAuthedUser]         = useState(null);
  const [authChecked, setAuthChecked]       = useState(false);
  const [pendingPasswordReset, setPendingPasswordReset] = useState(false);
  // Set when a Google OAuth redirect lands back on the app but never resolves into
  // a session (e.g. the PKCE code exchange fails on a first-time sign-in). Surfaced
  // to LoginScreen so the user sees why they're back at the sign-in form instead of
  // silently landing there with no explanation.
  const [oauthCallbackFailed, setOauthCallbackFailed] = useState(false);
  // Post-login transition: true for 340ms after a successful sign-in to animate
  // LoginScreen out and authenticated shell in. During this window, both screens
  // are rendered with opacity transitions.
  const [postLoginFade, setPostLoginFade] = useState(false);
  const prevAuthedUserRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showExtra, setShowExtra] = useState(true);
  const [isEmployerDHL, setIsEmployerDHL] = useState(false);
  // Trial/subscription state (docs/TODO.md §17.D/E) — null until loadUserData resolves.
  const [subscription, setSubscription] = useState(null);
  // ?checkout=success|cancel return from Stripe Checkout — null once resolved/dismissed.
  const [checkoutReturn, setCheckoutReturn] = useState(null);
  // §17.I — non-null when the signed-in email matches an open deleted_accounts
  // tombstone; the app renders ReviveScreen instead of anything else until a
  // successful revival charge flips subscription_status to active.
  const [revivalInfo, setRevivalInfo] = useState(null);
  // Upgrade modal triggered from the read-only Home/Budget notice (§17.E).
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  // Beta tester flag (docs/active-systems.md "Beta Tester Accounts") — set
  // manually via SQL, never client-writable. Grants AI features only; NOT an
  // investor-equivalent (no demo accounts, no investor code path).
  const [isTester, setIsTester] = useState(false);
  // Distinguishes the tracked 10-week beta cohort (is_tester true + a redeemed
  // beta code) from friends/family testers (is_tester true, no code) — see
  // database/migrations/025_add_beta_code_used.sql and entitlements.js
  // isTrackedBetaTester. Read-only from the client, same as is_tester.
  const [betaCodeUsed, setBetaCodeUsed] = useState(null);
  // Per-user unlock for the Tax Plan feature — granted via SQL to select non-admins.
  const [taxProjectionsEnabled, setTaxProjectionsEnabled] = useState(false);
  const [ptoGoal, setPtoGoal] = useState(null);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  // viewStack: push on navigate, pop on back. Last item = current view.
  // "home" is always the base — never popped below depth 1.
  const [viewStack, setViewStack] = useState(["home"]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // PWA install instructions modal — single instance at the app root, opened from
  // both the drawer and the Account panel. Hidden entirely when already installed.
  const pwaModalRef = useRef(null);
  const isStandalone = useMemo(() => isStandaloneDisplayMode(), []);
  const openPwaModal = useCallback((triggerEl) => pwaModalRef.current?.open(triggerEl), []);
  // Investor pre-auth state — set when a valid code is entered on LoginScreen.
  // Cleared on sign-out or when the user navigates back from InvestorRegister.
  const [investorSession, setInvestorSession] = useState(null); // null | { code: string }
  // Active investor account tab — 1 = Demo 1, 2 = Demo 2, 3 = personal account.
  // Defaults to 1 so investors land on demo content on every login.
  const [activeInvestorAccount, setActiveInvestorAccount] = useState(1);
  // Incremented after investor account creation to force a second loadUserData
  // call once all DB writes (investor_users + user_data) have settled.
  const [reloadTrigger, setReloadTrigger] = useState(0);
  // Investor profile fetched from investor_users on login — null for non-investors.
  const [investorProfile, setInvestorProfile] = useState(null);
  const [tempLockDate, setTempLockDate] = useState(() => {
    const stored = localStorage.getItem("admin_temp_lock_date");
    return stored && Date.parse(stored) > 0 ? stored : null;
  });
  const [adminDateDraft, setAdminDateDraft] = useState("");
  // null = personal view; 1 or 2 = admin is editing that demo account.
  // isAdmin-only: non-admin users never set this.
  const [adminDemoView, setAdminDemoView] = useState(null);
  // null = idle; { op, pending, ok, ts, err } = in-flight or result
  const [syncStatus, setSyncStatus] = useState(null);
  const [configViewOpen, setConfigViewOpen] = useState(false);
  const [toolSheetOpen, setToolSheetOpen] = useState(false);
  const [askCoachOpen, setAskCoachOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetDragStartY = useRef(null);
  const [rowViewOpen, setRowViewOpen] = useState(false);
  const [rowData, setRowData] = useState(null);
  const [rowFetching, setRowFetching] = useState(false);
  const [historyMeta, setHistoryMeta] = useState(null); // §19 config-history line in DB Row viewer
  const [taxGridOpen, setTaxGridOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectedWeek, setInspectedWeek] = useState(null);
  // Persisted to Supabase week_confirmations JSONB column.
  // Shape: { [weekIdx]: { confirmedAt, dayToggles, scheduledDays, missedScheduledDays,
  //                        pickupDays, netShiftDelta, eventId } }
  // Keyed by weekIdx (number) so lookup is O(1) in confirmTriggerWeek.
  const [weekConfirmations, setWeekConfirmations] = useState({});
  // Point-in-time baseRate lookup (TODO §15.D / §19 narrow slice) — sorted-or-not
  // list of { effectiveFrom, baseRate } fed to buildYear() so a rate change only
  // recomputes weeks from its effective date forward. See resolveBaseRateForWeek
  // in lib/finance.js for the resolution algorithm.
  const [baseRateHistory, setBaseRateHistory] = useState([]);
  // wizardEntry: null=closed, false=first-run, string=re-entry life event
  const [wizardEntry, setWizardEntry] = useState(null);
  // wizardExiting: true while the wizard card is animating out (180ms foldLiftOut).
  // Allows the wizard to stay mounted during exit animation, then unmount after.
  const [wizardExiting, setWizardExiting] = useState(false);
  // Gates TrialExplainerScreen ahead of first-run SetupWizard entry (docs/TODO.md
  // §17). Not persisted — re-prompts on a later session same as wizardEntry
  // itself does until setupComplete flips true.
  const [trialExplainerAcknowledged, setTrialExplainerAcknowledged] = useState(false);
  const [lifeEventMenu, setLifeEventMenu] = useState(false);
  const [jobLossEntryOpen, setJobLossEntryOpen] = useState(false);
  const [rateUpdateOpen, setRateUpdateOpen] = useState(false);
  // TODO §15 mode rebuild — the benefit-scenario toggle (unlike cash on hand,
  // which is now a real persisted config.jobLossCashOnHand field edited
  // directly by JobLossHomePanel/JobLossBudgetPanel) stays session-only by
  // design — lifted here so both panels agree without either owning the
  // other's state.
  const [jobLossIncludeBenefits, setJobLossIncludeBenefits] = useState(true);
  // Session-only dismissal so the banner re-appears on every page load,
  // matching the §15.C1 spec ("dismissible but re-shows on reload").
  const [jobLossBannerDismissed, setJobLossBannerDismissed] = useState(false);
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  // main.jsx dispatches this once the new service worker is installed and
  // waiting — reload only happens when the user taps Refresh in the banner
  // below, never automatically (see vite.config.js registerType comment).
  useEffect(() => {
    const onUpdateAvailable = () => setUpdateAvailable(true);
    window.addEventListener("pwa-update-available", onUpdateAvailable);
    return () => window.removeEventListener("pwa-update-available", onUpdateAvailable);
  }, []);

  const currentView = viewStack[viewStack.length - 1];

  // TODO §15 nav restructuring — Income/Log are dropped from the nav entirely
  // in Job Loss Mode (effectiveBottomNav/effectiveNavItems above), but a user
  // could already be sitting on one of those tabs the instant jobLossMode
  // flips true (Back to Work's counterpart already reuses whatever tab was
  // active, so no redirect needed on exit). Bounce to Home rather than
  // stranding them on a tab with no way back to it via the nav.
  useEffect(() => {
    if (config.jobLossMode && (currentView === "income" || currentView === "log")) {
      navigateDirect("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.jobLossMode]);
  const mainContentRef = useRef(null);
  // Track the actual DOM element in state so useScrollDirection's effect
  // re-runs when the element mounts (first render hits auth gate, so the
  // ref is null until the real view renders).
  const [mainContentEl, setMainContentEl] = useState(null);
  const mainContentCallbackRef = useCallback((el) => {
    mainContentRef.current = el; // keep ref in sync for jumpToPanelTop
    setMainContentEl(el);
  }, []);
  const isScrollingDown = useScrollDirection(mainContentEl);

  // Prevent background scroll while the admin sheet is open. On mobile the scroll
  // container is .main-content (overflow-y:auto) — not <body> — so locking only the
  // body did nothing and scroll leaked to the dashboard behind the sheet. Lock the
  // actual container too; the sheet keeps its own overflow so it still scrolls.
  useEffect(() => {
    const sc = mainContentRef.current;
    const lock = () => {
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
      if (sc) { sc.style.overflow = "hidden"; sc.style.overscrollBehavior = "none"; }
    };
    const unlock = () => {
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
      if (sc) { sc.style.overflow = ""; sc.style.overscrollBehavior = ""; }
    };
    if (toolSheetOpen) lock(); else unlock();
    return unlock;
  }, [toolSheetOpen]);

  // ≥44px tap target for the admin Tools sheet "View/Hide/Fetch" toggle links.
  // They were ~10px tall (padding:0) and sit directly above the Demo Account
  // buttons, so a missed tap launched the demo view (debug.md §4b). Negative
  // margins absorb the extra padding into the surrounding 20px gutter so the
  // header rows stay visually compact while the touch area meets the minimum.
  const sheetToggleBtnStyle = {
    background: "transparent", border: "none", color: "var(--color-accent-primary)",
    fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer",
    padding: "12px 10px", margin: "-10px -10px -10px 0",
    minWidth: "44px", minHeight: "44px",
    display: "inline-flex", alignItems: "center", justifyContent: "flex-end",
  };

  const jumpToPanelTop = () => {
    const scrollToTop = () => {
      const container = mainContentRef.current;
      if (container) {
        if (typeof container.scrollTo === "function") container.scrollTo({ top: 0, left: 0, behavior: "auto" });
        else container.scrollTop = 0;
      }
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };

    if (typeof requestAnimationFrame === "function") requestAnimationFrame(scrollToTop);
    else scrollToTop();
  };

  // Push a panel onto the stack (used by tiles and within-panel navigation)
  const navigate = (key) => {
    setViewStack(prev => [...prev, key]);
    setDrawerOpen(false);
    jumpToPanelTop();
  };

  // Direct jump: always lands as ["home", key] — used by sidebar/drawer/bottom-nav
  // so switching panels never nests indefinitely.
  // Also exits any active admin demo view so the personal panel is shown.
  const navigateDirect = (key) => {
    setViewStack(key === "home" ? ["home"] : ["home", key]);
    setDrawerOpen(false);
    setAdminDemoView(null);
    jumpToPanelTop();
  };

  // ── Auth: check existing session on mount, subscribe to changes ──
  // Tracks which user id we've already run the revival/trial-seed/reload chain
  // for below — see the SIGNED_IN guard for why this exists.
  const signedInChainRanForRef = useRef(null);
  // Dedupes the beta "login" activity event the same way — one row per real
  // sign-in, not per data-load. Reset on SIGNED_OUT alongside the ref above so
  // a genuine later sign-in (same tab, sign out then back in) logs again.
  const loginLoggedForRef = useRef(null);
  useEffect(() => {
    // Rely solely on onAuthStateChange rather than calling getSession() first.
    // getSession() resolves before Supabase has exchanged the OAuth code from the URL,
    // so it can return null and then overwrite the SIGNED_IN user back to null — causing
    // the Google login double-select bug. INITIAL_SESSION fires after any pending code
    // exchange, so it's safe to use as the authChecked gate.
    return onAuthChange((event, user) => {
      if (event === "PASSWORD_RECOVERY") setPendingPasswordReset(true);
      else setPendingPasswordReset(false);
      if (event === "SIGNED_OUT") {
        signedInChainRanForRef.current = null;
        loginLoggedForRef.current = null;
      }
      // Seed user_data row + sync OAuth profile metadata on every sign-in.
      // Critical for Google OAuth users who have no row yet; safe no-op for email users.
      // §17.I: the revival check MUST run first — an OAuth sign-in with a
      // previously-deleted email silently creates a brand-new auth user, and
      // syncUserProfile would seed that user a fresh free trial. If the email
      // matches an open tombstone, route to ReviveScreen and hold off trial
      // seeding entirely; a lookup failure falls back to the normal flow so a
      // transient server error can't lock a regular user out.
      // The loadUserData() effect below fires in parallel off the same
      // authedUser?.id change, racing this chain's checkRevival→syncUserProfile
      // (which upserts trial_started_at/trial_ends_at/access_ends_at via
      // /api/seed-trial). On a brand-new signup the row doesn't exist yet, so
      // loadUserData() usually wins the race and reads DEFAULT_SUBSCRIPTION
      // (all-null trial fields) — getEntitlement() then permanently reports
      // state "none" ("No subscription required for this account") since
      // nothing else re-triggers a reload for a normal, non-revival, non-
      // checkout-return sign-in. Bump reloadTrigger once seeding has actually
      // settled so loadUserData() re-runs and picks up the real trial window.
      //
      // Guard: supabase-js's GoTrueClient re-emits SIGNED_IN — with the SAME
      // already-established session — on every hidden→visible tab transition
      // (_onVisibilityChanged → _recoverAndRefresh), which fires constantly on
      // mobile from app switching, screen lock/unlock, notification banners.
      // Without this guard, each one re-ran the chain below and force-reloaded
      // loadUserData(), overwriting in-memory config/expenses/goals/logs with
      // whatever was last saved to the DB and flashing the full-screen loading
      // state — silently discarding any edit made in the preceding debounce
      // window. Only the first SIGNED_IN seen for a given user id needs this
      // chain; later ones for the same id are the visibility-recovery no-op.
      if (event === "SIGNED_IN" && user && signedInChainRanForRef.current !== user.id) {
        signedInChainRanForRef.current = user.id;
        checkRevival()
          .then((revival) => {
            if (revival) {
              setRevivalInfo(revival);
              return;
            }
            return syncUserProfile(user).then(() => setReloadTrigger((n) => n + 1));
          })
          .catch(() => syncUserProfile(user).then(() => setReloadTrigger((n) => n + 1)));
      }
      setAuthedUser(user);
      // INITIAL_SESSION fires once on startup (after OAuth code exchange if applicable).
      // All other events also mark auth as checked so late-arriving events don't re-gate.
      setAuthChecked(true);
    });
  }, []);

  // ── Post-login fade animation: detect successful sign-in and animate transition ──
  // Triggers a 340ms crossfade when authedUser transitions from null to non-null.
  useEffect(() => {
    if (prevAuthedUserRef.current === null && authedUser) {
      // User just signed in: LoginScreen → authenticated shell crossfade
      setPostLoginFade(true);
      const timer = setTimeout(() => setPostLoginFade(false), 340);
      return () => clearTimeout(timer);
    }
    prevAuthedUserRef.current = authedUser;
  }, [authedUser]);

  // ── Detect a Google OAuth callback that reached the app but produced no session ──
  // supabase-js only strips `?code=` from the URL after a *successful* PKCE exchange
  // (see GoTrueClient#_getSessionFromURL) and never surfaces the failure through
  // onAuthStateChange, so a failed exchange (e.g. code-verifier lookup miss on a
  // first-time sign-in) silently lands the user back on a blank login form with a
  // stale `code`/`error` param still sitting in the URL. Detect that state, log it
  // for diagnosis, clean the URL, and tell LoginScreen so it can explain what happened.
  useEffect(() => {
    if (!authChecked || authedUser) return;
    const params = new URLSearchParams(window.location.search);
    const hasStaleCode = params.has("code");
    const oauthError = params.get("error_description") || params.get("error");
    if (!hasStaleCode && !oauthError) return;
    console.error("[Auth] Google sign-in callback did not complete:", oauthError || "code exchange failed — no session produced");
    setOauthCallbackFailed(true);
    ["code", "error", "error_description", "error_code"].forEach(k => params.delete(k));
    const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "") + window.location.hash;
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, [authChecked, authedUser]);

  // ── Load from Supabase once auth resolves to a signed-in user ──
  // Depend on authedUser?.id (not the full object) so TOKEN_REFRESHED events — which
  // produce a new user object reference with the same ID — don't re-trigger a load
  // that would overwrite unsaved in-memory edits with stale Supabase data.
  useEffect(() => {
    if (!authedUser) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const applyLoadedData = (data) => {
      // Defense-in-depth alongside the SIGNED_IN dedup guard above: if a debounced
      // save is still pending (an edit made in roughly the last 800ms hasn't been
      // written yet), the DB snapshot this load just read is stale relative to
      // local state for exactly these fields. Applying it anyway would revert the
      // in-progress edit — the fields below are the only ones the debounced save
      // writes, so everything else (isAdmin, subscription, etc.) still applies
      // unconditionally.
      if (!pendingSaveRef.current) {
        setConfig(data.config);
        setShowExtra(data.showExtra);
        setLogs(data.logs);
        setExpenses(data.expenses);
        setGoals(data.goals);
        setWeekConfirmations(data.weekConfirmations ?? {});
        setBaseRateHistory(data.baseRateHistory ?? []);
      }
      setIsEmployerDHL(data.isEmployerDHL);
      setIsAdmin(data.isAdmin);
      setIsTester(data.isTester);
      setBetaCodeUsed(data.betaCodeUsed);
      // Beta usage tracking: log one "login" event per real sign-in, only for the
      // tracked beta cohort (isTrackedBetaTester — is_tester + a beta code, not
      // friends/family testers). Guarded so a data reload later in the same
      // session (checkout return, revival, etc.) doesn't log a second login.
      if (isTrackedBetaTester({ isTester: data.isTester, betaCodeUsed: data.betaCodeUsed })
        && loginLoggedForRef.current !== authedUser?.id) {
        loginLoggedForRef.current = authedUser?.id;
        logBetaEvent({ isTester: data.isTester, betaCodeUsed: data.betaCodeUsed, eventType: "login" });
      }
      setTaxProjectionsEnabled(data.taxProjectionsEnabled);
      setPtoGoal(data.ptoGoal);
      setSubscription(data.subscription);
      if (data.isInvestor) {
        setInvestorProfile(data.investorProfile ?? null);
        setActiveInvestorAccount(data.activeInvestorAccount ?? 1);
      }
      // Investors reach the wizard via account 3 selection — not on login.
      // Guard against the race where onAuthStateChange fires before createInvestorAccount
      // has finished writing investor config — investorSession still non-null at that point.
      if (!data.config.setupComplete && !data.config.isInvestor && !investorSession) setWizardEntry(false);
      setLoading(false);
    };

    // A rejected loadUserData() means a genuine query failure (not a confirmed
    // zero-row account — db.js only resolves defaults for that case), which on
    // a PWA is most often a momentary network blip from resuming after
    // backgrounding. Retry once before giving up, so a cold-start reload isn't
    // left showing a blank/default dashboard over a failure that clears itself
    // a moment later. Never fall back to defaults here — that reintroduces the
    // "existing account mistaken for brand new" bug this retry exists to avoid.
    loadUserData()
      .catch((err) => {
        console.warn("[App] loadUserData failed, retrying once:", err);
        return new Promise((resolve) => setTimeout(resolve, 1500)).then(() => loadUserData());
      })
      .then((data) => {
        if (cancelled) return;
        applyLoadedData(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[App] loadUserData failed after retry:", err);
        setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authedUser?.id, reloadTrigger]);

  // ── Post-checkout return (docs/TODO.md §17.E) ──
  // Stripe redirects back to APP_URL/?checkout=success|cancel. Read it once,
  // then scrub the query param so a later manual reload doesn't re-trigger it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout !== "success" && checkout !== "cancel") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCheckoutReturn(checkout);
    params.delete("checkout");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  // §17.I — revival completes when the post-checkout poll (below) sees the
  // webhook's restore land as an active subscription. Clear the ReviveScreen
  // gate, close any wizard the bare pre-restore row opened (loadUserData saw
  // setupComplete=false before the restore), and force a reload so the
  // restored config/expenses/goals/logs replace the in-memory defaults.
  useEffect(() => {
    if (!revivalInfo || subscription?.status !== "active") return;
    setRevivalInfo(null);
    setWizardEntry(null);
    setReloadTrigger((n) => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revivalInfo, subscription?.status]);

  // On a successful return, the webhook may not have landed yet — poll-refetch
  // subscription_status briefly rather than trusting the redirect alone.
  useEffect(() => {
    if (checkoutReturn !== "success" || !authedUser) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 5;
    const poll = async () => {
      attempts += 1;
      const data = await loadUserData();
      if (cancelled) return;
      setSubscription(data.subscription);
      if (data.subscription?.status === "active" || attempts >= maxAttempts) {
        setCheckoutReturn(null);
        return;
      }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; };
  }, [checkoutReturn, authedUser]);

  // ── Debounced save to Supabase (800ms) ──
  const saveTimer = useRef(null);
  const latestPersistedStateRef = useRef(null);
  // Update synchronously during render (not in a useEffect) so the flush handlers
  // on visibilitychange/pagehide always read the latest state even if the app goes
  // to background before effects have committed.
  latestPersistedStateRef.current = { config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal };
  const pendingSaveRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    clearTimeout(saveTimer.current);
    pendingSaveRef.current = true;
    saveTimer.current = setTimeout(() => {
      pendingSaveRef.current = false;
      saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal });
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal, loading]);

  // ── Config history write path (TODO §19 phase 1) ──
  // Watches every config transition rather than wrapping individual save calls,
  // so no whitelisted change can bypass capture regardless of which setConfig
  // site or save path (immediate vs. debounced) it flows through. Attributed
  // flows (wizard, life events, profile saves) tag source/effectiveFrom via
  // configHistoryMetaRef just before their setConfig; untagged changes record
  // as plain "config_edit" effective today. effectiveFrom uses real wall-clock
  // time, never the admin Lock Date simulation (same rule as §17 entitlement).
  const prevConfigRef = useRef(null);
  const configHistoryMetaRef = useRef(null); // { source, effectiveFrom } | null
  useEffect(() => {
    if (loading) { prevConfigRef.current = null; return; }
    const prev = prevConfigRef.current;
    prevConfigRef.current = config;
    const meta = configHistoryMetaRef.current;
    configHistoryMetaRef.current = null;
    if (!prev || prev === config) return; // first run after load primes the ref only
    if (config.isInvestor) return; // investor sandboxes are exempt, matching §17.G
    const changedFields = diffSensitiveFields(prev, config);
    if (changedFields.length === 0) return;
    const effectiveFrom = meta?.effectiveFrom ?? toLocalIso(new Date());
    saveConfigSnapshot({
      config,
      changedFields,
      source: meta?.source ?? "config_edit",
      effectiveFrom,
    });
    // Optimistic local append (TODO §15.D / §19 narrow slice) — the DB insert above
    // is fire-and-forget, so without this the just-made change wouldn't affect
    // buildYear()'s point-in-time resolution until the next full reload. Matters
    // most for a future-dated effective date: without the local entry, weeks
    // between today and that future date would incorrectly fall back to the new
    // live baseRate instead of holding the old one until the chosen date arrives.
    if (changedFields.includes("baseRate")) {
      setBaseRateHistory(prev => [...prev, { effectiveFrom, baseRate: config.baseRate }]);
    }
  }, [config, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const flushPendingSave = () => {
      if (loading || !pendingSaveRef.current) return;
      pendingSaveRef.current = false;
      clearTimeout(saveTimer.current);
      // keepalive save (not the normal saveUserData) — a plain fetch is liable
      // to be aborted mid-flight the instant the page actually unloads or a
      // backgrounded mobile tab gets reclaimed, silently dropping whatever
      // hadn't saved yet. See flushUserDataKeepalive's doc comment in db.js.
      flushUserDataKeepalive(latestPersistedStateRef.current);
    };

    const onBeforeUnload = () => flushPendingSave();
    const onPageHide = () => flushPendingSave();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingSave();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loading]);

  // ── Eager save — for actions that represent a completed unit of work
  // (wizard completion, weekly check-in confirmation, profile edits) rather
  // than an in-progress edit, so they don't sit exposed in the 800ms debounce
  // window where a backgrounded/reclaimed mobile tab can lose them.
  // `overrides` is a partial patch (e.g. { config: newConfig } or
  // { weekConfirmations: next, logs: newLogs }) merged onto the latest known
  // full state (latestPersistedStateRef, kept current every render) so the
  // write is always a complete, consistent row — same shape the debounce
  // itself writes, just not waiting 800ms to do it.
  // [saveError]: the real Supabase error message (not a generic guess),
  // surfaced via SaveFailedBanner so a failed "guaranteed" save isn't
  // silently invisible — this promise is stronger than the ambient
  // debounce's, so a failure here needs to be user-visible, unlike the
  // debounce's console-only failure handling. null = no failure currently shown.
  const [saveError, setSaveError] = useState(null);
  const saveRetryTimerRef = useRef(null);
  const lastFailedOverridesRef = useRef(null);

  const attemptSave = useCallback((overrides) => {
    const nextState = { ...latestPersistedStateRef.current, ...overrides };
    latestPersistedStateRef.current = nextState;
    return saveUserData(nextState).then(({ ok, message }) => {
      setSaveError(ok ? null : (message || "Unknown error"));
      lastFailedOverridesRef.current = ok ? null : overrides;
      return ok;
    });
  }, []);

  // Called with the already-computed new value(s) so we don't rely on React
  // having flushed the paired setState yet. `historySource` mirrors the
  // config-history attribution saveConfigNow always did — ??= keeps a more
  // specific tag (wizard/life event) a caller may have already set.
  const savePersistedStateNow = useCallback((overrides, historySource) => {
    if (historySource) configHistoryMetaRef.current ??= { source: historySource };
    clearTimeout(saveTimer.current);
    clearTimeout(saveRetryTimerRef.current);
    pendingSaveRef.current = false;
    attemptSave(overrides).then((ok) => {
      if (!ok) saveRetryTimerRef.current = setTimeout(() => attemptSave(overrides), 3000);
    });
  }, [attemptSave]);

  const retryFailedSave = useCallback(() => {
    if (!lastFailedOverridesRef.current) return;
    clearTimeout(saveRetryTimerRef.current);
    attemptSave(lastFailedOverridesRef.current);
  }, [attemptSave]);

  // Dismiss just hides the banner — it does NOT drop the unsaved data. The
  // edit already landed in React state (and latestPersistedStateRef) before
  // the failed save fired, so the very next debounced autosave cycle (any
  // subsequent state change) will naturally re-attempt persisting the same
  // value. Re-shows automatically the next time any eager save fails.
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  useEffect(() => () => clearTimeout(saveRetryTimerRef.current), []);

  // Kept as its own name (many ProfilePanel call sites already use it) —
  // now a thin wrapper over the general eager-save helper above.
  const saveConfigNow = useCallback((newConfig) => {
    savePersistedStateNow({ config: newConfig }, "profile_edit");
  }, [savePersistedStateNow]);

  const handleForcePush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    pendingSaveRef.current = false;
    setSyncStatus({ op: "push", pending: true });
    try {
      await saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal });
      setSyncStatus({ op: "push", ok: true, ts: new Date() });
    } catch {
      setSyncStatus({ op: "push", ok: false });
    }
    setTimeout(() => setSyncStatus(null), 4000);
  }, [config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal]);

  const handleForcePull = useCallback(async () => {
    setSyncStatus({ op: "pull", pending: true });
    try {
      const data = await loadUserData();
      // §19: a pull re-adopts what the DB already holds — if it diffs against
      // in-memory state (drift), attribute the snapshot honestly, not as an edit.
      configHistoryMetaRef.current = { source: "force_pull" };
      setConfig(data.config);
      setShowExtra(data.showExtra);
      setLogs(data.logs);
      setExpenses(data.expenses);
      setGoals(data.goals);
      setWeekConfirmations(data.weekConfirmations ?? {});
      setBaseRateHistory(data.baseRateHistory ?? []);
      setPtoGoal(data.ptoGoal);
      setSyncStatus({ op: "pull", ok: true, ts: new Date() });
    } catch {
      setSyncStatus({ op: "pull", ok: false });
    }
    setTimeout(() => setSyncStatus(null), 4000);
  }, [setConfig, setShowExtra, setLogs, setExpenses, setGoals, setWeekConfirmations, setBaseRateHistory, setPtoGoal]);

  // docs/TODO.md — until now api/admin-beta-report.js was only reachable via a
  // manually-crafted authenticated HTTP request (curl/Postman); this is the
  // in-app trigger. Fetches with the current admin session's token rather than
  // a plain link, since the endpoint requires a Bearer token and window.open
  // can't set custom headers — Blob + a throwaway <a> is the standard pattern
  // for triggering a download from a fetch response.
  const [betaReportStatus, setBetaReportStatus] = useState(null); // { loading, error } | null
  const handleDownloadBetaReport = useCallback(async (format) => {
    setBetaReportStatus({ loading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not signed in");
      const url = format === "feedback" ? "/api/admin-beta-report?format=feedback" : "/api/admin-beta-report";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = format === "feedback" ? "beta-feedback.csv" : "beta-usage-report.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setBetaReportStatus({ loading: false, error: null });
    } catch (err) {
      setBetaReportStatus({ loading: false, error: err.message });
    }
  }, []);

  const handleFetchRow = useCallback(async () => {
    setRowFetching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("user_data")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setRowData(error ? { __error: error.message } : data);
      setHistoryMeta(await fetchConfigHistoryMeta()); // §19 snapshot count + latest
    } catch (e) {
      setRowData({ __error: e.message });
    }
    setRowFetching(false);
  }, []);

  const handleLocalSignOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  // ── today: reactive date string — ticks at midnight so everything auto-advances ──
  const [today, setToday] = useState(() => toLocalIso(new Date()));
  useEffect(() => {
    const scheduleNextTick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight - now;
      return setTimeout(() => {
        setToday(toLocalIso(new Date()));
        timerId.current = scheduleNextTick();
      }, msUntilMidnight);
    };
    const timerId = { current: scheduleNextTick() };
    return () => clearTimeout(timerId.current);
  }, []);

  useEffect(() => {
    if (tempLockDate) localStorage.setItem("admin_temp_lock_date", tempLockDate);
    else localStorage.removeItem("admin_temp_lock_date");
  }, [tempLockDate]);

  const effectiveToday = useMemo(
    () => (isAdmin && tempLockDate) ? tempLockDate : today,
    [isAdmin, tempLockDate, today]
  );

  // Trial/subscription gate (docs/TODO.md §17.D/E). `now` is always the real
  // wall-clock time, never effectiveToday/tempLockDate — see the disclosure
  // note in lib/subscription.js: admin Lock Date must not extend a trial or
  // the hidden grace window. Computed here (rather than nearer isExpiredReadOnly
  // below) so effectiveBottomNav's canAccessAskCoachGeneral check can read it too.
  const entitlement = getEntitlement(subscription, new Date());

  const effectiveBottomNav = useMemo(() => {
    // TODO §15 nav restructuring — Income and Log both assume an active pay
    // structure (projected income, per-paycheck event log) that a Job Loss
    // Mode account doesn't have. Drop to Home/Budget/Account so nothing in the
    // nav points at a screen that's misleading or meaningless right now.
    const items = config.jobLossMode
      ? BOTTOM_NAV.filter(i => i.key === "home" || i.key === "budget" || i.key === "profile")
      : [...BOTTOM_NAV];
    // Ask Coach general chat left the admin/tester-only standing constraint
    // (docs/coach-entry-points.md §1) — now also opens for a real trial/paid
    // entitlement, not just isAdmin/isTester. Every OTHER Coach surface stays
    // on canAccessAiFeatures (docs/TODO.md §18.0 build order).
    if (canAccessAskCoachGeneral({ isAdmin, isTester, entitlement })) {
      items.push({
        key: "__coach__",
        label: "Coach",
        icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM7 9h10v2H7V9zm6 5H7v-2h6v2zm4-6H7V6h10v2z"/>
          </svg>
        ),
      });
    }
    if (isAdmin) {
      items.push({
        key: "__tools__",
        label: "Tools",
        icon: (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
          </svg>
        ),
      });
    }
    return items;
  }, [isAdmin, isTester, entitlement.isEntitled, config.jobLossMode]);

  // Desktop sidebar counterpart to effectiveBottomNav's Job Loss Mode trim —
  // same Income/Log exclusion, kept as a separate memo since NAV_ITEMS (unlike
  // BOTTOM_NAV) never includes "home" as one of its entries.
  const effectiveNavItems = useMemo(() => (
    config.jobLossMode ? NAV_ITEMS.filter(i => i.key === "budget" || i.key === "profile") : NAV_ITEMS
  ), [config.jobLossMode]);

  // Diff between in-memory state and what the last fetched DB row contains.
  // Returns array of column names where values diverge.
  const rowDiff = useMemo(() => {
    if (!rowData || rowData.__error) return [];
    const pairs = [
      ["config", JSON.stringify(config), JSON.stringify(rowData.config)],
      ["expenses", JSON.stringify(expenses), JSON.stringify(rowData.expenses)],
      ["goals", JSON.stringify(goals), JSON.stringify(rowData.goals)],
      ["logs", JSON.stringify(logs), JSON.stringify(rowData.logs)],
      ["show_extra", String(showExtra), String(rowData.show_extra)],
      ["week_confirmations", JSON.stringify(weekConfirmations), JSON.stringify(rowData.week_confirmations)],
      ["pto_goal", String(ptoGoal ?? ""), String(rowData.pto_goal ?? "")],
    ];
    return pairs.filter(([, a, b]) => a !== b).map(([col]) => col);
  }, [rowData, config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal]);

  // §19.F verification surface — one line summarizing account_history capture,
  // shown in every DB Row viewer block alongside updated_at/drift.
  const historyLine = useMemo(() => {
    if (!historyMeta) return null;
    if (historyMeta.error) return `config history: unavailable (${historyMeta.error})`;
    const { count, latest } = historyMeta;
    if (!count) return "config history: 0 snapshots";
    const src = latest?.source ? ` (${latest.source})` : "";
    const fields = latest?.changed_fields?.length ? ` · ${latest.changed_fields.join(", ")}` : "";
    return `config history: ${count} snapshot${count === 1 ? "" : "s"} · latest ${latest?.effective_from ?? "?"}${src}${fields}`;
  }, [historyMeta]);

  // ── Build year reactively from config ──
  const allWeeks = useMemo(() => buildYear(config, baseRateHistory), [config, baseRateHistory]);

  // ── Pay period past check ──
  // Determines whether a week's pay period has closed, gating the confirmation modal
  // and badge count. Uses payPeriodEndDate (the day within the fiscal week matching
  // config.payPeriodEndDay) rather than weekEnd (always Monday) so the trigger fires
  // on the correct day of the week.
  //
  // Base users: fires at 12:01 AM the day after payPeriodEndDay (pure date comparison).
  // DHL: pays through Sunday but the overnight shift runs until Mon 6:00 AM, so the
  //   trigger is gated to Monday 6:01 AM. Admin date-lock bypasses the hour gate so
  //   manual testing works regardless of the wall-clock time.
  const isPayPeriodPast = useCallback((week) => {
    const isEmployerDHL = config.employerPreset === "DHL";
    const payPeriodEndIso = toLocalIso(week.payPeriodEndDate);
    if (isEmployerDHL) {
      const triggerDate = new Date(week.payPeriodEndDate);
      triggerDate.setDate(triggerDate.getDate() + 1); // Sunday → Monday
      const triggerIso = toLocalIso(triggerDate);
      if (effectiveToday < triggerIso) return false;
      if (effectiveToday === triggerIso && !(isAdmin && tempLockDate)) {
        return new Date().getHours() >= 6;
      }
      return true;
    }
    // Base user: any time after midnight following payPeriodEndDay.
    return payPeriodEndIso < effectiveToday;
  }, [config.employerPreset, effectiveToday, isAdmin, tempLockDate]);

  // Weeks before this fiscal idx are auto-assumed worked and never prompt the
  // confirm modal; only weeks from account creation onward are confirmable.
  // null (legacy accounts predating the stamp) = no floor → prior behavior.
  const accountCreatedIdx = config.accountCreatedIdx ?? null;

  // ── Auto-confirm pre-account-creation weeks on first load when no confirmations exist ──
  // Treats every week before account creation as fully worked (clean/net-zero). Over-assumption
  // is fine: income projections already assume full attendance from the job start date.
  // Weeks from account creation onward are left for the user to confirm.
  // Runs once — after auto-confirm, weekConfirmations is non-empty so condition exits early.
  // NOTE: must be declared after today and allWeeks to avoid TDZ errors in the dep array.
  useEffect(() => {
    if (loading) return;
    if (Object.keys(weekConfirmations).length > 0) return;
    const pastActiveWeeks = allWeeks.filter(w =>
      w.active && isPayPeriodPast(w) && (accountCreatedIdx == null || w.idx < accountCreatedIdx)
    );
    if (!pastActiveWeeks.length) return;
    const DAY_NAMES_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const confirmedAt = new Date().toISOString();
    const bulk = {};
    for (const week of pastActiveWeeks) {
      const scheduledDays = week.workedDayNames ?? [];
      bulk[week.idx] = {
        confirmedAt,
        dayToggles: Object.fromEntries(DAY_NAMES_ORDER.map(d => [d, scheduledDays.includes(d) ? true : null])),
        scheduledDays,
        missedScheduledDays: [],
        pickupDays: [],
        netShiftDelta: 0,
        eventId: null,
        autoConfirmed: true,
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekConfirmations(bulk);
  }, [loading, weekConfirmations, allWeeks, effectiveToday, isPayPeriodPast, accountCreatedIdx]);

  // ── Future active weeks: today onward, used for spend/goal simulation ──
  const futureWeeks = useMemo(() => {
    return allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) >= effectiveToday);
  }, [allWeeks, effectiveToday]);

  // ── Current week: first active week whose end date >= today ──
  const currentWeek = useMemo(() => getCurrentFiscalWeek(allWeeks, effectiveToday), [allWeeks, effectiveToday]);

  // confirmDismissed: session-only flag; set when user clicks "Skip for now".
  // Cleared by badge click so the modal re-opens. Resets to false on page reload.
  const [confirmDismissed, setConfirmDismissed] = useState(false);

  // ── Pay weeks eligible for the confirm modal ──
  // Closed-pay-period pay weeks from account creation onward. isPayWeek is set in
  // buildYear: all active weeks for weekly, every-other for biweekly/salary
  // (driven by biweeklyPayWeekParity), last-of-month for monthly.
  const eligiblePastPayWeeks = useMemo(() =>
    allWeeks.filter(w =>
      w.active && w.isPayWeek && isPayPeriodPast(w) && (accountCreatedIdx == null || w.idx >= accountCreatedIdx)
    ),
    [allWeeks, effectiveToday, isPayPeriodPast, accountCreatedIdx]
  );

  // ── Week confirmation modal trigger ──
  // Surfaces the most-recent UNCONFIRMED eligible pay week.
  const confirmTriggerWeek = useMemo(() => {
    const unconfirmed = eligiblePastPayWeeks.filter(w => !weekConfirmations[w.idx]);
    return unconfirmed.length ? unconfirmed[unconfirmed.length - 1] : null;
  }, [eligiblePastPayWeeks, weekConfirmations]);

  // Total count of all eligible pay weeks lacking a confirmation record.
  // Badge accumulates across all skipped pay weeks until they are addressed.
  const unconfirmedCount = useMemo(() =>
    eligiblePastPayWeeks.filter(w => !weekConfirmations[w.idx]).length,
    [eligiblePastPayWeeks, weekConfirmations]
  );

  // ── Admin: most-recent CONFIRMED eligible pay week (null when none) ──
  // The "Reopen Last Check-In" tool targets this week so admins can re-review
  // the weekly confirm modal on demand.
  const reopenableWeekIdx = useMemo(() => {
    const confirmed = eligiblePastPayWeeks.filter(w => weekConfirmations[w.idx]);
    return confirmed.length ? confirmed[confirmed.length - 1].idx : null;
  }, [eligiblePastPayWeeks, weekConfirmations]);

  // Resets the most-recent confirmed pay period so its weekly confirm modal
  // reopens as if it was never finished. Drops the confirmation record and any
  // log entry it created — income projections are independent of confirmations,
  // so the model is unaffected. Admin-only diagnostic.
  const handleReopenLastCheckIn = useCallback(() => {
    if (reopenableWeekIdx == null) return;
    const record = weekConfirmations[reopenableWeekIdx];
    const nextLogs = record?.eventId != null ? logs.filter(l => l.id !== record.eventId) : logs;
    const nextWeekConfirmations = { ...weekConfirmations };
    delete nextWeekConfirmations[reopenableWeekIdx];
    setLogs(nextLogs);
    setWeekConfirmations(nextWeekConfirmations);
    savePersistedStateNow({ weekConfirmations: nextWeekConfirmations, logs: nextLogs });
    setConfirmDismissed(false);  // ensure the modal pops back open
    setToolSheetOpen(false);     // close the admin sheet so the modal is visible
  }, [reopenableWeekIdx, weekConfirmations, logs, savePersistedStateNow]);

  // ── Fiscal week stamp: raw idx out of 52 (standard calendar year = 52 paychecks) ──
  const currentWeekNumber = useMemo(() => getFiscalWeekInfo(currentWeek), [currentWeek]);
  const currentWeekLabel = formatPayPeriodLabel(currentWeekNumber, PAYCHECKS_PER_YEAR[config.userPaySchedule ?? "weekly"] ?? 52);

  // ── Event impact summary (single source for adjusted income math) ──
  const eventImpact = useMemo(() => {
    const futureWeekCount = futureWeeks.length || 1;
    const weeklyNetAdjustments = {};
    const futureEventDeductionsByWeek = {};
    let nL = 0, nG = 0, k4L = 0, k4ML = 0, k4G = 0, k4MG = 0, ptoL = 0, bucket = 0, missedEventDayNetLost = 0;
    const grossDeltaByWeek = {};

    logs.forEach(e => {
      const { weekIdx: eIdx, weekMeta } = resolveEventWeekMeta(e, allWeeks);
      const i = calcEventImpact(e, config, weekMeta);
      nL += i.netLost; nG += i.netGained;
      if ((e.type === "missed_unpaid" || e.type === "missed_unapproved") && i.netLost) {
        missedEventDayNetLost += i.netLost;
      }
      k4L += i.k401kLost; k4ML += i.k401kMatchLost;
      k4G += i.k401kGained; k4MG += i.k401kMatchGained;
      ptoL += i.hoursLostForPTO; bucket += i.bucketHoursDeducted;

      if (eIdx == null) return;
      const netDelta = (i.netGained || 0) - (i.netLost || 0);
      if (netDelta !== 0) weeklyNetAdjustments[eIdx] = (weeklyNetAdjustments[eIdx] || 0) + netDelta;
      const grossDelta = (i.grossGained || 0) - (i.grossLost || 0);
      if (grossDelta !== 0) grossDeltaByWeek[eIdx] = (grossDeltaByWeek[eIdx] || 0) + grossDelta;

      const weekEndIso = typeof e.weekEnd === "string" ? e.weekEnd : (e.weekEnd ? toLocalIso(e.weekEnd) : null);
      if (weekEndIso && isFutureWeek(weekEndIso, effectiveToday) && i.netLost) {
        futureEventDeductionsByWeek[eIdx] = (futureEventDeductionsByWeek[eIdx] || 0) + i.netLost;
      }
    });

    const totalNetAdjustment = Object.values(weeklyNetAdjustments).reduce((s, v) => s + v, 0);
    return {
      netLost: nL, netGained: nG,
      missedEventDayNetLost,
      k401kLost: k4L, k401kMatchLost: k4ML,
      k401kGained: k4G, k401kMatchGained: k4MG,
      ptoHoursLost: ptoL, bucketHours: bucket,
      totalNetAdjustment,
      adjustedWeeklyDelta: totalNetAdjustment / futureWeekCount,
      weeklyNetAdjustments,
      futureEventDeductionsByWeek,
      grossDeltaByWeek,
    };
  }, [logs, config, futureWeeks, effectiveToday, allWeeks]);

  // ── Tax derived values ──
  const taxDerived = useMemo(() => {
    const activeWeeks = allWeeks.filter(w => w.active);
    const overrides = config.pastWeekTaxStatusOverrides ?? {};
    const hasOverride = (idx) => Object.prototype.hasOwnProperty.call(overrides, idx);
    const remediationTaxedForWeek = (w) => {
      const isPast = toLocalIso(w.weekEnd) < effectiveToday;
      if (!isPast) return w.taxedBySchedule;
      return hasOverride(w.idx) ? Boolean(overrides[w.idx]) : w.taxedBySchedule;
    };
    const adjustedTaxableGrossByWeek = new Map(
      activeWeeks.map(w => [w.idx, Math.max((w.taxableGross ?? 0) + (eventImpact.grossDeltaByWeek[w.idx] || 0), 0)])
    );
    const tt = activeWeeks.reduce((s, w) => s + (adjustedTaxableGrossByWeek.get(w.idx) ?? 0), 0);
    const fAGI = Math.max(tt - config.fedStdDeduction, 0);
    const fL = fedTax(fAGI);
    // State liability: config-driven via STATE_TAX_TABLE; falls back to moFlatRate for old rows.
    const stateConfig = getStateConfig(config.userState);
    const mL = stateConfig ? stateTax(tt, stateConfig) : tt * (config.moFlatRate ?? 0.047);
    const ficaT = activeWeeks.reduce((s, w) => s + Math.max((w.grossPay ?? 0) + (eventImpact.grossDeltaByWeek[w.idx] || 0), 0) * config.ficaRate, 0);
    const fedLow  = config.fedRateLow   ?? config.w1FedRate;
    const fedHigh = config.fedRateHigh  ?? config.w2FedRate;
    const stLow   = config.stateRateLow  ?? config.w1StateRate;
    const stHigh  = config.stateRateHigh ?? config.w2StateRate;
    const fWB = activeWeeks.filter(remediationTaxedForWeek).reduce((s, w) => s + (adjustedTaxableGrossByWeek.get(w.idx) ?? 0) * (w.isHighWeek ? fedHigh : fedLow), 0);
    const mWB = activeWeeks.filter(remediationTaxedForWeek).reduce((s, w) => s + (adjustedTaxableGrossByWeek.get(w.idx) ?? 0) * (w.isHighWeek ? stHigh : stLow), 0);
    const fG = fL - fWB, mG = mL - mWB, tG = fG + mG, tET = Math.max(tG - config.targetOwedAtFiling, 0);
    const remainingTaxedChecks = activeWeeks.filter(w => toLocalIso(w.weekEnd) >= effectiveToday && w.taxedBySchedule).length;

    // How much events have shifted total taxable gross (+ = bonus/pickup, - = missed shifts)
    const eventGrossDelta = activeWeeks.reduce((s, w) => s + (eventImpact.grossDeltaByWeek[w.idx] || 0), 0);
    // Baseline AGI with no events to show the event-driven tax shift
    const baseAGI = Math.max(tt - eventGrossDelta - config.fedStdDeduction, 0);
    const fedLiabilityBase = fedTax(baseAGI);
    const moLiabilityBase = stateConfig ? stateTax(tt - eventGrossDelta, stateConfig) : (tt - eventGrossDelta) * (config.moFlatRate ?? 0.047);
    const fedLiabilityEventDelta = fL - fedLiabilityBase;
    const moLiabilityEventDelta  = mL - moLiabilityBase;

    return {
      fedAGI: fAGI, fedLiability: fL, moLiability: mL, ficaTotal: ficaT,
      fedWithheldBase: fWB, moWithheldBase: mWB,
      fedGap: fG, moGap: mG, totalGap: tG, targetExtraTotal: tET,
      taxedWeekCount: remainingTaxedChecks,
      extraPerCheck: remainingTaxedChecks > 0 ? tET / remainingTaxedChecks : 0,
      // Event pipeline visibility fields
      eventGrossDelta,
      fedLiabilityEventDelta,
      moLiabilityEventDelta,
    };
  }, [allWeeks, config, eventImpact.grossDeltaByWeek, effectiveToday]);

  // ── Live projected net from income engine ──
  const projectedAnnualNet = useMemo(() =>
    allWeeks.filter(w => w.active).reduce((s, w) => s + computeNet(w, config, taxDerived.extraPerCheck, showExtra), 0)
    , [allWeeks, config, taxDerived, showExtra]);

  // ─── Pay schedule factor ─────────────────────────────────────────────────────
  // checksPerYear: how many paychecks the user receives per year (52 weekly,
  // 26 biweekly/salary, 12 monthly). Used to scale per-paycheck amounts to the
  // weekly basis that all internal math runs on, and to scale weekly amounts back
  // to per-paycheck for display.
  const checksPerYear = PAYCHECKS_PER_YEAR[config.userPaySchedule ?? "weekly"] ?? 52;

  // ─── Paycheck Buffer ─────────────────────────────────────────────────────────
  // paycheckBuffer is stored as $/check. Convert to $/week by multiplying by the
  // paycheck frequency ratio (checksPerYear/52), so the weekly deduction is the
  // correct time-averaged amount regardless of pay schedule:
  //   weekly  → $50/check × 52/52 = $50/week
  //   biweekly/salary → $50/check × 26/52 = $25/week
  //   monthly → $50/check × 12/52 ≈ $11.54/week
  // projectedAnnualNet (above) is intentionally untouched — the Income panel uses
  // it to display real earned income, not the spendable portion.
  const bufferPerWeek = (config.bufferEnabled ?? true)
    ? (config.paycheckBuffer ?? 50) * (checksPerYear / 52)
    : 0;
  // weeklyIncome is meant to read as "what a typical active week nets you" —
  // dividing by a flat 52 instead of the weeks actually active this fiscal
  // year silently diluted it by every inactive week before firstActiveIdx.
  // For a brand-new or just-reactivated (Back to Work) account that's most
  // of the year, so the "typical week" figure came out a fraction of a real
  // paycheck (TODO §15 Job Loss Mode investigation, 2026-07-19). For a
  // full-year account (firstActiveIdx 0) this is byte-identical to /52.
  const activeWeeksThisYear = resolveActiveWeeksThisYear(config.firstActiveIdx);
  const weeklyIncome = (activeWeeksThisYear > 0 ? projectedAnnualNet / activeWeeksThisYear : 0) - bufferPerWeek;

  // ── Previous week's actual paycheck (what you'll receive this payday) ──
  // Shows the specific prior week's computeNet (high vs low week), not an annual
  // average. Adjusted for any event log entries confirmed for that week
  // (e.g. missed shifts logged via WeekConfirmModal). Falls back to the current
  // active week's real net (not the diluted weeklyIncome average) when there's
  // no past active week yet — see resolvePrevWeekNet's doc comment.
  const prevWeekNet = useMemo(() => resolvePrevWeekNet({
    allWeeks, todayIso: effectiveToday, config, extraPerCheck: taxDerived.extraPerCheck,
    showExtra, bufferPerWeek, weeklyIncome, logs, currentWeek,
  }), [allWeeks, effectiveToday, config, taxDerived, showExtra, bufferPerWeek, weeklyIncome, logs, currentWeek]);

  const weekNetLookup = useMemo(() => {
    const adjustments = eventImpact.weeklyNetAdjustments || {};
    const result = {};
    allWeeks.forEach(w => {
      const baseNet = computeNet(w, config, taxDerived.extraPerCheck, showExtra);
      const spendable = baseNet - bufferPerWeek;
      const adjustment = adjustments[w.idx] || 0;
      result[w.idx] = {
        baseNet,
        adjustedNet: baseNet + adjustment,
        spendable,
        adjustedSpendable: spendable + adjustment,
        adjustment,
      };
    });
    return result;
  }, [allWeeks, config, taxDerived.extraPerCheck, showExtra, bufferPerWeek, eventImpact.weeklyNetAdjustments]);

  const futureWeekNetsRaw = useMemo(
    () => futureWeeks.map(w => weekNetLookup[w.idx]?.spendable ?? (computeNet(w, config, taxDerived.extraPerCheck, showExtra) - bufferPerWeek)),
    [futureWeeks, weekNetLookup, config, taxDerived, showExtra, bufferPerWeek]
  );

  const futureWeekNets = useMemo(
    () => futureWeeks.map((w, idx) => weekNetLookup[w.idx]?.adjustedSpendable ?? futureWeekNetsRaw[idx] ?? 0),
    [futureWeeks, weekNetLookup, futureWeekNetsRaw]
  );

  // ── Job Loss Mode expense triage (TODO §15.C3) ──
  // Paused/cancelled expenses drop out of forward projections while jobLossMode
  // is active. Missing jobLossStatus is treated as "active" so existing rows
  // need no migration.
  const projectableExpenses = useMemo(() => {
    if (!config.jobLossMode) return expenses;
    return expenses.filter(exp => (exp.jobLossStatus ?? "active") === "active");
  }, [expenses, config.jobLossMode]);

  // ── Week-by-week remaining spend using history-aware amounts ──
  const remainingSpend = useMemo(() => computeRemainingSpend(projectableExpenses, futureWeeks), [projectableExpenses, futureWeeks]);
  const fundedGoalSpend = useMemo(() => getFundedGoalSpend(goals, effectiveToday), [goals, effectiveToday]);
  const baseWeeklyUnallocated = weeklyIncome - remainingSpend.avgWeeklySpend;

  // Real runway for Ask Coach (drift-app-warden §21 quarantine-2 fix) — was
  // never wired at all before, so a Job Loss Mode user asking Coach about
  // runway got a bare "Job Loss Mode: active" with no number. Same
  // computeJobLossRunway()/resolvePrimaryRunwayDays() pair CoachNetWorthCard
  // now uses, and the real (not defaulted) jobLossIncludeBenefits toggle, so
  // Ask Coach agrees with whatever the Job Loss panels are showing.
  const coachRunwayDays = useMemo(() => {
    if (!config.jobLossMode) return null;
    const savings = (config.jobLossCashOnHand ?? 0) + sumJobHuntIncome(config);
    const dash = computeJobLossRunway({ config, expenses, effectiveToday, savings });
    return resolvePrimaryRunwayDays(dash, config, jobLossIncludeBenefits);
  }, [config, expenses, effectiveToday, jobLossIncludeBenefits]);

  // ── Event log cascade ──
  const logTotals = useMemo(() => ({
    netLost: eventImpact.netLost,
    netGained: eventImpact.netGained,
    missedEventDayNetLost: eventImpact.missedEventDayNetLost,
    k401kLost: eventImpact.k401kLost,
    k401kMatchLost: eventImpact.k401kMatchLost,
    k401kGained: eventImpact.k401kGained,
    k401kMatchGained: eventImpact.k401kMatchGained,
    ptoHoursLost: eventImpact.ptoHoursLost,
    bucketHours: eventImpact.bucketHours,
    adjustedTakeHome: projectedAnnualNet + eventImpact.totalNetAdjustment - fundedGoalSpend,
    adjustedWeeklyAvg: baseWeeklyUnallocated + eventImpact.adjustedWeeklyDelta
  }), [eventImpact, projectedAnnualNet, baseWeeklyUnallocated, fundedGoalSpend]);

  // ── Attendance bucket model — DHL preset only ──
  // computeBucketModel encodes DHL's specific tier system and overflow payout mechanic.
  // Base user users may have attendanceBucketEnabled=true but get no bucket model;
  // their attendance tracking is handled separately without payout math.
  const bucketModel = useMemo(() => isEmployerDHL ? computeBucketModel(logs, config) : null, [isEmployerDHL, logs, config]);

  // ── Per-week targeted deductions for current/future-week events ──────────────────
  // Shape: { [weekIdx: number]: netLost (dollars) }
  //
  // WHY TWO PATHS EXIST:
  //   Past events (weekEnd < today) → smeared evenly across remaining weeks via
  //   logNetLost in computeGoalTimeline. The money is already gone; a uniform
  //   budget reduction across the rest of the year is the right model.
  //
  //   Current/future events (weekEnd >= today) → land on their specific week in the
  //   goals loop so the timeline shows the actual dip at the right week rather than
  //   hiding it in a per-week average.
  //
  // HOW IT'S BUILT:
  //   eventImpact memo is the single source of truth for week-aware event deltas;
  //   this map is forwarded directly so goals math and budget math stay in sync.
  //
  // REUSE:
  //   Any feature that needs to know "how much net pay is lost on a specific future
  //   week due to logged events" can read this map directly — e.g. a cash-flow
  //   waterfall chart, a per-week surplus sparkline, or a "next paycheck" estimate
  //   that accounts for already-logged partial shifts.
  // ─────────────────────────────────────────────────────────────────────────────────
  const futureEventDeductions = eventImpact.futureEventDeductionsByWeek;

  // ─────────────────────────────────────────────────────────────────────────────
  // SetupWizard exit animation — triggers fold-lift exit, waits 180ms, then unmounts
  // ─────────────────────────────────────────────────────────────────────────────
  function closeWizardWithAnimation() {
    setWizardExiting(true);
    setTimeout(() => {
      setWizardEntry(null);
      setWizardExiting(false);
    }, 180);
  }

  function handleWizardComplete(mergedConfig) {
    // §19: wizard flows are the one path that passes an explicit effective date
    // (the job start / change date anchor); plain edits default to today.
    configHistoryMetaRef.current = {
      source: wizardEntry === false ? "setup_wizard" : `life_event:${wizardEntry}`,
      effectiveFrom: mergedConfig.startDate ?? undefined,
    };
    // §15.H4: Back to Work's structure_change flow is how a jobless-started user
    // first fills in real pay structure. Clear the flag on success so future Life
    // Events (and the §15.H5 banner copy) stop treating this as a no-prior-history
    // account — otherwise a later job loss would incorrectly show the "no prior pay
    // history" banner even though real pay data exists now.
    const finalConfig = (wizardEntry === "structure_change" && mergedConfig.startedUnemployed === true)
      ? { ...mergedConfig, startedUnemployed: false }
      : mergedConfig;
    setConfig(finalConfig);
    closeWizardWithAnimation();
    // §15.H3: a first-run signup that ended in Job Loss Mode skipped the Deductions/
    // Tax steps entirely and has no real income yet — defer the pinned Food default
    // to the user's first expense-triage pass instead of seeding it unseen. Passed
    // into the save overrides directly (not a separate setExpenses call) so the
    // eager save below doesn't race React's not-yet-flushed state — same pattern
    // savePersistedStateNow's own doc comment calls out.
    const skipFoodSeed = wizardEntry === false && finalConfig.jobLossMode === true;
    if (skipFoodSeed) setExpenses([]);
    // §15.H4: the reverse of the skip above — Back to Work is exactly when a
    // jobless-started account gets real income again, so the mandatory Food
    // expense (the only real mandatory expense that exists today — §25's planned
    // Rent expense isn't built yet) needs to come back. ensureInitialFoodExpense
    // is a no-op if the user already has one (e.g. added manually via Triage).
    const restoredExpenses = (wizardEntry === "structure_change" && mergedConfig.startedUnemployed === true)
      ? ensureInitialFoodExpense(expenses)
      : null;
    if (restoredExpenses) setExpenses(restoredExpenses);
    // Eager save — a completed wizard run is the single most expensive thing
    // to lose to a backgrounded/reclaimed mobile tab; don't leave it sitting
    // in the 800ms debounce window. configHistoryMetaRef is already set above.
    savePersistedStateNow({
      config: finalConfig,
      ...(skipFoodSeed ? { expenses: [] } : {}),
      ...(restoredExpenses ? { expenses: restoredExpenses } : {}),
    });
  }

  // TODO §15 nav/panel restructuring — shared by the Job Loss banner's "Back to
  // Work" button and the new Account panel entry point (setup wizard rewrite,
  // 2026-07-18), so there's exactly one place that resets the job-loss fields.
  function handleBackToWork() {
    // Auto-reactivate flagged expenses on exit (§15.C3).
    setExpenses(prev => prev.map(exp => {
      const status = exp.jobLossStatus ?? "active";
      const auto = exp.autoReactivateOnIncome ?? true;
      if (status !== "active" && auto) {
        return { ...exp, jobLossStatus: "active" };
      }
      return exp;
    }));
    setConfig(prev => ({
      ...prev,
      jobLossMode: false,
      jobLossDate: null,
      unemploymentEnabled: null,
      unemploymentWeekly: null,
      unemploymentDurationWeeks: null,
      unemploymentWaitingWeek: false,
      // §15.C6: projected return date is moot once they're actually
      // re-employed via the wizard. Job application log stays as
      // user history.
      returnToWorkDate: null,
    }));
    setWizardEntry("structure_change");
  }

  function handleSelectInvestorAccount(n) {
    setActiveInvestorAccount(n);
    setDrawerOpen(false);
    saveInvestorActiveAccount(n); // fire-and-forget persistence
    if (n === 3 && !config.setupComplete) {
      setWizardEntry(false);
    }
  }

  // Checking localStorage for an existing session — avoid flash of login screen.
  if (!authChecked) {
    return <FullScreenLoadingState label="Checking session" />;
  }

  // Investor code verified but no session yet — show registration form.
  if (investorSession && !authedUser) {
    return (
      <InvestorRegister
        onRegister={async formData => {
          const { error, needsConfirmation } = await createInvestorAccount({
            name:     formData.name,
            email:    formData.email,
            password: formData.password,
            company:  formData.company,
            city:     formData.city,
            codeUsed: investorSession?.code ?? null,
          });
          if (!error && !needsConfirmation) {
            // DB writes (investor_users + user_data) are now settled.
            // Clear investorSession so the wizard guard re-arms for future non-investors,
            // then force a second loadUserData call to pick up config.isInvestor = true.
            setInvestorSession(null);
            setReloadTrigger(n => n + 1);
          }
          return { error, needsConfirmation };
        }}
        onBack={() => setInvestorSession(null)}
      />
    );
  }

  // Supabase PASSWORD_RECOVERY event — user clicked a reset link, show set-new-password form.
  if (pendingPasswordReset) {
    return <LoginScreen recoveryMode onRecoveryDone={() => setPendingPasswordReset(false)} />;
  }

  // §17.I — archived, revivable account: no app, no wizard, no trial. Only a
  // successful revival charge (subscription active → effect above) clears this.
  if (revivalInfo) {
    return <ReviveScreen revival={revivalInfo} checkoutReturn={checkoutReturn} />;
  }

  // No valid session — show login / create account screen (unless in post-login fade).
  if (!authedUser && !postLoginFade) {
    return (
      <LoginScreen
        onInvestorVerified={code => setInvestorSession({ code })}
        oauthCallbackFailed={oauthCallbackFailed}
        onOauthRetry={() => setOauthCallbackFailed(false)}
      />
    );
  }

  if (loading) {
    return <FullScreenLoadingState />;
  }

  // Investors/demo accounts and admins never hit the paywall — they either
  // aren't real paying customers (investors) or need unrestricted access to
  // support other users (admins).
  const paywallBypassed = isAdmin || config.isInvestor;
  const isExpiredReadOnly = !paywallBypassed && entitlement.state === "expired";

  // Free trial breakdown — shown once ahead of first-run SetupWizard entry,
  // only for a fresh signup (wizardEntry===false, never a life-event
  // re-entry) with a real trial window seeded. Required "I understand"
  // checkbox gates entry into setup.
  if (wizardEntry === false && !config.isInvestor && entitlement.state === "trial" && !trialExplainerAcknowledged) {
    return (
      <TrialExplainerScreen
        trialDaysLeft={entitlement.trialDaysLeft}
        trialEndsAt={subscription?.trialEndsAt}
        onContinue={() => setTrialExplainerAcknowledged(true)}
      />
    );
  }

  const activePanel = (
    <>
      {currentView === "home" && (config.jobLossMode ? (
        <JobLossHomePanel
          config={config}
          setConfig={setConfig}
          saveConfigNow={saveConfigNow}
          expenses={expenses}
          effectiveToday={effectiveToday}
          includeBenefits={jobLossIncludeBenefits}
          readOnly={isExpiredReadOnly}
          currentWeek={currentWeek}
          isAdmin={isAdmin}
          isTester={isTester}
          entitlement={entitlement}
        />
      ) : (
        <HomePanel
          navigate={navigate}
          onLocalSignOut={handleLocalSignOut}
          weeklyIncome={weeklyIncome}
          adjustedTakeHome={logTotals.adjustedTakeHome}
          remainingSpend={remainingSpend}
          goals={goals}
          setGoals={setGoals}
          onSaveGoalsNow={(newGoals) => savePersistedStateNow({ goals: newGoals })}
          setConfig={setConfig}
          saveConfigNow={saveConfigNow}
          futureWeeks={futureWeeks}
          futureWeekNets={futureWeekNets}
          timelineWeekNets={futureWeekNetsRaw}
          expenses={expenses}
          config={config}
          logNetLost={logTotals.netLost}
          logNetGained={logTotals.netGained}
          futureEventDeductions={futureEventDeductions}
          prevWeekNet={prevWeekNet}
          currentWeek={currentWeek}
          fiscalWeekInfo={currentWeekNumber}
          today={effectiveToday}
          fundedGoalSpend={fundedGoalSpend}
          isAdmin={isAdmin}
          isTester={isTester}
          betaCodeUsed={betaCodeUsed}
          entitlement={entitlement}
          readOnly={isExpiredReadOnly}
        />
      ))}
      {currentView === "income" && (isExpiredReadOnly ? <UpgradePanel tab="income" /> : <IncomePanel
        allWeeks={allWeeks} config={config} setConfig={setConfig}
        showExtra={showExtra} setShowExtra={setShowExtra}
        taxDerived={taxDerived}
        missedEventDayNetLost={logTotals.missedEventDayNetLost}
        adjustedTakeHome={logTotals.adjustedTakeHome}
        projectedAnnualNet={projectedAnnualNet}
        currentWeek={currentWeek}
        isAdmin={isAdmin}
        today={effectiveToday}
        weekNetLookup={weekNetLookup}
        onWeekInspect={isAdmin ? setInspectedWeek : null}
        saveConfigNow={saveConfigNow}
      />)}
      {currentView === "budget" && (config.jobLossMode ? (
        <JobLossBudgetPanel
          config={config}
          setConfig={setConfig}
          saveConfigNow={saveConfigNow}
          expenses={expenses}
          setExpenses={setExpenses}
          onSaveExpensesNow={(newExpenses) => savePersistedStateNow({ expenses: newExpenses })}
          effectiveToday={effectiveToday}
          includeBenefits={jobLossIncludeBenefits}
          setIncludeBenefits={setJobLossIncludeBenefits}
          readOnly={isExpiredReadOnly}
        />
      ) : (
        <BudgetPanel
          expenses={expenses} setExpenses={setExpenses}
          onSaveExpensesNow={(newExpenses) => savePersistedStateNow({ expenses: newExpenses })}
          weeklyIncome={weeklyIncome}
          prevWeekNet={prevWeekNet}
          futureWeeks={futureWeeks}
          futureWeekNets={futureWeekNets}
          currentWeek={currentWeek}
          fiscalWeekInfo={currentWeekNumber}
          today={effectiveToday}
          userPaySchedule={config.userPaySchedule ?? "weekly"}
          fundedGoalSpend={fundedGoalSpend}
          config={config}
          bufferPerWeek={bufferPerWeek}
          isAdmin={isAdmin}
          taxProjectionsEnabled={taxProjectionsEnabled}
          isTester={isTester}
          betaCodeUsed={betaCodeUsed}
          readOnly={isExpiredReadOnly}
        />
      ))}
      {currentView === "log" && (isExpiredReadOnly ? <UpgradePanel tab="log" /> : <LogPanel
        logs={logs} setLogs={setLogs} config={config} isEmployerDHL={isEmployerDHL} isAdmin={isAdmin}
        onSaveLogsNow={(newLogs) => savePersistedStateNow({ logs: newLogs })}
        effectiveToday={effectiveToday}
        setConfig={setConfig} saveConfigNow={saveConfigNow} weekConfirmations={weekConfirmations}
        baseWeeklyUnallocated={baseWeeklyUnallocated}
        futureWeeks={futureWeeks}
        allWeeks={allWeeks}
        currentWeek={currentWeek}
        fiscalWeekInfo={currentWeekNumber}
        logK401kLost={logTotals.k401kLost}
        logK401kMatchLost={logTotals.k401kMatchLost}
        logK401kGained={logTotals.k401kGained}
        logK401kMatchGained={logTotals.k401kMatchGained}
        logPTOHoursLost={logTotals.ptoHoursLost}
        logNetLost={logTotals.netLost}
        logNetGained={logTotals.netGained}
        adjustedTakeHome={logTotals.adjustedTakeHome}
        ptoGoal={ptoGoal}
        setPtoGoal={setPtoGoal}
        onSavePtoGoalNow={(next) => savePersistedStateNow({ ptoGoal: next })}
        goals={goals}
        fundedGoalSpend={fundedGoalSpend}
        bucketModel={bucketModel}
      />)}
      {currentView === "profile" && <ProfilePanel
        authedUser={authedUser}
        config={config}
        setConfig={setConfig}
        saveConfigNow={saveConfigNow}
        onLocalSignOut={handleLocalSignOut}
        allWeeks={allWeeks}
        taxDerived={taxDerived}
        showExtra={showExtra}
        setShowExtra={setShowExtra}
        isAdmin={isAdmin}
        taxProjectionsEnabled={taxProjectionsEnabled}
        isTester={isTester}
        betaCodeUsed={betaCodeUsed}
        today={effectiveToday}
        weekConfirmations={weekConfirmations}
        onInstallClick={isStandalone ? null : openPwaModal}
        onOpenLifeEvents={() => setLifeEventMenu(true)}
        onBackToWork={handleBackToWork}
        subscription={subscription}
      />}
    </>
  );

  // Post-login fade animation: render both LoginScreen (fading out) and App shell
  // (fading in) during the 340ms transition. After fade completes, render only shell.
  const shellContent = (
      <div className="app-shell" style={{ background: "var(--color-bg-gradient)", minHeight: "100vh", color: "var(--color-text-primary)", display: "flex" }}>
        <style>{`
          /* DEBUG: redundant overflow guard — index.css sets this on html/body/#root
             but injecting it here as well catches any future SSR or shadow-DOM edge
             cases where the external stylesheet might not apply in time. */
          html, body, #root { max-width: 100vw; overflow-x: hidden; }

        /* DEBUG: global box-sizing reset — ensures padding/border are included in
           element width calculations. Without this, an element with width:100% and
           padding:16px would be 100%+32px wide and cause horizontal scroll. */
        *, *::before, *::after { box-sizing: border-box; }

        /* DEBUG MOBILE BREAKPOINT: 767px is the cutover between mobile and desktop.
           Below 767px: sidebar hides, mobile-header + mobile-bottom-nav show.
           Above 768px: sidebar shows, mobile chrome hides.
           If you change this breakpoint, also update the drawer width (260px in JSX)
           and the desktop sidebar width (190px) so nothing overlaps. */
          .main-content { min-height: 0; }

          @media (max-width: 767px) {
            .sidebar { display: none !important; }
            .mobile-header { display: flex !important; }
            .mobile-bottom-nav { display: flex !important; }
            .mobile-admin-sheet { display: flex !important; flex-direction: column !important; }
            .admin-inspector { bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important; }
            /* On mobile the outer shell must have a definite height so the flex
               column inside can act as a scroll container. 100svh = "small viewport
               height" — excludes the address bar so layout doesn't jump when Chrome
               shows/hides it. */
            .app-shell { height: 100svh; }
            /* Make main-content the scroll container on mobile, matching the desktop
               pattern (desktop uses height:100vh + overflow-y:auto). Without an
               overflow-y:auto here, touch scroll has no container to scroll — Android
               Chrome treats overflow-x:hidden on body as blocking vertical scroll too,
               so the page appears locked. */
          .main-content {
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: calc(86px + env(safe-area-inset-bottom, 0px)) !important;
            overscroll-behavior-y: contain;
          }
          /* Safe-area height + top padding for Dynamic Island / notch iPhones.
             CSS !important overrides inline styles in iOS PWA standalone mode where
             env() may not resolve reliably on inline attributes.
             flex-direction: column so inner content row stacks below the safe area. */
          .mobile-header {
            height: calc(56px + env(safe-area-inset-top, 0px)) !important;
            padding-top: env(safe-area-inset-top, 0px) !important;
            flex-direction: column !important;
          }
          /* Drawer header inherits the same safe-area buffer as the mobile header so the Dynamic Island never overlaps text. */
          .drawer-header {
            padding-top: max(16px, env(safe-area-inset-top, 0px)) !important;
            min-height: calc(56px + env(safe-area-inset-top, 0px)) !important;
          }
        }
          @media (min-width: 768px) {
            .mobile-header { display: none !important; }
            .mobile-bottom-nav { display: none !important; }
            .mobile-admin-sheet { display: none !important; }
            /* DEBUG: overlay also hides on desktop so a half-open drawer doesn't
               ghost behind the sidebar if the user resizes the window. */
            .mobile-drawer-overlay { display: none !important; }
            /* DEBUG DESKTOP SCROLL: sidebar has height:100vh which makes the root
               flex container exactly 100vh tall. Without overflow-y:auto here,
               the main-content stretches to 100vh via align-items:stretch and
               content that exceeds that height overflows without a scroll target —
               the window never grows past 100vh. This rule makes main-content the
               scroll container on desktop so mouse-wheel scroll works. */
            .main-content {
              height: 100vh;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
            }
          }
        /* DEBUG DRAWER: translateX(-100%) hides the drawer fully off-screen left.
           The .open class moves it to x=0. If the drawer flickers on load,
           add will-change:transform to force GPU compositing. */
        .drawer-slide {
          transform: translateX(-100%);
          transition: transform 0.25s ease;
        }
        .drawer-slide.open {
          transform: translateX(0);
        }
        .drawer-backdrop {
          opacity: 0;
          transition: opacity 0.25s ease;
          pointer-events: none;
        }
        .drawer-backdrop.open {
          opacity: 1;
          pointer-events: auto;
        }
        /* DEBUG: .scroll-x is a utility class for any container that needs
           internal horizontal scrolling without leaking to the page.
           -webkit-overflow-scrolling:touch enables momentum (inertial) scroll
           on iOS — without it, scrolling feels sticky and non-native. */
        /* Hide the floating nav pill whenever any modal is open.
           Components signal this by toggling body.modal-open.
           !important overrides the inline opacity/pointer-events set by
           scroll-direction state — modal backdrop should always win. */
        body.modal-open .mobile-bottom-nav {
          opacity: 0 !important;
          pointer-events: none !important;
          transform: scale(0.85) translateY(12px) !important;
          transition: opacity 0.2s ease, transform 0.2s ease !important;
        }
        body.modal-open .mobile-bottom-nav button {
          pointer-events: none !important;
        }
        body.modal-open .mobile-header {
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity 0.15s ease !important;
        }
        .scroll-x {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          max-width: 100%;
        }
      `}</style>

      {/* ── Desktop Sidebar ── */}
      <div
        className="sidebar"
        style={{
          width: "190px",
          minWidth: "190px",
          background: "var(--color-bg-surface)",
          borderRight: "1px solid var(--color-border-subtle)",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 10,
        }}
      >
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "10px", letterSpacing: "4px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "3px" }}>{config.employerPreset === "DHL" ? "DHL / P&G" : (config.employerPreset || "Finance")}</div>
                <div style={{ fontSize: "13px", fontWeight: "bold", lineHeight: "1.3", marginBottom: "8px" }}>Authority Finance</div>
              </div>
            </div>
            <Pressable
              title="Sign out"
              onClick={async () => { await supabase.auth.signOut({ scope: "local" }); }}
              style={{ background: "transparent", border: "none", color: "var(--color-deduction)", cursor: "pointer", padding: "2px 0", marginTop: "1px", lineHeight: 1, display: "flex", alignItems: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </Pressable>
          </div>
          {currentWeekNumber && <div style={{ display: "inline-block", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "3px 8px", background: "rgba(0,200,150,0.14)", color: "var(--color-green)", border: "1px solid rgba(0,200,150,0.32)", borderRadius: "3px" }}>{currentWeekLabel}</div>}
          {/* Persistent unconfirmed-weeks badge — always visible when any past week
              lacks a confirmation. Clicking clears confirmDismissed so the modal re-opens. */}
          {unconfirmedCount > 0 && (
            <Pressable onClick={() => setConfirmDismissed(false)} style={{ marginTop: "8px", display: "block", width: "100%", background: "transparent", border: "1px solid #e8856a55", borderRadius: "3px", color: "var(--color-deduction)", padding: "5px 8px", fontSize: "9px", letterSpacing: "1.5px", cursor: "pointer", textTransform: "uppercase", textAlign: "left" }}>
              ◷ {unconfirmedCount} {(config.userPaySchedule ?? "weekly") === "weekly" ? (unconfirmedCount === 1 ? "week" : "weeks") : (unconfirmedCount === 1 ? "pay period" : "pay periods")} to confirm
            </Pressable>
          )}
          {isAdmin && tempLockDate && (
            <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: "3px", padding: "5px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-warning)" }}>
                  {new Date(tempLockDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <Pressable
                onClick={() => { setTempLockDate(null); setAdminDateDraft(""); }}
                style={{ background: "transparent", border: "none", color: "var(--color-warning)", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "0 2px", display: "flex", alignItems: "center" }}
                aria-label="Clear lock date"
              >×</Pressable>
            </div>
          )}
        </div>
        <nav style={{ marginTop: "8px", flex: 1 }}>
          <SidebarNavItem item={{ key: "home", label: "Home" }} active={currentView === "home"} onClick={() => navigateDirect("home")} />
          {effectiveNavItems.map(item => (
            <SidebarNavItem key={item.key} item={item} active={currentView === item.key} onClick={() => navigateDirect(item.key)} />
          ))}
          {/* ── Life Events (re-entry wizard) ── */}
          <div style={{ borderTop: "1px solid #1e1e1e", marginTop: "8px", paddingTop: "8px" }}>
            <Pressable
              onClick={() => setLifeEventMenu(true)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "14px 20px", fontSize: "11px",
                letterSpacing: "2px", textTransform: "uppercase",
                background: "transparent",
                color: "var(--color-text-primary)",
                borderLeft: "3px solid transparent",
                border: "none", cursor: "pointer", transition: "all 0.15s",
              }}
            >
              Life Events
            </Pressable>
          </div>

          {/* ── Admin Tools ── */}
          {isAdmin && (
            <div style={{ borderTop: "1px solid var(--color-border-subtle)", marginTop: "8px", paddingTop: "8px" }}>
              <div style={{ padding: "8px 20px 6px", display: "flex", alignItems: "center", gap: "6px" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)" }}>
                  Admin Tools{tempLockDate ? ` — ${new Date(tempLockDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
              </div>
              <div style={{ padding: "4px 20px 12px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Lock Date</div>
                {tempLockDate ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-warning)", fontFamily: "var(--font-mono)" }}>{tempLockDate}</span>
                    <Pressable
                      onClick={() => { setTempLockDate(null); setAdminDateDraft(""); }}
                      style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "6px", color: "var(--color-deduction)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 8px", cursor: "pointer" }}
                    >Clear</Pressable>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="date"
                      value={adminDateDraft}
                      onChange={e => setAdminDateDraft(e.target.value)}
                      style={{ flex: 1, background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", color: "var(--color-text-primary)", fontSize: "11px", padding: "4px 6px", fontFamily: "var(--font-mono)", colorScheme: "dark" }}
                    />
                    <Pressable
                      onClick={() => { if (adminDateDraft) setTempLockDate(adminDateDraft); }}
                      disabled={!adminDateDraft}
                      style={{ background: adminDateDraft ? "var(--color-accent-primary)" : "var(--color-bg-raised)", border: "none", borderRadius: "6px", color: adminDateDraft ? "var(--color-bg-base)" : "var(--color-text-disabled)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "4px 10px", cursor: adminDateDraft ? "pointer" : "not-allowed", fontWeight: "bold" }}
                    >Set</Pressable>
                  </div>
                )}
              </div>
              {/* Force Sync */}
              <div style={{ padding: "0 20px 10px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Sync</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {["push", "pull"].map(op => (
                    <Pressable
                      key={op}
                      onClick={op === "push" ? handleForcePush : handleForcePull}
                      disabled={!!syncStatus?.pending}
                      style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", color: syncStatus?.pending ? "var(--color-text-disabled)" : "var(--color-text-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "5px 0", cursor: syncStatus?.pending ? "not-allowed" : "pointer" }}
                    >{op === "push" ? "Push ↑" : "Pull ↓"}</Pressable>
                  ))}
                </div>
                {syncStatus && (
                  <div style={{ fontSize: "9px", marginTop: "5px", letterSpacing: "0.5px", color: syncStatus.pending ? "var(--color-text-secondary)" : syncStatus.ok ? "var(--color-green)" : "var(--color-red)" }}>
                    {syncStatus.pending
                      ? (syncStatus.op === "push" ? "Pushing…" : "Pulling…")
                      : syncStatus.ok
                        ? `✓ ${syncStatus.op === "push" ? "Pushed" : "Pulled"} · ${syncStatus.ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                        : `✗ ${syncStatus.op === "push" ? "Push" : "Pull"} failed`}
                  </div>
                )}
              </div>

              {/* Reopen Last Check-In */}
              <div style={{ padding: "0 20px 10px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Weekly Check-In</div>
                <button
                  onClick={handleReopenLastCheckIn}
                  disabled={reopenableWeekIdx == null}
                  style={{ width: "100%", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", color: reopenableWeekIdx == null ? "var(--color-text-disabled)" : "var(--color-text-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 0", cursor: reopenableWeekIdx == null ? "not-allowed" : "pointer" }}
                >{reopenableWeekIdx == null ? "No check-in to reopen" : `Reopen Last · Wk ${reopenableWeekIdx}`}</button>
              </div>

              {/* Config Raw View */}
              <div style={{ padding: "0 20px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Config JSON</div>
                  <Pressable
                    onClick={() => setConfigViewOpen(v => !v)}
                    style={{ background: "transparent", border: "none", color: "var(--color-accent-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", padding: "0" }}
                  >{configViewOpen ? "Hide" : "View"}</Pressable>
                </div>
                {configViewOpen && (
                  <div style={{ position: "relative" }}>
                    <pre style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "8px", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", maxHeight: "180px", overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(config, null, 2)}
                    </pre>
                    <Pressable
                      onClick={() => navigator.clipboard?.writeText(JSON.stringify(config, null, 2))}
                      style={{ marginTop: "5px", width: "100%", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", color: "var(--color-text-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "4px 0", cursor: "pointer" }}
                    >Copy to Clipboard</Pressable>
                  </div>
                )}
              </div>

              {/* Supabase Row Viewer */}
              <div style={{ padding: "0 20px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>DB Row</div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {rowDiff.length > 0 && <span style={{ fontSize: "9px", color: "var(--color-warning)" }}>{rowDiff.length} drift</span>}
                    <Pressable onClick={handleFetchRow} disabled={rowFetching} style={{ background: "transparent", border: "none", color: "var(--color-accent-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", cursor: rowFetching ? "not-allowed" : "pointer", padding: "0" }}>{rowFetching ? "…" : "Fetch"}</Pressable>
                    {rowData && <Pressable onClick={() => setRowViewOpen(v => !v)} style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", padding: "0" }}>{rowViewOpen ? "Hide" : "View"}</Pressable>}
                  </div>
                </div>
                {rowData && rowViewOpen && (
                  <div>
                    {rowData.__error
                      ? <div style={{ fontSize: "9px", color: "var(--color-red)" }}>{rowData.__error}</div>
                      : <>
                          {rowData.updated_at && <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>updated: {new Date(rowData.updated_at).toLocaleString()}</div>}
                          {rowDiff.length > 0 && <div style={{ fontSize: "9px", color: "var(--color-warning)", marginBottom: "4px" }}>Drift: {rowDiff.join(", ")}</div>}
                          {historyLine && <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>{historyLine}</div>}
                          <pre style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "8px", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", maxHeight: "160px", overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            {JSON.stringify(rowData, null, 2)}
                          </pre>
                        </>
                    }
                  </div>
                )}
              </div>

              {/* Tax Weeks Grid */}
              <div style={{ padding: "0 20px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Tax Weeks</div>
                  <Pressable onClick={() => setTaxGridOpen(v => !v)} style={{ background: "transparent", border: "none", color: "var(--color-accent-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", padding: "0" }}>{taxGridOpen ? "Hide" : "View"}</Pressable>
                </div>
                {taxGridOpen && (() => {
                  const overrides = config.pastWeekTaxStatusOverrides ?? {};
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                      {allWeeks.filter(w => w.active).map(w => {
                        const wIso = toLocalIso(w.weekEnd);
                        const isPast = wIso < effectiveToday;
                        const isCurrent = w.idx === currentWeek?.idx;
                        const hasOverride = overrides[w.idx] !== undefined;
                        const bg = isPast ? "var(--color-bg-raised)" : w.taxedBySchedule ? "rgba(0,200,150,0.25)" : "var(--color-bg-base)";
                        return (
                          <div key={w.idx} title={`Wk ${w.idx}${w.taxedBySchedule ? " · taxed" : ""}${isPast ? " · past" : ""}${hasOverride ? " · override" : ""}`} style={{ position: "relative", width: "14px", height: "14px", borderRadius: "2px", background: bg, border: isCurrent ? "1.5px solid #c8a84b" : "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
                            {hasOverride && <div style={{ position: "absolute", top: "1px", right: "1px", width: "4px", height: "4px", borderRadius: "50%", background: "var(--color-red)" }} />}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Beta Report — docs/TODO.md, admin-only usage/feedback CSV export */}
              <div style={{ padding: "0 20px 12px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Beta Report</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <Pressable onClick={() => handleDownloadBetaReport("summary")} disabled={betaReportStatus?.loading} style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "6px 0", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: betaReportStatus?.loading ? "default" : "pointer" }}>Usage CSV</Pressable>
                  <Pressable onClick={() => handleDownloadBetaReport("feedback")} disabled={betaReportStatus?.loading} style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "6px 0", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: betaReportStatus?.loading ? "default" : "pointer" }}>Feedback CSV</Pressable>
                </div>
                {betaReportStatus?.error && (
                  <div style={{ fontSize: "9px", color: "var(--color-red)", marginTop: "4px" }}>{betaReportStatus.error}</div>
                )}
              </div>

              {/* Demo account editing — admin only */}
              <div style={{ padding: "0 20px 12px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Demo Accounts</div>
                {adminDemoView !== null && (
                  <div style={{ fontSize: "9px", color: "var(--color-warning)", letterSpacing: "1px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Editing Demo {adminDemoView}
                  </div>
                )}
                <div style={{ display: "flex", gap: "6px" }}>
                  {[1, 2].map(n => (
                    <Pressable
                      key={n}
                      onClick={() => setAdminDemoView(adminDemoView === n ? null : n)}
                      title={adminDemoView === n ? "Click to exit demo edit mode" : `Edit Demo Account ${n}`}
                      style={{
                        flex: 1,
                        background: adminDemoView === n ? "var(--color-accent-primary)" : "var(--color-bg-raised)",
                        border: adminDemoView === n ? "none" : "1px solid var(--color-border-subtle)",
                        borderRadius: "6px",
                        padding: "5px 0",
                        fontSize: "10px",
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                        color: adminDemoView === n ? "var(--color-bg-base)" : "var(--color-text-secondary)",
                        cursor: "pointer",
                        fontWeight: adminDemoView === n ? "bold" : "normal",
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {adminDemoView === n ? "← Exit" : `Demo ${n}`}
                    </Pressable>
                  ))}
                </div>
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Mobile header */}
        <div
          className="mobile-header"
          style={{
            display: "none",
            borderBottom: "1px solid var(--color-border-accent)",
            background: "var(--color-bg-gradient)",
            position: "sticky",
            top: 0,
            zIndex: 30,
            flexDirection: "column",
            // Height + padding-top are overridden with !important in the @media CSS block
            // to ensure env(safe-area-inset-top) resolves in iOS PWA standalone mode.
            height: "calc(56px + env(safe-area-inset-top, 0px))",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          {/* Inner content row — always exactly 56px, sits BELOW the Dynamic Island */}
          <div style={{
            height: "56px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 max(16px, env(safe-area-inset-left, 16px))",
            paddingRight: "max(16px, env(safe-area-inset-right, 16px))",
            flex: "none",
          }}>
            {/* ── Hamburger — top LEFT (Chime-style) ── */}
          <Pressable
            onClick={() => setDrawerOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-teal)",
              cursor: "pointer",
              width: "44px",
              height: "44px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              flexShrink: 0,
            }}
            aria-label="Open navigation"
          >
            <span style={{ display: "block", width: "20px", height: "2px", background: "var(--color-accent-primary)", borderRadius: "1px" }} />
            <span style={{ display: "block", width: "20px", height: "2px", background: "var(--color-accent-primary)", borderRadius: "1px" }} />
            <span style={{ display: "block", width: "20px", height: "2px", background: "var(--color-accent-primary)", borderRadius: "1px" }} />
          </Pressable>

          {/* ── Title block — center ── */}
          <div style={{ flex: 1, minWidth: 0, paddingLeft: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-teal)", textTransform: "uppercase" }}>{config.employerPreset === "DHL" ? "DHL / P&G" : (config.employerPreset || "Finance")}</div>
                {currentWeekNumber && <div style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "1px 6px", background: "rgba(0,200,150,0.14)", color: "var(--color-green)", border: "1px solid rgba(0,200,150,0.32)", borderRadius: "3px", flexShrink: 0 }}>{currentWeekLabel}</div>}
                {isAdmin && tempLockDate && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: "4px", padding: "1px 4px 1px 6px", flexShrink: 0 }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <span style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-warning)" }}>
                      {new Date(tempLockDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <Pressable
                      onClick={() => { setTempLockDate(null); setAdminDateDraft(""); }}
                      style={{ background: "transparent", border: "none", color: "var(--color-warning)", cursor: "pointer", padding: "0 2px", lineHeight: 1, fontSize: "11px", display: "flex", alignItems: "center" }}
                      aria-label="Clear lock date"
                    >×</Pressable>
                  </div>
                )}
              </div>
              <div style={{ fontSize: "14px", fontWeight: "bold" }}>Authority Finance</div>
            </div>
          </div>

          {/* ── Notification bell — top RIGHT (Chime-style) ── */}
          <Pressable
            onClick={() => setConfirmDismissed(false)}
            style={{
              background: "transparent",
              border: "none",
              color: unconfirmedCount > 0 ? "var(--color-deduction)" : "var(--color-text-primary)",
              cursor: "pointer",
              width: "44px",
              height: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
            }}
            aria-label={unconfirmedCount > 0 ? `${unconfirmedCount} ${(config.userPaySchedule ?? "weekly") === "weekly" ? "weeks" : "pay periods"} to confirm` : "Notifications"}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            {unconfirmedCount > 0 && (
              <span style={{
                position: "absolute",
                top: "6px",
                right: "6px",
                background: "var(--color-deduction)",
                color: "var(--color-bg-base)",
                borderRadius: "50%",
                width: "16px",
                height: "16px",
                fontSize: "9px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",

              }}>
                {unconfirmedCount}
              </span>
            )}
          </Pressable>
          </div>
        </div>

        {/* Panel content */}
        <div ref={mainContentCallbackRef} className="main-content" style={{ padding: "18px 16px", flex: 1, minHeight: 0 }}>
          {/* ── Post-checkout return banner (§17.E) ── */}
          {checkoutReturn === "success" && (
            <div style={{
              background: "rgba(0,200,150,0.10)", border: "1px solid rgba(0,200,150,0.32)",
              borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
              display: "flex", alignItems: "center", gap: "10px",
            }}>
              <div style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>
                Confirming your subscription…
              </div>
            </div>
          )}
          {checkoutReturn === "cancel" && (
            <div style={{
              background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
              borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
            }}>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                Checkout canceled — no charge was made.
              </div>
              <Pressable onClick={() => setCheckoutReturn(null)} aria-label="Dismiss" style={{ background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}>✕</Pressable>
            </div>
          )}
          {/* ── Trial/dunning banner (§17.F) — phase-aware (trial/grace/expired),
               persistent across views except where UpgradePanel already replaces
               the whole panel (Income/Log while expired — showing both would be
               redundant). Dismissible for the session; re-shows on reload since
               dismissal isn't persisted, same pattern as the Job Loss banner. ── */}
          {!paywallBypassed && !trialBannerDismissed &&
            !(isExpiredReadOnly && (currentView === "income" || currentView === "log")) && (
            <TrialBanner
              entitlement={entitlement}
              onUpgrade={() => setShowUpgradeModal(true)}
              onDismiss={() => setTrialBannerDismissed(true)}
            />
          )}
          {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
          {updateAvailable && !updateBannerDismissed && (
            <UpdateAvailableBanner
              onUpdate={() => window.__pwaUpdateSW?.()}
              onDismiss={() => setUpdateBannerDismissed(true)}
            />
          )}
          {saveError && <SaveFailedBanner message={saveError} onRetry={retryFailedSave} onDismiss={dismissSaveError} />}
          {/* ── Job Loss Mode banner (TODO §15.C1 + C2) ── */}
          {config.jobLossMode && !jobLossBannerDismissed && (() => {
            // Compute benefits-end date when duration is set, so the banner can
            // show a "runs out on" cliff warning. Waiting week shifts the start.
            let benefitsEndDate = null;
            if (config.unemploymentEnabled
                && config.jobLossDate
                && (config.unemploymentDurationWeeks ?? 0) > 0) {
              const start = new Date(config.jobLossDate + "T00:00:00");
              const offsetDays = (config.unemploymentWaitingWeek ? 1 : 0) * 7
                               + (config.unemploymentDurationWeeks * 7);
              const end = new Date(start);
              end.setDate(end.getDate() + offsetDays - 1);
              benefitsEndDate = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            }
            return (
            <div style={{
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.32)",
              borderRadius: "12px",
              padding: "10px 14px",
              marginBottom: "14px",
              display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
            }}>
              <div style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: "var(--color-warning)", flexShrink: 0,
                boxShadow: "0 0 8px rgba(245,158,11,0.6)",
              }} />
              <div style={{ flex: 1, minWidth: "180px" }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-warning)", fontWeight: 700 }}>
                  Job Loss Mode
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                  {/* §15.H5: users who started jobless have no real pay history to compare
                      against — say so plainly instead of implying a job was actually lost. */}
                  {config.startedUnemployed === true ? (
                    "Started in Job Loss Mode — no prior pay history."
                  ) : (
                    <>
                      Projections show $0 earned income from{" "}
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
                        {config.jobLossDate ?? "—"}
                      </span>{" "}
                      forward.
                    </>
                  )}
                  {benefitsEndDate && (
                    <>
                      {" "}Unemployment runs out on{" "}
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-warning)" }}>
                        {benefitsEndDate}
                      </span>
                      .
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {/* TODO §15 mode rebuild — triage now lives inline on Budget
                    itself (JobLossBudgetPanel), not a separate modal, so this
                    button just jumps there instead of opening one. */}
                <Pressable
                  onClick={() => navigateDirect("budget")}
                  style={{
                    background: "transparent",
                    color: "var(--color-warning)",
                    border: "1px solid rgba(245,158,11,0.4)",
                    borderRadius: "10px",
                    padding: "6px 12px",
                    fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                    fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Go to Budget
                </Pressable>
                <Pressable
                  onClick={handleBackToWork}
                  style={{
                    background: "var(--color-warning)",
                    color: "var(--color-bg-base)",
                    border: "none", borderRadius: "10px",
                    padding: "6px 12px",
                    fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                    fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Back to Work
                </Pressable>
                <Pressable
                  onClick={() => setJobLossBannerDismissed(true)}
                  aria-label="Dismiss banner"
                  style={{
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "10px",
                    width: "28px", height: "28px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                  </svg>
                </Pressable>
              </div>
            </div>
            );
          })()}
          {/* TODO §15 mode rebuild (2026-07-18) — the standalone pinned dashboard
              card is gone; its content now lives in JobLossHomePanel/
              JobLossBudgetPanel, which render in place of the normal Home/Budget
              panels above instead of being layered on top of them. */}
          {isAdmin && adminDemoView !== null
            ? <DemoAccountTree
                key={adminDemoView}
                accountNumber={adminDemoView}
                isAdmin={true}
                onExit={() => setAdminDemoView(null)}
              />
            : config.isInvestor && activeInvestorAccount !== 3
              ? <DemoAccountTree
                  key={activeInvestorAccount}
                  accountNumber={activeInvestorAccount}
                  isAdmin={false}
                  activeTabOverride={currentView}
                  onNavigate={navigate}
                />
              : <FoldSwitch activeKey={currentView}>{activePanel}</FoldSwitch>
          }
        </div>
      </div>

      {/* ── Mobile drawer overlay (backdrop) ── */}
      <div
        className={`mobile-drawer-overlay drawer-backdrop${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 40,
        }}
      />

      {/* ── Mobile drawer (slide-in sidebar) ── */}
      <div
        className={`mobile-drawer-overlay drawer-slide${drawerOpen ? " open" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "260px",
          height: "100dvh",
          background: "var(--color-bg-surface)",
          borderRight: "1px solid #2a2a2a",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drawer header */}
        <div className="drawer-header" style={{ padding: "16px 18px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", minHeight: "56px" }}>
          <div>
            <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "3px" }}>{config.employerPreset === "DHL" ? "DHL / P&G" : (config.employerPreset || "Finance")}</div>
            <div style={{ fontSize: "15px", fontWeight: "bold" }}>Authority Finance</div>
          </div>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <Pressable
              title="Sign out"
              onClick={async () => { await supabase.auth.signOut({ scope: "local" }); setDrawerOpen(false); setInvestorSession(null); setActiveInvestorAccount(1); setInvestorProfile(null); }}
              style={{ background: "transparent", border: "none", color: "var(--color-deduction)", cursor: "pointer", lineHeight: 1, padding: "2px 6px", display: "flex", alignItems: "center" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </Pressable>
            <Pressable
              onClick={() => setDrawerOpen(false)}
              style={{ background: "transparent", border: "none", color: "var(--color-text-primary)", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 4px", marginTop: "2px" }}
              aria-label="Close navigation"
            >
              ✕
            </Pressable>
          </div>
        </div>

        {/* Drawer nav items */}
        <nav style={{ marginTop: "12px", flex: 1 }}>
          <SidebarNavItem item={{ key: "home", label: "Home" }} active={currentView === "home"} onClick={() => navigateDirect("home")} />
          {effectiveNavItems.map(item => (
            <SidebarNavItem key={item.key} item={item} active={currentView === item.key} onClick={() => navigateDirect(item.key)} />
          ))}
          {/* ── Life Events (re-entry wizard) ── */}
          <div style={{ borderTop: "1px solid #1e1e1e", marginTop: "8px", paddingTop: "8px" }}>
            <Pressable
              onClick={() => { setLifeEventMenu(true); setDrawerOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "14px 20px", fontSize: "11px",
                letterSpacing: "2px", textTransform: "uppercase",
                background: "transparent",
                color: "var(--color-text-primary)",
                borderLeft: "3px solid transparent",
                border: "none", cursor: "pointer", transition: "all 0.15s",
              }}
            >
              Life Events
            </Pressable>
            {!isStandalone && (
              <Pressable
                type="button"
                aria-haspopup="dialog"
                aria-controls="pwa-install-dialog"
                onClick={(e) => { openPwaModal(e.currentTarget); setDrawerOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  width: "100%", textAlign: "left",
                  padding: "14px 20px", fontSize: "11px",
                  letterSpacing: "2px", textTransform: "uppercase",
                  background: "transparent",
                  color: "var(--color-text-primary)",
                  borderLeft: "3px solid transparent",
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Install on home screen
              </Pressable>
            )}
          </div>
        </nav>

        {/* ── Investor accounts pill ── */}
        {config.isInvestor && (
          <div style={{ padding: "12px 16px 0", borderTop: "1px solid #1e1e1e" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "8px", fontFamily: "var(--font-sans)" }}>
              Accounts
            </div>
            <div style={{
              display: "flex",
              background: "rgba(0,200,150,0.10)",
              border: "1px solid rgba(0,200,150,0.28)",
              borderRadius: "12px",
              overflow: "hidden",
            }}>
              {[{ n: 1, label: "1" }, { n: 2, label: "2" }, { n: 3, label: "3*" }].map(({ n, label }) => {
                const active = activeInvestorAccount === n;
                return (
                  <Pressable
                    key={n}
                    type="button"
                    onClick={() => handleSelectInvestorAccount(n)}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      minHeight: "44px",
                      fontSize: "11px",
                      fontWeight: active ? "700" : "500",
                      letterSpacing: "1px",
                      background: active ? "var(--color-accent-primary)" : "transparent",
                      color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)",
                      border: "none",
                      borderRight: n < 3 ? "1px solid rgba(0,200,150,0.2)" : "none",
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {label}
                  </Pressable>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Admin Tools (drawer) ── */}
        {isAdmin && (
          <div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "10px 18px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)" }}>
                Admin Tools{tempLockDate ? ` — ${new Date(tempLockDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
              </span>
            </div>
            <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Lock Date</div>
            {tempLockDate ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-warning)", fontFamily: "var(--font-mono)" }}>{tempLockDate}</span>
                <Pressable
                  onClick={() => { setTempLockDate(null); setAdminDateDraft(""); }}
                  style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "6px", color: "var(--color-deduction)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "4px 10px", cursor: "pointer" }}
                >Clear</Pressable>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="date"
                  value={adminDateDraft}
                  onChange={e => setAdminDateDraft(e.target.value)}
                  style={{ flex: 1, background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", color: "var(--color-text-primary)", fontSize: "16px", padding: "6px 8px", fontFamily: "var(--font-mono)", colorScheme: "dark" }}
                />
                <Pressable
                  onClick={() => { if (adminDateDraft) { setTempLockDate(adminDateDraft); setDrawerOpen(false); } }}
                  disabled={!adminDateDraft}
                  style={{ background: adminDateDraft ? "var(--color-accent-primary)" : "var(--color-bg-raised)", border: "none", borderRadius: "6px", color: adminDateDraft ? "var(--color-bg-base)" : "var(--color-text-disabled)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 12px", cursor: adminDateDraft ? "pointer" : "not-allowed", fontWeight: "bold", whiteSpace: "nowrap" }}
                >Set</Pressable>
              </div>
            )}
            {/* Force Sync */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Sync</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {["push", "pull"].map(op => (
                  <Pressable
                    key={op}
                    onClick={op === "push" ? handleForcePush : handleForcePull}
                    disabled={!!syncStatus?.pending}
                    style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: syncStatus?.pending ? "var(--color-text-disabled)" : "var(--color-text-primary)", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", padding: "10px 0", cursor: syncStatus?.pending ? "not-allowed" : "pointer", minHeight: "44px" }}
                  >{op === "push" ? "Push ↑" : "Pull ↓"}</Pressable>
                ))}
              </div>
              {syncStatus && (
                <div style={{ fontSize: "10px", marginTop: "6px", letterSpacing: "0.5px", color: syncStatus.pending ? "var(--color-text-secondary)" : syncStatus.ok ? "var(--color-green)" : "var(--color-red)" }}>
                  {syncStatus.pending
                    ? (syncStatus.op === "push" ? "Pushing…" : "Pulling…")
                    : syncStatus.ok
                      ? `✓ ${syncStatus.op === "push" ? "Pushed" : "Pulled"} · ${syncStatus.ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                      : `✗ ${syncStatus.op === "push" ? "Push" : "Pull"} failed`}
                </div>
              )}
            </div>

            {/* Reopen Last Check-In */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Weekly Check-In</div>
              <button
                onClick={handleReopenLastCheckIn}
                disabled={reopenableWeekIdx == null}
                style={{ width: "100%", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", color: reopenableWeekIdx == null ? "var(--color-text-disabled)" : "var(--color-text-primary)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "6px 0", cursor: reopenableWeekIdx == null ? "not-allowed" : "pointer" }}
              >{reopenableWeekIdx == null ? "No check-in to reopen" : `Reopen Last · Wk ${reopenableWeekIdx}`}</button>
            </div>

            {/* Config Raw View */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Config JSON</div>
                <Pressable
                  onClick={() => setConfigViewOpen(v => !v)}
                  style={{ background: "transparent", border: "none", color: "var(--color-accent-primary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", padding: "0" }}
                >{configViewOpen ? "Hide" : "View"}</Pressable>
              </div>
              {configViewOpen && (
                <div>
                  <pre style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "10px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", maxHeight: "220px", overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(config, null, 2)}
                  </pre>
                  <Pressable
                    onClick={() => navigator.clipboard?.writeText(JSON.stringify(config, null, 2))}
                    style={{ marginTop: "8px", width: "100%", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "10px 0", cursor: "pointer", minHeight: "44px" }}
                  >Copy to Clipboard</Pressable>
                </div>
              )}
            </div>

            {/* Supabase Row Viewer */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>DB Row</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {rowDiff.length > 0 && <span style={{ fontSize: "9px", color: "var(--color-warning)" }}>{rowDiff.length} drift</span>}
                  <Pressable onClick={handleFetchRow} disabled={rowFetching} style={{ background: "transparent", border: "none", color: "var(--color-accent-primary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: rowFetching ? "not-allowed" : "pointer", padding: "0" }}>{rowFetching ? "…" : "Fetch"}</Pressable>
                  {rowData && <Pressable onClick={() => setRowViewOpen(v => !v)} style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", padding: "0" }}>{rowViewOpen ? "Hide" : "View"}</Pressable>}
                </div>
              </div>
              {rowData && rowViewOpen && (
                <div>
                  {rowData.__error
                    ? <div style={{ fontSize: "10px", color: "var(--color-red)" }}>{rowData.__error}</div>
                    : <>
                        {rowData.updated_at && <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>updated: {new Date(rowData.updated_at).toLocaleString()}</div>}
                        {rowDiff.length > 0 && <div style={{ fontSize: "9px", color: "var(--color-warning)", marginBottom: "4px" }}>Drift: {rowDiff.join(", ")}</div>}
                        {historyLine && <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>{historyLine}</div>}
                        <pre style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "10px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", maxHeight: "200px", overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {JSON.stringify(rowData, null, 2)}
                        </pre>
                      </>
                  }
                </div>
              )}
            </div>

            {/* Tax Weeks Grid */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Tax Weeks</div>
                <Pressable onClick={() => setTaxGridOpen(v => !v)} style={{ background: "transparent", border: "none", color: "var(--color-accent-primary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", padding: "0" }}>{taxGridOpen ? "Hide" : "View"}</Pressable>
              </div>
              {taxGridOpen && (() => {
                const overrides = config.pastWeekTaxStatusOverrides ?? {};
                return (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                    {allWeeks.filter(w => w.active).map(w => {
                      const wIso = toLocalIso(w.weekEnd);
                      const isPast = wIso < effectiveToday;
                      const isCurrent = w.idx === currentWeek?.idx;
                      const hasOverride = overrides[w.idx] !== undefined;
                      const bg = isPast ? "var(--color-bg-raised)" : w.taxedBySchedule ? "rgba(0,200,150,0.25)" : "var(--color-bg-base)";
                      return (
                        <div key={w.idx} title={`Wk ${w.idx}${w.taxedBySchedule ? " · taxed" : ""}${isPast ? " · past" : ""}${hasOverride ? " · override" : ""}`} style={{ position: "relative", width: "18px", height: "18px", borderRadius: "3px", background: bg, border: isCurrent ? "2px solid #c8a84b" : "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
                          {hasOverride && <div style={{ position: "absolute", top: "2px", right: "2px", width: "5px", height: "5px", borderRadius: "50%", background: "var(--color-red)" }} />}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Beta Report — docs/TODO.md, admin-only usage/feedback CSV export */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Beta Report</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <Pressable onClick={() => handleDownloadBetaReport("summary")} disabled={betaReportStatus?.loading} style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "8px 0", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: betaReportStatus?.loading ? "default" : "pointer" }}>Usage CSV</Pressable>
                <Pressable onClick={() => handleDownloadBetaReport("feedback")} disabled={betaReportStatus?.loading} style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "8px 0", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: betaReportStatus?.loading ? "default" : "pointer" }}>Feedback CSV</Pressable>
              </div>
              {betaReportStatus?.error && (
                <div style={{ fontSize: "9px", color: "var(--color-red)", marginTop: "6px" }}>{betaReportStatus.error}</div>
              )}
            </div>

            {/* Demo account editing — admin only */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Demo Accounts</div>
              {adminDemoView !== null && (
                <div style={{ fontSize: "9px", color: "var(--color-warning)", letterSpacing: "1px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Editing Demo {adminDemoView}
                </div>
              )}
              <div style={{ display: "flex", gap: "6px" }}>
                {[1, 2].map(n => (
                  <Pressable
                    key={n}
                    onClick={() => { setAdminDemoView(adminDemoView === n ? null : n); setDrawerOpen(false); }}
                    title={adminDemoView === n ? "Click to exit demo edit mode" : `Edit Demo Account ${n}`}
                    style={{
                      flex: 1,
                      background: adminDemoView === n ? "var(--color-accent-primary)" : "var(--color-bg-raised)",
                      border: adminDemoView === n ? "none" : "1px solid var(--color-border-subtle)",
                      borderRadius: "6px",
                      padding: "7px 0",
                      fontSize: "10px",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: adminDemoView === n ? "var(--color-bg-base)" : "var(--color-text-secondary)",
                      cursor: "pointer",
                      fontWeight: adminDemoView === n ? "bold" : "normal",
                      fontFamily: "var(--font-sans)",
                      minHeight: "44px",
                    }}
                  >
                    {adminDemoView === n ? "← Exit" : `Demo ${n}`}
                  </Pressable>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active section indicator at bottom */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e1e1e", fontSize: "10px", color: "var(--color-text-primary)", letterSpacing: "1px", textTransform: "uppercase" }}>
          Viewing: <span style={{ color: "var(--color-teal)" }}>{currentView}</span>
        </div>
      </div>

      {/* ── Floating Liquid Glass bottom nav pill ── */}
      <div
        className="mobile-bottom-nav"
        style={{
          display: "none",
          position: "fixed",
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          left: "16px",
          right: "16px",
          zIndex: 20,
          opacity: drawerOpen ? 0 : isScrollingDown ? 0.55 : 1,
          pointerEvents: drawerOpen ? "none" : "auto",
          transition: "opacity 0.25s ease",
        }}
      >
        <LiquidGlass
          purpose="nav"
          tone="teal"
          intensity="light"
          style={{
            width: "100%",
            borderRadius: "24px",
            // Multi-layer shadow: outer teal glow + dark lift shadow + inner top highlight
            boxShadow: "0 8px 32px rgba(0, 200, 150, 0.22), 0 4px 16px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            alignItems: "stretch",
            height: "62px",
            // Stronger tint than default 0.10 — more opaque colored glass
            background: "rgba(0, 200, 150, 0.15)",
            // More visible border to catch light on the raised edge
            border: "1px solid rgba(0, 200, 150, 0.40)",
          }}
        >
          {/* Top-edge sheen — light refraction gradient, simulates curved glass surface */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "45%",
            background: "linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, transparent 100%)",
            borderRadius: "24px 24px 0 0",
            pointerEvents: "none",
            zIndex: 1,
          }} />
          {/* Sliding tab indicator — 2px teal bar that moves to the active tab.
              Contained within the pill via overflow:hidden on LiquidGlass. */}
          {(() => {
            const toolsActive = toolSheetOpen && isAdmin;
            const coachActive = askCoachOpen;
            const baseIdx = effectiveBottomNav.findIndex(i => i.key === currentView);
            const toolsIdx = effectiveBottomNav.findIndex(i => i.key === "__tools__");
            const coachIdx = effectiveBottomNav.findIndex(i => i.key === "__coach__");
            const activeIdx = toolsActive ? toolsIdx : coachActive ? coachIdx : Math.max(baseIdx, 0);
            const pct = 100 / effectiveBottomNav.length;
            return (
              <div style={{
                position: "absolute",
                top: 0,
                left: `${activeIdx * pct}%`,
                width: `${pct}%`,
                height: "2px",
                background: toolsActive ? "var(--color-warning)" : "var(--color-accent-primary)",
                transition: "left 0.3s ease, background 0.2s ease",
                borderRadius: "0 0 1px 1px",
              }} />
            );
          })()}
          {effectiveBottomNav.map(item => {
            const isToolsBtn = item.key === "__tools__";
            const isCoachBtn = item.key === "__coach__";
            const active = isToolsBtn ? toolSheetOpen : isCoachBtn ? askCoachOpen : (currentView === item.key && !toolSheetOpen && !askCoachOpen);
            return (
              <Pressable
                key={item.key}
                onClick={() => {
                  if (isToolsBtn) {
                    setToolSheetOpen(v => !v);
                    setAskCoachOpen(false);
                    setDrawerOpen(false);
                  } else if (isCoachBtn) {
                    setAskCoachOpen(v => !v);
                    setToolSheetOpen(false);
                    setDrawerOpen(false);
                  } else {
                    setToolSheetOpen(false);
                    setAskCoachOpen(false);
                    navigateDirect(item.key);
                  }
                }}
                style={{
                  flex: 1,
                  height: "100%",
                  background: "transparent",
                  border: "none",
                  color: active
                    ? (isToolsBtn ? "var(--color-warning)" : "var(--color-accent-primary)")
                    : "var(--color-text-disabled)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                  fontSize: "9px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  paddingTop: "2px",
                  transition: "color 0.2s ease",
                  pointerEvents: drawerOpen ? "none" : "auto",
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </Pressable>
            );
          })}
        </LiquidGlass>
      </div>

      {/* ── Live State Inspector ── */}
      {isAdmin && (
        <div
          className="admin-inspector"
          style={{
            position: "fixed",
            right: "16px",
            bottom: "20px",
            zIndex: 22,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "6px",
          }}
        >
          {/* Expanded card */}
          {inspectorOpen && (
            <div style={{
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-accent)",
              borderRadius: "12px",
              padding: "12px 14px",
              width: "220px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-warning)", marginBottom: "10px", fontWeight: "bold" }}>Live State</div>
              {[
                ["Effective Today", effectiveToday, today !== effectiveToday ? `real: ${today}` : null],
                ["Week", currentWeek ? `${currentWeek.idx}` : "—", currentWeekLabel],
                ["Future Weeks", futureWeeks.length, null],
                ["Unconfirmed", unconfirmedCount, null],
                ["Extra / Check", taxDerived.extraPerCheck > 0 ? `$${taxDerived.extraPerCheck.toFixed(2)}` : "$0", null],
                ["Tax Gap", `$${Math.round(taxDerived.totalGap).toLocaleString()}`, null],
                ["Taxed Checks", taxDerived.taxedWeekCount, "remaining"],
                ["Goal Spend", `$${Math.round(fundedGoalSpend).toLocaleString()}`, "funded"],
                ["Buffer / Wk", `$${Math.round(bufferPerWeek).toLocaleString()}`, null],
                ["Weekly Income", `$${Math.round(weeklyIncome).toLocaleString()}`, null],
                ["Annual Net", `$${Math.round(projectedAnnualNet).toLocaleString()}`, null],
                // §17.F admin visibility — resolved phase + the raw lifecycle
                // fields a diagnostic session needs. Access Ends is the hidden
                // day-21 cutoff (§D/§H disclosure rule) — this Inspector is
                // isAdmin-gated, never shown to a non-admin user.
                ["Sub Phase", entitlement.state, subscription.status ? `stripe: ${subscription.status}` : null],
                ["Trial Ends", subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString() : "—", null],
                ["Access Ends", subscription.accessEndsAt ? new Date(subscription.accessEndsAt).toLocaleDateString() : "—", "hidden cutoff"],
                ["Period End", subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "—", null],
                ["Card / Dunning", subscription.cardOnFile ? "on file" : "none", subscription.dunningEmailCount ? `${subscription.dunningEmailCount} sent` : null],
              ].map(([label, val, sub]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                  <span style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)", flexShrink: 0 }}>{label}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: label === "Effective Today" && today !== effectiveToday ? "var(--color-warning)" : "var(--color-text-primary)" }}>{val}</span>
                    {sub && <div style={{ fontSize: "8px", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>{sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Pill toggle button */}
          <Pressable
            onClick={() => setInspectorOpen(v => !v)}
            style={{
              background: inspectorOpen ? "var(--color-warning)" : "rgba(245,158,11,0.18)",
              border: `1px solid ${inspectorOpen ? "var(--color-warning)" : "rgba(245,158,11,0.4)"}`,
              borderRadius: "20px",
              padding: "10px 16px",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              cursor: "pointer",
              color: inspectorOpen ? "var(--color-bg-base)" : "var(--color-warning)",
              fontSize: "9px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              fontWeight: "bold",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
            {inspectorOpen ? "Close" : "Live"}
          </Pressable>
        </div>
      )}

      {/* ── Week Inspector modal ── */}
      {isAdmin && inspectedWeek && (() => {
        const w = inspectedWeek;
        const conf = weekConfirmations[w.idx] ?? null;
        const wLookup = weekNetLookup[w.idx] ?? null;
        const netVal = computeNet(w, config, taxDerived.extraPerCheck, showExtra);
        const weekLogs = logs.filter(e => resolveEventWeekMeta(e, allWeeks).weekIdx === w.idx);
        const fC = n => (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fN = n => n != null ? fC(n) : "—";
        const Row = ({ label, val, mono = true, color }) => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)", flexShrink: 0, paddingRight: "12px" }}>{label}</span>
            <span style={{ fontSize: "11px", fontFamily: mono ? "var(--font-mono)" : "inherit", color: color ?? "var(--color-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{val}</span>
          </div>
        );
        const SH = ({ children }) => (
          <div style={{ fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", marginTop: "16px", marginBottom: "6px", borderLeft: "2px solid var(--color-accent-primary)", paddingLeft: "6px" }}>{children}</div>
        );
        return (
          <div
            onClick={() => setInspectedWeek(null)}
            style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(3,10,7,0.88)", overflow: "hidden", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 40px", touchAction: "none" }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", width: "100%", maxWidth: "480px", overflowY: "auto", maxHeight: "calc(100vh - 80px)", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "20px 18px 32px" }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-warning)", marginBottom: "4px" }}>Week Inspector</div>
                  <div style={{ fontSize: "17px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
                    Wk {w.idx} · {w.weekEnd instanceof Date ? w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : w.weekEnd}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "3px" }}>
                    {w.weekStart instanceof Date ? w.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : w.weekStart}
                    {" – "}
                    {w.weekEnd instanceof Date ? w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : w.weekEnd}
                  </div>
                </div>
                <Pressable
                  onClick={() => setInspectedWeek(null)}
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.45)", borderRadius: "50%", width: "52px", height: "52px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-red)", fontSize: "24px", lineHeight: 1, flexShrink: 0 }}
                  aria-label="Close week inspector"
                >×</Pressable>
              </div>

              {/* Badges */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                {[
                  [w.rotation, w.isHighWeek ? "var(--color-teal)" : "var(--color-text-secondary)"],
                  [w.taxedBySchedule ? "Taxed" : "Exempt", w.taxedBySchedule ? "var(--color-green)" : "var(--color-text-disabled)"],
                  [w.isHighWeek ? "High Week" : "Low Week", w.isHighWeek ? "var(--color-teal)" : "var(--color-text-disabled)"],
                  [w.active ? "Active" : "Inactive", w.active ? "var(--color-green)" : "var(--color-text-disabled)"],
                  ...(conf ? [["Confirmed", "var(--color-accent-primary)"]] : [["Unconfirmed", "var(--color-text-disabled)"]]),
                ].map(([label, color]) => (
                  <span key={label} style={{ fontSize: "8px", letterSpacing: "1px", textTransform: "uppercase", color, background: color + "18", border: `1px solid ${color}44`, borderRadius: "4px", padding: "2px 7px" }}>{label}</span>
                ))}
              </div>

              {/* Schedule */}
              <SH>Schedule</SH>
              <Row label="Worked Days" val={(w.workedDayNames ?? []).join(", ") || "—"} />
              <Row label="Total Hours" val={w.totalHours ?? "—"} />
              <Row label="Regular Hours" val={w.regularHours ?? "—"} />
              <Row label="Overtime Hours" val={w.overtimeHours > 0 ? w.overtimeHours : "—"} color={w.overtimeHours > 0 ? "var(--color-deduction)" : undefined} />
              <Row label="Weekend Hours" val={w.weekendHours > 0 ? w.weekendHours : "—"} color={w.weekendHours > 0 ? "var(--color-teal)" : undefined} />

              {/* Pay */}
              <SH>Pay</SH>
              <Row label="Gross Pay" val={fN(w.grossPay)} />
              <Row label="Taxable Gross" val={fN(w.taxableGross)} />
              <Row label="Benefits Deduction" val={fN(w.benefitsDeduction)} color="var(--color-deduction)" />
              <Row label="401k (Employee)" val={fN(w.k401kEmployee)} color="var(--color-deduction)" />
              <Row label="401k (Employer)" val={fN(w.k401kEmployer)} color="var(--color-green)" />
              <Row label="computeNet (live)" val={fN(netVal)} color="var(--color-green)" />

              {/* Net Lookup */}
              {wLookup && <>
                <SH>Net Lookup</SH>
                <Row label="Base Net" val={fN(wLookup.baseNet)} />
                <Row label="Event Adjustment" val={wLookup.adjustment !== 0 ? fC(wLookup.adjustment) : "none"} color={wLookup.adjustment > 0 ? "var(--color-green)" : wLookup.adjustment < 0 ? "var(--color-deduction)" : "var(--color-text-disabled)"} />
                <Row label="Adjusted Net" val={fN(wLookup.adjustedNet)} color="var(--color-text-primary)" />
                <Row label="Spendable" val={fN(wLookup.spendable)} />
                <Row label="Adj Spendable" val={fN(wLookup.adjustedSpendable)} />
              </>}

              {/* Confirmation */}
              <SH>Confirmation</SH>
              {conf ? <>
                <Row label="Confirmed At" val={new Date(conf.confirmedAt).toLocaleString()} mono={false} />
                <Row label="Net Shift Delta" val={conf.netShiftDelta ?? 0} />
                {conf.missedScheduledDays?.length > 0 && <Row label="Missed Days" val={conf.missedScheduledDays.join(", ")} color="var(--color-deduction)" />}
                {conf.pickupDays?.length > 0 && <Row label="Pickup Days" val={conf.pickupDays.join(", ")} color="var(--color-green)" />}
                {conf.autoConfirmed && <Row label="Auto-confirmed" val="yes" color="var(--color-text-disabled)" />}
              </> : <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", padding: "6px 0" }}>Not confirmed</div>}

              {/* Log Entries */}
              <SH>Log Entries ({weekLogs.length})</SH>
              {weekLogs.length === 0
                ? <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", padding: "6px 0" }}>None</div>
                : weekLogs.map(e => {
                    const imp = calcEventImpact(e, config);
                    const isB = e.type === "bonus";
                    const ev = EVENT_TYPES[e.type] ?? { label: e.type, color: "var(--color-text-secondary)", icon: "?" };
                    return (
                      <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ fontSize: "9px", color: ev.color }}>{ev.icon} {ev.label}</span>
                        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: isB ? "var(--color-green)" : "var(--color-deduction)" }}>
                          {isB ? "+" : "-"}{fC(isB ? imp.netGained : imp.netLost)} net
                        </span>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        );
      })()}

      {/* ── Admin Tools slide-up sheet ── */}
      {isAdmin && (
        <>
          {/* Backdrop — also hides the nav pill beneath it */}
          {toolSheetOpen && (
            <div
              onClick={() => { setToolSheetOpen(false); setSheetDragY(0); }}
              style={{
                position: "fixed", inset: 0, zIndex: 24,
                background: "rgba(3, 10, 7, 0.82)",
                cursor: "pointer",
                touchAction: "none",
              }}
            />
          )}
          {/* Sheet */}
          <div
            className="mobile-admin-sheet"
            style={{
              display: "none",
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 25,
              transform: toolSheetOpen ? `translateY(${sheetDragY}px)` : "translateY(100%)",
              transition: sheetDragY > 0 ? "none" : "transform 0.28s ease",
              borderRadius: "20px 20px 0 0",
              background: "var(--color-bg-surface)",
              borderTop: "1px solid var(--color-border-accent)",
              borderLeft: "1px solid var(--color-border-subtle)",
              borderRight: "1px solid var(--color-border-subtle)",
              maxHeight: "82vh",
              overflowY: "auto",
              overflowX: "hidden",
              touchAction: "pan-y",
            }}
          >
            {/* Handle bar — full-width drag zone, min 44px tall */}
            <div
              style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "44px", cursor: "grab", touchAction: "none" }}
              onTouchStart={e => { sheetDragStartY.current = e.touches[0].clientY; }}
              onTouchMove={e => {
                if (sheetDragStartY.current === null) return;
                const dy = e.touches[0].clientY - sheetDragStartY.current;
                if (dy > 0) setSheetDragY(dy);
              }}
              onTouchEnd={() => {
                if (sheetDragY > 120) {
                  setToolSheetOpen(false);
                }
                setSheetDragY(0);
                sheetDragStartY.current = null;
              }}
            >
              <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: sheetDragY > 0 ? "rgba(0,200,150,0.6)" : "rgba(0,200,150,0.3)", transition: "background 0.15s ease" }} />
            </div>

            {/* Header */}
            <div style={{ padding: "10px 20px 12px", borderBottom: "1px solid var(--color-border-subtle)" }}>
              {/* Row 1: title + close */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-warning)", fontWeight: "bold" }}>
                    Admin Tools
                  </span>
                </div>
                <Pressable
                  onClick={() => { setToolSheetOpen(false); setSheetDragY(0); }}
                  style={{ background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "50%", width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}
                  aria-label="Close admin tools"
                >×</Pressable>
              </div>
              {/* Row 2: current panel context + active lock pill */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
                  On: <span style={{ color: "var(--color-text-primary)" }}>{NAV_ITEMS.find(i => i.key === currentView)?.label ?? "Home"}</span>
                </span>
                {tempLockDate && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: "4px", padding: "3px 7px 3px 8px", color: "var(--color-warning)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <span>Locked: {new Date(tempLockDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <Pressable
                      onClick={() => { setTempLockDate(null); setAdminDateDraft(""); }}
                      style={{ background: "transparent", border: "none", color: "var(--color-warning)", fontSize: "12px", lineHeight: 1, cursor: "pointer", padding: "0", marginLeft: "1px" }}
                      aria-label="Clear lock date"
                    >×</Pressable>
                  </div>
                )}
              </div>
            </div>

            {/* Tool sections — each separated by a divider */}
            <div style={{ padding: "0 20px" }}>

              {/* ── Lock Date ── */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Lock Date</div>
                {tempLockDate ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--color-warning)", fontFamily: "var(--font-mono)", flex: 1 }}>{tempLockDate}</span>
                    <Pressable
                      onClick={() => { setTempLockDate(null); setAdminDateDraft(""); }}
                      style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "6px", color: "var(--color-deduction)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
                    >Clear ×</Pressable>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input
                      type="date"
                      value={adminDateDraft}
                      onChange={e => setAdminDateDraft(e.target.value)}
                      style={{ width: "100%", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "16px", padding: "10px 12px", fontFamily: "var(--font-mono)", colorScheme: "dark", boxSizing: "border-box" }}
                    />
                    <Pressable
                      onClick={() => { if (adminDateDraft) setTempLockDate(adminDateDraft); }}
                      disabled={!adminDateDraft}
                      style={{ width: "100%", background: adminDateDraft ? "var(--color-accent-primary)" : "var(--color-bg-raised)", border: "none", borderRadius: "8px", color: adminDateDraft ? "var(--color-bg-base)" : "var(--color-text-disabled)", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", padding: "11px 0", cursor: adminDateDraft ? "pointer" : "not-allowed", fontWeight: "bold", minHeight: "44px" }}
                    >Set Lock Date</Pressable>
                  </div>
                )}
              </div>

              {/* ── Force Sync ── */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Sync</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {["push", "pull"].map(op => (
                    <Pressable
                      key={op}
                      onClick={op === "push" ? handleForcePush : handleForcePull}
                      disabled={!!syncStatus?.pending}
                      style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: syncStatus?.pending ? "var(--color-text-disabled)" : "var(--color-text-primary)", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", padding: "11px 0", cursor: syncStatus?.pending ? "not-allowed" : "pointer", minHeight: "44px" }}
                    >{op === "push" ? "Push ↑" : "Pull ↓"}</Pressable>
                  ))}
                </div>
                {syncStatus && (
                  <div style={{ fontSize: "10px", marginTop: "8px", letterSpacing: "0.5px", color: syncStatus.pending ? "var(--color-text-secondary)" : syncStatus.ok ? "var(--color-green)" : "var(--color-red)" }}>
                    {syncStatus.pending
                      ? (syncStatus.op === "push" ? "Pushing…" : "Pulling…")
                      : syncStatus.ok
                        ? `✓ ${syncStatus.op === "push" ? "Pushed" : "Pulled"} · ${syncStatus.ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                        : `✗ ${syncStatus.op === "push" ? "Push" : "Pull"} failed`}
                  </div>
                )}
              </div>

              {/* ── Reopen Last Check-In ── */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Weekly Check-In</div>
                <button
                  onClick={handleReopenLastCheckIn}
                  disabled={reopenableWeekIdx == null}
                  style={{ width: "100%", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: reopenableWeekIdx == null ? "var(--color-text-disabled)" : "var(--color-text-primary)", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", padding: "11px 0", cursor: reopenableWeekIdx == null ? "not-allowed" : "pointer", minHeight: "44px", fontWeight: "bold" }}
                >{reopenableWeekIdx == null ? "No check-in to reopen" : `Reopen Last Check-In · Wk ${reopenableWeekIdx}`}</button>
                <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginTop: "6px", lineHeight: "1.4" }}>
                  Reopens the most recent confirmed week's modal for review. Income projections are unaffected.
                </div>
              </div>

              {/* ── Config JSON ── */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: configViewOpen ? "10px" : "0" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Config JSON</div>
                  <Pressable
                    onClick={() => setConfigViewOpen(v => !v)}
                    style={sheetToggleBtnStyle}
                  >{configViewOpen ? "Hide ↑" : "View ↓"}</Pressable>
                </div>
                {configViewOpen && (
                  <div>
                    <pre style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "10px 12px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", maxHeight: "200px", overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                      {JSON.stringify(config, null, 2)}
                    </pre>
                    <Pressable
                      onClick={() => navigator.clipboard?.writeText(JSON.stringify(config, null, 2))}
                      style={{ marginTop: "8px", width: "100%", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "11px 0", cursor: "pointer", minHeight: "44px" }}
                    >Copy to Clipboard</Pressable>
                  </div>
                )}
              </div>

              {/* ── DB Row Viewer ── */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: rowData && rowViewOpen ? "10px" : "0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>DB Row</div>
                    {rowDiff.length > 0 && <span style={{ fontSize: "9px", color: "var(--color-warning)", letterSpacing: "1px" }}>{rowDiff.length} drift</span>}
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <Pressable onClick={handleFetchRow} disabled={rowFetching} style={{ ...sheetToggleBtnStyle, cursor: rowFetching ? "not-allowed" : "pointer" }}>{rowFetching ? "…" : "Fetch"}</Pressable>
                    {rowData && <Pressable onClick={() => setRowViewOpen(v => !v)} style={{ ...sheetToggleBtnStyle, color: "var(--color-text-secondary)" }}>{rowViewOpen ? "Hide ↑" : "View ↓"}</Pressable>}
                  </div>
                </div>
                {rowData && rowViewOpen && (
                  rowData.__error
                    ? <div style={{ fontSize: "10px", color: "var(--color-red)" }}>{rowData.__error}</div>
                    : <>
                        <div style={{ display: "flex", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                          {rowData.updated_at && <span style={{ fontSize: "9px", color: "var(--color-text-secondary)" }}>updated: {new Date(rowData.updated_at).toLocaleString()}</span>}
                          {rowDiff.length > 0 && <span style={{ fontSize: "9px", color: "var(--color-warning)" }}>Drift: {rowDiff.join(", ")}</span>}
                          {historyLine && <span style={{ fontSize: "9px", color: "var(--color-text-secondary)" }}>{historyLine}</span>}
                        </div>
                        <pre style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "10px 12px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", maxHeight: "200px", overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {JSON.stringify(rowData, null, 2)}
                        </pre>
                      </>
                )}
              </div>

              {/* ── Tax Weeks Grid ── */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: taxGridOpen ? "10px" : "0" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Tax Weeks</div>
                  <Pressable onClick={() => setTaxGridOpen(v => !v)} style={sheetToggleBtnStyle}>{taxGridOpen ? "Hide ↑" : "View ↓"}</Pressable>
                </div>
                {taxGridOpen && (() => {
                  const overrides = config.pastWeekTaxStatusOverrides ?? {};
                  const activeWeeks = allWeeks.filter(w => w.active);
                  return (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginBottom: "10px" }}>
                        {activeWeeks.map(w => {
                          const wIso = toLocalIso(w.weekEnd);
                          const isPast = wIso < effectiveToday;
                          const isCurrent = w.idx === currentWeek?.idx;
                          const hasOverride = overrides[w.idx] !== undefined;
                          const bg = isPast ? "var(--color-bg-raised)" : w.taxedBySchedule ? "rgba(0,200,150,0.25)" : "var(--color-bg-base)";
                          return (
                            <div key={w.idx} title={`Wk ${w.idx}${w.taxedBySchedule ? " · taxed" : ""}${isPast ? " · past" : ""}${hasOverride ? " · override" : ""}`} style={{ position: "relative", width: "20px", height: "20px", borderRadius: "3px", background: bg, border: isCurrent ? "2px solid #c8a84b" : "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
                              {hasOverride && <div style={{ position: "absolute", top: "2px", right: "2px", width: "5px", height: "5px", borderRadius: "50%", background: "var(--color-red)" }} />}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        {[
                          { bg: "rgba(0,200,150,0.25)", label: "Taxed / future" },
                          { bg: "var(--color-bg-base)", label: "Untaxed / future" },
                          { bg: "var(--color-bg-raised)", label: "Past" },
                        ].map(({ bg, label }) => (
                          <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: bg, border: "1px solid var(--color-border-subtle)", flexShrink: 0 }} />
                            <span style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>{label}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--color-bg-base)", border: "2px solid #c8a84b", flexShrink: 0 }} />
                          <span style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>Current wk</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* ── Beta Report ── docs/TODO.md, admin-only usage/feedback CSV export */}
              <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Beta Report</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Pressable
                    onClick={() => handleDownloadBetaReport("summary")}
                    disabled={betaReportStatus?.loading}
                    style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "11px 0", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: betaReportStatus?.loading ? "default" : "pointer", minHeight: "44px" }}
                  >
                    {betaReportStatus?.loading ? "…" : "Usage CSV"}
                  </Pressable>
                  <Pressable
                    onClick={() => handleDownloadBetaReport("feedback")}
                    disabled={betaReportStatus?.loading}
                    style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "11px 0", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: betaReportStatus?.loading ? "default" : "pointer", minHeight: "44px" }}
                  >
                    {betaReportStatus?.loading ? "…" : "Feedback CSV"}
                  </Pressable>
                </div>
                {betaReportStatus?.error && (
                  <div style={{ fontSize: "10px", color: "var(--color-red)", marginTop: "6px" }}>{betaReportStatus.error}</div>
                )}
              </div>

              {/* ── Demo Accounts ── */}
              <div style={{ padding: "14px 0" }}>
                <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                  Demo Accounts
                  {adminDemoView !== null && (
                    <span style={{ color: "var(--color-warning)", marginLeft: "8px" }}>· Editing Demo {adminDemoView}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[1, 2].map(n => (
                    <Pressable
                      key={n}
                      onClick={() => { setAdminDemoView(adminDemoView === n ? null : n); setToolSheetOpen(false); }}
                      style={{ flex: 1, background: adminDemoView === n ? "var(--color-accent-primary)" : "var(--color-bg-raised)", border: adminDemoView === n ? "none" : "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "11px 0", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: adminDemoView === n ? "var(--color-bg-base)" : "var(--color-text-secondary)", cursor: "pointer", fontWeight: adminDemoView === n ? "bold" : "normal", minHeight: "44px" }}
                    >
                      {adminDemoView === n ? "← Exit Demo" : `Demo ${n}`}
                    </Pressable>
                  ))}
                </div>
              </div>

              {/* Bottom safe-area spacer */}
              <div style={{ height: "calc(72px + env(safe-area-inset-bottom, 0px))" }} />
            </div>
          </div>
        </>
      )}

      {/* ── Weekly work confirmation modal ──
          Shows when: unconfirmed past week exists AND confirmDismissed is false.
          confirmDismissed resets to false on reload, so the modal auto-pops each session
          until all past weeks are confirmed. Badge click also clears it if user dismissed.
          onDismiss: session-only skip — badge persists and re-opens modal on next click.
      */}
      {confirmTriggerWeek && !confirmDismissed && (
        <WeekConfirmModal
          key={confirmTriggerWeek.idx}
          week={confirmTriggerWeek}
          priorWeek={allWeeks.find(w => w.idx === confirmTriggerWeek.idx - 1) ?? null}
          config={config}
          logs={logs}
          isAdmin={isAdmin}
          pendingCount={unconfirmedCount}
          onConfirm={(confirmation, logEntry) => {
            const DAY_NAMES_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const confirmedAt = new Date().toISOString();
            // Biweekly two-week flow bundles the first week's real confirmation +
            // log entry under `firstWeek`; strip it out of the stored paycheck-week
            // record so we don't duplicate the log blob in persistence.
            const firstWeek = confirmation.firstWeek ?? null;
            const { firstWeek: _omitFirstWeek, ...payWeekConfirmation } = confirmation;
            // Computed synchronously (not a setState updater) so the exact same
            // value can go to setState AND the eager save below — same pattern
            // ProfilePanel's saveConfigNow call sites already use.
            const next = { ...weekConfirmations, [confirmTriggerWeek.idx]: payWeekConfirmation };
            if (firstWeek) {
              // The modal collected the first week explicitly — store its record.
              next[firstWeek.idx] = firstWeek.confirmation;
            } else if ((config.userPaySchedule === "biweekly" || config.userPaySchedule === "salary") && confirmTriggerWeek.idx > 0) {
              // Salary (and biweekly first-period fallback): auto-confirm the
              // paired non-paycheck week (the one before) as clean.
              const priorIdx = confirmTriggerWeek.idx - 1;
              if (!next[priorIdx]) {
                const prior = allWeeks.find(w => w.idx === priorIdx);
                if (prior?.active) {
                  next[priorIdx] = {
                    confirmedAt, autoConfirmed: true, eventId: null,
                    dayToggles: Object.fromEntries(DAY_NAMES_ORDER.map(d => [d, prior.workedDayNames?.includes(d) ? true : null])),
                    scheduledDays: prior.workedDayNames ?? [], missedScheduledDays: [], pickupDays: [], netShiftDelta: 0,
                  };
                }
              }
            }
            // Monthly: auto-confirm all other weeks in the same month as clean
            if (config.userPaySchedule === "monthly") {
              const m = confirmTriggerWeek.weekEnd.getMonth(), y = confirmTriggerWeek.weekEnd.getFullYear();
              for (const w of allWeeks) {
                if (w.active && w.idx !== confirmTriggerWeek.idx && w.weekEnd.getMonth() === m && w.weekEnd.getFullYear() === y && !next[w.idx]) {
                  next[w.idx] = {
                    confirmedAt, autoConfirmed: true, eventId: null,
                    dayToggles: Object.fromEntries(DAY_NAMES_ORDER.map(d => [d, w.workedDayNames?.includes(d) ? true : null])),
                    scheduledDays: w.workedDayNames ?? [], missedScheduledDays: [], pickupDays: [], netShiftDelta: 0,
                  };
                }
              }
            }
            const newLogs = [
              ...logs,
              ...(logEntry ? [logEntry] : []),
              ...(firstWeek?.logEntry ? [firstWeek.logEntry] : []),
            ];
            setWeekConfirmations(next);
            setLogs(newLogs);
            // Eager save — a completed weekly check-in is exactly the kind of
            // work that shouldn't sit in the 800ms debounce window; a
            // backgrounded/reclaimed mobile tab before it fires meant the
            // confirmation was silently lost and the modal popped right back up.
            savePersistedStateNow({ weekConfirmations: next, logs: newLogs });
          }}
          onDismiss={() => setConfirmDismissed(true)}
        />
      )}
      {/* ── PWA install instructions (§16) — single instance, opened from drawer + Account panel ── */}
      <PwaInstallModal ref={pwaModalRef} />

      {/* ── Ask Coach (§18.B) — left admin/tester-only; now also open to a real
          trial/paid entitlement (docs/coach-entry-points.md §1) ── */}
      {askCoachOpen && canAccessAskCoachGeneral({ isAdmin, isTester, entitlement }) && (
        <AskCoachPanel
          onClose={() => setAskCoachOpen(false)}
          config={config}
          expenses={expenses}
          goals={goals}
          weeklyIncome={weeklyIncome}
          avgWeeklySpend={remainingSpend.avgWeeklySpend}
          fundedGoalSpend={fundedGoalSpend}
          currentWeek={currentWeek}
          today={effectiveToday}
          logs={logs}
          futureWeeks={futureWeeks}
          timelineWeekNets={futureWeekNetsRaw}
          futureWeekNets={futureWeekNets}
          logNetLost={logTotals.netLost}
          logNetGained={logTotals.netGained}
          futureEventDeductions={futureEventDeductions}
          prevWeekNet={prevWeekNet}
          allWeeks={allWeeks}
          runwayDays={coachRunwayDays}
        />
      )}

      {/* ── Life Events menu (entry point modal — TODO §15.A) ── */}
      <LifeEventMenu
        open={lifeEventMenu}
        onClose={() => setLifeEventMenu(false)}
        onSelect={(route) => {
          if (route === "job_loss") setJobLossEntryOpen(true);
          else if (route === "rate_update") setRateUpdateOpen(true);
          else setWizardEntry(route);
        }}
      />
      {/* ── Job Loss Mode entry (TODO §15.C1) ── */}
      <JobLossEntry
        open={jobLossEntryOpen}
        onClose={() => setJobLossEntryOpen(false)}
        expenses={expenses}
        config={config}
        onActivate={(patch, updatedExpenses) => {
          configHistoryMetaRef.current = { source: "life_event:lost_job", effectiveFrom: patch.jobLossDate ?? undefined };
          const nextConfig = { ...config, ...patch };
          setConfig(nextConfig);
          if (updatedExpenses) setExpenses(updatedExpenses);
          // historySource omitted — configHistoryMetaRef is already set above with the
          // more specific life_event:lost_job + effectiveFrom pair savePersistedStateNow's
          // `??=` would otherwise leave untouched anyway.
          savePersistedStateNow(updatedExpenses ? { config: nextConfig, expenses: updatedExpenses } : { config: nextConfig });
        }}
      />
      {/* ── Quick Rate Update (TODO §15.D) ── */}
      <RateUpdateModal
        open={rateUpdateOpen}
        onClose={() => setRateUpdateOpen(false)}
        config={config}
        onActivate={(patch) => {
          configHistoryMetaRef.current = { source: "life_event:rate_update", effectiveFrom: patch.effectiveFrom };
          const nextConfig = { ...config, baseRate: patch.baseRate };
          setConfig(nextConfig);
          // historySource omitted — configHistoryMetaRef is already set above (mirrors
          // JobLossEntry's onActivate just above).
          savePersistedStateNow({ config: nextConfig });
        }}
      />
      {/* ── Setup wizard — first-run (wizardEntry===false) or re-entry (life event string) ── */}
      {(wizardEntry !== null || wizardExiting) && (
        <SetupWizard
          config={config}
          onComplete={handleWizardComplete}
          onCancel={
            wizardEntry !== false
              ? () => closeWizardWithAnimation()
              : config.isInvestor
                ? () => { closeWizardWithAnimation(); setActiveInvestorAccount(1); }
                : undefined
          }
          lifeEvent={wizardEntry === false ? null : wizardEntry}
          isInvestor={config.isInvestor}
          isExiting={wizardExiting}
        />
      )}
    </div>
  );

  // During post-login fade (340ms after sign-in), render both LoginScreen (fading out)
  // and authenticated shell (fading in) at the same time for a smooth crossfade.
  if (postLoginFade) {
    return (
      <div style={{ position: "relative" }}>
        {/* LoginScreen fading out (absolute, behind) */}
        <div
          className="fold-lift"
          data-fold="exiting"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <LoginScreen
            onInvestorVerified={code => setInvestorSession({ code })}
            oauthCallbackFailed={oauthCallbackFailed}
            onOauthRetry={() => setOauthCallbackFailed(false)}
          />
        </div>
        {/* Authenticated shell fading in (relative, in front) */}
        <div className="fold-lift" data-fold="entering" style={{ position: "relative", zIndex: 1 }}>
          {shellContent}
        </div>
      </div>
    );
  }

  // Normal render: either LoginScreen (if not authed) or authenticated shell
  return shellContent;
}
