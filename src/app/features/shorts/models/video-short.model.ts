export interface ShortComment {
  _id: string;
  comment: string;
  name: string;
  user?: { _id: string; name: string; avatar?: string } | null;
  createdAt: Date;
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
  commentsCount: number;
  views: number;
  comments?: ShortComment[];
  user: { _id: string; name: string; avatar?: string };
  createdAt: Date;
  status: 'published' | 'pending';
}
