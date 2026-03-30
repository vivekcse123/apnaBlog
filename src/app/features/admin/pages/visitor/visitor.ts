import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; // ✅ Router removed (not needed)
import { environment } from '../../../../../environments/environments.prod';

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

  // ✅ CORRECT API
  private readonly API = `${environment.apiUrl}/visitor`;

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
    private http: HttpClient
  ) {}

  // ✅ ONLY DATA LOADING (NO TRACKING HERE)
  ngOnInit(): void {

    this.loadAllData();

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

  // ── Chart Init & Updates (UNCHANGED) ─────────────────────────────────────────
  initCharts(): void {
    this.initLineChart();
    this.initDoughnutChart();
    this.initBarChart();
  }

  initLineChart(): void { /* unchanged */ }
  initDoughnutChart(): void { /* unchanged */ }
  initBarChart(): void { /* unchanged */ }

  updateLineChart(): void { /* unchanged */ }
  updateBarChart(): void { /* unchanged */ }
  updateDoughnutChart(): void { /* unchanged */ }
}