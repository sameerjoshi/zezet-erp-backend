import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditEntity } from '../audit/audit-entity.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import { CreateRateCardDto } from './dto/create-rate-card.dto';
import { CreateRateDto } from './dto/create-rate.dto';
import { RateCardResponseDto } from './dto/rate-card-response.dto';
import { RateLookupQueryDto } from './dto/rate-lookup-query.dto';
import { RateLookupResponseDto } from './dto/rate-lookup-response.dto';
import { RateResponseDto } from './dto/rate-response.dto';
import { UpdateRateCardDto } from './dto/update-rate-card.dto';
import { UpdateRateDto } from './dto/update-rate.dto';
import { PricingService } from './pricing.service';

// Pricing: rate cards + rates under a client, plus the trip-prepopulation
// lookup. Managing prices needs `manage RateCard`/`manage Rate` (finance +
// admin only — ops roles never hold those). The lookup is the ops-facing path:
// it requires `read Trip` (ops + finance + admin) and relies on the global
// financial gate to strip money fields for ops callers.
@ApiTags('pricing')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  // --- Rate cards ---

  @Post('clients/:clientId/rate-cards')
  @RequireAbility(Action.Manage, 'RateCard')
  @AuditEntity('RateCard')
  @ApiOperation({ summary: 'Create a rate card under a client' })
  @ApiCreatedResponse({ type: RateCardResponseDto })
  createRateCard(
    @Param('clientId') clientId: string,
    @Body() dto: CreateRateCardDto,
  ): Promise<RateCardResponseDto> {
    return this.pricingService.createRateCard(clientId, dto);
  }

  @Get('clients/:clientId/rate-cards')
  @RequireAbility(Action.Read, 'RateCard')
  @ApiOperation({ summary: "List a client's rate cards" })
  @ApiOkResponse({ type: RateCardResponseDto, isArray: true })
  listRateCards(
    @Param('clientId') clientId: string,
  ): Promise<RateCardResponseDto[]> {
    return this.pricingService.listRateCards(clientId);
  }

  @Get('rate-cards/:cardId')
  @RequireAbility(Action.Read, 'RateCard')
  @ApiOperation({ summary: 'Get a rate card by id' })
  @ApiOkResponse({ type: RateCardResponseDto })
  getRateCard(@Param('cardId') cardId: string): Promise<RateCardResponseDto> {
    return this.pricingService.getRateCard(cardId);
  }

  @Patch('rate-cards/:cardId')
  @RequireAbility(Action.Manage, 'RateCard')
  @AuditEntity('RateCard')
  @ApiOperation({ summary: 'Update a rate card' })
  @ApiOkResponse({ type: RateCardResponseDto })
  updateRateCard(
    @Param('cardId') cardId: string,
    @Body() dto: UpdateRateCardDto,
  ): Promise<RateCardResponseDto> {
    return this.pricingService.updateRateCard(cardId, dto);
  }

  @Patch('rate-cards/:cardId/deactivate')
  @RequireAbility(Action.Manage, 'RateCard')
  @AuditEntity('RateCard')
  @ApiOperation({ summary: 'Soft-deactivate a rate card (status → disabled)' })
  @ApiOkResponse({ type: RateCardResponseDto })
  deactivateRateCard(
    @Param('cardId') cardId: string,
  ): Promise<RateCardResponseDto> {
    return this.pricingService.deactivateRateCard(cardId);
  }

  // --- Rates ---

  @Post('rate-cards/:cardId/rates')
  @RequireAbility(Action.Manage, 'Rate')
  @AuditEntity('Rate')
  @ApiOperation({ summary: 'Create a rate under a rate card' })
  @ApiCreatedResponse({ type: RateResponseDto })
  createRate(
    @Param('cardId') cardId: string,
    @Body() dto: CreateRateDto,
  ): Promise<RateResponseDto> {
    return this.pricingService.createRate(cardId, dto);
  }

  @Get('rate-cards/:cardId/rates')
  @RequireAbility(Action.Read, 'Rate')
  @ApiOperation({ summary: "List a rate card's rates" })
  @ApiOkResponse({ type: RateResponseDto, isArray: true })
  listRates(@Param('cardId') cardId: string): Promise<RateResponseDto[]> {
    return this.pricingService.listRates(cardId);
  }

  // Literal `lookup` is declared before the `:rateId` patch routes; GET has no
  // `:rateId` route so there is no path collision.
  @Get('rates/lookup')
  @RequireAbility(Action.Read, 'Trip')
  @ApiOperation({
    summary: 'Resolve the rate effective now for a client (trip prepopulation)',
    description:
      'Returns { found, rate }. Money fields are stripped for ops roles by ' +
      'the global financial gate; they still receive { found, rate } and type ' +
      'the figures manually.',
  })
  @ApiOkResponse({ type: RateLookupResponseDto })
  lookup(@Query() query: RateLookupQueryDto): Promise<RateLookupResponseDto> {
    return this.pricingService.lookup(query.clientId, query.label);
  }

  @Patch('rates/:rateId')
  @RequireAbility(Action.Manage, 'Rate')
  @AuditEntity('Rate')
  @ApiOperation({ summary: 'Update a rate' })
  @ApiOkResponse({ type: RateResponseDto })
  updateRate(
    @Param('rateId') rateId: string,
    @Body() dto: UpdateRateDto,
  ): Promise<RateResponseDto> {
    return this.pricingService.updateRate(rateId, dto);
  }

  @Patch('rates/:rateId/close')
  @RequireAbility(Action.Manage, 'Rate')
  @AuditEntity('Rate')
  @ApiOperation({
    summary: 'Close a rate (set effectiveTo = now; non-destructive delete)',
  })
  @ApiOkResponse({ type: RateResponseDto })
  closeRate(@Param('rateId') rateId: string): Promise<RateResponseDto> {
    return this.pricingService.closeRate(rateId);
  }
}
