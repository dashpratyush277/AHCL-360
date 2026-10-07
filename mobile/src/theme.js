import { useColorScheme } from 'react-native';

const light = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surface2: '#F0F2F5',
  border: '#E2E5EA',
  text: '#1B1F24',
  muted: '#667085',
  brand: '#0F6E4F',
  brandInk: '#FFFFFF',
  brandSoft: '#E3F2EC',
  ok: '#157F3D',
  okSoft: '#E4F5EA',
  warn: '#9A6200',
  warnSoft: '#FFF3D6',
  bad: '#B42318',
  badSoft: '#FDE8E6',
  info: '#175CD3',
  infoSoft: '#E5EEFC',
};

const dark = {
  bg: '#0F1215',
  surface: '#171B20',
  surface2: '#1E242A',
  border: '#2A3138',
  text: '#E6E9EC',
  muted: '#98A2B3',
  brand: '#3DBB8A',
  brandInk: '#062419',
  brandSoft: '#143328',
  ok: '#4CCF7F',
  okSoft: '#13301F',
  warn: '#F2B84B',
  warnSoft: '#36290F',
  bad: '#FF7A6E',
  badSoft: '#3A1714',
  info: '#79A8FF',
  infoSoft: '#172640',
};

export const useTheme = () => (useColorScheme() === 'dark' ? dark : light);

const TONE = {
  approved: 'ok', verified: 'ok', delivered: 'ok', reimbursed: 'ok', present: 'ok', resolved: 'ok', settled: 'ok', paid: 'ok',
  pending: 'warn', processing: 'warn', submitted: 'warn', open: 'warn', half_day: 'warn', in_progress: 'warn', revision_requested: 'warn', needs_changes: 'warn', queued: 'warn', unpaid: 'warn',
  rejected: 'bad', cancelled: 'bad', absent: 'bad', failed: 'bad',
  packed: 'info', shipped: 'info', leave: 'info', holiday: 'info', weekly_off: 'info',
};
export const toneFor = (status) => TONE[status] || 'muted';
