import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth-validation/public.decorator';
import { Roles } from '../auth-validation/roles.decorator';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './create-class.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @Roles('admin')
  async create(@Body() createClassDto: CreateClassDto) {
    const createdClass = await this.classesService.create(createClassDto);
    return {
      message: 'Class added successfully',
      ...createdClass,
    };
  }

  @Get()
  @Public()
  findAll() {
    return this.classesService.findAll();
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.classesService.delete(id);
    return { message: `Class with ID ${id} has been deleted.` };
  }
}
