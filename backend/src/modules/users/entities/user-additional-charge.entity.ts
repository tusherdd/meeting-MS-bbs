import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from './user.entity';

/**
 * Extra charge an officer holds besides the designation (e.g. "Focal Point Officer").
 * Not a designation: it never affects priority.
 */
@Entity('user_additional_charges')
export class UserAdditionalCharge extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.additionalCharges, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 300 })
  description!: string;
}
