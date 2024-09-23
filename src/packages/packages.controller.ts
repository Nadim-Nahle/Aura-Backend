// src/packages/packages.controller.ts

import { Controller, Post, Body, Get } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './create-package.dto';
import { Package } from './package.entity';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  async create(@Body() createPackageDto: CreatePackageDto): Promise<Package> {
    return this.packagesService.createPackage(createPackageDto);
  }

  @Get()
  async getAllPackages(): Promise<Package[]> {
    return this.packagesService.getAllPackages();
  }
}
