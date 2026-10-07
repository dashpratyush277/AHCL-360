export const USER_TYPES = ['employee', 'partner'];

export const EMPLOYEE_ROLES = ['super_admin', 'admin', 'manager', 'field_executive', 'staff'];
export const PARTNER_ROLES = ['super_distributor', 'distributor', 'stockist'];
export const ALL_ROLES = [...EMPLOYEE_ROLES, ...PARTNER_ROLES];

// Convenience groups used with authorize(...)
export const ADMINS = ['super_admin', 'admin'];
export const MANAGERS = ['super_admin', 'admin', 'manager'];
export const FIELD = ['manager', 'field_executive', 'staff'];

export const isAdmin = (user) => ADMINS.includes(user.role);
export const isPartner = (user) => user.userType === 'partner';
