import { Injectable, NotFoundException } from '@nestjs/common';
import { Rate, RateCard, UserStatus } from '@prisma/client';
import { decimalToString } from '../common/decimal.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRateCardDto } from './dto/create-rate-card.dto';
import { CreateRateDto } from './dto/create-rate.dto';
import { RateCardResponseDto } from './dto/rate-card-response.dto';
import { RateLookupResponseDto } from './dto/rate-lookup-response.dto';
import { RateResponseDto } from './dto/rate-response.dto';
import { UpdateRateCardDto } from './dto/update-rate-card.dto';
import { UpdateRateDto } from './dto/update-rate.dto';
import { selectEffectiveRate } from './rate-selection';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Rate cards ---

  async createRateCard(
    clientId: string,
    dto: CreateRateCardDto,
  ): Promise<RateCardResponseDto> {
    await this.ensureClientExists(clientId);
    const card = await this.prisma.rateCard.create({
      data: {
        clientId,
        name: dto.name,
        status: dto.status ?? UserStatus.active,
      },
    });
    return this.toRateCardDto(card);
  }

  async listRateCards(clientId: string): Promise<RateCardResponseDto[]> {
    await this.ensureClientExists(clientId);
    const cards = await this.prisma.rateCard.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map((c) => this.toRateCardDto(c));
  }

  async getRateCard(cardId: string): Promise<RateCardResponseDto> {
    const card = await this.findRateCard(cardId);
    return this.toRateCardDto(card);
  }

  async updateRateCard(
    cardId: string,
    dto: UpdateRateCardDto,
  ): Promise<RateCardResponseDto> {
    await this.findRateCard(cardId);
    const card = await this.prisma.rateCard.update({
      where: { id: cardId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.toRateCardDto(card);
  }

  // Soft-delete a rate card: flip status to disabled (rates stay for history).
  async deactivateRateCard(cardId: string): Promise<RateCardResponseDto> {
    await this.findRateCard(cardId);
    const card = await this.prisma.rateCard.update({
      where: { id: cardId },
      data: { status: UserStatus.disabled },
    });
    return this.toRateCardDto(card);
  }

  // --- Rates ---

  async createRate(
    cardId: string,
    dto: CreateRateDto,
  ): Promise<RateResponseDto> {
    await this.findRateCard(cardId);
    const rate = await this.prisma.rate.create({
      data: {
        rateCardId: cardId,
        label: dto.label,
        clientPrice: dto.clientPrice,
        driverPay: dto.driverPay,
        helperPay: dto.helperPay,
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: new Date(dto.effectiveFrom) }
          : {}),
        ...(dto.effectiveTo !== undefined
          ? { effectiveTo: new Date(dto.effectiveTo) }
          : {}),
      },
    });
    return this.toRateDto(rate);
  }

  async listRates(cardId: string): Promise<RateResponseDto[]> {
    await this.findRateCard(cardId);
    const rates = await this.prisma.rate.findMany({
      where: { rateCardId: cardId },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rates.map((r) => this.toRateDto(r));
  }

  async updateRate(
    rateId: string,
    dto: UpdateRateDto,
  ): Promise<RateResponseDto> {
    await this.findRate(rateId);
    const rate = await this.prisma.rate.update({
      where: { id: rateId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.clientPrice !== undefined
          ? { clientPrice: dto.clientPrice }
          : {}),
        ...(dto.driverPay !== undefined ? { driverPay: dto.driverPay } : {}),
        ...(dto.helperPay !== undefined ? { helperPay: dto.helperPay } : {}),
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: new Date(dto.effectiveFrom) }
          : {}),
        ...(dto.effectiveTo !== undefined
          ? { effectiveTo: new Date(dto.effectiveTo) }
          : {}),
      },
    });
    return this.toRateDto(rate);
  }

  // Soft-end a rate: close its window at `now` (Rate has no status column, so
  // ending the effective period is the non-destructive "delete").
  async closeRate(rateId: string): Promise<RateResponseDto> {
    await this.findRate(rateId);
    const rate = await this.prisma.rate.update({
      where: { id: rateId },
      data: { effectiveTo: new Date() },
    });
    return this.toRateDto(rate);
  }

  // --- Lookup (trip prepopulation) ---

  // Resolve the rate effective *now* for a client, optionally narrowed to a
  // route/service label. Only rates on ACTIVE rate cards are considered.
  async lookup(
    clientId: string,
    label?: string,
  ): Promise<RateLookupResponseDto> {
    const selected = await this.findEffectiveRate(clientId, label);
    return {
      found: selected !== null,
      rate: selected ? this.toRateDto(selected) : null,
    };
  }

  // Shared effective-rate resolution returning the Rate ENTITY (not a DTO), so
  // callers that need the raw money columns — e.g. Operations prepopulating a
  // trip — reuse the exact selection logic the lookup endpoint uses.
  async findEffectiveRate(
    clientId: string,
    label?: string,
  ): Promise<Rate | null> {
    const rates = await this.prisma.rate.findMany({
      where: {
        rateCard: { clientId, status: UserStatus.active },
        ...(label !== undefined ? { label } : {}),
      },
    });
    return selectEffectiveRate(rates, new Date());
  }

  // --- helpers ---

  private async ensureClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
  }

  private async findRateCard(cardId: string): Promise<RateCard> {
    const card = await this.prisma.rateCard.findUnique({
      where: { id: cardId },
    });
    if (!card) {
      throw new NotFoundException('Rate card not found');
    }
    return card;
  }

  private async findRate(rateId: string): Promise<Rate> {
    const rate = await this.prisma.rate.findUnique({ where: { id: rateId } });
    if (!rate) {
      throw new NotFoundException('Rate not found');
    }
    return rate;
  }

  private toRateCardDto(card: RateCard): RateCardResponseDto {
    return {
      id: card.id,
      clientId: card.clientId,
      name: card.name,
      status: card.status,
      createdAt: card.createdAt,
    };
  }

  private toRateDto(rate: Rate): RateResponseDto {
    return {
      id: rate.id,
      rateCardId: rate.rateCardId,
      label: rate.label,
      clientPrice: decimalToString(rate.clientPrice) ?? '0.00',
      driverPay: decimalToString(rate.driverPay) ?? '0.00',
      helperPay: decimalToString(rate.helperPay) ?? '0.00',
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
    };
  }
}
