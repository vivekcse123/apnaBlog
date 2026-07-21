export interface ExpertReview {
  authorName: string;
  rating: number;
  comment: string;
  date: string;
}

export interface ExpertTimelineEntry {
  title: string;
  org: string;
  period: string;
  /** Experience-only "I currently work here" flag - entries with this set
   *  sort to the top of the Experience list (mentor-dashboard.ts's
   *  setCurrentExperience(), expert-profile.ts's displayExpert() sort). */
  current?: boolean;
}

export interface Expert {
  id: string;
  slug: string;
  name: string;
  title: string;
  company: string;
  category: string;
  avatarInitial: string;
  avatarColor: string;
  verified: boolean;
  yearsExperience: number;
  sessionsGuided: number;
  followers: number;
  articlesWritten: number;
  rating: number;
  reviewCount: number;
  responseTime: string;
  skills: string[];
  languages: string[];
  bio: string;
  experience: ExpertTimelineEntry[];
  education: ExpertTimelineEntry[];
  certifications: string[];
  reviews: ExpertReview[];
  /** Special profile badge, e.g. "Government Career Mentor" for Ranjeet Verma. */
  specialBadge?: string;
  /** Live status the mentor toggles themselves - only set once a real
   *  MentorProfile overlay exists (see MentorProfileService), undefined
   *  otherwise (treated as 'available' by consumers, matching the backend
   *  schema default). */
  availabilityStatus?: 'available' | 'busy' | 'unavailable';
}
