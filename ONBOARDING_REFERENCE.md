# Timebox Onboarding — Reference Doc

## Navigation Flow

```
LandingPage
    ↓
    ├─ Get Started → AuthPage (signup) → OnboardingWizard → OnboardingTour → App
    ├─ Log In → AuthPage (login) → [If new user] OnboardingWizard → OnboardingTour → App
    └─ Try without account → OnboardingWizard → OnboardingTour → App (visit mode)
```

Dev preview: `?page=landing`, `?page=auth`, `?page=setup`

---

## Screens

### 1. LandingPage (`LandingPage.tsx`)
Marketing homepage. Hero with headline + app preview mockup on right. Two CTAs: "Get started — it's free" (primary) and "Try without an account →" (secondary). Features grid (2-col) showcasing time blocking, backlog, plan vs actual, recurring events. Bottom CTA + footer.

**Props:** `onGetStarted`, `onLogIn`, `onTryItOut`

### 2. AuthPage (`AuthPage.tsx`)
Sign up / log in form inside a card. Tab toggle between modes. Email + password fields. Error handling for duplicate accounts, unconfirmed emails, wrong credentials. Email confirmation screen when needed. "Try without signing in" fallback. Back button to landing.

**Props:** `supabase`, `mode` (signup/login), `onVisitMode`, `onBack`

### 3. OnboardingWizard (`OnboardingWizard.tsx`)
2-step centered wizard.
- **Step 1:** "What should we call you?" — name input (placeholder: Sheila), Continue button
- **Step 2:** "Hey [name], how would you like to start?" — two side-by-side cards:
  - **Template** (recommended): 4 calendars, 12 categories, color swatches
  - **Blank**: Just Personal calendar, build your own
- Progress dots + step label ("Step X of 2 — description")

**Props:** `onComplete({ name, choice, showTour })`, `initialName`

### 4. OnboardingTour (`OnboardingTour.tsx`)
4-step guided overlay tour highlighting app elements with spotlight:
1. **Your calendars** → left sidebar
2. **Manage & organise** → calendar list
3. **Your task backlog** → right sidebar
4. **Drag to schedule** → add task button

Keyboard nav: Enter/→ = next, Escape = skip. Progress dots + "Skip tour" / "Next" / "Finish".

**Props:** `onComplete`

---

## Design Language

### Colors
| Token | Hex | Use |
|-------|-----|-----|
| Primary green | `#8DA286` | Accents, active states, borders |
| CTA green | `#4A6741` | Primary buttons |
| CTA hover | `#3D5736` | Button hover |
| Text primary | `#1C1C1E` | Headings, body |
| Text secondary | `#636366` | Descriptions |
| Text tertiary | `#8E8E93` | Labels, hints |
| Text disabled | `#C7C7CC` | Placeholder, disabled |
| Bg page | `#FDFDFB` | Page background (parchment) |
| Bg panel | `#FCFBF7` | Sidebar, section bg |
| Bg card | `#FFFFFF` | Cards, modals |
| Bg input | `#F5F4F0` | Input unfocused |
| Bg tab | `#F0EFE9` | Tab track |
| Error | `#FF3B30` | Error text/border |
| Success | `#34C759` | Success text |
| Border | `rgba(0,0,0,0.07)` | Default borders |
| Border medium | `rgba(0,0,0,0.10)` | Stronger borders |

### Calendar Palette (Template)
`#5B718C` (slate blue), `#8DA387` (sage), `#B3B46D` (gold), `#DE8D91` (rose)

### Typography
- **Font:** `system-ui, -apple-system, sans-serif`
- **Hero heading:** clamp(2rem, 4vw, 3rem), bold, tight tracking
- **Section heading:** 24px bold
- **Card title:** 14px semibold
- **Body:** 14–17px, relaxed line-height
- **Small/label:** 10–12px, often uppercase + letter-spacing
- **Button:** 14px semibold

### Spacing
- **Padding:** 8 / 12 / 16 / 20 / 24 / 32px
- **Gap:** 4 / 8 / 12 / 16 / 24px
- **Border radius:** 10 (small), 12 (button), 16 (card), 24 (large card)

### Shadows
- Subtle: `0 1px 4px rgba(0,0,0,0.04)`
- Card: `0 2px 12px rgba(0,0,0,0.06)`
- Modal: `0 4px 24px rgba(0,0,0,0.08)`
- Heavy: `0 12px 40px rgba(0,0,0,0.18)`

### Interactions
- Button hover: darker shade + `translateY(-1px)` + stronger shadow
- Input focus: white bg + `#8DA286` border
- Disabled: 40% opacity
- Transitions: 200–300ms ease-out

---

## App.tsx Integration

### Key State
- `preAuthScreen`: `'landing'` | `'auth'`
- `authMode`: `'signup'` | `'login'`
- `visitMode`: boolean — unauthenticated access
- `userName`: string — from wizard step 1
- `hasCompletedSetup`: boolean — wizard completed
- `showTour`: boolean — overlay tour active
- `onboardingTourComplete`: boolean — persisted, never show again

### Screen Resolution (`appScreen`)
```
1. Dev override: ?page= param (dev only)
2. !requireAuth → 'app' (dev bypass)
3. session && !dataReady → 'loading'
4. !session && !visitMode → preAuthScreen ('landing' or 'auth')
5. !hasCompletedSetup → 'setup' (wizard)
6. Otherwise → 'app'
```

### Wizard Completion Handler
```ts
handleWizardComplete({ name, choice, showTour }) {
  setUserName(name);
  if (choice === 'template') applyTemplate();
  else applyBlankSetup();
  setHasCompletedSetup(true);
  if (showTour) setShowTour(true);
}
```

---

## Next Steps

### AuthPage Redesign (Priority)
The auth page needs a full visual overhaul to match the polished design language:
- Fixed-size compact card (not stretching full width)
- Match the calm parchment aesthetic of the rest of the app
- Proper vertical centering with brand presence
- Refined input styling, error states, and transitions
- Consistent button styling with the deep forest green CTA language
