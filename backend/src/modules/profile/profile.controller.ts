import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UploadErrorsInterceptor } from '../../common/interceptors/upload-errors.interceptor';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { MessageResponseDto } from '../auth/dto/auth-responses.dto';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import {
  ChangeRequestResponseDto,
  CreateChangeRequestDto,
} from '../change-requests/dto/change-request.dto';
import {
  ChangeNotificationEmailDto,
  PhotoUploadDto,
  ProfileResponseDto,
  UpdateProfileDto,
  VerifyNotificationEmailQueryDto,
} from './dto/profile.dto';
import { PROFILE_THROTTLE } from './profile.constants';
import { PROFILE_MESSAGES } from './profile.messages';
import { ProfileService } from './profile.service';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My full profile (designation, wing, additional charges)',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  get(@CurrentUser() user: AuthUser): Promise<ProfileResponseDto> {
    return this.profile.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({
    summary:
      'Edit my names, phones, wing, designation remark, additional charges',
    description:
      'Only these fields are accepted; loginEmail, designationId, role, isActive or anything else → 400. ' +
      'Mobile numbers may be typed with Bangla or English digits and +880; they are stored as 01XXXXXXXXX.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiBadRequestResponse({
    description: 'Forbidden field, invalid value or inactive wing',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: AppRequest,
  ): Promise<ProfileResponseDto> {
    return this.profile.update(user, dto, req.ip ?? null);
  }

  @Throttle(PROFILE_THROTTLE.photo)
  @Post('photo')
  @UseInterceptors(UploadErrorsInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: PhotoUploadDto })
  @ApiOperation({
    summary: 'Upload my photo (JPEG/PNG/WebP)',
    description:
      'Real type checked by magic bytes; re-encoded to a 512×512 WebP (EXIF/GPS removed). ' +
      'Served at /uploads/<photoPath>. The previous photo is deleted.',
  })
  @ApiCreatedResponse({ type: ProfileResponseDto })
  @ApiBadRequestResponse({
    description: 'No file, not a real JPEG/PNG/WebP, or unreadable',
  })
  @ApiPayloadTooLargeResponse({ description: 'Larger than MAX_UPLOAD_MB' })
  @ApiTooManyRequestsResponse({ description: 'Too many uploads' })
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AppRequest,
  ): Promise<ProfileResponseDto> {
    return this.profile.uploadPhoto(user, file, req.ip ?? null);
  }

  @Delete('photo')
  @ApiOperation({ summary: 'Remove my photo' })
  @ApiOkResponse({ type: MessageResponseDto })
  async deletePhoto(
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<MessageResponseDto> {
    await this.profile.deletePhoto(user, req.ip ?? null);
    return { message: PROFILE_MESSAGES.photoRemoved };
  }

  @Throttle(PROFILE_THROTTLE.notificationEmail)
  @Post('notification-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a new notification email',
    description:
      'Sends a verification link (valid 24 h) to the NEW address and a notice to the current one. ' +
      'Until verified, mail keeps going to the current address. Login email is never changed.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid email or the same as now' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  async requestNotificationEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeNotificationEmailDto,
    @Req() req: AppRequest,
  ): Promise<MessageResponseDto> {
    await this.profile.requestNotificationEmailChange(
      user,
      dto,
      req.ip ?? null,
    );
    return { message: PROFILE_MESSAGES.notificationEmailRequested };
  }

  @Public()
  @Get('notification-email/verify')
  @ApiOperation({
    summary: 'Confirm the new notification email (link from the mail, public)',
    description: 'Works once; expires 24 h after the request. No login needed.',
    security: [], // public route inside a Bearer-protected controller
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid, used or expired token' })
  async verifyNotificationEmail(
    @Query() query: VerifyNotificationEmailQueryDto,
    @Req() req: AppRequest,
  ): Promise<MessageResponseDto> {
    await this.profile.verifyNotificationEmail(query.token, req.ip ?? null);
    return { message: PROFILE_MESSAGES.notificationEmailVerified };
  }

  @Throttle(PROFILE_THROTTLE.changeRequest)
  @Post('change-requests')
  @ApiOperation({
    summary:
      'Request a login-email or designation change (needs admin approval)',
    description:
      'LOGIN_EMAIL: send `loginEmail` (valid, not used by anyone). DESIGNATION: send `designationId` ' +
      '(active, different from yours). Only one PENDING request per type.',
  })
  @ApiCreatedResponse({ type: ChangeRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid value / same as now / inactive designation',
  })
  @ApiConflictResponse({
    description: 'Email already used, or a request of this type is pending',
  })
  createChangeRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateChangeRequestDto,
    @Req() req: AppRequest,
  ): Promise<ChangeRequestResponseDto> {
    return this.changeRequests.create(user, dto, req.ip ?? null);
  }

  @Get('change-requests')
  @ApiOperation({ summary: 'My change requests (newest first)' })
  @ApiOkResponse({ type: [ChangeRequestResponseDto] })
  myChangeRequests(
    @CurrentUser() user: AuthUser,
  ): Promise<ChangeRequestResponseDto[]> {
    return this.changeRequests.listMine(user.id);
  }

  @Delete('change-requests/:id')
  @ApiOperation({ summary: 'Cancel my own PENDING change request' })
  @ApiOkResponse({ type: ChangeRequestResponseDto })
  @ApiNotFoundResponse({ description: 'No such request of mine' })
  @ApiConflictResponse({ description: 'Already decided or cancelled' })
  cancelChangeRequest(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<ChangeRequestResponseDto> {
    return this.changeRequests.cancel(user, id, req.ip ?? null);
  }
}
