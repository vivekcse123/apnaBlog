import { ExpertTimelineEntry } from './expert.model';

export type MentorAvailabilityStatus = 'available' | 'busy' | 'unavailable';

// The writable subset of Expert a mentor can edit via their dashboard - real
// backend-persisted data that overlays the static MOCK_EXPERTS base on the
// public profile page (see expert-profile.ts's displayExpert()).
export interface MentorProfileRecord {
  title: string;
  company: string;
  bio: string;
  responseTime: string;
  /** Shown as "N+ Years Exp." on the public profile/marketplace cards -
   *  0 is treated as "not set" and falls back to the MOCK_EXPERTS base,
   *  same convention as title/company/bio above. */
  yearsExperience: number;
  skills: string[];
  languages: string[];
  certifications: string[];
  education: ExpertTimelineEntry[];
  experience: ExpertTimelineEntry[];
  /** Whole-day blackout dates ('YYYY-MM-DD') - read-only here, managed via
   *  MentorProfileService.addBlockedDate()/removeBlockedDate(), not PUT. */
  blockedDates?: string[];
  /** Live status the mentor toggles themselves - read-only here, managed via
   *  MentorProfileService.updateAvailability(), not PUT. Defaults to
   *  'available' server-side when a mentor hasn't set one yet. */
  availabilityStatus?: MentorAvailabilityStatus;
}
