import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../auth-validation/roles.decorator';
import { CreateExpenseDto } from './create-expense.dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@Roles('admin')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  findAll() {
    return this.expensesService.findAll();
  }

  @Post()
  create(@Body() createDto: CreateExpenseDto) {
    return this.expensesService.create(createDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.expensesService.delete(id);
    return { message: 'Expense deleted successfully' };
  }
}
