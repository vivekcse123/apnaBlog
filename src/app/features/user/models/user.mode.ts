export interface User {
  _id:          string;
  name:         string;
  email:        string;
  password:     string;
  dob:          Date;
  location:     string;
  role:         string;
  status:       string;
  bio: string;
  totalBlogs:   number;
  totalViews:   number;
  createdAt:    Date;
  updatedAt:    Date;
  lastLoggedInAt: Date;
  deletionScheduledAt: any;
  avatar: string;
  followersCount?: number;
  isFollowing?:   boolean;
  companyName?:    string | null;
  phone?:          string | null;
  website?:        string | null;
  industry?:       string | null;
  karma?:          number;
  digestEnabled?:  boolean;
  writerOfMonthBadge?: { active: boolean; awardedAt?: string; challengeTitle?: string };
  isMentor?: boolean;
  mentorSlug?: string | null;
  mentorStatus?: 'active' | 'suspended';
  isPremium?: boolean;
  premiumSince?: string | null;
  /** 1 year after premiumSince - see blogApp's utils/premium.js and jobs/premiumExpiryScheduler.js. */
  premiumExpiresAt?: string | null;
  /** Badge/audit only - access control uses hasLifetimeAccess() from core/utils/lifetime-membership.util.ts instead. */
  isLifetimeMember?: boolean;
  lifetimeMemberSince?: string | null;
  lifetimeMemberReason?: 'admin_role' | 'mentor_approval' | null;
}