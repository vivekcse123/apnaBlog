import { ExpertReview, ExpertTimelineEntry } from './expert.model';

export type MentorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface MentorApplicationRecord {
  _id: string;
  user: string | { _id: string; name: string; email: string; avatar?: string | null };

  fullName: string;
  currentRole: string;
  currentCompany: string;
  yearsExperience: number;

  linkedin: string;
  github: string;
  portfolio: string;

  bio: string;
  reason: string;

  skills: string[];
  expertise: string[];
  languages: string[];

  teachingCategories: string[];
  availableDays: string[];
  availableTime: string;

  photoFileName: string;
  resumeFileName: string;

  status: MentorApplicationStatus;
  rejectionReason: string;
  reviewedBy: string | null;
  reviewedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

// Public card shape returned by GET /api/mentor-applications/approved(/:slug) -
// a real, approved mentor built from their application data, matching the
// frontend's Expert interface's field names 1:1 so guide-list.ts/expert-profile.ts
// can merge it in directly. See mentor-application.router.js's toPublicMentorCard().
export interface PublicMentorCard {
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
}

export interface SubmitMentorApplicationPayload {
  fullName: string;
  currentRole: string;
  currentCompany: string;
  yearsExperience: number;
  linkedin: string;
  github: string;
  portfolio: string;
  bio: string;
  reason: string;
  skills: string[];
  expertise: string[];
  languages: string[];
  teachingCategories: string[];
  availableDays: string[];
  availableTime: string;
  photoFileName: string;
  resumeFileName: string;
}
