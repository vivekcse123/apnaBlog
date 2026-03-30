import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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

  @ViewChild('lineChartRef') lineChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('doughnutChartRef') doughnutChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChartRef') barChartRef!: ElementRef<HTMLCanvasElement>;

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

  weeklyData: DailyData[] = [];
  topPages: TopPage[] = [];
  deviceStats: DeviceStat[] = [];
  recentVisits: RecentVisit[] = [];
  sourceStats: SourceStat[] = [];

  isLoading = true;
  lastUpdated = '';
  selectedRange: '7d' | '14d' | '30d' = '14d';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadAllData();

    this.autoRefreshSub = interval(30000).pipe(
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

  loadAllData(): void {
    this.isLoading = true;

    this.http.get<VisitorStats>(`${this.API}/stats`).subscribe({
      next: data => { this.stats = data; this.calculateChanges(); }
    });

    this.http.get<DailyData[]>(`${this.API}/daily?range=${this.selectedRange}`).subscribe({
      next: data => {
        this.weeklyData = data;

        if (!this.lineChart && this.lineChartRef) {
          this.initLineChart();
        } else {
          this.updateLineChart();
        }

        if (!this.barChart && this.barChartRef) {
          this.initBarChart();
        } else {
          this.updateBarChart();
        }
      }
    });

    this.http.get<TopPage[]>(`${this.API}/top-pages`).subscribe(data => this.topPages = data);
    this.http.get<DeviceStat[]>(`${this.API}/devices`).subscribe(data => this.deviceStats = data);
    this.http.get<RecentVisit[]>(`${this.API}/recent`).subscribe(data => this.recentVisits = data);

    this.http.get<SourceStat[]>(`${this.API}/sources`).subscribe(data => {
      this.sourceStats = data;

      if (!this.doughnutChart && this.doughnutChartRef) {
        this.initDoughnutChart();
      } else {
        this.updateDoughnutChart();
      }

      this.isLoading = false;
      this.setLastUpdated();
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
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  formatNumber(n: number): string {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
  }

  initCharts(): void {
    this.initLineChart();
    this.initDoughnutChart();
    this.initBarChart();
  }

  initLineChart(): void {
    if (!this.lineChartRef || !this.weeklyData.length) return;

    this.lineChart = new Chart(this.lineChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: this.weeklyData.map(d => d.date),
        datasets: [{
          data: this.weeklyData.map(d => d.count),
          borderColor: '#6C63FF',
          backgroundColor: 'rgba(108,99,255,0.08)',
          fill: true
        }]
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
          data: this.sourceStats.map(s => s.percent)
        }]
      }
    });
  }

  initBarChart(): void {
    if (!this.barChartRef || !this.weeklyData.length) return;

    this.barChart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.weeklyData.map(d => d.date),
        datasets: [{
          data: this.weeklyData.map(d => d.count)
        }]
      }
    });
  }

  updateLineChart(): void {
    if (!this.lineChart) return;
    this.lineChart.data.labels = this.weeklyData.map(d => d.date);
    this.lineChart.data.datasets[0].data = this.weeklyData.map(d => d.count);
    this.lineChart.update();
  }

  updateBarChart(): void {
    if (!this.barChart) return;
    this.barChart.data.labels = this.weeklyData.map(d => d.date);
    this.barChart.data.datasets[0].data = this.weeklyData.map(d => d.count);
    this.barChart.update();
  }

  updateDoughnutChart(): void {
    if (!this.doughnutChart) return;
    this.doughnutChart.data.labels = this.sourceStats.map(s => s.source);
    this.doughnutChart.data.datasets[0].data = this.sourceStats.map(s => s.percent);
    this.doughnutChart.update();
  }
}