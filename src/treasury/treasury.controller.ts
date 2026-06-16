import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { Action } from '../rbac/casl-ability.factory';
import { RequireAbility } from '../rbac/policies.decorator';
import { PoliciesGuard } from '../rbac/policies.guard';
import {
  AccountResponseDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { CashPositionResponseDto } from './dto/cash-position-response.dto';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  TransactionResponseDto,
} from './dto/transaction.dto';
import { TreasuryService } from './treasury.service';

// Treasury — accounts + cash ledger. Financial subject: admin/finance manage,
// investor reads; ops roles are 403'd.
@ApiTags('treasury')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get('accounts')
  @RequireAbility(Action.Read, 'Treasury')
  @ApiOperation({ summary: 'List accounts with live balances' })
  @ApiOkResponse({ type: AccountResponseDto, isArray: true })
  listAccounts(): Promise<AccountResponseDto[]> {
    return this.treasury.listAccounts();
  }

  @Post('accounts')
  @RequireAbility(Action.Create, 'Treasury')
  @ApiOperation({ summary: 'Create an account' })
  @ApiOkResponse({ type: AccountResponseDto })
  createAccount(@Body() dto: CreateAccountDto): Promise<AccountResponseDto> {
    return this.treasury.createAccount(dto);
  }

  @Patch('accounts/:id')
  @RequireAbility(Action.Update, 'Treasury')
  @ApiOperation({
    summary: 'Update an account (rename, opening balance, status)',
  })
  @ApiOkResponse({ type: AccountResponseDto })
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.treasury.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @RequireAbility(Action.Delete, 'Treasury')
  @ApiOperation({ summary: 'Delete an empty account' })
  removeAccount(@Param('id') id: string): Promise<void> {
    return this.treasury.removeAccount(id);
  }

  @Get('cash-position')
  @RequireAbility(Action.Read, 'Treasury')
  @ApiOperation({ summary: 'Balance per account + grand total' })
  @ApiOkResponse({ type: CashPositionResponseDto })
  cashPosition(): Promise<CashPositionResponseDto> {
    return this.treasury.cashPosition();
  }

  @Get('transactions')
  @RequireAbility(Action.Read, 'Treasury')
  @ApiOperation({
    summary: 'List ledger transactions (filter account/category/range)',
  })
  @ApiOkResponse({ type: TransactionResponseDto, isArray: true })
  listTransactions(
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionResponseDto[]> {
    return this.treasury.listTransactions(query);
  }

  @Post('transactions')
  @RequireAbility(Action.Create, 'Treasury')
  @ApiOperation({ summary: 'Record a ledger transaction' })
  @ApiOkResponse({ type: TransactionResponseDto })
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @Req() req: Request & { user: AuthUser },
  ): Promise<TransactionResponseDto> {
    return this.treasury.createTransaction(dto, req.user);
  }

  @Delete('transactions/:id')
  @HttpCode(204)
  @RequireAbility(Action.Delete, 'Treasury')
  @ApiOperation({ summary: 'Delete a ledger transaction' })
  removeTransaction(@Param('id') id: string): Promise<void> {
    return this.treasury.removeTransaction(id);
  }
}
