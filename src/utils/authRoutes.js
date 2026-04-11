const ROLE_ROUTES = {
  Admin: '/',
  Moderator: '/moderator',
  'Call Team': '/call-team',
  'Courier Team': '/courier',
  'Factory Team': '/factory',
  'Digital Marketer': '/digital-marketer',
};

export const getRoleRoute = (roles = []) => {
  const priority = ['Admin', 'Digital Marketer', 'Moderator', 'Call Team', 'Courier Team', 'Factory Team'];

  for (const role of priority) {
    if (roles.includes(role)) {
      return ROLE_ROUTES[role];
    }
  }

  return '/';
};
