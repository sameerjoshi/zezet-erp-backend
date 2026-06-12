import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import { FinancialFieldsInterceptor } from './financial-fields.interceptor';
import { PoliciesGuard } from './policies.guard';

// RBAC primitives, app-wide. Global so any feature module can declare
// @UseGuards(JwtAuthGuard, PoliciesGuard) and @CheckPolicies()/@RequireAbility()
// without re-importing. Also installs the global field-level financial gate.
@Global()
@Module({
  providers: [
    CaslAbilityFactory,
    PoliciesGuard,
    { provide: APP_INTERCEPTOR, useClass: FinancialFieldsInterceptor },
  ],
  exports: [CaslAbilityFactory, PoliciesGuard],
})
export class RbacModule {}
