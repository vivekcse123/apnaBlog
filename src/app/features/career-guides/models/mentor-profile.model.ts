import { ExpertTimelineEntry } from './expert.model';

// The writable subset of Expert a mentor can edit via their dashboard - real
// backend-persisted data that overlays the static MOCK_EXPERTS base on the
// public profile page (see expert-profile.ts's displayExpert()).
export interface MentorProfileRecord {
  title: string;
  company: string;
  bio: string;
  responseTime: string;
  skills: string[];
  languages: string[];
  certifications: string[];
  education: ExpertTimelineEntry[];
  experience: ExpertTimelineEntry[];
  /** Whole-day blackout dates ('YYYY-MM-DD') - read-only here, managed via
   *  MentorProfileService.addBlockedDate()/removeBlockedDate(), not PUT. */
  blockedDates?: string[];
}
