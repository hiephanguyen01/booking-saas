import type {
  CustomerFavoriteListResponse,
  FavoriteRefsResponse,
  FavoriteToggleResponse,
} from '@booking/contracts';
import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SessionPrincipal } from '../../../identity-access/domain/ports/session-store.port';
import { AuthenticatedOnly } from '../../../identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../identity-access/infrastructure/http/decorators/current-principal.decorator';
import { toCustomerFavoriteListResponse } from '../../application/favorite.mapper';
import { AddFavoriteUseCase } from '../../application/use-cases/add-favorite.use-case';
import { ListCustomerFavoritesUseCase } from '../../application/use-cases/list-customer-favorites.use-case';
import { ListFavoriteRefsUseCase } from '../../application/use-cases/list-favorite-refs.use-case';
import { RemoveFavoriteUseCase } from '../../application/use-cases/remove-favorite.use-case';
import {
  CustomerFavoriteListResponseDto,
  CustomerFavoritesQueryDto,
  FavoriteRefsResponseDto,
  FavoriteToggleResponseDto,
  ToggleFavoriteDto,
} from './dto/favorite.dto';

@ApiTags('customer-favorites')
@Controller('customer/favorites')
export class CustomerFavoriteController {
  constructor(
    private readonly addFavorite: AddFavoriteUseCase,
    private readonly removeFavorite: RemoveFavoriteUseCase,
    private readonly listFavorites: ListCustomerFavoritesUseCase,
    private readonly listRefs: ListFavoriteRefsUseCase,
  ) {}

  @AuthenticatedOnly()
  @Get()
  @ApiOperation({ summary: 'List the current user favorited listings and groups' })
  @ApiOkResponse({ type: CustomerFavoriteListResponseDto })
  async list(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Query() query: CustomerFavoritesQueryDto,
  ): Promise<CustomerFavoriteListResponse> {
    return toCustomerFavoriteListResponse(
      await this.listFavorites.execute(forwardedHost ?? host ?? '', principal.userId, query),
      query,
    );
  }

  @AuthenticatedOnly()
  @Get('refs')
  @ApiOperation({ summary: 'Favorited target ids — lights up hearts across pages' })
  @ApiOkResponse({ type: FavoriteRefsResponseDto })
  listReferences(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<FavoriteRefsResponse> {
    return this.listRefs.execute(forwardedHost ?? host ?? '', principal.userId);
  }

  @AuthenticatedOnly()
  @Post()
  @ApiOperation({ summary: 'Add or remove a favorite (idempotent, intent-driven)' })
  @ApiOkResponse({ type: FavoriteToggleResponseDto })
  toggle(
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('host') host: string | undefined,
    @CurrentPrincipal() principal: SessionPrincipal,
    @Body() input: ToggleFavoriteDto,
  ): Promise<FavoriteToggleResponse> {
    const resolvedHost = forwardedHost ?? host ?? '';
    const target = { target: input.target, targetId: input.targetId };
    return input.intent === 'add'
      ? this.addFavorite.execute(resolvedHost, principal.userId, target)
      : this.removeFavorite.execute(resolvedHost, principal.userId, target);
  }
}
