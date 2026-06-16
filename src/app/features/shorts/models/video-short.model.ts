export interface ShortReply {
  _id: string;
  comment: string;
  name: string;
  user?: { _id: string; name: string } | null;
  createdAt: Date;
}

export interface ShortComment {
  _id: string;
  comment: string;
  name: string;
  user?: { _id: string; name: string; avatar?: string } | null;
  createdAt: Date;
  replies?: ShortReply[];
}

export interface VideoShort {
  _id: string;
  title: string;
  caption?: string;
  category: string;
  videoType: 'upload' | 'youtube';
  videoUrl: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  duration?: number;
  likesCount: number;
  isLikedByMe?: boolean;
  recentLikers?: { _id: string; name: string }[];
  commentsCount: number;
  views: number;
  comments?: ShortComment[];
  user: { _id: string; name: string; avatar?: string; role?: string };
  createdAt: Date;
  status:                 'published' | 'pending';
  linkedPostSlug?:        string | null;
  isSponsored?:           boolean;
  sponsoredUntil?:        string | null;
  sponsoredExpiryAction?: 'delete' | 'keep' | null;
  sponsorPriority?:       number;
  sponsorCtaText?:        string | null;
  sponsorCtaUrl?:         string | null;
}
