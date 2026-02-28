/**
 * Default onboarding template data.
 *
 * Calendar colors = darkest shade in each hue family (Navy, Forest, Olive, Mauve).
 * Category colors = distinct shades within the same hue family, light → dark.
 *
 * All hex values come from PALETTE_COLORS in src/constants/colors.ts.
 */

export interface TemplateCalendar {
  /** Stable key used to link categories during setup — never stored. */
  templateId: string;
  name: string;
  color: string;
}

export interface TemplateCategory {
  name: string;
  color: string;
  /** References TemplateCalendar.templateId */
  calendarTemplateId: string;
}

export interface Template {
  calendars: TemplateCalendar[];
  categories: TemplateCategory[];
}

/** Light gray for the auto-created "General" category on every new calendar. */
export const GENERAL_CATEGORY_COLOR = '#DBE4D7'; // Mist — the --muted/--secondary surface color

/** Color used for the Personal calendar in Blank setup. */
export const BLANK_PERSONAL_COLOR = '#A4C7A6'; // Fern — DEFAULT_PALETTE_COLOR

export const DEFAULT_TEMPLATE: Template = {
  calendars: [
    { templateId: 'personal',      name: 'Personal',      color: '#5B718C' }, // Navy      — dark blue
    { templateId: 'growth',        name: 'Growth',        color: '#8DA387' }, // Forest    — dark green
    { templateId: 'school',        name: 'School',        color: '#B3B46D' }, // Olive     — dark yellow
    { templateId: 'relationships', name: 'Relationships', color: '#DE8D91' }, // Mauve     — dark red
  ],
  categories: [
    // ── Personal: 4 distinct blue shades (Sky → Cornflower, light to dark) ──
    { name: 'Staying Active', color: '#D6E6FB', calendarTemplateId: 'personal' }, // Sky
    { name: 'Self-care',      color: '#B8CAF2', calendarTemplateId: 'personal' }, // Periwinkle
    { name: 'Relaxing',       color: '#AFB7E7', calendarTemplateId: 'personal' }, // Lavender
    { name: 'Hobbies',        color: '#8E9DCA', calendarTemplateId: 'personal' }, // Cornflower

    // ── Growth: 2 distinct green shades ──
    { name: 'Learning',       color: '#8DA387', calendarTemplateId: 'growth'   }, // Forest
    { name: 'Reading',        color: '#6593A6', calendarTemplateId: 'growth'   }, // Teal

    // ── School: 2 distinct yellow shades ──
    { name: 'Assignments',    color: '#DAD15F', calendarTemplateId: 'school'   }, // Gold
    { name: 'Projects',       color: '#B3B46D', calendarTemplateId: 'school'   }, // Olive

    // ── Relationships: 4 distinct red/pink shades (Mauve → Peach, dark to light) ──
    { name: 'Networking',    color: '#DE8D91', calendarTemplateId: 'relationships' }, // Mauve
    { name: 'Socializing',   color: '#F4B6B6', calendarTemplateId: 'relationships' }, // Rose
    { name: 'Family',        color: '#F4CCAC', calendarTemplateId: 'relationships' }, // Apricot
    { name: 'Close Friends', color: '#F3DDC7', calendarTemplateId: 'relationships' }, // Peach
  ],
};
