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
}
