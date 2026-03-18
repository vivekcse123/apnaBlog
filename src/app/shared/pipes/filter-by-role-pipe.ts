import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filterByRole'
})
export class FilterByRolePipe implements PipeTransform {

  transform(value: any[], role: string): any[] {

    if (!value) {
      return [];
    }

    if (!role) {
      return value;
    }

    role = role.toLowerCase();

    return value.filter(user =>
      user.role?.toLowerCase().includes(role)
    );
  }

}