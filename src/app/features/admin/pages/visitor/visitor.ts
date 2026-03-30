import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { interval, Subscription, forkJoin, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environments.prod';

Chart.register(...registerables);

export interface VisitorStats {
  today: number; yesterday: number;
  thisWeek: number; lastWeek: number;
  thisMonth: number; total: number;
}
export interface DailyData   { date: string; count: number; }
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

  @ViewChild('lineChartRef')     lineChartRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChartRef') doughnutChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChartRef')      barChartRef!:      ElementRef<HTMLCanvasElement>;

  private lineChart!: Chart;
  private doughnutChart!: Chart;
  private barChart!: Chart;
  private autoRefreshSub!: Subscription;

  private readonly API = `${environment.apiUrl}/visitor`;

  stats: VisitorStats = {
    today: 0, yesterday: 0,
    thisWeek: 0, lastWeek: 0,
    thisMonth: 0, total: 0
  };

  todayChangePercent = 0;
  weekChangePercent  = 0;

  weeklyData:   DailyData[]    = [];
  topPages:     TopPage[]      = [];
  deviceStats:  DeviceStat[]   = [];
  recentVisits: RecentVisit[]  = [];
  sourceStats:  SourceStat[]   = [];

  isLoading   = true;
  lastUpdated = '';
  selectedRange: '7d' | '14d' | '30d' = '14d';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAllData();

    // Auto-refresh stats every 30s
    this.autoRefreshSub = interval(30000).pipe(
      switchMap(() =>
        this.http.get<VisitorStats>(`${this.API}/stats`).pipe(
          catchError(() => of(this.stats))   // keep existing stats on error
        )
      )
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

  loadAllData(): void {
    this.isLoading = true;

    // All requests fire in parallel; forkJoin waits for ALL to finish
    // catchError on each so one failure doesn't kill the rest
    forkJoin({
      stats: this.http.get<VisitorStats>(`${this.API}/stats`).pipe(
        catchError(() => of(this.stats))
      ),
      daily: this.http.get<DailyData[]>(`${this.API}/daily?range=${this.selectedRange}`).pipe(
        catchError(() => of([] as DailyData[]))
      ),
      topPages: this.http.get<TopPage[]>(`${this.API}/top-pages`).pipe(
        catchError(() => of([] as TopPage[]))
      ),
      devices: this.http.get<DeviceStat[]>(`${this.API}/devices`).pipe(
        catchError(() => of([] as DeviceStat[]))
      ),
      recent: this.http.get<RecentVisit[]>(`${this.API}/recent`).pipe(
        catchError(() => of([] as RecentVisit[]))
      ),
      sources: this.http.get<SourceStat[]>(`${this.API}/sources`).pipe(
        catchError(() => of([] as SourceStat[]))
      ),
    }).subscribe({
      next: ({ stats, daily, topPages, devices, recent, sources }) => {
        // Stats
        this.stats = stats;
        this.calculateChanges();

        // Daily data → line + bar charts
        this.weeklyData = daily;
        this.buildOrUpdateLineChart();
        this.buildOrUpdateBarChart();

        // Lists
        this.topPages     = topPages;
        this.deviceStats  = devices;
        this.recentVisits = recent;

        // Sources → doughnut
        this.sourceStats = sources;
        this.buildOrUpdateDoughnutChart();

        this.isLoading = false;          // ← always runs, even if some calls failed
        this.setLastUpdated();
      },
      error: () => {
        // forkJoin error only fires if catchError itself throws — safety net
        this.isLoading = false;
        this.setLastUpdated();
      }
    });
  }

  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.loadAllData();
  }

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

  // ── Chart helpers ────────────────────────────────────────────

  initCharts(): void {
    this.buildOrUpdateLineChart();
    this.buildOrUpdateDoughnutChart();
    this.buildOrUpdateBarChart();
  }

  private buildOrUpdateLineChart(): void {
    if (!this.lineChartRef) return;
    const labels  = this.weeklyData.map(d => d.date);
    const data    = this.weeklyData.map(d => d.count);

    if (this.lineChart) {
      this.lineChart.data.labels              = labels;
      this.lineChart.data.datasets[0].data   = data;
      this.lineChart.update();
      return;
    }

    this.lineChart = new Chart(this.lineChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          label: 'Visitors',
          borderColor: '#6C63FF',
          backgroundColor: 'rgba(108,99,255,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }
        }
      }
    });
  }

  private buildOrUpdateDoughnutChart(): void {
    if (!this.doughnutChartRef) return;
    const labels  = this.sourceStats.map(s => s.source);
    const data    = this.sourceStats.map(s => s.percent);
    const colors  = ['#6C63FF', '#43C6AC', '#FF6B6B', '#FFB347'];

    if (this.doughnutChart) {
      this.doughnutChart.data.labels                        = labels;
      this.doughnutChart.data.datasets[0].data             = data;
      (this.doughnutChart.data.datasets[0] as any).backgroundColor = colors;
      this.doughnutChart.update();
      return;
    }

    this.doughnutChart = new Chart(this.doughnutChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '70%',
      }
    });
  }

  private buildOrUpdateBarChart(): void {
    if (!this.barChartRef) return;
    const labels  = this.weeklyData.map(d => d.date);
    const data    = this.weeklyData.map(d => d.count);

    if (this.barChart) {
      this.barChart.data.labels            = labels;
      this.barChart.data.datasets[0].data = data;
      this.barChart.update();
      return;
    }

    this.barChart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          label: 'Visitors',
          backgroundColor: 'rgba(108,99,255,0.5)',
          borderColor: '#6C63FF',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }
        }
      }
    });
  }

  // keep old names in case template still references them
  updateLineChart()     { this.buildOrUpdateLineChart();    }
  updateBarChart()      { this.buildOrUpdateBarChart();     }
  updateDoughnutChart() { this.buildOrUpdateDoughnutChart();}
  initLineChart()       { this.buildOrUpdateLineChart();    }
  initBarChart()        { this.buildOrUpdateBarChart();     }
  initDoughnutChart()   { this.buildOrUpdateDoughnutChart();}
}