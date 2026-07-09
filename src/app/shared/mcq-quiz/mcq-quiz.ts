import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { McqQuestion } from '../../core/models/post.model';

@Component({
  selector: 'app-mcq-quiz',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mcq-quiz.html',
  styleUrl: './mcq-quiz.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McqQuiz {
  // Signal input (not a plain @Input) so `mcqScore` correctly recomputes if this
  // component instance is reused across posts (e.g. client-side navigation between
  // two quiz-bearing posts without the @if unmounting/remounting the component).
  questions = input.required<McqQuestion[]>();

  readonly MCQ_OPTION_LABELS = ['A', 'B', 'C', 'D'];

  mcqUserAnswers     = signal<Map<number, number>>(new Map());
  mcqSubmitted       = signal(false);
  mcqRevealedAnswers = signal<Set<number>>(new Set());

  selectMcqAnswer(questionIndex: number, optionIndex: number): void {
    if (this.mcqSubmitted() || this.mcqRevealedAnswers().has(questionIndex)) return;
    this.mcqUserAnswers.update(map => {
      const next = new Map(map);
      next.set(questionIndex, optionIndex);
      return next;
    });
  }

  revealMcqAnswer(qi: number): void {
    this.mcqRevealedAnswers.update(s => new Set([...s, qi]));
  }

  submitMcqAnswers(): void {
    this.mcqSubmitted.set(true);
  }

  resetMcqAnswers(): void {
    this.mcqUserAnswers.set(new Map());
    this.mcqSubmitted.set(false);
    this.mcqRevealedAnswers.set(new Set());
  }

  mcqScore = computed(() => {
    const questions = this.questions();
    if (!questions?.length) return { correct: 0, total: 0 };
    const answers = this.mcqUserAnswers();
    const correct = questions.filter((q, i) => answers.get(i) === q.correctIndex).length;
    return { correct, total: questions.length };
  });
}
