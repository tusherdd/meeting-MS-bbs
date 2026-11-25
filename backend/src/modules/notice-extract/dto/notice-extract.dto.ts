import { ApiProperty } from '@nestjs/swagger';

/** Multipart body of POST /meetings/notice-extract (Swagger only; the file comes through multer). */
export class NoticeExtractUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'The notice: PDF, DOCX (no macros), JPEG or PNG, max 10 MB (same rules as the notice upload).',
  })
  file!: unknown;
}

export class ExtractNamedRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'পরিচালক' })
  nameBn!: string;

  @ApiProperty({ example: 'Director' })
  nameEn!: string;
}

export class ExtractedFieldsDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'অর্থনৈতিক শুমারি ২০২৩ শীর্ষক প্রকল্পের ICT Support Team এর সভা',
  })
  title!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-11-10',
    description: 'Asia/Dhaka calendar date (YYYY-MM-DD)',
  })
  date!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '12:00',
    description: 'HH:mm, 24 h, Asia/Dhaka',
  })
  startTime!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '12:45',
    description: 'startTime + 45 minutes (the form default)',
  })
  endTime!: string | null;

  @ApiProperty({ type: String, nullable: true })
  venue!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The agenda; each "ক) খ)" item on its own line',
  })
  agenda!: string | null;
}

export class MatchedOfficerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nameBn!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty({ type: ExtractNamedRefDto, nullable: true })
  designation!: ExtractNamedRefDto | null;

  @ApiProperty({ type: ExtractNamedRefDto, nullable: true })
  wing!: ExtractNamedRefDto | null;
}

export class MatchCandidateDto {
  @ApiProperty({ type: MatchedOfficerDto })
  officer!: MatchedOfficerDto;

  @ApiProperty({
    example: 0.94,
    description: 'Name similarity 0..1 plus designation / wing boosts',
  })
  score!: number;

  @ApiProperty({
    description:
      'A designation of the officer (incl. additional charges) is in the line',
  })
  designationMatch!: boolean;

  @ApiProperty({ description: 'The officer’s wing is in the line' })
  wingMatch!: boolean;
}

/** The parsed parts of a line (for showing it and for "add as guest"). */
export class ParsedLineDto {
  @ApiProperty({
    example: 3,
    description: '1-based position in the distribution list',
  })
  line!: number;

  @ApiProperty({ description: 'The cleaned line' })
  text!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  designation!: string | null;

  @ApiProperty({ type: String, nullable: true })
  wing!: string | null;
}

export class SureParticipantDto extends ParsedLineDto {
  @ApiProperty({ type: MatchCandidateDto })
  match!: MatchCandidateDto;
}

export class MaybeParticipantDto extends ParsedLineDto {
  @ApiProperty({
    type: [MatchCandidateDto],
    description: 'Up to 3, best first',
  })
  candidates!: MatchCandidateDto[];
}

export const UNMATCHED_REASONS = ['group', 'not-found', 'ambiguous'] as const;

export class UnmatchedParticipantDto extends ParsedLineDto {
  @ApiProperty({
    enum: UNMATCHED_REASONS,
    description:
      'group = "কর্মকর্তা (সকল)" etc.; not-found = no officer fits; ambiguous = a line without a name fits several officers',
  })
  reason!: (typeof UNMATCHED_REASONS)[number];
}

export class ExtractedParticipantsDto {
  @ApiProperty({ type: [SureParticipantDto] })
  sure!: SureParticipantDto[];

  @ApiProperty({ type: [MaybeParticipantDto] })
  maybe!: MaybeParticipantDto[];

  @ApiProperty({ type: [UnmatchedParticipantDto] })
  unmatched!: UnmatchedParticipantDto[];
}

export class ExtractedChairDto {
  @ApiProperty({ enum: ['sure', 'maybe', 'unmatched'] })
  status!: 'sure' | 'maybe' | 'unmatched';

  @ApiProperty({ description: 'The raw "সভাপতি" text (name + designation)' })
  text!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  designation!: string | null;

  @ApiProperty({
    type: MatchCandidateDto,
    nullable: true,
    description: 'Set when status = sure',
  })
  match!: MatchCandidateDto | null;

  @ApiProperty({
    type: [MatchCandidateDto],
    description: 'Set when status = maybe (up to 3)',
  })
  candidates!: MatchCandidateDto[];

  @ApiProperty({
    enum: UNMATCHED_REASONS,
    nullable: true,
    description:
      'Set when status = unmatched (then it may become a guest chair)',
  })
  reason!: (typeof UNMATCHED_REASONS)[number] | null;
}

export class ExtractWarningDto {
  @ApiProperty({ example: 'DATE_NOT_FOUND' })
  code!: string;

  @ApiProperty({ example: 'নোটিশে সভার তারিখ পাওয়া যায়নি।' })
  message!: string;
}

export class NoticeExtractResponseDto {
  @ApiProperty({
    enum: ['OCR', 'AI'],
    description: 'OCR = local text layer / OCR + parser (v1.21 part 1)',
  })
  method!: 'OCR' | 'AI';

  @ApiProperty({ type: ExtractedFieldsDto })
  fields!: ExtractedFieldsDto;

  @ApiProperty({
    type: ExtractedChairDto,
    nullable: true,
    description: 'null when the notice has no "সভাপতি" line',
  })
  chair!: ExtractedChairDto | null;

  @ApiProperty({ type: ExtractedParticipantsDto })
  participants!: ExtractedParticipantsDto;

  @ApiProperty({ type: [ExtractWarningDto] })
  warnings!: ExtractWarningDto[];
}
