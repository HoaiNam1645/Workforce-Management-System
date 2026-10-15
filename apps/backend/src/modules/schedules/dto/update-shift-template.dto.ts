import { PartialType } from '@nestjs/mapped-types';
import { CreateShiftTemplateDto } from './create-shift-template.dto';

export class UpdateShiftTemplateDto extends PartialType(CreateShiftTemplateDto) {}
