import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface NewsItem {
  _id?:        string;   // MongoDB id (from backend)
  guid:        string;
  title:       string;
  link:        string;
  thumbnail:   string;
  pubDate:     string;
  description: string;
  sourceName:  string;
  category:    string;
  isPublished: boolean;
}

export interface NewsSource {
  name:     string;
  url:      string;
  category: string;
}

@Injectable({ providedIn: 'root' })
export class NewsFeedService {
  private http = inject(HttpClient);

  private readonly API = `${environment.apiUrl}/news`;

  readonly CATEGORIES = ['All', 'News', 'Sports', 'Technology', 'Business', 'Entertainment', 'Health', 'Science'];

  // Fetch from backend (which caches & serves from MongoDB).
  // Does NOT catch errors here - let the component handle them for proper UI feedback.
  fetchByCategory(category: string, page = 1): Observable<NewsItem[]> {
    const params: any = { category, page, limit: 30, hidePublished: 'true' };
    return this.http.get<any>(this.API, { params }).pipe(
      map(res => res.data ?? [])
    );
  }

  // Unauthenticated feed for public-facing widgets (e.g. the "Live News"
  // section on /category/news) - hits a separate route that never requires
  // an admin token and never filters out already-published items.
  fetchPublicByCategory(category: string, page = 1): Observable<NewsItem[]> {
    const params: any = { category, page, limit: 30 };
    return this.http.get<any>(`${this.API}/public`, { params }).pipe(
      map(res => res.data ?? [])
    );
  }

  // Mark an item as published after the admin creates a blog post from it
  markPublished(newsId: string, postId?: string): Observable<any> {
    return this.http.patch(`${this.API}/${newsId}/mark-published`, { postId }).pipe(
      catchError(() => of(null))
    );
  }

  wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
