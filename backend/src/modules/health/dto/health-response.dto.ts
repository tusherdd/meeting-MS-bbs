import { ApiProperty } from '@nestjs/swagger';

export class DatabaseHealthDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  status!: 'up' | 'down';

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3,
    description: 'Round-trip time of SELECT 1 in milliseconds (null when down)',
  })
  latencyMs!: number | null;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'], example: 'ok' })
  status!: 'ok' | 'error';

  @ApiProperty({ example: '2026-11-08T09:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 120, description: 'Process uptime in seconds' })
  uptimeSeconds!: number;

  @ApiProperty({ type: DatabaseHealthDto })
  database!: DatabaseHealthDto;
}
