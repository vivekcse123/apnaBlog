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
