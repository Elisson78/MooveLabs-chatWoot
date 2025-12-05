import { frontendURL } from '../../../helper/URLHelper';
import FunnelPage from './FunnelPage.vue';

const FUNNEL_PERMISSIONS = [
  'administrator',
  'agent',
  'conversation_manage',
  'conversation_unassigned_manage',
  'conversation_participating_manage',
];

export const routes = [
  {
    path: frontendURL('accounts/:accountId/funil'),
    name: 'funnel_kanban',
    component: FunnelPage,
    meta: {
      permissions: FUNNEL_PERMISSIONS,
    },
  },
];
