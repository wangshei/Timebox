# Privacy Policy — The Timeboxing Club

**Last updated:** March 1, 2026

The Timeboxing Club ("we," "us," or "our") respects your privacy. This Privacy Policy explains what data we collect, how we use it, and your rights regarding that data when you use our web application at timeboxing.club ("the Service").

---

## 1. What Data We Collect

### Account Information

- **Email address** — used for authentication and transactional emails (confirmation, password reset)
- **Password** — stored as a secure hash by our authentication provider; we never have access to your plaintext password
- **Display name** — optional, provided during onboarding

### User-Created Content

- **Tasks** — titles, time estimates, due dates, priorities, notes, descriptions, links
- **Time blocks** — scheduled time slots with start/end times, confirmation status, recorded vs. planned times
- **Events** — titles, times, recurrence patterns, notes, descriptions
- **Organizational data** — calendars, categories, and tags you create (names and colors)

### Preferences and Settings

- Timezone, calendar view preferences, sidebar state, week start day, onboarding completion status

### Automatically Collected Data

- **Browser local storage** — we cache your data locally for offline access and performance
- **One cookie** — a `sidebar_state` cookie that remembers your sidebar preference (expires after 7 days)

### What We Do NOT Collect

- We do not use analytics or tracking tools (no Google Analytics, no Mixpanel, no Segment)
- We do not use advertising networks or retargeting pixels
- We do not collect device fingerprints, IP addresses, or location data
- We do not use third-party cookies for tracking

## 2. How We Collect Data

| Method | Data |
|--------|------|
| Directly from you | Account info (email, name, password), all tasks/events/time blocks you create, preferences you set |
| Automatically | Sidebar state cookie, local storage cache |

We do not collect data from third-party sources. If we add calendar integrations (e.g., Google Calendar) in the future, we will update this policy before collecting any external data.

## 3. Why We Collect Data (Purpose)

| Purpose | Data Used |
|---------|-----------|
| Provide the Service | All user-created content, account info, preferences |
| Authenticate you | Email, password hash |
| Send transactional emails | Email address (confirmation, password reset only) |
| Sync across devices | All user-created content (via cloud database) |
| Remember your preferences | Sidebar cookie, local storage |

We do not use your data for advertising, profiling, or marketing purposes. We do not send marketing emails.

## 4. How We Store and Protect Data

- **Cloud database:** Your data is stored in Supabase (hosted on AWS infrastructure in the United States). Data is encrypted in transit (TLS/HTTPS) and at rest.
- **Authentication:** Managed by Supabase Auth with secure password hashing (bcrypt). Sessions use JWT tokens over HTTPS.
- **Access control:** Row Level Security (RLS) ensures each user can only access their own data. No other user or administrator can view your content through the application.
- **Local storage:** A copy of your data is cached in your browser's local storage for offline access. This data stays on your device and is not transmitted except to sync with your account.

## 5. Data Retention

- Your data is retained for as long as your account exists.
- Visit Mode data (no account) is stored only in your browser's local storage and is never sent to our servers. It persists until you clear your browser data.
- When you request account deletion, we will delete all your data from our database within 30 days. Local storage data on your devices must be cleared by you.
- Bug reports submitted through the app are retained indefinitely for product improvement but contain only the description you provide and optionally your email.

## 6. Third-Party Services

We use the following third-party services to operate The Timeboxing Club:

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| Supabase | Database, authentication, real-time sync | All account and user-created data |
| Resend | Transactional email delivery | Email address (for confirmation and password reset emails only) |
| Vercel | Web hosting | Standard web server logs (IP, user agent) — we do not access or retain these |

**We do not sell, rent, or share your personal data with any other third parties.**

Each service listed above has its own privacy policy. We encourage you to review them:

- [Supabase Privacy Policy](https://supabase.com/privacy)
- [Resend Privacy Policy](https://resend.com/legal/privacy-policy)
- [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

## 7. Cookies and Tracking

We use one cookie:

| Cookie | Purpose | Duration |
|--------|---------|----------|
| `sidebar_state` | Remembers whether the sidebar is open or closed | 7 days |

This is a functional cookie required for the Service to work properly. We do not use tracking cookies, advertising cookies, or any third-party cookies. Because we only use a strictly necessary functional cookie, no cookie consent banner is required under most regulations.

## 8. Your Rights

Regardless of where you live, you have the right to:

- **Access** — request a copy of the data we hold about you
- **Correction** — update or correct inaccurate data (you can do this directly in the app)
- **Deletion** — request that we delete your account and all associated data
- **Export** — request a copy of your data in a portable format

### For California Residents (CCPA)

Under the California Consumer Privacy Act, you have the right to know what personal information we collect, request its deletion, and opt out of the sale of personal information. **We do not sell personal information.**

### For EU/EEA Residents (GDPR)

If you are located in the European Union or European Economic Area, our legal basis for processing your data is:

- **Contract performance** — processing necessary to provide the Service you signed up for (account data, user-created content)
- **Legitimate interest** — functional cookie for UI preferences

You additionally have the right to data portability, the right to restrict processing, and the right to lodge a complaint with your local data protection authority.

### For Canadian Residents (PIPEDA)

We collect, use, and disclose your personal information only for the purposes described in this policy. You may withdraw consent at any time by deleting your account.

To exercise any of these rights, contact us at hi@timeboxing.club. We will respond within 30 days.

## 9. Children's Privacy

The Timeboxing Club is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected data from a child under 13, we will delete that data promptly. If you believe a child under 13 has provided us with personal information, please contact us at hi@timeboxing.club.

## 10. Communications

We only send transactional emails necessary for the Service to function:

- Account confirmation emails
- Password reset emails
- Magic link sign-in emails (if used)

We do not send marketing, promotional, or newsletter emails. If we ever introduce optional communications, they will be opt-in only.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last updated" date and notify you through the Service or via email. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.

## 12. Contact

If you have questions about this Privacy Policy or want to exercise your data rights, contact us at:
hi@timeboxing.club
