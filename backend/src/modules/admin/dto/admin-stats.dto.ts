import { ApiProperty } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({ example: 137 }) total!: number;
  @ApiProperty({ example: 135 }) active!: number;
  @ApiProperty({ example: 2 }) inactive!: number;
  @ApiProperty({ example: 3, description: 'ADMIN + SUPER_ADMIN' })
  admins!: number;
}

export class MeetingStatsDto {
  @ApiProperty({
    example: 8,
    description: 'Not cancelled, starting today (Asia/Dhaka)',
  })
  today!: number;
  @ApiProperty({
    example: 41,
    description: 'Not cancelled, starting this Sunday–Saturday week',
  })
  thisWeek!: number;
}

export class AdminStatsDto {
  @ApiProperty({ type: UserStatsDto }) users!: UserStatsDto;
  @ApiProperty({ type: MeetingStatsDto }) meetings!: MeetingStatsDto;
  @ApiProperty({ example: 2 }) pendingConflicts!: number;
  @ApiProperty({ example: 1 }) pendingChangeRequests!: number;
  @ApiProperty({ example: 0 }) failedMails!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: Date;
}
