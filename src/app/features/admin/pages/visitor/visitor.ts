import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

Chart.register(...registerables);

export interface VisitorStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  total: number;
}

export interface DailyData {
  date: string;
  count: number;
}

export interface TopPage {
  _id: string;
  count: number;
}

export interface DeviceStat {
  device: string;
  count: number;
  percent: number;
}

export interface RecentVisit {
  ip: string;
  page: string;
  city: string;
  visitedAt: string;
}

export interface SourceStat {
  source: string;
  count: number;
  percent: number;
}

@Component({
  selector: 'app-visitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visitor.html',
  styleUrls: ['./visitor.css']
})
export class Visitor implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('lineChartRef') lineChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChartRef') doughnutChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChartRef') barChartRef!: ElementRef<HTMLCanvasElement>;

  private lineChart!: Chart;
  private doughnutChart!: Chart;
  private barChart!: Chart;
  private autoRefreshSub!: Subscription;

  private readonly API = 'http://localhost:3000/api/visitor';

  // Stats
  stats: VisitorStats = { today: 0, yesterday: 0, thisWeek: 0, lastWeek: 0, thisMonth: 0, total: 0 };
  todayChangePercent = 0;
  weekChangePercent = 0;

  // Chart data
  weeklyData: DailyData[] = [];
  topPages: TopPage[] = [];
  deviceStats: DeviceStat[] = [];
  recentVisits: RecentVisit[] = [];
  sourceStats: SourceStat[] = [];

  // UI state
  isLoading = true;
  lastUpdated = '';
  selectedRange: '7d' | '14d' | '30d' = '14d';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAllData();
    // Auto refresh every 30 seconds
    this.autoRefreshSub = interval(30000).pipe(
      switchMap(() => this.http.get<any>(`${this.API}/stats`))
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

  // ─── Load All Data ────────────────────────────────────────────────────────

  loadAllData(): void {
    this.isLoading = true;

    this.http.get<VisitorStats>(`${this.API}/stats`).subscribe({
      next: data => {
        this.stats = data;
        this.calculateChanges();
      }
    });

    this.http.get<DailyData[]>(`${this.API}/daily?range=${this.selectedRange}`).subscribe({
      next: data => {
        this.weeklyData = data;
        this.updateLineChart();
        this.updateBarChart();
      }
    });

    this.http.get<TopPage[]>(`${this.API}/top-pages`).subscribe({
      next: data => this.topPages = data
    });

    this.http.get<DeviceStat[]>(`${this.API}/devices`).subscribe({
      next: data => this.deviceStats = data
    });

    this.http.get<RecentVisit[]>(`${this.API}/recent`).subscribe({
      next: data => this.recentVisits = data
    });

    this.http.get<SourceStat[]>(`${this.API}/sources`).subscribe({
      next: data => {
        this.sourceStats = data;
        this.updateDoughnutChart();
        this.isLoading = false;
        this.setLastUpdated();
      }
    });
  }

  onRangeChange(range: '7d' | '14d' | '30d'): void {
    this.selectedRange = range;
    this.http.get<DailyData[]>(`${this.API}/daily?range=${range}`).subscribe({
      next: data => {
        this.weeklyData = data;
        this.updateLineChart();
        this.updateBarChart();
      }
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  calculateChanges(): void {
    if (this.stats.yesterday > 0) {
      this.todayChangePercent = Math.round(
        ((this.stats.today - this.stats.yesterday) / this.stats.yesterday) * 100
      );
    }
    if (this.stats.lastWeek > 0) {
      this.weekChangePercent = Math.round(
        ((this.stats.thisWeek - this.stats.lastWeek) / this.stats.lastWeek) * 100
      );
    }
  }

  setLastUpdated(): void {
    const now = new Date();
    this.lastUpdated = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  getMaxPageCount(): number {
    return Math.max(...this.topPages.map(p => p.count), 1);
  }

  getPagePercent(count: number): number {
    return Math.round((count / this.getMaxPageCount()) * 100);
  }

  formatRelativeTime(dateStr: string): string {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  formatNumber(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  }

  // ─── Charts ───────────────────────────────────────────────────────────────

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
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointBackgroundColor: '#6C63FF',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2e',
            titleColor: '#a9a9c8',
            bodyColor: '#fff',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => `  ${ctx.parsed.y} visitors`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#888', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          y: {
            ticks: { color: '#888', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.05)' },
            beginAtZero: true
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
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
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
          borderColor: '#6C63FF',
          borderWidth: 1.5,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#888', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
          y: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' }, beginAtZero: true }
        }
      }
    });
  }

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