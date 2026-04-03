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

export interface GroupedVisit {
  page:       string;
  visitors:   number;  
  cities:     string[];
  lastVisit:  string; 
}

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

  private lineChart!:    Chart;
  private doughnutChart!: Chart;
  private barChart!:     Chart;
  private autoRefreshSub!: Subscription;

  private readonly API = `${environment.apiUrl}/visitor`;

  stats: VisitorStats = {
    today: 0, yesterday: 0,
    thisWeek: 0, lastWeek: 0,
    thisMonth: 0, total: 0,
  };

  todayChangePercent  = 0;
  weekChangePercent   = 0;

  todayIsNew = false;
  weekIsNew  = false;

  weeklyData:   DailyData[]   = [];
  topPages:     TopPage[]     = [];
  deviceStats:  DeviceStat[]  = [];
  recentVisits: RecentVisit[] = [];
  sourceStats:  SourceStat[]  = [];

  groupedVisits: GroupedVisit[] = [];

  isLoading    = true;
  lastUpdated  = '';
  selectedRange: '7d' | '14d' | '30d' = '14d';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAllData();

    this.autoRefreshSub = interval(30_000).pipe(
      switchMap(() =>
        this.http.get<VisitorStats>(`${this.API}/stats`).pipe(
          catchError(() => of(this.stats))
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
        this.stats = stats;
        this.calculateChanges();

        this.weeklyData = daily;
        this.buildOrUpdateLineChart();
        this.buildOrUpdateBarChart();

        this.topPages    = topPages;
        this.deviceStats = devices;

        this.recentVisits = recent;
        this.groupedVisits = this.buildGroupedVisits(recent);

        this.sourceStats = sources;
        this.buildOrUpdateDoughnutChart();

        this.isLoading = false;
        this.setLastUpdated();
      },
      error: () => {
        this.isLoading = false;
        this.setLastUpdated();
      },
    });
  }

  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.loadAllData();
  }
  calculateChanges(): void {

    if (this.stats.yesterday > 0) {
      this.todayIsNew            = false;
      this.todayChangePercent    = Math.round(
        ((this.stats.today - this.stats.yesterday) / this.stats.yesterday) * 100
      );
    } else if (this.stats.today > 0) {

      this.todayIsNew         = true;
      this.todayChangePercent = 100;
    } else {
      this.todayIsNew         = false;
      this.todayChangePercent = 0;
    }
    if (this.stats.lastWeek > 0) {
      this.weekIsNew          = false;
      this.weekChangePercent  = Math.round(
        ((this.stats.thisWeek - this.stats.lastWeek) / this.stats.lastWeek) * 100
      );
    } else if (this.stats.thisWeek > 0) {

      this.weekIsNew         = true;
      this.weekChangePercent = 100;
    } else {
      this.weekIsNew         = false;
      this.weekChangePercent = 0;
    }
  }

  setLastUpdated(): void {
    this.lastUpdated = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
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
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  formatNumber(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
  }

  private buildGroupedVisits(visits: RecentVisit[]): GroupedVisit[] {
    const map = new Map<string, {
      ips:      Set<string>;
      cities:   Set<string>;
      lastVisit: string;
    }>();

    for (const v of visits) {
      const key      = v.page || '/';
      const existing = map.get(key);

      if (existing) {
        existing.ips.add(v.ip);
        if (v.city) existing.cities.add(v.city);
        if (new Date(v.visitedAt) > new Date(existing.lastVisit)) {
          existing.lastVisit = v.visitedAt;
        }
      } else {
        map.set(key, {
          ips:       new Set([v.ip]),
          cities:    v.city ? new Set([v.city]) : new Set(),
          lastVisit: v.visitedAt,
        });
      }
    }

    return Array.from(map.entries())
      .map(([page, data]) => ({
        page,
        visitors:  data.ips.size,
        cities:    [...data.cities].slice(0, 3), 
        lastVisit: data.lastVisit,
      }))
      .sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime());
  }

  initCharts(): void {
    this.buildOrUpdateLineChart();
    this.buildOrUpdateDoughnutChart();
    this.buildOrUpdateBarChart();
  }

  private buildOrUpdateLineChart(): void {
    if (!this.lineChartRef) return;
    const labels = this.weeklyData.map(d => d.date);
    const data   = this.weeklyData.map(d => d.count);

    if (this.lineChart) {
      this.lineChart.data.labels            = labels;
      this.lineChart.data.datasets[0].data  = data;
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
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
        },
      },
    });
  }

  private buildOrUpdateDoughnutChart(): void {
    if (!this.doughnutChartRef) return;
    const labels = this.sourceStats.map(s => s.source);
    const data   = this.sourceStats.map(s => s.percent);
    const colors = ['#6C63FF', '#43C6AC', '#FF6B6B', '#FFB347'];

    if (this.doughnutChart) {
      this.doughnutChart.data.labels                              = labels;
      this.doughnutChart.data.datasets[0].data                   = data;
      (this.doughnutChart.data.datasets[0] as any).backgroundColor = colors;
      this.doughnutChart.update();
      return;
    }

    this.doughnutChart = new Chart(this.doughnutChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '70%',
      },
    });
  }

  private buildOrUpdateBarChart(): void {
    if (!this.barChartRef) return;
    const labels = this.weeklyData.map(d => d.date);
    const data   = this.weeklyData.map(d => d.count);

    if (this.barChart) {
      this.barChart.data.labels           = labels;
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
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
        },
      },
    });
  }

  getPageAvatar(page: string): string {
  if (!page || page === '/') return '🏠';

  const clean = page.replace(/\//g, '');
  return clean ? clean.charAt(0).toUpperCase() : '?';
}

  updateLineChart()     { this.buildOrUpdateLineChart();     }
  updateBarChart()      { this.buildOrUpdateBarChart();      }
  updateDoughnutChart() { this.buildOrUpdateDoughnutChart(); }
  initLineChart()       { this.buildOrUpdateLineChart();     }
  initBarChart()        { this.buildOrUpdateBarChart();      }
  initDoughnutChart()   { this.buildOrUpdateDoughnutChart(); }
}