import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * App-wide settings as a small key-value table (v1.21 part 2, SPEC.md §6.13). One row per key;
 * a missing row means the default of that key (settings.types.ts). Values are short strings,
 * never secrets (API keys stay in .env).
 */
@Entity('app_settings')
export class AppSetting extends BaseEntity {
  @Index('UQ_app_settings_key', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'varchar', length: 500 })
  value!: string;

  /** The admin who last changed it (null when the user was removed). */
  @Column({ type: 'uuid', nullable: true })
  updatedById!: string | null;
}
