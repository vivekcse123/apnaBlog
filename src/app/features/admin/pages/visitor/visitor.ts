import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';

Chart.register(...registerables);

export interface VisitorStats {
  today: number; yesterday: number;
  thisWeek: number; lastWeek: number;
  thisMonth: number; total: number;
}
export interface DailyData  { date: string; count: number; }
export interface TopPage     { _id: string; count: number; }
export interface DeviceStat  { device: string; count: number; percent: number; }
export interface RecentVisit { ip: string; page: string; city: string; visitedAt: string; }
export interface SourceStat  { source: string; count: number; percent: number; }

@Component({
  selector: 'app-visitor',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './visitor.html',
  styleUrls: ['./visitor.css']
})
export class Visitor implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('lineChartRef')    lineChartRef!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChartRef') doughnutChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChartRef')     barChartRef!:     ElementRef<HTMLCanvasElement>;

  private lineChart!:    Chart;
  private doughnutChart!: Chart;
  private barChart!:     Chart;
  private autoRefreshSub!: Subscription;
  private routerSub!:      Subscription;

  // Use production API endpoint from environment
  private readonly API = `${environment.apiUrl}/visitor`;

  // Only track /welcome and /about pages
  private readonly TRACKED_PAGES = ['/welcome/apan-blog', '/welcome/about'];

  stats: VisitorStats = {
    today: 0, yesterday: 0,
    thisWeek: 0, lastWeek: 0,
    thisMonth: 0, total: 0
  };
  todayChangePercent = 0;
  weekChangePercent  = 0;

  weeklyData:   DailyData[]   = [];
  topPages:     TopPage[]     = [];
  deviceStats:  DeviceStat[]  = [];
  recentVisits: RecentVisit[] = [];
  sourceStats:  SourceStat[]  = [];

  isLoading     = true;
  lastUpdated   = '';
  selectedRange: '7d' | '14d' | '30d' = '14d';

  constructor(
    private http:   HttpClient,
    private router: Router
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // 1. Track the current page visit immediately
    this.trackCurrentPage();

    // 2. Track again on every subsequent navigation (SPA route changes)
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.trackVisit(e.urlAfterRedirects);
      });

    // 3. Load dashboard data
    this.loadAllData();

    // 4. Auto-refresh stats every 30 s
    this.autoRefreshSub = interval(30_000).pipe(
      switchMap(() => this.http.get<VisitorStats>(`${this.API}/stats`))
    ).subscribe(data => {
      this.stats = data;
      this.calculateChanges();
      this.setLastUpdated();
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initCharts(), 300);
  }

  ngOnDestroy(): void {
    this.lineChart?.destroy();
    this.doughnutChart?.destroy();
    this.barChart?.destroy();
    this.autoRefreshSub?.unsubscribe();
    this.routerSub?.unsubscribe();
  }

  // ── Visit Tracking ──────────────────────────────────────────────────────────

  /**
   * Reads the current browser URL and fires a tracking call if the page
   * is in TRACKED_PAGES (e.g. '/welcome' or '/about').
   */
  private trackCurrentPage(): void {
    const path = window.location.pathname;
    this.trackVisit(path);
  }

  /**
   * Posts a single tracking event to the backend.
   * Silently ignores pages not in TRACKED_PAGES (backend also enforces this).
   */
  private trackVisit(rawPath: string): void {
    // Normalise: strip query-string & trailing slash (keep root '/')
    let path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
    
    // Ensure path starts with /
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (!this.TRACKED_PAGES.includes(path)) return;

    this.http.post(`${this.API}/track`, { page: path }).subscribe({
      next: () => console.log(`[visitor/track] Tracked: ${path}`),
      error: err => console.warn('[visitor/track] failed:', err.message)
    });
  }

  // ── Data Loading ────────────────────────────────────────────────────────────

  loadAllData(): void {
    this.isLoading = true;

    this.http.get<VisitorStats>(`${this.API}/stats`).subscribe({
      next: data => { this.stats = data; this.calculateChanges(); },
      error: err => console.error('[visitor/stats] failed:', err)
    });

    this.http.get<DailyData[]>(`${this.API}/daily?range=${this.selectedRange}`).subscribe({
      next: data => { this.weeklyData = data; this.updateLineChart(); this.updateBarChart(); },
      error: err => console.error('[visitor/daily] failed:', err)
    });

    this.http.get<TopPage[]>(`${this.API}/top-pages`).subscribe({
      next: data => this.topPages = data,
      error: err => console.error('[visitor/top-pages] failed:', err)
    });

    this.http.get<DeviceStat[]>(`${this.API}/devices`).subscribe({
      next: data => this.deviceStats = data,
      error: err => console.error('[visitor/devices] failed:', err)
    });

    this.http.get<RecentVisit[]>(`${this.API}/recent`).subscribe({
      next: data => this.recentVisits = data,
      error: err => console.error('[visitor/recent] failed:', err)
    });

    this.http.get<SourceStat[]>(`${this.API}/sources`).subscribe({
      next: data => {
        this.sourceStats = data;
        this.updateDoughnutChart();
        this.isLoading = false;
        this.setLastUpdated();
      },
      error: err => console.error('[visitor/sources] failed:', err)
    });
  }

  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.http.get<DailyData[]>(`${this.API}/daily?range=${range}`).subscribe({
      next: data => { this.weeklyData = data; this.updateLineChart(); this.updateBarChart(); }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  calculateChanges(): void {
    this.todayChangePercent = this.stats.yesterday > 0
      ? Math.round(((this.stats.today - this.stats.yesterday) / this.stats.yesterday) * 100)
      : 0;
    this.weekChangePercent = this.stats.lastWeek > 0
      ? Math.round(((this.stats.thisWeek - this.stats.lastWeek) / this.stats.lastWeek) * 100)
      : 0;
  }

  setLastUpdated(): void {
    this.lastUpdated = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  getMaxPageCount(): number {
    return Math.max(...this.topPages.map(p => p.count), 1);
  }

  getPagePercent(count: number): number {
    return Math.round((count / this.getMaxPageCount()) * 100);
  }

  formatRelativeTime(dateStr: string): string {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  formatNumber(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
  }

  // ── Chart Init ───────────────────────────────────────────────────────────────

  initCharts(): void {
    this.initLineChart();
    this.initDoughnutChart();
    this.initBarChart();
  }

  initLineChart(): void {
    if (!this.lineChartRef) return;
    this.lineChart = new Chart(this.lineChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: this.weeklyData.map(d => d.date),
        datasets: [{
          label: 'Visitors',
          data: this.weeklyData.map(d => d.count),
          borderColor: '#6C63FF',
          backgroundColor: 'rgba(108,99,255,0.08)',
          fill: true, tension: 0.45,
          pointRadius: 4,
          pointBackgroundColor: '#6C63FF',
          pointBorderColor: '#fff', pointBorderWidth: 2, pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2e', titleColor: '#a9a9c8',
            bodyColor: '#fff', padding: 10, cornerRadius: 8,
            callbacks: { label: ctx => `  ${ctx.parsed.y} visitors` }
          }
        },
        scales: {
          x: {
            ticks: { color: '#888', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          y: {
            ticks: { color: '#888', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true
          }
        }
      }
    });
  }

  initDoughnutChart(): void {
    if (!this.doughnutChartRef) return;
    this.doughnutChart = new Chart(this.doughnutChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: this.sourceStats.map(s => s.source),
        datasets: [{
          data: this.sourceStats.map(s => s.percent),
          backgroundColor: ['#6C63FF', '#43C6AC', '#FF6B6B', '#FFB347'],
          borderWidth: 0, hoverOffset: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { display: false } }
      }
    });
  }

  initBarChart(): void {
    if (!this.barChartRef) return;
    this.barChart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.weeklyData.map(d => d.date),
        datasets: [{
          label: 'Visitors',
          data: this.weeklyData.map(d => d.count),
          backgroundColor: 'rgba(108,99,255,0.18)',
          borderColor: '#6C63FF', borderWidth: 1.5, borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: '#888', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#888', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.04)' }, beginAtZero: true
          }
        }
      }
    });
  }

  // ── Chart Updates ────────────────────────────────────────────────────────────

  updateLineChart(): void {
    if (!this.lineChart) return;
    this.lineChart.data.labels = this.weeklyData.map(d => d.date);
    this.lineChart.data.datasets[0].data = this.weeklyData.map(d => d.count);
    this.lineChart.update('active');
  }

  updateBarChart(): void {
    if (!this.barChart) return;
    this.barChart.data.labels = this.weeklyData.map(d => d.date);
    this.barChart.data.datasets[0].data = this.weeklyData.map(d => d.count);
    this.barChart.update('active');
  }

  updateDoughnutChart(): void {
    if (!this.doughnutChart) return;
    this.doughnutChart.data.labels = this.sourceStats.map(s => s.source);
    this.doughnutChart.data.datasets[0].data = this.sourceStats.map(s => s.percent);
    this.doughnutChart.update('active');
  }
}