import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'filterByStatus', standalone: true })
export class FilterByStatusPipe implements PipeTransform {
  transform(users: any[], status: string): any[] {
    if (!status) return users;
    return users.filter(u => u.status?.toLowerCase() === status.toLowerCase());
  }
}