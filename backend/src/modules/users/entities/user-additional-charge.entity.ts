import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Designation } from '../../designations/entities/designation.entity';
import { Wing } from '../../wings/entities/wing.entity';
import { User } from './user.entity';

/**
 * Extra charge an officer holds besides the designation. It never affects meeting priority.
 * v1.16 (SPEC.md §6.2): structured — a designation (required), an optional wing and an optional
 * note ("বিকল্প", "চলতি দায়িত্ব"). Its designation counts for the office report scope (§6.10).
 * Rows migrated from the old free text that could not be matched safely keep `needsReview = true`
 * and no designation until an admin fixes them; their old text is the note.
 */
@Entity('user_additional_charges')
@Check(
  'CHK_user_additional_charges_designation',
  `"needsReview" OR "designationId" IS NOT NULL`,
)
export class UserAdditionalCharge extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.additionalCharges, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column({ type: 'uuid', nullable: true })
  designationId!: string | null;

  @ManyToOne(() => Designation, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'designationId',
    foreignKeyConstraintName: 'FK_user_additional_charges_designation',
  })
  designation!: Relation<Designation> | null;

  @Column({ type: 'uuid', nullable: true })
  wingId!: string | null;

  @ManyToOne(() => Wing, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'wingId',
    foreignKeyConstraintName: 'FK_user_additional_charges_wing',
  })
  wing!: Relation<Wing> | null;

  /** Free text ("বিকল্প"); for migrated rows the original charge text. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  /** Migrated row that an admin still has to check (no safe designation match). */
  @Column({ type: 'boolean', default: false })
  needsReview!: boolean;
}
