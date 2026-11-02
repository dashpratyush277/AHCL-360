import { useColorScheme } from 'react-native';

// AHCL brand palette (from the approved "AHCL ONE" mockup): deep navy hero, bright blue actions,
// light blue accent, white cards on a pale blue-grey page, coloured role tiles.
const light = {
  bg: '#F5F9FC',
  surface: '#FFFFFF',
  surface2: '#EEF3F8',
  border: '#E1E7EF',
  text: '#1B2437',
  muted: '#5F6B7A', // ≥4.5:1 on white for legibility
  brand: '#0066E0',
  brandInk: '#FFFFFF',
  brandSoft: '#E5F0FD',
  navy: '#082239',
  navyInk: '#FFFFFF',
  accent: '#62BFF2',
  ok: '#0A7F5A',
  okSoft: '#E2F5EE',
  warn: '#9A5B00',
  warnSoft: '#FFF1D6',
  bad: '#C62835',
  badSoft: '#FFE4E5',
  info: '#0066E0',
  infoSoft: '#E5F0FD',
  tiles: {
    blue: { bg: '#E5F0FD', fg: '#0066E0' },
    green: { bg: '#E2F5EE', fg: '#0A9670' },
    orange: { bg: '#FDEFD6', fg: '#D97706' },
    purple: { bg: '#ECE9FB', fg: '#6D4FD8' },
    red: { bg: '#FFE4E5', fg: '#DC3545' },
  },
};

const dark = {
  bg: '#06121F',
  surface: '#0D1F33',
  surface2: '#13283F',
  border: '#1F3650',
  text: '#E8EEF5',
  muted: '#9AA8B8',
  brand: '#4FA3FF',
  brandInk: '#04172B',
  brandSoft: '#12304F',
  navy: '#082239',
  navyInk: '#FFFFFF',
  accent: '#62BFF2',
  ok: '#4CCF9A',
  okSoft: '#0F3328',
  warn: '#F2B84B',
  warnSoft: '#36290F',
  bad: '#FF7A7F',
  badSoft: '#3A1719',
  info: '#79B8FF',
  infoSoft: '#12304F',
  tiles: {
    blue: { bg: '#12304F', fg: '#79B8FF' },
    green: { bg: '#0F3328', fg: '#4CCF9A' },
    orange: { bg: '#3A2A0E', fg: '#F2B84B' },
    purple: { bg: '#2A2350', fg: '#B3A3FF' },
    red: { bg: '#3A1719', fg: '#FF7A7F' },
  },
};

export const useTheme = () => (useColorScheme() === 'dark' ? dark : light);

const TONE = {
  approved: 'ok', verified: 'ok', delivered: 'ok', reimbursed: 'ok', present: 'ok', resolved: 'ok', settled: 'ok', paid: 'ok',
  pending: 'warn', processing: 'warn', submitted: 'warn', open: 'warn', half_day: 'warn', in_progress: 'warn', revision_requested: 'warn', needs_changes: 'warn', queued: 'warn', unpaid: 'warn',
  rejected: 'bad', cancelled: 'bad', absent: 'bad', failed: 'bad',
  packed: 'info', shipped: 'info', leave: 'info', holiday: 'info', weekly_off: 'info', partially_returned: 'warn', returned: 'muted',
};
export const toneFor = (status) => TONE[status] || 'muted';
