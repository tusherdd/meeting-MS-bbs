import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Organisational unit (wing / section) an officer belongs to. */
@Entity('wings')
export class Wing extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  nameBn!: string;

  @Column({ type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
