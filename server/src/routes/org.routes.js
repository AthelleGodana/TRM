import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getOrganization, getSummary, updateBranding, listMembers, updateMemberRole, removeMember, setLegacyMemberEmail,
  listInvitations, createInvitation, bulkCreateInvitations, revokeInvitation,
  listAccessRequests, approveAccessRequest, rejectAccessRequest,
} from '../controllers/org.controller.js';

const router = Router();
router.use(requireAuth, requireRole('ORG_ADMIN'));

router.get('/', getOrganization);
router.get('/summary', getSummary);
router.patch('/branding', updateBranding);

router.get('/members', listMembers);
router.patch('/members/:id', updateMemberRole);
router.delete('/members/:id', removeMember);
router.put('/members/:id/email', setLegacyMemberEmail);

router.get('/invitations', listInvitations);
router.post('/invitations', createInvitation);
router.post('/invitations/bulk', bulkCreateInvitations);
router.delete('/invitations/:id', revokeInvitation);

router.get('/access-requests', listAccessRequests);
router.post('/access-requests/:id/approve', approveAccessRequest);
router.post('/access-requests/:id/reject', rejectAccessRequest);

export default router;
