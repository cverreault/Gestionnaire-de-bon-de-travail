import { PartialType } from '@nestjs/swagger';
import { CreateAlertRuleDto } from './create-alert.dto';

export class UpdateAlertRuleDto extends PartialType(CreateAlertRuleDto) {}
