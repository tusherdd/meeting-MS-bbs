import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Organisational unit (wing / section) an officer belongs to. */
@Entity('wings')
// Case-insensitive unique nameEn: expression index created by migration
// UniqueDesignationWingNames; `synchronize: false` keeps migration:generate from touching it.
@Index('UQ_wings_nameEn_lower', { synchronize: false })
export class Wing extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  nameBn!: string;

  @Column({ type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
