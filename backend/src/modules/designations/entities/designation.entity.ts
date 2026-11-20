import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OfficeReportScope } from '../enums/office-report-scope.enum';

/**
 * Official post of an officer. `priority` decides meeting priority (lower number = higher);
 * it lives here, never in code, so admins can change it (SPEC.md §6.1).
 */
@Entity('designations')
// Case-insensitive unique nameEn: expression index created by migration
// UniqueDesignationWingNames; `synchronize: false` keeps migration:generate from touching it.
@Index('UQ_designations_nameEn_lower', { synchronize: false })
export class Designation extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  nameBn!: string;

  @Column({ type: 'varchar', length: 150 })
  nameEn!: string;

  @Column({ type: 'int' })
  priority!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** v1.15: office report access of officers with this designation (SPEC.md §6.10). */
  @Column({
    type: 'enum',
    enum: OfficeReportScope,
    enumName: 'office_report_scope_enum',
    default: OfficeReportScope.NONE,
  })
  officeReportScope!: OfficeReportScope;
}
