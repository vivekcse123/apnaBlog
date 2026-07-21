import { User } from '../../features/user/models/user.mode';

// Mirrors blogApp's src/utils/lifetimeMembership.js - keep both in sync.
// Computed live from role/isMentor/mentorStatus rather than the stored
// isLifetimeMember flag, so a later role demotion or mentor suspension
// revokes access immediately with no risk of a stale/out-of-sync flag.
//
// mentorStatus check uses `!== 'suspended'` rather than `=== 'active'`
// because mentor accounts approved before the mentorStatus field existed
// have no stored value at all.
export function hasLifetimeAccess(
  user: Pick<User, 'role' | 'isMentor' | 'mentorStatus'> | null | undefined
): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    (user.isMentor === true && user.mentorStatus !== 'suspended')
  );
}
